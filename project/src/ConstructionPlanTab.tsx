import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Circle, Eye, ImagePlus, LoaderCircle, Save, Send, Video, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Project } from '@/lib/types';
import { calculateConstructionProgress, createConstructionPlan, resizeConstructionPlan, type ConstructionPlanData, type ConstructionStatus, type PublishedConstructionProgress } from '@/lib/construction';

type DraftRow = { project_id: string; total_floors: number; draft_data: ConstructionPlanData };

type ConstructionDocument = { title: string; category: string; storage_path: string; is_public: boolean; is_published: boolean; investor_user_id: string | null; document_ref?: string; verification_code?: string; content_hash?: string };
type InvestorAccount = { user_id: string; full_name: string | null; phone: string | null; email: string | null; role: string; preferred_location: string | null; investment_budget: string | null; created_at: string; email_confirmed_at: string | null; last_sign_in_at: string | null; access_status: string; investment_count: number; restricted_document_count: number; last_investment_at: string | null };

const statusCycle: ConstructionStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED'];
const investmentFields: { key: keyof ConstructionPlanData['investment']; label: string; placeholder: string }[] = [
  { key: 'developmentStage', label: 'Development stage', placeholder: 'Planning, approvals, active construction...' },
  { key: 'unitSummary', label: 'Number and type of units', placeholder: 'Add verified unit schedule details' },
  { key: 'minimumInvestment', label: 'Minimum investment', placeholder: 'Only publish a confirmed figure or terms' },
  { key: 'investmentTimeline', label: 'Expected investment timeline', placeholder: 'Indicative timing, subject to documented terms' },
  { key: 'useOfFunds', label: 'How funds are used', placeholder: 'Describe approved project uses' },
  { key: 'projectBudget', label: 'Project budget', placeholder: 'Optional, verified project budget' },
  { key: 'developmentCosts', label: 'Development costs', placeholder: 'Summarize verified development costs or cost categories' },
  { key: 'fundingRequirements', label: 'Funding requirements', placeholder: 'Current funding requirement, if approved for disclosure' },
  { key: 'participationStructure', label: 'Investor participation structure', placeholder: 'Describe the reviewed structure without implying guaranteed returns' },
  { key: 'risks', label: 'Risk disclosures', placeholder: 'Relevant market, construction, liquidity, and regulatory risks' },
  { key: 'fees', label: 'Applicable fees', placeholder: 'Disclose applicable fees or state that they are not yet confirmed' },
  { key: 'distributions', label: 'Exit, repayment, or distribution structure', placeholder: 'Only state legally reviewed terms' },
  { key: 'legalInformation', label: 'Legal and regulatory information', placeholder: 'Jurisdiction, approvals, and applicable legal information' },
  { key: 'requiredDocuments', label: 'Investor documentation', placeholder: 'Due diligence, identity, source-of-funds, and other requirements' },
];

function statusLabel(status: ConstructionStatus) {
  return status === 'COMPLETED' ? 'Complete' : status === 'IN_PROGRESS' ? 'In progress' : 'Pending';
}

function nextStatus(status: ConstructionStatus) {
  return statusCycle[(statusCycle.indexOf(status) + 1) % statusCycle.length];
}

function StatusButton({ status, label, onClick }: { status: ConstructionStatus; label: string; onClick: () => void }) {
  const Icon = status === 'COMPLETED' ? Check : status === 'IN_PROGRESS' ? LoaderCircle : Circle;
  return <button type="button" onClick={onClick} aria-label={`${label}: ${statusLabel(status)}. Change status`} className={`inline-flex items-center gap-2 text-left text-xs ${status === 'COMPLETED' ? 'text-[#2e6b3e]' : status === 'IN_PROGRESS' ? 'text-[#2e5f7a]' : 'text-slate-400'}`}><Icon size={15} />{statusLabel(status)}</button>;
}

export default function ConstructionPlanTab({ canPublish }: { canPublish: boolean }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [floorCountInput, setFloorCountInput] = useState('');
  const [plan, setPlan] = useState<ConstructionPlanData | null>(null);
  const [published, setPublished] = useState<PublishedConstructionProgress | null>(null);
  const [documents, setDocuments] = useState<ConstructionDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentCategory, setDocumentCategory] = useState('Investment Information Memorandum');
  const [documentPublic, setDocumentPublic] = useState(false);
  const [documentInvestorUserId, setDocumentInvestorUserId] = useState('');
  const [accountSearch, setAccountSearch] = useState('');
  const [accountMatches, setAccountMatches] = useState<InvestorAccount[]>([]);

  const loadProjects = useCallback(async () => {
    const { data, error: queryError } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (queryError) setError(`Could not load projects: ${queryError.message}`);
    const rows = (data ?? []) as Project[];
    setProjects(rows);
    setProjectId((current) => current || rows[0]?.id || '');
    setLoading(false);
  }, []);

  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const loadProjectPlan = useCallback(async () => {
    if (!projectId) {
      setPlan(null);
      setPublished(null);
      setDocuments([]);
      return;
    }
    setLoading(true);
    setError('');
    const [draftResult, publishedResult, documentsResult] = await Promise.all([
      supabase.from('project_construction_plans').select('project_id,total_floors,draft_data').eq('project_id', projectId).maybeSingle(),
      supabase.from('published_construction_progress').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('project_investment_documents').select('title,category,storage_path,is_public,is_published,investor_user_id,document_ref,verification_code,content_hash').eq('project_id', projectId).order('created_at', { ascending: false }),
    ]);
    if (draftResult.error) setError(`Could not load the construction draft. Apply the latest Supabase migration: ${draftResult.error.message}`);
    else {
      const project = projects.find((item) => item.id === projectId);
      const draft = draftResult.data as DraftRow | null;
      const defaultFloors = project?.total_floors ?? 0;
      setPlan(draft ? resizeConstructionPlan(draft.draft_data, draft.total_floors) : defaultFloors > 0 ? createConstructionPlan(defaultFloors) : null);
    }
    if (publishedResult.error) setError((current) => current || `Could not load published progress: ${publishedResult.error.message}`);
    setPublished((publishedResult.data ?? null) as PublishedConstructionProgress | null);
    if (documentsResult.error) setError((current) => current || `Could not load investment documents: ${documentsResult.error.message}`);
    setDocuments((documentsResult.data ?? []) as ConstructionDocument[]);
    setLoading(false);
  }, [projectId, projects]);

  useEffect(() => { void loadProjectPlan(); }, [loadProjectPlan]);
  useEffect(() => {
    if (!canPublish) return;
    let active = true;
    void supabase.rpc('list_client_access_accounts').then(({ data, error: queryError }) => {
      if (!active) return;
      if (queryError) setError(`Client account directory could not be loaded: ${queryError.message}`);
      else setAccountMatches((data ?? []) as InvestorAccount[]);
    });
    return () => { active = false; };
  }, [canPublish]);

  const progress = useMemo(() => plan ? calculateConstructionProgress(plan) : 0, [plan]);
  const updatePlan = (patch: Partial<ConstructionPlanData>) => setPlan((current) => current ? { ...current, ...patch } : current);
  const project = projects.find((item) => item.id === projectId);
  const parsedFloorCount = Number(floorCountInput);
  const validFloorCount = Number.isInteger(parsedFloorCount) && parsedFloorCount >= 1 && parsedFloorCount <= 250;
  const filteredAccounts = useMemo(() => {
    const query = accountSearch.trim().toLowerCase();
    if (!query) return accountMatches;
    return accountMatches.filter((account) => [account.full_name, account.email, account.phone, account.access_status, account.role].some((value) => value?.toLowerCase().includes(query)));
  }, [accountMatches, accountSearch]);
  const completedCount = plan?.milestones.filter((milestone) => milestone.status === 'COMPLETED').length ?? 0;
  const activeFloorCount = plan?.floors.filter((floor) => floor.status === 'IN_PROGRESS').length ?? 0;

  useEffect(() => {
    setFloorCountInput(project?.total_floors ? String(project.total_floors) : '');
  }, [projectId, project?.total_floors]);

  const createPlanFromFloorCount = async () => {
    if (!projectId || !validFloorCount) {
      setError('Enter a whole-number floor count between 1 and 250.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const nextPlan = createConstructionPlan(parsedFloorCount);
    const projectResult = await supabase.from('projects').update({ total_floors: parsedFloorCount }).eq('id', projectId);
    if (projectResult.error) {
      setError(/total_floors/i.test(projectResult.error.message) ? 'Apply the construction portal migration first, then retry setting up this building.' : `Could not save the floor count: ${projectResult.error.message}`);
      setSaving(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { error: draftError } = await supabase.from('project_construction_plans').upsert({
      project_id: projectId,
      total_floors: parsedFloorCount,
      draft_data: nextPlan,
      updated_by: user?.id ?? null,
    }, { onConflict: 'project_id' });
    if (draftError) {
      setError(`Floor count saved, but the draft could not be created: ${draftError.message}`);
      setSaving(false);
      return;
    }
    setProjects((current) => current.map((item) => item.id === projectId ? { ...item, total_floors: parsedFloorCount } : item));
    setPlan(nextPlan);
    setNotice('Building plan created and saved as a draft. Review it before publishing.');
    setSaving(false);
  };

  const saveDraft = async (): Promise<boolean> => {
    if (!projectId || !plan || plan.totalFloors < 1 || plan.totalFloors > 250) {
      setError('Choose a project and configure between 1 and 250 floors first.');
      return false;
    }
    setSaving(true);
    setError('');
    setNotice('');
    const { data: { user } } = await supabase.auth.getUser();
    const { error: saveError } = await supabase.from('project_construction_plans').upsert({
      project_id: projectId,
      total_floors: plan.totalFloors,
      draft_data: plan,
      updated_by: user?.id ?? null,
    }, { onConflict: 'project_id' });
    let projectError: { message: string } | null = null;
    if (!saveError) {
      const result = await supabase.from('projects').update({ total_floors: plan.totalFloors }).eq('id', projectId);
      projectError = result.error;
      if (projectError) setError(`Draft saved, but the project's floor count could not be updated: ${projectError.message}`);
      else setNotice('Draft saved. The public journey is unchanged until an administrator publishes it.');
    } else setError(`Draft could not be saved: ${saveError.message}`);
    setSaving(false);
    return !saveError && !projectError;
  };

  const publish = async () => {
    if (!canPublish || !projectId || !plan) return;
    if (!await saveDraft()) return;
    setSaving(true);
    setError('');
    const { data, error: publishError } = await supabase.rpc('publish_construction_progress', { p_project_id: projectId });
    if (publishError) setError(`Publish failed: ${publishError.message}`);
    else {
      setPublished(data as PublishedConstructionProgress);
      setNotice('Construction progress is now published. Public pages receive the updated snapshot immediately.');
    }
    setSaving(false);
  };

  const uploadMedia = async (files: FileList | null) => {
    if (!files?.length || !plan) return;
    const selectedFiles = Array.from(files);
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'video/webm', 'video/quicktime'];
    if (selectedFiles.some((file) => !allowedTypes.includes(file.type) || file.size > 50 * 1024 * 1024)) {
      setError('Choose JPG, PNG, WebP, AVIF, GIF, MP4, or WebM files under 50 MB each.');
      return;
    }
    setError('');
    const uploaded = [];
    for (const file of selectedFiles) {
      const path = `updates/construction/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
      const { error: uploadError } = await supabase.storage.from('public-media').upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setError(`Media upload failed: ${uploadError.message}`);
        return;
      }
      uploaded.push({ url: supabase.storage.from('public-media').getPublicUrl(path).data.publicUrl, type: file.type.startsWith('video/') ? 'video' as const : 'image' as const, caption: file.name });
    }
    updatePlan({ media: [...plan.media, ...uploaded] });
  };

  const uploadDocument = async (file: File | undefined) => {
    if (!file || !projectId || !documentTitle.trim()) {
      setError('Enter a document title and choose a file.');
      return;
    }
    if (!canPublish) {
      setError('Administrator access is required to manage investor documents.');
      return;
    }
    if (!documentPublic && !documentInvestorUserId) {
      setError('Select a registered investor account before uploading a confidential document.');
      return;
    }
    if (file.size > 20 * 1024 * 1024 || !/\.(pdf|docx?|xlsx?|pptx?)$/i.test(file.name)) {
      setError('Choose a PDF, Word, Excel, or PowerPoint document under 20 MB.');
      return;
    }
    setError('');
    const path = `${projectId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
    const { error: uploadError } = await supabase.storage.from('investment-documents').upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) {
      setError(`Secure upload failed: ${uploadError.message}. Apply the latest migration and confirm admin access.`);
      return;
    }
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    const contentHash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error: insertError } = await supabase.from('project_investment_documents').insert({
      project_id: projectId,
      title: documentTitle.trim(),
      category: documentCategory,
      storage_path: path,
      is_public: documentPublic,
      is_published: false,
      investor_user_id: documentPublic ? null : documentInvestorUserId,
      uploaded_by: user?.id ?? null,
      content_hash: contentHash,
    }).select('title,category,storage_path,is_public,is_published,investor_user_id,document_ref,verification_code,content_hash').single();
    if (insertError || !data) {
      setError(`Document metadata could not be saved: ${insertError?.message ?? 'Unknown error'}`);
      return;
    }
    setDocuments((current) => [data as ConstructionDocument, ...current]);
    setDocumentTitle('');
    setNotice('Document uploaded privately. Publish it from the document list when it has been approved.');
  };

  const loadInvestorAccounts = async () => {
    const { data, error: queryError } = await supabase.rpc('list_client_access_accounts');
    if (queryError) setError(`Client account directory could not be loaded: ${queryError.message}`);
    else setAccountMatches((data ?? []) as InvestorAccount[]);
  };

  const toggleDocumentPublished = async (document: ConstructionDocument) => {
    const nextValue = !document.is_published;
    const { error: updateError } = await supabase.from('project_investment_documents').update({ is_published: nextValue }).eq('storage_path', document.storage_path);
    if (updateError) setError(`Document status could not be changed: ${updateError.message}`);
    else setDocuments((current) => current.map((item) => item.storage_path === document.storage_path ? { ...item, is_published: nextValue } : item));
  };

  if (loading && projects.length === 0) return <div className="py-16 text-center text-sm text-slate-500">Loading project construction settings...</div>;

  return <div className="space-y-8">
    <section className="flex flex-col gap-5 border-b border-[#c9c5bd] pb-6 md:flex-row md:items-end md:justify-between">
      <div><p className="eyebrow text-[#087f88]">Project delivery</p><h2 className="mt-2 font-serif text-3xl text-[#123b4b]">Construction journey</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Configure floors and weighted milestones, review the calculated preview, then publish an approved snapshot for the public site.</p></div>
      <label className="grid gap-1 text-xs text-slate-500">Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="admin-input min-w-64"><option value="">Choose a project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    </section>

    {error && <p role="alert" className="border border-[#e4b8ad] bg-[#fff7f4] p-4 text-sm text-[#a55445]">{error}</p>}
    {notice && <p role="status" className="border border-[#a9d9d8] bg-[#eefbf9] p-4 text-sm text-[#087f88]">{notice}</p>}
    {canPublish && projectId && <section className="border-y border-[#c9c5bd] py-5"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-[#087f88]">Confidential document access</p><p className="mt-2 text-sm text-slate-500">All client accounts and their portal access are listed below. Select an account to grant access to restricted files for this project.</p></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{accountMatches.length} client accounts</span><button type="button" onClick={() => void loadInvestorAccounts()} className="btn-secondary">Refresh accounts</button></div></div><input value={accountSearch} onChange={(event) => setAccountSearch(event.target.value)} placeholder="Filter by name, email, phone, or access status" className="admin-input mt-4 w-full" /><p className="mt-3 text-xs text-[#087f88]">Selected recipient: {accountMatches.find((account) => account.user_id === documentInvestorUserId)?.email || accountMatches.find((account) => account.user_id === documentInvestorUserId)?.full_name || 'None'}</p><div className="mt-3 grid gap-2 md:grid-cols-2">{filteredAccounts.map((account) => <button key={account.user_id} type="button" onClick={() => setDocumentInvestorUserId(account.user_id)} className={`border p-4 text-left ${documentInvestorUserId === account.user_id ? 'border-[#087f88] bg-[#eefbf9]' : 'border-[#c9c5bd] bg-white'}`}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#123b4b]">{account.full_name || 'Name not provided'}</p><p className="mt-1 text-xs text-slate-500">{account.email || 'No email'} · {account.phone || 'No phone'}</p></div><span className={`shrink-0 text-[10px] font-semibold uppercase ${account.access_status === 'ACTIVE' ? 'text-[#2e6b3e]' : account.access_status === 'SUSPENDED' ? 'text-[#a55445]' : 'text-[#856b2e]'}`}>{account.access_status.replace('_', ' ')}</span></div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-500 sm:grid-cols-4"><span>Role: {account.role}</span><span>Created: {new Date(account.created_at).toLocaleDateString()}</span><span>Investments: {account.investment_count}</span><span>Private files: {account.restricted_document_count}</span><span className="sm:col-span-2">Last sign-in: {account.last_sign_in_at ? new Date(account.last_sign_in_at).toLocaleString() : 'Never'}</span><span className="sm:col-span-2">Email confirmed: {account.email_confirmed_at ? new Date(account.email_confirmed_at).toLocaleDateString() : 'No'}</span><span className="sm:col-span-2">Last investment: {account.last_investment_at ? new Date(account.last_investment_at).toLocaleDateString() : 'None'}</span><span className="sm:col-span-2">Budget: {account.investment_budget || 'Not provided'}</span><span className="sm:col-span-4">Preferred location: {account.preferred_location || 'Not provided'}</span></div></button>)}{filteredAccounts.length === 0 && <p className="border border-dashed border-[#c9c5bd] p-6 text-sm text-slate-500">{accountMatches.length ? 'No client accounts match this filter.' : 'No client accounts are available, or the account directory migration has not been applied.'}</p>}</div></section>}
    {!projectId ? <p className="border border-dashed border-[#c9c5bd] p-10 text-center text-sm text-slate-500">Create a project before setting up its construction journey.</p> : loading ? <p className="py-8 text-sm text-slate-500">Loading this project's draft and published snapshot...</p> : !plan ? <section className="max-w-xl border border-[#c9c5bd] bg-white p-6"><h3 className="font-serif text-2xl text-[#123b4b]">Set the building configuration</h3><p className="mt-2 text-sm text-slate-500">Enter the building's total floor count. The project floors and draft plan are saved together before you begin progress updates.</p><label className="mt-5 grid gap-1.5 text-xs text-slate-500">Total floors, including ground floor<input autoFocus type="number" min="1" max="250" step="1" value={floorCountInput} onChange={(event) => setFloorCountInput(event.target.value)} className="admin-input" placeholder="For example, 12" /><span>A 12-floor configuration creates Ground Floor through 11th Floor.</span></label><button type="button" onClick={() => void createPlanFromFloorCount()} disabled={!validFloorCount || saving} className="btn-primary mt-5 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Creating plan...' : 'Create and save building plan'}</button>{error && <p role="alert" className="mt-3 text-sm text-[#a55445]">{error}</p>}</section> : <>
      <section className="grid gap-5 border-b border-[#c9c5bd] pb-7 lg:grid-cols-[.75fr_1.25fr]">
        <div className="bg-[#0d4055] p-6 text-white md:p-8"><p className="eyebrow text-[#8de7e2]">Draft preview</p><div className="mt-5 flex items-end justify-between gap-4"><strong className="font-serif text-6xl">{progress}%</strong><span className="pb-2 text-xs text-white/65">calculated completion</span></div><div className="mt-5 h-2 bg-white/20"><div className="h-full bg-[#19c6c9] transition-all" style={{ width: `${progress}%` }} /></div><div className="mt-6 grid grid-cols-2 gap-3 text-xs"><span>{plan.totalFloors} configured levels</span><span>{activeFloorCount} in progress</span><span>{completedCount} completed milestones</span><span>{plan.milestones.length - completedCount} remaining</span></div><p className="mt-5 border-t border-white/15 pt-4 text-xs text-white/65">{published ? `Last published ${new Date(published.published_at).toLocaleString()}` : 'No public progress has been published yet.'}</p></div>
        <div className="flex flex-col justify-between border-y border-[#c9c5bd] py-5"><div><p className="eyebrow text-[#087f88]">Configure the building</p><h3 className="mt-2 font-serif text-3xl text-[#123b4b]">{project?.name}</h3><p className="mt-2 text-sm text-slate-500">Ground Floor through {plan.floors[plan.floors.length - 1]?.label ?? 'final floor'}.</p></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="grid gap-1 text-xs text-slate-500">Total floors, including ground floor<input type="number" min="1" max="250" value={plan.totalFloors} onChange={(event) => updatePlan(resizeConstructionPlan(plan, Number(event.target.value) || 1))} className="admin-input" /></label><label className="grid gap-1 text-xs text-slate-500">Floor allocation weight<input type="number" min="0" max="100" step="0.1" value={plan.floorWeight} onChange={(event) => updatePlan({ floorWeight: Math.max(0, Number(event.target.value) || 0) })} className="admin-input" /></label><label className="grid gap-1 text-xs text-slate-500 sm:col-span-2">Current construction phase<input value={plan.currentPhase} onChange={(event) => updatePlan({ currentPhase: event.target.value })} placeholder="For example, structural framework" className="admin-input" /></label><label className="grid gap-1 text-xs text-slate-500 sm:col-span-2">Development timeline<input value={plan.timeline} onChange={(event) => updatePlan({ timeline: event.target.value })} placeholder="Verified start date and target milestones" className="admin-input" /></label></div></div>
      </section>

      <section><div className="flex items-end justify-between gap-4"><div><p className="eyebrow text-[#087f88]">Floor-by-floor</p><h3 className="mt-2 font-serif text-2xl text-[#123b4b]">Building progress</h3></div><p className="text-xs text-slate-500">Select a status to cycle through pending, in progress, and complete.</p></div><div className="mt-4 grid gap-x-6 border-t border-[#c9c5bd] sm:grid-cols-2 lg:grid-cols-3">{plan.floors.map((floor, index) => <div key={floor.number} className="flex items-center justify-between gap-3 border-b border-[#e6e2da] py-3"><span className="text-sm text-[#123b4b]">{floor.label}</span><StatusButton status={floor.status} label={floor.label} onClick={() => updatePlan({ floors: plan.floors.map((item, itemIndex) => itemIndex === index ? { ...item, status: nextStatus(item.status) } : item) })} /></div>)}</div></section>

      <section><div><p className="eyebrow text-[#087f88]">Weighted milestones</p><h3 className="mt-2 font-serif text-2xl text-[#123b4b]">Construction stages</h3><p className="mt-2 text-sm text-slate-500">Weights set each stage's relative contribution. In-progress work counts as half of its weight.</p></div><div className="mt-4 border-t border-[#c9c5bd]">{plan.milestones.map((milestone, index) => <div key={milestone.id} className="grid gap-3 border-b border-[#e6e2da] py-3 sm:grid-cols-[1fr_auto_auto] sm:items-center"><span className="text-sm text-[#123b4b]">{milestone.title}</span><label className="flex items-center gap-2 text-xs text-slate-500">Weight<input aria-label={`${milestone.title} weight`} type="number" min="0" max="100" step="0.1" value={milestone.weight} onChange={(event) => updatePlan({ milestones: plan.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, weight: Math.max(0, Number(event.target.value) || 0) } : item) })} className="admin-input w-24" /></label><StatusButton status={milestone.status} label={milestone.title} onClick={() => updatePlan({ milestones: plan.milestones.map((item, itemIndex) => itemIndex === index ? { ...item, status: nextStatus(item.status) } : item) })} /></div>)}</div></section>

      <section className="grid gap-7 border-y border-[#c9c5bd] py-7 lg:grid-cols-2"><div><p className="eyebrow text-[#087f88]">Project update</p><label className="mt-3 grid gap-2 text-sm text-[#123b4b]">Progress notes<textarea rows={5} maxLength={4000} value={plan.progressNote} onChange={(event) => updatePlan({ progressNote: event.target.value })} placeholder="A clear, factual summary of the latest site work." className="admin-input w-full resize-y" /></label><label className="mt-4 grid gap-2 text-sm text-[#123b4b]">Construction photographs and videos<input type="file" accept="image/*,video/*" multiple onChange={(event) => { void uploadMedia(event.target.files); event.currentTarget.value = ''; }} className="block w-full text-xs text-slate-500 file:mr-3 file:border-0 file:bg-[#eefbf9] file:px-3 file:py-2 file:text-xs file:text-[#087f88]" /></label><div className="mt-4 grid grid-cols-2 gap-3">{plan.media.map((media, index) => <div key={media.url} className="relative">{media.type === 'video' ? <video src={media.url} controls className="aspect-video w-full bg-black object-cover" /> : <img src={media.url} alt={media.caption} className="aspect-video w-full object-cover" />}<span className="mt-1 block truncate text-xs text-slate-500">{media.caption}</span><button type="button" aria-label="Remove media from draft" onClick={() => updatePlan({ media: plan.media.filter((_, mediaIndex) => mediaIndex !== index) })} className="absolute right-2 top-2 bg-white p-1 text-slate-600"><X size={14} /></button></div>)}</div>{plan.media.length === 0 && <p className="mt-3 flex items-center gap-2 text-xs text-slate-400"><ImagePlus size={14} /><Video size={14} />No construction media added.</p>}</div><div className="bg-[#f0ede6] p-5"><p className="eyebrow text-[#087f88]">Review before publishing</p><p className="mt-4 text-sm leading-6 text-slate-600">{plan.progressNote || 'No progress note has been added yet.'}</p><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><span>{plan.milestones.filter((item) => item.status === 'COMPLETED').length} milestones complete</span><span>{plan.floors.filter((item) => item.status === 'COMPLETED').length} floors complete</span><span>{plan.milestones.filter((item) => item.status === 'IN_PROGRESS').length} active milestones</span><span>{plan.floors.filter((item) => item.status === 'PENDING').length} floors pending</span></div><p className="mt-4 border-t border-[#c9c5bd] pt-4 text-xs text-slate-500">{plan.currentPhase ? `Current phase: ${plan.currentPhase}` : 'Current phase not set.'} · Calculated project completion: {progress}%</p></div></section>

      <section><p className="eyebrow text-[#087f88]">Investment information</p><h3 className="mt-2 font-serif text-2xl text-[#123b4b]">Verified facts for the project portal</h3><p className="mt-2 text-sm text-slate-500">Only facts entered here will be shown. Confirm commercial and legal terms with the appropriate advisers before publication.</p><div className="mt-5 grid gap-4 md:grid-cols-2">{investmentFields.map((field) => <label key={field.key} className="grid gap-1.5 text-xs text-slate-500">{field.label}<textarea rows={3} maxLength={2000} value={plan.investment[field.key]} placeholder={field.placeholder} onChange={(event) => updatePlan({ investment: { ...plan.investment, [field.key]: event.target.value } })} className="admin-input resize-y" /></label>)}</div></section>

      <section className="border-t border-[#c9c5bd] pt-6"><div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end"><label className="grid gap-1.5 text-xs text-slate-500">Document title<input value={documentTitle} onChange={(event) => setDocumentTitle(event.target.value)} className="admin-input" placeholder="Approved project information memorandum" /></label><label className="grid gap-1.5 text-xs text-slate-500">Document category<select value={documentCategory} onChange={(event) => setDocumentCategory(event.target.value)} className="admin-input"><option>Investment Information Memorandum</option><option>Project proposal</option><option>Feasibility information</option><option>Development timeline</option><option>Financial information</option><option>Approvals and certifications</option><option>Investment agreement</option><option>Terms and conditions</option><option>Risk disclosures</option><option>Other approved documentation</option></select></label><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={documentPublic} onChange={(event) => setDocumentPublic(event.target.checked)} /> Publicly downloadable when published</label><label className="md:col-span-2"><span className="sr-only">Upload document</span><input type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.ppt,.pptx" onChange={(event) => { void uploadDocument(event.target.files?.[0]); event.currentTarget.value = ''; }} className="block w-full text-xs text-slate-500 file:mr-3 file:border-0 file:bg-[#eefbf9] file:px-3 file:py-2 file:text-xs file:text-[#087f88]" /></label></div><div className="mt-5 divide-y divide-[#e6e2da] border-y border-[#c9c5bd]">{documents.map((document) => <div key={document.storage_path} className="flex flex-col justify-between gap-3 py-3 sm:flex-row sm:items-center"><div><p className="text-sm text-[#123b4b]">{document.title}</p><p className="mt-1 text-xs text-slate-500">{document.category} · {document.is_public ? 'Public' : 'Restricted'}</p></div><button type="button" onClick={() => void toggleDocumentPublished(document)} className="flex items-center gap-2 self-start text-xs text-[#087f88]">{document.is_published ? <Eye size={14} /> : <Circle size={14} />}{document.is_published ? 'Published' : 'Draft, publish'}</button></div>)}{documents.length === 0 && <p className="py-4 text-xs text-slate-500">No investment documents uploaded.</p>}</div></section>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#c9c5bd] bg-[#f0ede6]/95 py-4 backdrop-blur"><p className="text-xs text-slate-500">{published ? `Live: ${calculateConstructionProgress(published.data)}% · ${new Date(published.published_at).toLocaleString()}` : 'No published progress'}{!canPublish && ' · Ask an administrator to publish the reviewed draft.'}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={saving} onClick={() => void saveDraft()} className="btn-secondary disabled:opacity-50"><Save size={15} />{saving ? 'Saving...' : 'Save draft'}</button>{canPublish && <button type="button" disabled={saving} onClick={() => void publish()} className="btn-primary disabled:opacity-50"><Send size={15} />{saving ? 'Publishing...' : 'Publish progress'}</button>}</div></div>
    </>}
  </div>;
}
