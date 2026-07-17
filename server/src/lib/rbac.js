export const isGlobalAdmin = (user) => user.roles.some((r) => r.role === 'global_admin');

export const hasBranchRole = (user, branchId, ...roles) =>
  user.roles.some((r) => r.branch_id === branchId && roles.includes(r.role));

// Branches the user has any role in (empty for global admins — they see all)
export const scopedBranchIds = (user) =>
  [...new Set(user.roles.filter((r) => r.branch_id).map((r) => r.branch_id))];

export function requireGlobalAdmin(req, res, next) {
  if (!isGlobalAdmin(req.user)) {
    return res.status(403).json({ error: 'Requires global admin role' });
  }
  next();
}

// Can the user manage (create/update/delete) resources in a branch?
export const canManageBranch = (user, branchId) =>
  isGlobalAdmin(user) || hasBranchRole(user, branchId, 'branch_manager');

// Can the user manage a given project row?
export const canManageProject = (user, project) =>
  isGlobalAdmin(user) ||
  hasBranchRole(user, project.branch_id, 'branch_manager') ||
  project.project_manager_id === user.id;
