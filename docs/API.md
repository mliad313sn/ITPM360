# ITPM360 REST API

Base URL: `http://localhost:4000/api`. All endpoints except `POST /auth/login` and
`GET /health` require `Authorization: Bearer <token>`. Errors are JSON: `{ "error": "…" }`.

## Authentication

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{email, password}` → `{token, user}`. Rate-limited (20 / 15 min / IP). |
| GET | `/auth/me` | Current user with role assignments. |

Roles are scoped: `global_admin` (org-wide) or `branch_manager` / `project_manager` /
`viewer` (per branch). Every list endpoint returns only what the caller may see.

## Hierarchy

| Method | Path | Access |
|---|---|---|
| GET/POST | `/countries` | read: any; write: global admin |
| PATCH/DELETE | `/countries/:id` | global admin |
| GET/POST | `/branches` (`?country_id=`) | read: any; create/delete: global admin |
| PATCH | `/branches/:id` | global admin or that branch's manager |
| GET/POST | `/users` | read: any; create: global admin |
| PATCH | `/users/:id` | global admin (profile, activate/deactivate) |
| POST/DELETE | `/users/:id/roles[/:roleId]` | global admin |

## Projects & GRC

| Method | Path | Notes |
|---|---|---|
| GET | `/projects` (`?branch_id=&status=&rag=`) | scoped list with members, task/blocked counts |
| POST | `/projects` | global admin, or BM/PM of the target branch |
| GET/PATCH/DELETE | `/projects/:id` | manage: admin, branch BM, or assigned PM |
| POST/DELETE | `/projects/:id/members[/:userId]` | project managers |
| GET/POST | `/projects/:id/grc` | checkpoints (`governance/risk/compliance`) |
| PATCH/DELETE | `/grc/:id` | status flow `pending → in_review → approved/rejected/waived` |

RAG (`green/amber/red`) and lifecycle transitions are audit-logged as `status_change`;
downgrades notify the PM and branch managers and fire `project.rag_changed`.

## Tasks

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/projects/:id/tasks` | team members and managers |
| PATCH/DELETE | `/tasks/:id` | team, managers, or the assignee |
| GET/POST | `/tasks/:id/comments` | discussion thread |
| POST/DELETE | `/tasks/:id/dependencies[/:dependsOnId]` | finish-to-start; cycles rejected (409) |
| GET/POST | `/tasks/:id/time` | log/list time entries; response includes `total_hours` |
| DELETE | `/time/:id` | author or a project manager |
| GET | `/my/tasks` | caller's open work |

Setting `status: "blocked"` **requires** `blocker_explanation` (400 otherwise; also
enforced by a DB constraint). `next_steps` feeds meeting agendas. Extra fields:
`priority`, `is_milestone`, `estimate_hours`, `percent_complete` (0-100, forced to
100 on `done`, drives earned value), `tags` (normalized to lowercase), `sort_order` (Kanban).
Each task also returns `logged_hours` (sum of time entries).

## Risk register (RAID) & EVM

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/projects/:id/risks` | risks/issues/assumptions/dependencies; `likelihood`×`impact` (1-5) → `severity` (1-25) |
| PATCH/DELETE | `/risks/:id` | project managers; high-severity (≥12) raises notify PM/BM + `risk.raised` webhook |

Earned Value Management is computed and returned with the project detail
(`GET /projects/:id` → `evm`) and aggregated per project in the dashboard
`portfolio` array: **BAC** (budget), **AC** (`actual_cost`), **EV** (budget ×
estimate-weighted % complete), **PV** (budget × schedule elapsed), **SV/SPI**,
**CV/CPI**, **EAC**, **VAC**, plus derived `schedule_health`, `cost_health` and
`scope_health` (from open high-severity risks).

## Meetings

| Method | Path | Notes |
|---|---|---|
| GET | `/meetings` (`?project_id=&upcoming=1`) | scoped list |
| POST | `/projects/:id/meetings` | `{title, scheduled_at, duration_minutes, attendee_ids…}` |
| GET | `/meetings/:id` | returns `{meeting, agenda, agenda_frozen}` — agenda is live until completed |
| PATCH | `/meetings/:id` | details, minutes, attendees |
| POST | `/meetings/:id/complete` | freezes the agenda snapshot as the permanent record |
| DELETE | `/meetings/:id` | team |

## Dashboards, reports, export

| Method | Path | Notes |
|---|---|---|
| GET | `/dashboard/summary` (`?branch_id=`) | RAG/status/task distributions, per-country health, 14-day deadlines |
| GET | `/reports/monthly?month=YYYY-MM[&branch_id=]` | PowerPoint (.pptx) download |
| GET | `/export/projects\|tasks\|audit-logs?format=csv\|json` | scoped; audit-logs admin-only |
| GET | `/search?q=` | projects/tasks/meetings, scoped |
| GET | `/audit-logs?limit=` | global admin |

## Notifications & webhooks

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | latest 50 + unread count |
| POST | `/notifications/:id/read`, `/notifications/read-all` | |
| GET/POST | `/webhooks` | global admin; POST returns the signing `secret` |
| PATCH/DELETE | `/webhooks/:id` | enable/disable, events, delete |
| POST | `/webhooks/:id/test` | dispatch a test delivery |
| GET | `/webhooks/deliveries/recent` | delivery log with status + attempts |
| GET | `/webhooks/events` | available event names |

Webhook deliveries are JSON `{event, occurred_at, data}` with headers
`X-ITPM360-Event` and `X-ITPM360-Signature: sha256=<HMAC-SHA256(secret, body)>`;
failed deliveries retry up to 3 times with backoff.

Events: `project.created`, `project.rag_changed`, `project.status_changed`,
`task.blocked`, `task.assigned`, `meeting.completed`.
