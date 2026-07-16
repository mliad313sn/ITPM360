# ITPM360 — Multi-Country IT Project Management

Enterprise IT project management for a global organization: countries → branches → projects → tasks, with RBAC, GRC checkpoints, meeting hub, dashboards, reporting, and audit logging.

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
npm run dev            # http://localhost:4000
```

### 3. Frontend

```bash
cd web
npm install
npm run dev            # http://localhost:3000
```

## Development phases

- [x] **Phase 1** — Backend init, PostgreSQL schema proposal, frontend boilerplate
- [ ] **Phase 2** — CRUD endpoints + UI: Countries, Branches, Users, Projects
- [ ] **Phase 3** — Tasks, blocker mechanics, Meeting Hub
- [ ] **Phase 4** — Dashboards (Gantt, Kanban, status charts), monthly slide report generator
- [ ] **Phase 5** — Notification engine, webhooks, UI polish
