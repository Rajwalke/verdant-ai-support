# Verdant & Co – AI-assisted support inbox

Customers message in (webhook or the built-in Customer view) → message saved → LLM drafts a reply from the knowledge base → an agent signs in, edits and approves → the approved reply appears in the customer's conversation. Drafts are never sent automatically and never shown to customers.

**Stack:** React + Vite + Tailwind · Node.js + Express 5 · PostgreSQL (Neon) · any OpenAI-compatible LLM API (DeepSeek / Gemini / OpenRouter). In production Express serves the built React app, so there is one service to deploy and the agent cookie is same-origin.

## Run locally
Needs Node 20+ and a PostgreSQL URL (Neon is fine).
```bash
cp .env.example .env     # fill DATABASE_URL, LLM_API_KEY, JWT_SECRET, AGENT_PASSWORD
npm run install:all
npm run dev:server       # terminal 1 → API on :4000 (creates tables + the agent account on start)
npm run dev:client       # terminal 2 → open http://localhost:5173
```
Sign in as `AGENT_EMAIL` / `AGENT_PASSWORD` from `.env`. Test the webhook (signed with the brief's test secret):
```bash
npm run webhook:test -- "What is your return policy?"
# or: curl -X POST $URL/webhook -H "X-Signature: sha256=<hmac of raw body>" -d '<json>'
```
Production: `npm run install:all && npm run build`, then `npm start` (set `NODE_ENV=production`). Tests: `npm test --prefix server` (needs `DATABASE_URL`; uses the configured LLM, or point `LLM_BASE_URL` at a stub).

## Decisions
- **One ingest function** serves the webhook and the Customer view, so they behave identically.
- **Webhook:** HMAC-SHA256 over the *raw* body, constant-time compare; bad signature 401, bad payload 422, unhandled event types 2xx-ignored. **Idempotent:** `message.id`/`event_id` are UNIQUE, so a retried webhook creates no second message or draft.
- **Data:** `customers`, `conversations`, `messages`, `drafts`, `agents`. A partial unique index guarantees one open conversation per customer even under concurrent messages. A draft belongs to the message it answers.
- **Customer testing:** the Customer view keeps test contacts beside their chat. New test contacts require a name and 10-digit Indian mobile number and are stored as test-only customer records; the public test list does not expose webhook-created customer records.
- **Appearance:** the workspace supports light and dark themes, follows the system theme on first visit, and remembers the user's selection.
- **AI is off the request path:** the message is committed and the webhook returns 200 first; the draft is generated afterwards. If the LLM fails, the message is still saved, the draft is marked `failed` (agent sees it, can write a reply or hit Regenerate), and a sweeper retries up to 3 times (also covers a restart mid-draft).
- **Approve** locks the draft row (`FOR UPDATE`), so a double-click or two agents can't send two replies (second gets 409).
- **Retrieval:** the full knowledge base—including verified policies and explicit guardrails for undocumented delivery, damaged-item, and skincare questions—is included in the system prompt. This is simplest at the current size; if the KB grows enough to affect context size, cost, or latency, switch to embeddings (pgvector) and send only the top matches.
- **Out-of-scope and unknown questions:** unrelated questions (for example, general trivia) get a polite redirect to Verdant & Co topics without claiming a team member will follow up; Verdant-related questions the KB cannot answer (such as Dubai delivery or product recommendations) are flagged `needs_human` for agent follow-up. The model cannot see orders, so it never claims order status, and customer text is treated as untrusted (prompt-injection rule).
- **Auth:** bcrypt + JWT in an httpOnly, sameSite cookie; login rate-limited. The Customer view has no sign-in by design, so it is rate-limited.
- **Left out for time:** real chat integration, closing/reopening conversations, multiple brands, websockets (UI polls every 3-4 s), per-agent assignment, webhook replay-window check, admin UI for agents, CI.

## AI tools
Claude generated the first version of the code and tests, which I reviewed and ran. **Where it got something wrong:** *(replace with your own example – e.g. in this build the first test script passed a directory to `node --test`, which fails on Node 22; it had to be pointed at the file.)*

## Two questions
**1. A message arrives at 2 a.m. and something fails – what does the agent see, and how do I find out?**
The customer message is saved before AI drafting starts, so after an AI failure the agent still sees the conversation and a failed draft, which can be retried or answered manually; a background sweeper also retries interrupted drafts. If the database is unavailable, the webhook returns a failure so the sending system can retry, and duplicate protection makes retries safe. I would investigate using the structured server logs, the draft's `error` and `attempts` fields, and the `/health` endpoint.

**2. This now has to serve 20 brands – what changes first?**
First, I would implement tenant isolation by associating every record and agent with a brand, scoping every query and webhook to that brand, and adding database-level safeguards against cross-brand access. I would then move the knowledge base and its prompt configuration into brand-specific storage, and use per-brand webhook secrets. Isolation comes first because exposing one brand's customer data or policies to another is the most serious risk.
