// Tiny structured logger: one JSON line per event, easy to grep on any host.
const write = (level, msg, extra) =>
  console[level === 'error' ? 'error' : 'log'](
    JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra })
  );
export const log = {
  info: (msg, extra) => write('info', msg, extra),
  warn: (msg, extra) => write('warn', msg, extra),
  error: (msg, extra) => write('error', msg, extra),
};
