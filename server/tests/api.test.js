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
