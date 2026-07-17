import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken, requireAuth } from '../middleware/auth.js';
import { logAudit } from '../lib/audit.js';
import { generateSecret, otpauthUrl, verifyTotp } from '../lib/totp.js';

const router = Router();

router.post('/login', async (req, res) => {
  const { email, password, totp } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

  const { rows } = await query('SELECT * FROM users WHERE email = $1 AND is_active', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Second factor
  if (user.totp_enabled) {
    if (!totp) return res.status(401).json({ error: 'Authenticator code required', twofa_required: true });
    if (!verifyTotp(user.totp_secret, totp)) {
      return res.status(401).json({ error: 'Invalid authenticator code', twofa_required: true });
    }
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

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT totp_enabled FROM users WHERE id = $1', [req.user.id]);
  res.json({ user: { ...req.user, totp_enabled: rows[0]?.totp_enabled ?? false } });
});

// --- Two-factor (TOTP) enrolment ------------------------------------------

// Generate a fresh secret (not yet enabled) and return the otpauth URL.
router.post('/2fa/setup', requireAuth, async (req, res) => {
  const secret = generateSecret();
  await query('UPDATE users SET totp_secret = $1, totp_enabled = false WHERE id = $2', [secret, req.user.id]);
  res.json({ secret, otpauth_url: otpauthUrl(secret, req.user.email) });
});

// Confirm a code against the pending secret to enable 2FA.
router.post('/2fa/enable', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT totp_secret FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]?.totp_secret) return res.status(400).json({ error: 'Start setup first' });
  if (!verifyTotp(rows[0].totp_secret, req.body?.code)) return res.status(400).json({ error: 'Invalid code' });
  await query('UPDATE users SET totp_enabled = true WHERE id = $1', [req.user.id]);
  await logAudit(req, 'update', 'user', req.user.id, { after: { totp_enabled: true } });
  res.json({ ok: true });
});

// Disable 2FA (requires the current password).
router.post('/2fa/disable', requireAuth, async (req, res) => {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (!(await bcrypt.compare(req.body?.password ?? '', rows[0].password_hash))) {
    return res.status(401).json({ error: 'Password is incorrect' });
  }
  await query('UPDATE users SET totp_enabled = false, totp_secret = NULL WHERE id = $1', [req.user.id]);
  await logAudit(req, 'update', 'user', req.user.id, { after: { totp_enabled: false } });
  res.json({ ok: true });
});

export default router;
