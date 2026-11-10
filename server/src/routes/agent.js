import express from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { clearSession, login, requireAgent, setSession } from '../auth.js';
import { query, withTransaction } from '../db.js';
import { retryDraft } from '../drafts.js';

const router = express.Router();
const uuid = z.string().uuid();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in a few minutes.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const parsed = z
    .object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: 'Enter a valid email and password' });
  const agent = await login(parsed.data.email, parsed.data.password);
  if (!agent) return res.status(401).json({ error: 'Wrong email or password' });
  setSession(res, agent);
  res.json({ agent });
});

router.post('/logout', (req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

router.get('/me', requireAgent, (req, res) => res.json({ agent: req.agent }));

// Everything below needs a signed-in agent.
router.use(requireAgent);

router.get('/conversations', async (req, res) => {
  const { rows } = await query(
    `SELECT c.id, c.last_message_at, cu.name, cu.phone,
            lm.body AS last_body, lm.sender AS last_sender,
            EXISTS (SELECT 1 FROM drafts d WHERE d.conversation_id = c.id
                     AND d.status IN ('pending', 'ready', 'failed')) AS awaiting_reply
       FROM conversations c
       JOIN customers cu ON cu.id = c.customer_id
       JOIN LATERAL (
         SELECT body, sender FROM messages WHERE conversation_id = c.id
          ORDER BY created_at DESC, id DESC LIMIT 1
       ) lm ON true
      WHERE c.status = 'open'
      ORDER BY c.last_message_at DESC
      LIMIT 200`
  );
  res.json({ conversations: rows });
});

router.get('/conversations/:id', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
  const { rows: conv } = await query(
    `SELECT c.id, cu.name, cu.phone FROM conversations c
       JOIN customers cu ON cu.id = c.customer_id WHERE c.id = $1`,
    [req.params.id]
  );
  if (!conv[0]) return res.status(404).json({ error: 'Not found' });
  const [{ rows: messages }, { rows: drafts }] = await Promise.all([
    query(
      `SELECT id, sender, body, created_at FROM messages
        WHERE conversation_id = $1 ORDER BY created_at ASC, id`,
      [req.params.id]
    ),
    // The draft the agent should act on: the newest one that has not been used.
    query(
      `SELECT id, message_id, body, status, needs_human, reason, error
         FROM drafts WHERE conversation_id = $1 AND status IN ('pending', 'ready', 'failed')
        ORDER BY created_at DESC LIMIT 1`,
      [req.params.id]
    ),
  ]);
  res.json({ conversation: conv[0], messages, draft: drafts[0] ?? null });
});

router.post('/drafts/:id/approve', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
  const parsed = z.object({ text: z.string().trim().min(1, 'Reply is empty').max(2000) }).safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });

  const result = await withTransaction(async (db) => {
    // Lock the draft so a double-click or two agents cannot send two replies.
    const { rows } = await db.query(
      `SELECT id, conversation_id, message_id, status FROM drafts WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    const draft = rows[0];
    if (!draft) return { code: 404, error: 'Draft not found' };
    if (draft.status === 'used' || draft.status === 'superseded') {
      return { code: 409, error: 'This draft was already handled. Refresh the conversation.' };
    }
    const { rows: msg } = await db.query(
      `INSERT INTO messages (conversation_id, sender, body, agent_id)
       VALUES ($1, 'agent', $2, $3) RETURNING id, sender, body, created_at`,
      [draft.conversation_id, parsed.data.text, req.agent.id]
    );
    await db.query(
      `UPDATE drafts SET status = 'used', used_message_id = $2, updated_at = now() WHERE id = $1`,
      [draft.id, msg[0].id]
    );
    // Older unanswered drafts in this conversation are now moot.
    await db.query(
      `UPDATE drafts d SET status = 'superseded', updated_at = now()
         FROM messages m
        WHERE d.message_id = m.id AND d.conversation_id = $1 AND d.id <> $2
          AND d.status IN ('pending', 'ready', 'failed')
          AND m.created_at <= (SELECT created_at FROM messages WHERE id = $3)`,
      [draft.conversation_id, draft.id, draft.message_id]
    );
    await db.query(`UPDATE conversations SET last_message_at = now() WHERE id = $1`, [draft.conversation_id]);
    return { code: 200, message: msg[0] };
  });

  if (result.code !== 200) return res.status(result.code).json({ error: result.error });
  res.json({ message: result.message });
});

router.post('/drafts/:id/regenerate', async (req, res) => {
  if (!uuid.safeParse(req.params.id).success) return res.status(404).json({ error: 'Not found' });
  const ok = await retryDraft(req.params.id);
  if (!ok) return res.status(409).json({ error: 'This draft can no longer be regenerated' });
  res.json({ ok: true });
});

export default router;
