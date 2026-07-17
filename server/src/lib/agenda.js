import { query } from '../db.js';

// Build the live meeting agenda for a project: current RAG, blocked tasks
// (with reasons), next steps, overdue tasks, open GRC checkpoints and top risks.
export async function buildAgenda(projectId) {
  const [{ rows: projectRows }, { rows: blocked }, { rows: nextSteps }, { rows: overdue }, { rows: grc }, { rows: risks }] =
    await Promise.all([
      query(`SELECT id, name, rag_status, status FROM projects WHERE id = $1`, [projectId]),
      query(
        `SELECT t.id, t.title, t.blocker_explanation, u.full_name AS assignee_name
         FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
         WHERE t.project_id = $1 AND t.status = 'blocked'
         ORDER BY t.priority DESC, t.due_date NULLS LAST`,
        [projectId]
      ),
      query(
        `SELECT t.id, t.title, t.next_steps, t.status, u.full_name AS assignee_name
         FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
         WHERE t.project_id = $1 AND t.next_steps IS NOT NULL AND t.status <> 'done'
         ORDER BY t.due_date NULLS LAST`,
        [projectId]
      ),
      query(
        `SELECT t.id, t.title, t.due_date, u.full_name AS assignee_name
         FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
         WHERE t.project_id = $1 AND t.status NOT IN ('done', 'blocked') AND t.due_date < CURRENT_DATE
         ORDER BY t.due_date`,
        [projectId]
      ),
      query(
        `SELECT id, title, checkpoint_type, status, due_date
         FROM grc_checkpoints
         WHERE project_id = $1 AND status IN ('pending', 'in_review')
         ORDER BY due_date NULLS LAST`,
        [projectId]
      ),
      query(
        `SELECT r.id, r.title, r.category, r.severity, r.likelihood, r.impact, r.status,
                r.mitigation_plan, u.full_name AS owner_name
         FROM risks r LEFT JOIN users u ON u.id = r.owner_id
         WHERE r.project_id = $1 AND r.status IN ('open', 'mitigating')
         ORDER BY r.severity DESC, r.created_at
         LIMIT 5`,
        [projectId]
      ),
    ]);

  const project = projectRows[0];
  return {
    generated_at: new Date().toISOString(),
    rag_status: project.rag_status,
    project_status: project.status,
    blocked_tasks: blocked,
    next_steps: nextSteps,
    overdue_tasks: overdue,
    open_grc_checkpoints: grc,
    top_risks: risks,
  };
}
