import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { ingestCustomerMessage } from '../ingest.js';
import { log } from '../log.js';

const payloadSchema = z.object({
  event_id: z.string().min(1).max(128),
  type: z.string(),
  brand_id: z.string(),
  timestamp: z.string().optional(),
  customer: z.object({
    id: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(5).max(20),
  }),
  message: z.object({
    id: z.string().min(1).max(128),
    type: z.string(),
    text: z.string().trim().min(1).max(2000).optional(),
  }),
});

export function validSignature(rawBody, header) {
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', config.webhookSecret).update(rawBody).digest();
  let given;
  try {
    given = Buffer.from(header.slice(7), 'hex');
  } catch {
    return false;
  }
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

// Needs the RAW body (the signature is computed over the exact bytes), so this router must
// be mounted before express.json().
const router = express.Router();

router.post('/', express.raw({ type: '*/*', limit: '100kb' }), async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

  if (!validSignature(raw, req.get('x-signature'))) {
    log.warn('webhook rejected: bad signature', { ip: req.ip });
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let json;
  try {
    json = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Body is not valid JSON' });
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return res.status(422).json({
      error: 'Invalid payload',
      details: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    });
  }
  const p = parsed.data;

  if (p.brand_id !== config.brandId) {
    return res.status(422).json({ error: `Unknown brand_id "${p.brand_id}"` });
  }
  // Events we do not handle are acknowledged with 2xx so the chat system does not retry them.
  if (p.type !== 'message.received' || p.message.type !== 'text' || !p.message.text) {
    log.info('webhook ignored', { eventId: p.event_id, type: p.type, messageType: p.message.type });
    return res.status(200).json({ status: 'ignored' });
  }

  const result = await ingestCustomerMessage({
    brandId: p.brand_id,
    customer: p.customer,
    message: { id: p.message.id, text: p.message.text },
    eventId: p.event_id,
  });
  log.info('webhook handled', { eventId: p.event_id, duplicate: result.duplicate });
  res.status(200).json({
    status: result.duplicate ? 'duplicate' : 'received',
    conversation_id: result.conversationId,
    message_id: result.messageId ?? null,
  });
});

export default router;
