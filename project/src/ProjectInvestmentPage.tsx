import { FormEvent, useCallback, useEffect, useState } from 'react';
import { ArrowRight, Check, Download, FileText, MapPin, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Project } from '@/lib/types';
import { calculateConstructionProgress, EMPTY_INVESTMENT_INFORMATION, type ConstructionPlanData, type PublishedConstructionProgress } from '@/lib/construction';

type InvestmentDocument = { id: string; title: string; category: string; storage_path: string; is_public: boolean; is_published: boolean; document_ref?: string; verification_code?: string; content_hash?: string | null };

function infoRows(information: ConstructionPlanData['investment']) {
  return [
    ['Developer', 'Next Bridge Group Limited'],
    ['Development stage', information.developmentStage],
    ['Number and type of units', information.unitSummary],
    ['Minimum investment', information.minimumInvestment],
    ['Expected investment timeline', information.investmentTimeline],
    ['How funds are used', information.useOfFunds],
    ['Project budget', information.projectBudget],
    ['Development costs', information.developmentCosts],
    ['Funding requirements', information.fundingRequirements],
    ['Participation structure', information.participationStructure],
    ['Relevant risks', information.risks],
    ['Applicable fees', information.fees],
    ['Exit, repayment, or distribution structure', information.distributions],
    ['Legal and regulatory information', information.legalInformation],
    ['Required investor documentation', information.requiredDocuments],
  ].filter((row): row is [string, string] => Boolean(row[1]?.trim()));
}

export default function ProjectInvestmentPage({ projectId, navigate }: { projectId: string; navigate: (view: 'projects' | 'home') => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [published, setPublished] = useState<PublishedConstructionProgress | null>(null);
  const [documents, setDocuments] = useState<InvestmentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [referenceCode, setReferenceCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [projectResult, progressResult, documentResult] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).eq('is_published', true).maybeSingle(),
      supabase.from('published_construction_progress').select('*').eq('project_id', projectId).maybeSingle(),
      supabase.from('project_investment_documents').select('id,title,category,storage_path,is_public,is_published,document_ref,verification_code,content_hash').eq('project_id', projectId).eq('is_published', true).order('created_at', { ascending: false }),
    ]);
    if (projectResult.error || progressResult.error || documentResult.error) setError('Project information is temporarily unavailable. Please try again.');
    setProject((projectResult.data ?? null) as Project | null);
    setPublished((progressResult.data ?? null) as PublishedConstructionProgress | null);
    setDocuments((documentResult.data ?? []) as InvestmentDocument[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
    const channel = supabase.channel(`investment-project-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'published_construction_progress', filter: `project_id=eq.${projectId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, projectId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    const consent = form.get('consent') === 'on';
    if (!consent) {
      setFormError('Consent to be contacted is required before sending your enquiry.');
      setSubmitting(false);
      return;
    }
    const { data: generatedReference, error: insertError } = await supabase.rpc('submit_public_investment_enquiry', {
      p_project_id: projectId,
      p_name: String(form.get('name') || '').trim(),
      p_email: String(form.get('email') || '').trim().toLowerCase(),
      p_phone: String(form.get('phone') || '').trim(),
      p_range: String(form.get('range') || ''),
      p_structure: String(form.get('structure') || ''),
      p_message: String(form.get('message') || '').trim(),
      p_consent: true,
    });
    if (insertError) setFormError('We could not record your interest just now. Please use the contact details below to reach the NBG team.');
    else {
      setReferenceCode(String(generatedReference));
      setSubmitted(true);
    }
    setSubmitting(false);
  };

  if (loading) return <main className="min-h-[70vh] bg-[#f4f1eb] px-6 pb-20 pt-36"><div className="mx-auto max-w-5xl text-sm text-slate-500">Loading verified project information...</div></main>;
  if (error || !project) return <main className="min-h-[70vh] bg-[#f4f1eb] px-6 pb-20 pt-36"><div className="mx-auto max-w-5xl border-y border-[#c9c5bd] py-10"><p className="eyebrow text-[#087f88]">Investment information</p><h1 className="mt-4 font-serif text-4xl text-[#123b4b]">{error ? 'Project details are temporarily unavailable.' : 'This project is not published.'}</h1>{error && <button onClick={() => void load()} className="link-arrow mt-5">Try again <ArrowRight size={16} /></button>}<button onClick={() => navigate('projects')} className="link-arrow mt-5">Back to projects <ArrowRight size={16} /></button></div></main>;

  const plan = published?.data ?? null;
  const information = plan?.investment ?? EMPTY_INVESTMENT_INFORMATION;
  const rows = infoRows(information);
  const progress = plan ? calculateConstructionProgress(plan) : null;

  return <main className="min-h-screen bg-[#f4f1eb] pb-24 pt-32 text-[#17232b]">
    <header className="mx-auto max-w-[1360px] px-5 md:px-8"><p className="eyebrow text-[#087f88]">Project investment information</p><div className="mt-5 grid gap-8 lg:grid-cols-[1.1fr_.9fr] lg:items-end"><div><h1 className="font-serif text-5xl leading-none text-[#123b4b] md:text-7xl">{project.name}<br /><em>the opportunity.</em></h1><p className="mt-6 flex items-center gap-2 text-sm text-slate-500"><MapPin size={16} className="text-[#087f88]" />{project.location || 'Location to be confirmed'}</p><p className="mt-5 max-w-2xl text-base leading-7 text-slate-600">{project.description || 'Project information will be added as verified details are approved for publication.'}</p></div><div className="border-y border-[#c9c5bd] py-6"><p className="eyebrow text-slate-500">Current development stage</p><p className="mt-3 text-xl text-[#123b4b]">{information.developmentStage || project.status || 'Not yet published'}</p><div className="mt-6 flex items-end justify-between"><p className="text-xs text-slate-500">Construction progress</p><span className="font-serif text-5xl text-[#087f88]">{progress === null ? '—' : `${progress}%`}</span></div><div className="mt-3 h-1.5 bg-[#d9f6f3]"><div className="h-full bg-[#19c6c9]" style={{ width: `${progress ?? 0}%` }} /></div><p className="mt-3 text-xs text-slate-500">{plan ? `${plan.totalFloors} floors · Published ${new Date(published!.published_at).toLocaleDateString()}` : 'Verified construction progress has not been published.'}</p></div></div></header>

    <div className="mx-auto mt-16 grid max-w-[1360px] gap-16 px-5 md:px-8 lg:grid-cols-[1fr_.72fr]">
      <div className="space-y-16">
        <section><p className="eyebrow text-[#087f88]">Project facts</p><h2 className="mt-3 font-serif text-4xl text-[#123b4b]">Information, clearly stated.</h2><div className="mt-6 border-y border-[#c9c5bd]">{rows.length ? rows.map(([label, value]) => <div key={label} className="grid gap-2 border-b border-[#e6e2da] py-4 last:border-0 sm:grid-cols-[.8fr_1.2fr]"><p className="text-xs uppercase tracking-[.08em] text-slate-500">{label}</p><p className="whitespace-pre-line text-sm leading-6 text-[#315a62]">{value}</p></div>) : <p className="py-6 text-sm leading-6 text-slate-500">Detailed investment terms are not yet available. Contact NBG for verified information. No minimum investment, funding target, or participation terms have been supplied for publication.</p>}</div></section>

        <section><p className="eyebrow text-[#087f88]">Delivery overview</p><h2 className="mt-3 font-serif text-4xl text-[#123b4b]">Progress and milestones.</h2>{plan ? <><p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">{plan.progressNote || 'The project team has not added a latest progress note.'}</p><div className="mt-6 grid gap-x-8 border-y border-[#c9c5bd] sm:grid-cols-2">{plan.milestones.map((milestone) => <div key={milestone.id} className="flex items-center justify-between gap-3 border-b border-[#e6e2da] py-3"><span className="text-sm text-[#123b4b]">{milestone.title}</span><span className={`text-xs ${milestone.status === 'COMPLETED' ? 'text-[#2e6b3e]' : milestone.status === 'IN_PROGRESS' ? 'text-[#2e5f7a]' : 'text-slate-400'}`}>{milestone.status === 'COMPLETED' ? 'Complete' : milestone.status === 'IN_PROGRESS' ? 'In progress' : 'Upcoming'}</span></div>)}</div><p className="mt-4 text-xs text-slate-500">Timeline: {plan.timeline || project.expected_completion || 'To be confirmed'}</p></> : <p className="mt-4 text-sm text-slate-500">No published construction plan is currently available.</p>}</section>

        <section><p className="eyebrow text-[#087f88]">Approved documents</p><h2 className="mt-3 font-serif text-4xl text-[#123b4b]">Project materials.</h2>{documents.length ? <div className="mt-5 divide-y divide-[#e6e2da] border-y border-[#c9c5bd]">{documents.map((document) => <InvestmentDocumentLink key={document.id} document={document} />)}</div> : <p className="mt-4 text-sm leading-6 text-slate-500">No public investment documents are available yet. Confidential materials are shared only with authorized recipients.</p>}</section>
      </div>

      <aside className="lg:sticky lg:top-28 lg:self-start"><section className="bg-[#0d4055] p-6 text-white md:p-8"><p className="eyebrow text-[#8de7e2]">Express investment interest</p><h2 className="mt-4 font-serif text-4xl">Start a conversation.</h2>{submitted ? <div className="mt-7 border-t border-white/20 pt-6"><Check size={24} className="text-[#8de7e2]" /><p className="mt-3 text-sm leading-6 text-white/80">Your interest has been sent to the NBG team. This enquiry is not an offer, reservation, or investment commitment.</p><p className="mt-4 border-t border-white/15 pt-4 text-xs text-white/65">Enquiry reference: <strong className="text-white">{referenceCode}</strong></p></div> : <form onSubmit={submit} className="mt-6 grid gap-4"><label className="grid gap-1.5 text-xs text-white/70">Full name<input required minLength={2} maxLength={160} name="name" autoComplete="name" className="border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-[#8de7e2]" /></label><label className="grid gap-1.5 text-xs text-white/70">Email<input required type="email" name="email" autoComplete="email" maxLength={254} className="border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-[#8de7e2]" /></label><label className="grid gap-1.5 text-xs text-white/70">Phone<input required type="tel" name="phone" autoComplete="tel" maxLength={40} className="border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-[#8de7e2]" /></label><label className="grid gap-1.5 text-xs text-white/70">Indicative investment range<select name="range" className="border border-white/20 bg-[#123b4b] px-3 py-2.5 text-sm text-white outline-none"><option value="">Not specified</option><option>Under KSh 1 million</option><option>KSh 1–5 million</option><option>KSh 5–10 million</option><option>KSh 10–25 million</option><option>Over KSh 25 million</option><option>Prefer to discuss</option></select></label><label className="grid gap-1.5 text-xs text-white/70">Preferred investment structure<select name="structure" className="border border-white/20 bg-[#123b4b] px-3 py-2.5 text-sm text-white outline-none"><option value="">Not specified</option><option>Direct property purchase</option><option>Equity participation</option><option>Debt or structured finance</option><option>Joint venture</option><option>Prefer to discuss</option></select></label><label className="grid gap-1.5 text-xs text-white/70">Message<textarea name="message" rows={3} maxLength={2000} className="resize-y border border-white/20 bg-white/10 px-3 py-2.5 text-sm text-white outline-none focus:border-[#8de7e2]" /></label><label className="flex items-start gap-2 text-xs leading-5 text-white/70"><input required type="checkbox" name="consent" className="mt-1 accent-[#19c6c9]" />I consent to Next Bridge Group contacting me about this enquiry and handling my information in line with its privacy terms.</label>{formError && <p role="alert" className="text-xs text-[#ffc8b9]">{formError}</p>}<button disabled={submitting} className="btn-primary justify-center disabled:opacity-60">{submitting ? 'Sending...' : 'Express investment interest'} <ArrowRight size={16} /></button></form>}</section><p className="mt-5 flex items-start gap-2 text-xs leading-5 text-slate-500"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#087f88]" />Project and investment information is subject to verification and change. An enquiry creates no offer or commitment. Investment involves risk, including possible loss of capital; obtain independent legal and financial advice.</p><p className="mt-4 text-xs text-slate-500">Contact: <a href="mailto:hello@nextbridgegroup.com" className="text-[#087f88]">hello@nextbridgegroup.com</a> · <a href="tel:+254741121575" className="text-[#087f88]">+254 741 121 575</a></p></aside>
    </div>
    {submitted && <div className="mx-auto mt-6 max-w-[1360px] px-5 md:px-8"><a href={`/verify/${encodeURIComponent(referenceCode)}`} className="link-arrow">Track enquiry · {referenceCode} <ArrowRight size={16} /></a></div>}
  </main>;
}

function InvestmentDocumentLink({ document }: { document: InvestmentDocument }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);
  useEffect(() => {
    void supabase.storage.from('investment-documents').createSignedUrl(document.storage_path, 120).then(({ data, error: signedUrlError }) => {
      if (signedUrlError || !data?.signedUrl) setError(true);
      else setUrl(data.signedUrl);
    });
  }, [document.storage_path]);
  return <div className="flex items-center justify-between gap-4 py-4"><div className="flex items-center gap-3"><FileText size={18} className="text-[#087f88]" /><div><p className="text-sm text-[#123b4b]">{document.title}</p><p className="mt-1 text-xs text-slate-500">{document.category}</p>{document.verification_code && <a href={`/verify/${encodeURIComponent(document.verification_code)}`} className="mt-1 inline-block font-mono text-[10px] text-[#087f88] underline">Verify · {document.verification_code}</a>}</div></div>{url ? <a href={url} target="_blank" rel="noreferrer" className="text-[#087f88]" aria-label={`Download ${document.title}`}><Download size={17} /></a> : <span className="text-xs text-slate-400">{error ? 'Unavailable' : 'Loading'}</span>}</div>;
}
