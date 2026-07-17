import { query } from '../db.js';
import { notifyUsers } from './notify.js';
import { captureEvmSnapshots } from './evm.js';

// Periodic scan: warn assignees about tasks due within 3 days (or overdue),
// and PMs about GRC checkpoints due within 7 days. Deduplicates by skipping
// entities already notified in the last 3 days.
export async function runDeadlineScan() {
  let created = 0;

  const { rows: tasks } = await query(
    `SELECT t.id, t.title, t.due_date, t.assignee_id, p.name AS project_name
     FROM tasks t
     JOIN projects p ON p.id = t.project_id
     WHERE t.status NOT IN ('done') AND t.assignee_id IS NOT NULL
       AND t.due_date IS NOT NULL AND t.due_date <= CURRENT_DATE + 3
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.entity_id = t.id AND n.type = 'deadline_approaching'
           AND n.created_at > now() - interval '3 days'
       )`
  );
  for (const t of tasks) {
    const overdue = new Date(t.due_date) < new Date();
    created += await notifyUsers(
      [t.assignee_id],
      'deadline_approaching',
      overdue ? `Task overdue: ${t.title}` : `Deadline approaching: ${t.title}`,
      `${t.project_name} — due ${t.due_date.toISOString().slice(0, 10)}`,
      'task',
      t.id
    );
  }

  const { rows: checkpoints } = await query(
    `SELECT g.id, g.title, g.due_date, g.checkpoint_type, p.name AS project_name, p.project_manager_id
     FROM grc_checkpoints g
     JOIN projects p ON p.id = g.project_id
     WHERE g.status IN ('pending', 'in_review')
       AND g.due_date IS NOT NULL AND g.due_date <= CURRENT_DATE + 7
       AND NOT EXISTS (
         SELECT 1 FROM notifications n
         WHERE n.entity_id = g.id AND n.type = 'grc_checkpoint_due'
           AND n.created_at > now() - interval '3 days'
       )`
  );
  for (const g of checkpoints) {
    created += await notifyUsers(
      [g.project_manager_id],
      'grc_checkpoint_due',
      `GRC checkpoint due: ${g.title}`,
      `${g.project_name} — ${g.checkpoint_type} gate due ${g.due_date.toISOString().slice(0, 10)}`,
      'grc_checkpoint',
      g.id
    );
  }

  return created;
}

async function tick() {
  await runDeadlineScan().catch((err) => console.error('deadline scan failed:', err.message));
  await captureEvmSnapshots().catch((err) => console.error('evm snapshot failed:', err.message));
}

export function startDeadlineScanner(intervalMs = 60 * 60 * 1000) {
  tick();
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return timer;
}
