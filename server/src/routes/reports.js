import { Router } from 'express';
import pptxgen from 'pptxgenjs';
import { query } from '../db.js';
import { isGlobalAdmin, scopedBranchIds } from '../lib/rbac.js';
import { logAudit } from '../lib/audit.js';
import { computeEvm } from '../lib/evm.js';

const router = Router();

const RAG_COLORS = { green: '0CA30C', amber: 'FAB219', red: 'D03B3B' };
const INK = '0B0B0B';
const MUTED = '52514E';
const BRAND = '4F46E5';

function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) return null;
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end, label: start.toLocaleString('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
}

// GET /api/reports/monthly?month=YYYY-MM[&branch_id=…] → .pptx download
router.get('/monthly', async (req, res) => {
  const month = req.query.month ?? new Date().toISOString().slice(0, 7);
  const range = monthRange(month);
  if (!range) return res.status(400).json({ error: 'month must be YYYY-MM' });

  const params = [];
  const filters = [];
  if (!isGlobalAdmin(req.user)) {
    params.push(scopedBranchIds(req.user), req.user.id);
    filters.push(`(p.branch_id = ANY($1) OR p.project_manager_id = $2
      OR EXISTS (SELECT 1 FROM project_members m WHERE m.project_id = p.id AND m.user_id = $2))`);
  }
  let scopeLabel = 'Global portfolio';
  if (req.query.branch_id) {
    params.push(req.query.branch_id);
    filters.push(`p.branch_id = $${params.length}`);
    const { rows } = await query('SELECT name FROM branches WHERE id = $1', [req.query.branch_id]);
    scopeLabel = rows[0] ? `${rows[0].name} branch` : 'Branch';
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const { rows: projects } = await query(
    `SELECT p.*, b.name AS branch_name, c.name AS country_name, pm.full_name AS pm_name,
       (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id) AS task_total,
       (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS task_done,
       COALESCE((SELECT json_agg(json_build_object('title', t.title, 'reason', t.blocker_explanation, 'assignee', u.full_name))
         FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
         WHERE t.project_id = p.id AND t.status = 'blocked'), '[]') AS blocked,
       COALESCE((SELECT json_agg(json_build_object('title', t.title, 'next', t.next_steps))
         FROM tasks t WHERE t.project_id = p.id AND t.next_steps IS NOT NULL AND t.status <> 'done'), '[]') AS next_steps,
       (SELECT count(*)::int FROM tasks t WHERE t.project_id = p.id AND t.completed_at >= $${params.length + 1} AND t.completed_at < $${params.length + 2}) AS done_this_month,
       (SELECT count(*)::int FROM meetings mt WHERE mt.project_id = p.id AND mt.scheduled_at >= $${params.length + 1} AND mt.scheduled_at < $${params.length + 2}) AS meetings_this_month,
       COALESCE((SELECT json_agg(json_build_object('type', g.checkpoint_type, 'title', g.title, 'status', g.status))
         FROM grc_checkpoints g WHERE g.project_id = p.id AND g.status IN ('pending','in_review')), '[]') AS open_grc,
       COALESCE((SELECT json_agg(json_build_object('title', r.title, 'severity', r.severity, 'status', r.status) ORDER BY r.severity DESC)
         FROM risks r WHERE r.project_id = p.id AND r.status IN ('open','mitigating')), '[]') AS open_risks,
       COALESCE((SELECT json_agg(json_build_object('percent_complete', t.percent_complete, 'estimate_hours', t.estimate_hours))
         FROM tasks t WHERE t.project_id = p.id), '[]') AS task_progress
     FROM projects p
     JOIN branches b ON b.id = p.branch_id
     JOIN countries c ON c.id = b.country_id
     JOIN users pm ON pm.id = p.project_manager_id
     ${where}
     ORDER BY c.name, b.name, p.name`,
    [...params, range.start, range.end]
  );

  for (const p of projects) {
    p.evm = computeEvm({
      budget: p.budget, actual_cost: p.actual_cost, start_date: p.start_date, end_date: p.end_date,
      tasks: p.task_progress,
    });
  }
  const fmtIndex = (v) => (v == null ? 'n/a' : v.toFixed(2));

  const pptx = new pptxgen();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  // --- Title slide
  const title = pptx.addSlide();
  title.background = { color: 'F8FAFC' };
  title.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.25, fill: { color: BRAND } });
  title.addText('ITPM360 Monthly Report', { x: 0.8, y: 2.4, w: 11.7, h: 1, fontSize: 40, bold: true, color: INK });
  title.addText(`${range.label} — ${scopeLabel}`, { x: 0.8, y: 3.5, w: 11.7, h: 0.6, fontSize: 22, color: MUTED });
  title.addText(
    `Generated ${new Date().toISOString().slice(0, 10)} · ${projects.length} projects in scope`,
    { x: 0.8, y: 6.6, w: 11.7, h: 0.4, fontSize: 12, color: MUTED }
  );

  // --- Portfolio summary slide
  const rag = { green: 0, amber: 0, red: 0 };
  for (const p of projects) rag[p.rag_status]++;
  const blockedTotal = projects.reduce((n, p) => n + p.blocked.length, 0);

  const sum = pptx.addSlide();
  sum.background = { color: 'FFFFFF' };
  sum.addText('Portfolio health', { x: 0.6, y: 0.4, w: 12, h: 0.6, fontSize: 26, bold: true, color: INK });
  const tiles = [
    { label: 'Projects', value: String(projects.length), color: BRAND },
    { label: 'Green', value: String(rag.green), color: RAG_COLORS.green },
    { label: 'Amber', value: String(rag.amber), color: RAG_COLORS.amber },
    { label: 'Red', value: String(rag.red), color: RAG_COLORS.red },
    { label: 'Blocked tasks', value: String(blockedTotal), color: 'D03B3B' },
  ];
  tiles.forEach((t, i) => {
    const x = 0.6 + i * 2.5;
    sum.addShape('roundRect', { x, y: 1.3, w: 2.25, h: 1.7, rectRadius: 0.08, fill: { color: 'F8FAFC' }, line: { color: 'E2E8F0', width: 1 } });
    sum.addText(t.value, { x, y: 1.45, w: 2.25, h: 0.9, align: 'center', fontSize: 36, bold: true, color: t.color });
    sum.addText(t.label, { x, y: 2.4, w: 2.25, h: 0.4, align: 'center', fontSize: 13, color: MUTED });
  });
  if (projects.length) {
    const rows = [
      [
        { text: 'Project', options: { bold: true } }, { text: 'Branch', options: { bold: true } },
        { text: 'RAG', options: { bold: true } }, { text: 'Compl.', options: { bold: true } },
        { text: 'SPI', options: { bold: true } }, { text: 'CPI', options: { bold: true } },
        { text: 'VAC', options: { bold: true } },
      ],
      ...projects.map((p) => [
        p.name, `${p.branch_name} (${p.country_name})`,
        { text: p.rag_status.toUpperCase(), options: { color: RAG_COLORS[p.rag_status], bold: true } },
        p.evm.percent_complete != null ? `${Math.round(p.evm.percent_complete)}%` : '—',
        { text: fmtIndex(p.evm.spi), options: { color: p.evm.spi != null && p.evm.spi < 0.9 ? 'D03B3B' : INK } },
        { text: fmtIndex(p.evm.cpi), options: { color: p.evm.cpi != null && p.evm.cpi < 0.9 ? 'D03B3B' : INK } },
        { text: p.evm.vac != null ? Math.round(p.evm.vac).toLocaleString() : '—',
          options: { color: p.evm.vac != null && p.evm.vac < 0 ? 'D03B3B' : INK } },
      ]),
    ];
    sum.addTable(rows, {
      x: 0.6, y: 3.4, w: 12.1, fontSize: 11, color: INK,
      border: { type: 'solid', color: 'E2E8F0', pt: 0.5 }, fill: { color: 'FFFFFF' },
      rowH: 0.32, valign: 'middle',
    });
  }

  // --- One slide per project
  for (const p of projects) {
    const s = pptx.addSlide();
    s.background = { color: 'FFFFFF' };
    s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.18, fill: { color: RAG_COLORS[p.rag_status] } });
    s.addText(p.name, { x: 0.6, y: 0.4, w: 9.5, h: 0.6, fontSize: 24, bold: true, color: INK });
    s.addText(
      `${p.branch_name} · ${p.country_name} · PM ${p.pm_name}`,
      { x: 0.6, y: 1.0, w: 9.5, h: 0.4, fontSize: 13, color: MUTED }
    );
    s.addShape('roundRect', { x: 10.6, y: 0.45, w: 2.1, h: 0.55, rectRadius: 0.27, fill: { color: RAG_COLORS[p.rag_status] } });
    s.addText(p.rag_status.toUpperCase(), { x: 10.6, y: 0.45, w: 2.1, h: 0.55, align: 'center', fontSize: 16, bold: true, color: 'FFFFFF' });

    const progress = p.evm.percent_complete != null ? Math.round(p.evm.percent_complete) : 0;
    const facts = [
      `Lifecycle: ${p.status.replace('_', ' ')}`,
      `Timeline: ${p.start_date?.toISOString().slice(0, 10) ?? '—'} → ${p.end_date?.toISOString().slice(0, 10) ?? '—'}`,
      `Earned value: SPI ${fmtIndex(p.evm.spi)} · CPI ${fmtIndex(p.evm.cpi)} · ${progress}% complete`,
      `Budget ${p.budget ? Number(p.budget).toLocaleString() : '—'} · EAC ${p.evm.eac != null ? Math.round(p.evm.eac).toLocaleString() : '—'} · VAC ${p.evm.vac != null ? Math.round(p.evm.vac).toLocaleString() : '—'}`,
      `Completed this month: ${p.done_this_month} · Meetings held: ${p.meetings_this_month}`,
    ];
    s.addText(facts.join('\n'), { x: 0.6, y: 1.7, w: 5.9, h: 1.7, fontSize: 13, color: INK, lineSpacing: 22 });

    // progress bar
    s.addShape('roundRect', { x: 0.6, y: 3.5, w: 5.9, h: 0.3, rectRadius: 0.1, fill: { color: 'E2E8F0' } });
    if (progress > 0) {
      s.addShape('roundRect', { x: 0.6, y: 3.5, w: Math.max(0.3, 5.9 * (progress / 100)), h: 0.3, rectRadius: 0.1, fill: { color: BRAND } });
    }

    s.addText('Blockers', { x: 0.6, y: 4.1, w: 5.9, h: 0.4, fontSize: 15, bold: true, color: 'D03B3B' });
    s.addText(
      p.blocked.length
        ? p.blocked.map((b) => `• ${b.title} — ${b.reason} (${b.assignee ?? 'unassigned'})`).join('\n')
        : 'No blocked tasks.',
      { x: 0.6, y: 4.55, w: 5.9, h: 2.5, fontSize: 11.5, color: INK, valign: 'top', lineSpacing: 16 }
    );

    s.addText('Next steps', { x: 6.9, y: 1.7, w: 5.8, h: 0.4, fontSize: 15, bold: true, color: BRAND });
    s.addText(
      p.next_steps.length
        ? p.next_steps.map((n) => `• ${n.title}: ${n.next}`).join('\n')
        : 'No recorded next steps.',
      { x: 6.9, y: 2.15, w: 5.8, h: 2.4, fontSize: 11.5, color: INK, valign: 'top', lineSpacing: 16 }
    );
    s.addText('Open GRC checkpoints', { x: 6.9, y: 4.1, w: 5.8, h: 0.4, fontSize: 15, bold: true, color: INK });
    s.addText(
      p.open_grc.length
        ? p.open_grc.map((g) => `• [${g.type}] ${g.title} — ${g.status.replace('_', ' ')}`).join('\n')
        : 'All checkpoints decided.',
      { x: 6.9, y: 4.55, w: 5.8, h: 1.15, fontSize: 11.5, color: INK, valign: 'top', lineSpacing: 16 }
    );

    s.addText('Top risks', { x: 6.9, y: 5.75, w: 5.8, h: 0.4, fontSize: 15, bold: true, color: 'D97706' });
    s.addText(
      p.open_risks.length
        ? p.open_risks.slice(0, 4).map((r) => `• [sev ${r.severity}] ${r.title} — ${r.status}`).join('\n')
        : 'No open risks.',
      { x: 6.9, y: 6.2, w: 5.8, h: 1.1, fontSize: 11.5, color: INK, valign: 'top', lineSpacing: 16 }
    );
  }

  const buffer = await pptx.write({ outputType: 'nodebuffer' });
  await logAudit(req, 'export', 'report', null, { after: { month, scope: scopeLabel, projects: projects.length } });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename="itpm360-report-${month}.pptx"`);
  res.send(buffer);
});

export default router;
