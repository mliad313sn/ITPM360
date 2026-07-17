import { query } from '../db.js';

// Insert in-app notifications for a set of users (deduplicated).
export async function notifyUsers(userIds, type, title, body, entityType = null, entityId = null) {
  const unique = [...new Set(userIds)].filter(Boolean);
  for (const userId of unique) {
    await query(
      `INSERT INTO notifications (user_id, type, title, body, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, type, title, body, entityType, entityId]
    );
  }
  return unique.length;
}

// The people accountable for a project: its PM + branch managers of its branch.
export async function projectStakeholders(project) {
  const { rows } = await query(
    `SELECT user_id FROM user_roles WHERE branch_id = $1 AND role = 'branch_manager'`,
    [project.branch_id]
  );
  return [project.project_manager_id, ...rows.map((r) => r.user_id)];
}

export const RAG_RANK = { green: 0, amber: 1, red: 2 };
export const isRagDowngrade = (from, to) => RAG_RANK[to] > RAG_RANK[from];
