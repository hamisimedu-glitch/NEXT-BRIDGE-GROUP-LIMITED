import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, BarChart3, BedDouble, Bell, Building2, Calculator, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, Clock3, Eye, EyeOff, FileText, FileDown, Grid2X2, Heart, Home, List, LockKeyhole, Mail, MapPin, Menu, MessageCircle, Phone, Receipt, Ruler, Search, Send, Settings, ShieldCheck, UserRound, X } from 'lucide-react';
import { sendMagicLink, sendPasswordReset, signInWithGoogle, signInWithPassword, signUp, updatePassword, type AdminUser } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { ConstructionUpdate, Investment, Project, ProjectUnit, Realtor } from '@/lib/types';
import LocationMap from '@/LocationMap';
import CurrencyInput from '@/CurrencyInput';
import { formatMoneyInput, formatKes, parseMoney } from '@/lib/format';
import DashboardInbox from '@/DashboardInbox';
import { createVerifiedPdf, downloadPdf } from '@/lib/verified-pdf';
import ProjectDetailsPackage, { type PublicProjectDetails } from '@/ProjectDetailsPackage';

type View = 'home' | 'projects' | 'units' | 'construction' | 'gallery' | 'about' | 'contact' | 'viewing' | 'faq' | 'portal' | 'admin';
type PortalSection = 'overview' | 'progress' | 'payments' | 'investments' | 'availability' | 'resources' | 'profile';

type ReservationStage = { id: string; user_id: string; project_id: string | null; unit_id: string | null; stage: string; completed_at: string | null; notes: string | null; created_at: string };
type ClientDocument = { id: string; title: string; category: string; file_url: string; created_at: string; project_id: string | null; unit_id: string | null; is_global?: boolean; document_ref?: string | null; verification_code?: string | null; content_hash?: string | null; content_summary?: string | null; source_type?: string };
type ProjectInvestmentDocument = { id: string; project_id: string; title: string; category: string; storage_path: string; created_at: string; is_public: boolean; document_ref?: string; verification_code?: string; content_hash?: string | null };
type ClientPayment = { id: string; user_id: string; unit_id: string | null; project_id: string | null; buyer_installment_id: string | null; payment_reference?: string | null; description: string; due_date: string; amount: number; paid_amount: number; status: string; receipt_url: string | null; transaction_refs?: string[]; created_at: string };
type PurchasePaymentInstructions = { bank_name: string; bank_branch: string; account_name: string; account_number: string; swift_code: string; payment_instructions: string; is_published: boolean };
type SupportTicket = { id: string; subject: string; message: string; status: string; staff_reply: string | null; created_at: string; updated_at: string };
type ClientNotification = { id: string; title: string; body: string; kind: string; read_at: string | null; created_at: string };
type PurchaseRequestReceipt = { sale_id: string; unit: ProjectUnit; payment_mode: 'INSTALLMENTS' | 'FULL'; total_amount: number; initial_amount: number; installment_count: number; frequency: string; payment_reference: string };
type ClientProfile = { id: string; full_name: string; phone: string; preferred_location: string; investment_budget: string; notes: string; identity_document_type: string; identity_document_number: string; residential_address: string };

function kenyaCalendarDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function ClientPortalSignIn() {
  const [mode, setMode] = useState<'signin' | 'magic' | 'signup' | 'reset' | 'created'>(() => localStorage.getItem('nbg_pending_purchase') ? 'signup' : 'signin');
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const changeMode = (nextMode: 'signin' | 'magic' | 'signup' | 'reset') => {
    setMode(nextMode);
    setStep(1);
    setNotice('');
    setError('');
  };

  const continueWithGoogle = async () => {
    if (mode === 'signup' && !acceptedTerms) {
      setError('Please accept the NBG Privacy Notice and Terms of Engagement to continue.');
      return;
    }
    setLoading(true);
    setError('');
    const { error: oauthError } = await signInWithGoogle();
    if (oauthError) {
      setLoading(false);
      setError(oauthError.message || 'Google sign-in is temporarily unavailable. Please use email instead.');
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (mode === 'signup' && step === 1) {
      setStep(2);
      return;
    }

    setLoading(true);
    const trimmedEmail = email.trim();

    if (mode === 'signup') {
      if (!acceptedTerms) {
        setLoading(false);
        setError('Please accept the NBG privacy notice and terms to continue.');
        return;
      }
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

      const result = await signUp(trimmedEmail, password, 'client', { full_name: fullName.trim(), phone: phone.trim() });
      setLoading(false);

      if (result.error) {
        setError(result.error.message || 'We could not create your account.');
        return;
      }

      setMode('created');
      setNotice(localStorage.getItem('nbg_pending_purchase') ? `Confirm your email at ${trimmedEmail}. Your selected home will be waiting in the purchase workspace.` : `Check ${trimmedEmail} to confirm your email and finish creating your account.`);
      setPassword('');
      setConfirmPassword('');
      return;
    }

    const result = mode === 'magic' ? await sendMagicLink(trimmedEmail) : mode === 'reset' ? await sendPasswordReset(trimmedEmail) : await signInWithPassword(trimmedEmail, password);

    setLoading(false);

    if (result.error) {
      setError('We could not complete that request. Check your details and try again.');
      return;
    }

    setNotice(mode === 'signin' ? 'Signed in. Loading your portal...' : mode === 'reset' ? 'Password reset instructions are on their way.' : 'Check your inbox for your secure sign-in link.');
  };

  return (
    <main className="client-auth-page">
      <div className="client-auth-shell">
        <section className="client-auth-visual" aria-label="Next Bridge Group client portal">
          <div className="client-auth-brand"><img className="client-auth-logo" src="/NBG_LOGO-removebg-preview.png" alt="" /><span><strong>NBG</strong><small>A home. An investment. A legacy.</small></span></div>
          <div className="client-auth-visual-copy"><p className="eyebrow">Welcome to NBG</p><h1>{mode === 'signup' ? <>Your next chapter<br />starts here.</> : <>Luxury homes.<br />Lasting value.</>}</h1><p>Access your project, track progress, make payments and stay connected with your NBG team, all in one place.</p></div>
          <div className="client-auth-benefits"><p><Check size={15} /> Track your project progress</p><p><Check size={15} /> Make secure payments</p><p><Check size={15} /> Access your documents</p></div>
          <p className="client-auth-tagline">A home. An investment. A legacy.</p>
        </section>

        <section className="client-auth-panel">
          {mode === 'created' ? <div className="client-auth-success"><span className="client-auth-success-icon"><Check size={28} /></span><p className="eyebrow">Account created</p><h2>One last step.</h2><p>{notice}</p><button type="button" onClick={() => changeMode('signin')} className="client-auth-primary">Continue to sign in <ArrowRight size={16} /></button></div> : <>
            <div className="client-auth-heading"><p className="eyebrow">{mode === 'signup' ? 'Join NBG' : mode === 'reset' ? 'Account recovery' : 'Welcome back'}</p><h2>{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : mode === 'magic' ? 'Sign in with a link' : <>Sign in to your<br />NBG account</>}</h2><p>{mode === 'signup' ? 'Join NBG and take the next step towards your dream home.' : mode === 'reset' ? 'We’ll email you a secure password reset link.' : 'Access your projects, payments and documents in a few clicks.'}</p></div>

            {mode === 'signup' && <div className="client-auth-steps" aria-label={`Registration step ${step} of 2`}><span className={step >= 1 ? 'is-active' : ''}>1 <small>Your details</small></span><i /><span className={step >= 2 ? 'is-active' : ''}>2 <small>Secure account</small></span></div>}

            <form onSubmit={submit} className="client-auth-form">
              {mode === 'signup' && step === 1 && <>
                <label className="client-auth-field"><UserRound size={15} /><span className="sr-only">Full name</span><input value={fullName} onChange={(event) => setFullName(event.target.value)} autoComplete="name" required placeholder="Full name" /></label>
                <label className="client-auth-field"><Mail size={15} /><span className="sr-only">Email address</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" /></label>
                <label className="client-auth-field"><Phone size={15} /><span className="sr-only">Phone number</span><input value={phone} onChange={(event) => setPhone(event.target.value)} type="tel" autoComplete="tel" required placeholder="Phone number" /></label>
              </>}

              {(mode === 'signin' || mode === 'magic' || mode === 'reset' || (mode === 'signup' && step === 2)) && <label className="client-auth-field"><Mail size={15} /><span className="sr-only">Email address</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required placeholder="Email address" /></label>}

              {mode === 'signin' && <label className="client-auth-field"><LockKeyhole size={15} /><span className="sr-only">Password</span><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="current-password" required placeholder="Password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></label>}
              {mode === 'signup' && step === 2 && <>
                <label className="client-auth-field"><LockKeyhole size={15} /><span className="sr-only">Create password</span><input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} placeholder="Create a strong password" /><button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={15} /> : <Eye size={15} />}</button></label>
                <label className="client-auth-field"><LockKeyhole size={15} /><span className="sr-only">Confirm password</span><input value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type={showPassword ? 'text' : 'password'} autoComplete="new-password" required minLength={8} placeholder="Confirm password" /></label>
                <label className="client-auth-terms"><input checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} type="checkbox" required /><span>I agree to the NBG <a href="/privacy">Privacy Notice</a> and <a href="/terms">Terms of Engagement</a>.</span></label>
              </>}

              {mode === 'signup' && step === 1 && <label className="client-auth-terms"><input checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} type="checkbox" /><span>I agree to the NBG <a href="/privacy">Privacy Notice</a> and <a href="/terms">Terms of Engagement</a>.</span></label>}
              {mode === 'signin' && <button type="button" className="client-auth-forgot" onClick={() => changeMode('reset')}>Forgot password?</button>}
              {notice && <p role="status" className="client-auth-notice">{notice}</p>}
              {error && <p role="alert" className="client-auth-error">{error}</p>}

              <div className="client-auth-actions">
                {mode === 'signup' && step === 2 && <button type="button" onClick={() => { setStep(1); setError(''); }} className="client-auth-back"><ChevronLeft size={16} /> Back</button>}
                <button disabled={loading} className="client-auth-primary disabled:opacity-60">{loading ? 'Please wait...' : mode === 'signup' ? step === 1 ? 'Continue' : 'Create account' : mode === 'signin' ? 'Sign in' : mode === 'magic' ? 'Email me a sign-in link' : 'Send reset link'} <ArrowRight size={16} /></button>
              </div>
            </form>

            {mode !== 'reset' && !(mode === 'signup' && step === 2) && <><div className="client-auth-divider"><span>Or continue with</span></div><button type="button" disabled={loading} onClick={() => void continueWithGoogle()} className="client-auth-google"><span aria-hidden="true">G</span> Continue with Google</button></>}
            <div className="client-auth-switch">{mode === 'signup' ? <>Already have an account? <button type="button" onClick={() => changeMode('signin')}>Sign in</button></> : mode === 'reset' ? <>Remembered your password? <button type="button" onClick={() => changeMode('signin')}>Sign in</button></> : <>Don’t have an account? <button type="button" onClick={() => changeMode('signup')}>Create one</button></>}</div>
            {mode === 'signin' && <button type="button" className="client-auth-magic" onClick={() => changeMode('magic')}>Email me a sign-in link instead</button>}
          </>}
        </section>
      </div>
    </main>
  );
}

function PasswordSetup({ onDone }: { onDone: () => void }) { const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const submit = async (event: FormEvent) => { event.preventDefault(); if (password.length < 8 || password !== confirm) { setError('Passwords must match and contain at least 8 characters.'); return; } const { error: updateError } = await updatePassword(password); if (updateError) { setError('We could not save your password. Please request another reset link.'); return; } onDone(); }; return <div className="mb-8 border border-[#a9d9d8] bg-[#d9f6f3] p-6"><div className="flex items-center gap-3 text-[#087f88]"><LockKeyhole size={20} /><p className="eyebrow">Create your portal password</p></div><form onSubmit={submit} className="mt-5 grid gap-4 sm:grid-cols-2"><input value={password} onChange={(event) => setPassword(event.target.value)} type="password" minLength={8} required className="admin-input" placeholder="New password" /><input value={confirm} onChange={(event) => setConfirm(event.target.value)} type="password" minLength={8} required className="admin-input" placeholder="Confirm password" />{error && <p className="text-sm text-[#a55445] sm:col-span-2">{error}</p>}<button className="btn-primary sm:col-span-2">Save password <Check size={16} /></button></form></div>; }

function InvestmentCalculator() {
  const [price, setPrice] = useState('');
  const [deposit, setDeposit] = useState('20');
  const [months, setMonths] = useState('24');
  const total = parseMoney(price);
  const depositValue = total * (Number(deposit) || 0) / 100;
  const balance = Math.max(0, total - depositValue);
  const monthly = balance / Math.max(1, Number(months) || 1);
  return <section className="portal-panel"><div className="flex items-center gap-3"><Calculator className="text-[#087f88]" size={20} /><div><p className="eyebrow text-[#087f88]">Planning tool</p><h3 className="mt-2 font-serif text-3xl text-[#123b4b]">Model a payment plan.</h3></div></div><div className="mt-6 grid gap-4 sm:grid-cols-3"><CurrencyInput value={price} onChange={setPrice} className="admin-input" placeholder="Property price (KSh)" /><input value={deposit} onChange={(event) => setDeposit(event.target.value)} type="number" min="0" max="100" className="admin-input" placeholder="Deposit %" /><input value={months} onChange={(event) => setMonths(event.target.value)} type="number" min="1" className="admin-input" placeholder="Months" /></div><div className="mt-6 grid gap-3 sm:grid-cols-3"><div><p className="eyebrow text-slate-500">Deposit</p><p className="mt-2 text-xl text-[#123b4b]">{formatKes(depositValue)}</p></div><div><p className="eyebrow text-slate-500">Balance</p><p className="mt-2 text-xl text-[#123b4b]">{formatKes(balance)}</p></div><div><p className="eyebrow text-slate-500">Est. monthly</p><p className="mt-2 text-xl font-semibold text-[#087f88]">{formatKes(monthly)}</p></div></div><p className="mt-5 text-xs text-slate-500">Planning estimate only. Final terms are confirmed by the NBG team.</p></section>;
}

function ClientPortal({ user, onSignOut, navigate }: { user: AdminUser; onSignOut: () => void; navigate: (view: View) => void }) {
  const [section, setSection] = useState<PortalSection>('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [updates, setUpdates] = useState<ConstructionUpdate[]>([]);
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [realtor, setRealtor] = useState<Realtor | null>(null);
  const [stages, setStages] = useState<ReservationStage[]>([]);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [projectDocuments, setProjectDocuments] = useState<ProjectInvestmentDocument[]>([]);
  const [payments, setPayments] = useState<ClientPayment[]>([]);
  const [purchasePaymentInstructions, setPurchasePaymentInstructions] = useState<PurchasePaymentInstructions | null>(null);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [notifications, setNotifications] = useState<ClientNotification[]>([]);
  const [purchaseReceipt, setPurchaseReceipt] = useState<PurchaseRequestReceipt | null>(null);
  const [portalError, setPortalError] = useState('');
  const [homeSearch, setHomeSearch] = useState('');
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInvestment, setShowInvestment] = useState(false);
  const [pendingPurchaseUnitId, setPendingPurchaseUnitId] = useState(() => localStorage.getItem('nbg_pending_purchase') || '');
  const [projectId, setProjectId] = useState('');
  const [amount, setAmount] = useState('');
  const [plan, setPlan] = useState('Coastal starter');
  const recovery = window.location.search.includes('reset=1') || window.location.hash.includes('type=recovery');

  const load = useCallback(async () => {
    setPortalError('');
    const [projectResult, updateResult, unitResult, investmentResult, realtorResult, profileResult] = await Promise.all([
      supabase.from('projects').select('*').eq('is_published', true).order('created_at', { ascending: false }),
      supabase.from('construction_updates').select('*').order('posted_at', { ascending: false }).limit(8),
      supabase.from('project_units').select('*').eq('is_published', true).order('unit_number'),
      supabase.from('investments').select('*').eq('investor_user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('realtors').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('profiles').select('id, full_name, phone, preferred_location, investment_budget, notes, identity_document_type, identity_document_number, residential_address').eq('id', user.id).maybeSingle(),
    ]);

    const [stageResult, documentResult, projectDocumentResult, paymentResult, ticketResult, notificationResult, instructionsResult] = await Promise.all([
      supabase.from('client_reservation_stages').select('*').eq('user_id', user.id).order('created_at'),
      supabase.from('client_documents').select('*').or(`user_id.eq.${user.id},is_global.eq.true`).order('created_at', { ascending: false }),
      supabase.from('project_investment_documents').select('id,project_id,title,category,storage_path,created_at,is_public,document_ref,verification_code,content_hash').eq('is_published', true).order('created_at', { ascending: false }),
      supabase.from('client_payment_schedule').select('*').eq('user_id', user.id).order('due_date'),
      supabase.from('client_support_tickets').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('client_notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('purchase_payment_instructions').select('bank_name,bank_branch,account_name,account_number,swift_code,payment_instructions,is_published').eq('singleton', true).eq('is_published', true).maybeSingle(),
    ]);

    if ([projectResult, updateResult, unitResult, investmentResult, realtorResult, profileResult, stageResult, documentResult, projectDocumentResult, paymentResult, ticketResult, notificationResult, instructionsResult].some((result) => result.error)) {
      setPortalError('Some workspace data could not be loaded. You can still browse the available sections and retry.');
    }

    setProjects((projectResult.data ?? []) as Project[]);
    setUpdates((updateResult.data ?? []) as ConstructionUpdate[]);
    setUnits((unitResult.data ?? []) as ProjectUnit[]);
    setInvestments((investmentResult.data ?? []) as Investment[]);
    setRealtor((realtorResult.data ?? null) as Realtor | null);
    setProfile((profileResult.data ?? null) as ClientProfile | null);
    setStages((stageResult.data ?? []) as ReservationStage[]);
    setDocuments((documentResult.data ?? []) as ClientDocument[]);
    setProjectDocuments((projectDocumentResult.data ?? []) as ProjectInvestmentDocument[]);
    setPayments((paymentResult.data ?? []) as ClientPayment[]);
    setTickets((ticketResult.data ?? []) as SupportTicket[]);
    setNotifications((notificationResult.data ?? []) as ClientNotification[]);
    setPurchasePaymentInstructions((instructionsResult.data ?? null) as PurchasePaymentInstructions | null);
    setLoading(false);
  }, [user.id]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel(`client-payment-schedule-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'client_payment_schedule',
        filter: `user_id=eq.${user.id}`,
      }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, user.id]);

  useEffect(() => {
    if (!pendingPurchaseUnitId || loading) return;
    const pendingUnit = units.find((unit) => unit.id === pendingPurchaseUnitId);
    if (pendingUnit?.status === 'AVAILABLE') {
      setSection('availability');
      return;
    }
    localStorage.removeItem('nbg_pending_purchase');
    setPendingPurchaseUnitId('');
    if (pendingUnit) setPortalError(`Unit ${pendingUnit.unit_number} is no longer available. Choose another home below.`);
  }, [pendingPurchaseUnitId, units, loading]);

  const selectSection = (next: PortalSection) => { setSection(next); setSidebarOpen(false); };

  const submitInvestment = async (event: FormEvent) => {
    event.preventDefault();
    const { data, error } = await supabase.from('investments').insert({ investor_user_id: user.id, investor_name: user.email.split('@')[0], investor_email: user.email, project_id: projectId || null, amount_interested: parseMoney(amount) || null, currency: 'KES', status: 'INQUIRY', notes: `Plan: ${plan}` }).select('tracking_code').single();
    if (error || !data?.tracking_code) { setPortalError(error?.message || 'The enquiry was saved but its tracking code could not be loaded.'); return; }
    setShowInvestment(false);
    setAmount('');
    window.location.assign(`/verify/${encodeURIComponent(data.tracking_code)}`);
  };

  const saveProfile = async (values: Omit<ClientProfile, 'id'>) => {
    const details = {
      full_name: values.full_name || null,
      phone: values.phone || null,
      preferred_location: values.preferred_location || null,
      investment_budget: values.investment_budget || null,
      notes: values.notes || null,
      identity_document_type: values.identity_document_type || null,
      identity_document_number: values.identity_document_number || null,
      residential_address: values.residential_address || null,
      updated_at: new Date().toISOString(),
    };

    const profileFields = 'id, full_name, phone, preferred_location, investment_budget, notes, identity_document_type, identity_document_number, residential_address';
    const { data: updated, error: updateError } = await supabase.from('profiles').update(details).eq('id', user.id).select(profileFields).maybeSingle();
    if (updateError) throw new Error(updateError.message || 'Profile could not be saved.');
    if (updated) {
      setProfile(updated as ClientProfile);
      return;
    }

    const { data: inserted, error: insertError } = await supabase.from('profiles').insert({ id: user.id, ...details }).select(profileFields).single();
    if (insertError || !inserted) throw new Error(insertError?.message || 'Profile could not be saved.');
    setProfile(inserted as ClientProfile);
  };

  const sidebarItems: { id: PortalSection; label: string; icon: typeof Home; group: string }[] = [{ id: 'overview', label: 'Overview', icon: Home, group: 'Workspace' }, { id: 'progress', label: 'Project progress', icon: BarChart3, group: 'Workspace' }, { id: 'payments', label: 'Payments', icon: Receipt, group: 'Workspace' }, { id: 'investments', label: 'Investment studio', icon: Calculator, group: 'Plan' }, { id: 'availability', label: 'Available homes', icon: Building2, group: 'Plan' }, { id: 'resources', label: 'Documents & support', icon: FileText, group: 'Connect' }, { id: 'profile', label: 'Profile & security', icon: Settings, group: 'Connect' }];
  const active = sidebarItems.find((item) => item.id === section) ?? sidebarItems[0];
  const mobileNavItems: { id: PortalSection; label: string; icon: typeof Home }[] = [{ id: 'overview', label: 'Home', icon: Home }, { id: 'progress', label: 'Project', icon: Building2 }, { id: 'payments', label: 'Payments', icon: Receipt }, { id: 'resources', label: 'Docs', icon: FileText }, { id: 'availability', label: 'More', icon: Menu }];

  const content = section === 'overview' ? <OverviewContent user={user} profile={profile} projects={projects} updates={updates} units={units} investments={investments} stages={stages} payments={payments} notifications={notifications} documents={documents} setSection={selectSection} /> : section === 'progress' ? <ProgressContent updates={updates} /> : section === 'payments' ? <ClientPaymentsView user={user} payments={payments} purchaseReceipt={purchaseReceipt} paymentInstructions={purchasePaymentInstructions} onDismissPurchase={() => setPurchaseReceipt(null)} /> : section === 'investments' ? <InvestmentContent projects={projects} investments={investments} showInvestment={showInvestment} setShowInvestment={setShowInvestment} projectId={projectId} setProjectId={setProjectId} amount={amount} setAmount={setAmount} plan={plan} setPlan={setPlan} submitInvestment={submitInvestment} realtor={realtor} setRealtor={setRealtor} user={user} /> : section === 'availability' ? <AvailabilityContent units={units} projects={projects} pendingUnitId={pendingPurchaseUnitId} search={homeSearch} onSearchChange={setHomeSearch} onPurchaseComplete={async (receipt) => { localStorage.removeItem('nbg_pending_purchase'); setPendingPurchaseUnitId(''); setPurchaseReceipt(receipt); setSection('payments'); await load(); }} /> : section === 'resources' ? <ResourcesContent navigate={navigate} documents={documents} projectDocuments={projectDocuments} projects={projects} tickets={tickets} setTickets={setTickets} user={user} /> : <ProfileContent user={user} recovery={recovery} profile={profile} onSaveProfile={saveProfile} onSignOut={onSignOut} />;

  return <div className="portal-shell"><aside className={`portal-sidebar ${sidebarOpen ? 'portal-sidebar-open' : ''}`}><div className="portal-brand"><span className="brand-mark brand-mark-inverse"><img src="/NBG_LOGO-removebg-preview.png" alt="Next Bridge Group" /></span><div><p className="text-[10px] font-bold tracking-[.2em]">NBG CLIENT</p><p className="text-[8px] tracking-[.16em] text-white/45">PRIVATE WORKSPACE</p></div><button onClick={() => setSidebarOpen(false)} className="portal-close md:hidden" aria-label="Close portal menu"><X size={18} /></button></div><nav className="portal-nav">{['Workspace', 'Plan', 'Connect'].map((group) => <div key={group} className="portal-nav-group"><p>{group}</p>{sidebarItems.filter((item) => item.group === group).map(({ id, label, icon: Icon }) => <button key={id} onClick={() => selectSection(id)} className={section === id ? 'portal-nav-active' : ''}><Icon size={16} /><span>{label}</span>{section === id && <ArrowRight size={13} className="ml-auto" />}</button>)}</div>)}</nav><button onClick={onSignOut} className="portal-signout">Sign out</button></aside><div className="client-mobile-header md:hidden"><button type="button" onClick={() => setSidebarOpen(true)} aria-label="Open portal menu"><Menu size={19} /></button><div className="client-mobile-brand"><img src="/NBG_LOGO-removebg-preview.png" alt="" /><span>NBG</span></div><DashboardInbox user={user} mode="client" /></div><div className="portal-main"><header className={`portal-topbar ${section === 'availability' ? 'portal-topbar-homes' : ''}`}>{section === 'availability' ? <label className="homes-search homes-header-search"><Search size={15} /><input aria-label="Search homes, locations, or projects" value={homeSearch} onChange={(event) => setHomeSearch(event.target.value)} placeholder="Search for a home, location or project..." /></label> : <div><p className="eyebrow text-[#8de7e2]">{active.group}</p><h1>{active.label}</h1></div>}<div className="flex items-center gap-3"><DashboardInbox user={user} mode="client" /><div className="hidden items-center gap-3 sm:flex"><span className="portal-user-dot" /> <span className="text-xs text-slate-500">{user.full_name || user.email.split('@')[0]}</span><button onClick={() => navigate('contact')} className="btn-primary !px-4 !py-3">Speak with the team</button></div></div></header><main className={`portal-content ${section === 'availability' ? 'portal-content-homes' : ''}`}>{portalError && <div className="mb-6 flex items-start justify-between gap-4 border border-[#e4b8ad] bg-[#fff7f4] p-4 text-sm text-[#7a4e2e]"><span className="flex items-center gap-2"><AlertCircle size={17} />{portalError}</span><button onClick={() => void load()} className="font-semibold underline">Retry</button></div>}{recovery && <PasswordSetup onDone={() => window.history.replaceState({}, '', '/portal')} />}{loading ? <div className="portal-loading"><span /> Loading your private workspace...</div> : <div className="portal-reveal">{content}</div>}</main></div><nav className="client-mobile-nav md:hidden" aria-label="Client portal navigation">{mobileNavItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => selectSection(id)} aria-current={section === id ? 'page' : undefined} className={section === id ? 'is-active' : ''}><Icon size={18} /><span>{label}</span></button>)}</nav></div>;
}

function OverviewContent({ user, profile, projects, updates, units, investments, stages, payments, notifications, documents, setSection }: { user: AdminUser; profile: { id: string; full_name: string; phone: string; preferred_location: string; investment_budget: string; notes: string } | null; projects: Project[]; updates: ConstructionUpdate[]; units: ProjectUnit[]; investments: Investment[]; stages: ReservationStage[]; payments: ClientPayment[]; notifications: ClientNotification[]; documents: ClientDocument[]; setSection: (section: PortalSection) => void }) {
  const selectedStage = stages[stages.length - 1];
  const selectedProject = projects.find((project) => project.id === selectedStage?.project_id);
  const selectedUnit = units.find((unit) => unit.id === selectedStage?.unit_id);
  const displayName = profile?.full_name || user.full_name || user.email.split('@')[0];
  const unitPayments = selectedUnit ? payments.filter((payment) => payment.unit_id === selectedUnit.id) : payments;
  const unitValue = unitPayments.reduce((sum, payment) => sum + Number(payment.amount), 0) || (selectedUnit ? parseMoney(selectedUnit.price ?? '') : 0);
  const unitPaid = unitPayments.reduce((sum, payment) => sum + Number(payment.paid_amount), 0);
  const unitOutstanding = Math.max(0, unitValue - unitPaid);
  const investmentProgress = unitValue ? Math.min(100, Math.round(unitPaid / unitValue * 100)) : 0;
  const nextPayment = unitPayments.find((payment) => payment.status !== 'PAID' && Number(payment.amount) > Number(payment.paid_amount));
  const projectUpdates = selectedProject ? updates.filter((update) => update.project_id === selectedProject.id) : updates;
  const latestUpdate = projectUpdates[0];
  const journeyStages = ['ENQUIRY', 'VIEWING', 'RESERVATION', 'DEPOSIT', 'AGREEMENT', 'HANDOVER'];
  const currentStageIndex = Math.max(0, journeyStages.indexOf(selectedStage?.stage ?? 'ENQUIRY'));
  const activity = [
    ...notifications.map((item) => ({ id: item.id, title: item.title, detail: item.body, created_at: item.created_at, kind: item.kind })),
    ...projectUpdates.map((item) => ({ id: item.id, title: item.title, detail: item.body || 'Construction progress update', created_at: item.posted_at, kind: 'PROJECT_UPDATE' })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4);
  const mapLatitude = selectedProject?.latitude ?? -4.0435;
  const mapLongitude = selectedProject?.longitude ?? 39.6682;
  const mapSpan = 0.045;
  const mapParams = new URLSearchParams({ bbox: `${mapLongitude - mapSpan},${mapLatitude - mapSpan},${mapLongitude + mapSpan},${mapLatitude + mapSpan}`, layer: 'mapnik', marker: `${mapLatitude},${mapLongitude}` });
  const mapPreviewUrl = `https://www.openstreetmap.org/export/embed.html?${mapParams.toString()}`;
  const propertyImage = selectedUnit?.image_url || selectedProject?.image_url;
  return <section className="client-dashboard">
    <div className="client-dashboard-primary">
      <div className="client-mobile-greeting"><strong>Good morning, {displayName}</strong><p>Your NBG investment, at your fingertips.</p></div>
      <section className="client-property-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(6,47,65,.88), rgba(6,47,65,.48) 48%, rgba(6,47,65,.04)), url("${propertyImage || '/NBG HERO.png'}")` }}>
        <div className="client-property-copy"><p className="client-dashboard-eyebrow">Your home</p><h2>{selectedProject?.name || 'Your NBG journey'}</h2><p className="client-property-unit">{selectedUnit ? `Unit ${selectedUnit.unit_number}` : `Welcome back, ${displayName}`}</p><span className="client-unit-status"><span />{selectedUnit?.status === 'SOLD' ? 'Owned' : selectedUnit?.status === 'RESERVED' ? 'Reserved' : 'Client workspace'}</span><p className="client-property-location"><MapPin size={13} />{selectedProject?.locality || selectedProject?.location || 'Nyali, Mombasa, Kenya'}</p><button type="button" onClick={() => setSection('availability')} className="client-hero-button">View property <ArrowRight size={14} /></button></div>
      </section>

      <div className="client-dashboard-kpis">
        <article className="client-kpi"><span className="client-kpi-icon"><Building2 size={18} /></span><div><p>Property</p><strong>{selectedUnit?.type || 'Residence'}</strong><small>{selectedUnit?.unit_number ? `Unit ${selectedUnit.unit_number}` : 'Select a home'}</small></div></article>
        <article className="client-kpi"><span className="client-kpi-icon client-kpi-progress"><span>{latestUpdate?.progress_pct ?? 0}%</span></span><div><p>Progress</p><strong>{latestUpdate?.title || 'Construction'}</strong><small>{latestUpdate ? `${latestUpdate.progress_pct}% overall completion` : 'Updates appear here'}</small></div></article>
        <button type="button" onClick={() => setSection('payments')} className="client-kpi client-kpi-action"><span className="client-kpi-icon"><CalendarDays size={18} /></span><div><p>Next payment</p><strong>{nextPayment?.description || 'No payment due'}</strong><small>{nextPayment ? `Due ${new Date(`${nextPayment.due_date}T00:00:00`).toLocaleDateString()}` : 'View your payment plan'}</small></div><ArrowRight className="client-kpi-arrow" size={15} /></button>
      </div>

      <section className="client-investment-panel"><div className="client-panel-heading"><div><p className="client-dashboard-eyebrow">Your investment</p><h3>{selectedProject?.name || 'Portfolio overview'}{selectedUnit && <span> · Unit {selectedUnit.unit_number}</span>}</h3></div><button type="button" onClick={() => setSection('payments')} className="client-text-link">View payment plan <ArrowRight size={13} /></button></div><div className="client-investment-stats"><div><span>Purchase value</span><strong>{unitValue ? formatKes(unitValue) : 'To be confirmed'}</strong></div><div><span>Paid so far</span><strong>{formatKes(unitPaid)}</strong></div><div><span>Outstanding</span><strong>{formatKes(unitOutstanding)}</strong></div></div><div className="client-progress-track"><span style={{ width: `${investmentProgress}%` }} /></div><p className="client-progress-caption">{investmentProgress}% paid{payments.length > unitPayments.length ? ` · Showing Unit ${selectedUnit?.unit_number || 'portfolio'} only` : ''}</p></section>

      <section className="client-journey-panel"><div className="client-panel-heading"><div><p className="client-dashboard-eyebrow">Your journey to handover</p><h3>Every step, clearly.</h3></div><button type="button" onClick={() => setSection('progress')} className="client-text-link">Project progress <ArrowRight size={13} /></button></div><div className="client-journey-track">{journeyStages.map((stage, index) => { const done = index < currentStageIndex; const current = index === currentStageIndex; return <div key={stage} className={`client-journey-step ${done ? 'is-done' : ''} ${current ? 'is-current' : ''}`}><span className="client-journey-marker">{done ? <Check size={12} /> : current ? <CircleCheck size={13} /> : index + 1}</span><strong>{stage[0] + stage.slice(1).toLowerCase()}</strong><small>{done ? 'Completed' : current ? 'Current' : 'Upcoming'}</small></div>; })}</div></section>

      <div className="client-dashboard-lower"><section className="client-feed-panel"><div className="client-panel-heading"><div><p className="client-dashboard-eyebrow">Recent activity</p><h3>Your latest updates</h3></div><button type="button" onClick={() => setSection('progress')} className="client-text-link">View all <ArrowRight size={13} /></button></div><div className="client-feed-list">{activity.map((item) => <article key={`${item.kind}-${item.id}`}><span className="client-feed-dot" /><div><time>{new Date(item.created_at).toLocaleDateString()}</time><strong>{item.title}</strong><p>{item.detail}</p></div></article>)}{activity.length === 0 && <p className="client-empty-note">Updates from NBG will appear here.</p>}</div></section><section className="client-feed-panel"><div className="client-panel-heading"><div><p className="client-dashboard-eyebrow">Documents</p><h3>Your NBG files</h3></div><button type="button" onClick={() => setSection('resources')} className="client-text-link">View all <ArrowRight size={13} /></button></div><div className="client-document-list">{documents.slice(0, 3).map((document) => <article key={document.id}><span><FileText size={15} /></span><div><strong>{document.title}</strong><small>{document.category.replace(/_/g, ' ')} · {new Date(document.created_at).toLocaleDateString()}</small></div><ArrowRight size={13} /></article>)}{documents.length === 0 && <p className="client-empty-note">Agreements, receipts, and project files shared with you will appear here.</p>}</div></section></div>
    </div>

    <aside className="client-dashboard-aside">
      <section className="client-next-payment"><div className="client-panel-heading"><div><p className="client-dashboard-eyebrow">Next payment</p><h3>{nextPayment?.description || 'No payment scheduled'}</h3></div><span className="client-kpi-icon"><CalendarDays size={17} /></span></div><p className="client-payment-amount">{nextPayment ? formatKes(Math.max(0, Number(nextPayment.amount) - Number(nextPayment.paid_amount))) : 'You’re up to date'}</p><p className="client-payment-due">{nextPayment ? `Due ${new Date(`${nextPayment.due_date}T00:00:00`).toLocaleDateString()}` : 'Your next scheduled payment will appear here.'}</p><div className="client-mini-progress"><span style={{ width: `${investmentProgress}%` }} /></div><button type="button" onClick={() => setSection('payments')} className="client-aside-primary">View payment schedule <ArrowRight size={14} /></button><button type="button" onClick={() => setSection('payments')} className="client-aside-secondary">Payment details <ArrowRight size={13} /></button></section>

      <section className="client-access-panel"><div className="client-panel-heading"><div><p className="client-dashboard-eyebrow">Quick access</p><h3>Your workspace</h3></div></div><div className="client-access-grid"><button type="button" onClick={() => setSection('payments')}><Receipt size={17} /><span>Payments</span></button><button type="button" onClick={() => setSection('resources')}><FileText size={17} /><span>Documents</span></button><button type="button" onClick={() => setSection('progress')}><BarChart3 size={17} /><span>Progress</span></button><button type="button" onClick={() => setSection('investments')}><Calculator size={17} /><span>Investments</span></button></div></section>

      <section className="client-map-panel"><div className="client-panel-heading"><div><p className="client-dashboard-eyebrow">Your NBG location</p><h3>{selectedProject?.name || 'Nyali, Mombasa'}</h3></div><MapPin size={16} /></div><iframe title={`${selectedProject?.name || 'NBG'} location map`} src={mapPreviewUrl} loading="lazy" /><p>{selectedProject?.locality || selectedProject?.location || 'Nyali · Mombasa'}</p><button type="button" onClick={() => setSection('availability')} className="client-text-link">View available homes <ArrowRight size={13} /></button></section>
    </aside>
  </section>;
}

function NotificationPanel({ notifications }: { notifications: ClientNotification[] }) { return <section className="portal-panel"><div className="flex items-center gap-3"><Bell size={19} className="text-[#087f88]" /><div><p className="eyebrow text-[#087f88]">Your notifications</p><h3 className="mt-1 font-serif text-2xl text-[#123b4b]">Updates worth knowing.</h3></div></div><div className="mt-5 grid gap-3 md:grid-cols-2">{notifications.slice(0, 4).map((notification) => { const kycRequest = notification.kind === 'KYC_UPDATE_REQUEST'; return <article key={notification.id} className={`border p-4 ${kycRequest ? 'border-[#d58a7d] bg-[#fff2ee]' : notification.read_at ? 'border-[#e2eeec]' : 'border-[#a9d9d8] bg-[#eefbf9]'}`}><p className={`text-sm font-semibold ${kycRequest ? 'text-[#8d332b]' : 'text-[#123b4b]'}`}>{kycRequest && <AlertCircle size={14} className="mr-1 inline" />}{notification.title}</p><p className="mt-1 text-xs leading-5 text-slate-600">{notification.body}</p>{kycRequest && <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('nbg-client-profile-request'))} className="mt-3 inline-flex items-center gap-2 bg-[#a55445] px-3 py-2 text-xs font-semibold text-white hover:bg-[#873c31]">Update KYC details <ArrowRight size={13} /></button>}<p className="mt-3 text-[10px] uppercase tracking-[.1em] text-slate-400">{new Date(notification.created_at).toLocaleDateString()}</p></article>; })}{notifications.length === 0 && <p className="text-sm text-slate-500">New construction updates and payment reminders will appear here.</p>}</div></section>; }

const RESERVATION_STAGES = ['ENQUIRY', 'VIEWING', 'RESERVATION', 'DEPOSIT', 'AGREEMENT', 'HANDOVER'];
function ReservationTimeline({ stages }: { stages: ReservationStage[] }) { const completed = new Set(stages.map((stage) => stage.stage)); return <section className="portal-panel"><div className="flex items-center justify-between"><div><p className="eyebrow text-[#087f88]">Your reservation journey</p><h3 className="mt-2 font-serif text-3xl text-[#123b4b]">A clear path to handover.</h3></div><CircleCheck className="text-[#087f88]" /></div><div className="mt-7 grid gap-3 sm:grid-cols-3">{RESERVATION_STAGES.map((stage, index) => <div key={stage} className={`border p-4 ${completed.has(stage) ? 'border-[#8dd6cd] bg-[#eefbf9]' : 'border-[#e3e0d8] bg-[#fffdf8]'}`}><div className="flex items-center justify-between"><span className="text-xs text-[#087f88]">0{index + 1}</span>{completed.has(stage) ? <Check size={15} className="text-[#2e6b3e" /> : <Clock3 size={15} className="text-slate-300" />}</div><p className="mt-5 text-[10px] font-semibold uppercase tracking-[.12em] text-[#315a62]">{stage.replace('_', ' ')}</p></div>)}</div></section>; }

function PortalStat({ label, value, detail }: { label: string; value: number; detail: string }) { const [expanded, setExpanded] = useState(false); return <button type="button" onClick={() => setExpanded((current) => !current)} className="portal-stat portal-stat-button"><div className="flex items-start justify-between gap-3"><p className="eyebrow text-[#087f88]">{label}</p><ArrowRight size={16} className={`portal-stat-arrow ${expanded ? 'rotate-90' : ''}`} /></div><p className="portal-stat-value">{value.toLocaleString()}</p><p className="mt-3 text-xs text-slate-500">{expanded ? `Open ${label.toLowerCase()} in the navigation for the full view.` : detail}</p></button>; }
function ProgressContent({ updates }: { updates: ConstructionUpdate[] }) { return <section><div className="portal-section-heading"><div><p className="eyebrow text-[#087f88]">Verified feed</p><h2>Progress you can<br /><em>see and trust.</em></h2></div><span className="portal-live-badge">Live updates</span></div><div className="portal-timeline">{updates.map((update) => <article key={update.id}>{update.image_url ? <img src={update.image_url} alt={update.title} className="mb-4 h-40 w-full object-cover" /> : null}<span className="portal-timeline-dot">{update.progress_pct}%</span><div><p className="eyebrow text-slate-500">{new Date(update.posted_at).toLocaleDateString()}</p><h3>{update.title}</h3>{update.body && <p>{update.body}</p>}</div></article>)}{updates.length === 0 && <p className="text-sm text-slate-500">The NBG team has not published a construction update yet.</p>}</div></section>; }
function AvailabilityContent({ units, projects, pendingUnitId, search, onSearchChange, onPurchaseComplete }: { units: ProjectUnit[]; projects: Project[]; pendingUnitId: string; search: string; onSearchChange: (value: string) => void; onPurchaseComplete: (receipt: PurchaseRequestReceipt) => Promise<void> }) {
  const [selectedUnit, setSelectedUnit] = useState<ProjectUnit | null>(null);
  const [locationFilter, setLocationFilter] = useState('All locations');
  const [projectFilter, setProjectFilter] = useState('All Projects');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [bedroomFilter, setBedroomFilter] = useState('Any bedrooms');
  const [priceFilter, setPriceFilter] = useState('Any price');
  const [sortOrder, setSortOrder] = useState('Featured');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const pendingUnit = units.find((unit) => unit.id === pendingUnitId && unit.status === 'AVAILABLE');
    if (pendingUnit) setSelectedUnit(pendingUnit);
  }, [units, pendingUnitId]);
  const availableUnits = units.filter((unit) => unit.status === 'AVAILABLE');
  const locations = [...new Set(projects.map((project) => project.locality || project.location).filter((location): location is string => Boolean(location)))];
  const types = [...new Set(units.map((unit) => unit.type).filter((type): type is string => Boolean(type)))];
  const filteredUnits = units.filter((unit) => {
    const project = projects.find((item) => item.id === unit.project_id);
    const location = project?.locality || project?.location || '';
    const price = Number((unit.price ?? '').replace(/[^0-9.]/g, '')) || 0;
    const normalizedQuery = search.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || [unit.unit_number, unit.type, project?.name, location].some((value) => value?.toLowerCase().includes(normalizedQuery));
    const matchesPrice = priceFilter === 'Any price' || (priceFilter === 'Under KSh 10M' ? price > 0 && price < 10000000 : priceFilter === 'KSh 10M–20M' ? price >= 10000000 && price <= 20000000 : price > 20000000);
    return matchesQuery && (locationFilter === 'All locations' || location === locationFilter) && (projectFilter === 'All Projects' || project?.id === projectFilter) && (typeFilter === 'All types' || unit.type === typeFilter) && (bedroomFilter === 'Any bedrooms' || unit.bedrooms === Number(bedroomFilter)) && matchesPrice;
  }).sort((first, second) => {
    const firstPrice = Number((first.price ?? '').replace(/[^0-9.]/g, '')) || 0;
    const secondPrice = Number((second.price ?? '').replace(/[^0-9.]/g, '')) || 0;
    return sortOrder === 'Price: Low to high' ? (firstPrice || Infinity) - (secondPrice || Infinity) : sortOrder === 'Price: High to low' ? secondPrice - firstPrice : first.unit_number.localeCompare(second.unit_number);
  });
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filteredUnits.length / pageSize));
  const visibleUnits = filteredUnits.slice((page - 1) * pageSize, page * pageSize);
  const changeFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); };
  return <section>
    <div className="homes-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(242,250,249,.98) 0%, rgba(242,250,249,.9) 31%, rgba(242,250,249,.08) 69%), url("${projects[0]?.image_url || '/NBG HERO.png'}")` }}><div><p className="eyebrow text-[#087f88]">Explore</p><h2>Available Homes</h2><p>Discover our premium properties and find the perfect home<br className="hidden sm:block" /> or investment opportunity.</p></div></div>
    <div className="homes-toolbar"><label className="homes-search homes-mobile-search"><Search size={15} /><input aria-label="Search homes, locations, or projects" value={search} onChange={(event) => { onSearchChange(event.target.value); setPage(1); }} placeholder="Search for a home, location or project..." /></label><div className="homes-filter-row"><div className="homes-filters"><label className="homes-all-projects"><Grid2X2 size={14} /><span className="sr-only">Project</span><select value={projectFilter} onChange={(event) => changeFilter(setProjectFilter)(event.target.value)}><option>All Projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><ChevronDown size={13} /></label><label><span className="sr-only">Location</span><select value={locationFilter} onChange={(event) => changeFilter(setLocationFilter)(event.target.value)}><option>All locations</option>{locations.map((location) => <option key={location}>{location}</option>)}</select><ChevronDown size={13} /></label><label><span className="sr-only">Property type</span><select value={typeFilter} onChange={(event) => changeFilter(setTypeFilter)(event.target.value)}><option>All types</option>{types.map((type) => <option key={type}>{type}</option>)}</select><ChevronDown size={13} /></label><label><span className="sr-only">Bedrooms</span><select value={bedroomFilter} onChange={(event) => changeFilter(setBedroomFilter)(event.target.value)}><option>Any bedrooms</option>{[...new Set(units.map((unit) => unit.bedrooms).filter((bedrooms): bedrooms is number => bedrooms !== null))].sort((first, second) => first - second).map((bedrooms) => <option key={bedrooms} value={bedrooms}>{bedrooms} Bedrooms</option>)}</select><ChevronDown size={13} /></label><label><span className="sr-only">Price range</span><select value={priceFilter} onChange={(event) => changeFilter(setPriceFilter)(event.target.value)}><option>Any price</option><option>Under KSh 10M</option><option>KSh 10M–20M</option><option>Over KSh 20M</option></select><ChevronDown size={13} /></label></div><div className="homes-view-tools"><div className="homes-layout-toggle"><button type="button" onClick={() => setLayout('grid')} aria-label="Grid view" aria-pressed={layout === 'grid'}><Grid2X2 size={15} /></button><button type="button" onClick={() => setLayout('list')} aria-label="List view" aria-pressed={layout === 'list'}><List size={15} /></button></div><label className="homes-sort"><span>Sort by:</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option>Featured</option><option>Price: Low to high</option><option>Price: High to low</option></select><ChevronDown size={13} /></label></div></div></div>
    <div className={`homes-card-grid ${layout === 'list' ? 'homes-card-list' : ''}`}>{visibleUnits.map((unit) => { const project = projects.find((item) => item.id === unit.project_id); const location = project?.locality || project?.location || 'Location on request'; const isFavorite = favorites.includes(unit.id); const canPurchase = unit.status === 'AVAILABLE'; const statusLabel = unit.availability_note || (unit.status === 'SOLD' ? 'Sold Out' : unit.status === 'RESERVED' ? 'Reserved' : 'Available'); return <article key={unit.id} className="homes-card"><div className="homes-card-image"><img src={unit.image_url || project?.image_url || '/NBG HERO.png'} alt={`${project?.name || unit.type || 'Home'}, Unit ${unit.unit_number}`} /><span className={`homes-status homes-status-${unit.status.toLowerCase()}`}>{statusLabel}</span><button type="button" className={`homes-favorite ${isFavorite ? 'is-favorite' : ''}`} aria-label={isFavorite ? 'Remove from saved homes' : 'Save home'} aria-pressed={isFavorite} onClick={() => setFavorites((current) => isFavorite ? current.filter((id) => id !== unit.id) : [...current, unit.id])}><Heart size={17} fill={isFavorite ? 'currentColor' : 'none'} /></button></div><div className="homes-card-body"><p className="homes-location"><MapPin size={12} /> {location}</p><h3>{project?.name || unit.type || 'Residence'}</h3><div className="homes-card-price"><span>From <strong>{unit.price || 'Price on request'}</strong></span><span>{unit.type || 'Residence'}</span></div><div className="homes-card-details"><span><BedDouble size={13} /> {unit.bedrooms ?? '—'} Bedrooms</span><span><Ruler size={13} /> {unit.size || 'Size on request'}</span></div><p className="homes-unit-number">Unit {unit.unit_number}</p><button type="button" onClick={() => setSelectedUnit(unit)} disabled={!canPurchase} className="homes-details-button">{canPurchase ? <>View details <ArrowRight size={14} /></> : statusLabel}</button></div></article>; })}</div>
    {filteredUnits.length === 0 && <div className="homes-empty"><Search size={20} /><p>{units.length ? 'No homes match those filters.' : 'No published homes are available yet.'}</p><button type="button" onClick={() => { onSearchChange(''); setLocationFilter('All locations'); setProjectFilter('All Projects'); setTypeFilter('All types'); setBedroomFilter('Any bedrooms'); setPriceFilter('Any price'); setPage(1); }}>Clear filters</button></div>}
    <div className="homes-pagination"><span>Showing {filteredUnits.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredUnits.length)} of {filteredUnits.length} homes</span><div><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={14} /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button type="button" key={pageNumber} aria-label={`Page ${pageNumber}`} aria-current={page === pageNumber ? 'page' : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}<button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ChevronRight size={14} /></button></div></div>
    {projects.length > 0 && <LocationMap title="Your available homes, by locality" projects={projects.map((project) => ({ ...project, availableUnits: availableUnits.filter((unit) => unit.project_id === project.id).length }))} />}
    {selectedUnit && <PurchaseRequestModal unit={selectedUnit} onClose={() => setSelectedUnit(null)} onDone={async (receipt) => { setSelectedUnit(null); await onPurchaseComplete(receipt); }} />}
  </section>;
}

function PurchaseRequestModal({ unit, onClose, onDone }: { unit: ProjectUnit; onClose: () => void; onDone: (receipt: PurchaseRequestReceipt) => Promise<void> }) {
  const price = Number((unit.price ?? '').replace(/[^0-9.]/g, '')) || 0;
  const [deposit, setDeposit] = useState(price ? formatMoneyInput(String(Math.max(1, Math.round(price * 0.1)))) : '');
  const [paymentPlanType, setPaymentPlanType] = useState<'INSTALLMENTS' | 'FULL'>('INSTALLMENTS');
  const [installmentCount, setInstallmentCount] = useState('12');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const depositAmount = paymentPlanType === 'FULL' ? price : parseMoney(deposit);
    const count = paymentPlanType === 'FULL' ? 0 : Number(installmentCount);
    if (!price || depositAmount <= 0 || depositAmount > price || (paymentPlanType === 'INSTALLMENTS' && depositAmount >= price) || (depositAmount < price && count < 1)) {
      setError('Enter a valid payment amount and plan for the confirmed unit price.');
      return;
    }
    setSaving(true);
    setError('');
    const { data: saleId, error: requestError } = await supabase.rpc('create_client_purchase_request_with_mode', {
      p_unit_id: unit.id,
      p_deposit: depositAmount,
      p_installment_count: count,
      p_frequency: frequency,
      p_payment_mode: paymentPlanType,
    });
    setSaving(false);
    if (requestError) { setError(requestError.message || 'We could not submit this request. Refresh availability and try again.'); return; }
    if (!saleId) { setError('The request was saved, but its purchase reference could not be loaded. Contact the NBG team before making payment.'); return; }
    await onDone({ sale_id: saleId, unit, payment_mode: paymentPlanType, total_amount: price, initial_amount: depositAmount, installment_count: count, frequency, payment_reference: `NBG-PURCHASE-${String(saleId).replace(/-/g, '').toUpperCase()}` });
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071116]/70 p-4" role="dialog" aria-modal="true" aria-labelledby="purchase-request-title"><section className="w-full max-w-xl border border-[#a9d9d8] bg-[#f4f1eb] p-6 shadow-xl md:p-8"><div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-[#087f88]">Secure purchase request</p><h2 id="purchase-request-title" className="mt-2 font-serif text-3xl text-[#123b4b]">Unit {unit.unit_number}</h2><p className="mt-1 text-sm text-slate-500">{unit.type || 'Residence'} · {unit.price || 'Price on request'}</p></div><button type="button" onClick={onClose} aria-label="Close purchase request" className="p-2 text-slate-500 hover:text-[#123b4b]"><X size={18} /></button></div><form onSubmit={submit} className="mt-6 grid gap-4"><div><span className="eyebrow mb-2 block text-slate-500">Payment plan</span><div className="grid grid-cols-2 border border-[#a9d9d8] p-1" role="group" aria-label="Payment plan"><button type="button" aria-pressed={paymentPlanType === 'INSTALLMENTS'} onClick={() => setPaymentPlanType('INSTALLMENTS')} className={`px-3 py-3 text-xs font-semibold ${paymentPlanType === 'INSTALLMENTS' ? 'bg-[#087f88] text-white' : 'text-slate-600'}`}>Deposit + installments</button><button type="button" aria-pressed={paymentPlanType === 'FULL'} onClick={() => setPaymentPlanType('FULL')} className={`px-3 py-3 text-xs font-semibold ${paymentPlanType === 'FULL' ? 'bg-[#087f88] text-white' : 'text-slate-600'}`}>Pay in full</button></div></div>{paymentPlanType === 'FULL' ? <div className="border border-[#a9d9d8] bg-white p-4"><p className="eyebrow text-[#087f88]">One-time payment request</p><p className="mt-2 text-xl font-semibold text-[#123b4b]">KSh {price.toLocaleString()}</p><p className="mt-2 text-xs leading-5 text-slate-500">The full amount will appear as pending until NBG verifies and records the payment. No payment is taken here.</p></div> : <div className="grid gap-4 sm:grid-cols-3"><label><span className="eyebrow mb-1.5 block text-slate-500">Initial amount (KSh)</span><CurrencyInput required min={1} max={price || undefined} value={deposit} onChange={setDeposit} className="admin-input w-full" /></label><label><span className="eyebrow mb-1.5 block text-slate-500">Balance payments</span><input type="number" min="1" max="120" value={installmentCount} onChange={(event) => setInstallmentCount(event.target.value)} className="admin-input w-full" /></label><label><span className="eyebrow mb-1.5 block text-slate-500">Frequency</span><select value={frequency} onChange={(event) => setFrequency(event.target.value)} className="admin-input w-full"><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUALLY">Annually</option></select></label></div>}<p className="border-l-2 border-[#19c6c9] pl-3 text-xs leading-5 text-slate-500">Submitting reserves the selected unit and creates a pending payment plan. All payments must be verified and recorded by NBG staff before they appear as paid.</p>{error && <p className="text-sm text-[#a55445]">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="btn-secondary">Cancel</button><button disabled={saving || !price} className="btn-primary disabled:opacity-50">{saving ? 'Submitting…' : 'Submit purchase request'} <ArrowRight size={15} /></button></div>{!price && <p className="text-xs text-[#a55445]">Confirmed pricing is not available for this home yet.</p>}</form></section></div>;
}
function PurchasePaymentConfirmation({ receipt, instructions, user, onDismiss }: { receipt: PurchaseRequestReceipt; instructions: PurchasePaymentInstructions; user: AdminUser; onDismiss: () => void }) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const amountDueNow = receipt.payment_mode === 'FULL' ? receipt.total_amount : receipt.initial_amount;
  const downloadQuotation = async () => {
    setExporting(true);
    setError('');
    try {
      const rows = [
        { Item: 'Applicant', Amount: user.full_name || user.email },
        { Item: 'Property', Amount: `${receipt.unit.type || 'Residence'} · Unit ${receipt.unit.unit_number}` },
        { Item: 'Quotation validity', Amount: 'Subject to NBG confirmation and unit availability' },
        { Item: 'Total purchase price', Amount: `KES ${receipt.total_amount.toLocaleString('en-KE')}` },
        { Item: 'Payment plan', Amount: receipt.payment_mode === 'FULL' ? 'One-time full payment' : `${receipt.initial_amount.toLocaleString('en-KE')} initial payment + ${receipt.installment_count} ${receipt.frequency.toLowerCase()} installments` },
        { Item: 'Amount to remit now', Amount: `KES ${amountDueNow.toLocaleString('en-KE')}` },
        { Item: 'Bank name', Amount: instructions.bank_name },
        { Item: 'Branch', Amount: instructions.bank_branch || 'Not specified' },
        { Item: 'Account name', Amount: instructions.account_name },
        { Item: 'Account number', Amount: instructions.account_number },
        { Item: 'SWIFT / BIC', Amount: instructions.swift_code || 'Not applicable' },
        { Item: 'Bank payment instructions', Amount: instructions.payment_instructions || 'Use the exact transfer reference below and retain your bank confirmation.' },
        { Item: 'Required bank transfer reference', Amount: receipt.payment_reference },
        { Item: 'Payment status', Amount: 'PENDING NBG PAYMENT VERIFICATION' },
        { Item: 'Important', Amount: 'This quotation is not a receipt. The purchase remains pending until NBG confirms and records cleared funds.' },
      ];
      const { blob } = await createVerifiedPdf(`Purchase Quotation · Unit ${receipt.unit.unit_number}`, 'CLIENT_PURCHASE_QUOTATION', rows, { sale_id: receipt.sale_id, unit_id: receipt.unit.id, buyer_id: user.id, payment_reference: receipt.payment_reference }, receipt.sale_id);
      downloadPdf(blob, `nbg-purchase-quotation-unit-${receipt.unit.unit_number}.pdf`);
    } catch (quotationError) {
      setError(quotationError instanceof Error ? quotationError.message : 'The quotation could not be generated.');
    } finally {
      setExporting(false);
    }
  };

  return <section className="mb-8 border border-[#83c8be] bg-[#eefbf9] p-5 md:p-7" aria-labelledby="purchase-payment-confirmation"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow text-[#087f88]">Purchase request received · Payment pending</p><h2 id="purchase-payment-confirmation" className="mt-2 font-serif text-3xl text-[#123b4b]">Unit {receipt.unit.unit_number}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Use the official NBG bank details below and include the exact payment reference. Your purchase remains pending until NBG staff verify the transfer and record it in your account.</p></div><button type="button" onClick={onDismiss} className="btn-secondary !px-3 !py-2">Close confirmation</button></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="border border-[#d6efee] bg-white p-4"><p className="eyebrow text-slate-500">Total purchase price</p><p className="mt-2 text-lg font-semibold text-[#123b4b]">KES {receipt.total_amount.toLocaleString('en-KE')}</p></div><div className="border border-[#d6efee] bg-white p-4"><p className="eyebrow text-slate-500">Amount to remit now</p><p className="mt-2 text-lg font-semibold text-[#123b4b]">KES {amountDueNow.toLocaleString('en-KE')}</p></div><div className="border border-[#d6efee] bg-white p-4"><p className="eyebrow text-slate-500">Payment plan</p><p className="mt-2 text-sm font-semibold text-[#123b4b]">{receipt.payment_mode === 'FULL' ? 'One-time full payment' : `Deposit + ${receipt.installment_count} installments`}</p></div><div className="border border-[#d6efee] bg-white p-4"><p className="eyebrow text-slate-500">Payment reference</p><p className="mt-2 break-all font-mono text-sm font-semibold text-[#087f88]">{receipt.payment_reference}</p></div></div><div className="mt-5 grid gap-5 lg:grid-cols-[1.1fr_.9fr]"><div className="border border-[#d6efee] bg-white p-5"><div className="flex items-center justify-between gap-3"><div><p className="eyebrow text-[#087f88]">Verified remittance destination</p><h3 className="mt-1 font-serif text-2xl text-[#123b4b]">{instructions.bank_name}</h3></div><Building2 className="text-[#087f88]" /></div><dl className="mt-4 grid gap-3 sm:grid-cols-2"><div><dt className="eyebrow text-slate-500">Account name</dt><dd className="mt-1 break-words text-sm font-semibold text-[#123b4b]">{instructions.account_name}</dd></div><div><dt className="eyebrow text-slate-500">Account number</dt><dd className="mt-1 break-all font-mono text-sm font-semibold text-[#123b4b]">{instructions.account_number}</dd></div>{instructions.bank_branch && <div><dt className="eyebrow text-slate-500">Branch</dt><dd className="mt-1 text-sm text-[#123b4b]">{instructions.bank_branch}</dd></div>}{instructions.swift_code && <div><dt className="eyebrow text-slate-500">SWIFT / BIC</dt><dd className="mt-1 font-mono text-sm text-[#123b4b]">{instructions.swift_code}</dd></div>}</dl>{instructions.payment_instructions && <p className="mt-4 whitespace-pre-line border-t border-[#e2eeec] pt-4 text-sm leading-6 text-slate-600">{instructions.payment_instructions}</p>}<div className="mt-4 border-l-2 border-[#19a69c] bg-[#f5fbfa] p-3"><p className="text-xs font-semibold text-[#123b4b]">Transfer reference (required)</p><p className="mt-1 break-all font-mono text-sm text-[#087f88]">{receipt.payment_reference}</p></div></div><div className="flex flex-col justify-between gap-5 border border-[#e3d8bb] bg-[#fffdf7] p-5"><div><p className="eyebrow text-[#856b2e]">Next steps</p><ol className="mt-3 space-y-3 text-sm leading-6 text-slate-600"><li><span className="mr-2 font-semibold text-[#856b2e]">01</span>Download the quotation to present to your bank.</li><li><span className="mr-2 font-semibold text-[#856b2e]">02</span>Transfer the amount due using the exact reference above.</li><li><span className="mr-2 font-semibold text-[#856b2e]">03</span>Send your transfer proof and reference to the NBG team through Messages.</li><li><span className="mr-2 font-semibold text-[#856b2e]">04</span>Wait for NBG to verify the funds; your portal will update when payment is recorded.</li></ol></div><button type="button" onClick={() => void downloadQuotation()} disabled={exporting} className="btn-primary justify-center disabled:opacity-60"><FileDown size={16} />{exporting ? 'Preparing verified quotation...' : 'Download bank quotation'}</button></div></div>{error && <p role="alert" className="mt-4 border border-[#e4b8ad] bg-[#fff7f4] p-3 text-sm text-[#a55445]">{error}</p>}</section>;
}

function ClientPaymentsView({ user, payments, purchaseReceipt, paymentInstructions, onDismissPurchase }: { user: AdminUser; payments: ClientPayment[]; purchaseReceipt: PurchaseRequestReceipt | null; paymentInstructions: PurchasePaymentInstructions | null; onDismissPurchase: () => void }) {
  return <>{purchaseReceipt && (paymentInstructions ? <PurchasePaymentConfirmation receipt={purchaseReceipt} instructions={paymentInstructions} user={user} onDismiss={onDismissPurchase} /> : <section role="alert" className="mb-8 border border-[#e4b8ad] bg-[#fff7f4] p-5"><p className="eyebrow text-[#a55445]">Payment details need confirmation</p><h2 className="mt-2 font-serif text-2xl text-[#123b4b]">Unit {purchaseReceipt.unit.unit_number} · request pending</h2><p className="mt-2 text-sm leading-6 text-slate-600">Your request is recorded, but NBG bank instructions are currently unavailable. Do not transfer funds using old or unverified details. Contact the NBG team and quote <strong className="font-mono">{purchaseReceipt.payment_reference}</strong>.</p><button type="button" onClick={onDismissPurchase} className="btn-secondary mt-4 !px-3 !py-2">Close</button></section>)}<PaymentsContent payments={payments} /></>;
}

function PaymentsContent({ payments }: { payments: ClientPayment[] }) {
  const [exportError, setExportError] = useState('');
  const total = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const paid = payments.reduce((sum, payment) => sum + Number(payment.paid_amount), 0);
  const unitGroups = payments.reduce<Map<string, { key: string; label: string; payments: ClientPayment[] }>>((groups, payment) => {
    const unitNumber = payment.description.match(/\bUnit\s+([^·\s]+)/i)?.[1];
    const label = unitNumber ? `Unit ${unitNumber}` : 'Unit details unavailable';
    const key = payment.unit_id || (unitNumber ? label : payment.id);
    const group = groups.get(key) ?? { key, label, payments: [] };
    group.payments.push(payment);
    groups.set(key, group);
    return groups;
  }, new Map());
  const downloadStatement = async (label: string, unitPayments: ClientPayment[]) => {
    setExportError('');
    try {
      const unitTotal = unitPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const unitPaid = unitPayments.reduce((sum, payment) => sum + Number(payment.paid_amount), 0);
      const rows = [
        { Description: label, Due: '', Amount: `KES ${unitTotal.toLocaleString()}`, Paid: `KES ${unitPaid.toLocaleString()}`, Status: 'SUMMARY', Reference: '' },
        ...unitPayments.map((payment) => ({ Description: payment.description, Due: payment.due_date, Amount: `KES ${Number(payment.amount).toLocaleString()}`, Paid: `KES ${Number(payment.paid_amount).toLocaleString()}`, Status: payment.status, Reference: payment.transaction_refs?.join(' / ') || payment.payment_reference || '' })),
      ];
      const snapshot = unitPayments.map((payment) => ({ id: payment.id, unit_id: payment.unit_id, payment_reference: payment.payment_reference ?? null, description: payment.description, due_date: payment.due_date, amount: Number(payment.amount), paid_amount: Number(payment.paid_amount), status: payment.status, transaction_refs: payment.transaction_refs ?? [] }));
      const { blob } = await createVerifiedPdf(`${label} Payment Statement`, 'CLIENT_PAYMENT_STATEMENT', rows, snapshot);
      downloadPdf(blob, `nbg-payment-statement-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'The statement could not be generated.');
    }
  };
  return <section><div className="portal-section-heading"><div><p className="eyebrow text-[#087f88]">Financial view</p><h2>Your payment<br /><em>plan, clearly.</em></h2></div></div>{exportError && <p role="alert" className="mb-4 border border-[#e4b8ad] bg-[#fff7f4] p-3 text-sm text-[#a55445]">PDF export failed: {exportError}</p>}<div className="portal-stat-grid"><PortalStat label="Scheduled" value={total} detail="KES total planned" /><PortalStat label="Paid" value={paid} detail="KES received" /><PortalStat label="Outstanding" value={Math.max(0, total - paid)} detail="KES remaining" /><PortalStat label="Attention" value={payments.filter((payment) => payment.status === 'OVERDUE').length} detail="Overdue items" /></div><div className="mt-8 space-y-6">{Array.from(unitGroups.values()).map(({ key, label, payments: unitPayments }) => { const unitTotal = unitPayments.reduce((sum, payment) => sum + Number(payment.amount), 0); const unitPaid = unitPayments.reduce((sum, payment) => sum + Number(payment.paid_amount), 0); return <section key={key} className="overflow-hidden border border-[#d6efee] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e2eeec] bg-[#eefbf9] p-4"><div><p className="eyebrow text-[#087f88]">Separate unit statement</p><h3 className="mt-1 font-serif text-2xl text-[#123b4b]">{label}</h3><p className="mt-1 text-xs text-slate-500">Scheduled KSh {unitTotal.toLocaleString()} · Paid KSh {unitPaid.toLocaleString()} · Balance KSh {Math.max(0, unitTotal - unitPaid).toLocaleString()}</p></div><button type="button" onClick={() => void downloadStatement(label, unitPayments)} className="btn-secondary !px-3 !py-2"><FileDown size={15} /> Download this unit’s statement</button></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="text-[10px] uppercase tracking-[.12em] text-[#55777d]"><tr><th className="p-4">Payment</th><th className="p-4">Due</th><th className="p-4">Amount</th><th className="p-4">Paid</th><th className="p-4">Status</th><th className="p-4">Payment / transaction reference</th><th className="p-4">Receipt</th></tr></thead><tbody>{unitPayments.map((payment) => { const paidEarly = payment.status === 'PAID' && payment.due_date > kenyaCalendarDate(); const displayStatus = paidEarly ? 'PAID EARLY' : payment.status; return <tr key={payment.id} className="border-t border-[#e2eeec]"><td className="p-4 font-medium text-[#123b4b]">{payment.description}</td><td className="p-4 text-slate-500">{new Date(payment.due_date).toLocaleDateString()}</td><td className="p-4">KSh {Number(payment.amount).toLocaleString()}</td><td className="p-4">KSh {Number(payment.paid_amount).toLocaleString()}</td><td className="p-4"><span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-[.1em] ${payment.status === 'PAID' ? 'text-[#2e6b3e]' : payment.status === 'OVERDUE' ? 'text-[#a55445]' : 'text-[#856b2e]'}`}>{payment.status === 'PAID' ? <Check size={13} /> : payment.status === 'OVERDUE' ? <AlertCircle size={13} /> : <Clock3 size={13} />}{displayStatus}</span>{paidEarly && <span className="mt-1 block text-[10px] text-slate-500">Paid before the scheduled date</span>}</td><td className="p-4 text-xs">{payment.transaction_refs?.length ? payment.transaction_refs.map((reference) => <a key={reference} href={`/verify/${encodeURIComponent(reference)}`} className="mb-1 block font-mono text-[#087f88] underline">{reference}</a>) : payment.payment_reference ? <div><p className="text-[9px] uppercase text-slate-400">Use for bank transfer</p><p className="break-all font-mono text-[#087f88]">{payment.payment_reference}</p><p className="text-[9px] text-slate-400">Awaiting payment verification</p></div> : <span className="text-slate-400">No payment recorded</span>}</td><td className="p-4">{payment.receipt_url ? <a href={payment.receipt_url} target="_blank" rel="noreferrer" className="text-[#087f88] underline">Open</a> : <span className="text-slate-400">Pending</span>}</td></tr>; })}</tbody></table></div></section>; })}{payments.length === 0 && <div className="border border-dashed border-[#c9c5bd] p-8 text-sm text-slate-500">Your payment schedule will appear here once your consultant adds it.</div>}</div></section>;
}
function documentSummary(document: ClientDocument) {
  const summary = document.content_summary || '';
  const snapshotIndex = summary.indexOf('SYSTEM SNAPSHOT');
  if (snapshotIndex >= 0) return summary.slice(0, snapshotIndex).trim();
  return summary.replace(/ENGINE TEMPLATE DATA[\s\S]*/i, '').trim();
}
function DocumentLink({ document }: { document: ClientDocument }) { const [url, setUrl] = useState(''); useEffect(() => { let active = true; void supabase.storage.from('client-documents').createSignedUrl(document.file_url, 3600).then(({ data }) => { if (active) setUrl(data?.signedUrl || document.file_url); }); return () => { active = false; }; }, [document.file_url]); const print = () => { if (!url) return; const printWindow = window.open(url, '_blank', 'noopener,noreferrer'); if (printWindow) printWindow.addEventListener('load', () => printWindow.print()); }; const summary = documentSummary(document); return <div className={`border-b border-[#e2eeec] py-4 ${url ? '' : 'opacity-50'}`}><div className="flex items-start justify-between gap-3"><span><span className="block text-sm font-semibold text-[#123b4b]">{document.title}</span><span className="mt-1 block text-[10px] uppercase tracking-[.12em] text-slate-400">{document.category} · {document.is_global ? 'All clients' : 'Private'} · {new Date(document.created_at).toLocaleDateString()}</span>{document.verification_code && <span className="mt-1 block text-[10px] text-[#087f88]">Verification code: {document.verification_code}</span>}</span><div className="flex flex-wrap gap-3 text-xs"><a href={url || '#'} target="_blank" rel="noreferrer" download={`${document.document_ref || document.title}.pdf`} onClick={(event) => { if (!url) event.preventDefault(); }} className="text-[#087f88] underline">View / download</a>{document.verification_code && <a href={`/verify/${encodeURIComponent(document.verification_code)}`} className="text-[#087f88] underline">Verify</a>}<button type="button" disabled={!url} onClick={print} className="text-[#087f88] underline disabled:text-slate-400">Print</button></div></div>{summary && <p className="mt-3 whitespace-pre-line text-xs leading-5 text-slate-500">{summary}</p>}</div>; }
function ProjectInvestmentDocumentLink({ document, projects }: { document: ProjectInvestmentDocument; projects: Project[] }) {
  const [url, setUrl] = useState('');
  const project = projects.find((item) => item.id === document.project_id);
  useEffect(() => {
    let active = true;
    void supabase.storage.from('investment-documents').createSignedUrl(document.storage_path, 300).then(({ data }) => {
      if (active) setUrl(data?.signedUrl ?? '');
    });
    return () => { active = false; };
  }, [document.storage_path]);
  return <div className="flex flex-col justify-between gap-3 border-b border-[#e2eeec] py-4 last:border-0 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold text-[#123b4b]">{document.title}</p><p className="mt-1 text-[10px] uppercase tracking-[.12em] text-slate-400">{document.category} · {project?.name || 'NBG project'} · {document.is_public ? 'Public' : 'Shared privately'}</p>{document.verification_code && <p className="mt-1 font-mono text-[10px] text-[#087f88]">{document.verification_code}</p>}</div><div className="flex gap-3 text-xs"><a href={url || '#'} target="_blank" rel="noreferrer" onClick={(event) => { if (!url) event.preventDefault(); }} className="font-semibold text-[#087f88] underline">{url ? 'View document' : 'Preparing secure link'}</a>{document.verification_code && <a href={`/verify/${encodeURIComponent(document.verification_code)}`} className="font-semibold text-[#087f88] underline">Verify</a>}</div></div>;
}

function ClientLeadProjectShares({ user }: { user: AdminUser }) {
  const [shares, setShares] = useState<{ id: string; tracking_code: string; project_details: PublicProjectDetails; shared_at: string }[]>([]);
  useEffect(() => {
    let active = true;
    void supabase.from('lead_project_shares').select('id,tracking_code,project_details,shared_at').eq('user_id', user.id).order('shared_at', { ascending: false }).then(({ data }) => {
      if (active) setShares((data ?? []) as typeof shares);
    });
    return () => { active = false; };
  }, [user.id]);
  if (!shares.length) return null;
  return <section className="mt-7 border-t border-[#e2eeec] pt-6"><p className="eyebrow text-[#087f88]">Shared by your NBG consultant</p>{shares.map((share) => <div key={share.id}><ProjectDetailsPackage details={share.project_details} trackingCode={share.tracking_code} /><p className="mt-2 text-[10px] text-slate-400">Shared {new Date(share.shared_at).toLocaleDateString()}</p></div>)}</section>;
}

function ResourcesContent({ navigate, documents, projectDocuments, projects, tickets, setTickets, user }: { navigate: (view: View) => void; documents: ClientDocument[]; projectDocuments: ProjectInvestmentDocument[]; projects: Project[]; tickets: SupportTicket[]; setTickets: (tickets: SupportTicket[]) => void; user: AdminUser }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const submitTicket = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    const { data } = await supabase.from('client_support_tickets').insert({ user_id: user.id, subject, message }).select().single();
    if (data) { setTickets([data as SupportTicket, ...tickets]); setSubject(''); setMessage(''); }
    setSending(false);
  };
  return <section><div className="portal-section-heading"><div><p className="eyebrow text-[#087f88]">Your resources</p><h2>Everything you need,<br /><em>when you need it.</em></h2></div></div><div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><div className="portal-panel"><div className="flex items-center gap-3"><FileText size={22} className="text-[#087f88]" /><div><p className="eyebrow text-[#087f88]">Document vault</p><h3 className="mt-2 font-serif text-3xl text-[#123b4b]">Your NBG files.</h3></div></div><div className="mt-6 space-y-3">{documents.map((document) => <DocumentLink key={document.id} document={document} />)}{documents.length === 0 && <p className="text-sm leading-6 text-slate-500">Agreements, receipts, brochures, and floor plans will appear here when shared with your account.</p>}</div><div className="mt-7 border-t border-[#e2eeec] pt-6"><p className="eyebrow text-[#087f88]">Project investment documents</p><div className="mt-3">{projectDocuments.map((document) => <ProjectInvestmentDocumentLink key={document.id} document={document} projects={projects} />)}{projectDocuments.length === 0 && <p className="py-3 text-sm leading-6 text-slate-500">No published project documents have been shared with this account.</p>}</div></div></div><div className="portal-panel"><div className="flex items-center gap-3"><MessageCircle size={22} className="text-[#087f88]" /><div><p className="eyebrow text-[#087f88]">Secure support</p><h3 className="mt-2 font-serif text-3xl text-[#123b4b]">Talk to the team.</h3></div></div><form onSubmit={submitTicket} className="mt-6 grid gap-3"><input value={subject} onChange={(event) => setSubject(event.target.value)} required className="admin-input" placeholder="Subject" /><textarea value={message} onChange={(event) => setMessage(event.target.value)} required rows={4} className="admin-input resize-none" placeholder="How can we help?" /><button disabled={sending} className="btn-primary justify-center disabled:opacity-60">{sending ? 'Sending...' : 'Send secure message'} <Send size={15} /></button></form><div className="mt-6 space-y-3">{tickets.slice(0, 3).map((ticket) => <div key={ticket.id} className="border-t border-[#e2eeec] pt-3 text-sm"><div className="flex justify-between gap-3"><strong className="text-[#123b4b]">{ticket.subject}</strong><span className="text-[10px] uppercase text-[#087f88]">{ticket.status}</span></div>{ticket.staff_reply && <p className="mt-2 text-slate-500">{ticket.staff_reply}</p>}</div>)}</div><button onClick={() => navigate('contact')} className="link-arrow mt-6">Open general enquiry <ArrowRight size={14} /></button></div></div><ClientLeadProjectShares user={user} /></section>;
}
function ProfileContent({ user, recovery, profile, onSaveProfile, onSignOut }: { user: AdminUser; recovery: boolean; profile: ClientProfile | null; onSaveProfile: (values: Omit<ClientProfile, 'id'>) => Promise<void>; onSignOut: () => void }) {
  const [fullName, setFullName] = useState(profile?.full_name ?? user.full_name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? user.phone ?? '');
  const [preferredLocation, setPreferredLocation] = useState(profile?.preferred_location ?? '');
  const [investmentBudget, setInvestmentBudget] = useState(profile?.investment_budget ?? '');
  const [notes, setNotes] = useState(profile?.notes ?? '');
  const [identityDocumentType, setIdentityDocumentType] = useState(profile?.identity_document_type ?? '');
  const [identityDocumentNumber, setIdentityDocumentNumber] = useState(profile?.identity_document_number ?? '');
  const [residentialAddress, setResidentialAddress] = useState(profile?.residential_address ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [resetNotice, setResetNotice] = useState('');
  const completedFields = [fullName, phone, preferredLocation, investmentBudget].filter(Boolean).length;
  const completion = Math.round((completedFields / 4) * 100);

  useEffect(() => {
    setFullName(profile?.full_name ?? user.full_name ?? '');
    setPhone(profile?.phone ?? user.phone ?? '');
    setPreferredLocation(profile?.preferred_location ?? '');
    setInvestmentBudget(profile?.investment_budget ?? '');
    setNotes(profile?.notes ?? '');
    setIdentityDocumentType(profile?.identity_document_type ?? '');
    setIdentityDocumentNumber(profile?.identity_document_number ?? '');
    setResidentialAddress(profile?.residential_address ?? '');
  }, [profile, user.full_name, user.phone]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setSaved(false);
    setSaveError('');
    try { await onSaveProfile({ full_name: fullName, phone, preferred_location: preferredLocation, investment_budget: investmentBudget, notes, identity_document_type: identityDocumentType, identity_document_number: identityDocumentNumber, residential_address: residentialAddress }); setSaved(true); setEditing(false); }
    catch (error) { setSaveError(error instanceof Error ? error.message : 'Profile could not be saved.'); }
    finally { setSaving(false); }
  };

  const requestPasswordReset = async () => {
    const { error } = await sendPasswordReset(user.email);
    setResetNotice(error ? 'We could not send reset instructions right now.' : 'Password reset instructions have been sent to your email.');
  };

  return <section><div className="portal-section-heading"><div><p className="eyebrow text-[#087f88]">Account controls</p><h2>Your profile,<br /><em>kept secure.</em></h2></div></div><div className="portal-profile"><div><p className="eyebrow text-slate-500">Signed-in email</p><p className="mt-2 text-lg text-[#123b4b]">{user.email}</p></div><div><p className="eyebrow text-slate-500">Access level</p><p className="mt-2 text-lg text-[#087f88]">Client</p></div><button onClick={onSignOut} className="btn-primary">Sign out <ArrowRight size={15} /></button></div><div className="mt-6 border border-[#a9d9d8] bg-[#eefbf9] p-5"><div className="flex items-center justify-between gap-4"><div><p className="eyebrow text-[#087f88]">Profile completion</p><p className="mt-2 text-sm text-slate-600">{completion}% complete · Add your details to help the NBG team personalize your journey.</p></div><span className="font-serif text-3xl text-[#087f88]">{completion}%</span></div><div className="mt-4 h-2 bg-white"><div className="h-full bg-[#19c6c9] transition-all" style={{ width: `${completion}%` }} /></div></div>
    <div className="mt-6 flex items-center justify-between gap-3"><div><p className="eyebrow text-[#087f88]">Your saved details</p><p className="mt-1 text-sm text-slate-500">Review your profile without re-entering it each visit.</p></div>{!editing && <button type="button" onClick={() => setEditing(true)} className="btn-secondary">Edit profile</button>}</div>
    <form onSubmit={submit} className="mt-3 grid gap-4 rounded-xl border border-[#d6efee] bg-white p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm text-slate-600"><span className="eyebrow text-slate-500">Full name</span><input disabled={!editing} value={fullName} onChange={(event) => setFullName(event.target.value)} className="admin-input disabled:bg-[#f4f1eb]" placeholder="Your full name" /></label>
        <label className="grid gap-2 text-sm text-slate-600"><span className="eyebrow text-slate-500">Phone</span><input disabled={!editing} value={phone} onChange={(event) => setPhone(event.target.value)} className="admin-input disabled:bg-[#f4f1eb]" placeholder="+254..." /></label>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm text-slate-600"><span className="eyebrow text-slate-500">Preferred location</span><input disabled={!editing} value={preferredLocation} onChange={(event) => setPreferredLocation(event.target.value)} className="admin-input disabled:bg-[#f4f1eb]" placeholder="Nyali, Mombasa" /></label>
        <label className="grid gap-2 text-sm text-slate-600"><span className="eyebrow text-slate-500">Investment budget</span><input disabled={!editing} value={investmentBudget} onChange={(event) => setInvestmentBudget(event.target.value)} className="admin-input disabled:bg-[#f4f1eb]" placeholder="KSh 8,000,000" /></label>
      </div>
      <div className="grid gap-4 border-t border-[#e2eeec] pt-4 md:grid-cols-2">
        <label className="grid gap-2 text-sm text-slate-600"><span className="eyebrow text-slate-500">Identity document type</span><select disabled={!editing} value={identityDocumentType} onChange={(event) => setIdentityDocumentType(event.target.value)} className="admin-input disabled:bg-[#f4f1eb]"><option value="">Select document type</option><option value="NATIONAL_ID">National ID</option><option value="PASSPORT">Passport</option></select></label>
        <label className="grid gap-2 text-sm text-slate-600"><span className="eyebrow text-slate-500">ID / passport number</span><input disabled={!editing} value={identityDocumentNumber} onChange={(event) => setIdentityDocumentNumber(event.target.value)} className="admin-input disabled:bg-[#f4f1eb]" placeholder="Enter your document number" autoComplete="off" /></label>
      </div>
      <label className="grid gap-2 text-sm text-slate-600"><span className="eyebrow text-slate-500">Residential address</span><textarea disabled={!editing} value={residentialAddress} onChange={(event) => setResidentialAddress(event.target.value)} rows={2} className="admin-input resize-y disabled:bg-[#f4f1eb]" placeholder="Street, area, town, country" /></label>
      <label className="grid gap-2 text-sm text-slate-600"><span className="eyebrow text-slate-500">Notes</span><textarea disabled={!editing} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="admin-input resize-none disabled:bg-[#f4f1eb]" placeholder="Tell us what you are looking for" /></label>
      <div className="flex items-center justify-between gap-3">
        {saved && <p className="text-sm text-[#2e6b3e]">Profile saved.</p>}{saveError && <p className="text-sm text-[#a55445]">{saveError}</p>}
        {editing && <button type="submit" disabled={saving} className="btn-primary ml-auto disabled:opacity-60">{saving ? 'Saving...' : 'Save profile'}</button>}
      </div>
    </form>
    <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-[#d6efee] pt-5"><button type="button" onClick={() => void requestPasswordReset()} className="btn-secondary"><LockKeyhole size={15} /> Email password reset link</button>{resetNotice && <p className="text-sm text-[#087f88]">{resetNotice}</p>}</div>{!recovery && <p className="mt-3 text-xs text-slate-500">Password changes use Supabase’s secure recovery flow. We never display or store your password.</p>}</section>; }
function InvestmentContent({ projects, investments, showInvestment, setShowInvestment, projectId, setProjectId, amount, setAmount, plan, setPlan, submitInvestment, realtor, setRealtor, user }: { projects: Project[]; investments: Investment[]; showInvestment: boolean; setShowInvestment: (value: boolean) => void; projectId: string; setProjectId: (value: string) => void; amount: string; setAmount: (value: string) => void; plan: string; setPlan: (value: string) => void; submitInvestment: (event: FormEvent) => void; realtor: Realtor | null; setRealtor: (value: Realtor) => void; user: AdminUser }) {
  const [name, setName] = useState(realtor?.name ?? '');
  const [phone, setPhone] = useState(realtor?.phone ?? '');
  return <section><div className="portal-section-heading"><div><p className="eyebrow text-[#087f88]">Plan & grow</p><h2>Make the next move<br /><em>with clarity.</em></h2></div></div><div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><InvestmentCalculator /><div className="portal-panel"><div className="flex items-center gap-3"><UserRound className="text-[#087f88]" /><div><p className="eyebrow text-[#087f88]">Realtor pathway</p><h3 className="mt-2 font-serif text-3xl text-[#123b4b]">{realtor ? `Application: ${realtor.status}` : 'Represent NBG.'}</h3></div></div>{realtor ? <p className="mt-4 text-sm leading-6 text-slate-600">Your application is with the NBG team. Status updates and commission details will appear here.</p> : <form onSubmit={async (event) => { event.preventDefault(); const { data } = await supabase.from('realtors').insert({ user_id: user.id, name, email: user.email, phone: phone || null, status: 'PENDING' }).select().single(); if (data) setRealtor(data as Realtor); }} className="mt-5 grid gap-3"><input value={name} onChange={(event) => setName(event.target.value)} required className="admin-input" placeholder="Full name" /><input value={phone} onChange={(event) => setPhone(event.target.value)} className="admin-input" placeholder="Phone number" /><button className="btn-primary">Apply to become a realtor <ArrowRight size={15} /></button></form>}</div></div><div className="mt-8 portal-panel"><div className="flex items-center justify-between"><div><p className="eyebrow text-[#087f88]">Saved investment plans</p><h3 className="mt-2 font-serif text-3xl text-[#123b4b]">Your plans</h3></div><button onClick={() => setShowInvestment(!showInvestment)} className="btn-primary">{showInvestment ? 'Close' : 'Create plan'}</button></div>{showInvestment && <form onSubmit={submitInvestment} className="mt-6 grid gap-4 border-t border-[#a9d9d8] pt-6 md:grid-cols-4"><select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="admin-input"><option value="">Choose a project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><select value={plan} onChange={(event) => setPlan(event.target.value)} className="admin-input"><option>Coastal starter</option><option>Family residence</option><option>Long-term investment</option><option>Premium ocean address</option></select><CurrencyInput value={amount} onChange={setAmount} className="admin-input" placeholder="Target amount (KSh)" /><button className="btn-primary">Send plan <ArrowRight size={15} /></button></form>}{investments.map((investment) => <div key={investment.id} className="flex items-center justify-between gap-4 border-b border-[#e2eeec] py-4"><div><p className="text-sm font-semibold text-[#123b4b]">{investment.notes || 'Investment enquiry'}</p><p className="mt-1 text-xs text-slate-500">{investment.amount_interested == null ? 'Amount to discuss' : investment.currency === 'KES' ? formatKes(investment.amount_interested) : `${investment.currency} ${new Intl.NumberFormat('en-KE').format(investment.amount_interested)}`}</p></div><span className="portal-status">{investment.status}</span></div>)}{investments.length === 0 && <p className="mt-5 text-sm text-slate-500">No plans yet. Create one when you are ready.</p>}</div></section>;
}

export default ClientPortal;
