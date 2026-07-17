-- Stakeholder register (power/interest grid) and RACI responsibility matrix.

CREATE TABLE stakeholders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        text NOT NULL,
  title       text,
  influence   integer NOT NULL DEFAULT 2 CHECK (influence BETWEEN 1 AND 3),  -- power
  interest    integer NOT NULL DEFAULT 2 CHECK (interest BETWEEN 1 AND 3),
  engagement  text,   -- engagement strategy / notes
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stakeholders_project_id_idx ON stakeholders (project_id);
CREATE TRIGGER stakeholders_updated_at BEFORE UPDATE ON stakeholders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TYPE raci_role AS ENUM ('responsible', 'accountable', 'consulted', 'informed');

CREATE TABLE raci_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  activity    text NOT NULL,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignment  raci_role NOT NULL,
  UNIQUE (project_id, activity, user_id)
);
CREATE INDEX raci_entries_project_id_idx ON raci_entries (project_id);
