// End-to-end checks against a real database and a stubbed LLM.
// Run: DATABASE_URL=... LLM_BASE_URL=<fake llm> npm test --prefix server
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, test } from 'node:test';
import { createApp } from '../src/app.js';
import { seedAgent } from '../src/auth.js';
import { config } from '../src/config.js';
import { migrate, pool, query } from '../src/db.js';

let server, base, cookie;
const uid = crypto.randomBytes(3).toString('hex');
const phone = '+9198' + Math.floor(10000000 + Math.random() * 89999999);

const signed = (obj, secret = config.webhookSecret) => {
  const body = JSON.stringify(obj);
  const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
  return { body, headers: { 'Content-Type': 'application/json', 'X-Signature': `sha256=${sig}` } };
};
const payload = (text, id = crypto.randomBytes(4).toString('hex')) => ({
  event_id: `evt_${id}`, type: 'message.received', brand_id: 'verdant-co',
  timestamp: new Date().toISOString(),
  customer: { id: `cust_t${uid}`, name: 'Test Person', phone },
  message: { id: `msg_${id}`, type: 'text', text },
});
const post = (path, body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(base + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function agentGet(path) {
  const r = await fetch(base + path, { headers: { cookie } });
  return r.json();
}

before(async () => {
  await migrate();
  await seedAgent();
  server = createApp().listen(0);
  base = `http://localhost:${server.address().port}`;
  const r = await post('/api/agent/login', { email: config.agent.email, password: config.agent.password });
  assert.equal(r.status, 200);
  cookie = r.headers.get('set-cookie').split(';')[0];
});
after(async () => { server.close(); await pool.end(); });

test('webhook rejects bad / missing signature', async () => {
  const bad = signed(payload('hi'), 'wrong-secret');
  assert.equal((await post('/webhook', bad.body, bad.headers)).status, 401);
  assert.equal((await post('/webhook', JSON.stringify(payload('hi')))).status, 401);
});

test('webhook rejects invalid payloads without crashing', async () => {
  const garbage = signed({ nope: true });
  assert.equal((await post('/webhook', garbage.body, garbage.headers)).status, 422);
  const raw = '{not json';
  const sig = crypto.createHmac('sha256', config.webhookSecret).update(raw).digest('hex');
  assert.equal((await post('/webhook', raw, { 'X-Signature': `sha256=${sig}` })).status, 400);
});

test('message is stored, draft is generated, duplicate is ignored', async () => {
  const p = payload('What is your return policy?');
  const s = signed(p);
  const r1 = await post('/webhook', s.body, s.headers);
  assert.equal(r1.status, 200);
  const j1 = await r1.json();
  assert.equal(j1.status, 'received');

  const r2 = await post('/webhook', s.body, s.headers); // retry of same event
  assert.equal((await r2.json()).status, 'duplicate');

  const { rows } = await query(`SELECT count(*)::int n FROM messages WHERE external_id = $1`, [p.message.id]);
  assert.equal(rows[0].n, 1);

  let data;
  for (let i = 0; i < 20; i++) {
    data = await agentGet(`/api/agent/conversations/${j1.conversation_id}`);
    if (data.draft?.status === 'ready') break;
    await wait(250);
  }
  assert.equal(data.draft.status, 'ready');
  assert.ok(data.draft.body.length > 5);
});

test('one open conversation per customer', async () => {
  const s = signed(payload('second message'));
  const j = await (await post('/webhook', s.body, s.headers)).json();
  const { rows } = await query(
    `SELECT count(*)::int n FROM conversations c JOIN customers cu ON cu.id = c.customer_id
      WHERE cu.external_id = $1 AND c.status = 'open'`, [`cust_t${uid}`]);
  assert.equal(rows[0].n, 1);
  const data = await agentGet(`/api/agent/conversations/${j.conversation_id}`);
  assert.equal(data.messages.filter((m) => m.sender === 'customer').length, 2);
});

test('agent endpoints require sign-in', async () => {
  assert.equal((await fetch(base + '/api/agent/conversations')).status, 401);
});

test('LLM failure leaves the message saved and the draft marked failed', async () => {
  const s = signed(payload('please FAIL now'));
  const r = await post('/webhook', s.body, s.headers);
  assert.equal(r.status, 200); // customer message still accepted
  const j = await r.json();
  let data;
  for (let i = 0; i < 30; i++) {
    data = await agentGet(`/api/agent/conversations/${j.conversation_id}`);
    if (data.draft?.status === 'failed') break;
    await wait(300);
  }
  assert.equal(data.draft.status, 'failed');
  assert.ok(data.draft.error);
});

test('approve saves reply, marks draft used, customer sees reply but never drafts; double approve is 409', async () => {
  const s = signed(payload('What is your return policy?'));
  const j = await (await post('/webhook', s.body, s.headers)).json();
  let data;
  for (let i = 0; i < 20; i++) {
    data = await agentGet(`/api/agent/conversations/${j.conversation_id}`);
    if (data.draft?.status === 'ready') break;
    await wait(250);
  }
  const draftId = data.draft.id;
  const headers = { 'Content-Type': 'application/json', cookie };
  const [a, b] = await Promise.all([
    post(`/api/agent/drafts/${draftId}/approve`, { text: 'Edited reply' }, headers),
    post(`/api/agent/drafts/${draftId}/approve`, { text: 'Edited reply' }, headers),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);

  const cust = await (await fetch(`${base}/api/customer/conversation?customerId=cust_t${uid}`)).json();
  assert.ok(cust.messages.some((m) => m.sender === 'agent' && m.body === 'Edited reply'));
  assert.ok(!JSON.stringify(cust).includes('draft'));
  const { rows } = await query(`SELECT status FROM drafts WHERE id = $1`, [draftId]);
  assert.equal(rows[0].status, 'used');
});

test('customer view uses the same pipeline', async () => {
  const mobile = String(Math.floor(6000000000 + Math.random() * 3999999999));
  const createdResponse = await post('/api/customer/customers', {
    name: 'New Customer',
    phone: mobile,
  });
  assert.equal(createdResponse.status, 201);
  const { customer } = await createdResponse.json();
  assert.equal(customer.id, `cust_${mobile}`);
  assert.equal(customer.phone, `+91${mobile}`);

  const saved = await (await fetch(base + '/api/customer/customers')).json();
  assert.ok(saved.customers.some((item) => item.id === customer.id && item.name === customer.name));
  assert.ok(!saved.customers.some((item) => item.id === `cust_t${uid}`));
  assert.equal(
    (await post('/api/customer/customers', { name: 'Invalid', phone: '12345' })).status,
    422
  );
  assert.equal(
    (await post('/api/customer/customers', { name: 'Invalid', phone: `${mobile}0` })).status,
    422
  );

  const r = await post('/api/customer/messages', { customerId: `cust_t${uid}`, name: 'Test Person', phone, text: 'Do you deliver to Dubai?' });
  assert.equal(r.status, 201);
  const bad = await post('/api/customer/messages', { name: 'X', phone: 'abc', text: 'hi' });
  assert.equal(bad.status, 422);
});
