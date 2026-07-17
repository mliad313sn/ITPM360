-- Common PM tooling: task dependencies, milestones, estimates, comments.

ALTER TABLE tasks ADD COLUMN is_milestone boolean NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN estimate_hours numeric(7,1);

-- Finish-to-start dependencies
CREATE TABLE task_dependencies (
  task_id             uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id  uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, depends_on_task_id),
  CONSTRAINT no_self_dependency CHECK (task_id <> depends_on_task_id)
);
CREATE INDEX task_dependencies_depends_on_idx ON task_dependencies (depends_on_task_id);

-- Task discussion threads
CREATE TABLE task_comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   uuid REFERENCES users(id) ON DELETE SET NULL,
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_comments_task_id_idx ON task_comments (task_id, created_at);
