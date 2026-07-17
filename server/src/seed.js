// Development seed data. Destructive: wipes all rows first.
// Usage: npm run seed
import bcrypt from 'bcryptjs';
import { pool, query } from './db.js';

const PASSWORD = 'Password123!';

async function seed() {
  console.log('Wiping existing data...');
  await query(`TRUNCATE organizations, countries, branches, users, user_roles, projects,
               project_members, grc_checkpoints, tasks, meetings, meeting_attendees,
               audit_logs, notifications, webhook_subscriptions, webhook_deliveries CASCADE`);

  const hash = await bcrypt.hash(PASSWORD, 10);

  const { rows: [org] } = await query(
    `INSERT INTO organizations (name) VALUES ('Aster Global IT') RETURNING id`
  );

  const countryDefs = [
    { name: 'United States', iso: 'US' },
    { name: 'Germany', iso: 'DE' },
    { name: 'Singapore', iso: 'SG' },
  ];
  const countries = {};
  for (const c of countryDefs) {
    const { rows } = await query(
      `INSERT INTO countries (organization_id, name, iso_code) VALUES ($1, $2, $3) RETURNING id`,
      [org.id, c.name, c.iso]
    );
    countries[c.iso] = rows[0].id;
  }

  const branchDefs = [
    { iso: 'US', name: 'New York HQ', code: 'US-NYC', city: 'New York', tz: 'America/New_York' },
    { iso: 'DE', name: 'Berlin Office', code: 'DE-BER', city: 'Berlin', tz: 'Europe/Berlin' },
    { iso: 'DE', name: 'Munich Office', code: 'DE-MUC', city: 'Munich', tz: 'Europe/Berlin' },
    { iso: 'SG', name: 'Singapore Hub', code: 'SG-SIN', city: 'Singapore', tz: 'Asia/Singapore' },
  ];
  const branches = {};
  for (const b of branchDefs) {
    const { rows } = await query(
      `INSERT INTO branches (country_id, name, code, city, timezone) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [countries[b.iso], b.name, b.code, b.city, b.tz]
    );
    branches[b.code] = rows[0].id;
  }

  const userDefs = [
    { email: 'admin@itpm360.dev', name: 'Alex Morgan', title: 'Global IT Director', roles: [['global_admin', null]] },
    { email: 'lena.mueller@itpm360.dev', name: 'Lena Müller', title: 'Branch Manager Berlin', roles: [['branch_manager', 'DE-BER']] },
    { email: 'raj.patel@itpm360.dev', name: 'Raj Patel', title: 'Senior Project Manager', roles: [['project_manager', 'DE-BER'], ['project_manager', 'DE-MUC']] },
    { email: 'sofia.garcia@itpm360.dev', name: 'Sofia García', title: 'Project Manager', roles: [['project_manager', 'US-NYC']] },
    { email: 'wei.tan@itpm360.dev', name: 'Wei Tan', title: 'Branch Manager Singapore', roles: [['branch_manager', 'SG-SIN'], ['project_manager', 'SG-SIN']] },
    { email: 'dana.kim@itpm360.dev', name: 'Dana Kim', title: 'Business Analyst', roles: [['viewer', 'DE-BER'], ['viewer', 'US-NYC']] },
  ];
  const users = {};
  for (const u of userDefs) {
    const { rows } = await query(
      `INSERT INTO users (email, full_name, password_hash, job_title) VALUES ($1, $2, $3, $4) RETURNING id`,
      [u.email, u.name, hash, u.title]
    );
    users[u.email] = rows[0].id;
    for (const [role, code] of u.roles) {
      await query(`INSERT INTO user_roles (user_id, role, branch_id) VALUES ($1, $2, $3)`, [
        rows[0].id, role, code ? branches[code] : null,
      ]);
    }
  }

  const projectDefs = [
    {
      branch: 'DE-BER', name: 'ERP Cloud Migration', pm: 'raj.patel@itpm360.dev',
      desc: 'Migrate the on-premise ERP stack to a managed cloud platform with zero data loss.',
      rag: 'amber', status: 'active', start: '2026-03-01', end: '2026-11-30', budget: 850000, actual: 520000,
      members: [['lena.mueller@itpm360.dev', 'sponsor'], ['dana.kim@itpm360.dev', 'analyst']],
    },
    {
      branch: 'DE-BER', name: 'Zero-Trust Network Rollout', pm: 'raj.patel@itpm360.dev',
      desc: 'Implement zero-trust segmentation and identity-aware access across the Berlin campus.',
      rag: 'red', status: 'active', start: '2026-01-15', end: '2026-09-30', budget: 420000, actual: 310000,
      members: [['dana.kim@itpm360.dev', 'analyst']],
    },
    {
      branch: 'DE-MUC', name: 'Service Desk Modernization', pm: 'raj.patel@itpm360.dev',
      desc: 'Replace the legacy ticketing system with an ITIL-aligned service management suite.',
      rag: 'green', status: 'planning', start: '2026-08-01', end: '2027-02-28', budget: 210000, actual: 0,
      members: [],
    },
    {
      branch: 'US-NYC', name: 'Data Warehouse Consolidation', pm: 'sofia.garcia@itpm360.dev',
      desc: 'Consolidate three regional warehouses into a single governed lakehouse.',
      rag: 'green', status: 'active', start: '2026-02-01', end: '2026-12-15', budget: 1200000, actual: 250000,
      members: [['dana.kim@itpm360.dev', 'analyst']],
    },
    {
      branch: 'SG-SIN', name: 'APAC Disaster Recovery Upgrade', pm: 'wei.tan@itpm360.dev',
      desc: 'Stand up an active-active DR site and cut RTO from 24h to 1h for tier-1 systems.',
      rag: 'amber', status: 'on_hold', start: '2026-04-01', end: '2026-10-31', budget: 640000, actual: 180000,
      members: [],
    },
  ];

  const projects = {};
  for (const p of projectDefs) {
    const { rows } = await query(
      `INSERT INTO projects (branch_id, name, description, project_manager_id, rag_status, status,
                             start_date, end_date, budget, actual_cost, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [branches[p.branch], p.name, p.desc, users[p.pm], p.rag, p.status, p.start, p.end, p.budget,
       p.actual ?? null, users['admin@itpm360.dev']]
    );
    projects[p.name] = rows[0].id;
    for (const [email, role] of p.members) {
      await query(`INSERT INTO project_members (project_id, user_id, member_role) VALUES ($1, $2, $3)`, [
        rows[0].id, users[email], role,
      ]);
    }
  }

  // Tasks — includes blocked tasks with explanations and next steps for the Meeting Hub
  const taskDefs = [
    { project: 'ERP Cloud Migration', title: 'Data model mapping legacy → cloud', assignee: 'dana.kim@itpm360.dev',
      status: 'done', priority: 'high', start: '2026-03-05', due: '2026-04-30',
      next: null, blocker: null },
    { project: 'ERP Cloud Migration', title: 'Finance module pilot migration', assignee: 'raj.patel@itpm360.dev',
      status: 'in_progress', priority: 'critical', start: '2026-05-01', due: '2026-08-15',
      next: 'Complete dry-run with Q2 close data, then sign-off workshop with finance leads.', blocker: null },
    { project: 'ERP Cloud Migration', title: 'Vendor contract renewal for middleware', assignee: 'lena.mueller@itpm360.dev',
      status: 'blocked', priority: 'high', start: '2026-06-01', due: '2026-07-10',
      next: 'Escalate to procurement director; prepare fallback licensing option.',
      blocker: 'Procurement freeze: legal review of the new vendor MSA has been pending for 3 weeks.' },
    { project: 'ERP Cloud Migration', title: 'Cutover runbook and rollback plan', assignee: 'raj.patel@itpm360.dev',
      status: 'todo', priority: 'medium', start: '2026-08-01', due: '2026-10-01',
      next: null, blocker: null },
    { project: 'Zero-Trust Network Rollout', title: 'Identity provider consolidation', assignee: 'raj.patel@itpm360.dev',
      status: 'blocked', priority: 'critical', start: '2026-02-01', due: '2026-06-30',
      next: 'Decision meeting with security board needed on tenant topology.',
      blocker: 'Two conflicting AD forests discovered; merging requires an approved downtime window.' },
    { project: 'Zero-Trust Network Rollout', title: 'Network micro-segmentation pilot (floor 3)', assignee: 'dana.kim@itpm360.dev',
      status: 'in_review', priority: 'high', start: '2026-04-01', due: '2026-07-20',
      next: 'Review pilot metrics, then extend policy set to floors 4-6.', blocker: null },
    { project: 'Data Warehouse Consolidation', title: 'Schema harmonization for sales data', assignee: 'sofia.garcia@itpm360.dev',
      status: 'in_progress', priority: 'high', start: '2026-03-01', due: '2026-08-31',
      next: 'Finish region EU mapping; validate row counts against source.', blocker: null },
    { project: 'Data Warehouse Consolidation', title: 'Decommission legacy Oracle warehouse', assignee: null,
      status: 'todo', priority: 'low', start: '2026-09-01', due: '2026-12-01',
      next: null, blocker: null },
    { project: 'APAC Disaster Recovery Upgrade', title: 'DR site network provisioning', assignee: 'wei.tan@itpm360.dev',
      status: 'blocked', priority: 'high', start: '2026-04-15', due: '2026-06-15',
      next: 'Await budget release confirmation from regional CFO.',
      blocker: 'Project on hold: capex budget for the secondary data centre frozen until Q3 review.' },
  ];
  // Sensible progress by status for earned-value demonstration
  const pctByStatus = { done: 100, in_review: 80, in_progress: 45, blocked: 20, todo: 0 };
  for (const [i, t] of taskDefs.entries()) {
    await query(
      `INSERT INTO tasks (project_id, title, assignee_id, status, priority, start_date, due_date,
                          blocker_explanation, next_steps, sort_order, created_by, completed_at, percent_complete)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $4 = 'done'::task_status THEN now() END, $12)`,
      [projects[t.project], t.title, t.assignee ? users[t.assignee] : null, t.status, t.priority,
       t.start, t.due, t.blocker, t.next, i, users['admin@itpm360.dev'], pctByStatus[t.status] ?? 0]
    );
  }

  // Project charter for the flagship demo project
  await query(
    `UPDATE projects SET
       business_case = $2, objectives = $3, scope_in = $4, scope_out = $5, success_criteria = $6
     WHERE id = $1`,
    [
      projects['ERP Cloud Migration'],
      'The on-premise ERP is out of vendor support in 2027 and blocks month-end automation. Migrating to a managed cloud platform cuts run costs ~30% and unblocks real-time reporting.',
      'Zero data loss at cutover; reduce month-end close from 6 to 3 days; decommission two on-prem data centres.',
      'Finance, procurement and HR modules; data migration and reconciliation; integration with the identity platform.',
      'Custom warehouse-management add-ons (handled by a separate project); end-user hardware refresh.',
      'Signed-off parallel run over one full close cycle; <0.01% reconciliation variance; steering-committee go-live approval.',
    ]
  );

  // Stakeholder register (power/interest) for the flagship project
  const erp = projects['ERP Cloud Migration'];
  const stakeholderDefs = [
    ['CFO (Executive Sponsor)', 'Finance', 3, 3, 'Chairs the steering committee; wants weekly RAG + budget variance.'],
    ['Head of Finance Ops', 'Finance', 2, 3, 'Owns UAT sign-off; engage closely through the parallel run.'],
    ['CISO', 'Security', 3, 2, 'Approves the GRC gates; keep satisfied with compliance evidence.'],
    ['Works Council', 'HR', 2, 1, 'Consulted on process changes; keep informed of timeline.'],
    ['End-user community', 'Operations', 1, 2, 'Keep informed via change comms and training.'],
  ];
  for (const [name, title, influence, interest, engagement] of stakeholderDefs) {
    await query(
      `INSERT INTO stakeholders (project_id, name, title, influence, interest, engagement)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [erp, name, title, influence, interest, engagement]
    );
  }

  // RACI matrix for key activities
  const raciDefs = [
    ['Data migration & reconciliation', 'raj.patel@itpm360.dev', 'accountable'],
    ['Data migration & reconciliation', 'dana.kim@itpm360.dev', 'responsible'],
    ['Data migration & reconciliation', 'lena.mueller@itpm360.dev', 'informed'],
    ['UAT & sign-off', 'lena.mueller@itpm360.dev', 'accountable'],
    ['UAT & sign-off', 'raj.patel@itpm360.dev', 'consulted'],
    ['Cutover & go-live', 'raj.patel@itpm360.dev', 'accountable'],
    ['Cutover & go-live', 'dana.kim@itpm360.dev', 'responsible'],
    ['Cutover & go-live', 'admin@itpm360.dev', 'informed'],
  ];
  for (const [activity, email, assignment] of raciDefs) {
    await query(
      `INSERT INTO raci_entries (project_id, activity, user_id, assignment) VALUES ($1,$2,$3,$4)`,
      [erp, activity, users[email], assignment]
    );
  }

  // Capacity variety (part-timers + a stretched PM) for the workload heatmap
  await query(`UPDATE users SET weekly_capacity_hours = 32 WHERE email = 'dana.kim@itpm360.dev'`);
  await query(`UPDATE users SET weekly_capacity_hours = 20 WHERE email = 'lena.mueller@itpm360.dev'`);

  // Progress variety so the EVM control table shows a green/amber/red mix
  await query(`UPDATE tasks SET percent_complete = 82 WHERE title = 'Schema harmonization for sales data'`);
  await query(`UPDATE tasks SET percent_complete = 55 WHERE title = 'Finance module pilot migration'`);

  // WBS: nest a couple of subtasks under the finance migration task
  await query(
    `INSERT INTO tasks (project_id, parent_task_id, title, status, priority, percent_complete, estimate_hours, sort_order, created_by)
     SELECT project_id, id, 'Map chart of accounts', 'done', 'high', 100, 24, 20, $1
     FROM tasks WHERE title = 'Finance module pilot migration' LIMIT 1`,
    [users['admin@itpm360.dev']]
  );
  await query(
    `INSERT INTO tasks (project_id, parent_task_id, title, status, priority, percent_complete, estimate_hours, sort_order, created_by)
     SELECT project_id, id, 'Reconcile Q2 trial balance', 'in_progress', 'critical', 40, 40, 21, $1
     FROM tasks WHERE title = 'Finance module pilot migration' LIMIT 1`,
    [users['admin@itpm360.dev']]
  );

  // PM extras: milestones, estimates, one dependency chain and a comment
  await query(`UPDATE tasks SET is_milestone = true, estimate_hours = 16
               WHERE title = 'Cutover runbook and rollback plan'`);
  await query(`UPDATE tasks SET estimate_hours = 120 WHERE title = 'Finance module pilot migration'`);
  await query(`UPDATE tasks SET estimate_hours = 24 WHERE title = 'Vendor contract renewal for middleware'`);
  // Estimates on the remaining open tasks so the capacity heatmap is populated
  await query(`UPDATE tasks SET estimate_hours = 48 WHERE title = 'Identity provider consolidation'`);
  await query(`UPDATE tasks SET estimate_hours = 64 WHERE title = 'Network micro-segmentation pilot (floor 3)'`);
  await query(`UPDATE tasks SET estimate_hours = 80 WHERE title = 'Schema harmonization for sales data'`);
  await query(`UPDATE tasks SET estimate_hours = 40 WHERE title = 'DR site network provisioning'`);
  await query(
    `INSERT INTO task_dependencies (task_id, depends_on_task_id)
     SELECT a.id, b.id FROM tasks a, tasks b
     WHERE a.title = 'Cutover runbook and rollback plan' AND b.title = 'Finance module pilot migration'`
  );
  await query(
    `INSERT INTO task_comments (task_id, author_id, body)
     SELECT t.id, $1, 'Legal confirmed the MSA review is queued for next week — keeping this red until countersigned.'
     FROM tasks t WHERE t.title = 'Vendor contract renewal for middleware'`,
    [users['lena.mueller@itpm360.dev']]
  );

  // GRC checkpoints
  const grcDefs = [
    { project: 'ERP Cloud Migration', type: 'compliance', title: 'GDPR data-transfer impact assessment',
      status: 'approved', due: '2026-04-15' },
    { project: 'ERP Cloud Migration', type: 'governance', title: 'Architecture review board sign-off',
      status: 'in_review', due: '2026-08-01' },
    { project: 'ERP Cloud Migration', type: 'risk', title: 'Cutover risk assessment & rollback drill',
      status: 'pending', due: '2026-09-15' },
    { project: 'Zero-Trust Network Rollout', type: 'risk', title: 'Downtime-window risk sign-off',
      status: 'pending', due: '2026-07-30' },
    { project: 'Data Warehouse Consolidation', type: 'compliance', title: 'SOX data-lineage evidence pack',
      status: 'in_review', due: '2026-08-20' },
  ];
  for (const g of grcDefs) {
    await query(
      `INSERT INTO grc_checkpoints (project_id, checkpoint_type, title, status, due_date,
                                    reviewed_by, reviewed_at)
       VALUES ($1,$2,$3,$4,$5,
               CASE WHEN $4 = ANY(ARRAY['approved','rejected','waived']::grc_status[]) THEN $6::uuid END,
               CASE WHEN $4 = ANY(ARRAY['approved','rejected','waived']::grc_status[]) THEN now() END)`,
      [projects[g.project], g.type, g.title, g.status, g.due, users['admin@itpm360.dev']]
    );
  }

  // Risk register (RAID)
  const riskDefs = [
    { project: 'ERP Cloud Migration', category: 'risk', title: 'Data migration integrity failure at cutover',
      likelihood: 3, impact: 5, status: 'mitigating', owner: 'raj.patel@itpm360.dev',
      mitigation: 'Full dry-run with production copy; reconciliation scripts; rollback window agreed with business.' },
    { project: 'ERP Cloud Migration', category: 'dependency', title: 'Middleware vendor MSA not countersigned',
      likelihood: 4, impact: 4, status: 'open', owner: 'lena.mueller@itpm360.dev',
      mitigation: 'Escalated to procurement director; fallback licensing option scoped.' },
    { project: 'Zero-Trust Network Rollout', category: 'risk', title: 'Conflicting AD forests block IdP consolidation',
      likelihood: 4, impact: 5, status: 'open', owner: 'raj.patel@itpm360.dev',
      mitigation: 'Security board decision on tenant topology; phased migration with approved downtime window.' },
    { project: 'Zero-Trust Network Rollout', category: 'issue', title: 'Pilot latency above SLA on floor 3',
      likelihood: 3, impact: 3, status: 'mitigating', owner: 'dana.kim@itpm360.dev',
      mitigation: 'Tune policy evaluation order; add local PEP cache before extending to floors 4-6.' },
    { project: 'Data Warehouse Consolidation', category: 'assumption', title: 'Source teams provide schemas on time',
      likelihood: 2, impact: 3, status: 'open', owner: 'sofia.garcia@itpm360.dev', mitigation: null },
    { project: 'APAC Disaster Recovery Upgrade', category: 'risk', title: 'Capex freeze delays DR site beyond hurricane season',
      likelihood: 4, impact: 4, status: 'open', owner: 'wei.tan@itpm360.dev',
      mitigation: 'Interim warm-standby in existing cloud region while budget is reviewed.' },
  ];
  for (const r of riskDefs) {
    await query(
      `INSERT INTO risks (project_id, category, title, likelihood, impact, status, owner_id, mitigation_plan, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [projects[r.project], r.category, r.title, r.likelihood, r.impact, r.status,
       users[r.owner], r.mitigation, users['admin@itpm360.dev']]
    );
  }

  // Time entries logged against a few tasks
  const timeDefs = [
    { task: 'Data model mapping legacy → cloud', user: 'dana.kim@itpm360.dev', hours: 6.5, days: 40, notes: 'Entity mapping workshop' },
    { task: 'Data model mapping legacy → cloud', user: 'dana.kim@itpm360.dev', hours: 7, days: 38, notes: 'Field-level reconciliation' },
    { task: 'Finance module pilot migration', user: 'raj.patel@itpm360.dev', hours: 5, days: 4, notes: 'Dry-run setup' },
    { task: 'Finance module pilot migration', user: 'raj.patel@itpm360.dev', hours: 4.5, days: 2, notes: 'Q2 close data load' },
    { task: 'Network micro-segmentation pilot (floor 3)', user: 'dana.kim@itpm360.dev', hours: 8, days: 6, notes: 'Policy authoring' },
  ];
  for (const t of timeDefs) {
    await query(
      `INSERT INTO time_entries (task_id, user_id, hours, work_date, notes)
       SELECT id, $2, $3, (CURRENT_DATE - ($4 || ' days')::interval)::date, $5 FROM tasks WHERE title = $1 LIMIT 1`,
      [t.task, users[t.user], t.hours, String(t.days), t.notes]
    );
  }

  // Task tags
  const tagDefs = [
    { task: 'Finance module pilot migration', tags: ['finance', 'migration', 'critical-path'] },
    { task: 'Vendor contract renewal for middleware', tags: ['procurement', 'external-dependency'] },
    { task: 'Identity provider consolidation', tags: ['security', 'identity'] },
    { task: 'Cutover runbook and rollback plan', tags: ['cutover', 'documentation'] },
    { task: 'Schema harmonization for sales data', tags: ['data-modeling'] },
  ];
  for (const t of tagDefs) {
    await query(`UPDATE tasks SET tags = $2 WHERE title = $1`, [t.task, t.tags]);
  }

  // Meetings — one upcoming steering meeting per active project
  const meetingDefs = [
    { project: 'ERP Cloud Migration', title: 'Monthly steering committee', inDays: 3,
      attendees: ['raj.patel@itpm360.dev', 'lena.mueller@itpm360.dev', 'dana.kim@itpm360.dev'] },
    { project: 'Zero-Trust Network Rollout', title: 'Blocker escalation sync', inDays: 1,
      attendees: ['raj.patel@itpm360.dev', 'lena.mueller@itpm360.dev'] },
    { project: 'Data Warehouse Consolidation', title: 'Sprint review & stakeholder update', inDays: 5,
      attendees: ['sofia.garcia@itpm360.dev', 'dana.kim@itpm360.dev'] },
  ];
  for (const m of meetingDefs) {
    const { rows } = await query(
      `INSERT INTO meetings (project_id, title, scheduled_at, duration_minutes, meeting_link, created_by)
       VALUES ($1, $2, now() + ($3 || ' days')::interval, 45, 'https://meet.example.com/itpm360', $4)
       RETURNING id`,
      [projects[m.project], m.title, m.inDays, users['admin@itpm360.dev']]
    );
    for (const email of m.attendees) {
      await query(`INSERT INTO meeting_attendees (meeting_id, user_id) VALUES ($1, $2)`, [rows[0].id, users[email]]);
    }
  }

  // Cost breakdown line items (planned vs actual by category)
  const costDefs = [
    { project: 'ERP Cloud Migration', lines: [
      ['services', 'Migration partner (SI)', 400000, 250000],
      ['software', 'Cloud ERP subscription', 240000, 140000],
      ['labour', 'Internal project team', 150000, 110000],
      ['contingency', 'Risk reserve', 60000, 20000],
    ] },
    { project: 'Data Warehouse Consolidation', lines: [
      ['software', 'Lakehouse platform', 500000, 120000],
      ['services', 'Data engineering consultancy', 450000, 90000],
      ['labour', 'Internal analysts', 250000, 40000],
    ] },
    { project: 'Zero-Trust Network Rollout', lines: [
      ['hardware', 'Network appliances', 200000, 160000],
      ['software', 'Identity & policy platform', 120000, 90000],
      ['labour', 'Security engineering', 100000, 60000],
    ] },
  ];
  for (const c of costDefs) {
    for (const [cat, label, planned, actual] of c.lines) {
      await query(
        `INSERT INTO cost_lines (project_id, category, label, planned_amount, actual_amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [projects[c.project], cat, label, planned, actual]
      );
    }
  }

  // Synthetic historical EVM snapshots so the S-curve renders (monthly, start→now)
  const smoothstep = (x) => x * x * (3 - 2 * x); // gentle S-shape
  for (const p of projectDefs) {
    if (!p.budget || !p.start || !p.end) continue;
    const start = new Date(p.start);
    const end = new Date(p.end);
    const now = new Date();
    const perf = p.rag === 'red' ? 0.68 : p.rag === 'amber' ? 0.82 : 1.02; // EV vs plan
    const cpiTarget = p.actual && p.budget ? Math.max(0.5, (p.budget * 0.3) / Math.max(p.actual, 1)) : 0.9;
    const cursor = new Date(start);
    while (cursor <= now && cursor <= end) {
      const sr = Math.max(0, Math.min(1, (cursor - start) / (end - start)));
      const pvR = smoothstep(sr);
      const evR = Math.min(1, smoothstep(sr) * perf);
      const pv = p.budget * pvR;
      const ev = p.budget * evR;
      const ac = ev > 0 ? ev / cpiTarget : 0;
      await query(
        `INSERT INTO evm_snapshots (project_id, captured_on, pv, ev, ac, spi, cpi, percent_complete)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
        [projects[p.name], cursor.toISOString().slice(0, 10),
         pv.toFixed(2), ev.toFixed(2), ac.toFixed(2),
         pv > 0 ? (ev / pv).toFixed(3) : null, ac > 0 ? (ev / ac).toFixed(3) : null, (evR * 100).toFixed(1)]
      );
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  console.log('Seed complete.');
  console.log(`Login with any seeded user / password: ${PASSWORD}`);
  console.log(userDefs.map((u) => `  ${u.email} — ${u.roles.map(([r, b]) => b ? `${r}@${b}` : r).join(', ')}`).join('\n'));
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
