import { useEffect, useState } from 'react';
import { Download, ExternalLink, FileText } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { supabase } from '@/lib/supabase';

type ProjectFile = { title: string; category: string; storage_path: string; verification_code?: string | null; document_ref?: string | null };
export type PublicProjectDetails = {
  id: string;
  name: string;
  location: string | null;
  locality?: string | null;
  county?: string | null;
  country?: string | null;
  status: string;
  description: string | null;
  image_url?: string | null;
  price_min?: number | null;
  price_max?: number | null;
  amenities?: string[] | null;
  floor_plan_url?: string | null;
  brochure_url?: string | null;
  expected_completion?: string | null;
  investment_information?: Record<string, unknown> | null;
  construction_progress?: Record<string, unknown> | null;
  documents?: ProjectFile[];
};

export default function ProjectDetailsPackage({ details, trackingCode }: { details: PublicProjectDetails; trackingCode?: string }) {
  const [fileUrls, setFileUrls] = useState<Record<string, string>>({});
  const place = [details.location, details.locality, details.county, details.country].filter(Boolean).join(', ');
  const price = details.price_min != null || details.price_max != null
    ? [details.price_min, details.price_max].filter((value) => value != null).map((value) => `KES ${Number(value).toLocaleString()}`).join(' - ')
    : 'Contact NBG for current pricing';
  const investmentRows = Object.entries(details.investment_information ?? {}).filter(([, value]) => value != null && String(value).trim());
  const construction = details.construction_progress as { currentPhase?: string; progressNote?: string; timeline?: string; totalFloors?: number } | null;

  useEffect(() => {
    let active = true;
    void Promise.all((details.documents ?? []).map(async (document) => {
      const { data } = await supabase.storage.from('investment-documents').createSignedUrl(document.storage_path, 300);
      return [document.storage_path, data?.signedUrl ?? ''] as const;
    })).then((entries) => {
      if (active) setFileUrls(Object.fromEntries(entries));
    });
    return () => { active = false; };
  }, [details.documents]);

  const downloadPdf = () => {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
    const left = 18;
    const right = 192;
    let y = 20;
    const write = (label: string, value: unknown) => {
      const lines = pdf.splitTextToSize(String(value || 'Not provided'), right - left - 4);
      const required = lines.length * 5 + 11;
      if (y + required > 275) { pdf.addPage(); y = 20; }
      pdf.setTextColor(8, 127, 136); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.text(label.toUpperCase(), left, y);
      y += 5;
      pdf.setTextColor(36, 54, 60); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10); pdf.text(lines, left, y);
      y += lines.length * 5 + 6;
    };

    pdf.setFillColor(13, 64, 85); pdf.rect(0, 0, 210, 34, 'F');
    pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.text('NEXT BRIDGE GROUP LIMITED', left, 16);
    pdf.setTextColor(141, 231, 226); pdf.setFontSize(8); pdf.text('PROJECT DETAILS', left, 24);
    y = 47;
    pdf.setTextColor(18, 59, 75); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(20); pdf.text(pdf.splitTextToSize(details.name, right - left), left, y);
    y += 12;
    write('Location', place);
    write('Development status', details.status);
    write('Price range', price);
    write('Expected completion', details.expected_completion);
    if (construction?.currentPhase) write('Current construction phase', construction.currentPhase);
    if (construction?.timeline) write('Published construction timeline', construction.timeline);
    if (construction?.progressNote) write('Construction update', construction.progressNote);
    write('Project overview', details.description);
    if (details.amenities?.length) write('Amenities', details.amenities.join(', '));
    investmentRows.forEach(([label, value]) => write(label.replace(/[A-Z]/g, (letter) => ` ${letter}`).trim(), value));
    if (trackingCode) write('Enquiry reference', trackingCode);
    pdf.setDrawColor(25, 198, 201); pdf.line(left, 282, right, 282);
    pdf.setTextColor(90, 86, 77); pdf.setFontSize(7); pdf.text('NBG project information · Confirm current details with an authorized NBG representative.', left, 288);
    pdf.save(`${details.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-project-details.pdf`);
  };

  return <section className="mt-6 border border-[#a9d9d8] bg-white p-5 md:p-7">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="eyebrow text-[#087f88]">Project details shared by NBG</p><h3 className="mt-2 font-serif text-3xl text-[#123b4b]">{details.name}</h3><p className="mt-2 text-sm text-slate-500">{place || 'Location to be confirmed'} · {details.status}</p></div>
      <button type="button" onClick={downloadPdf} className="btn-secondary !px-3 !py-2"><Download size={15} /> Download PDF</button>
    </div>
    {details.description && <p className="mt-5 max-w-3xl whitespace-pre-line text-sm leading-6 text-slate-600">{details.description}</p>}
    <div className="mt-5 grid gap-4 border-y border-[#e6e2da] py-5 sm:grid-cols-2"><div><p className="eyebrow text-slate-500">Price range</p><p className="mt-1 text-sm text-[#123b4b]">{price}</p></div><div><p className="eyebrow text-slate-500">Expected completion</p><p className="mt-1 text-sm text-[#123b4b]">{details.expected_completion || 'To be confirmed'}</p></div></div>
    {(construction?.currentPhase || construction?.progressNote || construction?.timeline) && <div className="mt-5 border-b border-[#e6e2da] pb-5"><p className="eyebrow text-slate-500">Published construction update</p>{construction.currentPhase && <p className="mt-2 text-sm font-semibold text-[#123b4b]">{construction.currentPhase}{construction.totalFloors ? ` · ${construction.totalFloors} floors` : ''}</p>}{construction.progressNote && <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-600">{construction.progressNote}</p>}{construction.timeline && <p className="mt-2 text-xs text-slate-500">Timeline: {construction.timeline}</p>}</div>}
    {details.amenities?.length ? <div className="mt-5"><p className="eyebrow text-slate-500">Amenities</p><p className="mt-2 text-sm leading-6 text-slate-600">{details.amenities.join(' · ')}</p></div> : null}
    {(details.brochure_url || details.floor_plan_url) && <div className="mt-5 flex flex-wrap gap-4 text-xs font-semibold text-[#087f88]">{details.brochure_url && <a href={details.brochure_url} target="_blank" rel="noreferrer" className="underline">Preview project brochure</a>}{details.floor_plan_url && <a href={details.floor_plan_url} target="_blank" rel="noreferrer" className="underline">Preview floor plan</a>}</div>}
    {investmentRows.length > 0 && <dl className="mt-5 divide-y divide-[#e6e2da] border-y border-[#e6e2da]">{investmentRows.map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[.7fr_1.3fr]"><dt className="text-xs text-slate-500">{label.replace(/[A-Z]/g, (letter) => ` ${letter}`).trim()}</dt><dd className="whitespace-pre-line text-sm text-[#315a62]">{String(value)}</dd></div>)}</dl>}
    {(details.documents ?? []).length > 0 && <div className="mt-5"><p className="eyebrow text-slate-500">Published project documents</p><div className="mt-2 divide-y divide-[#e6e2da]">{details.documents?.map((document) => <div key={document.storage_path} className="flex items-center justify-between gap-3 py-3"><span className="flex min-w-0 items-center gap-2 text-sm text-[#123b4b]"><FileText size={15} className="shrink-0 text-[#087f88]" /><span className="truncate">{document.title} · {document.category}</span></span>{fileUrls[document.storage_path] ? <a href={fileUrls[document.storage_path]} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#087f88] underline"><ExternalLink size={13} />Preview / download</a> : <span className="text-xs text-slate-400">Preparing link</span>}</div>)}</div></div>}
    {trackingCode && <p className="mt-5 border-t border-[#e6e2da] pt-4 font-mono text-[10px] text-slate-400">Enquiry reference: {trackingCode}</p>}
  </section>;
}
