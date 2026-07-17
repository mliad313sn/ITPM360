import { Router } from 'express';
import { query } from '../db.js';
import { loadProject, canViewProject, canManageProject } from '../lib/access.js';
import { logAudit, diff } from '../lib/audit.js';

const router = Router();

const TYPES = ['governance', 'risk', 'compliance'];
const STATUSES = ['pending', 'in_review', 'approved', 'rejected', 'waived'];
const DECIDED = ['approved', 'rejected', 'waived'];

const GRC_SELECT = `
  SELECT g.*, u.full_name AS reviewed_by_name
  FROM grc_checkpoints g LEFT JOIN users u ON u.id = g.reviewed_by
`;

router.get('/projects/:projectId/grc', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'No access to this project' });

  const { rows } = await query(
    `${GRC_SELECT} WHERE g.project_id = $1 ORDER BY g.due_date NULLS LAST, g.created_at`,
    [req.params.projectId]
  );
  res.json({ checkpoints: rows });
});

router.post('/projects/:projectId/grc', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'Only project managers can define checkpoints' });

  const b = req.body ?? {};
  if (!b.title?.trim() || !TYPES.includes(b.checkpoint_type)) {
    return res.status(400).json({ error: `title and checkpoint_type (${TYPES.join('/')}) are required` });
  }
  const { rows } = await query(
    `INSERT INTO grc_checkpoints (project_id, checkpoint_type, title, description, due_date)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [req.params.projectId, b.checkpoint_type, b.title.trim(), b.description?.trim() || null, b.due_date || null]
  );
  await logAudit(req, 'create', 'grc_checkpoint', rows[0].id, {
    after: { title: b.title, checkpoint_type: b.checkpoint_type, project_id: req.params.projectId },
  });
  const { rows: cp } = await query(`${GRC_SELECT} WHERE g.id = $1`, [rows[0].id]);
  res.status(201).json({ checkpoint: cp[0] });
});

router.patch('/grc/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM grc_checkpoints WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Checkpoint not found' });
  const project = await loadProject(existing.project_id);
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'Only project managers can update checkpoints' });

  const b = req.body ?? {};
  const status = STATUSES.includes(b.status) ? b.status : existing.status;
  const decidedNow = DECIDED.includes(status) && !DECIDED.includes(existing.status);
  const next = {
    title: b.title?.trim() || existing.title,
    description: b.description !== undefined ? b.description?.trim() || null : existing.description,
    checkpoint_type: TYPES.includes(b.checkpoint_type) ? b.checkpoint_type : existing.checkpoint_type,
    status,
    due_date: b.due_date !== undefined ? b.due_date || null : existing.due_date,
    notes: b.notes !== undefined ? b.notes?.trim() || null : existing.notes,
  };

  await query(
    `UPDATE grc_checkpoints
     SET title=$1, description=$2, checkpoint_type=$3, status=$4, due_date=$5, notes=$6,
         reviewed_by = CASE WHEN $7 THEN $8 ELSE reviewed_by END,
         reviewed_at = CASE WHEN $7 THEN now() ELSE reviewed_at END
     WHERE id = $9`,
    [next.title, next.description, next.checkpoint_type, next.status, next.due_date, next.notes,
     decidedNow, req.user.id, req.params.id]
  );

  const changes = diff(existing, next);
  if (changes) {
    await logAudit(req, status !== existing.status ? 'status_change' : 'update', 'grc_checkpoint', req.params.id, changes);
  }
  const { rows: cp } = await query(`${GRC_SELECT} WHERE g.id = $1`, [req.params.id]);
  res.json({ checkpoint: cp[0] });
});

router.delete('/grc/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM grc_checkpoints WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Checkpoint not found' });
  const project = await loadProject(existing.project_id);
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'Only project managers can delete checkpoints' });

  await query('DELETE FROM grc_checkpoints WHERE id = $1', [req.params.id]);
  await logAudit(req, 'delete', 'grc_checkpoint', req.params.id, { before: { title: existing.title } });
  res.status(204).end();
});

export default router;
