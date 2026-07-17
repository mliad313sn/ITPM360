import 'dotenv/config';
import { createApp } from './app.js';
import { pool } from './db.js';
import { startDeadlineScanner } from './lib/scanner.js';

// Fail fast on unsafe production configuration
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('FATAL: JWT_SECRET must be set (32+ chars) in production.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('FATAL: DATABASE_URL must be set in production.');
    process.exit(1);
  }
}

const port = Number(process.env.PORT ?? 4000);

const server = createApp().listen(port, () => {
  console.log(`ITPM360 API listening on http://localhost:${port}`);
  startDeadlineScanner(); // hourly deadline & GRC-due notifications
});

// Graceful shutdown: stop accepting connections, then release the pool
async function shutdown(signal) {
  console.log(`${signal} received — shutting down…`);
  server.close(async () => {
    await pool.end().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // hard stop safeguard
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
