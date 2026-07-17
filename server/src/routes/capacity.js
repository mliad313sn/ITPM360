import { Router } from 'express';
import { query } from '../db.js';
import { isGlobalAdmin, scopedBranchIds } from '../lib/rbac.js';

const router = Router();

// Monday 00:00 UTC of the week containing `d`.
function weekStart(d) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7; // 0 = Monday
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}
const iso = (d) => d.toISOString().slice(0, 10);

// GET /api/capacity?weeks=8
// Per-person remaining workload bucketed by the week a task is due, versus
// each person's weekly capacity. Scoped to projects the caller can see.
router.get('/', async (req, res) => {
  const weeks = Math.min(Math.max(Number(req.query.weeks) || 8, 4), 16);
  const now = req.query.now ? new Date(req.query.now) : new Date();
  const firstMonday = weekStart(now);
  const weekStarts = Array.from({ length: weeks }, (_, i) => {
    const d = new Date(firstMonday);
    d.setUTCDate(d.getUTCDate() + i * 7);
    return iso(d);
  });
  const horizonEnd = new Date(firstMonday);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + weeks * 7);

  const params = [];
  const filters = [`t.assignee_id IS NOT NULL`, `t.status <> 'done'`];
  if (!isGlobalAdmin(req.user)) {
    params.push(scopedBranchIds(req.user), req.user.id);
    filters.push(`(p.branch_id = ANY($1) OR p.project_manager_id = $2
      OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $2))`);
  }

  const { rows: tasks } = await query(
    `SELECT t.assignee_id, t.estimate_hours, t.percent_complete, t.due_date,
            u.full_name, u.job_title, u.weekly_capacity_hours
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     JOIN users u ON u.id = t.assignee_id
     WHERE ${filters.join(' AND ')} AND u.is_active`,
    params
  );

  // Actual hours logged in the last 4 weeks, per user (scoped the same way).
  const { rows: logged } = await query(
    `SELECT e.user_id, COALESCE(sum(e.hours), 0)::float AS logged
     FROM time_entries e
     JOIN tasks t ON t.id = e.task_id
     JOIN projects p ON p.id = t.project_id
     WHERE e.work_date >= CURRENT_DATE - 28
       ${isGlobalAdmin(req.user)
         ? ''
         : `AND (p.branch_id = ANY($1) OR p.project_manager_id = $2
             OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $2))`}
     GROUP BY e.user_id`,
    isGlobalAdmin(req.user) ? [] : params.slice(0, 2)
  );
  const loggedBy = Object.fromEntries(logged.map((r) => [r.user_id, r.logged]));

  const people = new Map();
  const weekIndex = (due) => {
    const w = weekStart(new Date(due));
    const diffDays = Math.round((w - firstMonday) / 86_400_000);
    return Math.floor(diffDays / 7);
  };

  for (const t of tasks) {
    let person = people.get(t.assignee_id);
    if (!person) {
      person = {
        user_id: t.assignee_id,
        full_name: t.full_name,
        job_title: t.job_title,
        weekly_capacity: Number(t.weekly_capacity_hours),
        weeks: Array(weeks).fill(0),
        unscheduled_hours: 0,
        beyond_horizon_hours: 0,
        open_tasks: 0,
        total_remaining: 0,
        logged_recent: loggedBy[t.assignee_id] ?? 0,
      };
      people.set(t.assignee_id, person);
    }
    person.open_tasks += 1;
    const est = t.estimate_hours != null ? Number(t.estimate_hours) : 0;
    const remaining = est * (1 - Number(t.percent_complete) / 100);
    person.total_remaining += remaining;
    if (remaining <= 0) continue;
    if (!t.due_date) {
      person.unscheduled_hours += remaining;
    } else {
      const idx = weekIndex(t.due_date);
      if (idx < 0) person.weeks[0] += remaining; // overdue → this week
      else if (idx >= weeks) person.beyond_horizon_hours += remaining;
      else person.weeks[idx] += remaining;
    }
  }

  const round = (v) => Math.round(v * 10) / 10;
  const result = [...people.values()]
    .map((p) => ({
      ...p,
      weeks: p.weeks.map(round),
      unscheduled_hours: round(p.unscheduled_hours),
      beyond_horizon_hours: round(p.beyond_horizon_hours),
      total_remaining: round(p.total_remaining),
      logged_recent: round(p.logged_recent),
      // peak weekly utilization across the horizon (0-… as a ratio)
      peak_utilization: p.weekly_capacity > 0 ? round(Math.max(...p.weeks) / p.weekly_capacity) : null,
      overallocated_weeks: p.weeks.filter((h) => p.weekly_capacity > 0 && h > p.weekly_capacity).length,
    }))
    .sort((a, b) => (b.peak_utilization ?? 0) - (a.peak_utilization ?? 0));

  res.json({ week_starts: weekStarts, people: result });
});

export default router;
