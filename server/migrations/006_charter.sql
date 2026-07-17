-- Project charter / initiation fields (objectives, scope, business case).
ALTER TABLE projects ADD COLUMN objectives        text;
ALTER TABLE projects ADD COLUMN scope_in          text;
ALTER TABLE projects ADD COLUMN scope_out         text;
ALTER TABLE projects ADD COLUMN business_case     text;
ALTER TABLE projects ADD COLUMN success_criteria  text;
