import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertCircle, Building2, Check, CircleCheck, Clock3, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { formatAccountingCurrency } from '@/lib/format';
import { DEPARTMENT_ROLES, type DashboardTab, type DepartmentRole } from '@/lib/dashboard-access';
import type { AdminUser } from '@/lib/auth';
import type { ConstructionUpdate, Investment, Project, ProjectUnit, Sale } from '@/lib/types';
import { FeatureState, NbgLoader } from '@/WorkspaceStates';

type StaffDirectoryRow = { user_id: string; full_name: string | null; email: string; phone: string | null; role: string; created_at: string };
type FinancePayment = { id: string; amount: number; payment_date: string; method: string; reference: string | null };
type SystemAuditRow = { id: string; action: string; category: string; entity_type: string; created_at: string };

const departmentLabels: Record<DepartmentRole, string> = {
  hr: 'Human Resources',
  leads: 'Leads',
  finance: 'Finance',
  project_manager: 'Project Management',
  it: 'IT Department',
};
const FINANCE_WORKSPACES = [['sales', 'Sales register'], ['payments', 'Buyer payments'], ['commissions', 'Commissions'], ['investments', 'Investments'], ['applications', 'Investment applications']] as const satisfies readonly (readonly [DashboardTab, string])[];
const PROJECT_WORKSPACES = [['projects', 'Projects'], ['units', 'Units'], ['construction', 'Construction journey'], ['updates', 'Site updates']] as const satisfies readonly (readonly [DashboardTab, string])[];

function dashboardRoleLabel(role: string) {
  if (role === 'admin') return 'Primary Admin';
  if (role === 'owner') return 'Admin/Owner';
  if (role === 'client') return 'Client portal';
  if (role === 'staff') return 'Unassigned staff';
  return departmentLabels[role as DepartmentRole] || 'Unassigned';
}

function DepartmentHeader({ eyebrow, title, description, onRefresh, refreshing }: { eyebrow: string; title: string; description: string; onRefresh: () => void; refreshing: boolean }) {
  return <header className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#087f88]">{eyebrow}</p><h2 className="mt-1 font-serif text-3xl font-semibold text-[#123b4b]">{title}</h2><p className="mt-1 text-xs text-[#55717d]">{description}</p></div><button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh dashboard data" className="grid size-9 place-items-center border border-[#cfe0e1] bg-white text-[#087f88] hover:bg-[#eef9f8] disabled:opacity-50"><RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} /></button></header>;
}

function DepartmentMetric({ label, value, detail, icon: Icon, tone = 'teal' }: { label: string; value: string | number; detail: string; icon: typeof Users; tone?: 'teal' | 'green' | 'amber' | 'red' }) {
  const colors = {
    teal: 'border-[#d9eaea] bg-white text-[#087f88]',
    green: 'border-[#d8eadc] bg-white text-[#2e6b3e]',
    amber: 'border-[#eadfca] bg-white text-[#856b2e]',
    red: 'border-[#efd7d2] bg-white text-[#a55445]',
  };
  return <article className={`border p-4 ${colors[tone]}`}><div className="flex items-center justify-between gap-3"><p className="text-[9px] font-semibold uppercase tracking-[.08em] text-[#68818a]">{label}</p><Icon size={16} /></div><p className="mt-3 font-serif text-2xl font-semibold text-[#123b4b]">{value}</p><p className="mt-1 text-[9px] text-[#81949b]">{detail}</p></article>;
}

function DashboardMessage({ error, loading }: { error: string; loading: boolean }) {
  if (loading) return <NbgLoader compact message="Loading live department data" />;
  if (error) return <FeatureState kind="error" eyebrow="Department workspace" title="Department data could not be loaded." description={error} />;
  return null;
}

export function HRDepartmentDashboard({ canAssignRoles }: { canAssignRoles: boolean }) {
  const [staff, setStaff] = useState<StaffDirectoryRow[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setRefreshing(true);
    const { data, error: loadError } = await supabase.rpc(canAssignRoles ? 'get_dashboard_role_candidates' : 'get_dashboard_staff_directory');
    if (loadError) setError(`Staff directory could not be loaded: ${loadError.message}`);
    else {
      const rows = (data ?? []) as StaffDirectoryRow[];
      setStaff(rows);
      setDraftRoles(Object.fromEntries(rows.map((row) => [row.user_id, row.role])));
      setError('');
    }
    setLoading(false);
    setRefreshing(false);
  }, [canAssignRoles]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel('hr-staff-directory-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dashboard_staff_directory_events' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const visibleStaff = staff.filter((row) => `${row.full_name ?? ''} ${row.email} ${departmentLabels[row.role as DepartmentRole] ?? row.role}`.toLowerCase().includes(search.toLowerCase()));
  const assignedCount = staff.filter((row) => DEPARTMENT_ROLES.includes(row.role as DepartmentRole)).length;
  const saveRole = async (row: StaffDirectoryRow) => {
    const role = draftRoles[row.user_id] || 'staff';
    setSavingId(row.user_id);
    setMessage('');
    const { error: saveError } = await supabase.rpc('assign_dashboard_role', { p_user_id: row.user_id, p_role: role });
    setSavingId('');
    if (saveError) { setMessage(`Role was not changed: ${saveError.message}`); return; }
    setMessage(`Dashboard assignment updated for ${row.full_name || row.email}.`);
    await load();
  };

  return <div>
    <DepartmentHeader eyebrow="People operations" title="HR Department" description="Staff directory, department assignments, and access status." onRefresh={() => void load()} refreshing={refreshing} />
    <section className="mb-4 grid gap-2 sm:grid-cols-3"><DepartmentMetric label={canAssignRoles ? 'Platform accounts' : 'Staff accounts'} value={staff.length} detail={canAssignRoles ? 'Client and staff profiles' : 'Active staff profiles'} icon={Users} /><DepartmentMetric label="Department assigned" value={assignedCount} detail="Accounts with a dashboard role" icon={CircleCheck} tone="green" /><DepartmentMetric label="Needs assignment" value={staff.filter((row) => row.role === 'staff').length} detail="Unassigned staff profiles" icon={AlertCircle} tone={staff.some((row) => row.role === 'staff') ? 'amber' : 'teal'} /></section>
    {!canAssignRoles && <p className="mb-3 border border-[#e7dfcc] bg-[#fff9eb] px-3 py-2 text-[10px] text-[#765d2b]">Role changes are restricted to Admin/Owner.</p>}
    {message && <p role="status" className="mb-3 border border-[#d7e8df] bg-[#f3faf5] px-3 py-2 text-[10px] text-[#2e6b3e]">{message}</p>}
    <section className="border border-[#dce3e3] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8eeee] p-3"><div><h3 className="text-xs font-semibold text-[#31546b]">Staff directory</h3><p className="mt-1 text-[9px] text-[#81949b]">Assign one primary dashboard to each staff account.</p></div><input value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search staff" placeholder="Search name or email" className="admin-input h-8 w-full max-w-xs text-[10px]" /></div>
      <DashboardMessage error={error} loading={loading} />
      {!loading && !error && <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-[10px]"><thead className="bg-[#f5f8f8] text-[8px] uppercase tracking-[.08em] text-[#789099]"><tr>{['Staff member', 'Contact', 'Dashboard', 'Assignment'].map((label) => <th key={label} className="px-3 py-2.5 font-semibold">{label}</th>)}</tr></thead><tbody>{visibleStaff.map((row) => { const role = draftRoles[row.user_id] || row.role; const dirty = role !== row.role; return <tr key={row.user_id} className="border-t border-[#edf1f1]"><td className="px-3 py-2.5"><strong className="block text-[#31546b]">{row.full_name || 'Name not provided'}</strong><span className="font-mono text-[8px] text-[#95a5aa]">{row.user_id.slice(0, 8).toUpperCase()}</span></td><td className="px-3 py-2.5 text-[#6c8790]">{row.email}</td><td className="px-3 py-2.5">{canAssignRoles && row.role !== 'admin' ? <select aria-label={`Dashboard for ${row.full_name || row.email}`} value={role} onChange={(event) => setDraftRoles((current) => ({ ...current, [row.user_id]: event.target.value }))} className="admin-input h-8 min-w-44 text-[9px]"><option value="staff">Unassigned staff</option><option value="client">Client portal</option>{DEPARTMENT_ROLES.map((departmentRole) => <option key={departmentRole} value={departmentRole}>{departmentLabels[departmentRole]}</option>) }<option value="owner">Admin/Owner</option></select> : <span className="text-[#55717d]">{dashboardRoleLabel(role)}</span>}</td><td className="px-3 py-2.5">{canAssignRoles && row.role !== 'admin' && <button type="button" disabled={!dirty || savingId === row.user_id} onClick={() => void saveRole(row)} className="inline-flex min-h-8 items-center gap-1.5 bg-[#087f88] px-3 text-[9px] font-semibold text-white disabled:opacity-40"><Check size={12} />{savingId === row.user_id ? 'Saving...' : 'Save role'}</button>}</td></tr>; })}{visibleStaff.length === 0 && <tr><td colSpan={4} className="px-3 py-7 text-center text-[10px] text-[#81949b]">No accounts match this search.</td></tr>}</tbody></table></div>}
    </section>
  </div>;
}

export function FinanceDepartmentDashboard({ user, navigate }: { user: AdminUser; navigate: (tab: DashboardTab) => void }) {
  const [sales, setSales] = useState<Pick<Sale, 'id' | 'sale_price' | 'status'>[]>([]);
  const [payments, setPayments] = useState<FinancePayment[]>([]);
  const [investments, setInvestments] = useState<Pick<Investment, 'id' | 'amount_interested' | 'amount_committed' | 'status'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setRefreshing(true);
    const [salesResult, paymentsResult, investmentsResult] = await Promise.all([
      supabase.from('sales').select('id,sale_price,status'),
      supabase.from('buyer_payments').select('id,amount,payment_date,method,reference').order('payment_date', { ascending: false }).limit(8),
      supabase.from('investments').select('id,amount_interested,amount_committed,status'),
    ]);
    const firstError = salesResult.error || paymentsResult.error || investmentsResult.error;
    if (firstError) setError(`Finance data could not be loaded: ${firstError.message}`);
    else {
      setSales((salesResult.data ?? []) as Pick<Sale, 'id' | 'sale_price' | 'status'>[]);
      setPayments((paymentsResult.data ?? []) as FinancePayment[]);
      setInvestments((investmentsResult.data ?? []) as Pick<Investment, 'id' | 'amount_interested' | 'amount_committed' | 'status'>[]);
      setError('');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel(`finance-dashboard-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buyer_payments' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, user.id]);

  const totalSales = sales.filter((sale) => sale.status === 'COMPLETED').reduce((sum, sale) => sum + Number(sale.sale_price || 0), 0);
  const totalReceived = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const committed = investments.reduce((sum, investment) => sum + Number(investment.amount_committed || 0), 0);
  const pending = sales.filter((sale) => ['RESERVED', 'DEPOSIT_PAID'].includes(sale.status)).length;

  return <div><DepartmentHeader eyebrow="Finance operations" title="Finance Dashboard" description="Collections, reservations, and investment commitments update as records change." onRefresh={() => void load()} refreshing={refreshing} /><DashboardMessage error={error} loading={loading} />{!loading && !error && <>
    <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><DepartmentMetric label="Completed sales" value={formatAccountingCurrency(totalSales)} detail={`${sales.filter((sale) => sale.status === 'COMPLETED').length} completed transactions`} icon={Building2} tone="green" /><DepartmentMetric label="Recent payment volume" value={formatAccountingCurrency(totalReceived)} detail="Latest 8 payment records" icon={CircleCheck} tone="teal" /><DepartmentMetric label="Committed investments" value={formatAccountingCurrency(committed)} detail={`${investments.filter((investment) => investment.amount_committed != null).length} commitments`} icon={Activity} tone="green" /><DepartmentMetric label="Open reservations" value={pending} detail="Reserved or deposit paid" icon={Clock3} tone="amber" /></section>
    <section className="mt-3 grid gap-3 xl:grid-cols-[1.2fr_.8fr]"><article className="border border-[#dce3e3] bg-white"><div className="border-b border-[#e8eeee] px-3 py-3"><h3 className="text-xs font-semibold text-[#31546b]">Recent payments</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[480px] text-left text-[9px]"><thead className="bg-[#f7f9f9] text-[8px] uppercase text-[#789099]"><tr>{['Date', 'Method', 'Reference', 'Amount'].map((label) => <th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className="border-t border-[#edf1f1]"><td className="px-3 py-2">{payment.payment_date}</td><td className="px-3 py-2">{payment.method.replace(/_/g, ' ')}</td><td className="px-3 py-2 font-mono">{payment.reference || '—'}</td><td className="px-3 py-2 font-semibold">{formatAccountingCurrency(Number(payment.amount))}</td></tr>)}{payments.length === 0 && <tr><td colSpan={4} className="p-5 text-center text-[#81949b]">No payment records yet.</td></tr>}</tbody></table></div></article><nav aria-label="Finance actions" className="grid content-start gap-2 border border-[#dce3e3] bg-white p-3"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-[#67818a]">Finance workspaces</p>{FINANCE_WORKSPACES.map(([tab, label]) => <button key={tab} type="button" onClick={() => navigate(tab)} className="flex min-h-9 items-center justify-between border border-[#e4eeee] px-3 text-left text-[10px] font-semibold text-[#31546b] hover:border-[#9dcfd0] hover:bg-[#f5fbfb]">{label}<span aria-hidden="true">›</span></button>)}</nav></section>
  </>}</div>;
}

export function ProjectManagementDashboard({ navigate }: { navigate: (tab: DashboardTab) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [units, setUnits] = useState<Pick<ProjectUnit, 'id' | 'project_id' | 'status'>[]>([]);
  const [updates, setUpdates] = useState<Pick<ConstructionUpdate, 'id' | 'title' | 'posted_at'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setRefreshing(true);
    const [projectResult, unitResult, updateResult] = await Promise.all([
      supabase.from('projects').select('id,name,location,status,is_published,created_at').order('name'),
      supabase.from('project_units').select('id,project_id,status'),
      supabase.from('construction_updates').select('id,title,posted_at').order('posted_at', { ascending: false }).limit(8),
    ]);
    const firstError = projectResult.error || unitResult.error || updateResult.error;
    if (firstError) setError(`Project data could not be loaded: ${firstError.message}`);
    else {
      setProjects((projectResult.data ?? []) as Project[]);
      setUnits((unitResult.data ?? []) as Pick<ProjectUnit, 'id' | 'project_id' | 'status'>[]);
      setUpdates((updateResult.data ?? []) as Pick<ConstructionUpdate, 'id' | 'title' | 'posted_at'>[]);
      setError('');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel('project-management-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_units' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'construction_updates' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);
  const availableUnits = units.filter((unit) => unit.status === 'AVAILABLE').length;
  const reservedUnits = units.filter((unit) => unit.status === 'RESERVED').length;

  return <div><DepartmentHeader eyebrow="Delivery operations" title="Project Management" description="Project portfolio, inventory, and construction updates from live platform records." onRefresh={() => void load()} refreshing={refreshing} /><DashboardMessage error={error} loading={loading} />{!loading && !error && <>
    <section className="grid gap-2 sm:grid-cols-3"><DepartmentMetric label="Projects" value={projects.length} detail={`${projects.filter((project) => project.is_published).length} published`} icon={Building2} /><DepartmentMetric label="Available units" value={availableUnits} detail={`${units.length} total inventory records`} icon={CircleCheck} tone="green" /><DepartmentMetric label="Reserved units" value={reservedUnits} detail="Current inventory reservations" icon={Clock3} tone="amber" /></section>
    <section className="mt-3 grid gap-3 xl:grid-cols-2"><article className="border border-[#dce3e3] bg-white"><div className="border-b border-[#e8eeee] px-3 py-3"><h3 className="text-xs font-semibold text-[#31546b]">Project portfolio</h3></div><div className="divide-y divide-[#edf1f1]">{projects.map((project) => { const projectUnits = units.filter((unit) => unit.project_id === project.id); return <div key={project.id} className="flex items-center justify-between gap-3 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-[#31546b]">{project.name}</p><p className="mt-0.5 truncate text-[8px] text-[#81949b]">{project.location || 'Location pending'} · {project.status}</p></div><span className="shrink-0 text-[9px] text-[#67818a]">{projectUnits.length} units</span></div>; })}{projects.length === 0 && <p className="p-4 text-[10px] text-[#81949b]">No projects found.</p>}</div></article><article className="border border-[#dce3e3] bg-white"><div className="border-b border-[#e8eeee] px-3 py-3"><h3 className="text-xs font-semibold text-[#31546b]">Recent site updates</h3></div><div className="divide-y divide-[#edf1f1]">{updates.map((update) => <div key={update.id} className="flex items-center justify-between gap-3 px-3 py-2.5"><p className="truncate text-[10px] font-medium text-[#31546b]">{update.title}</p><time className="shrink-0 text-[8px] text-[#81949b]">{update.posted_at ? new Date(update.posted_at).toLocaleDateString() : 'Draft'}</time></div>)}{updates.length === 0 && <p className="p-4 text-[10px] text-[#81949b]">No construction updates found.</p>}</div></article></section>
    <nav aria-label="Project management actions" className="mt-3 flex flex-wrap gap-2">{PROJECT_WORKSPACES.map(([tab, label]) => <button key={tab} type="button" onClick={() => navigate(tab)} className="min-h-9 border border-[#cfe0e1] bg-white px-3 text-[9px] font-semibold text-[#087f88] hover:bg-[#eef9f8]">{label}</button>)}</nav>
  </>}</div>;
}

export function ITDepartmentDashboard({ user }: { user: AdminUser }) {
  const [events, setEvents] = useState<SystemAuditRow[]>([]);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setRefreshing(true);
    const { data, error: loadError } = await supabase.from('it_system_events').select('id,action,category,entity_type,created_at').order('created_at', { ascending: false }).limit(25);
    if (loadError) setError(`System activity is unavailable: ${loadError.message}`);
    else { setEvents((data ?? []) as SystemAuditRow[]); setError(''); }
    setLoading(false);
    setRefreshing(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel(`it-system-activity-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'it_system_events' }, () => { void load(); })
      .subscribe((status) => setRealtimeReady(status === 'SUBSCRIBED'));
    return () => { setRealtimeReady(false); void supabase.removeChannel(channel); };
  }, [load, user.id]);

  return <div><DepartmentHeader eyebrow="Platform operations" title="IT Department" description="Live system activity and access-control events. Sensitive financial records are not shown here." onRefresh={() => void load()} refreshing={refreshing} /><DashboardMessage error={error} loading={loading} />{!loading && !error && <>
    <section className="grid gap-2 sm:grid-cols-3"><DepartmentMetric label="Realtime connection" value={realtimeReady ? 'Connected' : 'Connecting'} detail="Live audit event subscription" icon={Activity} tone={realtimeReady ? 'green' : 'amber'} /><DepartmentMetric label="Recent events" value={events.length} detail="Latest platform audit records" icon={ShieldCheck} /><DepartmentMetric label="Departments" value={DEPARTMENT_ROLES.length} detail="Controlled staff dashboard roles" icon={Users} /></section>
    <section className="mt-3 border border-[#dce3e3] bg-white"><div className="flex items-center justify-between border-b border-[#e8eeee] px-3 py-3"><h3 className="text-xs font-semibold text-[#31546b]">System activity</h3><span className={`inline-flex items-center gap-1 text-[8px] ${realtimeReady ? 'text-[#2e6b3e]' : 'text-[#856b2e]'}`}><span className={`size-1.5 rounded-full ${realtimeReady ? 'bg-[#2e6b3e]' : 'bg-[#d1a549]'}`} />{realtimeReady ? 'Live' : 'Connecting'}</span></div><div className="divide-y divide-[#edf1f1]">{events.map((event) => <article key={event.id} className="grid gap-1 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-[#31546b]">{event.action.replace(/_/g, ' ')} · {event.entity_type.replace(/_/g, ' ')}</p><p className="mt-0.5 truncate text-[8px] text-[#81949b]">{event.category}</p></div><time className="text-[8px] text-[#81949b]">{new Date(event.created_at).toLocaleString()}</time></article>)}{events.length === 0 && <p className="p-4 text-[10px] text-[#81949b]">No system activity has been recorded yet.</p>}</div></section>
  </>}</div>;
}