import { createHmac } from 'node:crypto';
import { query } from '../db.js';

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 2_000, 8_000];

// Fire an event to all active subscriptions listening for it.
// Fire-and-forget: never blocks or fails the originating request.
export function emitEvent(event, payload) {
  dispatch(event, payload).catch((err) => console.error(`webhook dispatch failed for ${event}:`, err.message));
}

async function dispatch(event, payload) {
  const { rows: subs } = await query(
    `SELECT * FROM webhook_subscriptions WHERE is_active AND $1 = ANY(events)`,
    [event]
  );
  await Promise.allSettled(subs.map((sub) => deliver(sub, event, payload)));
}

async function deliver(sub, event, payload) {
  const body = JSON.stringify({ event, occurred_at: new Date().toISOString(), data: payload });
  const signature = createHmac('sha256', sub.secret).update(body).digest('hex');

  const { rows } = await query(
    `INSERT INTO webhook_deliveries (subscription_id, event, payload) VALUES ($1, $2, $3) RETURNING id`,
    [sub.id, event, body]
  );
  const deliveryId = rows[0].id;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (BACKOFF_MS[attempt - 1]) await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt - 1]));
    let status = null;
    try {
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ITPM360-Event': event,
          'X-ITPM360-Signature': `sha256=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      status = res.status;
    } catch {
      status = 0; // network error
    }
    await query(
      `UPDATE webhook_deliveries
       SET attempts = $1, response_status = $2,
           delivered_at = CASE WHEN $2 BETWEEN 200 AND 299 THEN now() ELSE delivered_at END
       WHERE id = $3`,
      [attempt, status, deliveryId]
    );
    if (status >= 200 && status < 300) return;
  }
}

export const WEBHOOK_EVENTS = [
  'project.created',
  'project.rag_changed',
  'project.status_changed',
  'task.blocked',
  'task.assigned',
  'risk.raised',
  'meeting.completed',
];
