// Personal workspace + global search endpoints.
import { Router } from 'express';
import { query } from '../db.js';
import { isGlobalAdmin, scopedBranchIds } from '../lib/rbac.js';
import { loadProject, canViewProject, canContribute } from '../lib/access.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

// GET /api/my/tasks — the caller's open work, due-date first
router.get('/my/tasks', async (req, res) => {
  const { rows } = await query(
    `SELECT t.*, u.full_name AS assignee_name, p.name AS project_name, p.id AS project_id, b.code AS branch_code
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN branches b ON b.id = p.branch_id
     LEFT JOIN users u ON u.id = t.assignee_id
     WHERE t.assignee_id = $1 AND t.status <> 'done'
     ORDER BY t.due_date NULLS LAST, t.priority DESC`,
    [req.user.id]
  );
  res.json({ tasks: rows });
});

// GET /api/search?q=… — scoped global search over projects, tasks, meetings
router.get('/search', async (req, res) => {
  const q = (req.query.q ?? '').trim();
  if (q.length < 2) return res.json({ results: [] });
  const like = `%${q}%`;

  const params = [like];
  let scope = '';
  if (!isGlobalAdmin(req.user)) {
    params.push(scopedBranchIds(req.user), req.user.id);
    scope = `AND (p.branch_id = ANY($2) OR p.project_manager_id = $3
      OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $3))`;
  }

  const [projects, tasks, meetings] = await Promise.all([
    query(
      `SELECT p.id, p.name, b.name AS context FROM projects p JOIN branches b ON b.id = p.branch_id
       WHERE p.name ILIKE $1 ${scope} LIMIT 5`,
      params
    ),
    query(
      `SELECT t.id, t.title AS name, p.name AS context, t.project_id
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.title ILIKE $1 ${scope} LIMIT 5`,
      params
    ),
    query(
      `SELECT mt.id, mt.title AS name, p.name AS context
       FROM meetings mt JOIN projects p ON p.id = mt.project_id
       WHERE mt.title ILIKE $1 ${scope} LIMIT 5`,
      params
    ),
  ]);

  res.json({
    results: [
      ...projects.rows.map((r) => ({ type: 'project', id: r.id, name: r.name, context: r.context, href: `/projects/${r.id}` })),
      ...tasks.rows.map((r) => ({ type: 'task', id: r.id, name: r.name, context: r.context, href: `/projects/${r.project_id}` })),
      ...meetings.rows.map((r) => ({ type: 'meeting', id: r.id, name: r.name, context: r.context, href: `/meetings/${r.id}` })),
    ],
  });
});

// --- Task comments -----------------------------------------------------------

router.get('/tasks/:id/comments', async (req, res) => {
  const { rows: taskRows } = await query('SELECT project_id FROM tasks WHERE id = $1', [req.params.id]);
  if (!taskRows[0]) return res.status(404).json({ error: 'Task not found' });
  const project = await loadProject(taskRows[0].project_id);
  if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'No access' });

  const { rows } = await query(
    `SELECT c.*, u.full_name AS author_name FROM task_comments c
     LEFT JOIN users u ON u.id = c.author_id
     WHERE c.task_id = $1 ORDER BY c.created_at`,
    [req.params.id]
  );
  res.json({ comments: rows });
});

router.post('/tasks/:id/comments', async (req, res) => {
  const body = req.body?.body?.trim();
  if (!body) return res.status(400).json({ error: 'Comment body is required' });
  const { rows: taskRows } = await query('SELECT project_id, assignee_id FROM tasks WHERE id = $1', [req.params.id]);
  if (!taskRows[0]) return res.status(404).json({ error: 'Task not found' });
  const project = await loadProject(taskRows[0].project_id);
  if (!canContribute(req.user, project) && taskRows[0].assignee_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the team can comment' });
  }
  const { rows } = await query(
    `INSERT INTO task_comments (task_id, author_id, body) VALUES ($1, $2, $3) RETURNING *`,
    [req.params.id, req.user.id, body]
  );
  res.status(201).json({ comment: { ...rows[0], author_name: req.user.full_name } });
});

// --- Task dependencies (finish-to-start) --------------------------------------

router.post('/tasks/:id/dependencies', async (req, res) => {
  const dependsOn = req.body?.depends_on_task_id;
  if (!dependsOn) return res.status(400).json({ error: 'depends_on_task_id is required' });
  const { rows: pair } = await query(
    `SELECT id, project_id FROM tasks WHERE id = ANY(ARRAY[$1, $2]::uuid[])`,
    [req.params.id, dependsOn]
  );
  if (pair.length !== 2 || pair[0].project_id !== pair[1].project_id) {
    return res.status(400).json({ error: 'Both tasks must exist in the same project' });
  }
  const project = await loadProject(pair[0].project_id);
  if (!canContribute(req.user, project)) return res.status(403).json({ error: 'Only the team can edit dependencies' });

  // reject cycles: does `dependsOn` already (transitively) depend on this task?
  const { rows: cycle } = await query(
    `WITH RECURSIVE chain AS (
       SELECT depends_on_task_id FROM task_dependencies WHERE task_id = $1
       UNION
       SELECT d.depends_on_task_id FROM task_dependencies d JOIN chain c ON d.task_id = c.depends_on_task_id
     ) SELECT 1 FROM chain WHERE depends_on_task_id = $2 LIMIT 1`,
    [dependsOn, req.params.id]
  );
  if (cycle.length) return res.status(409).json({ error: 'That dependency would create a cycle' });

  try {
    await query(
      `INSERT INTO task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2)`,
      [req.params.id, dependsOn]
    );
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Dependency already exists' });
    if (err.code === '23514') return res.status(400).json({ error: 'A task cannot depend on itself' });
    throw err;
  }
  await logAudit(req, 'update', 'task', req.params.id, { after: { depends_on: dependsOn } });
  res.status(201).json({ ok: true });
});

router.delete('/tasks/:id/dependencies/:dependsOnId', async (req, res) => {
  const { rows: taskRows } = await query('SELECT project_id FROM tasks WHERE id = $1', [req.params.id]);
  if (!taskRows[0]) return res.status(404).json({ error: 'Task not found' });
  const project = await loadProject(taskRows[0].project_id);
  if (!canContribute(req.user, project)) return res.status(403).json({ error: 'Only the team can edit dependencies' });

  const { rows } = await query(
    `DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2 RETURNING task_id`,
    [req.params.id, req.params.dependsOnId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Dependency not found' });
  res.status(204).end();
});

export default router;
