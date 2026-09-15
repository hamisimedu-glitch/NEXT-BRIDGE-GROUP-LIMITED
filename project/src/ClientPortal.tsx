import { FormEvent, useEffect, useState } from 'react';
import { ArrowRight, BarChart3, Building2, Calculator, Check, ChevronDown, FileText, Home, LockKeyhole, Menu, MessageCircle, Settings, ShieldCheck, UserRound, X } from 'lucide-react';
import { sendMagicLink, sendPasswordReset, signInWithPassword, signUp, updatePassword, type AdminUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { ConstructionUpdate, Investment, Project, ProjectUnit, Realtor } from '@/lib/types';

type View = 'home' | 'projects' | 'units' | 'construction' | 'gallery' | 'about' | 'contact' | 'viewing' | 'faq' | 'portal' | 'admin';
type PortalSection = 'overview' | 'progress' | 'investments' | 'availability' | 'resources' | 'profile';

export function ClientPortalSignIn() {
  const [mode, setMode] = useState<'magic' | 'password' | 'signup' | 'reset'>('magic');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');

    const trimmedEmail = email.trim();

    if (mode === 'signup') {
      if (password.length < 8) {
        setLoading(false);
        setError('Password must be at least 8 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setLoading(false);
        setError('Passwords do not match.');
        return;
      }

      const result = await signUp(trimmedEmail, password, 'client');
      setLoading(false);

      if (result.error) {
        setError(result.error.message || 'We could not create your account.');
        return;
      }

      setNotice('Account created. Check your email to confirm your address, then sign in to your portal.');
      setMode('password');
      setPassword('');
      setConfirmPassword('');
      return;
    }

    const result = mode === 'magic'
      ? await sendMagicLink(trimmedEmail)
      : mode === 'reset'
        ? await sendPasswordReset(trimmedEmail)
        : await signInWithPassword(trimmedEmail, password);

    setLoading(false);

    if (result.error) {
      setError('We could not complete that request. Check your details and try again.');
      return;
    }

    setNotice(mode === 'password' ? 'Signed in. Loading your portal...' : mode === 'reset' ? 'Password reset instructions are on their way.' : 'Check your inbox for your secure sign-in link.');
  };

  return (
    <main className="page-top section-pad bg-[#f4f1eb]">
      <div className="mx-auto max-w-xl">
        <div className="border border-[#a9d9d8] bg-[#eefbf9] p-7 md:p-12">
          <p className="eyebrow text-[#087f88]">Secure client portal</p>
          <h1 className="mt-5 font-serif text-5xl leading-none text-[#123b4b]">Your project,<br /><em>in view.</em></h1>
          <div className="mt-8 flex border-b border-[#a9d9d8] text-[10px] uppercase tracking-[.12em]">
            {(['magic', 'password', 'signup', 'reset'] as const).map((item) => (
              <button key={item} onClick={() => setMode(item)} className={`border-b-2 px-3 py-3 ${mode === item ? 'border-[#19c6c9] text-[#087f88]' : 'border-transparent text-slate-500'}`}>
                {item === 'magic' ? 'Magic link' : item === 'password' ? 'Password' : item === 'signup' ? 'Sign up' : 'Reset'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-8 grid gap-5">
            <label>
              <span className="eyebrow mb-2 block text-slate-500">Email address</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="field" placeholder="you@example.com" />
            </label>

            {(mode === 'password' || mode === 'signup') && (
              <label>
                <span className="eyebrow mb-2 block text-slate-500">{mode === 'signup' ? 'Create password' : 'Password'}</span>
                <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required minLength={8} className="field" placeholder="At least 8 characters" />
              </label>
            )}

            {mode === 'signup' && (
              <label>
                <span className="eyebrow mb-2 block text-slate-500">Confirm password</span>
                <input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type="password" required minLength={8} className="field" placeholder="Repeat your password" />
              </label>
            )}

            {notice && <p className="text-sm text-[#087f88]">{notice}</p>}
            {error && <p className="text-sm text-[#a55445]">{error}</p>}

            <button disabled={loading} className="btn-primary justify-center disabled:opacity-60">
              {loading
                ? 'Please wait...'
                : mode === 'magic'
                  ? 'Email me a magic link'
                  : mode === 'reset'
                    ? 'Send reset instructions'
                    : mode === 'signup'
                      ? 'Create my client account'
                      : 'Sign in securely'}
              <ArrowRight size={16} />
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

function PasswordSetup({ onDone }: { onDone: () => void }) { const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const submit = async (event: FormEvent) => { event.preventDefault(); if (password.length < 8 || password !== confirm) { setError('Passwords must match and contain at least 8 characters.'); return; } const { error: updateError } = await updatePassword(password); if (updateError) { setError('We could not save your password. Please request another reset link.'); return; } onDone(); }; return <div className="mb-8 border border-[#a9d9d8] bg-[#d9f6f3] p-6"><div className="flex items-center gap-3 text-[#087f88]"><LockKeyhole size={20} /><p className="eyebrow">Create your portal password</p></div><form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2"><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required className="admin-input" placeholder="New password" /><input value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" minLength={8} required className="admin-input" placeholder="Confirm password" />{error && <p className="text-sm text-[#a55445] sm:col-span-2">{error}</p>}<button className="btn-primary sm:col-span-2">Save password <Check size={16} /></button></form></div>; }

function InvestmentCalculator() { const [price, setPrice] = useState(''); const [deposit, setDeposit] = useState('20'); const [months, setMonths] = useState('24'); const total = Number(price) || 0; const depositValue = total * (Number(deposit) || 0) / 100; const balance = Math.max(0, total - depositValue); const monthly = balance / Math.max(1, Number(months) || 1); return <section className="portal-panel"><div className="flex items-center gap-3"><Calculator className="text-[#087f88]" size={20} /><div><p className="eyebrow text-[#087f88]">Planning tool</p><h3 className="mt-2 font-serif text-3xl text-[#123b4b]">Model a payment plan.</h3></div></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><input value={price} onChange={(event) => setPrice(event.target.value)} type="number" min="0" className="admin-input" placeholder="Property price (KSh)" /><input value={deposit} onChange={(event) => setDeposit(event.target.value)} type="number" min="0" max="100" className="admin-input" placeholder="Deposit %" /><input value={months} onChange={(event) => setMonths(event.target.value)} type="number" min="1" className="admin-input" placeholder="Months" /></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div><p className="eyebrow text-slate-500">Deposit</p><p className="mt-2 text-xl text-[#123b4b]">KSh {depositValue.toLocaleString()}</p></div><div><p className="eyebrow text-slate-500">Balance</p><p className="mt-2 text-xl text-[#123b4b]">KSh {balance.toLocaleString()}</p></div><div><p className="eyebrow text-slate-500">Est. monthly</p><p className="mt-2 text-xl font-semibold text-[#087f88]">KSh {monthly.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p></div></div><p className="mt-5 text-xs text-slate-500">Planning estimate only. Final terms are confirmed by the NBG team.</p></section>; }

function ClientPortal({ user, onSignOut, navigate }: { user: AdminUser; onSignOut: () => void; navigate: (view: View) => void }) {
  const [section, setSection] = useState<PortalSection>('overview'); const [sidebarOpen, setSidebarOpen] = useState(false); const [projects, setProjects] = useState<Project[]>([]); const [updates, setUpdates] = useState<ConstructionUpdate[]>([]); const [units, setUnits] = useState<ProjectUnit[]>([]); const [investments, setInvestments] = useState<Investment[]>([]); const [realtor, setRealtor] = useState<Realtor | null>(null); const [loading, setLoading] = useState(true); const [showInvestment, setShowInvestment] = useState(false); const [projectId, setProjectId] = useState(''); const [amount, setAmount] = useState(''); const [plan, setPlan] = useState('Coastal starter'); const recovery = window.location.search.includes('reset=1') || window.location.hash.includes('type=recovery');
  const load = async () => { const [projectResult, updateResult, unitResult, investmentResult, realtorResult] = await Promise.all([supabase.from('projects').select('*').eq('is_published', true).order('created_at', { ascending: false }), supabase.from('construction_updates').select('*').order('posted_at', { ascending: false }).limit(8), supabase.from('project_units').select('*').eq('is_published', true).order('unit_number'), supabase.from('investments').select('*').eq('investor_user_id', user.id).order('created_at', { ascending: false }), supabase.from('realtors').select('*').eq('user_id', user.id).maybeSingle()]); setProjects((projectResult.data ?? []) as Project[]); setUpdates((updateResult.data ?? []) as ConstructionUpdate[]); setUnits((unitResult.data ?? []) as ProjectUnit[]); setInvestments((investmentResult.data ?? []) as Investment[]); setRealtor((realtorResult.data ?? null) as Realtor | null); setLoading(false); };
  useEffect(() => { load(); }, [user.id]);
  const selectSection = (next: PortalSection) => { setSection(next); setSidebarOpen(false); };
  const submitInvestment = async (event: FormEvent) => { event.preventDefault(); await supabase.from('investments').insert({ investor_user_id: user.id, investor_name: user.email.split('@')[0], investor_email: user.email, project_id: projectId || null, amount_interested: Number(amount) || null, currency: 'KES', status: 'INQUIRY', notes: `Plan: ${plan}` }); setShowInvestment(false); setAmount(''); load(); };
  const sidebarItems: { id: PortalSection; label: string; icon: typeof Home; group: string }[] = [{ id: 'overview', label: 'Overview', icon: Home, group: 'Workspace' }, { id: 'progress', label: 'Project progress', icon: BarChart3, group: 'Workspace' }, { id: 'investments', label: 'Investment studio', icon: Calculator, group: 'Plan' }, { id: 'availability', label: 'Available homes', icon: Building2, group: 'Plan' }, { id: 'resources', label: 'Documents & support', icon: FileText, group: 'Connect' }, { id: 'profile', label: 'Profile & security', icon: Settings, group: 'Connect' }];
  const active = sidebarItems.find((item) => item.id === section) ?? sidebarItems[0];

  const content = section === 'overview' ? <OverviewContent projects={projects} updates={updates} units={units} investments={investments} setSection={selectSection} /> : section === 'progress' ? <ProgressContent updates={updates} /> : section === 'investments' ? <InvestmentContent projects={projects} investments={investments} showInvestment={showInvestment} setShowInvestment={setShowInvestment} projectId={projectId} setProjectId={setProjectId} amount={amount} setAmount={setAmount} plan={plan} setPlan={setPlan} submitInvestment={submitInvestment} realtor={realtor} setRealtor={setRealtor} user={user} /> : section === 'availability' ? <AvailabilityContent units={units} /> : section === 'resources' ? <ResourcesContent navigate={navigate} /> : <ProfileContent user={user} recovery={recovery} onSignOut={onSignOut} />;
  return <div className="portal-shell"><aside className={`portal-sidebar ${sidebarOpen ? 'portal-sidebar-open' : ''}`}><div className="portal-brand"><span className="brand-mark brand-mark-inverse"><img src="/NBG_LOGO-removebg-preview.png" alt="Next Bridge Group" /></span><div><p className="text-[10px] font-bold tracking-[.2em]">NBG CLIENT</p><p className="text-[8px] tracking-[.16em] text-white/45">PRIVATE WORKSPACE</p></div><button onClick={() => setSidebarOpen(false)} className="portal-close md:hidden" aria-label="Close portal menu"><X size={18} /></button></div><nav className="portal-nav">{['Workspace', 'Plan', 'Connect'].map((group) => <div key={group} className="portal-nav-group"><p>{group}</p>{sidebarItems.filter((item) => item.group === group).map(({ id, label, icon: Icon }) => <button key={id} onClick={() => selectSection(id)} className={section === id ? 'portal-nav-active' : ''}><Icon size={16} /><span>{label}</span>{section === id && <ArrowRight size={13} className="ml-auto" />}</button>)}</div>)}</nav><button onClick={onSignOut} className="portal-signout">Sign out</button></aside><button onClick={() => setSidebarOpen(true)} className="portal-mobile-trigger md:hidden" aria-label="Open portal menu"><Menu size={20} /></button><div className="portal-main"><header className="portal-topbar"><div><p className="eyebrow text-[#8de7e2]">{active.group}</p><h1>{active.label}</h1></div><div className="hidden items-center gap-3 sm:flex"><span className="portal-user-dot" /> <span className="text-xs text-slate-500">{user.email}</span><button onClick={() => navigate('contact')} className="btn-primary !px-4 !py-3">Speak with the team</button></div></header><main className="portal-content">{recovery && <PasswordSetup onDone={() => window.history.replaceState({}, '', '/portal')} />}{loading ? <div className="portal-loading"><span /> Loading your private workspace...</div> : <div className="portal-reveal">{content}</div>}</main></div></div>;
}

function OverviewContent({ projects, updates, units, investments, setSection }: { projects: Project[]; updates: ConstructionUpdate[]; units: ProjectUnit[]; investments: Investment[]; setSection: (section: PortalSection) => void }) { return <><div className="portal-welcome"><div><p className="eyebrow text-[#087f88]">Your NBG dashboard</p><h2>Stay close to<br /><em>what comes next.</em></h2><p>One calm place for project progress, investment planning, and the next conversation.</p></div><ShieldCheck size={54} strokeWidth={1.2} /></div><div className="portal-stat-grid"><PortalStat label="Published projects" value={projects.length} detail="Explore current developments" /><PortalStat label="Site updates" value={updates.length} detail="Latest verified notes" /><PortalStat label="Homes available" value={units.length} detail="Published availability" /><PortalStat label="My enquiries" value={investments.length} detail="Investment plans" /></div><div className="portal-quick-grid"><button onClick={() => setSection('progress')}><BarChart3 size={20} /><span>Track progress</span><ArrowRight size={15} /></button><button onClick={() => setSection('investments')}><Calculator size={20} /><span>Plan an investment</span><ArrowRight size={15} /></button><button onClick={() => setSection('availability')}><Building2 size={20} /><span>Explore homes</span><ArrowRight size={15} /></button></div></>; }

function PortalStat({ label, value, detail }: { label: string; value: number; detail: string }) { return <div className="portal-stat"><p className="eyebrow text-[#087f88]">{label}</p><p className="mt-4 font-serif text-5xl text-[#123b4b]">{value}</p><p className="mt-3 text-xs text-slate-500">{detail}</p></div>; }
function ProgressContent({ updates }: { updates: ConstructionUpdate[] }) { return <section><div className="portal-section-heading"><div><p className="eyebrow text-[#087f88]">Verified feed</p><h2>Progress you can<br /><em>see and trust.</em></h2></div><span className="portal-live-badge">Live updates</span></div><div className="portal-timeline">{updates.map((update) => <article key={update.id}><span className="portal-timeline-dot">{update.progress_pct}%</span><div><p className="eyebrow text-slate-500">{new Date(update.posted_at).toLocaleDateString()}</p><h3>{update.title}</h3>{update.body && <p>{update.body}</p>}</div></article>)}{updates.length === 0 && <p className="text-sm text-slate-500">The NBG team has not published a construction update yet.</p>}</div></section>; }
function AvailabilityContent({ units }: { units: ProjectUnit[] }) { return <section><div className="portal-section-heading"><div><p className="eyebrow text-[#087f88]">Published inventory</p><h2>Find a place<br /><em>that feels like yours.</em></h2></div></div><div className="portal-unit-grid">{units.map((unit) => <article key={unit.id}><div><p className="eyebrow text-[#087f88]">Unit {unit.unit_number}</p><h3>{unit.type || 'Residence'}</h3><p>{unit.bedrooms ?? 0} bedrooms · {unit.size || 'Size on request'}</p></div><span>{unit.status}</span></article>)}{units.length === 0 && <p className="text-sm text-slate-500">No published homes are available yet.</p>}</div></section>; }
function ResourcesContent({ navigate }: { navigate: (view: View) => void }) { return <section><div className="portal-section-heading"><div><p className="eyebrow text-[#087f88]">Your resources</p><h2>Everything you need,<br /><em>when you need it.</em></h2></div></div><div className="portal-resource-grid"><article><FileText size={22} /><h3>Project documents</h3><p>Brochures, floor plans, and verified documents will appear here.</p><span>Coming with your first enquiry</span></article><article><MessageCircle size={22} /><h3>Concierge support</h3><p>Ask the team about a private viewing, payment plan, or project detail.</p><button onClick={() => navigate('contact')}>Start a conversation <ArrowRight size={14} /></button></article></div></section>; }
function ProfileContent({ user, recovery, onSignOut }: { user: AdminUser; recovery: boolean; onSignOut: () => void }) { return <section><div className="portal-section-heading"><div><p className="eyebrow text-[#087f88]">Account controls</p><h2>Your profile,<br /><em>kept secure.</em></h2></div></div><div className="portal-profile"><div><p className="eyebrow text-slate-500">Signed-in email</p><p className="mt-2 text-lg text-[#123b4b]">{user.email}</p></div><div><p className="eyebrow text-slate-500">Access level</p><p className="mt-2 text-lg text-[#087f88]">Client</p></div><button onClick={onSignOut} className="btn-primary">Sign out <ArrowRight size={15} /></button></div>{!recovery && <p className="mt-5 text-sm text-slate-500">To change your password, use the Reset tab on the portal sign-in screen.</p>}</section>; }
function InvestmentContent({ projects, investments, showInvestment, setShowInvestment, projectId, setProjectId, amount, setAmount, plan, setPlan, submitInvestment, realtor, setRealtor, user }: { projects: Project[]; investments: Investment[]; showInvestment: boolean; setShowInvestment: (value: boolean) => void; projectId: string; setProjectId: (value: string) => void; amount: string; setAmount: (value: string) => void; plan: string; setPlan: (value: string) => void; submitInvestment: (event: FormEvent) => void; realtor: Realtor | null; setRealtor: (value: Realtor) => void; user: AdminUser }) { const [name, setName] = useState(realtor?.name ?? ''); const [phone, setPhone] = useState(realtor?.phone ?? ''); return <section><div className="portal-section-heading"><div><p className="eyebrow text-[#087f88]">Plan & grow</p><h2>Make the next move<br /><em>with clarity.</em></h2></div></div><div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><InvestmentCalculator /><div className="portal-panel"><div className="flex items-center gap-3"><UserRound className="text-[#087f88]" /><div><p className="eyebrow text-[#087f88]">Realtor pathway</p><h3 className="mt-2 font-serif text-3xl text-[#123b4b]">{realtor ? `Application: ${realtor.status}` : 'Represent NBG.'}</h3></div></div>{realtor ? <p className="mt-4 text-sm leading-6 text-slate-600">Your application is with the NBG team. Status updates and commission details will appear here.</p> : <form onSubmit={async (event) => { event.preventDefault(); const { data } = await supabase.from('realtors').insert({ user_id: user.id, name, email: user.email, phone: phone || null, status: 'PENDING' }).select().single(); if (data) setRealtor(data as Realtor); }} className="mt-5 grid gap-3"><input value={name} onChange={(event) => setName(event.target.value)} required className="admin-input" placeholder="Full name" /><input value={phone} onChange={(event) => setPhone(event.target.value)} className="admin-input" placeholder="Phone number" /><button className="btn-primary">Apply to become a realtor <ArrowRight size={15} /></button></form>}</div></div><div className="mt-8 portal-panel"><div className="flex items-center justify-between"><div><p className="eyebrow text-[#087f88]">Saved investment plans</p><h3 className="mt-2 font-serif text-3xl text-[#123b4b]">Your plans</h3></div><button onClick={() => setShowInvestment(!showInvestment)} className="btn-primary">{showInvestment ? 'Close' : 'Create plan'}</button></div>{showInvestment && <form onSubmit={submitInvestment} className="mt-6 grid gap-4 border-t border-[#a9d9d8] pt-6 md:grid-cols-4"><select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="admin-input"><option value="">Choose a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><select value={plan} onChange={(event) => setPlan(event.target.value)} className="admin-input"><option>Coastal starter</option><option>Family residence</option><option>Long-term investment</option><option>Premium ocean address</option></select><input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" min="0" className="admin-input" placeholder="Target amount (KSh)" /><button className="btn-primary">Send plan <ArrowRight size={15} /></button></form>}{investments.map((investment) => <div key={investment.id} className="flex items-center justify-between gap-4 border-b border-[#e2eeec] py-4"><div><p className="text-sm font-semibold text-[#123b4b]">{investment.notes || 'Investment enquiry'}</p><p className="mt-1 text-xs text-slate-500">{investment.currency} {investment.amount_interested?.toLocaleString() || 'Amount to discuss'}</p></div><span className="portal-status">{investment.status}</span></div>)}{investments.length === 0 && <p className="mt-5 text-sm text-slate-500">No plans yet. Create one when you are ready.</p>}</div></section>; }

export default ClientPortal;
