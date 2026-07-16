import express from 'express';
import cors from 'cors';
import { pool } from './db.js';

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
  app.use(express.json());

  app.get('/api/health', async (_req, res) => {
    try {
      const { rows } = await pool.query('SELECT 1 AS ok');
      res.json({ status: 'ok', database: rows[0].ok === 1 ? 'connected' : 'unknown' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
  });

  // Phase 2+: route modules mount here (countries, branches, users, projects, ...)

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  return app;
}
