import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { query } from './db.js';
import { log } from './log.js';

const COOKIE = 'agent_session';
const TTL_HOURS = 12;
// Used so that unknown emails take as long as wrong passwords (no user enumeration).
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export async function seedAgent() {
  const { email, password, name } = config.agent;
  if (!email || !password) {
    log.warn('AGENT_EMAIL / AGENT_PASSWORD not set; no agent account seeded');
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await query(
    `INSERT INTO agents (email, name, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
    [email.toLowerCase(), name, hash]
  );
  log.info('agent account ready', { email });
}

export async function login(email, password) {
  const { rows } = await query(`SELECT id, email, name, password_hash FROM agents WHERE email = $1`, [
    email.toLowerCase(),
  ]);
  const agent = rows[0];
  const ok = await bcrypt.compare(password, agent ? agent.password_hash : DUMMY_HASH);
  return ok && agent ? { id: agent.id, email: agent.email, name: agent.name } : null;
}

export function setSession(res, agent) {
  const token = jwt.sign({ sub: agent.id }, config.jwtSecret, { expiresIn: `${TTL_HOURS}h` });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: TTL_HOURS * 3600 * 1000,
  });
}

export const clearSession = (res) => res.clearCookie(COOKIE);

export async function requireAgent(req, res, next) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return res.status(401).json({ error: 'Not signed in' });
    const { sub } = jwt.verify(token, config.jwtSecret);
    const { rows } = await query(`SELECT id, email, name FROM agents WHERE id = $1`, [sub]);
    if (!rows[0]) return res.status(401).json({ error: 'Not signed in' });
    req.agent = rows[0];
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired' });
    }
    next(err);
  }
}
