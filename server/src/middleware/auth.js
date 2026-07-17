import jwt from 'jsonwebtoken';
import { query } from '../db.js';

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export function signToken(userId) {
  return jwt.sign({ sub: userId }, SECRET, { expiresIn: '12h' });
}

// Attaches req.user = { id, email, full_name, roles: [{ role, branch_id }] }
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  let sub;
  try {
    ({ sub } = jwt.verify(token, SECRET));
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const { rows } = await query(
    `SELECT u.id, u.email, u.full_name, u.job_title, u.is_active,
            COALESCE(json_agg(json_build_object('role', r.role, 'branch_id', r.branch_id))
                     FILTER (WHERE r.id IS NOT NULL), '[]') AS roles
     FROM users u
     LEFT JOIN user_roles r ON r.user_id = u.id
     WHERE u.id = $1
     GROUP BY u.id`,
    [sub]
  );
  const user = rows[0];
  if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid session' });

  req.user = user;
  next();
}
