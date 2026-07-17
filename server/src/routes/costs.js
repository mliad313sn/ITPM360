import { Router } from 'express';
import { query } from '../db.js';
import { loadProject, canViewProject, canManageProject } from '../lib/access.js';
import { logAudit } from '../lib/audit.js';

const router = Router();
const CATEGORIES = ['labour', 'hardware', 'software', 'services', 'contingency', 'other'];

// GET /api/projects/:projectId/costs — line items + category totals
router.get('/projects/:projectId/costs', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'No access to this project' });

  const { rows } = await query(
    `SELECT * FROM cost_lines WHERE project_id = $1 ORDER BY category, label`,
    [req.params.projectId]
  );
  const byCategory = {};
  for (const c of CATEGORIES) byCategory[c] = { planned: 0, actual: 0 };
  for (const r of rows) {
    byCategory[r.category].planned += Number(r.planned_amount);
    byCategory[r.category].actual += Number(r.actual_amount);
  }
  const totals = rows.reduce(
    (acc, r) => ({ planned: acc.planned + Number(r.planned_amount), actual: acc.actual + Number(r.actual_amount) }),
    { planned: 0, actual: 0 }
  );
  res.json({ cost_lines: rows, by_category: byCategory, totals });
});

router.post('/projects/:projectId/costs', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'Only project managers can edit costs' });

  const b = req.body ?? {};
  if (!b.label?.trim()) return res.status(400).json({ error: 'label is required' });
  const { rows } = await query(
    `INSERT INTO cost_lines (project_id, category, label, planned_amount, actual_amount)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.params.projectId, CATEGORIES.includes(b.category) ? b.category : 'other', b.label.trim(),
     Number(b.planned_amount) || 0, Number(b.actual_amount) || 0]
  );
  await logAudit(req, 'create', 'cost_line', rows[0].id, { after: { label: b.label, project_id: req.params.projectId } });
  res.status(201).json({ cost_line: rows[0] });
});

router.patch('/costs/:id', async (req, res) => {
  const { rows: existing } = await query('SELECT * FROM cost_lines WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Cost line not found' });
  const project = await loadProject(existing[0].project_id);
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'Only project managers can edit costs' });

  const b = req.body ?? {};
  const { rows } = await query(
    `UPDATE cost_lines SET category = $1, label = $2, planned_amount = $3, actual_amount = $4 WHERE id = $5 RETURNING *`,
    [
      CATEGORIES.includes(b.category) ? b.category : existing[0].category,
      b.label?.trim() || existing[0].label,
      b.planned_amount !== undefined ? Number(b.planned_amount) || 0 : existing[0].planned_amount,
      b.actual_amount !== undefined ? Number(b.actual_amount) || 0 : existing[0].actual_amount,
      req.params.id,
    ]
  );
  res.json({ cost_line: rows[0] });
});

router.delete('/costs/:id', async (req, res) => {
  const { rows: existing } = await query('SELECT * FROM cost_lines WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Cost line not found' });
  const project = await loadProject(existing[0].project_id);
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'Only project managers can edit costs' });
  await query('DELETE FROM cost_lines WHERE id = $1', [req.params.id]);
  await logAudit(req, 'delete', 'cost_line', req.params.id, { before: { label: existing[0].label } });
  res.status(204).end();
});

// GET /api/projects/:projectId/evm-history — S-curve data points
router.get('/projects/:projectId/evm-history', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'No access to this project' });
  const { rows } = await query(
    `SELECT captured_on, pv, ev, ac, spi, cpi, percent_complete
     FROM evm_snapshots WHERE project_id = $1 ORDER BY captured_on`,
    [req.params.projectId]
  );
  res.json({ snapshots: rows });
});

export default router;
