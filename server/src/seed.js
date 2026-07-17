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

  for (const p of projectDefs) {
    const { rows } = await query(
      `INSERT INTO projects (branch_id, name, description, project_manager_id, rag_status, status,
                             start_date, end_date, budget, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [branches[p.branch], p.name, p.desc, users[p.pm], p.rag, p.status, p.start, p.end, p.budget,
       users['admin@itpm360.dev']]
    );
    for (const [email, role] of p.members) {
      await query(`INSERT INTO project_members (project_id, user_id, member_role) VALUES ($1, $2, $3)`, [
        rows[0].id, users[email], role,
      ]);
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
