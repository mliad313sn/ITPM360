import { query } from '../db.js';

// Append-only audit trail. `changes` is { before, after } of changed fields.
export async function logAudit(req, action, entityType, entityId, changes = null) {
  await query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, changes, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [req.user?.id ?? null, action, entityType, entityId, changes ? JSON.stringify(changes) : null, req.ip]
  );
}

// Diff helper: returns { before, after } limited to fields that actually changed.
export function diff(before, after) {
  const changed = { before: {}, after: {} };
  for (const key of Object.keys(after)) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
      changed.before[key] = before[key] ?? null;
      changed.after[key] = after[key];
    }
  }
  return Object.keys(changed.after).length ? changed : null;
}
