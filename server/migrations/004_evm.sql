-- Earned Value Management (EVM) inputs.
-- BAC comes from projects.budget; AC is tracked here; EV is derived from
-- task percent-complete weighted by estimate.

ALTER TABLE projects ADD COLUMN actual_cost numeric(14, 2);

-- Per-task progress for weighted earned value and progress bars (0-100).
ALTER TABLE tasks ADD COLUMN percent_complete integer NOT NULL DEFAULT 0
  CHECK (percent_complete BETWEEN 0 AND 100);

-- Backfill: done tasks are 100% complete.
UPDATE tasks SET percent_complete = 100 WHERE status = 'done';
