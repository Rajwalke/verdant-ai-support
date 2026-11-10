import { query } from './db.js';
import { config } from './config.js';
import { generateReply } from './llm.js';
import { log } from './log.js';

const MAX_ATTEMPTS = 3;
const inFlight = new Set();

// Generates the AI draft for one draft row. Never throws: failures are stored on the row
// so the agent sees "draft failed" instead of silence, and the sweeper can retry.
export async function generateDraft(draftId) {
  if (inFlight.has(draftId)) return;
  inFlight.add(draftId);
  try {
    const { rows } = await query(
      `UPDATE drafts SET attempts = attempts + 1, updated_at = now()
        WHERE id = $1 AND status IN ('pending', 'failed')
        RETURNING conversation_id`,
      [draftId]
    );
    if (!rows[0]) return; // already used / superseded / ready
    const conversationId = rows[0].conversation_id;

    const [{ rows: cust }, { rows: history }] = await Promise.all([
      query(
        `SELECT cu.name FROM conversations c JOIN customers cu ON cu.id = c.customer_id WHERE c.id = $1`,
        [conversationId]
      ),
      query(
        `SELECT sender, body FROM (
           SELECT sender, body, created_at FROM messages
            WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 12
         ) t ORDER BY created_at ASC`,
        [conversationId]
      ),
    ]);

    try {
      const out = await generateReply({ customerName: cust[0]?.name || 'there', history });
      await query(
        `UPDATE drafts SET body = $2, needs_human = $3, reason = $4, error = NULL,
                status = 'ready', model = $5, updated_at = now()
          WHERE id = $1 AND status IN ('pending', 'failed')`,
        [draftId, out.reply, out.needsHuman, out.reason || null, config.llm.model]
      );
      log.info('draft ready', { draftId, needsHuman: out.needsHuman });
    } catch (err) {
      await query(
        `UPDATE drafts SET status = 'failed', error = $2, updated_at = now()
          WHERE id = $1 AND status IN ('pending', 'failed')`,
        [draftId, String(err.message).slice(0, 500)]
      );
      log.error('draft failed', { draftId, error: err.message });
    }
  } catch (err) {
    log.error('draft generation crashed', { draftId, error: err.message });
  } finally {
    inFlight.delete(draftId);
  }
}

export const scheduleDraft = (draftId) => {
  setImmediate(() => generateDraft(draftId));
};

// Safety net: picks up drafts that were interrupted (server restart at 2 a.m.) or failed
// transiently. Runs on boot and every minute.
async function sweep() {
  try {
    const { rows } = await query(
      `SELECT id FROM drafts
        WHERE attempts < $1
          AND updated_at < now() - interval '60 seconds'
          AND status IN ('pending', 'failed')
        ORDER BY created_at LIMIT 20`,
      [MAX_ATTEMPTS]
    );
    for (const r of rows) await generateDraft(r.id);
  } catch (err) {
    log.error('draft sweep failed', { error: err.message });
  }
}

export function startDraftSweeper() {
  setTimeout(sweep, 3000).unref();
  setInterval(sweep, 60_000).unref();
}

// Agent clicked "Regenerate": reset attempts and run now.
export async function retryDraft(draftId) {
  const { rowCount } = await query(
    `UPDATE drafts SET attempts = 0, status = 'pending', error = NULL, updated_at = now()
      WHERE id = $1 AND status IN ('pending', 'ready', 'failed')`,
    [draftId]
  );
  if (rowCount) scheduleDraft(draftId);
  return rowCount > 0;
}
