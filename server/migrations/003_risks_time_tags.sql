-- Risk register (RAID: risks, issues, assumptions, dependencies),
-- time tracking (actual hours logged against tasks), and task tags/labels.

-- --- Risk register --------------------------------------------------------

CREATE TYPE risk_category AS ENUM ('risk', 'issue', 'assumption', 'dependency');
CREATE TYPE risk_status AS ENUM ('open', 'mitigating', 'closed', 'accepted');

CREATE TABLE risks (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category         risk_category NOT NULL DEFAULT 'risk',
  title            text NOT NULL,
  description      text,
  -- classic 1-5 probability/impact scoring; severity is the product (1-25)
  likelihood       integer NOT NULL DEFAULT 3 CHECK (likelihood BETWEEN 1 AND 5),
  impact           integer NOT NULL DEFAULT 3 CHECK (impact BETWEEN 1 AND 5),
  severity         integer GENERATED ALWAYS AS (likelihood * impact) STORED,
  status           risk_status NOT NULL DEFAULT 'open',
  owner_id         uuid REFERENCES users(id) ON DELETE SET NULL,
  mitigation_plan  text,
  due_date         date,
  closed_at        timestamptz,
  created_by       uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX risks_project_id_idx ON risks (project_id);
CREATE INDEX risks_severity_idx ON risks (severity) WHERE status IN ('open', 'mitigating');
CREATE TRIGGER risks_updated_at BEFORE UPDATE ON risks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- --- Time tracking --------------------------------------------------------

CREATE TABLE time_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hours       numeric(6, 2) NOT NULL CHECK (hours > 0 AND hours <= 24),
  work_date   date NOT NULL DEFAULT CURRENT_DATE,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX time_entries_task_id_idx ON time_entries (task_id);
CREATE INDEX time_entries_user_date_idx ON time_entries (user_id, work_date);

-- --- Task tags ------------------------------------------------------------

ALTER TABLE tasks ADD COLUMN tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX tasks_tags_idx ON tasks USING gin (tags);

-- New notification kind for a newly-raised high-severity risk.
-- (Added value is only USED at runtime, never within this transaction.)
ALTER TYPE notification_type ADD VALUE 'risk_raised';
