import { Router } from 'express';
import { query } from '../db.js';
import { loadProject, canViewProject, canManageProject } from '../lib/access.js';
import { logAudit, diff } from '../lib/audit.js';
import { notifyUsers, projectStakeholders } from '../lib/notify.js';
import { emitEvent } from '../lib/webhooks.js';

const router = Router();

const CATEGORIES = ['risk', 'issue', 'assumption', 'dependency'];
const STATUSES = ['open', 'mitigating', 'closed', 'accepted'];
const HIGH_SEVERITY = 12; // likelihood*impact >= 12 is escalation-worthy

const RISK_SELECT = `
  SELECT r.*, o.full_name AS owner_name, cb.full_name AS created_by_name
  FROM risks r
  LEFT JOIN users o ON o.id = r.owner_id
  LEFT JOIN users cb ON cb.id = r.created_by
`;

const clamp = (v, fallback) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : fallback;
};

router.get('/projects/:projectId/risks', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'No access to this project' });

  const { rows } = await query(
    `${RISK_SELECT} WHERE r.project_id = $1
     ORDER BY (r.status IN ('closed','accepted')), r.severity DESC, r.created_at`,
    [req.params.projectId]
  );
  res.json({ risks: rows });
});

router.post('/projects/:projectId/risks', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canManageProject(req.user, project)) {
    return res.status(403).json({ error: 'Only project managers can log risks' });
  }

  const b = req.body ?? {};
  if (!b.title?.trim()) return res.status(400).json({ error: 'title is required' });
  const category = CATEGORIES.includes(b.category) ? b.category : 'risk';
  const likelihood = clamp(b.likelihood, 3);
  const impact = clamp(b.impact, 3);

  const { rows } = await query(
    `INSERT INTO risks (project_id, category, title, description, likelihood, impact,
                        owner_id, mitigation_plan, due_date, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      req.params.projectId, category, b.title.trim(), b.description?.trim() || null,
      likelihood, impact, b.owner_id || null, b.mitigation_plan?.trim() || null,
      b.due_date || null, req.user.id,
    ]
  );
  await logAudit(req, 'create', 'risk', rows[0].id, {
    after: { title: b.title, category, likelihood, impact, project_id: req.params.projectId },
  });

  const { rows: risk } = await query(`${RISK_SELECT} WHERE r.id = $1`, [rows[0].id]);
  if (risk[0].severity >= HIGH_SEVERITY) {
    await notifyUsers(
      [...(await projectStakeholders(project)), risk[0].owner_id].filter((id) => id && id !== req.user.id),
      'risk_raised',
      `High risk raised: ${risk[0].title}`,
      `${project.name} — severity ${risk[0].severity} (${likelihood}×${impact})`,
      'risk',
      risk[0].id
    );
    emitEvent('risk.raised', {
      risk_id: risk[0].id, title: risk[0].title, project_id: project.id, severity: risk[0].severity,
    });
  }
  res.status(201).json({ risk: risk[0] });
});

router.patch('/risks/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM risks WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Risk not found' });
  const project = await loadProject(existing.project_id);
  if (!canManageProject(req.user, project)) {
    return res.status(403).json({ error: 'Only project managers can update risks' });
  }

  const b = req.body ?? {};
  const status = STATUSES.includes(b.status) ? b.status : existing.status;
  const nowClosed = ['closed', 'accepted'].includes(status) && !['closed', 'accepted'].includes(existing.status);
  const next = {
    category: CATEGORIES.includes(b.category) ? b.category : existing.category,
    title: b.title?.trim() || existing.title,
    description: b.description !== undefined ? b.description?.trim() || null : existing.description,
    likelihood: b.likelihood !== undefined ? clamp(b.likelihood, existing.likelihood) : existing.likelihood,
    impact: b.impact !== undefined ? clamp(b.impact, existing.impact) : existing.impact,
    status,
    owner_id: b.owner_id !== undefined ? b.owner_id || null : existing.owner_id,
    mitigation_plan: b.mitigation_plan !== undefined ? b.mitigation_plan?.trim() || null : existing.mitigation_plan,
    due_date: b.due_date !== undefined ? b.due_date || null : existing.due_date,
  };

  await query(
    `UPDATE risks SET category=$1, title=$2, description=$3, likelihood=$4, impact=$5,
            status=$6, owner_id=$7, mitigation_plan=$8, due_date=$9,
            closed_at = CASE WHEN $10 THEN now() WHEN $6 NOT IN ('closed','accepted') THEN NULL ELSE closed_at END
     WHERE id = $11`,
    [next.category, next.title, next.description, next.likelihood, next.impact,
     next.status, next.owner_id, next.mitigation_plan, next.due_date, nowClosed, req.params.id]
  );

  const changes = diff(existing, next);
  if (changes) {
    await logAudit(req, next.status !== existing.status ? 'status_change' : 'update', 'risk', req.params.id, changes);
  }
  const { rows: risk } = await query(`${RISK_SELECT} WHERE r.id = $1`, [req.params.id]);
  res.json({ risk: risk[0] });
});

router.delete('/risks/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM risks WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Risk not found' });
  const project = await loadProject(existing.project_id);
  if (!canManageProject(req.user, project)) {
    return res.status(403).json({ error: 'Only project managers can delete risks' });
  }
  await query('DELETE FROM risks WHERE id = $1', [req.params.id]);
  await logAudit(req, 'delete', 'risk', req.params.id, { before: { title: existing.title } });
  res.status(204).end();
});

export default router;
