// Sends a correctly signed test webhook.
//   node server/scripts/send-webhook.js "What is your return policy?"
//   URL=https://your-app.onrender.com/webhook node server/scripts/send-webhook.js "Hello"
import crypto from 'node:crypto';

const url = process.env.URL || 'http://localhost:4000/webhook';
const secret = process.env.WEBHOOK_SECRET || 'verdant-demo-secret-2026';
const text = process.argv[2] || "Hi, my order #4471 hasn't arrived yet. Can I change the delivery address?";
const id = crypto.randomBytes(4).toString('hex');

const body = JSON.stringify({
  event_id: `evt_${id}`,
  type: 'message.received',
  brand_id: 'verdant-co',
  timestamp: new Date().toISOString(),
  customer: { id: 'cust_1042', name: 'Aisha Khan', phone: '+919800000001' },
  message: { id: `msg_${id}`, type: 'text', text },
});
const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');

const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Signature': `sha256=${sig}` },
  body,
});
console.log(res.status, await res.text());
