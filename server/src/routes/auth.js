import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const { rows } = await query('SELECT * FROM users WHERE email = $1 AND is_active', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, ip_address)
     VALUES ($1, 'login', 'user', $1, $2)`,
    [user.id, req.ip]
  );

  const { rows: roleRows } = await query(
    `SELECT role, branch_id FROM user_roles WHERE user_id = $1`,
    [user.id]
  );

  res.json({
    token: signToken(user.id),
    user: {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      job_title: user.job_title,
      roles: roleRows,
    },
  });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
