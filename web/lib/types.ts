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
  task_count: number;
  blocked_count: number;
  members: ProjectMember[];
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'in_review' | 'done';
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

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
