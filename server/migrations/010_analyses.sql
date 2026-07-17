-- Structured analysis artifacts (SWOT, 5-Whys root cause, gap analysis).
CREATE TABLE project_analyses (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  analysis_type  text NOT NULL CHECK (analysis_type IN ('swot', 'root_cause', 'gap')),
  content        jsonb NOT NULL DEFAULT '{}',
  updated_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, analysis_type)
);
CREATE INDEX project_analyses_project_idx ON project_analyses (project_id);
