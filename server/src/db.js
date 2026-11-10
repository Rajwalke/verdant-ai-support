import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { config } from './config.js';

// Neon URLs carry sslmode / channel_binding query params. We strip them and set TLS
// explicitly so behaviour doesn't depend on the pg version.
function poolConfig(url) {
  const u = new URL(url);
  u.searchParams.delete('sslmode');
  u.searchParams.delete('channel_binding');
  const local = ['localhost', '127.0.0.1', '::1'].includes(u.hostname);
  return {
    connectionString: u.toString(),
    ssl: local ? false : { rejectUnauthorized: true },
    max: 5,                         // Neon's pooler handles the rest
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000, // allows for a Neon cold start
  };
}

export const pool = new pg.Pool(poolConfig(config.databaseUrl));
pool.on('error', (err) => console.error('idle pg client error', err.message));

export const query = (text, params) => pool.query(text, params);

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function migrate() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sql = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);
}
