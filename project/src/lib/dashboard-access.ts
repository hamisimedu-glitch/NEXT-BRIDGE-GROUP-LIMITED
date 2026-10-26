export const DEPARTMENT_ROLES = ['hr', 'leads', 'finance', 'project_manager', 'it'] as const;
export type DepartmentRole = typeof DEPARTMENT_ROLES[number];
export type DashboardRole = DepartmentRole | 'admin' | 'owner' | 'staff' | 'client' | string;

export type DashboardTab =
  | 'overview'
  | 'hr'
  | 'leads'
  | 'finance'
  | 'sales'
  | 'payments'
  | 'commissions'
  | 'investments'
  | 'calculator'
  | 'project_management'
  | 'projects'
  | 'units'
  | 'construction'
  | 'updates'
  | 'it'
  | 'audit'
  | 'applications'
  | 'realtors'
  | 'documents'
  | 'support'
  | 'vault';

const ADMIN_TABS: readonly DashboardTab[] = [
  'overview', 'hr', 'leads', 'finance', 'sales', 'payments', 'commissions', 'investments', 'calculator',
  'project_management', 'projects', 'units', 'construction', 'updates', 'it', 'audit', 'applications',
  'realtors', 'documents', 'support', 'vault',
];

const ROLE_TABS: Partial<Record<DashboardRole, readonly DashboardTab[]>> = {
  admin: ADMIN_TABS,
  owner: ADMIN_TABS,
  hr: ['hr'],
  leads: ['leads'],
  finance: ['finance', 'sales', 'payments', 'applications', 'commissions', 'investments', 'calculator'],
  project_manager: ['project_management', 'projects', 'units', 'construction', 'updates'],
  it: ['it'],
};

const DEFAULT_TAB: Partial<Record<DashboardRole, DashboardTab>> = {
  admin: 'overview',
  owner: 'overview',
  hr: 'hr',
  leads: 'leads',
  finance: 'finance',
  project_manager: 'project_management',
  it: 'it',
};

export function dashboardTabsForRole(role: DashboardRole): readonly DashboardTab[] {
  return ROLE_TABS[role] ?? [];
}

export function canAccessDashboardTab(role: DashboardRole, tab: DashboardTab): boolean {
  return dashboardTabsForRole(role).includes(tab);
}

export function defaultDashboardTab(role: DashboardRole): DashboardTab | null {
  return DEFAULT_TAB[role] ?? null;
}

export function canManageDashboardRoles(role: DashboardRole): boolean {
  return role === 'admin' || role === 'owner';
}

export function canManageFinancialRecords(role: DashboardRole): boolean {
  return role === 'admin' || role === 'owner' || role === 'finance';
}

export function canManageProjectRecords(role: DashboardRole): boolean {
  return role === 'admin' || role === 'owner' || role === 'project_manager';
}