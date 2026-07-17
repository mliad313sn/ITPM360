import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
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
import riskRoutes from './routes/risks.js';
import timeRoutes from './routes/time.js';
import meetingRoutes from './routes/meetings.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import notificationRoutes from './routes/notifications.js';
import webhookRoutes from './routes/webhooks.js';
import exportRoutes from './routes/export.js';
import workspaceRoutes from './routes/workspace.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1); // accurate req.ip behind the reverse proxy
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',') ?? true }));
  app.use(express.json({ limit: '1mb' }));

  // Brute-force protection on credential endpoints
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many login attempts — try again later' },
  });
  app.use('/api/auth/login', loginLimiter);

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
  app.use('/api', requireAuth, riskRoutes);
  app.use('/api', requireAuth, timeRoutes);
  app.use('/api', requireAuth, meetingRoutes);
  app.use('/api/dashboard', requireAuth, dashboardRoutes);
  app.use('/api/reports', requireAuth, reportRoutes);
  app.use('/api/notifications', requireAuth, notificationRoutes);
  app.use('/api/webhooks', requireAuth, webhookRoutes);
  app.use('/api/export', requireAuth, exportRoutes);
  app.use('/api', requireAuth, workspaceRoutes);

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

  // Express 5 forwards rejected async handlers here automatically
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
      return res.status(400).json({ error: 'Invalid request body' });
    }
    console.error(`${req.method} ${req.originalUrl}:`, err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
