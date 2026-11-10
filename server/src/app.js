import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { query } from './db.js';
import { log } from './log.js';
import agentRoutes from './routes/agent.js';
import customerRoutes from './routes/customer.js';
import webhookRoutes from './routes/webhook.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Render/Railway/etc. so rate limits see real IPs
  app.disable('x-powered-by');
  app.use(helmet());

  app.get('/health', async (req, res) => {
    try {
      await query('SELECT 1');
      res.json({ ok: true });
    } catch {
      res.status(503).json({ ok: false });
    }
  });

  // Webhook first: it needs the raw body for signature checking.
  app.use('/webhook', webhookRoutes);
  app.use('/api/webhook', webhookRoutes);

  app.use(express.json({ limit: '20kb' }));
  app.use(cookieParser());

  // Customer view has no sign-in, so limit abuse (and LLM spend).
  app.use(
    '/api/customer',
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests. Please slow down.' },
    }),
    customerRoutes
  );
  app.use('/api/agent', agentRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built React app (single deployable). Not present in dev: Vite serves it.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const dist = path.resolve(here, '../../client/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
    log.error('unhandled error', { path: req.path, error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
