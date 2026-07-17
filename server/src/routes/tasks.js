import { Router } from 'express';
import { query } from '../db.js';
import { loadProject, canViewProject, canContribute } from '../lib/access.js';
import { logAudit, diff } from '../lib/audit.js';

const router = Router();

const STATUSES = ['todo', 'in_progress', 'blocked', 'in_review', 'done'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

const TASK_SELECT = `
  SELECT t.*, u.full_name AS assignee_name
  FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
`;

// GET /api/projects/:projectId/tasks
router.get('/projects/:projectId/tasks', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'No access to this project' });

  const { rows } = await query(
    `${TASK_SELECT} WHERE t.project_id = $1 ORDER BY t.sort_order, t.created_at`,
    [req.params.projectId]
  );
  res.json({ tasks: rows });
});

// POST /api/projects/:projectId/tasks
router.post('/projects/:projectId/tasks', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canContribute(req.user, project)) return res.status(403).json({ error: 'Only the team can create tasks' });

  const b = req.body ?? {};
  if (!b.title?.trim()) return res.status(400).json({ error: 'title is required' });
  const status = STATUSES.includes(b.status) ? b.status : 'todo';
  if (status === 'blocked' && !b.blocker_explanation?.trim()) {
    return res.status(400).json({ error: 'A blocked task requires a blocker explanation' });
  }

  try {
    const { rows } = await query(
      `INSERT INTO tasks (project_id, title, description, assignee_id, status, priority,
                          start_date, due_date, blocker_explanation, next_steps, sort_order, created_by,
                          completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
               COALESCE((SELECT max(sort_order) + 1 FROM tasks WHERE project_id = $1), 0),
               $11, $12)
       RETURNING id`,
      [
        req.params.projectId, b.title.trim(), b.description?.trim() || null, b.assignee_id || null,
        status, PRIORITIES.includes(b.priority) ? b.priority : 'medium',
        b.start_date || null, b.due_date || null,
        b.blocker_explanation?.trim() || null, b.next_steps?.trim() || null,
        req.user.id, status === 'done' ? new Date() : null,
      ]
    );
    await logAudit(req, 'create', 'task', rows[0].id, { after: { title: b.title, project_id: req.params.projectId } });
    const { rows: task } = await query(`${TASK_SELECT} WHERE t.id = $1`, [rows[0].id]);
    res.status(201).json({ task: task[0] });
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Unknown assignee' });
    if (err.code === '23514') return res.status(400).json({ error: 'Invalid dates or missing blocker explanation' });
    throw err;
  }
});

// PATCH /api/tasks/:id
router.patch('/tasks/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  const project = await loadProject(existing.project_id);
  const allowed = canContribute(req.user, project) || existing.assignee_id === req.user.id;
  if (!allowed) return res.status(403).json({ error: 'Only the team or the assignee can update this task' });

  const b = req.body ?? {};
  const next = {
    title: b.title?.trim() || existing.title,
    description: b.description !== undefined ? b.description?.trim() || null : existing.description,
    assignee_id: b.assignee_id !== undefined ? b.assignee_id || null : existing.assignee_id,
    status: STATUSES.includes(b.status) ? b.status : existing.status,
    priority: PRIORITIES.includes(b.priority) ? b.priority : existing.priority,
    start_date: b.start_date !== undefined ? b.start_date || null : existing.start_date,
    due_date: b.due_date !== undefined ? b.due_date || null : existing.due_date,
    blocker_explanation:
      b.blocker_explanation !== undefined ? b.blocker_explanation?.trim() || null : existing.blocker_explanation,
    next_steps: b.next_steps !== undefined ? b.next_steps?.trim() || null : existing.next_steps,
    sort_order: Number.isInteger(b.sort_order) ? b.sort_order : existing.sort_order,
  };
  if (next.status === 'blocked' && !next.blocker_explanation) {
    return res.status(400).json({ error: 'A blocked task requires a blocker explanation' });
  }
  const completed_at =
    next.status === 'done' ? existing.completed_at ?? new Date() : null;

  try {
    await query(
      `UPDATE tasks SET title=$1, description=$2, assignee_id=$3, status=$4, priority=$5,
              start_date=$6, due_date=$7, blocker_explanation=$8, next_steps=$9, sort_order=$10,
              completed_at=$11
       WHERE id = $12`,
      [
        next.title, next.description, next.assignee_id, next.status, next.priority,
        next.start_date, next.due_date, next.blocker_explanation, next.next_steps, next.sort_order,
        completed_at, req.params.id,
      ]
    );
  } catch (err) {
    if (err.code === '23503') return res.status(400).json({ error: 'Unknown assignee' });
    if (err.code === '23514') return res.status(400).json({ error: 'Invalid dates or missing blocker explanation' });
    throw err;
  }

  const changes = diff(existing, next);
  if (changes) {
    await logAudit(req, next.status !== existing.status ? 'status_change' : 'update', 'task', req.params.id, changes);
  }
  const { rows: task } = await query(`${TASK_SELECT} WHERE t.id = $1`, [req.params.id]);
  res.json({ task: task[0] });
});

// DELETE /api/tasks/:id
router.delete('/tasks/:id', async (req, res) => {
  const { rows: existingRows } = await query('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Task not found' });
  const project = await loadProject(existing.project_id);
  if (!canContribute(req.user, project)) return res.status(403).json({ error: 'Only the team can delete tasks' });

  await query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
  await logAudit(req, 'delete', 'task', req.params.id, { before: { title: existing.title } });
  res.status(204).end();
});

export default router;
