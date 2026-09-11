import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  Calculator,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  Construction,
  DollarSign,
  Eye,
  EyeOff,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Phone,
  Pencil,
  Plus,
  Search,
  TrendingUp,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { signIn, signUp, type AdminUser } from '@/lib/auth';
import {
  COMMISSION_STATUS_COLORS,
  COMMISSION_STATUSES,
  INVESTMENT_STATUS_COLORS,
  INVESTMENT_STATUSES,
  LEAD_STATUSES,
  LEAD_STATUS_COLORS,
  PROJECT_STATUSES,
  REALTOR_STATUS_COLORS,
  REALTOR_STATUSES,
  SALE_STATUS_COLORS,
  SALE_STATUSES,
  UNIT_STATUSES,
  fmtKes,
  type Commission,
  type ConstructionUpdate,
  type Investment,
  type Lead,
  type Project,
  type ProjectUnit,
  type Realtor,
  type Sale,
} from '@/lib/types';

type AdminTab = 'overview' | 'leads' | 'sales' | 'units' | 'realtors' | 'commissions' | 'investments' | 'projects' | 'updates' | 'calculator';

const WA = '254741121575';

async function uploadPublicMedia(file: File, folder: 'projects' | 'units' | 'updates') {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('public-media').upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('public-media').getPublicUrl(path).data.publicUrl;
}

// ─── Shell ───────────────────────────────────────────────

export default function AdminDashboard({ user, onSignOut }: { user: AdminUser; onSignOut: () => void }) {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems: { id: AdminTab; label: string; icon: typeof LayoutDashboard; group: string }[] = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'main' },
    { id: 'leads', label: 'Leads', icon: Users, group: 'sales' },
    { id: 'sales', label: 'Sales', icon: DollarSign, group: 'sales' },
    { id: 'units', label: 'Units', icon: Building2, group: 'sales' },
    { id: 'investments', label: 'Investments', icon: TrendingUp, group: 'sales' },
    { id: 'realtors', label: 'Realtors', icon: Award, group: 'agents' },
    { id: 'commissions', label: 'Commissions', icon: DollarSign, group: 'agents' },
    { id: 'projects', label: 'Projects', icon: Construction, group: 'ops' },
    { id: 'updates', label: 'Site Updates', icon: BarChart3, group: 'ops' },
    { id: 'calculator', label: 'Investment Calculator', icon: Calculator, group: 'ops' },
  ];

  const groups = [
    { key: 'main', label: '' },
    { key: 'sales', label: 'Sales & Pipeline' },
    { key: 'agents', label: 'Realtors & Agents' },
    { key: 'ops', label: 'Operations' },
  ];

  const go = (t: AdminTab) => { setTab(t); setSidebarOpen(false); };

  return (
    <div className="min-h-screen bg-[#f0ede6] font-sans">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 z-40 flex h-full w-64 flex-col bg-[#17232b] text-white transition-transform duration-300 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[72px] items-center gap-3 border-b border-white/10 px-5">
          <img src="/NBG_LOGO.png" alt="NBG" className="h-9 w-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div>
            <p className="text-[10px] font-bold tracking-[.2em] text-white">NBG ADMIN</p>
            <p className="text-[8px] tracking-[.16em] text-white/40">MANAGEMENT PORTAL</p>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          {groups.map(({ key, label }) => {
            const items = navItems.filter((n) => n.group === key);
            return (
              <div key={key} className="mb-4">
                {label && <p className="mb-1 px-3 text-[9px] font-bold uppercase tracking-[.2em] text-white/30">{label}</p>}
                {items.map(({ id, label: l, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => go(id)}
                    className={`mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[11px] font-medium tracking-wide transition-all ${tab === id ? 'bg-[#20afd1] text-white shadow-sm' : 'text-white/55 hover:bg-white/6 hover:text-white'}`}
                  >
                    <Icon size={15} strokeWidth={1.6} />
                    {l}
                    {tab === id && <ChevronRight size={12} className="ml-auto" />}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="mb-3 rounded-md bg-white/5 px-3 py-2">
            <p className="text-[9px] uppercase tracking-[.14em] text-white/40">Signed in</p>
            <p className="mt-0.5 text-xs text-white/80 truncate">{user.email}</p>
            <p className="text-[9px] uppercase tracking-[.12em] text-[#20afd1]">{user.role}</p>
          </div>
          <button onClick={onSignOut} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[11px] text-white/50 hover:bg-white/6 hover:text-white">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Content */}
      <div className="md:pl-64">
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-[#c9c5bd] bg-[#f0ede6]/95 px-5 backdrop-blur md:px-10">
          <div className="flex items-center gap-3">
            <button className="md:hidden" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">
              <Menu size={22} />
            </button>
            <h1 className="font-serif text-2xl">{navItems.find((n) => n.id === tab)?.label ?? 'Dashboard'}</h1>
          </div>
          <a href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md bg-[#1f8a72] px-4 py-2 text-[10px] font-bold uppercase tracking-[.14em] text-white hover:bg-[#176b59]">
            <Phone size={13} /> WhatsApp
          </a>
        </header>

        <div className="px-5 py-8 md:px-10 md:py-10">
          {tab === 'overview' && <OverviewTab goTo={go} />}
          {tab === 'leads' && <LeadsTab />}
          {tab === 'sales' && <SalesTab />}
          {tab === 'units' && <UnitsTab />}
          {tab === 'investments' && <InvestmentsTab />}
          {tab === 'realtors' && <RealtorsTab />}
          {tab === 'commissions' && <CommissionsTab />}
          {tab === 'projects' && <ProjectsTab />}
          {tab === 'updates' && <UpdatesTab />}
          {tab === 'calculator' && <CalculatorTab />}
        </div>
      </div>
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────

function OverviewTab({ goTo }: { goTo: (tab: AdminTab) => void }) {
  const [data, setData] = useState<{
    leads: Lead[]; sales: Sale[]; units: ProjectUnit[];
    realtors: Realtor[]; investments: Investment[]; commissions: Commission[];
  } | null>(null);

  useEffect(() => {
    (async () => {
      const [leadsR, salesR, unitsR, realtorsR, investR, commR] = await Promise.all([
        supabase.from('leads').select('id,status,created_at,name,source').order('created_at', { ascending: false }),
        supabase.from('sales').select('id,status,sale_price,sale_date,unit_number,buyer_name').order('created_at', { ascending: false }),
        supabase.from('project_units').select('id,status'),
        supabase.from('realtors').select('id,status,total_earned,name').order('total_earned', { ascending: false }),
        supabase.from('investments').select('id,status,amount_interested,investor_name').order('created_at', { ascending: false }),
        supabase.from('commissions').select('id,status,amount,realtor_id').order('created_at', { ascending: false }),
      ]);
      setData({
        leads: (leadsR.data ?? []) as Lead[],
        sales: (salesR.data ?? []) as Sale[],
        units: (unitsR.data ?? []) as ProjectUnit[],
        realtors: (realtorsR.data ?? []) as Realtor[],
        investments: (investR.data ?? []) as Investment[],
        commissions: (commR.data ?? []) as Commission[],
      });
    })();
  }, []);

  if (!data) return <Spinner />;

  const revenue = data.sales.filter((s) => s.status === 'COMPLETED').reduce((a, s) => a + (s.sale_price ?? 0), 0);
  const pipeline = data.sales.filter((s) => ['RESERVED', 'DEPOSIT_PAID'].includes(s.status)).reduce((a, s) => a + (s.sale_price ?? 0), 0);
  const committedInvest = data.investments.filter((i) => i.status === 'COMMITTED').reduce((a, i) => a + (i.amount_interested ?? 0), 0);
  const pendingComm = data.commissions.filter((c) => c.status === 'PENDING').reduce((a, c) => a + c.amount, 0);

  const statCards = [
    { label: 'Completed Revenue', value: fmtKes(revenue), sub: `${data.sales.filter((s) => s.status === 'COMPLETED').length} sales`, color: 'text-[#2e6b3e]', tab: 'sales' as AdminTab },
    { label: 'Sales Pipeline', value: fmtKes(pipeline), sub: `${data.sales.filter((s) => ['RESERVED', 'DEPOSIT_PAID'].includes(s.status)).length} active`, color: 'text-[#2e5f7a]', tab: 'sales' as AdminTab },
    { label: 'New Leads', value: String(data.leads.filter((l) => l.status === 'NEW').length), sub: `${data.leads.length} total`, color: 'text-[#3a6f69]', tab: 'leads' as AdminTab },
    { label: 'Committed Investment', value: fmtKes(committedInvest), sub: `${data.investments.filter((i) => i.status === 'COMMITTED').length} investors`, color: 'text-[#6b2e7a]', tab: 'investments' as AdminTab },
    { label: 'Active Realtors', value: String(data.realtors.filter((r) => r.status === 'ACTIVE').length), sub: `${data.realtors.length} total`, color: 'text-[#856b2e]', tab: 'realtors' as AdminTab },
    { label: 'Commissions Pending', value: fmtKes(pendingComm), sub: `${data.commissions.filter((c) => c.status === 'PENDING').length} unpaid`, color: 'text-[#7a4e2e]', tab: 'commissions' as AdminTab },
    { label: 'Available Units', value: String(data.units.filter((u) => u.status === 'AVAILABLE').length), sub: `${data.units.filter((u) => u.status === 'SOLD').length} sold`, color: 'text-[#20afd1]', tab: 'units' as AdminTab },
    { label: 'Investment Inquiries', value: String(data.investments.filter((i) => i.status === 'INQUIRY').length), sub: 'need follow-up', color: 'text-slate-500', tab: 'investments' as AdminTab },
  ];

  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map(({ label, value, sub, color, tab }) => (
          <button key={label} onClick={() => goTo(tab)} className="group rounded-lg border border-[#c9c5bd] bg-white p-5 text-left shadow-sm transition hover:border-[#20afd1] hover:shadow-md">
            <p className="eyebrow text-slate-400">{label}</p>
            <p className={`mt-3 font-serif text-2xl ${color}`}>{value}</p>
            <p className="mt-1 text-xs text-slate-500">{sub}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Lead funnel */}
        <div className="rounded-lg border border-[#c9c5bd] bg-white p-6 shadow-sm">
          <h3 className="eyebrow text-[#20afd1]">Lead Funnel</h3>
          <div className="mt-5 space-y-3">
            {LEAD_STATUSES.map((s) => {
              const count = data.leads.filter((l) => l.status === s).length;
              const pct = data.leads.length ? (count / data.leads.length) * 100 : 0;
              return (
                <div key={s}>
                  <div className="flex justify-between text-xs">
                    <span className="font-medium">{s.replace('_', ' ')}</span>
                    <span className="text-slate-400">{count}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[#e6e2da]">
                    <div className="h-full rounded-full bg-[#20afd1] transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {data.leads.length === 0 && <p className="text-sm text-slate-400">No leads yet.</p>}
          </div>
        </div>

        {/* Top realtors */}
        <div className="rounded-lg border border-[#c9c5bd] bg-white p-6 shadow-sm">
          <h3 className="eyebrow text-[#20afd1]">Top Realtors</h3>
          <div className="mt-5 space-y-3">
            {data.realtors.slice(0, 5).map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-[#e6e2da] pb-3 last:border-0">
                <div>
                  <p className="text-sm font-medium">{r.name}</p>
                  <span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[8px] uppercase tracking-[.12em] ${REALTOR_STATUS_COLORS[r.status] ?? 'bg-[#e6e2da] text-slate-500'}`}>{r.status}</span>
                </div>
                <p className="text-sm font-semibold text-[#2e6b3e]">{fmtKes(r.total_earned)}</p>
              </div>
            ))}
            {data.realtors.length === 0 && <p className="text-sm text-slate-400">No realtors registered yet.</p>}
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-lg border border-[#c9c5bd] bg-white p-6 shadow-sm">
          <h3 className="eyebrow text-[#20afd1]">Recent Leads</h3>
          <div className="mt-5 space-y-3">
            {data.leads.slice(0, 6).map((l) => (
              <div key={l.id} className="flex items-start justify-between border-b border-[#e6e2da] pb-2.5 last:border-0">
                <div>
                  <p className="text-sm font-medium">{l.name}</p>
                  <p className="text-xs text-slate-400">{l.source ?? 'Unknown'} · {new Date(l.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`ml-2 shrink-0 rounded px-2 py-0.5 text-[8px] uppercase tracking-[.1em] ${LEAD_STATUS_COLORS[l.status] ?? 'bg-[#e6e2da] text-slate-500'}`}>{l.status}</span>
              </div>
            ))}
            {data.leads.length === 0 && <p className="text-sm text-slate-400">No leads yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Leads ───────────────────────────────────────────────

function LeadsTab() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selected, setSelected] = useState<Lead | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('leads').select('*').order('created_at', { ascending: false });
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => leads.filter((l) => {
    const q = search.toLowerCase();
    return (statusFilter === 'ALL' || l.status === statusFilter) &&
      (!q || l.name.toLowerCase().includes(q) || (l.email ?? '').toLowerCase().includes(q) || (l.phone ?? '').includes(q));
  }), [leads, search, statusFilter]);

  const updateStatus = async (id: string, status: string) => {
    setLeads((p) => p.map((l) => l.id === id ? { ...l, status } : l));
    if (selected?.id === id) setSelected((s) => s ? { ...s, status } : s);
    await supabase.from('leads').update({ status }).eq('id', id);
  };

  const saveNotes = async (id: string, notes: string) => {
    await supabase.from('leads').update({ notes }).eq('id', id);
    setLeads((p) => p.map((l) => l.id === id ? { ...l, notes } : l));
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, phone…" className="admin-input pl-9 w-full" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="admin-input">
          <option value="ALL">All statuses</option>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <p className="flex items-center text-xs text-slate-400">{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-[#c9c5bd] bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#c9c5bd] bg-[#f0ede6] text-[10px] uppercase tracking-[.12em] text-slate-400">
            <tr>
              {['Name', 'Contact', 'Source', 'Project', 'Status', 'Date', ''].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((lead) => (
              <tr key={lead.id} className="border-b border-[#e6e2da] last:border-0 hover:bg-[#f0ede6]/60">
                <td className="px-4 py-3 font-medium">{lead.name}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{lead.email ?? lead.phone ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{lead.source ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{lead.project ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusSelect value={lead.status} options={LEAD_STATUSES} colors={LEAD_STATUS_COLORS} onChange={(v) => updateStatus(lead.id, v)} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{fmt(lead.created_at)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setSelected(lead)} className="text-xs text-[#20afd1] hover:underline">View</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <EmptyRow cols={7} text="No leads match your filters." />}
          </tbody>
        </table>
      </div>

      {selected && (
        <Drawer title={selected.name} onClose={() => setSelected(null)}>
          <InfoRow label="Email" value={selected.email} icon={<Mail size={13} />} />
          <InfoRow label="Phone" value={selected.phone} icon={<Phone size={13} />} />
          {selected.phone && (
            <a href={`https://wa.me/${selected.phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-[#1f8a72] hover:underline">
              <Phone size={13} /> Message on WhatsApp
            </a>
          )}
          <InfoRow label="Source" value={selected.source} />
          <InfoRow label="Project" value={selected.project} />
          <InfoRow label="Apartment type" value={selected.apartment_type} />
          {selected.message && (
            <div className="rounded-md bg-[#f0ede6] p-3">
              <p className="eyebrow text-slate-400">Message</p>
              <p className="mt-2 text-sm text-slate-600">{selected.message}</p>
            </div>
          )}
          <div>
            <p className="eyebrow text-slate-400">Status</p>
            <StatusSelect value={selected.status} options={LEAD_STATUSES} colors={LEAD_STATUS_COLORS} onChange={(v) => updateStatus(selected.id, v)} className="mt-2 w-full" />
          </div>
          <NotesField defaultValue={selected.notes ?? ''} onSave={(n) => saveNotes(selected.id, n)} />
        </Drawer>
      )}
    </div>
  );
}

// ─── Sales ───────────────────────────────────────────────

function SalesTab() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('sales').select('*').order('created_at', { ascending: false });
    setSales((data ?? []) as Sale[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => sales.filter((s) => statusFilter === 'ALL' || s.status === statusFilter), [sales, statusFilter]);
  const revenue = useMemo(() => sales.filter((s) => s.status === 'COMPLETED').reduce((a, s) => a + (s.sale_price ?? 0), 0), [sales]);
  const pipeline = useMemo(() => sales.filter((s) => ['RESERVED', 'DEPOSIT_PAID'].includes(s.status)).reduce((a, s) => a + (s.sale_price ?? 0), 0), [sales]);

  const updateStatus = async (id: string, status: string) => {
    setSales((p) => p.map((s) => s.id === id ? { ...s, status } : s));
    await supabase.from('sales').update({ status }).eq('id', id);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatMini label="Completed Revenue" value={fmtKes(revenue)} color="text-[#2e6b3e]" />
        <StatMini label="Pipeline Value" value={fmtKes(pipeline)} color="text-[#2e5f7a]" />
        <button onClick={() => setShowForm(true)} className="admin-add-btn flex items-center justify-center gap-2"><Plus size={16} /> Record Sale</button>
      </div>

      <div className="flex gap-3 mb-5">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="admin-input">
          <option value="ALL">All statuses</option>
          {SALE_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <p className="flex items-center text-xs text-slate-400">{filtered.length} sale{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#c9c5bd] bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#c9c5bd] bg-[#f0ede6] text-[10px] uppercase tracking-[.12em] text-slate-400">
            <tr>{['Unit', 'Buyer', 'Price', 'Status', 'Date', 'Notes'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((sale) => (
              <tr key={sale.id} className="border-b border-[#e6e2da] last:border-0 hover:bg-[#f0ede6]/60">
                <td className="px-4 py-3 font-medium">{sale.unit_number}</td>
                <td className="px-4 py-3">
                  <p className="font-medium">{sale.buyer_name}</p>
                  <p className="text-xs text-slate-400">{sale.buyer_email ?? sale.buyer_phone ?? ''}</p>
                </td>
                <td className="px-4 py-3 font-medium">{fmtKes(sale.sale_price)}</td>
                <td className="px-4 py-3">
                  <StatusSelect value={sale.status} options={SALE_STATUSES} colors={SALE_STATUS_COLORS} onChange={(v) => updateStatus(sale.id, v)} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{sale.sale_date ? new Date(sale.sale_date).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-400 max-w-[200px] truncate">{sale.notes ?? '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && <EmptyRow cols={6} text="No sales recorded yet." />}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Record Sale" onClose={() => setShowForm(false)}>
          <SaleForm onDone={(s) => { setSales((p) => [s, ...p]); setShowForm(false); }} />
        </Modal>
      )}
    </div>
  );
}

function SaleForm({ onDone }: { onDone: (s: Sale) => void }) {
  const [f, setF] = useState({ unit_number: '', buyer_name: '', buyer_phone: '', buyer_email: '', sale_price: '', status: 'RESERVED', sale_date: '', notes: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    const { data, error } = await supabase.from('sales').insert({
      unit_number: f.unit_number, buyer_name: f.buyer_name,
      buyer_phone: f.buyer_phone || null, buyer_email: f.buyer_email || null,
      sale_price: f.sale_price ? parseFloat(f.sale_price) : null,
      status: f.status, sale_date: f.sale_date || null, notes: f.notes || null,
    }).select().single();
    setSaving(false);
    if (error || !data) { setErr('Could not save. Please try again.'); return; }
    onDone(data as Sale);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <AF label="Unit Number" value={f.unit_number} onChange={(v) => setF({ ...f, unit_number: v })} required />
        <AF label="Buyer Name" value={f.buyer_name} onChange={(v) => setF({ ...f, buyer_name: v })} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <AF label="Buyer Phone" value={f.buyer_phone} onChange={(v) => setF({ ...f, buyer_phone: v })} />
        <AF label="Buyer Email" type="email" value={f.buyer_email} onChange={(v) => setF({ ...f, buyer_email: v })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <AF label="Sale Price (KSh)" type="number" value={f.sale_price} onChange={(v) => setF({ ...f, sale_price: v })} />
        <AF label="Sale Date" type="date" value={f.sale_date} onChange={(v) => setF({ ...f, sale_date: v })} />
      </div>
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Status</span>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="admin-input w-full">
          {SALE_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Notes</span>
        <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} className="admin-input w-full resize-none" />
      </label>
      {err && <p className="text-sm text-[#a55445]">{err}</p>}
      <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving…' : 'Save Sale'} <ArrowRight size={15} /></button>
    </form>
  );
}

// ─── Units ───────────────────────────────────────────────

function UnitsTab() {
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProjectUnit | null>(null);

  const load = useCallback(async () => {
    const [ur, pr] = await Promise.all([
      supabase.from('project_units').select('*').order('unit_number'),
      supabase.from('projects').select('id,name'),
    ]);
    setUnits((ur.data ?? []) as ProjectUnit[]);
    setProjects((pr.data ?? []) as Project[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => units.filter((u) => statusFilter === 'ALL' || u.status === statusFilter), [units, statusFilter]);
  const updateStatus = async (id: string, status: string) => {
    setUnits((p) => p.map((u) => u.id === id ? { ...u, status } : u));
    await supabase.from('project_units').update({ status }).eq('id', id);
  };

  const togglePublished = async (unit: ProjectUnit) => {
    const is_published = !unit.is_published;
    setUnits((p) => p.map((u) => u.id === unit.id ? { ...u, is_published } : u));
    await supabase.from('project_units').update({ is_published }).eq('id', unit.id);
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this unit?')) return;
    setUnits((p) => p.filter((u) => u.id !== id));
    await supabase.from('project_units').delete().eq('id', id);
  };

  if (loading) return <Spinner />;

  const counts = UNIT_STATUSES.reduce((acc, s) => ({ ...acc, [s]: units.filter((u) => u.status === s).length }), {} as Record<string, number>);

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        {UNIT_STATUSES.map((s) => <StatMini key={s} label={s} value={String(counts[s])} color={s === 'AVAILABLE' ? 'text-[#20afd1]' : s === 'RESERVED' ? 'text-[#856b2e]' : 'text-[#7a2e2e]'} />)}
      </div>

      <div className="flex items-center justify-between mb-5">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="admin-input">
          <option value="ALL">All statuses</option>
          {UNIT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => setShowForm(true)} className="admin-add-btn flex items-center gap-2"><Plus size={16} /> Add Unit</button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#c9c5bd] bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#c9c5bd] bg-[#f0ede6] text-[10px] uppercase tracking-[.12em] text-slate-400">
            <tr>{['Unit', 'Type', 'Beds', 'Floor', 'Size', 'Price', 'View', 'Status', 'Visibility', ''].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((u) => (
              <tr key={u.id} className="border-b border-[#e6e2da] last:border-0 hover:bg-[#f0ede6]/60">
                <td className="px-4 py-3 font-medium">{u.unit_number}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{u.type ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{u.bedrooms ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{u.floor ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{u.size ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{u.price ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{u.view ?? '—'}</td>
                <td className="px-4 py-3">
                  <StatusSelect value={u.status} options={UNIT_STATUSES} colors={{ AVAILABLE: 'bg-[#dceeea] text-[#3a6f69]', RESERVED: 'bg-[#f2e7c9] text-[#856b2e]', SOLD: 'bg-[#f5d4d4] text-[#7a2e2e]' }} onChange={(v) => updateStatus(u.id, v)} />
                </td>
                <td className="px-4 py-3"><button onClick={() => togglePublished(u)} className={`flex items-center gap-1 text-[10px] uppercase tracking-[.1em] ${u.is_published ? 'text-[#2e6b3e]' : 'text-slate-400'}`}>{u.is_published ? <Eye size={13} /> : <EyeOff size={13} />}{u.is_published ? 'Live' : 'Hidden'}</button></td>
                <td className="px-4 py-3"><div className="flex items-center gap-3"><button onClick={() => setEditing(u)} className="text-slate-300 hover:text-[#20afd1]" aria-label={`Edit unit ${u.unit_number}`}><Pencil size={15} /></button><button onClick={() => remove(u.id)} className="text-slate-300 hover:text-[#a55445]" aria-label={`Delete unit ${u.unit_number}`}><Trash2 size={15} /></button></div></td>
              </tr>
            ))}
            {filtered.length === 0 && <EmptyRow cols={10} text="No units in inventory yet." />}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Add Unit" onClose={() => setShowForm(false)}>
          <UnitForm projects={projects} onDone={(u) => { setUnits((p) => [u, ...p]); setShowForm(false); }} />
        </Modal>
      )}
      {editing && <Modal title={`Edit ${editing.unit_number}`} onClose={() => setEditing(null)}><UnitForm projects={projects} initial={editing} onDone={(u) => { setUnits((p) => p.map((item) => item.id === u.id ? u : item)); setEditing(null); }} /></Modal>}
    </div>
  );
}

function UnitForm({ projects, initial, onDone }: { projects: Project[]; initial?: ProjectUnit; onDone: (u: ProjectUnit) => void }) {
  const [f, setF] = useState({ unit_number: initial?.unit_number ?? '', project_id: initial?.project_id ?? '', type: initial?.type ?? '', bedrooms: initial?.bedrooms?.toString() ?? '', size: initial?.size ?? '', floor: initial?.floor ?? '', parking: initial?.parking ?? '', view: initial?.view ?? '', price: initial?.price ?? '', status: initial?.status ?? 'AVAILABLE', is_published: initial?.is_published ?? false });
  const [image, setImage] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    let image_url: string | null = initial?.image_url ?? null;
    try { if (image) image_url = await uploadPublicMedia(image, 'units'); } catch { setErr('Image upload failed. Please try again.'); setSaving(false); return; }
    const values = {
      unit_number: f.unit_number || 'AUTO', project_id: f.project_id || null, type: f.type || null,
      bedrooms: f.bedrooms ? parseInt(f.bedrooms) : null, size: f.size || null,
      floor: f.floor || null, parking: f.parking || null, view: f.view || null,
      price: f.price || null, status: f.status, image_url, is_published: f.is_published,
    };
    const response = initial
      ? await supabase.from('project_units').update(values).eq('id', initial.id).select().single()
      : await supabase.from('project_units').insert(values).select().single();
    const { data, error } = response;
    setSaving(false);
    if (error || !data) { setErr('Could not save. Please try again.'); return; }
    onDone(data as ProjectUnit);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded border border-[#c9c5bd] bg-[#f0ede6] px-3 py-2"><span className="eyebrow block text-slate-400">Unit Number</span><p className="mt-1 text-sm font-semibold text-[#17232b]">{f.unit_number || `F${(parseInt(f.floor) || 1).toString().padStart(2, '0')}-next`}</p><p className="mt-1 text-[10px] text-slate-500">Generated automatically from the floor</p></div>
        <label className="block">
          <span className="eyebrow mb-1.5 block text-slate-400">Project</span>
          <select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })} className="admin-input w-full">
            <option value="">— No project —</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Unit image</span>{initial?.image_url && !image && <img src={initial.image_url} alt="Current unit" className="mb-2 h-24 w-full object-cover" />}<span className="flex cursor-pointer items-center gap-2 border border-dashed border-[#20afd1] bg-[#f5fbfc] px-3 py-3 text-xs text-[#247b85] hover:bg-[#e8f7fa]"><Upload size={15} /> {image?.name ?? (initial?.image_url ? 'Replace current image' : 'Choose image from computer')}<input type="file" accept="image/*" className="hidden" onChange={(e) => setImage(e.target.files?.[0] ?? null)} /></span></label>
      <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={f.is_published} onChange={(e) => setF({ ...f, is_published: e.target.checked })} /> Publish this unit on the public website</label>
      <div className="grid grid-cols-2 gap-4">
        <AF label="Type (e.g. 3 Bedroom + DSQ)" value={f.type} onChange={(v) => setF({ ...f, type: v })} />
        <AF label="Bedrooms" type="number" value={f.bedrooms} onChange={(v) => setF({ ...f, bedrooms: v })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <AF label="Size (sq ft)" value={f.size} onChange={(v) => setF({ ...f, size: v })} />
        <AF label="Floor" value={f.floor} onChange={(v) => setF({ ...f, floor: v })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <AF label="Parking" value={f.parking} onChange={(v) => setF({ ...f, parking: v })} />
        <AF label="View" value={f.view} onChange={(v) => setF({ ...f, view: v })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <AF label="Price (KSh)" value={f.price} onChange={(v) => setF({ ...f, price: v })} />
        <label className="block">
          <span className="eyebrow mb-1.5 block text-slate-400">Status</span>
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="admin-input w-full">
            {UNIT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      {err && <p className="text-sm text-[#a55445]">{err}</p>}
      <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving…' : initial ? 'Save Unit Changes' : 'Add Unit'} <ArrowRight size={15} /></button>
    </form>
  );
}

// ─── Investments ─────────────────────────────────────────

function InvestmentsTab() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const [ir, pr] = await Promise.all([
      supabase.from('investments').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('id,name'),
    ]);
    setInvestments((ir.data ?? []) as Investment[]);
    setProjects((pr.data ?? []) as Project[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => investments.filter((i) => statusFilter === 'ALL' || i.status === statusFilter), [investments, statusFilter]);
  const totalCommitted = useMemo(() => investments.filter((i) => i.status === 'COMMITTED').reduce((a, i) => a + (i.amount_interested ?? 0), 0), [investments]);

  const updateStatus = async (id: string, status: string) => {
    setInvestments((p) => p.map((i) => i.id === id ? { ...i, status } : i));
    await supabase.from('investments').update({ status }).eq('id', id);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatMini label="Committed Investment" value={fmtKes(totalCommitted)} color="text-[#6b2e7a]" />
        <StatMini label="Inquiries" value={String(investments.filter((i) => i.status === 'INQUIRY').length)} color="text-slate-500" />
        <button onClick={() => setShowForm(true)} className="admin-add-btn flex items-center justify-center gap-2"><Plus size={16} /> Add Investor</button>
      </div>

      <div className="flex gap-3 mb-5">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="admin-input">
          <option value="ALL">All statuses</option>
          {INVESTMENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <p className="flex items-center text-xs text-slate-400">{filtered.length} investor{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#c9c5bd] bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#c9c5bd] bg-[#f0ede6] text-[10px] uppercase tracking-[.12em] text-slate-400">
            <tr>{['Investor', 'Contact', 'Amount', 'Currency', 'Status', 'Date'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((inv) => (
              <tr key={inv.id} className="border-b border-[#e6e2da] last:border-0 hover:bg-[#f0ede6]/60">
                <td className="px-4 py-3 font-medium">{inv.investor_name}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{inv.investor_email ?? inv.investor_phone ?? '—'}</td>
                <td className="px-4 py-3 font-medium">{fmtKes(inv.amount_interested)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{inv.currency}</td>
                <td className="px-4 py-3">
                  <StatusSelect value={inv.status} options={INVESTMENT_STATUSES} colors={INVESTMENT_STATUS_COLORS} onChange={(v) => updateStatus(inv.id, v)} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{fmt(inv.created_at)}</td>
              </tr>
            ))}
            {filtered.length === 0 && <EmptyRow cols={6} text="No investors recorded yet." />}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Add Investor" onClose={() => setShowForm(false)}>
          <InvestmentForm projects={projects} onDone={(i) => { setInvestments((p) => [i, ...p]); setShowForm(false); }} />
        </Modal>
      )}
    </div>
  );
}

function InvestmentForm({ projects, onDone }: { projects: Project[]; onDone: (i: Investment) => void }) {
  const [f, setF] = useState({ investor_name: '', investor_email: '', investor_phone: '', project_id: '', amount_interested: '', currency: 'KES', status: 'INQUIRY', notes: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    const { data, error } = await supabase.from('investments').insert({
      investor_name: f.investor_name, investor_email: f.investor_email || null,
      investor_phone: f.investor_phone || null, project_id: f.project_id || null,
      amount_interested: f.amount_interested ? parseFloat(f.amount_interested) : null,
      currency: f.currency, status: f.status, notes: f.notes || null,
    }).select().single();
    setSaving(false);
    if (error || !data) { setErr('Could not save. Please try again.'); return; }
    onDone(data as Investment);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <AF label="Investor Name" value={f.investor_name} onChange={(v) => setF({ ...f, investor_name: v })} required />
      <div className="grid grid-cols-2 gap-4">
        <AF label="Email" type="email" value={f.investor_email} onChange={(v) => setF({ ...f, investor_email: v })} />
        <AF label="Phone" value={f.investor_phone} onChange={(v) => setF({ ...f, investor_phone: v })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <AF label="Amount Interested" type="number" value={f.amount_interested} onChange={(v) => setF({ ...f, amount_interested: v })} />
        <label className="block">
          <span className="eyebrow mb-1.5 block text-slate-400">Currency</span>
          <select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} className="admin-input w-full">
            {['KES', 'USD', 'GBP', 'EUR'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Project</span>
        <select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })} className="admin-input w-full">
          <option value="">— No project —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Status</span>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="admin-input w-full">
          {INVESTMENT_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Notes</span>
        <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} className="admin-input w-full resize-none" />
      </label>
      {err && <p className="text-sm text-[#a55445]">{err}</p>}
      <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving…' : 'Save Investor'} <ArrowRight size={15} /></button>
    </form>
  );
}

// ─── Realtors ────────────────────────────────────────────

function RealtorsTab() {
  const [realtors, setRealtors] = useState<Realtor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<Realtor | null>(null);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const load = useCallback(async () => {
    const { data } = await supabase.from('realtors').select('*').order('created_at', { ascending: false });
    setRealtors((data ?? []) as Realtor[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => realtors.filter((r) => statusFilter === 'ALL' || r.status === statusFilter), [realtors, statusFilter]);
  const totalEarned = useMemo(() => realtors.reduce((a, r) => a + r.total_earned, 0), [realtors]);

  const updateStatus = async (id: string, status: string) => {
    setRealtors((p) => p.map((r) => r.id === id ? { ...r, status } : r));
    await supabase.from('realtors').update({ status }).eq('id', id);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatMini label="Total Commission Paid" value={fmtKes(totalEarned)} color="text-[#2e6b3e]" />
        <StatMini label="Active Realtors" value={String(realtors.filter((r) => r.status === 'ACTIVE').length)} color="text-[#20afd1]" />
        <button onClick={() => setShowForm(true)} className="admin-add-btn flex items-center justify-center gap-2"><Plus size={16} /> Add Realtor</button>
      </div>

      <div className="flex gap-3 mb-5">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="admin-input">
          <option value="ALL">All statuses</option>
          {REALTOR_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#c9c5bd] bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#c9c5bd] bg-[#f0ede6] text-[10px] uppercase tracking-[.12em] text-slate-400">
            <tr>{['Realtor', 'Contact', 'ID Number', 'Rate', 'Total Earned', 'Status', 'Joined', ''].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-[#e6e2da] last:border-0 hover:bg-[#f0ede6]/60">
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.email}<br />{r.phone ?? ''}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.id_number ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{r.commission_rate}%</td>
                <td className="px-4 py-3 font-medium text-[#2e6b3e]">{fmtKes(r.total_earned)}</td>
                <td className="px-4 py-3">
                  <StatusSelect value={r.status} options={REALTOR_STATUSES} colors={REALTOR_STATUS_COLORS} onChange={(v) => updateStatus(r.id, v)} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{fmt(r.joined_at)}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setSelected(r)} className="text-xs text-[#20afd1] hover:underline">View</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <EmptyRow cols={8} text="No realtors yet." />}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Add Realtor" onClose={() => setShowForm(false)}>
          <RealtorForm onDone={(r) => { setRealtors((p) => [r, ...p]); setShowForm(false); }} />
        </Modal>
      )}

      {selected && (
        <Drawer title={selected.name} onClose={() => setSelected(null)}>
          <InfoRow label="Email" value={selected.email} icon={<Mail size={13} />} />
          <InfoRow label="Phone" value={selected.phone} icon={<Phone size={13} />} />
          <InfoRow label="ID Number" value={selected.id_number} />
          <InfoRow label="Commission Rate" value={`${selected.commission_rate}%`} />
          <InfoRow label="Total Earned" value={fmtKes(selected.total_earned)} />
          <InfoRow label="Joined" value={fmt(selected.joined_at)} icon={<CalendarDays size={13} />} />
          <div>
            <p className="eyebrow text-slate-400">Status</p>
            <StatusSelect value={selected.status} options={REALTOR_STATUSES} colors={REALTOR_STATUS_COLORS} onChange={(v) => updateStatus(selected.id, v)} className="mt-2 w-full" />
          </div>
          {selected.notes && (
            <div className="rounded-md bg-[#f0ede6] p-3">
              <p className="eyebrow text-slate-400">Notes</p>
              <p className="mt-2 text-sm text-slate-600">{selected.notes}</p>
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}

function RealtorForm({ onDone }: { onDone: (r: Realtor) => void }) {
  const [f, setF] = useState({ name: '', email: '', phone: '', id_number: '', commission_rate: '5', status: 'PENDING', notes: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    const { data, error } = await supabase.from('realtors').insert({
      name: f.name, email: f.email, phone: f.phone || null, id_number: f.id_number || null,
      commission_rate: parseFloat(f.commission_rate) || 5, status: f.status, notes: f.notes || null,
    }).select().single();
    setSaving(false);
    if (error || !data) { setErr(error?.message?.includes('unique') ? 'A realtor with that email already exists.' : 'Could not save. Please try again.'); return; }
    onDone(data as Realtor);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <AF label="Full Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required />
      <AF label="Email" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} required />
      <div className="grid grid-cols-2 gap-4">
        <AF label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
        <AF label="National ID Number" value={f.id_number} onChange={(v) => setF({ ...f, id_number: v })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <AF label="Commission Rate (%)" type="number" value={f.commission_rate} onChange={(v) => setF({ ...f, commission_rate: v })} />
        <label className="block">
          <span className="eyebrow mb-1.5 block text-slate-400">Status</span>
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="admin-input w-full">
            {REALTOR_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Notes</span>
        <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} className="admin-input w-full resize-none" />
      </label>
      {err && <p className="text-sm text-[#a55445]">{err}</p>}
      <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving…' : 'Add Realtor'} <ArrowRight size={15} /></button>
    </form>
  );
}

// ─── Commissions ─────────────────────────────────────────

function CommissionsTab() {
  const [commissions, setCommissions] = useState<(Commission & { realtor_name?: string; unit_number?: string })[]>([]);
  const [realtors, setRealtors] = useState<Realtor[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState('ALL');

  const load = useCallback(async () => {
    const [cr, rr, sr] = await Promise.all([
      supabase.from('commissions').select('*').order('created_at', { ascending: false }),
      supabase.from('realtors').select('id,name,commission_rate,total_earned'),
      supabase.from('sales').select('id,unit_number,sale_price'),
    ]);
    const realtorMap = Object.fromEntries((rr.data ?? []).map((r) => [r.id, r.name]));
    const saleMap = Object.fromEntries((sr.data ?? []).map((s) => [s.id, s.unit_number]));
    setCommissions(((cr.data ?? []) as Commission[]).map((c) => ({
      ...c, realtor_name: realtorMap[c.realtor_id ?? ''] ?? '—', unit_number: saleMap[c.sale_id ?? ''] ?? '—',
    })));
    setRealtors((rr.data ?? []) as Realtor[]);
    setSales((sr.data ?? []) as Sale[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => commissions.filter((c) => statusFilter === 'ALL' || c.status === statusFilter), [commissions, statusFilter]);
  const totalPending = useMemo(() => commissions.filter((c) => c.status === 'PENDING').reduce((a, c) => a + c.amount, 0), [commissions]);
  const totalPaid = useMemo(() => commissions.filter((c) => c.status === 'PAID').reduce((a, c) => a + c.amount, 0), [commissions]);

  const updateStatus = async (id: string, status: string) => {
    const paid_at = status === 'PAID' ? new Date().toISOString() : null;
    setCommissions((p) => p.map((c) => c.id === id ? { ...c, status, paid_at: paid_at ?? c.paid_at } : c));
    await supabase.from('commissions').update({ status, ...(paid_at ? { paid_at } : {}) }).eq('id', id);

    if (status === 'PAID') {
      const comm = commissions.find((c) => c.id === id);
      if (comm?.realtor_id) {
        const realtor = realtors.find((r) => r.id === comm.realtor_id);
        if (realtor) {
          const newTotal = (realtor.total_earned ?? 0) + comm.amount;
          await supabase.from('realtors').update({ total_earned: newTotal }).eq('id', comm.realtor_id);
        }
      }
    }
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatMini label="Pending Commissions" value={fmtKes(totalPending)} color="text-[#856b2e]" />
        <StatMini label="Total Paid Out" value={fmtKes(totalPaid)} color="text-[#2e6b3e]" />
        <button onClick={() => setShowForm(true)} className="admin-add-btn flex items-center justify-center gap-2"><Plus size={16} /> Add Commission</button>
      </div>

      <div className="flex gap-3 mb-5">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="admin-input">
          <option value="ALL">All statuses</option>
          {COMMISSION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#c9c5bd] bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#c9c5bd] bg-[#f0ede6] text-[10px] uppercase tracking-[.12em] text-slate-400">
            <tr>{['Realtor', 'Unit', 'Amount', 'Rate', 'Status', 'Paid At', 'Notes'].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b border-[#e6e2da] last:border-0 hover:bg-[#f0ede6]/60">
                <td className="px-4 py-3 font-medium">{c.realtor_name}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{c.unit_number}</td>
                <td className="px-4 py-3 font-medium text-[#2e6b3e]">{fmtKes(c.amount)}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{c.rate}%</td>
                <td className="px-4 py-3">
                  <StatusSelect value={c.status} options={COMMISSION_STATUSES} colors={COMMISSION_STATUS_COLORS} onChange={(v) => updateStatus(c.id, v)} />
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{c.paid_at ? new Date(c.paid_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-400 max-w-[160px] truncate">{c.notes ?? '—'}</td>
              </tr>
            ))}
            {filtered.length === 0 && <EmptyRow cols={7} text="No commissions recorded yet." />}
          </tbody>
        </table>
      </div>

      {showForm && (
        <Modal title="Add Commission" onClose={() => setShowForm(false)}>
          <CommissionForm realtors={realtors} sales={sales} onDone={(c) => { setCommissions((p) => [c, ...p]); setShowForm(false); }} />
        </Modal>
      )}
    </div>
  );
}

function CommissionForm({ realtors, sales, onDone }: { realtors: Realtor[]; sales: Sale[]; onDone: (c: Commission) => void }) {
  const [f, setF] = useState({ realtor_id: '', sale_id: '', amount: '', rate: '5', notes: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedRealtor = realtors.find((r) => r.id === f.realtor_id);
  const selectedSale = sales.find((s) => s.id === f.sale_id);

  useEffect(() => {
    if (selectedSale?.sale_price) setF((prev) => ({ ...prev, rate: '5', amount: String((selectedSale.sale_price! * 5) / 100) }));
  }, [selectedSale?.id, selectedSale?.sale_price]);

  const autoCalc = () => {
    if (selectedSale?.sale_price && f.rate) {
      const calc = (selectedSale.sale_price * parseFloat(f.rate)) / 100;
      setF((prev) => ({ ...prev, amount: String(calc) }));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    const { data, error } = await supabase.from('commissions').insert({
      realtor_id: f.realtor_id || null, sale_id: f.sale_id || null,
      amount: parseFloat(f.amount), rate: parseFloat(f.rate), notes: f.notes || null,
    }).select().single();
    setSaving(false);
    if (error || !data) { setErr('Could not save. Please try again.'); return; }
    onDone(data as Commission);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Realtor</span>
        <select value={f.realtor_id} onChange={(e) => { const r = realtors.find((r) => r.id === e.target.value); setF({ ...f, realtor_id: e.target.value, rate: r ? String(r.commission_rate) : f.rate }); }} className="admin-input w-full" required>
          <option value="">— Select realtor —</option>
          {realtors.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.commission_rate}%)</option>)}
        </select>
      </label>
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Linked Sale</span>
        <select value={f.sale_id} onChange={(e) => setF({ ...f, sale_id: e.target.value })} className="admin-input w-full">
          <option value="">— No linked sale —</option>
          {sales.map((s) => <option key={s.id} value={s.id}>Unit {s.unit_number} — {fmtKes(s.sale_price)}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-4">
        <div><span className="eyebrow mb-1.5 block text-slate-400">Commission Rate</span><div className="rounded border border-[#c9c5bd] bg-[#f0ede6] px-3 py-2 text-sm font-semibold text-[#17232b]">5% fixed</div></div>
        <div>
          <AF label="Commission Amount (KSh)" type="number" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required />
          {selectedSale?.sale_price && (
            <button type="button" onClick={autoCalc} className="mt-1 text-[10px] text-[#20afd1] hover:underline">Auto-calculate from sale price</button>
          )}
        </div>
      </div>
      {selectedRealtor && <p className="text-xs text-slate-400">Realtor default rate: {selectedRealtor.commission_rate}%</p>}
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Notes</span>
        <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} className="admin-input w-full resize-none" />
      </label>
      {err && <p className="text-sm text-[#a55445]">{err}</p>}
      <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving…' : 'Save Commission'} <ArrowRight size={15} /></button>
    </form>
  );
}

// ─── Investment calculator ──────────────────────────────

function CalculatorTab() {
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('20');
  const [term, setTerm] = useState('12');
  const amount = Number(price) || 0;
  const depositAmount = amount * ((Number(deposit) || 0) / 100);
  const balance = Math.max(amount - depositAmount, 0);
  const monthly = balance / Math.max(Number(term) || 1, 1);
  const commission = amount * 0.05;

  return (
    <div className="space-y-6">
      <div className="max-w-2xl"><p className="eyebrow text-[#20afd1]">Sales tool</p><h2 className="mt-3 font-serif text-4xl">Investment calculator</h2><p className="mt-3 text-sm leading-6 text-slate-500">Estimate the deposit, payment plan, and realtor commission before recording a sale.</p></div>
      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-lg border border-[#c9c5bd] bg-white p-6 shadow-sm">
          <div className="grid gap-5"><AF label="Property price (KSh)" type="number" value={price} onChange={setPrice} /><AF label="Deposit (%)" type="number" value={deposit} onChange={setDeposit} /><AF label="Payment term (months)" type="number" value={term} onChange={setTerm} /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <StatMini label="Deposit required" value={fmtKes(depositAmount)} color="text-[#2e5f7a]" />
          <StatMini label="Balance" value={fmtKes(balance)} color="text-[#856b2e]" />
          <StatMini label="Estimated monthly" value={fmtKes(monthly)} color="text-[#3a6f69]" />
          <StatMini label="Realtor commission (5%)" value={fmtKes(commission)} color="text-[#2e6b3e]" />
        </div>
      </div>
    </div>
  );
}

// ─── Projects ────────────────────────────────────────────

function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    setProjects((data ?? []) as Project[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const updateStatus = async (id: string, status: string) => {
    setProjects((p) => p.map((r) => r.id === id ? { ...r, status } : r));
    await supabase.from('projects').update({ status }).eq('id', id);
  };

  const togglePublished = async (project: Project) => {
    const is_published = !project.is_published;
    setProjects((p) => p.map((r) => r.id === project.id ? { ...r, is_published } : r));
    await supabase.from('projects').update({ is_published }).eq('id', project.id);
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this project and unlink its units?')) return;
    setProjects((p) => p.filter((project) => project.id !== id));
    await supabase.from('projects').delete().eq('id', id);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-slate-400">{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowForm(true)} className="admin-add-btn flex items-center gap-2"><Plus size={16} /> Add Project</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p) => (
          <div key={p.id} className="group relative rounded-lg border border-[#c9c5bd] bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#20afd1] hover:shadow-md">
            {p.image_url && <img src={p.image_url} alt="" className="mb-5 h-36 w-full object-cover" />}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-xl">{p.name}</h3>
                <p className="mt-1 text-xs text-slate-400">{p.location ?? 'Location not set'}</p>
              </div>
              <div className="flex items-center gap-2"><button onClick={() => setEditing(p)} className="text-slate-300 hover:text-[#20afd1]" aria-label={`Edit ${p.name}`}><Pencil size={15} /></button><StatusSelect value={p.status} options={PROJECT_STATUSES} colors={{ 'COMING SOON': 'bg-[#f2e7c9] text-[#856b2e]', 'UNDER CONSTRUCTION': 'bg-[#d4e8f5] text-[#2e5f7a]', 'COMPLETED': 'bg-[#d4f0dc] text-[#2e6b3e]', 'PLANNING': 'bg-[#e6e2da] text-[#5a564d]' }} onChange={(v) => updateStatus(p.id, v)} /></div>
            </div>
            {p.description && <p className="mt-3 text-sm text-slate-500">{p.description}</p>}
            <div className="mt-4 flex items-center justify-between text-xs"><span className="text-slate-300">Created {fmt(p.created_at)}</span><button onClick={() => togglePublished(p)} className={`flex items-center gap-1 uppercase tracking-[.1em] ${p.is_published ? 'text-[#2e6b3e]' : 'text-slate-400'}`}>{p.is_published ? <Eye size={13} /> : <EyeOff size={13} />}{p.is_published ? 'Live' : 'Hidden'}</button></div>
            <button onClick={() => remove(p.id)} className="absolute right-4 bottom-4 text-slate-300 hover:text-[#a55445]" aria-label={`Delete ${p.name}`}><Trash2 size={15} /></button>
          </div>
        ))}
        {projects.length === 0 && <div className="rounded-lg border border-dashed border-[#b8b4ab] p-12 text-center text-sm text-slate-400">No projects yet.</div>}
      </div>

      {showForm && (
        <Modal title="Add Project" onClose={() => setShowForm(false)}>
          <ProjectForm onDone={(p) => { setProjects((prev) => [p, ...prev]); setShowForm(false); }} />
        </Modal>
      )}
      {editing && <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}><ProjectForm initial={editing} onDone={(p) => { setProjects((prev) => prev.map((item) => item.id === p.id ? p : item)); setEditing(null); }} /></Modal>}
    </div>
  );
}

function ProjectForm({ initial, onDone }: { initial?: Project; onDone: (p: Project) => void }) {
  const [f, setF] = useState({ name: initial?.name ?? '', location: initial?.location ?? '', status: initial?.status ?? 'COMING SOON', description: initial?.description ?? '', is_published: initial?.is_published ?? false });
  const [image, setImage] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    let image_url: string | null = initial?.image_url ?? null;
    try { if (image) image_url = await uploadPublicMedia(image, 'projects'); } catch { setErr('Image upload failed. Please try again.'); setSaving(false); return; }
    const values = { name: f.name, location: f.location || null, status: f.status, description: f.description || null, image_url, is_published: f.is_published };
    const response = initial
      ? await supabase.from('projects').update(values).eq('id', initial.id).select().single()
      : await supabase.from('projects').insert(values).select().single();
    const { data, error } = response;
    setSaving(false);
    if (error || !data) { setErr('Could not save. Please try again.'); return; }
    onDone(data as Project);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <AF label="Project Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required />
      <AF label="Location" value={f.location} onChange={(v) => setF({ ...f, location: v })} />
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Status</span>
        <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="admin-input w-full">
          {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Project image</span>{initial?.image_url && !image && <img src={initial.image_url} alt="Current project" className="mb-2 h-24 w-full object-cover" />}<span className="flex cursor-pointer items-center gap-2 border border-dashed border-[#20afd1] bg-[#f5fbfc] px-3 py-3 text-xs text-[#247b85] hover:bg-[#e8f7fa]"><Upload size={15} /> {image?.name ?? (initial?.image_url ? 'Replace current image' : 'Choose image from computer')}<input type="file" accept="image/*" className="hidden" onChange={(e) => setImage(e.target.files?.[0] ?? null)} /></span></label>
      <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={f.is_published} onChange={(e) => setF({ ...f, is_published: e.target.checked })} /> Publish this project on the public website</label>
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Description</span>
        <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3} className="admin-input w-full resize-none" />
      </label>
      {err && <p className="text-sm text-[#a55445]">{err}</p>}
      <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving…' : initial ? 'Save Project Changes' : 'Save Project'} <ArrowRight size={15} /></button>
    </form>
  );
}

// ─── Construction Updates ────────────────────────────────

function UpdatesTab() {
  const [updates, setUpdates] = useState<ConstructionUpdate[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ConstructionUpdate | null>(null);

  const load = useCallback(async () => {
    const [ur, pr] = await Promise.all([
      supabase.from('construction_updates').select('*').order('posted_at', { ascending: false }),
      supabase.from('projects').select('id,name'),
    ]);
    setUpdates((ur.data ?? []) as ConstructionUpdate[]);
    setProjects((pr.data ?? []) as Project[]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const remove = async (id: string) => {
    setUpdates((p) => p.filter((u) => u.id !== id));
    await supabase.from('construction_updates').delete().eq('id', id);
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <p className="text-xs text-slate-400">{updates.length} update{updates.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowForm(true)} className="admin-add-btn flex items-center gap-2"><Plus size={16} /> Post Update</button>
      </div>
      <div className="space-y-4">
        {updates.map((u) => (
          <div key={u.id} className="rounded-lg border border-[#c9c5bd] bg-white p-6 shadow-sm">
            {u.image_url && <img src={u.image_url} alt="" className="mb-5 h-48 w-full object-cover" />}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-serif text-lg">{u.title}</h3>
                <p className="mt-1 text-xs text-slate-400">{new Date(u.posted_at).toLocaleDateString()}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-[#dceeea] px-3 py-1.5 text-xs font-semibold text-[#3a6f69]">{u.progress_pct}%</span>
                <button onClick={() => setEditing(u)} className="text-slate-300 hover:text-[#20afd1]" aria-label={`Edit ${u.title}`}><Pencil size={16} /></button>
                <button onClick={() => remove(u.id)} className="text-slate-300 hover:text-[#a55445]" aria-label="Delete"><X size={16} /></button>
              </div>
            </div>
            {u.body && <p className="mt-3 text-sm text-slate-500">{u.body}</p>}
          </div>
        ))}
        {updates.length === 0 && <div className="rounded-lg border border-dashed border-[#b8b4ab] p-12 text-center text-sm text-slate-400">No construction updates posted yet.</div>}
      </div>

      {showForm && (
        <Modal title="Post Update" onClose={() => setShowForm(false)}>
          <UpdateForm projects={projects} onDone={(u) => { setUpdates((p) => [u, ...p]); setShowForm(false); }} />
        </Modal>
      )}
      {editing && <Modal title={`Edit ${editing.title}`} onClose={() => setEditing(null)}><UpdateForm projects={projects} initial={editing} onDone={(u) => { setUpdates((p) => p.map((item) => item.id === u.id ? u : item)); setEditing(null); }} /></Modal>}
    </div>
  );
}

function UpdateForm({ projects, initial, onDone }: { projects: Project[]; initial?: ConstructionUpdate; onDone: (u: ConstructionUpdate) => void }) {
  const [f, setF] = useState({ project_id: initial?.project_id ?? '', title: initial?.title ?? '', body: initial?.body ?? '', progress_pct: String(initial?.progress_pct ?? 0), image_url: initial?.image_url ?? '' });
  const [image, setImage] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    let image_url = f.image_url || null;
    try { if (image) image_url = await uploadPublicMedia(image, 'updates'); } catch { setErr('Image upload failed. Please try again.'); setSaving(false); return; }
    const values = {
      project_id: f.project_id || null, title: f.title,
      body: f.body || null, progress_pct: parseInt(f.progress_pct) || 0, image_url,
    };
    const response = initial
      ? await supabase.from('construction_updates').update(values).eq('id', initial.id).select().single()
      : await supabase.from('construction_updates').insert(values).select().single();
    const { data, error } = response;
    setSaving(false);
    if (error || !data) { setErr('Could not post. Please try again.'); return; }
    onDone(data as ConstructionUpdate);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <AF label="Title" value={f.title} onChange={(v) => setF({ ...f, title: v })} required />
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Project</span>
        <select value={f.project_id} onChange={(e) => setF({ ...f, project_id: e.target.value })} className="admin-input w-full">
          <option value="">— No project —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <AF label="Progress (%)" type="number" value={f.progress_pct} onChange={(v) => setF({ ...f, progress_pct: v })} />
      <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Site image</span>{initial?.image_url && !image && <img src={initial.image_url} alt="Current update" className="mb-2 h-24 w-full object-cover" />}<span className="flex cursor-pointer items-center gap-2 border border-dashed border-[#20afd1] bg-[#f5fbfc] px-3 py-3 text-xs text-[#247b85] hover:bg-[#e8f7fa]"><Upload size={15} /> {image?.name ?? (initial?.image_url ? 'Replace current image' : 'Upload site image from computer')}<input type="file" accept="image/*" className="hidden" onChange={(e) => setImage(e.target.files?.[0] ?? null)} /></span></label>
      <label className="block">
        <span className="eyebrow mb-1.5 block text-slate-400">Update Body</span>
        <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={4} className="admin-input w-full resize-none" />
      </label>
      {err && <p className="text-sm text-[#a55445]">{err}</p>}
      <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving…' : initial ? 'Save Update Changes' : 'Post Update'} <ArrowRight size={15} /></button>
    </form>
  );
}

// ─── Sign-in ─────────────────────────────────────────────

export function AdminSignIn({ onSuccess }: { onSuccess: (user: AdminUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    const result = mode === 'signin' ? await signIn(email, password) : await signUp(email, password);
    setLoading(false);
    if (result.error) {
      setError(mode === 'signin' ? 'Invalid email or password.' : 'Could not create account. This email may already be registered.');
      return;
    }
    if (mode === 'signup' && result.data?.user) {
      onSuccess({ id: result.data.user.id, email, role: 'staff' });
    }
    // signin: onAuthStateChange fires and parent updates
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#17232b] px-5">
      <div className="w-full max-w-md">
        <div className="mb-10 flex flex-col items-center gap-4">
          <img src="/NBG_LOGO.png" alt="Next Bridge Group" className="h-16 w-auto" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <div className="text-center">
            <p className="text-[11px] font-bold tracking-[.22em] text-white">NEXT BRIDGE</p>
            <p className="text-[9px] tracking-[.22em] text-white/40">GROUP LIMITED · ADMIN</p>
          </div>
        </div>
        <div className="rounded-lg bg-[#f0ede6] p-8 shadow-2xl">
          <h1 className="font-serif text-3xl">{mode === 'signin' ? 'Sign in' : 'Create account'}</h1>
          <p className="mt-2 text-sm text-slate-500">Access the NBG management portal.</p>
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <AF label="Email" type="email" value={email} onChange={setEmail} required />
            <AF label="Password" type="password" value={password} onChange={setPassword} required />
            {error && <p className="text-sm text-[#a55445]">{error}</p>}
            <button disabled={loading} className="btn-primary disabled:opacity-60">{loading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'} <ArrowRight size={15} /></button>
          </form>
          <button onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }} className="mt-5 w-full text-center text-xs text-[#20afd1] hover:underline">
            {mode === 'signin' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
          </button>
        </div>
        <p className="mt-6 text-center text-[9px] uppercase tracking-[.14em] text-white/25">
          New accounts start as staff · Contact owner to upgrade to admin
        </p>
      </div>
    </div>
  );
}

// ─── Shared UI primitives ────────────────────────────────

function Spinner() {
  return <div className="flex items-center gap-2 text-sm text-slate-400"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#20afd1] border-t-transparent" />Loading…</div>;
}

function StatMini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-[#c9c5bd] bg-white p-5 shadow-sm">
      <p className="eyebrow text-slate-400">{label}</p>
      <p className={`mt-2 font-serif text-2xl ${color}`}>{value}</p>
    </div>
  );
}

function StatusSelect({ value, options, colors, onChange, className = '' }: { value: string; options: readonly string[]; colors: Record<string, string>; onChange: (v: string) => void; className?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border-0 px-2 py-1 text-[9px] font-semibold uppercase tracking-[.12em] outline-none cursor-pointer ${colors[value] ?? 'bg-[#e6e2da] text-slate-500'} ${className}`}
    >
      {options.map((o) => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
    </select>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071116]/60 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-[#f0ede6] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between">
          <h2 className="font-serif text-2xl">{title}</h2>
          <button onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#071116]/50" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-[#f0ede6] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-serif text-2xl">{title}</h2>
          <button onClick={onClose} aria-label="Close"><X size={20} /></button>
        </div>
        <div className="space-y-5">{children}</div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string | null | undefined; icon?: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="rounded-md bg-white p-3">
      <p className="eyebrow text-slate-400">{label}</p>
      <p className="mt-1 flex items-center gap-2 text-sm font-medium">{icon}{value}</p>
    </div>
  );
}

function NotesField({ defaultValue, onSave }: { defaultValue: string; onSave: (v: string) => void }) {
  const [val, setVal] = useState(defaultValue);
  const [saved, setSaved] = useState(false);

  const save = () => { onSave(val); setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div>
      <p className="eyebrow text-slate-400">Internal Notes</p>
      <textarea value={val} onChange={(e) => { setVal(e.target.value); setSaved(false); }} rows={4} placeholder="Add internal notes…" className="admin-input mt-2 w-full resize-none" />
      <button onClick={save} className="mt-2 flex items-center gap-1.5 text-xs text-[#20afd1] hover:underline">
        {saved ? <><Check size={13} /> Saved</> : 'Save notes'}
      </button>
    </div>
  );
}

function EmptyRow({ cols, text }: { cols: number; text: string }) {
  return <tr><td colSpan={cols} className="px-4 py-10 text-center text-sm text-slate-400">{text}</td></tr>;
}

function AF({ label, name, type = 'text', value, onChange, required = false }: { label: string; name?: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block text-slate-400">{label}{required ? ' *' : ''}</span>
      <input type={type} name={name} value={value} onChange={(e) => onChange(e.target.value)} required={required} className="admin-input w-full" />
    </label>
  );
}

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}
