-- ITPM360 initial schema
-- Hierarchy: organization -> countries -> branches -> projects -> tasks
-- Plus: users + scoped RBAC, GRC checkpoints, meetings, audit log,
--       notifications, webhook subscriptions.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive emails

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('global_admin', 'branch_manager', 'project_manager', 'viewer');
CREATE TYPE rag_status AS ENUM ('green', 'amber', 'red');
CREATE TYPE project_status AS ENUM ('planning', 'active', 'on_hold', 'completed', 'cancelled');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'blocked', 'in_review', 'done');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE grc_type AS ENUM ('governance', 'risk', 'compliance');
CREATE TYPE grc_status AS ENUM ('pending', 'in_review', 'approved', 'rejected', 'waived');
CREATE TYPE meeting_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');
CREATE TYPE notification_type AS ENUM (
  'task_blocked', 'rag_downgrade', 'deadline_approaching',
  'task_assigned', 'meeting_scheduled', 'grc_checkpoint_due'
);
CREATE TYPE audit_action AS ENUM ('create', 'update', 'delete', 'status_change', 'login', 'export');

-- ---------------------------------------------------------------------------
-- updated_at helper
-- ---------------------------------------------------------------------------

CREATE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Organization hierarchy
-- ---------------------------------------------------------------------------

CREATE TABLE organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE countries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name             text NOT NULL,
  iso_code         char(2) NOT NULL,           -- ISO 3166-1 alpha-2
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, iso_code)
);
CREATE TRIGGER countries_updated_at BEFORE UPDATE ON countries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE branches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id  uuid NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  name        text NOT NULL,
  code        text NOT NULL,                   -- short branch code, e.g. "DE-BER"
  city        text,
  timezone    text NOT NULL DEFAULT 'UTC',     -- IANA tz, drives deadline notifications
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_id, code)
);
CREATE INDEX branches_country_id_idx ON branches (country_id);
CREATE TRIGGER branches_updated_at BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Users and scoped RBAC
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          citext NOT NULL UNIQUE,
  full_name      text NOT NULL,
  password_hash  text NOT NULL,
  job_title      text,
  avatar_url     text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A user can hold multiple roles at different scopes:
--   global_admin                  -> no scope (org-wide)
--   branch_manager                -> scoped to a branch
--   project_manager / viewer      -> scoped to a branch (project assignment
--                                    itself lives on projects/project_members)
CREATE TABLE user_roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        user_role NOT NULL,
  branch_id   uuid REFERENCES branches(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT role_scope_check CHECK (
    (role = 'global_admin' AND branch_id IS NULL)
    OR (role <> 'global_admin' AND branch_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX user_roles_unique_idx
  ON user_roles (user_id, role, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX user_roles_user_id_idx ON user_roles (user_id);
CREATE INDEX user_roles_branch_id_idx ON user_roles (branch_id);

-- ---------------------------------------------------------------------------
-- Projects
-- ---------------------------------------------------------------------------

CREATE TABLE projects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name                text NOT NULL,
  description         text,
  project_manager_id  uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rag_status          rag_status NOT NULL DEFAULT 'green',
  status              project_status NOT NULL DEFAULT 'planning',
  start_date          date,
  end_date            date,
  budget              numeric(14, 2),
  created_by          uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_dates_check CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX projects_branch_id_idx ON projects (branch_id);
CREATE INDEX projects_pm_idx ON projects (project_manager_id);
CREATE INDEX projects_rag_idx ON projects (rag_status);
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE project_members (
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  member_role text NOT NULL DEFAULT 'member',  -- free-form: developer, analyst, QA...
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);
CREATE INDEX project_members_user_id_idx ON project_members (user_id);

-- GRC (Governance, Risk, Compliance) checkpoints in the project lifecycle
CREATE TABLE grc_checkpoints (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  checkpoint_type  grc_type NOT NULL,
  title            text NOT NULL,
  description      text,
  status           grc_status NOT NULL DEFAULT 'pending',
  due_date         date,
  reviewed_by      uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX grc_checkpoints_project_id_idx ON grc_checkpoints (project_id);
CREATE INDEX grc_checkpoints_status_idx ON grc_checkpoints (status);
CREATE TRIGGER grc_checkpoints_updated_at BEFORE UPDATE ON grc_checkpoints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------

CREATE TABLE tasks (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title                text NOT NULL,
  description          text,
  assignee_id          uuid REFERENCES users(id) ON DELETE SET NULL,
  status               task_status NOT NULL DEFAULT 'todo',
  priority             task_priority NOT NULL DEFAULT 'medium',
  start_date           date,
  due_date             date,
  completed_at         timestamptz,
  blocker_explanation  text,   -- required (app + db) when status = 'blocked'
  next_steps           text,   -- feeds the meeting agenda
  sort_order           integer NOT NULL DEFAULT 0,  -- Kanban column ordering
  created_by           uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_dates_check CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
  CONSTRAINT blocked_needs_reason CHECK (status <> 'blocked' OR blocker_explanation IS NOT NULL)
);
CREATE INDEX tasks_project_id_idx ON tasks (project_id);
CREATE INDEX tasks_assignee_id_idx ON tasks (assignee_id);
CREATE INDEX tasks_status_idx ON tasks (status);
CREATE INDEX tasks_due_date_idx ON tasks (due_date) WHERE status NOT IN ('done');
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Meetings
-- ---------------------------------------------------------------------------

CREATE TABLE meetings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title             text NOT NULL,
  scheduled_at      timestamptz NOT NULL,
  duration_minutes  integer NOT NULL DEFAULT 30 CHECK (duration_minutes > 0),
  location          text,
  meeting_link      text,
  status            meeting_status NOT NULL DEFAULT 'scheduled',
  -- Frozen agenda context captured when the meeting starts/completes:
  -- { rag_status, blocked_tasks: [{id,title,blocker_explanation}], next_steps: [...] }
  -- Live meetings compute this on the fly; the snapshot preserves the record.
  agenda_snapshot   jsonb,
  minutes           text,
  created_by        uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meetings_project_id_idx ON meetings (project_id);
CREATE INDEX meetings_scheduled_at_idx ON meetings (scheduled_at);
CREATE TRIGGER meetings_updated_at BEFORE UPDATE ON meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE meeting_attendees (
  meeting_id  uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance  text NOT NULL DEFAULT 'invited'
              CHECK (attendance IN ('invited', 'attended', 'absent')),
  PRIMARY KEY (meeting_id, user_id)
);
CREATE INDEX meeting_attendees_user_id_idx ON meeting_attendees (user_id);

-- ---------------------------------------------------------------------------
-- Audit log (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id     uuid REFERENCES users(id) ON DELETE SET NULL,
  action       audit_action NOT NULL,
  entity_type  text NOT NULL,       -- 'project', 'task', 'meeting', ...
  entity_id    uuid,
  -- {"before": {...}, "after": {...}} — only changed fields
  changes      jsonb,
  ip_address   inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);
CREATE INDEX audit_logs_actor_idx ON audit_logs (actor_id);
CREATE INDEX audit_logs_created_at_idx ON audit_logs (created_at);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         notification_type NOT NULL,
  title        text NOT NULL,
  body         text,
  entity_type  text,                -- deep-link target
  entity_id    uuid,
  is_read      boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  read_at      timestamptz
);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id, created_at DESC) WHERE NOT is_read;

-- ---------------------------------------------------------------------------
-- Outbound webhooks (Phase 5 delivery engine; schema defined up front)
-- ---------------------------------------------------------------------------

CREATE TABLE webhook_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url         text NOT NULL,
  secret      text NOT NULL,        -- HMAC signing secret
  events      text[] NOT NULL,      -- e.g. {'project.rag_changed','task.blocked'}
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webhook_deliveries (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id  uuid NOT NULL REFERENCES webhook_subscriptions(id) ON DELETE CASCADE,
  event            text NOT NULL,
  payload          jsonb NOT NULL,
  response_status  integer,
  attempts         integer NOT NULL DEFAULT 0,
  delivered_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_deliveries_subscription_idx ON webhook_deliveries (subscription_id);
