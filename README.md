# ITPM360 — Multi-Country IT Project Management

Enterprise IT project management for a global organization: countries → branches → projects → tasks, with RBAC, GRC checkpoints, meeting hub, dashboards, reporting, and audit logging.

## Features

- **Hierarchy & RBAC** — organization → countries → branches → projects; scoped roles
  (Global Admin, Branch Manager, Project Manager, Viewer) enforced on every endpoint
- **Projects** — RAG health, lifecycle status, PM + team, budget, GRC checkpoints
  (governance / risk / compliance gates with review workflow)
- **Tasks** — assignee, timeline, priority, milestones, estimates, finish-to-start
  dependencies (cycle-safe), comments, and enforced **blocker explanations** + next steps
- **Meeting Hub** — agendas auto-built from live project data (RAG, blockers with
  reasons, next steps, overdue work, open GRC gates), frozen as a permanent record on completion
- **Dashboards** — global executive and branch-level views; RAG donut, status and
  country charts, drag-and-drop Kanban, Gantt timeline with milestones and today marker
- **Monthly Report Generator** — one-click PowerPoint deck (portfolio summary + one slide per project)
- **Notifications** — blocked tasks, RAG downgrades, approaching deadlines (hourly scanner),
  assignments, meeting invites, GRC due dates; in-app bell with unread badge
- **Integrations** — HMAC-signed webhooks with delivery log and retries, CSV/JSON exports,
  full REST API; ⌘K command palette, My Tasks workload view, admin audit-log viewer

## Stack

| Layer    | Technology                                      |
| -------- | ----------------------------------------------- |
| Backend  | Node.js 22, Express, PostgreSQL 16 (`pg`)       |
| Frontend | Next.js (App Router, SSR) + Tailwind CSS        |
| Auth     | JWT sessions, role-based access control          |

## Repository layout

```
server/           Node.js REST API
  migrations/     SQL migrations (schema source of truth)
  src/            Express app, db pool, migration runner
web/              Next.js frontend
docs/SCHEMA.md    Database schema documentation (ERD + rationale)
```

## Getting started

### 1. Database

```bash
createdb itpm360
```

### 2. Backend

```bash
cd server
cp .env.example .env   # adjust DATABASE_URL if needed
npm install
npm run migrate        # applies migrations/*.sql
npm run seed           # demo data — all users share password: Password123!
npm run dev            # http://localhost:4000
```

Seeded logins: `admin@itpm360.dev` (Global Admin), `lena.mueller@itpm360.dev` (Branch
Manager DE-BER), `raj.patel@itpm360.dev` (PM DE-BER/DE-MUC), `sofia.garcia@itpm360.dev`
(PM US-NYC), `wei.tan@itpm360.dev` (BM+PM SG-SIN), `dana.kim@itpm360.dev` (Viewer).

### 3. Frontend

```bash
cd web
npm install
npm run dev            # http://localhost:3000
```

## Development phases

- [x] **Phase 1** — Backend init, PostgreSQL schema proposal, frontend boilerplate
- [x] **Phase 2** — CRUD endpoints + UI: Countries, Branches, Users, Projects
- [x] **Phase 3** — Tasks, blocker mechanics, Meeting Hub
- [x] **Phase 4** — Dashboards (Gantt, Kanban, status charts), monthly slide report generator
- [x] **Phase 5** — Notification engine, webhooks, data export, UI polish
