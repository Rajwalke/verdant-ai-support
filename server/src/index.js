import { createApp } from './app.js';
import { seedAgent } from './auth.js';
import { config } from './config.js';
import { migrate, pool } from './db.js';
import { startDraftSweeper } from './drafts.js';
import { log } from './log.js';

try {
  await migrate();
  await seedAgent();
} catch (err) {
  log.error('startup failed (check DATABASE_URL)', { error: err.message });
  process.exit(1);
}

const server = createApp().listen(config.port, () => {
  log.info('server listening', { port: config.port });
  if (!config.llm.apiKey) log.warn('LLM_API_KEY is empty: drafts will be marked failed');
});
startDraftSweeper();

process.on('unhandledRejection', (err) => log.error('unhandledRejection', { error: String(err) }));
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => pool.end().then(() => process.exit(0))));
}
