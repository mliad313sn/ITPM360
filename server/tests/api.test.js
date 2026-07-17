import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { resetTestDatabase, TEST_DATABASE_URL, ADMIN } from './helpers.js';

process.env.DATABASE_URL = TEST_DATABASE_URL;

const { createApp } = await import('../src/app.js');
const { pool } = await import('../src/db.js');

let app;
let adminToken, pmToken, viewerToken;
let branchId, otherBranchId, projectId, pmId;

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function login(email, password) {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  assert.equal(res.status, 200, `login failed for ${email}: ${JSON.stringify(res.body)}`);
  return res.body.token;
}

before(async () => {
  await resetTestDatabase();
  app = createApp();
  adminToken = await login(ADMIN.email, ADMIN.password);

  // Build the org hierarchy through the API
  const country = await request(app).post('/api/countries').set(auth(adminToken))
    .send({ name: 'Testland', iso_code: 'TL' });
  assert.equal(country.status, 201);

  const branch = await request(app).post('/api/branches').set(auth(adminToken))
    .send({ country_id: country.body.country.id, name: 'HQ', code: 'TL-HQ', timezone: 'UTC' });
  assert.equal(branch.status, 201);
  branchId = branch.body.branch.id;

  const otherBranch = await request(app).post('/api/branches').set(auth(adminToken))
    .send({ country_id: country.body.country.id, name: 'Remote', code: 'TL-REM' });
  otherBranchId = otherBranch.body.branch.id;

  // PM scoped to HQ, viewer scoped to the other branch
  const pm = await request(app).post('/api/users').set(auth(adminToken))
    .send({ email: 'pm@test.dev', full_name: 'Pat PM', password: 'TestPassword1!' });
  pmId = pm.body.user.id;
  await request(app).post(`/api/users/${pmId}/roles`).set(auth(adminToken))
    .send({ role: 'project_manager', branch_id: branchId });

  const viewer = await request(app).post('/api/users').set(auth(adminToken))
    .send({ email: 'viewer@test.dev', full_name: 'Vic Viewer', password: 'TestPassword1!' });
  await request(app).post(`/api/users/${viewer.body.user.id}/roles`).set(auth(adminToken))
    .send({ role: 'viewer', branch_id: otherBranchId });

  pmToken = await login('pm@test.dev', 'TestPassword1!');
  viewerToken = await login('viewer@test.dev', 'TestPassword1!');
});

after(async () => {
  await pool.end();
});

test('rejects bad credentials and missing tokens', async () => {
  const bad = await request(app).post('/api/auth/login').send({ email: ADMIN.email, password: 'wrong' });
  assert.equal(bad.status, 401);
  const anon = await request(app).get('/api/projects');
  assert.equal(anon.status, 401);
});

test('RBAC: viewer cannot mutate the hierarchy', async () => {
  const res = await request(app).post('/api/countries').set(auth(viewerToken))
    .send({ name: 'Nope', iso_code: 'NO' });
  assert.equal(res.status, 403);
});

test('PM can create a project in their branch; visibility is scoped', async () => {
  const created = await request(app).post('/api/projects').set(auth(pmToken))
    .send({ branch_id: branchId, name: 'Test Rollout', project_manager_id: pmId });
  assert.equal(created.status, 201);
  projectId = created.body.project.id;

  // PM cannot create in a branch where they hold no role
  const denied = await request(app).post('/api/projects').set(auth(pmToken))
    .send({ branch_id: otherBranchId, name: 'Sneaky', project_manager_id: pmId });
  assert.equal(denied.status, 403);

  // viewer is scoped to the other branch → sees nothing
  const viewerList = await request(app).get('/api/projects').set(auth(viewerToken));
  assert.equal(viewerList.body.projects.length, 0);

  // admin sees everything
  const adminList = await request(app).get('/api/projects').set(auth(adminToken));
  assert.equal(adminList.body.projects.length, 1);
});

test('blocker rule: blocked requires an explanation', async () => {
  const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(auth(pmToken))
    .send({ title: 'Provision environment', assignee_id: pmId, due_date: '2030-01-01' });
  assert.equal(task.status, 201);
  const taskId = task.body.task.id;

  const noReason = await request(app).patch(`/api/tasks/${taskId}`).set(auth(pmToken))
    .send({ status: 'blocked' });
  assert.equal(noReason.status, 400);

  const withReason = await request(app).patch(`/api/tasks/${taskId}`).set(auth(pmToken))
    .send({ status: 'blocked', blocker_explanation: 'Waiting for firewall change' });
  assert.equal(withReason.status, 200);
  assert.equal(withReason.body.task.status, 'blocked');
});

test('meeting agenda pulls blockers live, then freezes on completion', async () => {
  const meeting = await request(app).post(`/api/projects/${projectId}/meetings`).set(auth(pmToken))
    .send({ title: 'Steering', scheduled_at: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(meeting.status, 201);
  const meetingId = meeting.body.meeting.id;

  const live = await request(app).get(`/api/meetings/${meetingId}`).set(auth(pmToken));
  assert.equal(live.body.agenda.blocked_tasks.length, 1);
  assert.match(live.body.agenda.blocked_tasks[0].blocker_explanation, /firewall/);

  const done = await request(app).post(`/api/meetings/${meetingId}/complete`).set(auth(pmToken))
    .send({ minutes: 'Escalated.' });
  assert.equal(done.status, 200);
  assert.equal(done.body.agenda_frozen, true);

  // unblock the task — the frozen snapshot must not change
  const tasks = await request(app).get(`/api/projects/${projectId}/tasks`).set(auth(pmToken));
  const blocked = tasks.body.tasks.find((t) => t.status === 'blocked');
  await request(app).patch(`/api/tasks/${blocked.id}`).set(auth(pmToken))
    .send({ status: 'in_progress', blocker_explanation: null });

  const frozen = await request(app).get(`/api/meetings/${meetingId}`).set(auth(pmToken));
  assert.equal(frozen.body.agenda_frozen, true);
  assert.equal(frozen.body.agenda.blocked_tasks.length, 1);
});

test('task dependencies reject cycles', async () => {
  const a = await request(app).post(`/api/projects/${projectId}/tasks`).set(auth(pmToken))
    .send({ title: 'Task A' });
  const b = await request(app).post(`/api/projects/${projectId}/tasks`).set(auth(pmToken))
    .send({ title: 'Task B' });

  const ok = await request(app).post(`/api/tasks/${a.body.task.id}/dependencies`).set(auth(pmToken))
    .send({ depends_on_task_id: b.body.task.id });
  assert.equal(ok.status, 201);

  const cycle = await request(app).post(`/api/tasks/${b.body.task.id}/dependencies`).set(auth(pmToken))
    .send({ depends_on_task_id: a.body.task.id });
  assert.equal(cycle.status, 409);
});

test('RAG downgrade notifies the PM and is audit-logged', async () => {
  const res = await request(app).patch(`/api/projects/${projectId}`).set(auth(adminToken))
    .send({ rag_status: 'red' });
  assert.equal(res.status, 200);

  const inbox = await request(app).get('/api/notifications').set(auth(pmToken));
  assert.ok(inbox.body.notifications.some((n) => n.type === 'rag_downgrade'));

  const audit = await request(app).get('/api/audit-logs').set(auth(adminToken));
  const entry = audit.body.audit_logs.find(
    (l) => l.entity_type === 'project' && l.action === 'status_change'
  );
  assert.ok(entry, 'expected a status_change audit entry');
  assert.equal(entry.changes.after.rag_status, 'red');
});

test('risk register: severity scoring, high-risk notification, and RBAC', async () => {
  // viewer (scoped to a different branch) has no visibility
  const viewerView = await request(app).get(`/api/projects/${projectId}/risks`).set(auth(viewerToken));
  assert.equal(viewerView.status, 403);

  // a low-severity risk does not notify
  const low = await request(app).post(`/api/projects/${projectId}/risks`).set(auth(pmToken))
    .send({ title: 'Minor doc gap', likelihood: 1, impact: 2 });
  assert.equal(low.status, 201);
  assert.equal(low.body.risk.severity, 2);

  // a high-severity risk notifies the admin/BM stakeholders
  const high = await request(app).post(`/api/projects/${projectId}/risks`).set(auth(pmToken))
    .send({ title: 'Vendor outage', category: 'risk', likelihood: 4, impact: 5 });
  assert.equal(high.status, 201);
  assert.equal(high.body.risk.severity, 20);

  // list is severity-ordered, open risks first
  const list = await request(app).get(`/api/projects/${projectId}/risks`).set(auth(pmToken));
  assert.equal(list.body.risks[0].title, 'Vendor outage');

  // out-of-range scores are clamped, not rejected
  const clamped = await request(app).post(`/api/projects/${projectId}/risks`).set(auth(pmToken))
    .send({ title: 'Weird scores', likelihood: 99, impact: 0 });
  assert.equal(clamped.body.risk.likelihood, 3);
  assert.equal(clamped.body.risk.impact, 3);
});

test('time tracking rolls actual hours onto the task', async () => {
  const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(auth(pmToken))
    .send({ title: 'Timed work', estimate_hours: 10 });
  const taskId = task.body.task.id;

  const bad = await request(app).post(`/api/tasks/${taskId}/time`).set(auth(pmToken)).send({ hours: 0 });
  assert.equal(bad.status, 400);

  await request(app).post(`/api/tasks/${taskId}/time`).set(auth(pmToken)).send({ hours: 3.5 });
  await request(app).post(`/api/tasks/${taskId}/time`).set(auth(pmToken)).send({ hours: 2 });

  const time = await request(app).get(`/api/tasks/${taskId}/time`).set(auth(pmToken));
  assert.equal(time.body.total_hours, 5.5);

  const tasks = await request(app).get(`/api/projects/${projectId}/tasks`).set(auth(pmToken));
  const timed = tasks.body.tasks.find((t) => t.id === taskId);
  assert.equal(timed.logged_hours, 5.5);
});

test('task tags are normalized (lowercased, deduped, trimmed)', async () => {
  const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(auth(pmToken))
    .send({ title: 'Tagged', tags: ['Security', 'security', '  Identity  ', ''] });
  assert.deepEqual(task.body.task.tags, ['security', 'identity']);
});

test('EVM: project exposes earned-value metrics and portfolio rollup', async () => {
  // give the project a budget, actual cost and a scored task
  await request(app).patch(`/api/projects/${projectId}`).set(auth(adminToken))
    .send({ budget: 1000, actual_cost: 400, start_date: '2026-01-01', end_date: '2026-12-31' });
  const task = await request(app).post(`/api/projects/${projectId}/tasks`).set(auth(pmToken))
    .send({ title: 'EVM task', percent_complete: 40 });

  const detail = await request(app).get(`/api/projects/${projectId}`).set(auth(adminToken));
  assert.ok(detail.body.evm, 'evm block present');
  assert.equal(detail.body.evm.bac, 1000);
  assert.ok(detail.body.evm.cpi != null, 'cpi computed from AC');
  assert.ok(['green', 'amber', 'red'].includes(detail.body.evm.cost_health));

  const dash = await request(app).get('/api/dashboard/summary').set(auth(adminToken));
  assert.ok(Array.isArray(dash.body.portfolio));
  const row = dash.body.portfolio.find((p) => p.id === projectId);
  assert.ok(row && row.spi !== undefined && row.cpi !== undefined);
  assert.ok(dash.body.kpis.total >= 1);

  // percent_complete forced to 100 when a task is marked done
  const done = await request(app).patch(`/api/tasks/${task.body.task.id}`).set(auth(pmToken))
    .send({ status: 'done' });
  assert.equal(done.body.task.percent_complete, 100);
});

test('project charter fields persist via PATCH', async () => {
  const res = await request(app).patch(`/api/projects/${projectId}`).set(auth(pmToken))
    .send({
      business_case: 'Reduce run cost',
      objectives: 'Cut close time',
      scope_in: 'Finance module',
      scope_out: 'Hardware',
      success_criteria: 'Parallel run signed off',
    });
  assert.equal(res.status, 200);
  const detail = await request(app).get(`/api/projects/${projectId}`).set(auth(pmToken));
  assert.equal(detail.body.project.business_case, 'Reduce run cost');
  assert.equal(detail.body.project.scope_out, 'Hardware');

  // untouched charter fields survive an unrelated update
  await request(app).patch(`/api/projects/${projectId}`).set(auth(pmToken)).send({ rag_status: 'amber' });
  const after = await request(app).get(`/api/projects/${projectId}`).set(auth(pmToken));
  assert.equal(after.body.project.business_case, 'Reduce run cost');
});

test('capacity: aggregates remaining workload per assignee and flags over-allocation', async () => {
  // Set the PM's weekly capacity low, then assign an oversized estimated task due this week
  await request(app).patch(`/api/users/${pmId}`).set(auth(adminToken))
    .send({ weekly_capacity_hours: 10 });
  await request(app).post(`/api/projects/${projectId}/tasks`).set(auth(pmToken))
    .send({ title: 'Heavy load', assignee_id: pmId, estimate_hours: 40, percent_complete: 0, due_date: '2030-06-05' });

  const cap = await request(app).get('/api/capacity?weeks=8&now=2030-06-03').set(auth(adminToken));
  assert.equal(cap.status, 200);
  assert.equal(cap.body.week_starts.length, 8);
  const pm = cap.body.people.find((p) => p.user_id === pmId);
  assert.ok(pm, 'PM appears in capacity');
  assert.equal(pm.weekly_capacity, 10);
  assert.ok(pm.total_remaining >= 40);
  assert.ok(pm.overallocated_weeks >= 1, 'over-allocation detected against 10h capacity');
});

test('CSV export streams scoped data with headers', async () => {
  const res = await request(app).get('/api/export/projects?format=csv').set(auth(adminToken));
  assert.equal(res.status, 200);
  assert.match(res.headers['content-type'], /text\/csv/);
  const [header, firstRow] = res.text.split('\n');
  assert.match(header, /^id,name,country/);
  assert.match(firstRow, /Test Rollout/);
});

test('login is rate limited', async () => {
  let limited = false;
  for (let i = 0; i < 25; i++) {
    const res = await request(app).post('/api/auth/login')
      .send({ email: 'nobody@test.dev', password: 'wrong-password' });
    if (res.status === 429) {
      limited = true;
      break;
    }
  }
  assert.ok(limited, 'expected a 429 after repeated failed logins');
});
