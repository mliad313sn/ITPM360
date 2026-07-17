import { Router } from 'express';
import { query } from '../db.js';
import { requireGlobalAdmin } from '../lib/rbac.js';
import { logAudit, diff } from '../lib/audit.js';

const router = Router();

router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT c.*, (SELECT count(*)::int FROM branches b WHERE b.country_id = c.id) AS branch_count
     FROM countries c ORDER BY c.name`
  );
  res.json({ countries: rows });
});

router.post('/', requireGlobalAdmin, async (req, res) => {
  const { name, iso_code } = req.body ?? {};
  if (!name?.trim() || !/^[A-Za-z]{2}$/.test(iso_code ?? '')) {
    return res.status(400).json({ error: 'name and 2-letter iso_code are required' });
  }
  // Single-tenant: countries attach to the one organization row
  const { rows: orgRows } = await query(
    `INSERT INTO organizations (name)
     SELECT 'Global Organization' WHERE NOT EXISTS (SELECT 1 FROM organizations)
     RETURNING id`
  );
  const orgId = orgRows[0]?.id ?? (await query('SELECT id FROM organizations LIMIT 1')).rows[0].id;

  try {
    const { rows } = await query(
      `INSERT INTO countries (organization_id, name, iso_code) VALUES ($1, $2, $3) RETURNING *`,
      [orgId, name.trim(), iso_code.toUpperCase()]
    );
    await logAudit(req, 'create', 'country', rows[0].id, { after: { name, iso_code } });
    res.status(201).json({ country: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Country code already exists' });
    throw err;
  }
});

router.patch('/:id', requireGlobalAdmin, async (req, res) => {
  const { rows: existing } = await query('SELECT * FROM countries WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Country not found' });

  const name = req.body?.name?.trim() || existing[0].name;
  const iso = (req.body?.iso_code ?? existing[0].iso_code).toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return res.status(400).json({ error: 'iso_code must be 2 letters' });

  const { rows } = await query(
    `UPDATE countries SET name = $1, iso_code = $2 WHERE id = $3 RETURNING *`,
    [name, iso, req.params.id]
  );
  const changes = diff(existing[0], { name, iso_code: iso });
  if (changes) await logAudit(req, 'update', 'country', req.params.id, changes);
  res.json({ country: rows[0] });
});

router.delete('/:id', requireGlobalAdmin, async (req, res) => {
  const { rows } = await query('DELETE FROM countries WHERE id = $1 RETURNING id, name', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Country not found' });
  await logAudit(req, 'delete', 'country', rows[0].id, { before: { name: rows[0].name } });
  res.status(204).end();
});

export default router;
