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
      rag: 'amber', status: 'active', start: '2026-03-01', end: '2026-11-30', budget: 850000,
      members: [['lena.mueller@itpm360.dev', 'sponsor'], ['dana.kim@itpm360.dev', 'analyst']],
    },
    {
      branch: 'DE-BER', name: 'Zero-Trust Network Rollout', pm: 'raj.patel@itpm360.dev',
      desc: 'Implement zero-trust segmentation and identity-aware access across the Berlin campus.',
      rag: 'red', status: 'active', start: '2026-01-15', end: '2026-09-30', budget: 420000,
      members: [['dana.kim@itpm360.dev', 'analyst']],
    },
    {
      branch: 'DE-MUC', name: 'Service Desk Modernization', pm: 'raj.patel@itpm360.dev',
      desc: 'Replace the legacy ticketing system with an ITIL-aligned service management suite.',
      rag: 'green', status: 'planning', start: '2026-08-01', end: '2027-02-28', budget: 210000,
      members: [],
    },
    {
      branch: 'US-NYC', name: 'Data Warehouse Consolidation', pm: 'sofia.garcia@itpm360.dev',
      desc: 'Consolidate three regional warehouses into a single governed lakehouse.',
      rag: 'green', status: 'active', start: '2026-02-01', end: '2026-12-15', budget: 1200000,
      members: [['dana.kim@itpm360.dev', 'analyst']],
    },
    {
      branch: 'SG-SIN', name: 'APAC Disaster Recovery Upgrade', pm: 'wei.tan@itpm360.dev',
      desc: 'Stand up an active-active DR site and cut RTO from 24h to 1h for tier-1 systems.',
      rag: 'amber', status: 'on_hold', start: '2026-04-01', end: '2026-10-31', budget: 640000,
      members: [],
    },
  ];

  const projects = {};
  for (const p of projectDefs) {
    const { rows } = await query(
      `INSERT INTO projects (branch_id, name, description, project_manager_id, rag_status, status,
                             start_date, end_date, budget, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [branches[p.branch], p.name, p.desc, users[p.pm], p.rag, p.status, p.start, p.end, p.budget,
       users['admin@itpm360.dev']]
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
  for (const [i, t] of taskDefs.entries()) {
    await query(
      `INSERT INTO tasks (project_id, title, assignee_id, status, priority, start_date, due_date,
                          blocker_explanation, next_steps, sort_order, created_by, completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, CASE WHEN $4 = 'done'::task_status THEN now() END)`,
      [projects[t.project], t.title, t.assignee ? users[t.assignee] : null, t.status, t.priority,
       t.start, t.due, t.blocker, t.next, i, users['admin@itpm360.dev']]
    );
  }

  // PM extras: milestones, estimates, one dependency chain and a comment
  await query(`UPDATE tasks SET is_milestone = true, estimate_hours = 16
               WHERE title = 'Cutover runbook and rollback plan'`);
  await query(`UPDATE tasks SET estimate_hours = 120 WHERE title = 'Finance module pilot migration'`);
  await query(`UPDATE tasks SET estimate_hours = 24 WHERE title = 'Vendor contract renewal for middleware'`);
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

  console.log('Seed complete.');
  console.log(`Login with any seeded user / password: ${PASSWORD}`);
  console.log(userDefs.map((u) => `  ${u.email} — ${u.roles.map(([r, b]) => b ? `${r}@${b}` : r).join(', ')}`).join('\n'));
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
