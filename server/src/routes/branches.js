import { Router } from 'express';
import { query } from '../db.js';
import { isGlobalAdmin, canManageBranch, requireGlobalAdmin } from '../lib/rbac.js';
import { logAudit, diff } from '../lib/audit.js';

const router = Router();

router.get('/', async (req, res) => {
  const params = [];
  let where = '';
  if (req.query.country_id) {
    params.push(req.query.country_id);
    where = 'WHERE b.country_id = $1';
  }
  const { rows } = await query(
    `SELECT b.*, c.name AS country_name, c.iso_code,
            (SELECT count(*)::int FROM projects p WHERE p.branch_id = b.id) AS project_count
     FROM branches b JOIN countries c ON c.id = b.country_id
     ${where} ORDER BY c.name, b.name`,
    params
  );
  res.json({ branches: rows });
});

router.post('/', requireGlobalAdmin, async (req, res) => {
  const { country_id, name, code, city, timezone } = req.body ?? {};
  if (!country_id || !name?.trim() || !code?.trim()) {
    return res.status(400).json({ error: 'country_id, name and code are required' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO branches (country_id, name, code, city, timezone)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [country_id, name.trim(), code.trim().toUpperCase(), city?.trim() || null, timezone?.trim() || 'UTC']
    );
    await logAudit(req, 'create', 'branch', rows[0].id, { after: { name, code, country_id } });
    res.status(201).json({ branch: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Branch code already exists in this country' });
    if (err.code === '23503') return res.status(400).json({ error: 'Unknown country_id' });
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  const { rows: existing } = await query('SELECT * FROM branches WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Branch not found' });
  if (!canManageBranch(req.user, existing[0].id)) {
    return res.status(403).json({ error: 'Requires global admin or branch manager of this branch' });
  }

  const next = {
    name: req.body?.name?.trim() || existing[0].name,
    code: (req.body?.code?.trim() || existing[0].code).toUpperCase(),
    city: req.body?.city !== undefined ? req.body.city?.trim() || null : existing[0].city,
    timezone: req.body?.timezone?.trim() || existing[0].timezone,
  };
  const { rows } = await query(
    `UPDATE branches SET name = $1, code = $2, city = $3, timezone = $4 WHERE id = $5 RETURNING *`,
    [next.name, next.code, next.city, next.timezone, req.params.id]
  );
  const changes = diff(existing[0], next);
  if (changes) await logAudit(req, 'update', 'branch', req.params.id, changes);
  res.json({ branch: rows[0] });
});

router.delete('/:id', requireGlobalAdmin, async (req, res) => {
  const { rows } = await query('DELETE FROM branches WHERE id = $1 RETURNING id, name', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Branch not found' });
  await logAudit(req, 'delete', 'branch', rows[0].id, { before: { name: rows[0].name } });
  res.status(204).end();
});

export default router;
