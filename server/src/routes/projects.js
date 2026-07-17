import { Router } from 'express';
import { query } from '../db.js';
import { isGlobalAdmin, scopedBranchIds, canManageBranch, canManageProject, hasBranchRole } from '../lib/rbac.js';
import { logAudit, diff } from '../lib/audit.js';
import { notifyUsers, projectStakeholders, isRagDowngrade } from '../lib/notify.js';
import { emitEvent } from '../lib/webhooks.js';

const router = Router();

const RAG = ['green', 'amber', 'red'];
const STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];

const PROJECT_SELECT = `
  SELECT p.*, b.name AS branch_name, b.code AS branch_code,
         c.name AS country_name, c.iso_code,
         pm.full_name AS pm_name,
         (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id) AS task_count,
         (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'blocked') AS blocked_count,
         COALESCE((SELECT json_agg(json_build_object(
             'user_id', m.user_id, 'full_name', mu.full_name, 'member_role', m.member_role))
           FROM project_members m JOIN users mu ON mu.id = m.user_id
           WHERE m.project_id = p.id), '[]') AS members
  FROM projects p
  JOIN branches b ON b.id = p.branch_id
  JOIN countries c ON c.id = b.country_id
  JOIN users pm ON pm.id = p.project_manager_id
`;

async function fetchProject(id) {
  const { rows } = await query(`${PROJECT_SELECT} WHERE p.id = $1`, [id]);
  return rows[0] ?? null;
}

// List projects visible to the caller
router.get('/', async (req, res) => {
  const filters = [];
  const params = [];
  const add = (clause, value) => {
    params.push(value);
    filters.push(clause.replace('?', `$${params.length}`));
  };

  if (!isGlobalAdmin(req.user)) {
    params.push(scopedBranchIds(req.user), req.user.id);
    filters.push(`(p.branch_id = ANY($${params.length - 1})
      OR p.project_manager_id = $${params.length}
      OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $${params.length}))`);
  }
  if (req.query.branch_id) add('p.branch_id = ?', req.query.branch_id);
  if (req.query.status && STATUSES.includes(req.query.status)) add('p.status = ?', req.query.status);
  if (req.query.rag && RAG.includes(req.query.rag)) add('p.rag_status = ?', req.query.rag);

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await query(`${PROJECT_SELECT} ${where} ORDER BY p.updated_at DESC`, params);
  res.json({ projects: rows });
});

router.get('/:id', async (req, res) => {
  const project = await fetchProject(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  const visible =
    isGlobalAdmin(req.user) ||
    scopedBranchIds(req.user).includes(project.branch_id) ||
    project.project_manager_id === req.user.id ||
    project.members.some((m) => m.user_id === req.user.id);
  if (!visible) return res.status(403).json({ error: 'No access to this project' });
  res.json({ project });
});

router.post('/', async (req, res) => {
  const { branch_id, name, description, project_manager_id, rag_status, status, start_date, end_date, budget } =
    req.body ?? {};
  if (!branch_id || !name?.trim() || !project_manager_id) {
    return res.status(400).json({ error: 'branch_id, name and project_manager_id are required' });
  }
  const allowed =
    isGlobalAdmin(req.user) || hasBranchRole(req.user, branch_id, 'branch_manager', 'project_manager');
  if (!allowed) return res.status(403).json({ error: 'You cannot create projects in this branch' });

  try {
    const { rows } = await query(
      `INSERT INTO projects (branch_id, name, description, project_manager_id, rag_status, status,
                             start_date, end_date, budget, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
      [
        branch_id,
        name.trim(),
        description?.trim() || null,
        project_manager_id,
        RAG.includes(rag_status) ? rag_status : 'green',
        STATUSES.includes(status) ? status : 'planning',
        start_date || null,
        end_date || null,
        budget ?? null,
        req.user.id,
      ]
    );
    await logAudit(req, 'create', 'project', rows[0].id, { after: { name, branch_id, project_manager_id } });
    emitEvent('project.created', { project_id: rows[0].id, name: name.trim(), branch_id });
    res.status(201).json({ project: await fetchProject(rows[0].id) });
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Unknown branch or project manager' });
    if (err.code === '23514') return res.status(400).json({ error: 'end_date must be on or after start_date' });
    throw err;
  }
});

router.patch('/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  if (!canManageProject(req.user, existing)) {
    return res.status(403).json({ error: 'You cannot modify this project' });
  }

  const body = req.body ?? {};
  const next = {
    name: body.name?.trim() || existing.name,
    description: body.description !== undefined ? body.description?.trim() || null : existing.description,
    project_manager_id: body.project_manager_id ?? existing.project_manager_id,
    rag_status: RAG.includes(body.rag_status) ? body.rag_status : existing.rag_status,
    status: STATUSES.includes(body.status) ? body.status : existing.status,
    start_date: body.start_date !== undefined ? body.start_date || null : existing.start_date,
    end_date: body.end_date !== undefined ? body.end_date || null : existing.end_date,
    budget: body.budget !== undefined ? body.budget ?? null : existing.budget,
  };

  try {
    await query(
      `UPDATE projects SET name = $1, description = $2, project_manager_id = $3, rag_status = $4,
              status = $5, start_date = $6, end_date = $7, budget = $8
       WHERE id = $9`,
      [
        next.name, next.description, next.project_manager_id, next.rag_status,
        next.status, next.start_date, next.end_date, next.budget, req.params.id,
      ]
    );
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Unknown project manager' });
    if (err.code === '23514') return res.status(400).json({ error: 'end_date must be on or after start_date' });
    throw err;
  }

  // RAG / status transitions are audit-critical: log them as status_change
  const ragChanged = next.rag_status !== existing.rag_status;
  const statusChanged = next.status !== existing.status;
  const changes = diff(existing, next);
  if (changes) {
    await logAudit(req, ragChanged || statusChanged ? 'status_change' : 'update', 'project', req.params.id, changes);
  }

  if (ragChanged) {
    emitEvent('project.rag_changed', {
      project_id: req.params.id, name: next.name, from: existing.rag_status, to: next.rag_status,
    });
    if (isRagDowngrade(existing.rag_status, next.rag_status)) {
      await notifyUsers(
        (await projectStakeholders({ ...existing, project_manager_id: next.project_manager_id }))
          .filter((id) => id !== req.user.id),
        'rag_downgrade',
        `RAG downgraded: ${next.name}`,
        `${existing.rag_status.toUpperCase()} → ${next.rag_status.toUpperCase()}`,
        'project',
        req.params.id
      );
    }
  }
  if (statusChanged) {
    emitEvent('project.status_changed', {
      project_id: req.params.id, name: next.name, from: existing.status, to: next.status,
    });
  }
  res.json({ project: await fetchProject(req.params.id) });
});

router.delete('/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Project not found' });
  if (!canManageBranch(req.user, existing.branch_id)) {
    return res.status(403).json({ error: 'Requires global admin or branch manager of this branch' });
  }
  await query('DELETE FROM projects WHERE id = $1', [req.params.id]);
  await logAudit(req, 'delete', 'project', req.params.id, { before: { name: existing.name } });
  res.status(204).end();
});

// Team members
router.post('/:id/members', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  const project = existingRows[0];
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'You cannot modify this project' });

  const { user_id, member_role } = req.body ?? {};
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });
  try {
    await query(
      `INSERT INTO project_members (project_id, user_id, member_role) VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET member_role = EXCLUDED.member_role`,
      [req.params.id, user_id, member_role?.trim() || 'member']
    );
    await logAudit(req, 'update', 'project', req.params.id, { after: { member_added: user_id } });
    res.status(201).json({ project: await fetchProject(req.params.id) });
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Unknown user' });
    throw err;
  }
});

router.delete('/:id/members/:userId', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
  const project = existingRows[0];
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canManageProject(req.user, project)) return res.status(403).json({ error: 'You cannot modify this project' });

  const { rows } = await query(
    `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2 RETURNING user_id`,
    [req.params.id, req.params.userId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Member not found' });
  await logAudit(req, 'update', 'project', req.params.id, { after: { member_removed: req.params.userId } });
  res.status(204).end();
});

export default router;
