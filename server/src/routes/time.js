import { Router } from 'express';
import { query } from '../db.js';
import { loadProject, canViewProject, canContribute } from '../lib/access.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

// GET /api/tasks/:id/time — entries + total for a task
router.get('/tasks/:id/time', async (req, res) => {
  const { rows: taskRows } = await query('SELECT project_id FROM tasks WHERE id = $1', [req.params.id]);
  if (!taskRows[0]) return res.status(404).json({ error: 'Task not found' });
  const project = await loadProject(taskRows[0].project_id);
  if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'No access' });

  const { rows } = await query(
    `SELECT e.*, u.full_name AS user_name FROM time_entries e
     JOIN users u ON u.id = e.user_id
     WHERE e.task_id = $1 ORDER BY e.work_date DESC, e.created_at DESC`,
    [req.params.id]
  );
  const total = rows.reduce((n, r) => n + Number(r.hours), 0);
  res.json({ entries: rows, total_hours: total });
});

// POST /api/tasks/:id/time — log hours (team members and the assignee)
router.post('/tasks/:id/time', async (req, res) => {
  const { rows: taskRows } = await query('SELECT project_id, assignee_id FROM tasks WHERE id = $1', [req.params.id]);
  if (!taskRows[0]) return res.status(404).json({ error: 'Task not found' });
  const project = await loadProject(taskRows[0].project_id);
  if (!canContribute(req.user, project) && taskRows[0].assignee_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the team or the assignee can log time' });
  }

  const b = req.body ?? {};
  const hours = Number(b.hours);
  if (!(hours > 0 && hours <= 24)) return res.status(400).json({ error: 'hours must be between 0 and 24' });

  const { rows } = await query(
    `INSERT INTO time_entries (task_id, user_id, hours, work_date, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.params.id, req.user.id, hours, b.work_date || new Date().toISOString().slice(0, 10), b.notes?.trim() || null]
  );
  await logAudit(req, 'create', 'time_entry', rows[0].id, { after: { task_id: req.params.id, hours } });
  res.status(201).json({ entry: { ...rows[0], user_name: req.user.full_name } });
});

// DELETE /api/time/:id — remove an entry (author or a project manager)
router.delete('/time/:id', async (req, res) => {
  const { rows: entryRows } = await query(
    `SELECT e.*, t.project_id FROM time_entries e JOIN tasks t ON t.id = e.task_id WHERE e.id = $1`,
    [req.params.id]
  );
  const entry = entryRows[0];
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  const project = await loadProject(entry.project_id);
  if (entry.user_id !== req.user.id && !canContribute(req.user, project)) {
    return res.status(403).json({ error: 'You can only delete your own time entries' });
  }
  await query('DELETE FROM time_entries WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

export default router;
