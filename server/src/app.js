import express from 'express';
import cors from 'cors';
import { pool, query } from './db.js';
import { requireAuth } from './middleware/auth.js';
import { requireGlobalAdmin } from './lib/rbac.js';
import authRoutes from './routes/auth.js';
import countryRoutes from './routes/countries.js';
import branchRoutes from './routes/branches.js';
import userRoutes from './routes/users.js';
import projectRoutes from './routes/projects.js';
import taskRoutes from './routes/tasks.js';
import grcRoutes from './routes/grc.js';
import meetingRoutes from './routes/meetings.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';

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

  app.use('/api/auth', authRoutes);
  app.use('/api/countries', requireAuth, countryRoutes);
  app.use('/api/branches', requireAuth, branchRoutes);
  app.use('/api/users', requireAuth, userRoutes);
  app.use('/api/projects', requireAuth, projectRoutes);
  app.use('/api', requireAuth, taskRoutes);
  app.use('/api', requireAuth, grcRoutes);
  app.use('/api', requireAuth, meetingRoutes);
  app.use('/api/dashboard', requireAuth, dashboardRoutes);
  app.use('/api/reports', requireAuth, reportRoutes);

  app.get('/api/audit-logs', requireAuth, requireGlobalAdmin, async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const { rows } = await query(
      `SELECT a.*, u.full_name AS actor_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ audit_logs: rows });
  });

  app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
