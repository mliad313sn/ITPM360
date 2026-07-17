import { query } from '../db.js';
import { isGlobalAdmin, scopedBranchIds, canManageProject } from './rbac.js';

// Load a project row plus member ids, or null.
export async function loadProject(projectId) {
  const { rows } = await query(
    `SELECT p.*, COALESCE(array_agg(m.user_id) FILTER (WHERE m.user_id IS NOT NULL), '{}') AS member_ids
     FROM projects p LEFT JOIN project_members m ON m.project_id = p.id
     WHERE p.id = $1 GROUP BY p.id`,
    [projectId]
  );
  return rows[0] ?? null;
}

export const canViewProject = (user, project) =>
  isGlobalAdmin(user) ||
  scopedBranchIds(user).includes(project.branch_id) ||
  project.project_manager_id === user.id ||
  project.member_ids.includes(user.id);

// Team members can work on tasks; managers can do everything.
export const canContribute = (user, project) =>
  canManageProject(user, project) || project.member_ids.includes(user.id);

export { canManageProject };
