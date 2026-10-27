import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Activity, AlertCircle, Briefcase, Building2, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, Download, FileText, LayoutDashboard, LogOut, Mail, Menu, Phone, Plus, RefreshCw, Search, ShieldCheck, Users, UserPlus, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { DEPARTMENT_ROLES, type DepartmentRole } from '@/lib/dashboard-access';
import type { AdminUser } from '@/lib/auth';
import DashboardInbox from '@/DashboardInbox';
import { FinancialPrivacyToggle } from '@/lib/financial-privacy';
import { FeatureState, NbgLoader } from '@/WorkspaceStates';

type StaffRow = { user_id: string; full_name: string | null; email: string; phone: string | null; role: string; created_at: string };
type WorkforceTab = 'overview' | 'directory' | 'departments' | 'access' | 'attendance' | 'leave' | 'documents' | 'performance';
type InviteDraft = { full_name: string; email: string; phone: string; role: string };

const roleLabels: Record<string, string> = {
  admin: 'Primary Admin', owner: 'Admin / Owner', client: 'Client account', hr: 'Human Resources', leads: 'Sales & Marketing',
  finance: 'Finance', project_manager: 'Project Management', it: 'IT', staff: 'Unassigned',
};
const roleOptions: DepartmentRole[] = ['hr', 'leads', 'finance', 'project_manager', 'it'];
const tabs: { id: WorkforceTab; label: string; available: boolean }[] = [
  { id: 'overview', label: 'Overview', available: true },
  { id: 'directory', label: 'Staff Directory', available: true },
  { id: 'departments', label: 'Departments', available: true },
  { id: 'attendance', label: 'Attendance', available: false },
  { id: 'leave', label: 'Leave & Requests', available: false },
  { id: 'access', label: 'Access & Roles', available: true },
  { id: 'documents', label: 'Documents', available: false },
  { id: 'performance', label: 'Performance', available: false },
];
const tabIcons: Record<WorkforceTab, typeof Users> = {
  overview: LayoutDashboard,
  directory: Users,
  departments: Building2,
  attendance: CalendarDays,
  leave: Clock3,
  access: ShieldCheck,
  documents: FileText,
  performance: Activity,
};
const roleDepartment: Record<string, string> = {
  hr: 'HR', leads: 'Sales & Marketing', finance: 'Finance', project_manager: 'Project Management',
  it: 'IT', owner: 'Operations', admin: 'Operations', staff: 'Unassigned',
};
const pageSize = 7;

function profileIsComplete(row: StaffRow) {
  return Boolean(row.full_name?.trim() && row.phone?.trim());
}

function initials(name: string | null | undefined, email: string) {
  const value = name?.trim() || email;
  return value.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '•';
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function exportWorkforceCsv(rows: StaffRow[]) {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = [
    ['Employee ID', 'Full name', 'Email', 'Phone', 'Department', 'Dashboard role', 'Profile setup', 'Joined'],
    ...rows.map((row) => [row.user_id, row.full_name || '', row.email, row.phone || '', roleDepartment[row.role] || 'Unassigned', roleLabels[row.role] || row.role, profileIsComplete(row) ? 'Complete' : 'Needs details', row.created_at]),
  ];
  const blob = new Blob([`\uFEFF${lines.map((line) => line.map((value) => quote(String(value))).join(',')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'nbg-workforce-report.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function HRWorkforceDashboard({ canAssignRoles, user, onSignOut, onOpenAdminWorkspace }: { canAssignRoles: boolean; user: AdminUser; onSignOut: () => void; onOpenAdminWorkspace: () => void }) {
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState<WorkforceTab>('directory');
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [profileFilter, setProfileFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState<'name' | 'newest'>('newest');
  const [cardView, setCardView] = useState(false);
  const [page, setPage] = useState(1);
  const [draftRoles, setDraftRoles] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteDraft, setInviteDraft] = useState<InviteDraft>({ full_name: '', email: '', phone: '', role: 'staff' });
  const [inviteError, setInviteError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const { data, error: loadError } = await supabase.rpc(canAssignRoles ? 'get_dashboard_role_candidates' : 'get_dashboard_staff_directory');
      if (loadError) setError(`Staff directory could not be loaded: ${loadError.message}`);
      else {
        const rows = (data ?? []) as StaffRow[];
        setStaff(rows);
        setDraftRoles(Object.fromEntries(rows.map((row) => [row.user_id, row.role])));
        setError('');
      }
    } catch (loadError) {
      setError(`Staff directory could not be loaded: ${loadError instanceof Error ? loadError.message : String(loadError)}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canAssignRoles]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel('hr-workforce-directory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_staff_directory_events' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const employees = useMemo(() => staff.filter((row) => row.role !== 'client'), [staff]);
  const clientAccounts = useMemo(() => canAssignRoles ? staff.filter((row) => row.role === 'client') : [], [canAssignRoles, staff]);
  const assigned = employees.filter((row) => DEPARTMENT_ROLES.includes(row.role as DepartmentRole));
  const unassigned = employees.filter((row) => row.role === 'staff');
  const completeProfiles = employees.filter(profileIsComplete);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const newThisMonth = employees.filter((row) => new Date(row.created_at) >= monthStart).length;
  const departmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    employees.forEach((row) => {
      const department = roleDepartment[row.role] || 'Unassigned';
      counts[department] = (counts[department] ?? 0) + 1;
    });
    return Object.entries(counts).sort((left, right) => right[1] - left[1]);
  }, [employees]);
  const filteredStaff = useMemo(() => {
    const query = search.trim().toLowerCase();
    return employees.filter((row) => {
      if (query && !`${row.full_name ?? ''} ${row.email} ${row.phone ?? ''} ${row.user_id}`.toLowerCase().includes(query)) return false;
      if (departmentFilter !== 'ALL' && (roleDepartment[row.role] || 'Unassigned') !== departmentFilter) return false;
      if (roleFilter !== 'ALL' && row.role !== roleFilter) return false;
      if (profileFilter === 'COMPLETE' && !profileIsComplete(row)) return false;
      if (profileFilter === 'NEEDS_DETAILS' && profileIsComplete(row)) return false;
      return true;
    }).sort((left, right) => sortBy === 'name'
      ? (left.full_name || left.email).localeCompare(right.full_name || right.email)
      : new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
  }, [employees, search, departmentFilter, roleFilter, profileFilter, sortBy]);
  const pageCount = Math.max(1, Math.ceil(filteredStaff.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleStaff = filteredStaff.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const completeness = employees.length ? Math.round(completeProfiles.length / employees.length * 100) : 0;

  const saveRole = async (row: StaffRow) => {
    if (row.user_id === user.id || row.email.toLowerCase() === 'hamisimedu@gmail.com') {
      setMessage('This account cannot be reassigned.');
      return;
    }
    const role = draftRoles[row.user_id] || 'staff';
    setSavingId(row.user_id);
    setMessage('');
    try {
      const { error: saveError } = await supabase.rpc('assign_dashboard_role', { p_user_id: row.user_id, p_role: role });
      if (saveError) { setMessage(`Role was not changed: ${saveError.message}`); return; }
      setMessage(`Dashboard assignment updated for ${row.full_name || row.email}.`);
      await load();
    } catch (saveError) {
      setMessage(`Role was not changed: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
    } finally {
      setSavingId('');
    }
  };

  const submitInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviting(true);
    setInviteError('');
    try {
      const { data, error: functionError } = await supabase.functions.invoke<{ employee?: StaffRow; message?: string; error?: string }>('invite-staff', { body: inviteDraft });
      if (functionError || !data?.employee) {
        setInviteError(data?.error || functionError?.message || 'The staff invitation could not be sent.');
        return;
      }
      setMessage(data.message || `Invitation sent to ${inviteDraft.email}.`);
      setInviteOpen(false);
      setInviteDraft({ full_name: '', email: '', phone: '', role: 'staff' });
      await load();
    } catch (inviteFailure) {
      setInviteError(inviteFailure instanceof Error ? inviteFailure.message : 'The staff invitation could not be sent.');
    } finally {
      setInviting(false);
    }
  };

  const openInvite = (role = 'staff') => {
    setInviteDraft({ full_name: '', email: '', phone: '', role });
    setInviteError('');
    setInviteOpen(true);
  };

  const setDirectoryFilter = (department: string) => {
    setDepartmentFilter(department);
    setRoleFilter('ALL');
    setActiveTab('directory');
    setPage(1);
  };

  const tabsBar = <nav aria-label="People workspace" className="flex min-w-0 gap-1 overflow-x-auto border-b border-[#dce5ed]">
    {tabs.map((tab) => <button key={tab.id} type="button" disabled={!tab.available} title={tab.available ? undefined : 'This information is not tracked in the platform yet.'} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => { if (!tab.available) return; setActiveTab(tab.id); }} className={`shrink-0 border-b-2 px-3 py-3 text-[10px] font-semibold ${activeTab === tab.id ? 'border-[#087f88] text-[#087f88]' : tab.available ? 'border-transparent text-[#617b8e] hover:text-[#123b4b]' : 'cursor-not-allowed border-transparent text-slate-300'}`}>{tab.label}{!tab.available && <span className="ml-1 text-[8px]">Not tracked</span>}</button>)}
  </nav>;

  return <div className="min-h-screen bg-[#f3f3ef] text-[#18334c]">
    <header className="fixed inset-x-0 top-0 z-50 flex h-12 items-center border-b border-[#d9d8d2] bg-[#f7f6f2]">
      <div className="flex h-full w-[136px] shrink-0 items-center gap-2 border-r border-[#e5e3dc] px-2 sm:w-[156px] sm:px-3">
        <img src="/NBG_LOGO-removebg-preview.png" alt="Next Bridge Group" className="size-8 object-contain" />
        <div className="min-w-0"><p className="truncate font-serif text-sm font-semibold leading-tight text-[#17334e]">HR Department</p><p className="truncate text-[6px] uppercase tracking-[.12em] text-[#8797a0]">People · Culture · Growth</p></div>
      </div>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 px-3 lg:justify-between lg:px-4">
        <button type="button" onClick={() => setSidebarOpen((open) => !open)} aria-label="Toggle people navigation" aria-expanded={sidebarOpen} className="grid size-8 shrink-0 place-items-center text-[#31546b] lg:hidden"><Menu size={17} /></button>
        <label className="relative hidden min-w-0 max-w-[410px] flex-1 lg:block">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8193a3]" />
          <input aria-label="Search employees, departments, roles, or anything" value={search} onFocus={() => setActiveTab('directory')} onChange={(event) => { setSearch(event.target.value); setPage(1); setActiveTab('directory'); }} placeholder="Search employees, departments, roles, or anything..." className="h-8 w-full border border-[#d8e0e5] bg-white pl-8 pr-3 text-[9px] text-[#173b59] outline-none placeholder:text-[#91a0aa] focus:border-[#087f88]" />
        </label>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          {canAssignRoles && <span className="hidden lg:inline-flex"><FinancialPrivacyToggle /></span>}
          {canAssignRoles && <DashboardInbox user={user} mode="staff" />}
          <button type="button" onClick={() => setActiveTab('overview')} aria-label="Open people overview" title="People overview" className="hidden size-8 place-items-center text-[#526d82] hover:bg-white sm:grid"><CircleHelp size={15} /></button>
          <a href="https://wa.me/254741121575" target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 border border-[#e4e5df] bg-white px-2 text-[9px] font-semibold text-[#31546b] hover:border-[#1da978] hover:text-[#168c67]"><span className="grid size-4 place-items-center rounded-full bg-[#20b77a] text-white"><span className="text-[8px]">W</span></span><span className="hidden sm:inline">WhatsApp</span></a>
          <span className="grid size-7 place-items-center rounded-full bg-[#102b45] text-[8px] font-semibold text-white">{initials(user.full_name, user.email)}</span>
          <div className="hidden max-w-[110px] sm:block"><p className="truncate text-[9px] font-semibold text-[#173b59]">{user.full_name || user.email.split('@')[0]}</p><p className="truncate text-[8px] text-[#8193a3]">{canAssignRoles ? 'Admin' : 'HR'}</p></div>
          <button type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out" className="grid size-8 place-items-center text-[#526d82] hover:bg-white"><LogOut size={14} /></button>
        </div>
      </div>
    </header>
    {sidebarOpen && <button type="button" aria-label="Close people navigation" onClick={() => setSidebarOpen(false)} className="fixed inset-x-0 bottom-0 top-12 z-20 bg-[#071a27]/40 lg:hidden" />}
    <aside className={`fixed bottom-0 left-0 top-12 z-30 flex w-[156px] flex-col bg-[#102b45] text-white transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
      <nav aria-label="People navigation" className="flex-1 overflow-y-auto py-3">
        {tabs.map(({ id, label, available }) => {
          const Icon = tabIcons[id];
          return <button key={id} type="button" disabled={!available} title={available ? label : `${label} data is not tracked yet`} aria-current={activeTab === id ? 'page' : undefined} onClick={() => { setActiveTab(id); setSidebarOpen(false); }} className={`relative flex min-h-8 w-full items-center gap-2 border-l-[3px] px-3 text-left text-[9px] transition-colors ${activeTab === id ? 'border-[#22c2bd] bg-[#155b70] font-semibold text-white' : available ? 'border-transparent text-white/70 hover:bg-white/8 hover:text-white' : 'cursor-not-allowed border-transparent text-white/30'}`}><Icon size={13} /><span className="min-w-0 flex-1 truncate">{label}</span></button>;
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        {canAssignRoles && <button type="button" onClick={onOpenAdminWorkspace} className="mb-2 flex min-h-8 w-full items-center gap-2 px-1 text-left text-[8px] font-semibold text-white/65 hover:text-white"><LayoutDashboard size={13} /> Admin workspace</button>}
        <div className="flex items-center gap-2 border-t border-white/10 pt-2"><img src="/NBG_LOGO-removebg-preview.png" alt="" className="size-7 shrink-0 object-contain" /><div className="min-w-0"><p className="truncate text-[8px] font-semibold text-white/85">Ocean Mist Apartments</p><p className="truncate text-[7px] text-white/45">Building People. Building Success.</p></div></div>
      </div>
    </aside>
    <main className="min-h-screen pt-12 lg:pl-[156px]">
      <div className="mx-auto max-w-[1700px] space-y-3 px-4 py-4 text-[#18334c] xl:px-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#087f88]">HR Department</p><h1 className="mt-1 font-serif text-3xl font-semibold text-[#123b4b]">People &amp; Workforce</h1><p className="mt-1 text-xs text-[#71879a]">Manage staff profiles, department access and workforce records.</p></div>
      <div className="flex flex-wrap items-center gap-2">
        {canAssignRoles && <><button type="button" onClick={() => openInvite()} className="inline-flex h-9 items-center gap-2 bg-[#087f88] px-3 text-[10px] font-semibold text-white hover:bg-[#066f77]"><Plus size={14} /> Add Employee</button><button type="button" onClick={() => openInvite('staff')} className="inline-flex h-9 items-center gap-2 border border-[#9bcbd0] bg-white px-3 text-[10px] font-semibold text-[#087f88] hover:bg-[#eef9f8]"><UserPlus size={14} /> Invite Staff</button></>}
        <button type="button" onClick={() => exportWorkforceCsv(employees)} className="inline-flex h-9 items-center gap-2 border border-[#d4dce3] bg-white px-3 text-[10px] font-semibold text-[#526d82] hover:bg-[#f7fafc]"><Download size={14} /> Export Report</button>
        <button type="button" onClick={() => void load()} disabled={refreshing} aria-label="Refresh people data" title="Refresh people data" className="grid size-9 place-items-center border border-[#d4dce3] bg-white text-[#526d82] disabled:opacity-50"><RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /></button>
      </div>
    </header>

    <section aria-label="Workforce metrics" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <Metric icon={Users} label="Total employees" value={employees.length} detail="Non-client platform profiles" tone="blue" />
      <Metric icon={CheckCircle2} label="Assigned roles" value={assigned.length} detail="Department dashboard access" tone="green" />
      <Metric icon={AlertCircle} label="Unassigned roles" value={unassigned.length} detail="Staff profiles needing assignment" tone="amber" />
      <Metric icon={Activity} label="New this month" value={newThisMonth} detail="Profiles created this month" tone="cyan" />
      <Metric icon={ShieldCheck} label="Profile setup" value={`${completeness}%`} detail={`${completeProfiles.length} with name and phone`} tone="navy" progress={completeness} />
    </section>

    {tabsBar}
    {unassigned.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border border-[#f1d19a] bg-[#fff8e9] px-3 py-2 text-[9px] text-[#9a5b0a]"><span className="flex items-center gap-2"><AlertCircle size={13} /> {unassigned.length} staff {unassigned.length === 1 ? 'account needs' : 'accounts need'} department or dashboard assignment</span><button type="button" onClick={() => { setRoleFilter('staff'); setDepartmentFilter('ALL'); setActiveTab('directory'); setPage(1); }} className="font-semibold underline underline-offset-2">Review assignments <span aria-hidden="true">→</span></button></div>}
    {message && <div role="status" className="flex items-center justify-between gap-3 border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] text-emerald-800"><span>{message}</span><button type="button" aria-label="Dismiss message" onClick={() => setMessage('')}><X size={13} /></button></div>}
    {!canAssignRoles && <div className="flex items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800"><ShieldCheck size={14} /> Role changes and staff invitations are restricted to an authorized Admin/Owner.</div>}

    {activeTab === 'directory' || activeTab === 'access' ? <div className="grid items-start gap-3 min-[1180px]:grid-cols-[minmax(0,1fr)_250px]">
      <section className="min-w-0 border border-[#dce5ed] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e7edf2] px-3 py-3"><div><h2 className="text-xs font-semibold text-[#173b59]">{activeTab === 'access' ? 'Access & Roles' : 'Staff Directory'}</h2><p className="mt-1 text-[9px] text-[#8193a3]">Live profiles from the platform · {filteredStaff.length} matching records</p></div><div role="group" aria-label="Directory layout" className="flex border border-[#dce5ed] p-0.5"><button type="button" aria-pressed={!cardView} onClick={() => setCardView(false)} className={`px-2 py-1.5 text-[9px] font-semibold ${!cardView ? 'bg-[#087f88] text-white' : 'text-slate-500'}`}>Table View</button><button type="button" aria-pressed={cardView} onClick={() => setCardView(true)} className={`px-2 py-1.5 text-[9px] font-semibold ${cardView ? 'bg-[#e7f3f7] text-[#176c9b]' : 'text-slate-500'}`}>Card View</button></div></div>
        <div className="grid gap-2 border-b border-[#e7edf2] p-3 sm:grid-cols-2 lg:grid-cols-[minmax(150px,1.4fr)_repeat(4,minmax(90px,1fr))]">
          <label className="relative"><Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8193a3]" /><input aria-label="Search by name, email or employee ID" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by name, email or employee ID..." className="admin-input h-8 w-full pl-8 text-[9px]" /></label>
          <select aria-label="Filter by department" value={departmentFilter} onChange={(event) => { setDepartmentFilter(event.target.value); setPage(1); }} className="admin-input h-8 text-[9px]"><option value="ALL">All Departments</option>{[...new Set(Object.values(roleDepartment))].map((department) => <option key={department} value={department}>{department}</option>)}</select>
          <select aria-label="Filter by role" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1); }} className="admin-input h-8 text-[9px]"><option value="ALL">All Roles</option>{[...new Set(employees.map((row) => row.role))].map((role) => <option key={role} value={role}>{roleLabels[role] || role}</option>)}</select>
          <select aria-label="Filter profile setup" value={profileFilter} onChange={(event) => { setProfileFilter(event.target.value); setPage(1); }} className="admin-input h-8 text-[9px]"><option value="ALL">All Profiles</option><option value="COMPLETE">Profile complete</option><option value="NEEDS_DETAILS">Needs details</option></select>
          <select aria-label="Sort staff directory" value={sortBy} onChange={(event) => setSortBy(event.target.value as 'name' | 'newest')} className="admin-input h-8 text-[9px]"><option value="newest">Recently added</option><option value="name">Name A–Z</option></select>
        </div>
        {canAssignRoles && !loading && !error && clientAccounts.length > 0 && <ClientAccountPromotion rows={clientAccounts} draftRoles={draftRoles} savingId={savingId} currentUserId={user.id} onRoleChange={(userId, role) => setDraftRoles((current) => ({ ...current, [userId]: role }))} onSave={(row) => void saveRole(row)} />}
        <DashboardState loading={loading} error={error} onRetry={() => void load()} />
        {!loading && !error && (cardView ? <div className="grid gap-2 bg-[#f7fafc] p-3 sm:grid-cols-2 xl:grid-cols-3">{visibleStaff.map((row) => <StaffCard key={row.user_id} row={row} canAssignRoles={canAssignRoles} role={draftRoles[row.user_id] || row.role} saving={savingId === row.user_id} onRoleChange={(role) => setDraftRoles((current) => ({ ...current, [row.user_id]: role }))} onSave={() => void saveRole(row)} />)}{visibleStaff.length === 0 && <EmptyState />}</div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] table-fixed text-left text-[9px] leading-tight"><colgroup><col className="w-[23%]" /><col className="w-[21%]" /><col className="w-[14%]" /><col className="w-[16%]" /><col className="w-[11%]" /><col className="w-[9%]" /><col className="w-[6%]" /></colgroup><thead className="bg-[#f4f7f9] text-[8px] uppercase tracking-[.06em] text-[#71879a]"><tr>{['Employee', 'Contact', 'Department', 'Dashboard role', 'Profile', 'Joined', 'Actions'].map((label) => <th key={label} className="px-2 py-2.5 font-semibold">{label}</th>)}</tr></thead><tbody>{visibleStaff.map((row) => { const role = draftRoles[row.user_id] || row.role; const dirty = role !== row.role; const complete = profileIsComplete(row); return <tr key={row.user_id} className="border-t border-[#edf1f4] hover:bg-[#f8fbfd]"><td className="px-2 py-2"><div className="flex min-w-0 items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-sky-100 text-[9px] font-bold text-sky-700">{initials(row.full_name, row.email)}</span><div className="min-w-0"><strong className="block truncate text-[9px] font-semibold text-[#173b59]">{row.full_name || 'Name not provided'}</strong><span className="mt-0.5 block truncate font-mono text-[8px] text-[#8a9baa]">EMP-{row.user_id.slice(0, 6).toUpperCase()}</span></div></div></td><td className="px-2 py-2 text-[#60788b]"><div className="flex min-w-0 items-center gap-1"><Mail size={9} className="shrink-0" /><span className="truncate" title={row.email}>{row.email}</span></div><div className="mt-1 flex min-w-0 items-center gap-1"><Phone size={9} className="shrink-0" /><span className="truncate">{row.phone || 'No phone recorded'}</span></div></td><td className="px-2 py-2 text-[#60788b]">{roleDepartment[row.role] || 'Unassigned'}</td><td className="px-2 py-2">{canAssignRoles && row.role !== 'admin' ? <select aria-label={`Dashboard role for ${row.full_name || row.email}`} value={role} onChange={(event) => setDraftRoles((current) => ({ ...current, [row.user_id]: event.target.value }))} className="admin-input h-7 w-full min-w-0 text-[8px]"><option value="staff">Unassigned</option>{roleOptions.map((option) => <option key={option} value={option}>{roleLabels[option]}</option>)}{row.role === 'owner' && <option value="owner">Admin / Owner</option>}</select> : <span className="inline-flex rounded-full bg-sky-100 px-2 py-1 text-[8px] font-semibold text-sky-800">{roleLabels[role] || role}</span>}</td><td className="px-2 py-2"><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[8px] font-semibold ${complete ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}><span className={`size-1.5 rounded-full ${complete ? 'bg-emerald-600' : 'bg-amber-600'}`} />{complete ? 'Complete' : 'Needs details'}</span></td><td className="whitespace-nowrap px-2 py-2 text-[#71879a]">{shortDate(row.created_at)}</td><td className="px-2 py-2">{canAssignRoles && row.role !== 'admin' && <button type="button" disabled={!dirty || savingId === row.user_id} onClick={() => void saveRole(row)} aria-label={`Save role for ${row.full_name || row.email}`} className="inline-flex h-7 items-center gap-1 bg-[#087f88] px-2 text-[8px] font-semibold text-white disabled:opacity-40">{savingId === row.user_id ? <RefreshCw size={10} className="animate-spin" /> : <Check size={10} />}Save</button>}</td></tr>; })}{visibleStaff.length === 0 && <tr><td colSpan={7}><EmptyState /></td></tr>}</tbody></table></div>)}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e7edf2] px-3 py-2 text-[9px] text-[#71879a]"><span>Showing {filteredStaff.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filteredStaff.length)} of {filteredStaff.length} employees</span><nav aria-label="Staff directory pages" className="flex items-center gap-1"><button type="button" aria-label="Previous page" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="grid size-7 place-items-center border border-[#dce5ed] disabled:opacity-40"><ChevronLeft size={13} /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" aria-current={pageNumber === currentPage ? 'page' : undefined} onClick={() => setPage(pageNumber)} className={`grid size-7 place-items-center border text-[9px] ${pageNumber === currentPage ? 'border-[#087f88] bg-[#087f88] text-white' : 'border-[#dce5ed] text-[#526d82]'}`}>{pageNumber}</button>)}<button type="button" aria-label="Next page" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="grid size-7 place-items-center border border-[#dce5ed] disabled:opacity-40"><ChevronRight size={13} /></button></nav></div>
      </section>
      <PeopleInsights employees={employees} departmentCounts={departmentCounts} completeProfiles={completeProfiles.length} onDepartmentClick={setDirectoryFilter} onUnassignedClick={() => { setRoleFilter('staff'); setDepartmentFilter('ALL'); setActiveTab('directory'); setPage(1); }} />
    </div> : activeTab === 'departments' ? <DepartmentsView departmentCounts={departmentCounts} employees={employees} onOpenDepartment={setDirectoryFilter} /> : activeTab === 'overview' ? <OverviewView employees={employees} departmentCounts={departmentCounts} onNavigate={setDirectoryFilter} onOpenDirectory={() => setActiveTab('directory')} /> : <UntrackedView tab={activeTab} />}

    {inviteOpen && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#071a27]/55 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setInviteOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="staff-invite-title" className="w-full max-w-lg border border-[#dce5ed] bg-white shadow-2xl"><header className="flex items-start justify-between border-b border-[#e7edf2] px-5 py-4"><div><p className="text-[9px] font-bold uppercase tracking-[.14em] text-[#087f88]">People &amp; Workforce</p><h2 id="staff-invite-title" className="mt-1 text-base font-semibold text-[#173b59]">Invite employee</h2><p className="mt-1 text-[10px] text-slate-500">A secure account setup link will be sent to the employee.</p></div><button type="button" onClick={() => setInviteOpen(false)} aria-label="Close invite employee dialog" className="grid size-8 place-items-center text-slate-500 hover:bg-slate-50"><X size={16} /></button></header><form onSubmit={(event) => void submitInvite(event)} className="grid gap-3 p-5"><label className="grid gap-1 text-[10px] font-semibold text-[#526d82]">Full name<input required value={inviteDraft.full_name} onChange={(event) => setInviteDraft((current) => ({ ...current, full_name: event.target.value }))} autoComplete="name" className="admin-input h-9 text-xs" /></label><label className="grid gap-1 text-[10px] font-semibold text-[#526d82]">Work email<input required type="email" value={inviteDraft.email} onChange={(event) => setInviteDraft((current) => ({ ...current, email: event.target.value }))} autoComplete="email" className="admin-input h-9 text-xs" /></label><label className="grid gap-1 text-[10px] font-semibold text-[#526d82]">Phone number<input type="tel" value={inviteDraft.phone} onChange={(event) => setInviteDraft((current) => ({ ...current, phone: event.target.value }))} autoComplete="tel" className="admin-input h-9 text-xs" /></label><label className="grid gap-1 text-[10px] font-semibold text-[#526d82]">Dashboard assignment<select value={inviteDraft.role} onChange={(event) => setInviteDraft((current) => ({ ...current, role: event.target.value }))} className="admin-input h-9 text-xs"><option value="staff">Unassigned staff</option>{roleOptions.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}</select></label>{inviteError && <p role="alert" className="border border-red-200 bg-red-50 p-2 text-[10px] text-red-800">{inviteError}</p>}<div className="flex justify-end gap-2 border-t border-[#e7edf2] pt-3"><button type="button" onClick={() => setInviteOpen(false)} className="h-9 border border-[#d4dce3] px-3 text-[10px] font-semibold text-slate-600">Cancel</button><button type="submit" disabled={inviting} className="inline-flex h-9 items-center gap-2 bg-[#087f88] px-3 text-[10px] font-semibold text-white disabled:opacity-50">{inviting ? <RefreshCw size={12} className="animate-spin" /> : <Mail size={12} />}{inviting ? 'Sending invite…' : 'Send invitation'}</button></div></form></section></div>}
      </div>
    </main>
  </div>;
}

function Metric({ icon: Icon, label, value, detail, tone, progress }: { icon: typeof Users; label: string; value: string | number; detail: string; tone: 'blue' | 'green' | 'amber' | 'cyan' | 'navy'; progress?: number }) {
  const tones = {
    blue: 'border-blue-100 bg-blue-50/50 text-blue-700', green: 'border-emerald-100 bg-emerald-50/50 text-emerald-700',
    amber: 'border-amber-100 bg-amber-50/50 text-amber-700', cyan: 'border-cyan-100 bg-cyan-50/50 text-cyan-700', navy: 'border-slate-200 bg-slate-50 text-slate-700',
  };
  return <article className={`flex min-h-[78px] items-center gap-2.5 border p-3 ${tones[tone]}`}><span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/80"><Icon size={16} /></span><div className="min-w-0 flex-1"><p className="truncate text-[8px] font-bold uppercase tracking-[.1em]">{label}</p><p className="mt-1 text-lg font-semibold leading-none text-[#173b59]">{value}</p><p className="mt-1 truncate text-[8px] text-slate-500">{detail}</p>{progress !== undefined && <div className="mt-1 h-1 overflow-hidden bg-white"><span className="block h-full bg-[#17a989]" style={{ width: `${progress}%` }} /></div>}</div></article>;
}

function DashboardState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (loading) return <NbgLoader compact message="Loading live workforce profiles" />;
  if (error) return <div className="m-3"><FeatureState kind="error" eyebrow="People & workforce" title="Staff profiles could not be loaded." description={error} actionLabel="Retry" onAction={onRetry} /></div>;
  return null;
}

function EmptyState() {
  return <div className="p-7 text-center text-[10px] text-slate-500">No employee profiles match these filters.</div>;
}

function ClientAccountPromotion({ rows, draftRoles, savingId, currentUserId, onRoleChange, onSave }: { rows: StaffRow[]; draftRoles: Record<string, string>; savingId: string; currentUserId: string; onRoleChange: (userId: string, role: string) => void; onSave: (row: StaffRow) => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const filteredRows = rows.filter((row) => `${row.full_name ?? ''} ${row.email} ${row.user_id}`.toLowerCase().includes(search.trim().toLowerCase()));
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <details className="border-b border-[#e7edf2] bg-[#f8fbfd]">
    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-[9px] text-[#31546b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#087f88]">
      <span className="font-semibold">Existing client accounts</span><span>{rows.length} available to promote</span>
    </summary>
    <div className="border-t border-[#e7edf2] p-3">
      <label className="relative mb-2 block"><Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8193a3]" /><input aria-label="Search client accounts to promote" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Find a client by name, email, or ID" className="admin-input h-8 w-full pl-8 text-[9px]" /></label>
      <div className="divide-y divide-[#e7edf2] border-y border-[#e7edf2]">
        {visibleRows.map((row) => {
          const role = draftRoles[row.user_id] || row.role;
          const protectedAccount = row.user_id === currentUserId || row.email.toLowerCase() === 'hamisimedu@gmail.com';
          return <div key={row.user_id} className="grid gap-2 py-2 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-center">
            <div className="min-w-0"><p className="truncate text-[9px] font-semibold text-[#173b59]">{row.full_name || 'Name not provided'}</p><p className="truncate text-[8px] text-slate-500">{row.email}</p></div>
            <select aria-label={`Account role for ${row.full_name || row.email}`} value={role} disabled={protectedAccount} onChange={(event) => onRoleChange(row.user_id, event.target.value)} className="admin-input h-8 min-w-0 text-[9px] disabled:opacity-50">
              <option value="client">Client account</option><option value="staff">Unassigned staff</option>{roleOptions.map((option) => <option key={option} value={option}>{roleLabels[option]}</option>)}
            </select>
            <button type="button" disabled={protectedAccount || savingId === row.user_id || role === row.role} onClick={() => onSave(row)} className="inline-flex h-8 items-center justify-center gap-1.5 bg-[#087f88] px-3 text-[9px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Check size={12} />{savingId === row.user_id ? 'Saving…' : 'Update access'}</button>
          </div>;
        })}
        {visibleRows.length === 0 && <p className="py-4 text-center text-[9px] text-slate-500">No client accounts match this search.</p>}
      </div>
      {pageCount > 1 && <nav aria-label="Client account pages" className="mt-2 flex items-center justify-between text-[9px] text-slate-500"><span>Page {currentPage} of {pageCount}</span><span className="flex gap-1"><button type="button" aria-label="Previous client accounts" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} className="border border-[#dce5ed] px-2 py-1 disabled:opacity-40">Previous</button><button type="button" aria-label="Next client accounts" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)} className="border border-[#dce5ed] px-2 py-1 disabled:opacity-40">Next</button></span></nav>}
    </div>
  </details>;
}

function StaffCard({ row, canAssignRoles, role, saving, onRoleChange, onSave }: { row: StaffRow; canAssignRoles: boolean; role: string; saving: boolean; onRoleChange: (role: string) => void; onSave: () => void }) {
  const complete = profileIsComplete(row);
  return <article className="border border-[#e4ebf0] bg-white p-3"><div className="flex items-start gap-2"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-700">{initials(row.full_name, row.email)}</span><div className="min-w-0 flex-1"><p className="truncate text-[10px] font-semibold text-[#173b59]">{row.full_name || 'Name not provided'}</p><p className="truncate text-[9px] text-slate-500">{row.email}</p></div><span className={`size-2 rounded-full ${complete ? 'bg-emerald-500' : 'bg-amber-500'}`} title={complete ? 'Profile complete' : 'Profile needs details'} /></div><div className="mt-3 grid gap-1 text-[9px] text-slate-500"><span>{row.phone || 'No phone recorded'}</span><span>Joined {shortDate(row.created_at)}</span></div>{canAssignRoles && row.role !== 'admin' ? <div className="mt-3 flex gap-1"><select aria-label={`Dashboard role for ${row.full_name || row.email}`} value={role} onChange={(event) => onRoleChange(event.target.value)} className="admin-input h-8 min-w-0 flex-1 text-[9px]"><option value="staff">Unassigned staff</option>{roleOptions.map((option) => <option key={option} value={option}>{roleLabels[option]}</option>)}</select><button type="button" onClick={onSave} disabled={saving || role === row.role} aria-label={`Save role for ${row.full_name || row.email}`} className="grid size-8 shrink-0 place-items-center bg-[#087f88] text-white disabled:opacity-40"><Check size={12} /></button></div> : <p className="mt-3 inline-flex bg-sky-50 px-2 py-1 text-[9px] text-sky-800">{roleLabels[row.role] || row.role}</p>}</article>;
}

function PeopleInsights({ employees, departmentCounts, completeProfiles, onDepartmentClick, onUnassignedClick }: { employees: StaffRow[]; departmentCounts: [string, number][]; completeProfiles: number; onDepartmentClick: (department: string) => void; onUnassignedClick: () => void }) {
  const unassigned = employees.filter((row) => row.role === 'staff');
  const recent = [...employees].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()).slice(0, 4);
  const total = employees.length || 1;
  return <aside className="grid gap-2">
    <section className="border border-[#dce5ed] bg-white"><header className="flex items-center justify-between border-b border-[#e7edf2] px-3 py-2.5"><h2 className="flex items-center gap-1.5 text-[10px] font-semibold text-[#173b59]"><Briefcase size={12} /> Department Distribution</h2><span className="text-[8px] text-slate-400">{employees.length} staff</span></header><div className="space-y-2 p-3">{departmentCounts.map(([department, count], index) => <button key={department} type="button" onClick={() => onDepartmentClick(department)} className="flex w-full items-center gap-2 text-left"><span className={`size-2 rounded-full ${['bg-cyan-500', 'bg-teal-500', 'bg-blue-500', 'bg-violet-400', 'bg-emerald-400', 'bg-slate-400'][index % 6]}`} /><span className="min-w-0 flex-1 truncate text-[9px] text-[#526d82]">{department}</span><span className="text-[8px] text-slate-400">{count} ({Math.round(count / total * 100)}%)</span></button>)}{departmentCounts.length === 0 && <p className="text-[9px] text-slate-500">No staff profiles yet.</p>}</div></section>
    <section className="border border-[#dce5ed] bg-white"><header className="flex items-center justify-between border-b border-[#e7edf2] px-3 py-2.5"><h2 className="flex items-center gap-1.5 text-[10px] font-semibold text-[#173b59]"><CircleHelp size={12} /> Profile Setup</h2><span className="text-[8px] text-amber-700">{employees.length - completeProfiles} incomplete</span></header><div className="p-3"><div className="h-1.5 overflow-hidden bg-slate-100"><span className="block h-full bg-teal-600" style={{ width: `${employees.length ? completeProfiles / employees.length * 100 : 0}%` }} /></div><p className="mt-2 text-[9px] text-slate-500">{completeProfiles} of {employees.length} profiles include a name and phone number.</p></div></section>
    <section className="border border-[#dce5ed] bg-white"><header className="flex items-center justify-between border-b border-[#e7edf2] px-3 py-2.5"><h2 className="flex items-center gap-1.5 text-[10px] font-semibold text-[#173b59]"><AlertCircle size={12} /> Role Assignments</h2><button type="button" onClick={onUnassignedClick} className="text-[8px] font-semibold text-[#087f88]">{unassigned.length} unassigned</button></header><div className="divide-y divide-[#edf1f4]">{unassigned.slice(0, 3).map((row) => <button key={row.user_id} type="button" onClick={onUnassignedClick} className="flex w-full items-center gap-2 px-3 py-2 text-left"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-100 text-[8px] font-semibold text-slate-600">{initials(row.full_name, row.email)}</span><span className="min-w-0 flex-1 truncate text-[9px] text-[#526d82]">{row.full_name || row.email}</span><ChevronDown size={11} className="-rotate-90 text-slate-400" /></button>)}{unassigned.length === 0 && <p className="p-3 text-[9px] text-slate-500">All staff profiles have department access.</p>}</div></section>
    <section className="border border-[#dce5ed] bg-white"><header className="border-b border-[#e7edf2] px-3 py-2.5"><h2 className="flex items-center gap-1.5 text-[10px] font-semibold text-[#173b59]"><Clock3 size={12} /> Recent additions</h2></header><div className="divide-y divide-[#edf1f4]">{recent.map((row) => <div key={row.user_id} className="flex items-center gap-2 px-3 py-2"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-sky-100 text-[8px] font-bold text-sky-700">{initials(row.full_name, row.email)}</span><div className="min-w-0 flex-1"><p className="truncate text-[9px] font-medium text-[#526d82]">{row.full_name || row.email}</p><p className="text-[8px] text-slate-400">{roleDepartment[row.role] || 'Unassigned'}</p></div><time className="shrink-0 text-[8px] text-slate-400">{shortDate(row.created_at)}</time></div>)}{recent.length === 0 && <p className="p-3 text-[9px] text-slate-500">No employee profiles yet.</p>}</div></section>
    <p className="border border-dashed border-[#d5dfe7] bg-[#f8fafc] p-2.5 text-[8px] leading-4 text-slate-500">Attendance, leave requests, and HR document records are not currently tracked in the platform.</p>
  </aside>;
}

function DepartmentsView({ departmentCounts, employees, onOpenDepartment }: { departmentCounts: [string, number][]; employees: StaffRow[]; onOpenDepartment: (department: string) => void }) {
  return <section><div className="mb-3"><h2 className="text-xs font-semibold text-[#173b59]">Departments</h2><p className="mt-1 text-[9px] text-slate-500">Grouped from active dashboard roles on employee profiles.</p></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{departmentCounts.map(([department, count]) => <button key={department} type="button" onClick={() => onOpenDepartment(department)} className="border border-[#dce5ed] bg-white p-3 text-left hover:border-[#87c6c8]"><div className="flex items-center justify-between"><span className="grid size-8 place-items-center rounded-full bg-sky-50 text-sky-700"><Briefcase size={15} /></span><span className="text-lg font-semibold text-[#173b59]">{count}</span></div><p className="mt-3 text-[10px] font-semibold text-[#526d82]">{department}</p><p className="mt-1 text-[8px] text-slate-400">{count === 1 ? '1 profile' : `${count} profiles`}</p></button>)}{departmentCounts.length === 0 && <div className="border border-dashed border-[#dce5ed] p-7 text-center text-[10px] text-slate-500">No department assignments in staff profiles.</div>}</div><div className="mt-3 border border-[#dce5ed] bg-white"><div className="border-b border-[#e7edf2] px-3 py-2.5 text-[10px] font-semibold text-[#173b59]">Role distribution</div><div className="divide-y divide-[#edf1f4]">{employees.map((row) => <div key={row.user_id} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 px-3 py-2 text-[9px]"><span className="truncate text-[#526d82]">{row.full_name || row.email}</span><span className="truncate text-slate-500">{roleDepartment[row.role] || 'Unassigned'}</span><span className="text-slate-400">{roleLabels[row.role] || row.role}</span></div>)}</div></div></section>;
}

function OverviewView({ employees, departmentCounts, onNavigate, onOpenDirectory }: { employees: StaffRow[]; departmentCounts: [string, number][]; onNavigate: (department: string) => void; onOpenDirectory: () => void }) {
  const needsDetails = employees.filter((row) => !profileIsComplete(row));
  const recent = [...employees].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()).slice(0, 7);
  return <div className="grid items-start gap-3 2xl:grid-cols-[minmax(0,1fr)_260px]"><section className="border border-[#dce5ed] bg-white"><header className="flex items-center justify-between border-b border-[#e7edf2] p-3"><div><h2 className="text-xs font-semibold text-[#173b59]">Workforce overview</h2><p className="mt-1 text-[9px] text-slate-500">A live summary of employee profiles and role assignments.</p></div><button type="button" onClick={onOpenDirectory} className="text-[9px] font-semibold text-[#087f88]">Open directory →</button></header><div className="grid gap-3 p-3 lg:grid-cols-2"><section className="border border-[#e7edf2] p-3"><h3 className="text-[10px] font-semibold text-[#173b59]">Department distribution</h3><div className="mt-3 space-y-2">{departmentCounts.map(([department, count]) => <button key={department} type="button" onClick={() => onNavigate(department)} className="flex w-full items-center gap-2 text-left"><span className="min-w-0 flex-1 truncate text-[9px] text-slate-600">{department}</span><span className="h-1.5 w-24 overflow-hidden bg-slate-100"><span className="block h-full bg-teal-600" style={{ width: `${employees.length ? count / employees.length * 100 : 0}%` }} /></span><span className="w-5 text-right text-[9px] text-slate-500">{count}</span></button>)}</div></section><section className="border border-[#e7edf2] p-3"><h3 className="text-[10px] font-semibold text-[#173b59]">Profile details to complete</h3><p className="mt-2 text-2xl font-semibold text-[#173b59]">{needsDetails.length}</p><p className="text-[9px] text-slate-500">profiles missing a name or phone</p><button type="button" onClick={() => onNavigate('ALL')} className="mt-3 text-[9px] font-semibold text-[#087f88]">Review in staff directory →</button></section></div><div className="border-t border-[#e7edf2] px-3 py-2.5 text-[9px] text-slate-500">No attendance or leave records are connected; workforce metrics above are sourced from staff profiles.</div></section><aside className="border border-[#dce5ed] bg-white"><header className="border-b border-[#e7edf2] px-3 py-2.5 text-[10px] font-semibold text-[#173b59]">Recently added profiles</header><div className="divide-y divide-[#edf1f4]">{recent.map((row) => <div key={row.user_id} className="flex items-center gap-2 px-3 py-2"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-sky-100 text-[8px] font-bold text-sky-700">{initials(row.full_name, row.email)}</span><div className="min-w-0 flex-1"><p className="truncate text-[9px] font-semibold text-[#526d82]">{row.full_name || row.email}</p><p className="text-[8px] text-slate-400">{roleLabels[row.role] || row.role}</p></div><time className="text-[8px] text-slate-400">{shortDate(row.created_at)}</time></div>)}{recent.length === 0 && <p className="p-4 text-[9px] text-slate-500">No employee profiles yet.</p>}</div></aside></div>;
}

function UntrackedView({ tab }: { tab: WorkforceTab }) {
  const labels: Partial<Record<WorkforceTab, string>> = { attendance: 'Attendance', leave: 'Leave & Requests', documents: 'Employee Documents', performance: 'Performance' };
  return <div className="flex min-h-56 items-center justify-center"><FeatureState kind="unavailable" eyebrow="People & workforce" title={`${labels[tab]} is not connected.`} description={`This platform does not currently store ${labels[tab]?.toLowerCase()} records. No sample or inferred records are shown here.`} /></div>;
}
