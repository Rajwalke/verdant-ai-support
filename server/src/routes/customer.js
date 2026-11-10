import crypto from 'node:crypto';
import express from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { query } from '../db.js';
import { ingestCustomerMessage } from '../ingest.js';

const router = express.Router();

const idRegex = /^[A-Za-z0-9_-]{1,64}$/;
const phoneRegex = /^\+?[0-9]{7,15}$/;

const createCustomerSchema = z.object({
  name: z.string().trim().min(1, 'Enter a customer name').max(100),
  phone: z.string().trim().regex(/^[0-9]{10}$/, 'Enter a 10-digit mobile number'),
});

const sendSchema = z.object({
  customerId: z.string().regex(idRegex).optional(),
  name: z.string().trim().min(1).max(100),
  phone: z.string().trim().regex(phoneRegex, 'Phone must be 7-15 digits, optionally starting with +'),
  text: z.string().trim().min(1, 'Message is empty').max(2000, 'Message is too long (max 2000)'),
});

router.get('/customers', async (req, res) => {
  const { rows } = await query(
    `SELECT external_id AS id, name, phone FROM customers
      WHERE brand_id = $1 AND is_test = true ORDER BY created_at DESC LIMIT 200`,
    [config.brandId]
  );
  res.json({ customers: rows });
});

router.post('/customers', async (req, res) => {
  const parsed = createCustomerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.issues[0].message });
  }

  const { name, phone } = parsed.data;
  const externalId = `cust_${phone}`;
  const storedPhone = `+91${phone}`;
  const { rows } = await query(
    `INSERT INTO customers (brand_id, external_id, name, phone, is_test)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (brand_id, external_id)
     DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone
       WHERE customers.is_test = true
     RETURNING external_id AS id, name, phone`,
    [config.brandId, externalId, name, storedPhone]
  );
  if (!rows[0]) {
    return res.status(409).json({ error: 'A customer with this mobile number already exists.' });
  }
  res.status(201).json({ customer: rows[0] });
});

// Same pipeline as the webhook: this just builds the same shaped input and calls ingest.
router.post('/messages', async (req, res) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({ error: parsed.error.issues.map((i) => i.message).join('; ') });
  }
  const { name, phone, text } = parsed.data;
  const customerId = parsed.data.customerId ?? `cust_${phone.replace(/\D/g, '')}`;
  const uid = crypto.randomUUID();

  const result = await ingestCustomerMessage({
    brandId: config.brandId,
    customer: { id: customerId, name, phone },
    message: { id: `web_msg_${uid}`, text },
    eventId: `web_evt_${uid}`,
  });
  res.status(201).json({ conversation_id: result.conversationId, customerId });
});

// The customer sees their own conversation: messages only, never drafts.
router.get('/conversation', async (req, res) => {
  const customerId = String(req.query.customerId ?? '');
  if (!idRegex.test(customerId)) return res.status(422).json({ error: 'Invalid customerId' });
  const { rows } = await query(
    `SELECT m.id, m.sender, m.body, m.created_at
       FROM customers cu
       JOIN conversations c ON c.customer_id = cu.id AND c.status = 'open'
       JOIN messages m ON m.conversation_id = c.id
      WHERE cu.brand_id = $1 AND cu.external_id = $2
      ORDER BY m.created_at ASC, m.id`,
    [config.brandId, customerId]
  );
  res.json({ messages: rows });
});

export default router;
