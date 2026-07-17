import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { query } from '../db.js';
import { requireGlobalAdmin } from '../lib/rbac.js';
import { logAudit } from '../lib/audit.js';
import { emitEvent, WEBHOOK_EVENTS } from '../lib/webhooks.js';

const router = Router();

router.use(requireGlobalAdmin);

router.get('/events', (_req, res) => res.json({ events: WEBHOOK_EVENTS }));

router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT w.*, u.full_name AS created_by_name,
       (SELECT count(*)::int FROM webhook_deliveries d WHERE d.subscription_id = w.id) AS delivery_count
     FROM webhook_subscriptions w LEFT JOIN users u ON u.id = w.created_by
     ORDER BY w.created_at DESC`
  );
  res.json({ webhooks: rows });
});

router.post('/', async (req, res) => {
  const { url, events } = req.body ?? {};
  if (!url?.startsWith('http') || !Array.isArray(events) || events.length === 0) {
    return res.status(400).json({ error: 'A valid url and at least one event are required' });
  }
  const invalid = events.filter((e) => !WEBHOOK_EVENTS.includes(e));
  if (invalid.length) return res.status(400).json({ error: `Unknown events: ${invalid.join(', ')}` });

  const secret = randomBytes(24).toString('hex');
  const { rows } = await query(
    `INSERT INTO webhook_subscriptions (url, secret, events, created_by)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [url, secret, events, req.user.id]
  );
  await logAudit(req, 'create', 'webhook', rows[0].id, { after: { url, events } });
  res.status(201).json({ webhook: rows[0] });
});

router.patch('/:id', async (req, res) => {
  const { rows: existing } = await query('SELECT * FROM webhook_subscriptions WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Webhook not found' });

  const b = req.body ?? {};
  const events = Array.isArray(b.events) && b.events.length ? b.events : existing[0].events;
  const invalid = events.filter((e) => !WEBHOOK_EVENTS.includes(e));
  if (invalid.length) return res.status(400).json({ error: `Unknown events: ${invalid.join(', ')}` });

  const { rows } = await query(
    `UPDATE webhook_subscriptions
     SET url = COALESCE($1, url), events = $2, is_active = COALESCE($3, is_active)
     WHERE id = $4 RETURNING *`,
    [b.url ?? null, events, typeof b.is_active === 'boolean' ? b.is_active : null, req.params.id]
  );
  await logAudit(req, 'update', 'webhook', req.params.id, { after: { url: rows[0].url, is_active: rows[0].is_active } });
  res.json({ webhook: rows[0] });
});

router.delete('/:id', async (req, res) => {
  const { rows } = await query('DELETE FROM webhook_subscriptions WHERE id = $1 RETURNING id, url', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Webhook not found' });
  await logAudit(req, 'delete', 'webhook', rows[0].id, { before: { url: rows[0].url } });
  res.status(204).end();
});

router.post('/:id/test', async (req, res) => {
  const { rows } = await query('SELECT * FROM webhook_subscriptions WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Webhook not found' });
  emitEvent(rows[0].events[0] ?? 'project.created', { test: true, message: 'ITPM360 webhook test delivery' });
  res.json({ ok: true, note: 'Test delivery dispatched — check recent deliveries.' });
});

router.get('/deliveries/recent', async (_req, res) => {
  const { rows } = await query(
    `SELECT d.id, d.subscription_id, d.event, d.response_status, d.attempts, d.delivered_at, d.created_at, w.url
     FROM webhook_deliveries d JOIN webhook_subscriptions w ON w.id = d.subscription_id
     ORDER BY d.created_at DESC LIMIT 25`
  );
  res.json({ deliveries: rows });
});

export default router;
