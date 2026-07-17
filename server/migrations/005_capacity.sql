-- Resource capacity: each person has a weekly availability used to compute
-- workload utilization in the capacity heatmap.
ALTER TABLE users ADD COLUMN weekly_capacity_hours numeric(5, 1) NOT NULL DEFAULT 40;
