import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { requireGlobalAdmin } from '../lib/rbac.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

const ROLES = ['global_admin', 'branch_manager', 'project_manager', 'viewer'];

// Any authenticated user may list users (needed for PM/member/assignee pickers)
router.get('/', async (_req, res) => {
  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.job_title, u.is_active, u.created_at, u.weekly_capacity_hours,
            COALESCE(json_agg(json_build_object('id', r.id, 'role', r.role, 'branch_id', r.branch_id, 'branch_name', b.name))
                     FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
     FROM users u
     LEFT JOIN user_roles r ON r.user_id = u.id
     LEFT JOIN branches b ON b.id = r.branch_id
     GROUP BY u.id ORDER BY u.full_name`
  );
  res.json({ users: rows });
});

router.post('/', requireGlobalAdmin, async (req, res) => {
  const { email, full_name, password, job_title } = req.body ?? {};
  if (!email?.includes('@') || !full_name?.trim() || (password ?? '').length < 8) {
    return res.status(400).json({ error: 'Valid email, full_name and a password of 8+ characters are required' });
  }
  try {
    const { rows } = await query(
      `INSERT INTO users (email, full_name, password_hash, job_title)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, full_name, job_title, is_active, created_at`,
      [email.trim(), full_name.trim(), await bcrypt.hash(password, 10), job_title?.trim() || null]
    );
    await logAudit(req, 'create', 'user', rows[0].id, { after: { email, full_name, job_title } });
    res.status(201).json({ user: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A user with this email already exists' });
    throw err;
  }
});

router.patch('/:id', requireGlobalAdmin, async (req, res) => {
  const { rows: existing } = await query('SELECT * FROM users WHERE id = $1', [req.params.id]);
  if (!existing[0]) return res.status(404).json({ error: 'User not found' });

  const next = {
    full_name: req.body?.full_name?.trim() || existing[0].full_name,
    job_title: req.body?.job_title !== undefined ? req.body.job_title?.trim() || null : existing[0].job_title,
    is_active: typeof req.body?.is_active === 'boolean' ? req.body.is_active : existing[0].is_active,
    weekly_capacity_hours:
      req.body?.weekly_capacity_hours !== undefined && Number(req.body.weekly_capacity_hours) >= 0
        ? Number(req.body.weekly_capacity_hours)
        : existing[0].weekly_capacity_hours,
  };
  const { rows } = await query(
    `UPDATE users SET full_name = $1, job_title = $2, is_active = $3, weekly_capacity_hours = $4
     WHERE id = $5 RETURNING id, email, full_name, job_title, is_active, weekly_capacity_hours`,
    [next.full_name, next.job_title, next.is_active, next.weekly_capacity_hours, req.params.id]
  );
  await logAudit(req, 'update', 'user', req.params.id, {
    before: { full_name: existing[0].full_name, job_title: existing[0].job_title, is_active: existing[0].is_active },
    after: next,
  });
  res.json({ user: rows[0] });
});

// Role assignment
router.post('/:id/roles', requireGlobalAdmin, async (req, res) => {
  const { role, branch_id } = req.body ?? {};
  if (!ROLES.includes(role)) return res.status(400).json({ error: `role must be one of: ${ROLES.join(', ')}` });
  if (role !== 'global_admin' && !branch_id) return res.status(400).json({ error: 'branch_id is required for branch-scoped roles' });

  try {
    const { rows } = await query(
      `INSERT INTO user_roles (user_id, role, branch_id) VALUES ($1, $2, $3) RETURNING *`,
      [req.params.id, role, role === 'global_admin' ? null : branch_id]
    );
    await logAudit(req, 'create', 'user_role', rows[0].id, { after: { user_id: req.params.id, role, branch_id } });
    res.status(201).json({ role: rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'User already holds this role at this scope' });
    if (err.code === '23503') return res.status(400).json({ error: 'Unknown user or branch' });
    throw err;
  }
});

router.delete('/:id/roles/:roleId', requireGlobalAdmin, async (req, res) => {
  const { rows } = await query(
    `DELETE FROM user_roles WHERE id = $1 AND user_id = $2 RETURNING *`,
    [req.params.roleId, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Role assignment not found' });
  await logAudit(req, 'delete', 'user_role', rows[0].id, { before: rows[0] });
  res.status(204).end();
});

export default router;
