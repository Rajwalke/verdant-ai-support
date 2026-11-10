import { withTransaction } from './db.js';
import { scheduleDraft } from './drafts.js';

// The single entry point for every customer message, whether it came from the webhook or
// the Customer view. Same saving, same AI draft.
//
// Idempotent: the chat system retries webhooks, so the same message.id / event_id arriving
// twice must not create a second message or a second draft.
export async function ingestCustomerMessage({ brandId, customer, message, eventId }) {
  const result = await withTransaction(async (db) => {
    const { rows: cu } = await db.query(
      `INSERT INTO customers (brand_id, external_id, name, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (brand_id, external_id)
       DO UPDATE SET name = EXCLUDED.name, phone = EXCLUDED.phone
       RETURNING id`,
      [brandId, customer.id, customer.name, customer.phone]
    );
    const customerId = cu[0].id;

    // At most one open conversation per customer; the partial unique index makes this
    // safe even if two messages arrive at the same instant.
    await db.query(
      `INSERT INTO conversations (customer_id) VALUES ($1)
       ON CONFLICT (customer_id) WHERE status = 'open' DO NOTHING`,
      [customerId]
    );
    const { rows: conv } = await db.query(
      `SELECT id FROM conversations WHERE customer_id = $1 AND status = 'open'`,
      [customerId]
    );
    const conversationId = conv[0].id;

    const { rows: msg } = await db.query(
      `INSERT INTO messages (conversation_id, sender, body, external_id, event_id)
       VALUES ($1, 'customer', $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [conversationId, message.text, message.id, eventId]
    );
    if (!msg[0]) return { duplicate: true, conversationId };

    const { rows: dr } = await db.query(
      `INSERT INTO drafts (conversation_id, message_id) VALUES ($1, $2) RETURNING id`,
      [conversationId, msg[0].id]
    );
    await db.query(`UPDATE conversations SET last_message_at = now() WHERE id = $1`, [conversationId]);

    return { duplicate: false, conversationId, messageId: msg[0].id, draftId: dr[0].id };
  });

  // Only after COMMIT, and not awaited: the customer/webhook gets its 2xx as soon as the
  // message is safely stored, even if the LLM is slow or down.
  if (!result.duplicate) scheduleDraft(result.draftId);
  return result;
}
