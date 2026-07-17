import { Router } from 'express';
import { query } from '../db.js';
import { isGlobalAdmin, scopedBranchIds } from '../lib/rbac.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const escape = (v) => {
    if (v == null) return '';
    const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => escape(r[c])).join(','))].join('\n');
}

function scopeFilter(req, params, alias = 'p') {
  if (isGlobalAdmin(req.user)) return '';
  params.push(scopedBranchIds(req.user), req.user.id);
  return `WHERE (${alias}.branch_id = ANY($${params.length - 1}) OR ${alias}.project_manager_id = $${params.length}
    OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = ${alias}.id AND m.user_id = $${params.length}))`;
}

async function exportProjects(req) {
  const params = [];
  const where = scopeFilter(req, params);
  const { rows } = await query(
    `SELECT p.id, p.name, c.name AS country, b.name AS branch, b.code AS branch_code,
            pm.full_name AS project_manager, p.rag_status, p.status, p.start_date, p.end_date,
            p.budget, p.description, p.created_at, p.updated_at
     FROM projects p
     JOIN branches b ON b.id = p.branch_id
     JOIN countries c ON c.id = b.country_id
     JOIN users pm ON pm.id = p.project_manager_id
     ${where} ORDER BY c.name, b.name, p.name`,
    params
  );
  return rows;
}

async function exportTasks(req) {
  const params = [];
  const where = scopeFilter(req, params);
  const { rows } = await query(
    `SELECT t.id, p.name AS project, b.code AS branch_code, t.title, u.full_name AS assignee,
            t.status, t.priority, t.is_milestone, t.estimate_hours, t.start_date, t.due_date,
            t.completed_at, t.blocker_explanation, t.next_steps, t.created_at
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN branches b ON b.id = p.branch_id
     LEFT JOIN users u ON u.id = t.assignee_id
     ${where} ORDER BY p.name, t.sort_order`,
    params
  );
  return rows;
}

async function exportAudit(req) {
  if (!isGlobalAdmin(req.user)) return null;
  const { rows } = await query(
    `SELECT a.id, a.created_at, u.full_name AS actor, a.action, a.entity_type, a.entity_id, a.changes, a.ip_address
     FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC LIMIT 5000`
  );
  return rows;
}

const ENTITIES = { projects: exportProjects, tasks: exportTasks, 'audit-logs': exportAudit };

// GET /api/export/:entity?format=csv|json
router.get('/:entity', async (req, res) => {
  const fetcher = ENTITIES[req.params.entity];
  if (!fetcher) return res.status(404).json({ error: `Unknown export: ${req.params.entity}` });
  const rows = await fetcher(req);
  if (rows === null) return res.status(403).json({ error: 'Requires global admin role' });

  const format = req.query.format === 'csv' ? 'csv' : 'json';
  await logAudit(req, 'export', req.params.entity, null, { after: { format, rows: rows.length } });

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="itpm360-${req.params.entity}-${stamp}.csv"`);
    res.send(toCsv(rows));
  } else {
    res.setHeader('Content-Disposition', `attachment; filename="itpm360-${req.params.entity}-${stamp}.json"`);
    res.json({ exported_at: new Date().toISOString(), count: rows.length, [req.params.entity.replace('-', '_')]: rows });
  }
});

export default router;
