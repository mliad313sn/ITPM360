import { Router } from 'express';
import { query } from '../db.js';
import { isGlobalAdmin, scopedBranchIds } from '../lib/rbac.js';

const router = Router();

// Aggregated portfolio stats, scoped to what the caller can see.
// ?branch_id=… narrows to a single branch (branch-level dashboard).
router.get('/summary', async (req, res) => {
  const params = [];
  const filters = [];
  if (!isGlobalAdmin(req.user)) {
    params.push(scopedBranchIds(req.user), req.user.id);
    filters.push(`(p.branch_id = ANY($1) OR p.project_manager_id = $2
      OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $2))`);
  }
  if (req.query.branch_id) {
    params.push(req.query.branch_id);
    filters.push(`p.branch_id = $${params.length}`);
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const [rag, status, byCountry, tasks, deadlines] = await Promise.all([
    query(`SELECT p.rag_status, count(*)::int FROM projects p ${where} GROUP BY p.rag_status`, params),
    query(`SELECT p.status, count(*)::int FROM projects p ${where} GROUP BY p.status`, params),
    query(
      `SELECT c.name AS country, p.rag_status, count(*)::int
       FROM projects p
       JOIN branches b ON b.id = p.branch_id
       JOIN countries c ON c.id = b.country_id
       ${where}
       GROUP BY c.name, p.rag_status ORDER BY c.name`,
      params
    ),
    query(
      `SELECT t.status, count(*)::int
       FROM tasks t JOIN projects p ON p.id = t.project_id
       ${where} GROUP BY t.status`,
      params
    ),
    query(
      `SELECT t.id, t.title, t.due_date, t.status, p.name AS project_name, p.id AS project_id,
              u.full_name AS assignee_name
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.assignee_id
       ${where ? `${where} AND` : 'WHERE'} t.status <> 'done' AND t.due_date IS NOT NULL
         AND t.due_date <= CURRENT_DATE + 14
       ORDER BY t.due_date LIMIT 12`,
      params
    ),
  ]);

  res.json({
    rag: Object.fromEntries(rag.rows.map((r) => [r.rag_status, r.count])),
    status: Object.fromEntries(status.rows.map((r) => [r.status, r.count])),
    by_country: byCountry.rows,
    task_status: Object.fromEntries(tasks.rows.map((r) => [r.status, r.count])),
    approaching_deadlines: deadlines.rows,
  });
});

export default router;
