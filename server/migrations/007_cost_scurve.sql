-- Cost breakdown line items and daily EVM snapshots for the S-curve.

CREATE TYPE cost_category AS ENUM ('labour', 'hardware', 'software', 'services', 'contingency', 'other');

CREATE TABLE cost_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category        cost_category NOT NULL DEFAULT 'other',
  label           text NOT NULL,
  planned_amount  numeric(14, 2) NOT NULL DEFAULT 0,
  actual_amount   numeric(14, 2) NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cost_lines_project_id_idx ON cost_lines (project_id);
CREATE TRIGGER cost_lines_updated_at BEFORE UPDATE ON cost_lines
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Time-phased EVM points (one row per project per day) for the S-curve.
CREATE TABLE evm_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  captured_on       date NOT NULL DEFAULT CURRENT_DATE,
  pv                numeric(14, 2),
  ev                numeric(14, 2),
  ac                numeric(14, 2),
  spi               numeric(6, 3),
  cpi               numeric(6, 3),
  percent_complete  numeric(5, 1),
  UNIQUE (project_id, captured_on)
);
CREATE INDEX evm_snapshots_project_idx ON evm_snapshots (project_id, captured_on);
