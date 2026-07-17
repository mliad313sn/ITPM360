-- Work breakdown structure: tasks can nest under a parent task.
ALTER TABLE tasks ADD COLUMN parent_task_id uuid REFERENCES tasks(id) ON DELETE CASCADE;
CREATE INDEX tasks_parent_id_idx ON tasks (parent_task_id);
