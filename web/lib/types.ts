export type RoleName = 'global_admin' | 'branch_manager' | 'project_manager' | 'viewer';
export type Rag = 'green' | 'amber' | 'red';
export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';

export interface RoleAssignment {
  id?: string;
  role: RoleName;
  branch_id: string | null;
  branch_name?: string | null;
}

export interface Me {
  id: string;
  email: string;
  full_name: string;
  job_title: string | null;
  roles: RoleAssignment[];
}

export interface Country {
  id: string;
  name: string;
  iso_code: string;
  branch_count: number;
  created_at: string;
}

export interface Branch {
  id: string;
  country_id: string;
  country_name: string;
  iso_code: string;
  name: string;
  code: string;
  city: string | null;
  timezone: string;
  project_count: number;
}

export interface UserRow {
  id: string;
  email: string;
  full_name: string;
  job_title: string | null;
  is_active: boolean;
  created_at: string;
  roles: RoleAssignment[];
}

export interface ProjectMember {
  user_id: string;
  full_name: string;
  member_role: string;
}

export interface Project {
  id: string;
  branch_id: string;
  branch_name: string;
  branch_code: string;
  country_name: string;
  iso_code: string;
  name: string;
  description: string | null;
  project_manager_id: string;
  pm_name: string;
  rag_status: Rag;
  status: ProjectStatus;
  start_date: string | null;
  end_date: string | null;
  budget: string | null;
  actual_cost: string | null;
  progress: number;
  objectives: string | null;
  scope_in: string | null;
  scope_out: string | null;
  business_case: string | null;
  success_criteria: string | null;
  task_count: number;
  blocked_count: number;
  members: ProjectMember[];
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'in_review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TaskDependency {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface Task {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  assignee_id: string | null;
  assignee_name: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  start_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  blocker_explanation: string | null;
  next_steps: string | null;
  sort_order: number;
  is_milestone: boolean;
  estimate_hours: string | null;
  logged_hours: number;
  percent_complete: number;
  tags: string[];
  dependencies: TaskDependency[];
  project_name?: string;
  branch_code?: string;
}

export type RiskCategory = 'risk' | 'issue' | 'assumption' | 'dependency';
export type RiskStatus = 'open' | 'mitigating' | 'closed' | 'accepted';

export interface Risk {
  id: string;
  project_id: string;
  category: RiskCategory;
  title: string;
  description: string | null;
  likelihood: number;
  impact: number;
  severity: number;
  status: RiskStatus;
  owner_id: string | null;
  owner_name: string | null;
  mitigation_plan: string | null;
  due_date: string | null;
  closed_at: string | null;
  created_by_name: string | null;
  created_at: string;
}

export type Health = 'green' | 'amber' | 'red' | 'unknown';

export interface Evm {
  bac: number | null;
  ac: number | null;
  ev: number | null;
  pv: number | null;
  percent_complete: number | null;
  planned_percent: number | null;
  sv: number | null;
  spi: number | null;
  cv: number | null;
  cpi: number | null;
  eac: number | null;
  vac: number | null;
  schedule_health: Health;
  cost_health: Health;
  scope_health: Health;
  high_risk_count: number;
}

export interface PortfolioRow {
  id: string;
  name: string;
  rag_status: Rag;
  status: ProjectStatus;
  percent_complete: number | null;
  spi: number | null;
  cpi: number | null;
  budget: number | null;
  actual_cost: number | null;
  vac: number | null;
  schedule_health: Health;
  cost_health: Health;
}

export interface CapacityPerson {
  user_id: string;
  full_name: string;
  job_title: string | null;
  weekly_capacity: number;
  weeks: number[];
  unscheduled_hours: number;
  beyond_horizon_hours: number;
  open_tasks: number;
  total_remaining: number;
  logged_recent: number;
  peak_utilization: number | null;
  overallocated_weeks: number;
}

export interface CapacityData {
  week_starts: string[];
  people: CapacityPerson[];
}

export interface TimeEntry {
  id: string;
  task_id: string;
  user_id: string;
  user_name: string;
  hours: string;
  work_date: string;
  notes: string | null;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface Webhook {
  id: string;
  url: string;
  secret: string;
  events: string[];
  is_active: boolean;
  created_by_name: string | null;
  delivery_count: number;
  created_at: string;
}

export interface WebhookDelivery {
  id: number;
  subscription_id: string;
  url: string;
  event: string;
  response_status: number | null;
  attempts: number;
  delivered_at: string | null;
  created_at: string;
}

export interface SearchResult {
  type: 'project' | 'task' | 'meeting';
  id: string;
  name: string;
  context: string;
  href: string;
}

export interface AuditLog {
  id: number;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  changes: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  ip_address: string | null;
  created_at: string;
}

export type GrcType = 'governance' | 'risk' | 'compliance';
export type GrcStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'waived';

export interface GrcCheckpoint {
  id: string;
  project_id: string;
  checkpoint_type: GrcType;
  title: string;
  description: string | null;
  status: GrcStatus;
  due_date: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  notes: string | null;
}

export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface MeetingAttendee {
  user_id: string;
  full_name: string;
  attendance: 'invited' | 'attended' | 'absent';
}

export interface Meeting {
  id: string;
  project_id: string;
  project_name: string;
  rag_status: Rag;
  branch_name: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number;
  location: string | null;
  meeting_link: string | null;
  status: MeetingStatus;
  minutes: string | null;
  created_by_name: string | null;
  attendees: MeetingAttendee[];
}

export interface Agenda {
  generated_at: string;
  rag_status: Rag;
  project_status: ProjectStatus;
  blocked_tasks: { id: string; title: string; blocker_explanation: string; assignee_name: string | null }[];
  next_steps: { id: string; title: string; next_steps: string; status: TaskStatus; assignee_name: string | null }[];
  overdue_tasks: { id: string; title: string; due_date: string; assignee_name: string | null }[];
  open_grc_checkpoints: { id: string; title: string; checkpoint_type: GrcType; status: GrcStatus; due_date: string | null }[];
  top_risks: {
    id: string; title: string; category: RiskCategory; severity: number; likelihood: number; impact: number;
    status: RiskStatus; mitigation_plan: string | null; owner_name: string | null;
  }[];
}

export const isGlobalAdmin = (me: Me | null) =>
  !!me?.roles.some((r) => r.role === 'global_admin');

export const canManageBranch = (me: Me | null, branchId: string) =>
  isGlobalAdmin(me) || !!me?.roles.some((r) => r.branch_id === branchId && r.role === 'branch_manager');

export const canManageProject = (me: Me | null, p: Project) =>
  isGlobalAdmin(me) || canManageBranch(me, p.branch_id) || p.project_manager_id === me?.id;

export const canCreateProjects = (me: Me | null) =>
  isGlobalAdmin(me) ||
  !!me?.roles.some((r) => r.role === 'branch_manager' || r.role === 'project_manager');
