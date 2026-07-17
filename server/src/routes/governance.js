import { Router } from 'express';
import { query } from '../db.js';
import { loadProject, canViewProject, canManageProject } from '../lib/access.js';
import { logAudit } from '../lib/audit.js';

const router = Router();
const RACI = ['responsible', 'accountable', 'consulted', 'informed'];
const clamp13 = (v, d) => (Number.isInteger(Number(v)) && v >= 1 && v <= 3 ? Number(v) : d);

// --- Stakeholders ---------------------------------------------------------

router.get('/projects/:projectId/stakeholders', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'No access' });
  const { rows } = await query(
    `SELECT * FROM stakeholders WHERE project_id = $1 ORDER BY influence DESC, interest DESC, name`,
    [req.params.projectId]
  );
  res.json({ stakeholders: rows });
});

router.post('/projects/:projectId/stakeholders', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'Only project managers can edit stakeholders' });
  const b = req.body ?? {};
  if (!b.name?.trim()) return res.status(400).json({ error: 'name is required' });
  const { rows } = await query(
    `INSERT INTO stakeholders (project_id, name, title, influence, interest, engagement)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.projectId, b.name.trim(), b.title?.trim() || null, clamp13(b.influence, 2), clamp13(b.interest, 2), b.engagement?.trim() || null]
  );
  await logAudit(req, 'create', 'stakeholder', rows[0].id, { after: { name: b.name, project_id: req.params.projectId } });
  res.status(201).json({ stakeholder: rows[0] });
});

router.patch('/stakeholders/:id', async (req, res) => {
  const { rows: existing } = await query('SELECT * FROM stakeholders WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Stakeholder not found' });
  const project = await loadProject(existing[0].project_id);
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'Only project managers can edit stakeholders' });
  const b = req.body ?? {};
  const { rows } = await query(
    `UPDATE stakeholders SET name=$1, title=$2, influence=$3, interest=$4, engagement=$5 WHERE id=$6 RETURNING *`,
    [b.name?.trim() || existing[0].name, b.title !== undefined ? b.title?.trim() || null : existing[0].title,
     clamp13(b.influence, existing[0].influence), clamp13(b.interest, existing[0].interest),
     b.engagement !== undefined ? b.engagement?.trim() || null : existing[0].engagement, req.params.id]
  );
  res.json({ stakeholder: rows[0] });
});

router.delete('/stakeholders/:id', async (req, res) => {
  const { rows: existing } = await query('SELECT * FROM stakeholders WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Stakeholder not found' });
  const project = await loadProject(existing[0].project_id);
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'Only project managers can edit stakeholders' });
  await query('DELETE FROM stakeholders WHERE id = $1', [req.params.id]);
  await logAudit(req, 'delete', 'stakeholder', req.params.id, { before: { name: existing[0].name } });
  res.status(204).end();
});

// --- RACI matrix ----------------------------------------------------------

router.get('/projects/:projectId/raci', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'No access' });
  const { rows } = await query(
    `SELECT r.*, u.full_name FROM raci_entries r JOIN users u ON u.id = r.user_id
     WHERE r.project_id = $1 ORDER BY r.activity, u.full_name`,
    [req.params.projectId]
  );
  res.json({ raci: rows });
});

router.post('/projects/:projectId/raci', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'Only project managers can edit the RACI matrix' });
  const b = req.body ?? {};
  if (!b.activity?.trim() || !b.user_id || !RACI.includes(b.assignment)) {
    return res.status(400).json({ error: `activity, user_id and assignment (${RACI.join('/')}) are required` });
  }
  try {
    const { rows } = await query(
      `INSERT INTO raci_entries (project_id, activity, user_id, assignment)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (project_id, activity, user_id) DO UPDATE SET assignment = EXCLUDED.assignment
       RETURNING *`,
      [req.params.projectId, b.activity.trim(), b.user_id, b.assignment]
    );
    res.status(201).json({ entry: rows[0] });
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Unknown user' });
    throw err;
  }
});

router.delete('/raci/:id', async (req, res) => {
  const { rows: existing } = await query('SELECT * FROM raci_entries WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'Entry not found' });
  const project = await loadProject(existing[0].project_id);
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'Only project managers can edit the RACI matrix' });
  await query('DELETE FROM raci_entries WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
