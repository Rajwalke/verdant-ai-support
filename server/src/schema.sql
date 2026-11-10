-- Idempotent: safe to run on every start.

CREATE TABLE IF NOT EXISTS agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  name          text NOT NULL,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One row per customer per brand. external_id is the id the chat system uses.
CREATE TABLE IF NOT EXISTS customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id    text NOT NULL,
  external_id text NOT NULL,
  name        text NOT NULL,
  phone       text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, external_id)
);
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES customers(id),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- Rule: a customer has at most ONE open conversation (enforced by the database).
CREATE UNIQUE INDEX IF NOT EXISTS one_open_conversation_per_customer
  ON conversations (customer_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS conversations_recent ON conversations (last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  sender          text NOT NULL CHECK (sender IN ('customer', 'agent')),
  body            text NOT NULL,
  external_id     text UNIQUE,   -- chat system's message id; makes webhook retries idempotent
  event_id        text UNIQUE,   -- chat system's event id
  agent_id        uuid REFERENCES agents(id),
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_by_conversation ON messages (conversation_id, created_at);

-- AI suggestions. One per customer message. Never sent automatically.
-- status: pending -> ready | failed -> used | superseded
CREATE TABLE IF NOT EXISTS drafts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  message_id      uuid NOT NULL UNIQUE REFERENCES messages(id),
  body            text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'ready', 'failed', 'used', 'superseded')),
  needs_human     boolean NOT NULL DEFAULT false,  -- AI says the KB could not fully answer
  reason          text,
  error           text,
  attempts        integer NOT NULL DEFAULT 0,
  model           text,
  used_message_id uuid REFERENCES messages(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS drafts_by_conversation ON drafts (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS drafts_open ON drafts (status) WHERE status IN ('pending', 'failed');
