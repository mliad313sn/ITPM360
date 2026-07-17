import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  const { rows } = await query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
    [req.user.id]
  );
  const { rows: [{ count }] } = await query(
    `SELECT count(*)::int FROM notifications WHERE user_id = $1 AND NOT is_read`,
    [req.user.id]
  );
  res.json({ notifications: rows, unread: count });
});

router.post('/:id/read', async (req, res) => {
  await query(
    `UPDATE notifications SET is_read = true, read_at = now() WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );
  res.status(204).end();
});

router.post('/read-all', async (req, res) => {
  await query(
    `UPDATE notifications SET is_read = true, read_at = now() WHERE user_id = $1 AND NOT is_read`,
    [req.user.id]
  );
  res.status(204).end();
});

export default router;
