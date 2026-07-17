import { Router } from 'express';
import { query } from '../db.js';
import { isGlobalAdmin, scopedBranchIds } from '../lib/rbac.js';
import { loadProject, canViewProject, canContribute } from '../lib/access.js';
import { buildAgenda } from '../lib/agenda.js';
import { logAudit } from '../lib/audit.js';
import { notifyUsers } from '../lib/notify.js';
import { emitEvent } from '../lib/webhooks.js';

const router = Router();

const MEETING_SELECT = `
  SELECT m.*, p.name AS project_name, p.rag_status, p.branch_id, b.name AS branch_name,
         cu.full_name AS created_by_name,
         COALESCE((SELECT json_agg(json_build_object(
             'user_id', a.user_id, 'full_name', au.full_name, 'attendance', a.attendance))
           FROM meeting_attendees a JOIN users au ON au.id = a.user_id
           WHERE a.meeting_id = m.id), '[]') AS attendees
  FROM meetings m
  JOIN projects p ON p.id = m.project_id
  JOIN branches b ON b.id = p.branch_id
  LEFT JOIN users cu ON cu.id = m.created_by
`;

async function fetchMeeting(id) {
  const { rows } = await query(`${MEETING_SELECT} WHERE m.id = $1`, [id]);
  return rows[0] ?? null;
}

// GET /api/meetings — meetings across all projects the caller can see
router.get('/meetings', async (req, res) => {
  const filters = [];
  const params = [];
  if (!isGlobalAdmin(req.user)) {
    params.push(scopedBranchIds(req.user), req.user.id);
    filters.push(`(p.branch_id = ANY($1) OR p.project_manager_id = $2
      OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p.id AND pm.user_id = $2))`);
  }
  if (req.query.project_id) {
    params.push(req.query.project_id);
    filters.push(`m.project_id = $${params.length}`);
  }
  if (req.query.upcoming === '1') filters.push(`m.status = 'scheduled'`);

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  const { rows } = await query(`${MEETING_SELECT} ${where} ORDER BY m.scheduled_at DESC`, params);
  res.json({ meetings: rows });
});

// POST /api/projects/:projectId/meetings
router.post('/projects/:projectId/meetings', async (req, res) => {
  const project = await loadProject(req.params.projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  if (!canContribute(req.user, project)) return res.status(403).json({ error: 'Only the team can schedule meetings' });

  const b = req.body ?? {};
  if (!b.title?.trim() || !b.scheduled_at) {
    return res.status(400).json({ error: 'title and scheduled_at are required' });
  }
  const { rows } = await query(
    `INSERT INTO meetings (project_id, title, scheduled_at, duration_minutes, location, meeting_link, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      req.params.projectId, b.title.trim(), b.scheduled_at,
      Number(b.duration_minutes) > 0 ? Number(b.duration_minutes) : 30,
      b.location?.trim() || null, b.meeting_link?.trim() || null, req.user.id,
    ]
  );
  const attendees = [...new Set([...(b.attendee_ids ?? []), req.user.id])];
  for (const userId of attendees) {
    await query(
      `INSERT INTO meeting_attendees (meeting_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [rows[0].id, userId]
    );
  }
  await logAudit(req, 'create', 'meeting', rows[0].id, { after: { title: b.title, project_id: req.params.projectId } });
  await notifyUsers(
    attendees.filter((id) => id !== req.user.id),
    'meeting_scheduled',
    `Meeting scheduled: ${b.title.trim()}`,
    `${project.name} — ${new Date(b.scheduled_at).toLocaleString('en', { dateStyle: 'medium', timeStyle: 'short' })}`,
    'meeting',
    rows[0].id
  );
  res.status(201).json({ meeting: await fetchMeeting(rows[0].id) });
});

// GET /api/meetings/:id — includes the agenda (live for open meetings, frozen snapshot otherwise)
router.get('/meetings/:id', async (req, res) => {
  const meeting = await fetchMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
  const project = await loadProject(meeting.project_id);
  if (!canViewProject(req.user, project)) return res.status(403).json({ error: 'No access to this meeting' });

  const agenda =
    meeting.status === 'completed' && meeting.agenda_snapshot
      ? meeting.agenda_snapshot
      : await buildAgenda(meeting.project_id);
  res.json({ meeting, agenda, agenda_frozen: meeting.status === 'completed' && !!meeting.agenda_snapshot });
});

// PATCH /api/meetings/:id — details, minutes, attendance
router.patch('/meetings/:id', async (req, res) => {
  const meeting = await fetchMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
  const project = await loadProject(meeting.project_id);
  if (!canContribute(req.user, project)) return res.status(403).json({ error: 'Only the team can update meetings' });

  const b = req.body ?? {};
  await query(
    `UPDATE meetings SET
       title = COALESCE($1, title),
       scheduled_at = COALESCE($2, scheduled_at),
       duration_minutes = COALESCE($3, duration_minutes),
       location = COALESCE($4, location),
       meeting_link = COALESCE($5, meeting_link),
       minutes = COALESCE($6, minutes),
       status = CASE WHEN $7 IN ('scheduled','in_progress','cancelled') THEN $7::meeting_status ELSE status END
     WHERE id = $8`,
    [b.title?.trim() || null, b.scheduled_at || null,
     Number(b.duration_minutes) > 0 ? Number(b.duration_minutes) : null,
     b.location?.trim() ?? null, b.meeting_link?.trim() ?? null, b.minutes ?? null,
     b.status ?? null, req.params.id]
  );

  if (Array.isArray(b.attendee_ids)) {
    await query('DELETE FROM meeting_attendees WHERE meeting_id = $1', [req.params.id]);
    for (const userId of new Set(b.attendee_ids)) {
      await query(
        `INSERT INTO meeting_attendees (meeting_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [req.params.id, userId]
      );
    }
  }
  await logAudit(req, 'update', 'meeting', req.params.id, null);
  res.json({ meeting: await fetchMeeting(req.params.id) });
});

// POST /api/meetings/:id/complete — freeze the agenda snapshot + save minutes
router.post('/meetings/:id/complete', async (req, res) => {
  const meeting = await fetchMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
  if (meeting.status === 'completed') return res.status(409).json({ error: 'Meeting is already completed' });
  const project = await loadProject(meeting.project_id);
  if (!canContribute(req.user, project)) return res.status(403).json({ error: 'Only the team can complete meetings' });

  const agenda = await buildAgenda(meeting.project_id);
  await query(
    `UPDATE meetings SET status = 'completed', agenda_snapshot = $1, minutes = COALESCE($2, minutes)
     WHERE id = $3`,
    [JSON.stringify(agenda), req.body?.minutes ?? null, req.params.id]
  );
  await logAudit(req, 'status_change', 'meeting', req.params.id, {
    before: { status: meeting.status }, after: { status: 'completed' },
  });
  emitEvent('meeting.completed', {
    meeting_id: req.params.id, title: meeting.title, project_id: meeting.project_id, agenda,
  });
  res.json({ meeting: await fetchMeeting(req.params.id), agenda, agenda_frozen: true });
});

// DELETE /api/meetings/:id
router.delete('/meetings/:id', async (req, res) => {
  const meeting = await fetchMeeting(req.params.id);
  if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
  const project = await loadProject(meeting.project_id);
  if (!canContribute(req.user, project)) return res.status(403).json({ error: 'Only the team can delete meetings' });

  await query('DELETE FROM meetings WHERE id = $1', [req.params.id]);
  await logAudit(req, 'delete', 'meeting', req.params.id, { before: { title: meeting.title } });
  res.status(204).end();
});

export default router;
