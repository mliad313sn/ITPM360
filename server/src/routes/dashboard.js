import { Router } from 'express';
import { query } from '../db.js';
import { isGlobalAdmin, scopedBranchIds } from '../lib/rbac.js';
import { computeEvm, indexHealth } from '../lib/evm.js';

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

  const [rag, status, byCountry, tasks, deadlines, risks] = await Promise.all([
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
    query(
      `SELECT count(*) FILTER (WHERE r.status IN ('open','mitigating'))::int AS open,
              count(*) FILTER (WHERE r.status IN ('open','mitigating') AND r.severity >= 12)::int AS high
       FROM risks r JOIN projects p ON p.id = r.project_id ${where}`,
      params
    ),
  ]);

  // Portfolio EVM control table: per-project SPI/CPI/completion for the datapine-style rollup.
  const { rows: evmRows } = await query(
    `SELECT p.id, p.name, p.rag_status, p.status, p.budget, p.actual_cost, p.start_date, p.end_date,
            COALESCE((SELECT json_agg(json_build_object('percent_complete', t.percent_complete, 'estimate_hours', t.estimate_hours))
              FROM tasks t WHERE t.project_id = p.id), '[]') AS task_progress
     FROM projects p ${where} ORDER BY p.name`,
    params
  );
  const portfolio = evmRows.map((p) => {
    const evm = computeEvm({
      budget: p.budget, actual_cost: p.actual_cost, start_date: p.start_date, end_date: p.end_date,
      tasks: p.task_progress,
    });
    return {
      id: p.id, name: p.name, rag_status: p.rag_status, status: p.status,
      percent_complete: evm.percent_complete, spi: evm.spi, cpi: evm.cpi,
      budget: evm.bac, actual_cost: evm.ac, vac: evm.vac,
      schedule_health: indexHealth(evm.spi), cost_health: indexHealth(evm.cpi),
    };
  });

  // Portfolio budget rollup
  const totalBudget = portfolio.reduce((n, p) => n + (p.budget ?? 0), 0);
  const totalActual = portfolio.reduce((n, p) => n + (p.actual_cost ?? 0), 0);
  const totalEac = portfolio.reduce((n, p) => n + (p.budget != null && p.cpi ? p.budget / p.cpi : p.budget ?? 0), 0);
  const withProgress = portfolio.filter((p) => p.percent_complete != null);
  const avgProgress = withProgress.length
    ? Math.round(withProgress.reduce((n, p) => n + p.percent_complete, 0) / withProgress.length)
    : 0;

  const active = portfolio.filter((p) => !['completed', 'cancelled'].includes(p.status));
  const kpis = {
    total: portfolio.length,
    on_track: active.filter((p) => p.rag_status === 'green').length,
    at_risk: active.filter((p) => p.rag_status === 'amber').length,
    delayed: active.filter((p) => p.rag_status === 'red').length,
    avg_progress: avgProgress,
    total_budget: totalBudget || null,
    budget_variance: totalBudget ? Math.round(totalBudget - totalEac) : null, // BAC − EAC (VAC)
  };

  res.json({
    rag: Object.fromEntries(rag.rows.map((r) => [r.rag_status, r.count])),
    status: Object.fromEntries(status.rows.map((r) => [r.status, r.count])),
    by_country: byCountry.rows,
    task_status: Object.fromEntries(tasks.rows.map((r) => [r.status, r.count])),
    approaching_deadlines: deadlines.rows,
    risks: risks.rows[0],
    kpis,
    portfolio,
  });
});

export default router;
