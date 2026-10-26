import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Award, BarChart3, Building2, CalendarDays, Calculator, Check, ChevronDown, ChevronLeft, ChevronRight, CircleCheck, ClipboardList, Clock3, Construction, CreditCard, Download, DollarSign, Eye, EyeOff, ExternalLink, FileDown, FileText, Info, LayoutDashboard, LogOut, Mail, MapPin, Menu, MessageCircle, MoreHorizontal, MoreVertical, Pencil, Phone, Plus, RefreshCw, Search, Send, ShieldCheck, SlidersHorizontal, TrendingUp, Trash2, Upload, Users, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { resetPassword, signIn, type AdminUser } from '@/lib/auth';
import { COMMISSION_STATUS_COLORS, COMMISSION_STATUSES, INVESTMENT_STATUS_COLORS, INVESTMENT_STATUSES, LEAD_STATUSES, LEAD_STATUS_COLORS, PROJECT_STATUSES, REALTOR_STATUS_COLORS, REALTOR_STATUSES, SALE_STATUS_COLORS, SALE_STATUSES, UNIT_STATUSES, fmtKes, type AuditLog, type BuyerInstallment, type Commission, type ConstructionUpdate, type Investment, type Lead, type Project, type ProjectUnit, type Realtor, type Sale } from '@/lib/types';
import LocationMap from '@/LocationMap';
import { DOCUMENT_TEMPLATES, DOCUMENT_TYPE_OPTIONS, getDocumentTemplate, type DocumentField, type DocumentType } from '@/lib/document-engine';
import ConstructionPlanTab from '@/ConstructionPlanTab';
import CurrencyInput from '@/CurrencyInput';
import { formatAccountingCurrency, formatMoneyInput, parseMoney } from '@/lib/format';
import { FinancialPrivacyToggle, useFinancialPrivacy } from '@/lib/financial-privacy';
import DashboardInbox from '@/DashboardInbox';
import { createVerifiedPdf, downloadPdf } from '@/lib/verified-pdf';
import { FinanceDepartmentDashboard, ITDepartmentDashboard, ProjectManagementDashboard } from '@/DepartmentDashboards';
import HRWorkforceDashboard from '@/HRWorkforceDashboard';
import { canAccessDashboardTab, canManageDashboardRoles, canManageFinancialRecords, canManageProjectRecords, dashboardTabsForRole, defaultDashboardTab, type DashboardTab } from '@/lib/dashboard-access';

type AdminTab = DashboardTab;
type BuyerProfileMatch = { user_id: string; full_name: string | null; phone: string | null; email: string | null };
type ApplicationStatus = 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'ON_HOLD' | 'WITHDRAWN';
type ApplicationRow = {
  key: string;
  id: string;
  reference: string;
  kind: 'realtor' | 'investment';
  name: string;
  email: string | null;
  phone: string | null;
  interest: string;
  detail: string;
  region: string;
  status: ApplicationStatus;
  rawStatus: string;
  createdAt: string;
  notes: string | null;
};
type InvestmentReviewHistory = { id: string; investment_id: string; from_status: string; to_status: string; decision_notes: string; amount_committed: number | null; actor_id: string | null; actor_email: string | null; created_at: string };
const LEAD_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
const LEAD_ACTIONS = ['Call lead', 'Send project details', 'Schedule viewing', 'Send quotation', 'Follow up', 'No action'];
const UNIT_TYPES = ['1 Bedroom', '2 Bedroom', '3 Bedroom', '3 Bedroom + DSQ', '4 Bedroom', 'Penthouse', 'Commercial'];
const FLOOR_OPTIONS = Array.from({ length: 30 }, (_, index) => String(index + 1));
const PARKING_OPTIONS = ['No parking', '1 space', '2 spaces', '3 spaces', '4 spaces'];
const VIEW_OPTIONS = ['Garden view', 'Pool view', 'Sea view', 'Ocean view', 'City view', 'Courtyard view'];
const PAYMENT_METHODS = ['BANK_TRANSFER', 'MPESA', 'CASH', 'CARD', 'OTHER'];
function kenyaCalendarDate() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const SECTION_GUIDES: Record<AdminTab, { purpose: string; source: string; recording: string }> = {
  overview: { purpose: 'Quick health check across leads, sales, units, investments, realtors, and commissions.', source: 'Aggregates data from the operational Supabase tables.', recording: 'Values refresh when the dashboard loads.' },
  hr: { purpose: 'Review staff accounts and assign department dashboards.', source: 'Reads a restricted staff directory from Supabase.', recording: 'Role changes are performed by an audited admin-only function.' },
  leads: { purpose: 'Manage enquiries from first contact through conversion or loss.', source: 'Reads and updates the leads table; public forms create new leads.', recording: 'Statuses, owners, next actions, notes, and follow-up dates are saved per lead.' },
  finance: { purpose: 'Monitor collections, sales, and investment commitments.', source: 'Reads sales, buyer payments, and investments in realtime.', recording: 'Transactions remain recorded in the platform ledgers.' },
  sales: { purpose: 'Record reservations, deposits, completed sales, and buyer payment plans.', source: 'Reads and writes sales, project_units, and buyer_installments.', recording: 'Sale details and installment schedules are stored with audit events.' },
  payments: { purpose: 'Track buyer repayments, balances, due dates, and overdue installments.', source: 'Reads sales, buyer_installments, and buyer_payments.', recording: 'Each repayment stores amount, date, method, reference, and actor.' },
  units: { purpose: 'Manage inventory, pricing, availability, publication, and unit media.', source: 'Reads and writes project_units and public-media storage.', recording: 'Unit changes and uploads are logged; unit numbers are generated by floor.' },
  applications: { purpose: 'Review client submissions for realtor registration and investment interest before approval.', source: 'Reads realtor and investment records, then updates status for approval workflows.', recording: 'Status changes are stored with each application and surfaced to the client portal.' },
  realtors: { purpose: 'Register agents, maintain profiles, and manage active status.', source: 'Reads and writes the realtors table.', recording: 'Profile edits and status changes are captured in the audit trail.' },
  commissions: { purpose: 'Review and approve realtor earnings from linked sales.', source: 'Reads commissions, realtors, and sales.', recording: 'Amounts are enforced at 3% for linked sales and payout status is tracked.' },
  investments: { purpose: 'Track investor interest, commitment stage, amount, and follow-up.', source: 'Reads and writes the investments table; public interest forms can insert records.', recording: 'Status changes and investor records are auditable.' },
  projects: { purpose: 'Publish developments, descriptions, locations, status, and hero media.', source: 'Reads and writes projects and public-media storage.', recording: 'Publication changes, edits, deletes, and uploads are logged.' },
  project_management: { purpose: 'Monitor projects, inventory, and construction delivery.', source: 'Reads live projects, units, and construction updates.', recording: 'Changes are made in the linked project, unit, and update workspaces.' },
  construction: { purpose: 'Configure floors, weighted stages, draft progress, and approved public snapshots.', source: 'Reads and writes project_construction_plans; publishes via an admin-only database function.', recording: 'Draft and published snapshots are recorded in the audit trail.' },
  updates: { purpose: 'Publish construction progress notes, percentages, and site imagery.', source: 'Reads and writes construction_updates and public-media storage.', recording: 'Each update edit, deletion, and media change is recorded.' },
  calculator: { purpose: 'Estimate deposits, balances, monthly payments, and 3% commission.', source: 'Uses values entered in the calculator; it does not write database records.', recording: 'Calculations are private estimates until a sale or commission is saved.' },
  vault: { purpose: 'Review recorded unit prices, construction costs, commissions, collections, and estimated margins.', source: 'Combines unit_financials, sales, commissions, and buyer_payments.', recording: 'Unit costs are restricted to owners and admins; projections exclude costs not recorded here.' },
  audit: { purpose: 'Review the complete history of operational changes and export a report.', source: 'Reads audit_logs generated by database triggers.', recording: 'Insert, update, and delete events include actor, timestamp, category, and data snapshots.' },
  it: { purpose: 'Review platform audit events and access-control activity.', source: 'Reads a restricted realtime view of audit events.', recording: 'System changes are logged by database triggers.' },
  documents: { purpose: 'Upload and manage private client agreements, receipts, brochures, and floor plans.', source: 'Reads client_documents and private document storage.', recording: 'Document uploads and removals are restricted and auditable.' },
  support: { purpose: 'Review client portal requests, reply securely, and track resolution.', source: 'Reads and updates client_support_tickets; clients see replies in their portal.', recording: 'Replies and status changes are saved to the client request and trigger realtime refresh.' },
};

function notifyAdmin(message: string, type: 'success' | 'error' = 'success') {
  window.dispatchEvent(new CustomEvent('nbg-admin-toast', { detail: { message, type } }));
}

function createLeadContactDraft(lead: Lead) {
  const topic = [lead.project, lead.apartment_type, lead.unit ? `Unit ${lead.unit}` : null].filter(Boolean).join(' · ') || 'your property enquiry';
  const subject = `Following up: ${topic}`;
  const body = [
    `Hello ${lead.name},`,
    '',
    `Thank you for contacting Next Bridge Group about ${topic}.`,
    ...(lead.message ? [`You mentioned: “${lead.message}”`] : []),
    ...(lead.action_project_id && lead.tracking_code ? [`Review the project details NBG shared with you: ${window.location.origin}/verify/${encodeURIComponent(lead.tracking_code)}`] : []),
    '',
    'Would you like us to share current availability or help arrange a viewing?',
    '',
    'Kind regards,',
    'Next Bridge Group',
  ].join('\n');
  return { subject, body };
}

async function downloadReportPdf(filename: string, headers: string[], rows: (string | number | null | undefined)[][], title?: string) {
  const documentTitle = title || filename.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  try {
    const { blob } = await createVerifiedPdf(documentTitle, 'ADMIN_REPORT', rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index]]))));
    downloadPdf(blob, filename);
  } catch (error) {
    notifyAdmin(error instanceof Error ? `PDF export failed: ${error.message}` : 'PDF export failed.', 'error');
  }
}

async function exportAuditPdf(logs: AuditLog[], category: string, action: string) {
  await downloadReportPdf(`nbg-audit-trail-${new Date().toISOString().slice(0, 10)}.pdf`, ['Time', 'Category', 'Action', 'Record', 'Actor', 'Filters'], logs.map((log) => [fmt(log.created_at), log.category, log.action, log.entity_label || log.entity_type, log.actor_email || 'anonymous', `${category} / ${action}`]), 'NBG Audit Trail');
}

const WA = '254741121575';

async function uploadPublicMedia(file: File, folder: 'projects' | 'units' | 'updates') {
  const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const path = `${folder}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from('public-media').upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(error.message || 'Storage upload failed');
  return supabase.storage.from('public-media').getPublicUrl(path).data.publicUrl;
}

async function uploadPrivateDocument(file: Blob, filename: string) {
  const path = `${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
  const { error } = await supabase.storage.from('client-documents').upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw new Error(error.message || 'Document upload failed');
  return path;
}

async function loadLogoDataUrl() {
  const response = await fetch('/NBG_LOGO-removebg-preview.png');
  const blob = await response.blob();
  return new Promise<string>((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(String(reader.result)); reader.readAsDataURL(blob); });
}

async function sha256Blob(blob: Blob) {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function documentIdentity(kind: string) {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const token = crypto.randomUUID().replace(/-/g, '').toUpperCase();
  return { documentRef: `NBG-${kind.slice(0, 4).toUpperCase()}-${date}-${token}` };
}

async function allocateDocumentVerificationCode() {
  const { data, error } = await supabase.rpc('next_document_verification_code');
  if (error || !data) throw new Error(error?.message || 'Could not reserve a unique document verification code. Apply the document verification migration first.');
  return String(data);
}

function productionDocumentBody(kind: string, details: string, amount: string) {
  const sections: Record<string, string> = {
    AGREEMENT: 'PARTIES AND TRANSACTION\nThis agreement records the selected property transaction, the purchaser, the unit, the agreed consideration, reservation status, deposit, balance, and payment schedule.\n\nCOMMERCIAL TERMS\nThe parties must confirm title, approvals, due diligence, completion obligations, handover conditions, default remedies, notices, governing law, and execution before relying on this document.',
    RECEIPT: 'PAYMENT EVIDENCE\nThis receipt confirms the payment recorded by NBG, including the payment date, method, reference, payer, amount, and allocation.\n\nRECONCILIATION\nFinance should reconcile this receipt to the related sale, installment, bank or mobile-money statement, and buyer ledger. This receipt is evidence of money received and is not by itself a transfer of title.',
    CLIENT_INVOICE: 'INVOICE DETAILS\nThis invoice itemizes the supplied client charges, quantity, unit rates, applicable tax, total due, issue date, due date, project, and payment terms.\n\nPAYMENT NOTICE\nPlease use the invoice number as your payment reference. Contact NBG finance if any billed item or tax amount needs clarification.',
    QUOTATION: 'SCOPE AND PRICING\nThis quotation identifies the requested construction works or materials, pricing basis, currency, taxes, validity period, assumptions, exclusions, delivery requirements, and payment terms.\n\nACCEPTANCE CONTROL\nAcceptance should be signed by an authorized NBG representative and the customer or project sponsor before procurement or mobilization. Variations require written approval.',
    PURCHASE_ORDER: 'ORDER INSTRUCTION\nThis purchase order authorizes a supplier to provide the specified construction goods or services at the agreed price, quantity, delivery location, delivery date, quality standard, and payment terms.\n\nCONTROL CHECKS\nAccounts payable should match this order to the supplier invoice and approved delivery note before payment. Unauthorized substitutions, price changes, and split deliveries require written approval.',
    SUPPLIER_INVOICE: 'TAX AND PAYMENT CLAIM\nThis supplier invoice records the supplier identity, tax details, invoice number, taxable value, tax amount, gross amount, currency, purchase order, delivery evidence, due date, and payment instructions.\n\nPAYMENT REVIEW\nThe invoice must be checked against the purchase order, delivery note, contract, tax requirements, and supplier bank confirmation before approval.',
    PAYMENT_VOUCHER: 'PAYMENT AUTHORIZATION\nThis voucher requests or records an approved payment to a named payee for a stated business purpose, supported by the source invoice, purchase order, delivery evidence, project, account classification, amount, tax treatment, and payment method.\n\nAPPROVAL TRAIL\nPreparation, review, authorization, payment release, and posting should be performed by appropriately segregated personnel.',
    DELIVERY_NOTE: 'DELIVERY AND CUSTODY RECORD\nThis delivery note records the dispatching supplier, receiving project, vehicle or dispatch reference, delivery date, item description, quantity, unit, condition, batch or serial information, and receiving officer.\n\nINSPECTION OUTCOME\nThe receiver must record accepted, rejected, short, damaged, or back-ordered items and sign with date. A signed delivery note supports inventory, invoice matching, and site custody.',
    CONSTRUCTION_CONTRACT: 'CONTRACT PARTICULARS\nThis contract summary identifies the parties, project, scope, drawings and specifications, contract price, programme, payment milestones, retention, insurance, bonds, warranties, defects obligations, and applicable law.\n\nDELIVERY GOVERNANCE\nHealth and safety, environmental controls, quality assurance, reporting, variations, extensions of time, suspension, termination, dispute resolution, confidentiality, and signatory authority must be agreed in the executed contract.',
    BROCHURE: 'PROJECT INFORMATION\nThis brochure presents the named NBG development, its verified location, category, amenities, availability context, construction status, and contact route.\n\nIMPORTANT NOTICE\nImages, prices, availability, completion dates, dimensions, and renderings are subject to verification and change. A brochure is marketing information and does not create a reservation, sale, warranty, or financing commitment.',
    FLOOR_PLAN: 'PLAN SCHEDULE\nThis floor plan identifies the project, unit, property type, bedroom count, floor, approximate size, parking or view information, orientation where supplied, and the spaces represented in the drawing.\n\nPLAN NOTICE\nDimensions are indicative unless certified by the appointed consultant. Final construction, statutory approvals, services, finishes, and sale documentation take precedence over this illustrative plan.',
  };
  const heading = sections[kind] || 'DOCUMENT PURPOSE\nThis NBG document records the selected business event and the supporting information supplied at issue.';
  return `${heading}\n\nRECORDED DETAILS\n${details || 'No additional details were supplied.'}${amount ? `\n\nFINANCIAL SUMMARY\nDocument amount: ${amount}` : ''}`;
}

async function generateBrandedPdf(kind: string, title: string, recipient: string, details: string, amount: string, forcedDocumentRef: string, verificationCode: string) {
  const [{ GState, jsPDF }, { default: QRCode }] = await Promise.all([import('jspdf'), import('qrcode')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const logo = await loadLogoDataUrl();
  const verificationUrl = `${window.location.origin}/verify/${encodeURIComponent(verificationCode)}`;
  const verificationQr = await QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: 'M', margin: 1, width: 256 });
  const fallbackIdentity = documentIdentity(kind);
  const documentRef = forcedDocumentRef || fallbackIdentity.documentRef;
  const left = 16;
  const right = 194;
  const contentWidth = 178;
  const footerTop = 270;
  const compactLayout = ['AGREEMENT', 'CLIENT_INVOICE', 'PURCHASE_ORDER', 'FLOOR_PLAN'].includes(kind);
  const headerTitle = ({ AGREEMENT: 'Sale agreement', CLIENT_INVOICE: 'Invoice', PURCHASE_ORDER: 'Purchase order', FLOOR_PLAN: 'Floor plan' } as Record<string, string>)[kind] || title;
  const snapshotMarker = 'SYSTEM SNAPSHOT\n';
  let readableDetails = details;
  let documentSnapshot: Record<string, unknown> | null = null;
  const snapshotIndex = details.indexOf(snapshotMarker);
  if (snapshotIndex >= 0) {
    try {
      const parsed = JSON.parse(details.slice(snapshotIndex + snapshotMarker.length));
      documentSnapshot = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
      const flatten = (value: unknown, prefix = ''): string[] => {
        if (value == null || value === '') return [];
        if (Array.isArray(value)) return value.flatMap((item, index) => flatten(item, `${prefix} ${index + 1}`.trim()));
        if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) => flatten(nested, prefix ? `${prefix} / ${key}` : key));
        return [`${prefix}: ${String(value)}`];
      };
      readableDetails = flatten(parsed).join('\n');
    } catch {
      readableDetails = details.slice(0, snapshotIndex).trim();
    }
  }
  const drawHeader = () => {
    if (compactLayout) {
      pdf.setTextColor(31, 58, 52); pdf.setFont('times', 'normal'); pdf.setFontSize(12); pdf.text('NEXT BRIDGE GROUP LIMITED', left, 15);
      pdf.setTextColor(93, 102, 99); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.text('NYALI, MOMBASA, KENYA', left, 21);
      pdf.setTextColor(31, 58, 52); pdf.setFont('times', 'normal'); pdf.setFontSize(17); pdf.text(headerTitle, right, 16, { align: 'right' });
      pdf.setTextColor(93, 102, 99); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.text(`Ref ${documentRef}`, right, 23, { align: 'right' });
      pdf.setDrawColor(31, 58, 52); pdf.setLineWidth(.55); pdf.line(left, 29, right, 29);
      pdf.setLineWidth(.2); pdf.line(left, 30.5, right, 30.5);
      return;
    }
    pdf.addImage(logo, 'PNG', left, 10, 16, 16);
    pdf.setTextColor(31, 58, 52); pdf.setFont('times', 'bold'); pdf.setFontSize(12); pdf.text('NEXT BRIDGE GROUP LIMITED', 36, 16);
    pdf.setTextColor(93, 102, 99); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.text('BUILDING HOMES · CREATING LEGACIES', 36, 22);
    pdf.setDrawColor(31, 58, 52); pdf.setLineWidth(.55); pdf.line(left, 34, right, 34);
    pdf.setDrawColor(176, 141, 87); pdf.setLineWidth(.2); pdf.line(left, 35.5, right, 35.5);
  };
  const drawWatermark = () => {
    pdf.setGState(new GState({ opacity: 0.055 }));
    pdf.addImage(logo, 'PNG', 67, 105, 76, 76);
    pdf.setGState(new GState({ opacity: 1 }));
    pdf.setTextColor(31, 58, 52);
    pdf.setFont('times', 'bold');
    pdf.setFontSize(20);
    pdf.text('VERIFIED COPY', 105, 166, { align: 'center', angle: 42 });
    pdf.setFont('helvetica', 'normal');
  };
  const drawFooter = () => {
    const page = pdf.getCurrentPageInfo().pageNumber;
    pdf.setDrawColor(31, 58, 52); pdf.setLineWidth(.45); pdf.line(left, footerTop, right, footerTop);
    pdf.setDrawColor(176, 141, 87); pdf.setLineWidth(.2); pdf.line(left, footerTop + 1.5, right, footerTop + 1.5);
    pdf.addImage(logo, 'PNG', left, footerTop + 4, 11, 11);
    pdf.setTextColor(93, 102, 99); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
    pdf.text(`NBG confidential · ${documentRef} · Page ${page}`, left + 15, footerTop + 8);
    pdf.text(`Verify online: /verify/${verificationCode}`, left + 15, footerTop + 13);
    pdf.addImage(verificationQr, 'PNG', right - 15, footerTop + 3, 15, 15);
  };
  const ensureSpace = (y: number, height: number) => { if (y + height > footerTop - 6) { drawFooter(); pdf.addPage(); drawHeader(); drawWatermark(); return 48; } return y; };
  drawHeader();
  if (!compactLayout) drawWatermark();
  let y = 42;
  if (!compactLayout) {
    pdf.setTextColor(31, 58, 52); pdf.setFont('times', 'bold'); pdf.setFontSize(22); const titleLines = pdf.splitTextToSize(title, contentWidth); pdf.text(titleLines, left, 52);
    y = 52 + titleLines.length * 8;
    pdf.setTextColor(93, 102, 99); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.text(`DOCUMENT NUMBER  ${documentRef}`, left, y); pdf.text(`ISSUED  ${new Date().toLocaleDateString('en-KE')}`, right, y, { align: 'right' }); y += 7;
    pdf.text(`Prepared for: ${recipient || 'NBG client'}`, left, y); if (amount) pdf.text(`Amount: KSh ${Number(amount).toLocaleString()}`, left + 82, y); y += 12;
  }
  const sourceData = documentSnapshot?.document_data && typeof documentSnapshot.document_data === 'object' ? documentSnapshot.document_data as Record<string, unknown> : {};
  const getValue = (key: string, fallback = 'Not specified') => String(sourceData[key] ?? fallback);
  const currency = getValue('currency', 'KES');
  const money = (value: unknown) => `${currency} ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const drawMetadata = (entries: [string, string][]) => {
    const columns = Math.min(3, Math.max(1, entries.length));
    const rowCount = Math.ceil(entries.length / columns);
    const rowHeight = 17;
    y = ensureSpace(y, rowCount * rowHeight + 7);
    pdf.setFillColor(244, 241, 234); pdf.setDrawColor(216, 212, 202); pdf.setLineWidth(.2);
    pdf.rect(left, y, contentWidth, rowCount * rowHeight + 5, 'FD');
    entries.forEach(([label, value], index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = left + 4 + column * (contentWidth / columns);
      const top = y + 5 + row * rowHeight;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.8); pdf.setTextColor(93, 102, 99);
      pdf.text(label.toUpperCase(), x, top);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(28, 35, 33);
      pdf.text(pdf.splitTextToSize(value || 'Not specified', contentWidth / columns - 8).slice(0, 2), x, top + 8);
    });
    y += rowCount * rowHeight + 10;
  };
  const drawSectionHeading = (heading: string) => {
    y = ensureSpace(y, 13);
    pdf.setFont('times', 'bold'); pdf.setFontSize(12); pdf.setTextColor(31, 58, 52);
    pdf.text(heading, left, y);
    pdf.setDrawColor(176, 141, 87); pdf.setLineWidth(.25); pdf.line(left, y + 2, right, y + 2);
    y += 8;
  };
  const renderLedger = (heading: string, itemValue: unknown, itemLabel: string) => {
    const items = Array.isArray(itemValue) ? itemValue.map((item) => typeof item === 'object' && item !== null ? item as Record<string, unknown> : { description: String(item) }) : [];
    drawSectionHeading(heading);
    const drawTableHead = () => {
      pdf.setFillColor(31, 58, 52); pdf.rect(left, y, contentWidth, 8, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.setTextColor(255, 255, 255);
      pdf.text(itemLabel.toUpperCase(), left + 3, y + 5.2);
      pdf.text('QTY', left + 119, y + 5.2, { align: 'right' });
      pdf.text('UNIT RATE', left + 148, y + 5.2, { align: 'right' });
      pdf.text('AMOUNT', right - 3, y + 5.2, { align: 'right' });
      y += 8;
    };
    drawTableHead();
    items.forEach((item, index) => {
      const description = String(item.description ?? item.name ?? item.item ?? `${itemLabel} ${index + 1}`);
      const subline = String(item.details ?? item.code ?? item.notes ?? '');
      const lines = pdf.splitTextToSize([description, subline].filter(Boolean).join('\n'), 103);
      const rowHeight = Math.max(10, lines.length * 3.8 + 4);
      if (y + rowHeight > footerTop - 20) { drawFooter(); pdf.addPage(); drawHeader(); drawWatermark(); y = 46; drawTableHead(); }
      if (index % 2 === 0) { pdf.setFillColor(248, 247, 243); pdf.rect(left, y, contentWidth, rowHeight, 'F'); }
      pdf.setDrawColor(216, 212, 202); pdf.setLineWidth(.2); pdf.line(left, y + rowHeight, right, y + rowHeight);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7.2); pdf.setTextColor(28, 35, 33); pdf.text(lines[0] || '', left + 3, y + 5);
      if (lines.length > 1) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.3); pdf.setTextColor(93, 102, 99); pdf.text(lines.slice(1), left + 3, y + 9); }
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(28, 35, 33);
      pdf.text(String(item.quantity ?? item.qty ?? 1), left + 119, y + 5.5, { align: 'right' });
      pdf.text(money(item.unit_price ?? item.rate ?? 0), left + 148, y + 5.5, { align: 'right' });
      pdf.text(money(item.amount ?? item.total ?? Number(item.quantity ?? item.qty ?? 1) * Number(item.unit_price ?? item.rate ?? 0)), right - 3, y + 5.5, { align: 'right' });
      y += rowHeight;
    });
    if (!items.length) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(93, 102, 99);
      pdf.text(`No ${itemLabel.toLowerCase()} were supplied.`, left + 3, y + 6);
      y += 12;
    }
  };
  const drawTotals = (rows: [string, number][], totalLabel: string) => {
    const summaryHeight = rows.length * 6 + 10;
    if (y + summaryHeight > footerTop - 18) { drawFooter(); pdf.addPage(); drawHeader(); drawWatermark(); y = 48; }
    const summaryWidth = 83;
    const summaryX = right - summaryWidth;
    rows.forEach(([label, value]) => {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(93, 102, 99);
      pdf.text(label, summaryX, y + 4);
      pdf.setTextColor(28, 35, 33); pdf.text(money(value), right - 3, y + 4, { align: 'right' });
      y += 6;
    });
    pdf.setFillColor(31, 58, 52); pdf.rect(summaryX - 2, y, summaryWidth + 2, 10, 'F');
    pdf.setFont('times', 'bold'); pdf.setFontSize(10); pdf.setTextColor(255, 255, 255);
    pdf.text(totalLabel, summaryX + 2, y + 6.7);
    pdf.text(money(rows[rows.length - 1]?.[1] ?? 0), right - 3, y + 6.7, { align: 'right' });
    y += 15;
  };
  const drawCompactTotals = (rows: [string, number][], totalLabel: string) => {
    const summaryX = right - 70;
    rows.slice(0, -1).forEach(([label, value]) => {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(45, 55, 60);
      pdf.text(label, summaryX, y + 4.5); pdf.text(money(value), right - 3, y + 4.5, { align: 'right' }); y += 6.5;
      pdf.setDrawColor(216, 212, 202); pdf.setLineWidth(.2); pdf.line(left, y, right, y);
    });
    const total = rows[rows.length - 1];
    if (total) {
      pdf.setFillColor(31, 58, 52); pdf.rect(summaryX - 3, y, right - summaryX + 3, 10, 'F');
      pdf.setFont('times', 'bold'); pdf.setFontSize(10); pdf.setTextColor(255, 255, 255);
      pdf.text(totalLabel, summaryX, y + 6.7); pdf.text(money(total[1]), right - 3, y + 6.7, { align: 'right' }); y += 15;
    }
  };
  const drawCompactSignatures = (labels: string[][]) => {
    const gap = 8;
    const columnWidth = (contentWidth - gap) / 2;
    labels.forEach((row) => {
      row.forEach((label, index) => {
        const x = left + index * (columnWidth + gap);
        pdf.setDrawColor(45, 55, 60); pdf.setLineWidth(.25); pdf.line(x, y, x + columnWidth, y);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.8); pdf.setTextColor(93, 102, 99); pdf.text(label, x, y + 5.5);
      });
      y += 16;
    });
  };

  if (kind === 'AGREEMENT') {
    const buyerName = getValue('buyer_legal_name', recipient);
    const saleData = documentSnapshot?.sale && typeof documentSnapshot.sale === 'object' ? documentSnapshot.sale as Record<string, unknown> : {};
    const price = Number(sourceData.total_purchase_price || saleData.sale_price || amount || 0);
    const schedule = Array.isArray(sourceData.payment_schedule) ? sourceData.payment_schedule as Record<string, unknown>[] : [];
    const deposit = Number(saleData.deposit_amount || schedule[0]?.amount || 0);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(45, 55, 60);
    pdf.text(pdf.splitTextToSize(`This agreement is made on ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })} between Next Bridge Group Limited (the Seller) and ${buyerName} (the Buyer).`, contentWidth), left, y); y += 13;
    pdf.setFont('times', 'normal'); pdf.setFontSize(11); pdf.setTextColor(31, 58, 52); pdf.text('Property', left, y); y += 7;
    const unitData = documentSnapshot?.unit && typeof documentSnapshot.unit === 'object' ? documentSnapshot.unit as Record<string, unknown> : {};
    const bedrooms = unitData.bedrooms ? `${unitData.bedrooms} bedrooms, ` : '';
    const size = sourceData.size ? ` ${sourceData.size},` : '';
    const parking = unitData.parking ? `, ${unitData.parking}` : '';
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(45, 55, 60);
    pdf.text(pdf.splitTextToSize(`${getValue('property_reference', getValue('unit_number'))}, ${getValue('property_type')}, ${bedrooms}${size}${parking}.`, contentWidth), left, y); y += 13;
    pdf.setFont('times', 'normal'); pdf.setFontSize(11); pdf.setTextColor(31, 58, 52); pdf.text('Price and payment', left, y); y += 5;
    const agreementRows: [string, number][] = [['Purchase price', price], ['Deposit due on signing', deposit], ['Balance due on completion', Math.max(0, price - deposit)]];
    agreementRows.forEach(([label, value]) => {
      y += 5; pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(45, 55, 60); pdf.text(label, left + 2, y);
      pdf.text(money(value), right - 2, y, { align: 'right' }); pdf.setDrawColor(216, 212, 202); pdf.line(left, y + 4, right, y + 4); y += 4;
    });
    y += 5; pdf.setFont('times', 'normal'); pdf.setFontSize(11); pdf.setTextColor(31, 58, 52); pdf.text('Terms', left, y); y += 7;
    const terms = [
      getValue('title_legal_information', 'The Seller confirms good title, free of encumbrances.'),
      'Vacant possession is given on payment of the full balance.',
      getValue('default_termination', 'If the Buyer defaults, the Seller may retain the deposit after written notice, subject to the executed sale contract.'),
      'If the Seller defaults, the deposit is refunded in full within 14 days.',
      getValue('taxes_and_costs', 'Rates and utilities are apportioned to the date of possession.'),
      getValue('dispute_resolution', 'This agreement is governed by the laws of Kenya.'),
    ];
    terms.forEach((term, index) => {
      const lines = pdf.splitTextToSize(`${index + 1}. ${term}`, contentWidth - 4);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.6); pdf.setTextColor(45, 55, 60); pdf.text(lines, left + 2, y); y += Math.max(6, lines.length * 4.2);
    });
    y += 3; drawCompactSignatures([['Seller signature, name, date', 'Buyer signature, name, date'], ['Witness 1', 'Witness 2']]);
  }

  if (kind === 'CLIENT_INVOICE') {
    const clientData = documentSnapshot?.client && typeof documentSnapshot.client === 'object' ? documentSnapshot.client as Record<string, unknown> : {};
    const invoiceItems = Array.isArray(sourceData.invoice_items) ? sourceData.invoice_items.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
    const currency = String(sourceData.currency || 'KES');
    const invoiceMoney = (value: unknown) => `${currency} ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const subtotal = Number(sourceData.subtotal || 0);
    const tax = Number(sourceData.tax_amount || 0);
    const total = Number(sourceData.grand_total || subtotal + tax || amount || 0);
    const third = contentWidth / 3;
    [['Bill to', String(sourceData.client_name || recipient), String(clientData.phone || '')], ['Invoice date', getValue('invoice_date'), String(clientData.email || '')], ['Due date', getValue('due_date'), '']].forEach(([label, value, detail], index) => {
      const x = left + index * third;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(93, 102, 99); pdf.text(label, x, y);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(28, 35, 33); pdf.text(pdf.splitTextToSize(value, third - 5), x, y + 7);
      if (detail) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.text(pdf.splitTextToSize(detail, third - 5), x, y + 13); }
    });
    y += 25;
    const invoiceRows = invoiceItems.map((item) => {
      const quantity = Number(item.quantity || item.qty || 1);
      const rate = Number(item.unit_price || item.rate || 0);
      return [String(item.description || item.name || 'Invoice item'), String(quantity), invoiceMoney(rate), invoiceMoney(item.amount ?? quantity * rate)];
    });
    const columnWidth = contentWidth / 4;
    pdf.setFillColor(31, 58, 52); pdf.rect(left, y, contentWidth, 9, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(255, 255, 255);
    ['Description', 'Qty', 'Rate', 'Amount'].forEach((label, index) => pdf.text(label, index === 0 ? left + 3 : left + (index + 1) * columnWidth - 3, y + 5.8, index ? { align: 'right' } : undefined));
    y += 9;
    invoiceRows.forEach((row) => {
      const descriptionLines = pdf.splitTextToSize(row[0], columnWidth - 7);
      const rowHeight = Math.max(10, descriptionLines.length * 4 + 4);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(28, 35, 33); pdf.text(descriptionLines, left + 3, y + 5.5);
      row.slice(1).forEach((value, index) => pdf.text(value, left + (index + 2) * columnWidth - 3, y + 5.5, { align: 'right' }));
      pdf.setDrawColor(216, 212, 202); pdf.line(left, y + rowHeight, right, y + rowHeight); y += rowHeight;
    });
    y += 2;
    const drawInvoiceTotal = (label: string, value: number, isTotal = false) => {
      if (isTotal) { pdf.setFillColor(31, 58, 52); pdf.rect(right - 68, y, 68, 9, 'F'); pdf.setTextColor(255, 255, 255); pdf.setFont('times', 'bold'); pdf.setFontSize(9); }
      else { pdf.setTextColor(45, 55, 60); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); }
      pdf.text(label, right - 64, y + 6); pdf.text(invoiceMoney(value), right - 3, y + 6, { align: 'right' }); y += isTotal ? 11 : 7;
    };
    drawInvoiceTotal('Subtotal', subtotal); drawInvoiceTotal(`Tax (${getValue('tax_rate', 'applicable')})`, tax); drawInvoiceTotal('Total due', total, true);
    y += 5; pdf.setFont('times', 'normal'); pdf.setFontSize(11); pdf.setTextColor(31, 58, 52); pdf.text('Pay to', left, y); y += 6;
    const paymentText = [sourceData.bank_name, sourceData.account_name, sourceData.account_number ? `Account ${sourceData.account_number}` : '', sourceData.payment_terms].filter(Boolean).join(' · ') || String(sourceData.payment_terms || 'Use the invoice reference when making payment.');
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(93, 102, 99); pdf.text(pdf.splitTextToSize(paymentText, contentWidth), left, y);
  }

  if (kind === 'PURCHASE_ORDER') {
    const third = contentWidth / 3;
    const columns: [string, string, string][] = [
      ['Vendor', getValue('supplier_name', recipient), getValue('supplier_address', '')],
      ['Ship to', getValue('delivery_location'), getValue('delivery_contact', '')],
      ['Order date, delivery', `${new Date().toLocaleDateString('en-GB')} · ${getValue('required_delivery_date')}`, documentRef],
    ];
    columns.forEach(([label, value, detail], index) => {
      const x = left + index * third;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(93, 102, 99); pdf.text(label, x, y);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.setTextColor(28, 35, 33); pdf.text(pdf.splitTextToSize(value, third - 5), x, y + 7);
      if (detail) { pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.text(pdf.splitTextToSize(detail, third - 5), x, y + 13); }
    });
    y += 25;
    const ordered = Array.isArray(sourceData.ordered_items) ? sourceData.ordered_items.map((entry) => typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : { description: String(entry) }) : [];
    const poRows = ordered.map((item) => {
      const quantity = Number(item.quantity || item.qty || 1);
      const rate = Number(item.unit_price || item.rate || 0);
      return [String(item.description || item.name || 'Item'), String(item.code || ''), String(quantity), money(rate), money(item.amount ?? item.total ?? quantity * rate)];
    });
    const widths = [0.39, 0.15, 0.12, 0.15, 0.19];
    pdf.setFillColor(31, 58, 52); pdf.rect(left, y, contentWidth, 9, 'F'); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(255, 255, 255);
    ['Item', 'Code', 'Qty', 'Unit', 'Total'].forEach((label, index) => { const x = left + widths.slice(0, index).reduce((sum, width) => sum + width, 0) * contentWidth; pdf.text(label, index === 0 ? x + 3 : x + widths[index] * contentWidth - 3, y + 5.8, index ? { align: 'right' } : undefined); });
    y += 9;
    poRows.forEach((row) => {
      const firstWidth = widths[0] * contentWidth;
      const lines = pdf.splitTextToSize(row[0], firstWidth - 7);
      const rowHeight = Math.max(10, lines.length * 4 + 4);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(28, 35, 33); pdf.text(lines, left + 3, y + 5.5);
      let x = left + firstWidth;
      row.slice(1).forEach((value, index) => { const width = widths[index + 1] * contentWidth; pdf.text(value, x + width - 3, y + 5.5, { align: 'right' }); x += width; });
      pdf.setDrawColor(216, 212, 202); pdf.line(left, y + rowHeight, right, y + rowHeight); y += rowHeight;
    });
    y += 2; drawCompactTotals([['Subtotal', Number(sourceData.subtotal || 0)], ['Delivery', Number(sourceData.delivery_charges || 0)], ['Order total', Number(sourceData.grand_total || Number(sourceData.subtotal || 0) + Number(sourceData.delivery_charges || 0) + Number(sourceData.tax_amount || 0))]], 'Order total');
    if (y < 222) y = 222;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.2); pdf.setTextColor(93, 102, 99);
    pdf.text(pdf.splitTextToSize(`Payment terms: ${getValue('payment_terms', 'As agreed')}. Goods must match the listed codes. Quote ${documentRef} on delivery notes and invoices.`, contentWidth), left, y); y += 12;
    drawCompactSignatures([['Prepared by', 'Approved by']]);
  }

  if (kind === 'FLOOR_PLAN') {
    const unitData = documentSnapshot?.unit && typeof documentSnapshot.unit === 'object' ? documentSnapshot.unit as Record<string, unknown> : {};
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(93, 102, 99);
    pdf.text(`${getValue('unit_number')} · Scale ${getValue('scale')}`, right, y, { align: 'right' }); y += 5;
    const planUrl = String(sourceData.approved_plan_url || (documentSnapshot?.project as Record<string, unknown> | undefined)?.floor_plan_url || '');
    const planTop = y;
    const planHeight = 158;
    pdf.setFillColor(244, 241, 234); pdf.setDrawColor(216, 212, 202); pdf.rect(left, planTop, contentWidth, planHeight, 'FD');
    let embeddedPlan = false;
    if (planUrl) {
      try {
        const response = await fetch(planUrl);
        const blob = await response.blob();
        const imageType = blob.type.toLowerCase().includes('jpeg') || /\.jpe?g(?:\?|$)/i.test(planUrl) ? 'JPEG' : blob.type.toLowerCase().includes('png') || /\.png(?:\?|$)/i.test(planUrl) ? 'PNG' : '';
        if (response.ok && imageType) {
          const dataUrl = await new Promise<string>((resolve) => { const reader = new FileReader(); reader.onloadend = () => resolve(String(reader.result)); reader.readAsDataURL(blob); });
          const imageSize = pdf.getImageProperties(dataUrl);
          const scale = Math.min((contentWidth - 12) / imageSize.width, (planHeight - 12) / imageSize.height);
          const imageWidth = imageSize.width * scale;
          const imageHeight = imageSize.height * scale;
          pdf.addImage(dataUrl, imageType, left + (contentWidth - imageWidth) / 2, planTop + (planHeight - imageHeight) / 2, imageWidth, imageHeight);
          embeddedPlan = true;
        }
      } catch {
        embeddedPlan = false;
      }
    }
    if (!embeddedPlan) {
      pdf.setFont('times', 'normal'); pdf.setFontSize(13); pdf.setTextColor(31, 58, 52); pdf.text('Approved architectural drawing', left + 8, planTop + 18);
      const detail = planUrl ? 'The approved plan is available at the source link below.' : 'No approved plan file was supplied. Attach the verified architectural drawing before issue.';
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(93, 102, 99); pdf.text(pdf.splitTextToSize(detail, contentWidth - 16), left + 8, planTop + 27);
      if (planUrl) { pdf.setTextColor(8, 127, 136); pdf.text('Open approved plan source', left + 8, planTop + 40); pdf.link(left + 8, planTop + 35, 70, 8, { url: planUrl }); }
    }
    y = planTop + planHeight + 8;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.2); pdf.setTextColor(93, 102, 99);
    const drawingDetails = `${getValue('property_type')} · ${getValue('size')}${unitData.bedrooms ? ` · ${unitData.bedrooms} bedrooms` : ''} · Drawing ${getValue('drawing_number')} · Rev ${getValue('revision_number')}`;
    pdf.text(pdf.splitTextToSize(drawingDetails, contentWidth), left, y); y += 7;
    pdf.text('Dimensions are indicative unless certified by the appointed consultant. Final construction documents take precedence.', left, y);
  }

  const structuredTypes = ['QUOTATION', 'CLIENT_INVOICE', 'RECEIPT', 'PURCHASE_ORDER', 'SUPPLIER_INVOICE', 'DELIVERY_NOTE', 'PAYMENT_VOUCHER', 'BROCHURE', 'FLOOR_PLAN'];
  if (!compactLayout && !structuredTypes.includes(kind)) {
    const body = productionDocumentBody(kind, readableDetails, amount);
    const blocks = body.split(/\n\n+/);
    blocks.forEach((block) => {
      const lines = block.split('\n');
      const heading = lines.shift()?.trim() || '';
      const copy = lines.join('\n').trim();
      y = ensureSpace(y, 14); pdf.setTextColor(31, 58, 52); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold'); pdf.text(heading, left, y); y += 5;
      if (copy) { pdf.setFont('helvetica', 'normal'); pdf.setTextColor(45, 55, 60); pdf.setFontSize(8.5); const copyLines = pdf.splitTextToSize(copy, contentWidth); copyLines.forEach((line: string) => { y = ensureSpace(y, 5); pdf.text(line, left, y); y += 4.2; }); y += 4; }
    });
  }
  if (kind === 'QUOTATION') {
    drawMetadata([
      ['Prepared for', getValue('client_name', recipient)],
      ['Site location', getValue('site_location')],
      ['Quotation date', new Date().toLocaleDateString('en-KE')],
      ['Valid until', getValue('valid_until')],
      ['Document reference', documentRef],
    ]);
    renderLedger('SCOPE AND PRICING', sourceData.scope_items, 'Description');
    const subtotal = Number(sourceData.subtotal || 0);
    const discount = Number(sourceData.discount || 0);
    const tax = Number(sourceData.tax_amount || 0);
    const total = Number(sourceData.grand_total || subtotal - discount + tax || amount || 0);
    drawTotals([['Subtotal', subtotal], ['Discount', -discount], ['Tax', tax], ['Quotation total', total]], 'TOTAL QUOTED');
    [['PAYMENT TERMS', 'payment_terms'], ['EXCLUSIONS AND ASSUMPTIONS', 'exclusions_assumptions'], ['VARIATION PROCEDURE', 'variation_procedure']].forEach(([heading, key]) => {
      if (!sourceData[key]) return;
      drawSectionHeading(heading);
      const lines = pdf.splitTextToSize(String(sourceData[key]), contentWidth);
      lines.forEach((line: string) => { y = ensureSpace(y, 5); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(45, 55, 60); pdf.text(line, left, y); y += 4.2; });
      y += 3;
    });
  }

  if (kind === 'PURCHASE_ORDER' && !compactLayout) {
    drawMetadata([
      ['Vendor', getValue('supplier_name', recipient)],
      ['Vendor tax number', getValue('supplier_tax_number')],
      ['Ship to', getValue('delivery_location')],
      ['Order date', new Date().toLocaleDateString('en-KE')],
      ['Required delivery', getValue('required_delivery_date')],
      ['Approval authority', getValue('approval_authority')],
    ]);
    renderLedger('ORDERED ITEMS', sourceData.ordered_items, 'Item');
    const subtotal = Number(sourceData.subtotal || 0);
    const delivery = Number(sourceData.delivery_charges || 0);
    const tax = Number(sourceData.tax_amount || 0);
    const total = Number(sourceData.grand_total || subtotal + delivery + tax || amount || 0);
    drawTotals([['Subtotal', subtotal], ['Delivery', delivery], ['Tax', tax], ['Order total', total]], 'ORDER TOTAL');
    drawSectionHeading('AUTHORIZATION');
    const approvalText = `Prepared by: ${getValue('prepared_by', 'NBG procurement')}     Approved by: ${getValue('approval_authority')}`;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(45, 55, 60); pdf.text(pdf.splitTextToSize(approvalText, contentWidth), left, y); y += 12;
    if (sourceData.payment_terms) { drawSectionHeading('PAYMENT TERMS'); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.text(pdf.splitTextToSize(String(sourceData.payment_terms), contentWidth), left, y); y += 10; }
  }

  if (kind === 'SUPPLIER_INVOICE') {
    drawMetadata([
      ['Supplier', getValue('supplier_name', recipient)],
      ['Supplier invoice number', getValue('invoice_number')],
      ['Invoice date', getValue('invoice_date')],
      ['Due date', getValue('due_date')],
      ['Purchase order', getValue('purchase_order_number')],
      ['Delivery note', getValue('delivery_note_number')],
    ]);
    renderLedger('INVOICE ITEMS', sourceData.invoice_items, 'Description');
    const subtotal = Number(sourceData.subtotal || 0);
    const tax = Number(sourceData.tax_amount || 0);
    const total = Number(sourceData.grand_total || subtotal + tax || amount || 0);
    drawTotals([['Subtotal', subtotal], ['Tax', tax], ['Invoice total', total]], 'TOTAL CLAIMED');
    if (sourceData.verification_result) {
      drawSectionHeading('VERIFICATION RESULT');
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(45, 55, 60);
      pdf.text(pdf.splitTextToSize(String(sourceData.verification_result), contentWidth), left, y); y += 12;
    }
  }

  if (kind === 'DELIVERY_NOTE') {
    drawMetadata([
      ['Supplier', getValue('supplier_name', recipient)],
      ['Purchase order', getValue('po_number')],
      ['Delivery date', getValue('delivery_date')],
      ['Delivery site', getValue('site')],
      ['Vehicle registration', getValue('vehicle_registration')],
      ['Quality status', getValue('quality_status')],
    ]);
    const materials = Array.isArray(sourceData.materials) ? sourceData.materials : [];
    drawSectionHeading('MATERIALS RECEIVED');
    const drawMaterialsHeader = () => {
      pdf.setFillColor(31, 58, 52); pdf.rect(left, y, contentWidth, 8, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.setTextColor(255, 255, 255);
      pdf.text('DESCRIPTION / CODE', left + 3, y + 5.2); pdf.text('QUANTITY', right - 3, y + 5.2, { align: 'right' });
      y += 8;
    };
    drawMaterialsHeader();
    materials.forEach((entry, index) => {
      const item = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : { description: String(entry) };
      const label = [item.description || item.name || `Material ${index + 1}`, item.code].filter(Boolean).join(' · ');
      const height = 10;
      if (y + height > footerTop - 20) { drawFooter(); pdf.addPage(); drawHeader(); drawWatermark(); y = 46; drawMaterialsHeader(); }
      if (index % 2 === 0) { pdf.setFillColor(248, 247, 243); pdf.rect(left, y, contentWidth, height, 'F'); }
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.2); pdf.setTextColor(28, 35, 33);
      pdf.text(pdf.splitTextToSize(String(label), 130), left + 3, y + 6);
      pdf.text(String(item.quantity ?? item.qty ?? '—'), right - 3, y + 6, { align: 'right' });
      pdf.setDrawColor(216, 212, 202); pdf.line(left, y + height, right, y + height); y += height;
    });
    drawMetadata([['Quantity rejected', getValue('quantity_rejected', '0')], ['Received by', getValue('receiver_name')], ['Rejection reason', getValue('rejection_reason')]]);
    drawSectionHeading('RECEIPT CONFIRMATION');
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(45, 55, 60);
    pdf.text('Materials and quantities listed above are subject to physical inspection and acceptance by the authorized receiver.', left, y); y += 14;
    pdf.setDrawColor(28, 35, 33); pdf.line(left, y + 8, left + 72, y + 8); pdf.line(right - 72, y + 8, right, y + 8);
    pdf.setTextColor(93, 102, 99); pdf.setFontSize(6.5); pdf.text('Supplier representative', left, y + 12); pdf.text('NBG receiver', right - 72, y + 12);
  }

  if (kind === 'PAYMENT_VOUCHER') {
    drawMetadata([
      ['Payee', getValue('payee_name', recipient)],
      ['Payment status', getValue('payment_status')],
      ['Account code', getValue('account_code')],
      ['Cost centre', getValue('cost_centre')],
      ['Currency', currency],
      ['Supporting document', getValue('supporting_document')],
    ]);
    drawSectionHeading('PAYMENT PURPOSE');
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(28, 35, 33);
    pdf.text(pdf.splitTextToSize(getValue('payment_reason'), contentWidth), left, y); y += 16;
    const voucherAmount = Number(sourceData.amount || amount || 0);
    drawTotals([['Withholding tax', Number(sourceData.withholding_tax || 0)], ['Payment amount', voucherAmount]], 'AUTHORIZED AMOUNT');
    drawMetadata([['Authorized by', getValue('authorized_by')], ['Payment status', getValue('payment_status')]]);
    pdf.setDrawColor(28, 35, 33); pdf.line(left, y + 8, left + 72, y + 8); pdf.line(right - 72, y + 8, right, y + 8);
    pdf.setTextColor(93, 102, 99); pdf.setFontSize(6.5); pdf.text('Prepared by', left, y + 12); pdf.text('Approved by', right - 72, y + 12);
  }

  if (kind === 'RECEIPT') {
    drawMetadata([
      ['Received from', getValue('customer_name', recipient)],
      ['Receipt number', documentRef],
      ['Date received', getValue('payment_date', new Date().toLocaleDateString('en-KE'))],
      ['Payment method', getValue('payment_method')],
      ['Transaction reference', getValue('transaction_reference')],
      ['Allocation', getValue('payment_allocation')],
    ]);
    drawSectionHeading('PAYMENT RECEIVED');
    pdf.setFillColor(244, 241, 234); pdf.setDrawColor(216, 212, 202); pdf.rect(left, y, contentWidth, 14, 'FD');
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(93, 102, 99); pdf.text(getValue('description', 'Verified payment'), left + 4, y + 8.5);
    pdf.setFont('times', 'bold'); pdf.setFontSize(15); pdf.setTextColor(31, 58, 52); pdf.text(money(sourceData.amount_received || amount), right - 4, y + 9, { align: 'right' });
    y += 21;
    pdf.setDrawColor(31, 58, 52); pdf.setLineWidth(.8); pdf.rect(right - 40, y, 40, 14);
    pdf.setFont('times', 'bold'); pdf.setFontSize(12); pdf.setTextColor(31, 58, 52); pdf.text('PAID', right - 20, y + 9, { align: 'center' });
    y += 20;
    drawSectionHeading('RECEIPT CONFIRMATION');
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(45, 55, 60);
    pdf.text('Received with thanks. This receipt is valid only with the corresponding cleared-funds confirmation and transaction reference.', left, y); y += 14;
    pdf.setDrawColor(28, 35, 33); pdf.line(left, y + 8, left + 72, y + 8); pdf.line(right - 72, y + 8, right, y + 8);
    pdf.setTextColor(93, 102, 99); pdf.setFontSize(6.5); pdf.text('Authorized signature', left, y + 12); pdf.text('Finance approval', right - 72, y + 12);
  }

  if (kind === 'BROCHURE') {
    const heroTop = y;
    y = ensureSpace(y, 63);
    pdf.setFillColor(31, 58, 52); pdf.rect(left, y, contentWidth, 52, 'F');
    pdf.setTextColor(209, 173, 115); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5);
    pdf.text(`${getValue('project_status', 'NBG DEVELOPMENT')} · ${getValue('location_information', 'KENYA')}`, left + 6, y + 9);
    pdf.setTextColor(255, 255, 255); pdf.setFont('times', 'bold'); pdf.setFontSize(19);
    const headline = pdf.splitTextToSize(getValue('headline', getValue('project_name', title)), contentWidth - 12);
    pdf.text(headline, left + 6, y + 22);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(238, 239, 232);
    const descriptionLines = pdf.splitTextToSize(getValue('project_description', 'A considered NBG development.'), contentWidth - 12);
    pdf.text(descriptionLines.slice(0, 2), left + 6, y + 37);
    y += 58;
    const features: [string, string][] = [
      ['PROPERTY TYPES', Array.isArray(sourceData.property_types) ? sourceData.property_types.join(', ') : getValue('property_types')],
      ['AMENITIES', Array.isArray(sourceData.amenities) ? sourceData.amenities.join(', ') : getValue('amenities')],
      ['CONTACT', getValue('contact_details')],
    ];
    drawMetadata(features);
    if (sourceData.price_min || sourceData.price_max) {
      const priceLabel = `${currency} ${Number(sourceData.price_min || 0).toLocaleString('en-KE')}${sourceData.price_max ? ` – ${Number(sourceData.price_max).toLocaleString('en-KE')}` : '+'}`;
      pdf.setFillColor(176, 141, 87); pdf.rect(left, y, 58, 10, 'F'); pdf.setFont('times', 'bold'); pdf.setFontSize(9); pdf.setTextColor(28, 35, 33); pdf.text(priceLabel, left + 4, y + 6.7); y += 16;
    }
    if (heroTop === y) y += 1;
  }

  if (kind === 'FLOOR_PLAN' && !compactLayout) {
    drawMetadata([
      ['Project', getValue('project_name', recipient)],
      ['Unit', getValue('unit_number')],
      ['Property type', getValue('property_type')],
      ['Approved size', getValue('size')],
      ['Drawing number', getValue('drawing_number')],
      ['Revision / scale', `${getValue('revision_number')} · ${getValue('scale')}`],
      ['Drawing date', getValue('drawing_date')],
      ['Prepared by', getValue('prepared_by')],
      ['Checked / approved by', [sourceData.checked_by, sourceData.approved_by].filter(Boolean).join(' / ') || 'Not recorded'],
    ]);
    drawSectionHeading('APPROVAL STATUS');
    const isApproved = String(sourceData.draft_notice || '').toUpperCase() === 'APPROVED';
    pdf.setFillColor(isApproved ? 232 : 248, isApproved ? 247 : 241, isApproved ? 238 : 234);
    pdf.rect(left, y, contentWidth, 12, 'F');
    pdf.setFont('times', 'bold'); pdf.setFontSize(10); pdf.setTextColor(31, 58, 52);
    pdf.text(getValue('draft_notice', 'DRAFT / NOT FOR CONSTRUCTION'), left + 4, y + 7.5);
    y += 19;
    drawSectionHeading('APPROVED PLAN SOURCE');
    const planUrl = String(sourceData.approved_plan_url || '');
    const planNotice = planUrl
      ? `Approved drawing source: ${planUrl}. This record preserves the supplied source and does not redraw or alter the approved geometry.`
      : 'No approved plan file was attached to this document record. Add the approved architectural drawing before issuing a construction copy. Dimensions and room geometry are intentionally not fabricated.';
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(45, 55, 60);
    pdf.text(pdf.splitTextToSize(planNotice, contentWidth), left, y);
    y += 20;
  }

  if (kind === 'CLIENT_INVOICE' && !compactLayout) {
    const invoiceItems = Array.isArray(sourceData.invoice_items) ? sourceData.invoice_items.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
    const currency = String(sourceData.currency || 'KES');
    const money = (value: unknown) => `${currency} ${Number(value || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const subtotal = Number(sourceData.subtotal || 0);
    const tax = Number(sourceData.tax_amount || 0);
    const total = Number(sourceData.grand_total || 0);
    y = ensureSpace(y, 51);
    pdf.setFillColor(244, 241, 234); pdf.setDrawColor(216, 212, 202); pdf.rect(left, y, contentWidth, 17, 'FD');
    pdf.setTextColor(90, 86, 77); pdf.setFontSize(7); pdf.text('BILL TO', left + 4, y + 5);
    pdf.setTextColor(18, 59, 75); pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.text(String(sourceData.client_name || recipient), left + 4, y + 11);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.text(`Project: ${String(sourceData.project_name || '—')}   Unit: ${String(sourceData.unit_number || '—')}`, left + 96, y + 8);
    pdf.text(`Issued: ${String(sourceData.invoice_date || '—')}   Due: ${String(sourceData.due_date || '—')}`, left + 96, y + 13);
    y += 23;

    const tableTop = y;
    const drawInvoiceHeader = () => {
      pdf.setFillColor(31, 58, 52); pdf.rect(left, y, contentWidth, 8, 'F');
      pdf.setTextColor(255, 255, 255); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7);
      pdf.text('DESCRIPTION', left + 3, y + 5.3); pdf.text('QTY', left + 113, y + 5.3, { align: 'right' }); pdf.text('UNIT RATE', left + 145, y + 5.3, { align: 'right' }); pdf.text('AMOUNT', right - 3, y + 5.3, { align: 'right' });
      y += 8; pdf.setFont('helvetica', 'normal');
    };
    drawInvoiceHeader();
    invoiceItems.forEach((item, index) => {
      const description = String(item.description || 'Invoice item');
      const lines = pdf.splitTextToSize(description, 102);
      const rowHeight = Math.max(9, lines.length * 4 + 4);
      if (y + rowHeight > footerTop - 20) { drawFooter(); pdf.addPage(); drawHeader(); drawWatermark(); y = 46; drawInvoiceHeader(); }
      if (index % 2 === 0) { pdf.setFillColor(248, 247, 243); pdf.rect(left, y, contentWidth, rowHeight, 'F'); }
      pdf.setTextColor(45, 55, 60); pdf.setFontSize(7.5); pdf.text(lines, left + 3, y + 5);
      pdf.text(String(item.quantity || 1), left + 113, y + 5, { align: 'right' }); pdf.text(money(item.unit_price), left + 145, y + 5, { align: 'right' }); pdf.text(money(item.amount), right - 3, y + 5, { align: 'right' });
      pdf.setDrawColor(226, 226, 220); pdf.line(left, y + rowHeight, right, y + rowHeight); y += rowHeight;
    });
    if (!invoiceItems.length) { pdf.setTextColor(120, 120, 120); pdf.setFontSize(8); pdf.text('No invoice line items were supplied.', left + 3, y + 7); y += 12; }
    y += 7;
    if (y + 39 > footerTop - 6) { drawFooter(); pdf.addPage(); drawHeader(); drawWatermark(); y = 48; }
    const cardWidth = (contentWidth - 8) / 3;
    [["SUBTOTAL", subtotal], ["TAX", tax], ["TOTAL DUE", total]].forEach(([label, value], index) => {
      const x = left + index * (cardWidth + 4);
      pdf.setFillColor(index === 2 ? 31 : 244, index === 2 ? 58 : 241, index === 2 ? 52 : 234); pdf.setDrawColor(216, 212, 202); pdf.rect(x, y, cardWidth, 17, 'FD');
      pdf.setTextColor(index === 2 ? 209 : 93, index === 2 ? 173 : 102, index === 2 ? 115 : 99); pdf.setFontSize(6.5); pdf.text(String(label), x + 3, y + 5);
      pdf.setTextColor(index === 2 ? 255 : 18, index === 2 ? 255 : 59, index === 2 ? 255 : 75); pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.text(money(value), x + 3, y + 12);
    });
    y += 23;
    const totalTaxed = subtotal + tax;
    pdf.setFillColor(225, 232, 229); pdf.roundedRect(left, y, contentWidth, 4, 2, 2, 'F');
    const subtotalWidth = totalTaxed ? contentWidth * subtotal / totalTaxed : 0;
    if (subtotalWidth > 0) { pdf.setFillColor(25, 166, 156); pdf.roundedRect(left, y, subtotalWidth, 4, 2, 2, 'F'); }
    if (contentWidth - subtotalWidth > 0) { pdf.setFillColor(209, 165, 73); pdf.rect(left + subtotalWidth, y, contentWidth - subtotalWidth, 4, 'F'); }
    y += 7; pdf.setTextColor(90, 86, 77); pdf.setFontSize(6.5); pdf.text(`Subtotal ${money(subtotal)}`, left, y); pdf.text(`Tax ${money(tax)}`, right, y, { align: 'right' });
    y += 9; pdf.setTextColor(45, 55, 60); pdf.setFontSize(7.5); const terms = pdf.splitTextToSize(`Payment terms: ${String(sourceData.payment_terms || 'As agreed with NBG.')}`, contentWidth); pdf.text(terms, left, y);
    y = Math.max(y + terms.length * 4, tableTop + 17);
  }
  if (kind === 'AGREEMENT' && !compactLayout && Array.isArray(sourceData.payment_schedule) && sourceData.payment_schedule.length) {
    y = ensureSpace(y, 22);
    pdf.setTextColor(8, 127, 136); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8); pdf.text('PAYMENT SCHEDULE', left, y); y += 5;
    pdf.setFillColor(13, 64, 85); pdf.rect(left, y, contentWidth, 7, 'F'); pdf.setTextColor(255, 255, 255); pdf.setFontSize(7); pdf.text('MILESTONE', left + 3, y + 4.8); pdf.text('AMOUNT', right - 3, y + 4.8, { align: 'right' }); y += 7;
    (sourceData.payment_schedule as Record<string, unknown>[]).forEach((row, index) => {
      y = ensureSpace(y, 8); if (index % 2 === 0) { pdf.setFillColor(248, 247, 243); pdf.rect(left, y, contentWidth, 8, 'F'); }
      pdf.setTextColor(45, 55, 60); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.text(String(row.description || `Milestone ${index + 1}`), left + 3, y + 5.3); pdf.text(`KES ${Number(row.amount || 0).toLocaleString()}`, right - 3, y + 5.3, { align: 'right' }); y += 8;
    });
  }
  if (!compactLayout) drawFooter();
  const blob = pdf.output('blob');
  return { blob, documentRef, verificationCode, contentHash: await sha256Blob(blob) };
}

function uploadErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : 'An unknown error occurred.';
  if (/bucket|not found/i.test(message)) return 'Private document storage is not configured. Run the client-documents bucket SQL in Supabase, then refresh this page.';
  if (/row-level|permission|policy/i.test(message)) return 'Your account cannot upload private documents. Confirm that your profile role is admin, owner, or staff, then sign in again.';
  return message ? `${/document|column|schema|client_documents/i.test(message) ? 'Document operation' : 'Image upload'} failed: ${message}` : 'Upload failed. Please try again.';
}

// ─── Shell ───────────────────────────────────────────────

type AdminSessionPresenceRow = { session_id: string; user_email: string; region: string | null; country: string | null; first_seen_at: string; last_seen_at: string };

function AdminSessionPresence({ user }: { user: AdminUser }) {
  const [sessions, setSessions] = useState<AdminSessionPresenceRow[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const storageKey = 'nbg-admin-presence-session';
    const sessionId = sessionStorage.getItem(storageKey) || crypto.randomUUID();
    sessionStorage.setItem(storageKey, sessionId);
    let active = true;

    const heartbeat = async (isActive = true) => {
      const { error: presenceError } = await supabase.functions.invoke('admin-session-presence', { body: { session_id: sessionId, active: isActive } });
      if (active) setError(presenceError?.message || '');
    };
    const refresh = async () => {
      const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data, error: loadError } = await supabase.from('admin_session_presence')
        .select('session_id,user_email,region,country,first_seen_at,last_seen_at')
        .gt('last_seen_at', cutoff)
        .order('first_seen_at', { ascending: true });
      if (!active) return;
      if (loadError) setError(loadError.message);
      else setSessions((data ?? []) as AdminSessionPresenceRow[]);
    };

    void heartbeat().then(refresh);
    const heartbeatTimer = window.setInterval(() => { void heartbeat(); }, 60_000);
    const refreshTimer = window.setInterval(() => { void refresh(); }, 30_000);
    return () => {
      active = false;
      window.clearInterval(heartbeatTimer);
      window.clearInterval(refreshTimer);
      void supabase.functions.invoke('admin-session-presence', { body: { session_id: sessionId, active: false } });
    };
  }, [user.id]);

  return <div className="relative">
    <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`${sessions.length} admin sessions currently active`} className="inline-flex h-9 items-center gap-2 border border-[#d8e0df] bg-white px-3 text-xs text-[#123b4b] hover:bg-[#eefbf9]">
      <Users size={15} /> <span>{sessions.length} online</span>
    </button>
    {open && <section aria-label="Active admin sessions" className="absolute right-0 top-full z-50 mt-2 w-[min(340px,calc(100vw-2rem))] border border-[#d8e0df] bg-white p-4 text-[#123b4b] shadow-xl">
      <div className="flex items-center justify-between border-b border-[#e2ded5] pb-3"><div><p className="eyebrow text-[#087f88]">Admin security</p><h2 className="mt-1 text-sm font-semibold">Active sessions · {sessions.length}</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close active sessions" className="grid size-8 place-items-center text-slate-500 hover:bg-[#f4f1eb]"><X size={15} /></button></div>
      {error && <p role="status" className="mt-3 text-xs leading-5 text-[#a55445]">Session monitoring needs setup: deploy its database migration and Edge Function.</p>}
      <ol className="mt-2 divide-y divide-[#eeeae2]">{sessions.map((session, index) => <li key={`${session.session_id}-${session.user_email}`} className="flex items-start gap-3 py-3"><span className="grid size-6 shrink-0 place-items-center bg-[#eefbf9] text-xs font-semibold text-[#087f88]">{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold">{session.user_email}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><MapPin size={11} />{[session.region, session.country].filter(Boolean).join(', ') || 'Region unavailable'}</p><p className="mt-1 text-[10px] text-slate-400">Since {new Date(session.first_seen_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div></li>)}</ol>
      {!sessions.length && !error && <p className="py-4 text-xs text-slate-500">No active sessions are currently reported.</p>}
      <p className="mt-2 border-t border-[#e2ded5] pt-3 text-[10px] leading-4 text-slate-400">Regions are approximate IP-based locations. IP addresses are not stored; inactive sessions expire after two minutes.</p>
    </section>}
  </div>;
}

export default function AdminDashboard({ user, onSignOut }: { user: AdminUser; onSignOut: () => void }) {
  useFinancialPrivacy();
  const allowedTabs = dashboardTabsForRole(user.role);
  const [tab, setTab] = useState<AdminTab>(() => {
    const routeTab = window.location.pathname.match(/^\/dashboard\/([^/]+)$/)?.[1] as AdminTab | undefined;
    const requested = (new URLSearchParams(window.location.search).get('tab') as AdminTab | null) ?? routeTab ?? null;
    return requested && canAccessDashboardTab(user.role, requested) ? requested : defaultDashboardTab(user.role) ?? 'overview';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [leadAlertCount, setLeadAlertCount] = useState(0);
  const [navSearch, setNavSearch] = useState('');
  const [navSearchOpen, setNavSearchOpen] = useState(false);
  const navSearchRef = useRef<HTMLInputElement>(null);
  const isAdmin = canManageDashboardRoles(user.role);
  const canManageFinancials = canManageFinancialRecords(user.role);
  const canManageProjects = canManageProjectRecords(user.role);

  const selectAdminTab = useCallback((destination: AdminTab) => {
    if (!canAccessDashboardTab(user.role, destination)) return;
    setTab(destination);
    setSidebarOpen(false);
    window.history.pushState({}, '', destination === 'overview' ? '/dashboard' : `/dashboard/${destination}`);
    if (destination === 'leads') {
      setLeadAlertCount(0);
      void supabase.from('client_notifications').update({ read_at: new Date().toISOString() }).eq('user_id', user.id).eq('kind', 'LEAD_SLA_ALERT').is('read_at', null);
    }
  }, [user.id, user.role]);

  useEffect(() => {
    const syncTabFromRoute = () => {
      const routeTab = window.location.pathname.match(/^\/dashboard\/([^/]+)$/)?.[1] as AdminTab | undefined;
      const queryTab = new URLSearchParams(window.location.search).get('tab') as AdminTab | null;
      const requested = routeTab ?? queryTab;
      if (requested && canAccessDashboardTab(user.role, requested)) {
        setTab(requested);
        return;
      }
      const fallback = defaultDashboardTab(user.role);
      if (fallback) {
        setTab(fallback);
        if (window.location.pathname === '/dashboard' || window.location.pathname.startsWith('/dashboard/')) {
          window.history.replaceState({}, '', fallback === 'overview' ? '/dashboard' : `/dashboard/${fallback}`);
        }
      }
    };
    syncTabFromRoute();
    window.addEventListener('popstate', syncTabFromRoute);
    return () => window.removeEventListener('popstate', syncTabFromRoute);
  }, [user.role]);

  useEffect(() => {
    if (!allowedTabs.includes(tab)) setTab(defaultDashboardTab(user.role) ?? 'overview');
  }, [allowedTabs, tab, user.role]);

  useEffect(() => {
    const handleToast = (event: Event) => setToast((event as CustomEvent<{ message: string; type: 'success' | 'error' }>).detail);
    const handleInboxNavigation = (event: Event) => {
      const destination = (event as CustomEvent<AdminTab>).detail;
      if (canAccessDashboardTab(user.role, destination)) {
        selectAdminTab(destination);
      }
    };
    window.addEventListener('nbg-admin-toast', handleToast);
    window.addEventListener('nbg-admin-dashboard-navigate', handleInboxNavigation);
    return () => {
      window.removeEventListener('nbg-admin-toast', handleToast);
      window.removeEventListener('nbg-admin-dashboard-navigate', handleInboxNavigation);
    };
  }, [selectAdminTab, user.role]);

  useEffect(() => {
    let active = true;
    const refreshLeadAlertCount = async () => {
      const { count, error } = await supabase.from('client_notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('kind', 'LEAD_SLA_ALERT').is('read_at', null);
      if (active && !error) setLeadAlertCount(count ?? 0);
    };
    void refreshLeadAlertCount();
    const channel = supabase.channel(`admin-lead-alert-count-${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'client_notifications', filter: `user_id=eq.${user.id}` }, () => { void refreshLeadAlertCount(); }).subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [user.id]);

  useEffect(() => {
    if (!toast || toast.type === 'error') return;
    const timeout = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setNavSearchOpen(true);
        navSearchRef.current?.focus();
      }
      if (event.key === 'Escape') setNavSearchOpen(false);
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const allNavItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'main' },
    { id: 'hr', label: 'HR Department', icon: Users, group: 'hr' },
    { id: 'leads', label: 'Leads', icon: Users, group: 'sales' },
    { id: 'finance', label: 'Finance Dashboard', icon: DollarSign, group: 'finance' },
    { id: 'sales', label: 'Sales', icon: DollarSign, group: 'sales' },
    { id: 'payments', label: 'Buyer Payments', icon: CreditCard, group: 'sales' },
    { id: 'units', label: 'Units', icon: Building2, group: 'sales' },
    { id: 'applications', label: 'Applications', icon: ClipboardList, group: 'sales' },
    { id: 'investments', label: 'Investments', icon: TrendingUp, group: 'sales' },
    { id: 'realtors', label: 'Realtors', icon: Award, group: 'agents' },
    { id: 'commissions', label: 'Commissions', icon: DollarSign, group: 'agents' },
    { id: 'project_management', label: 'Project Management', icon: Construction, group: 'project_management' },
    { id: 'projects', label: 'Projects', icon: Construction, group: 'ops' },
    ...(isAdmin ? [{ id: 'construction' as AdminTab, label: 'Construction Journey', icon: BarChart3, group: 'ops' }] : []),
    { id: 'updates', label: 'Site Updates', icon: BarChart3, group: 'ops' },
    { id: 'documents', label: 'Documents', icon: FileText, group: 'ops' },
    { id: 'support', label: 'Client support', icon: MessageCircle, group: 'ops' },
    ...(isAdmin ? [{ id: 'vault' as AdminTab, label: 'Financial Vault', icon: DollarSign, group: 'ops' }] : []),
    { id: 'calculator', label: 'Investment Calculator', icon: Calculator, group: 'ops' },
    { id: 'it', label: 'IT Department', icon: ShieldCheck, group: 'it' },
    ...(isAdmin ? [{ id: 'audit' as AdminTab, label: 'Audit Trail', icon: ClipboardList, group: 'ops' }] : []),
  ] satisfies { id: AdminTab; label: string; icon: typeof LayoutDashboard; group: string }[];
  const navItems = allNavItems.filter(({ id }) => canAccessDashboardTab(user.role, id));

  const groups = [
    { key: 'main', label: '' },
    { key: 'hr', label: 'People' },
    { key: 'sales', label: 'Sales & Pipeline' },
    { key: 'finance', label: 'Finance' },
    { key: 'agents', label: 'Realtors & Agents' },
    { key: 'project_management', label: 'Project Delivery' },
    { key: 'it', label: 'Technology' },
    { key: 'ops', label: 'Operations' },
  ];

  const searchResults = navItems.filter(({ id, label }) => {
    const aliases = id === 'documents' ? 'invoice agreements receipts floor plans' : id === 'payments' ? 'repayments installments transactions' : id === 'units' ? 'homes properties inventory' : '';
    return `${label} ${id} ${aliases}`.toLowerCase().includes(navSearch.trim().toLowerCase());
  }).slice(0, 5);

  const go = (t: AdminTab) => selectAdminTab(t);

  if (!canAccessDashboardTab(user.role, tab)) {
    return <div className="flex min-h-screen items-center justify-center bg-[#f0ede6] p-6 text-center text-[#123b4b]"><section className="max-w-md border border-[#dce3e3] bg-white p-6"><ShieldCheck size={22} className="mx-auto text-[#087f88]" /><h1 className="mt-3 font-serif text-2xl">Access updated</h1><p className="mt-2 text-xs leading-5 text-slate-600">Your dashboard permissions changed. Your assigned workspace is loading.</p></section></div>;
  }

  if (tab === 'hr') {
    return <HRWorkforceDashboard canAssignRoles={isAdmin} user={user} onSignOut={onSignOut} onOpenAdminWorkspace={() => selectAdminTab('overview')} />;
  }

  return (
    <div className="min-h-screen bg-[#f0ede6] font-sans">
      {/* Sidebar */}
      <aside className={`fixed left-0 top-0 z-40 flex h-full w-64 flex-col bg-[#0f8f9f] text-white transition-transform duration-300 md:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex h-[72px] items-center gap-3 border-b border-white/10 px-5">
          <span className="brand-mark brand-mark-inverse"><img src="/NBG_LOGO-removebg-preview.png" alt="Next Bridge Group" /></span>
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
                    className={`mb-0.5 flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-[11px] font-medium tracking-wide transition-all ${tab === id ? 'bg-[#0b8e92] text-white shadow-sm' : 'text-white/75 hover:bg-white/15 hover:text-white'}`}
                  >
                    <Icon size={15} strokeWidth={1.6} />
                    <span className="min-w-0 flex-1">{l}</span>
                    {id === 'leads' && leadAlertCount > 0 && <span className="grid h-5 min-w-5 place-items-center bg-[#a55445] px-1 text-[9px] font-bold text-white" aria-label={`${leadAlertCount} unread lead alerts`}>{leadAlertCount > 99 ? '99+' : leadAlertCount}</span>}
                    {tab === id && <ChevronRight size={12} />}
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
        <header className="sticky top-0 z-20 flex min-h-[72px] flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#c9c5bd] bg-[#f0ede6] px-4 py-3 sm:px-5 md:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <button className="md:hidden" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle menu">
              <Menu size={22} />
            </button>
            <div className="flex min-w-0 items-center gap-2"><h1 className="break-words font-serif text-xl sm:text-2xl">{navItems.find((n) => n.id === tab)?.label ?? 'Dashboard'}</h1><SectionGuide guide={SECTION_GUIDES[tab]} /></div>
          </div>
          <label className="relative hidden min-w-0 max-w-[360px] flex-1 lg:block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input ref={navSearchRef} value={navSearch} onFocus={() => setNavSearchOpen(true)} onChange={(event) => setNavSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && searchResults[0]) { go(searchResults[0].id); setNavSearch(''); setNavSearchOpen(false); } }} aria-label="Search dashboard sections" placeholder="Search payments, units, invoices..." className="h-9 w-full border border-[#d8e0df] bg-white pl-9 pr-14 text-xs text-[#123b4b] outline-none placeholder:text-slate-400 focus:border-[#087f88]" />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 border border-[#e2ded5] px-1.5 py-0.5 text-[9px] text-slate-500">Ctrl K</span>
            {navSearchOpen && navSearch.trim() && <div className="absolute left-0 right-0 top-full z-50 mt-1 border border-[#d8e0df] bg-white p-1 shadow-xl">{searchResults.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => { go(id); setNavSearch(''); setNavSearchOpen(false); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[#123b4b] hover:bg-[#eefbf9]"><Icon size={14} />{label}</button>)}{searchResults.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">No matching dashboard section.</p>}</div>}
          </label>
          <div className="flex max-w-full flex-wrap items-center justify-end gap-2 sm:gap-3">{isAdmin && <DashboardInbox user={user} mode="staff" />}{isAdmin && <AdminSessionPresence user={user} />}<FinancialPrivacyToggle /><div className="hidden items-center gap-2 sm:flex"><span className="grid size-8 place-items-center rounded-full bg-[#0d4055] text-[10px] font-semibold text-white">{(user.full_name || user.email).slice(0, 2).toUpperCase()}</span><span className="max-w-[125px] truncate text-xs text-[#123b4b]">{user.full_name || user.email.split('@')[0]}</span></div><a href={`https://wa.me/${WA}`} target="_blank" rel="noreferrer" aria-label="Contact NBG on WhatsApp" className="grid size-9 place-items-center bg-[#1f8a72] text-white hover:bg-[#176b59] sm:h-9 sm:w-auto sm:gap-2 sm:px-3"><MessageCircle size={16} /><span className="hidden text-[10px] font-bold sm:inline">WhatsApp</span></a></div>
        </header>

        <div className="px-5 py-8 md:px-10 md:py-10">
          {tab === 'overview' && <OverviewTab goTo={go} />}
          {tab === 'leads' && <LeadsTab user={user} />}
          {tab === 'finance' && <FinanceDepartmentDashboard user={user} navigate={go} />}
                    {tab === 'project_management' && <ProjectManagementDashboard navigate={go} />}
                    {tab === 'it' && <ITDepartmentDashboard user={user} />}
          {tab === 'sales' && <SalesTab goTo={go} />}
          {tab === 'payments' && <BuyerPaymentsTab goTo={go} />}
          {tab === 'units' && <UnitsTab canReserve={canManageFinancials} canDelete={isAdmin} />}
          {tab === 'applications' && <ApplicationsTab canManageFinancials={canManageFinancials} includeRealtorApplications={isAdmin} />}
          {tab === 'investments' && <InvestmentsTab canManageFinancials={canManageFinancials} onReview={() => go('applications')} />}
          {tab === 'realtors' && <RealtorsTab />}
          {tab === 'commissions' && <CommissionsTab />}
          {tab === 'projects' && <ProjectsTab canDelete={isAdmin} />}
          {tab === 'construction' && canManageProjects && <ConstructionPlanTab canPublish={canManageProjects} />}
          {tab === 'updates' && <UpdatesTab canDelete={isAdmin} />}
          {tab === 'documents' && <DocumentsTab />}
          {tab === 'support' && <ClientSupportTab />}
          {tab === 'calculator' && <CalculatorTab />}
          {tab === 'vault' && isAdmin && <FinancialVaultTab user={user} goTo={go} />}
          {tab === 'audit' && <AuditTrailTab />}
        </div>
      </div>
      {toast && <div role={toast.type === 'error' ? 'alert' : 'status'} aria-live={toast.type === 'error' ? 'assertive' : 'polite'} aria-atomic="true" className={`fixed inset-x-4 bottom-4 z-[70] mx-auto w-full max-w-md overflow-hidden border bg-white shadow-[0_18px_50px_rgba(23,35,43,.22)] sm:inset-x-auto sm:right-6 sm:bottom-6 ${toast.type === 'error' ? 'border-[#e3b5aa]' : 'border-[#9bcfc4]'}`}>
        <div className={`h-1 ${toast.type === 'error' ? 'bg-[#b85b49]' : 'bg-[#27836d]'}`} />
        <div className="flex items-start gap-3 p-4">
          <span className={`mt-0.5 grid size-9 shrink-0 place-items-center ${toast.type === 'error' ? 'bg-[#fff2ee] text-[#a55445]' : 'bg-[#eaf7f2] text-[#26765f]'}`}>{toast.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} />}</span>
          <div className="min-w-0 flex-1"><p className={`text-[10px] font-bold uppercase tracking-[.16em] ${toast.type === 'error' ? 'text-[#a55445]' : 'text-[#26765f]'}`}>{toast.type === 'error' ? 'Needs attention' : 'Completed'}</p><p className="mt-1 break-words text-sm leading-5 text-[#24383d]">{toast.message}</p></div>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss notification" className="grid size-8 shrink-0 place-items-center text-slate-400 transition hover:bg-[#f0ede6] hover:text-[#123b4b]"><X size={16} /></button>
        </div>
      </div>}
    </div>
  );
}

type VaultFinancial = { unit_id: string; recorded_price: number; construction_cost: number; additional_costs: number; notes: string | null };
type VaultSale = Pick<Sale, 'id' | 'unit_id' | 'unit_number' | 'sale_price' | 'status' | 'sale_date' | 'deposit_amount'>;
type VaultCommission = Pick<Commission, 'sale_id' | 'amount' | 'status'>;
type VaultPayment = { sale_id: string; amount: number };
type VaultDraft = { recorded_price: string; construction_cost: string; additional_costs: string; notes: string };
type PurchasePaymentInstructions = { id: string; bank_name: string; bank_branch: string; account_name: string; account_number: string; swift_code: string; payment_instructions: string; is_published: boolean; is_quotation_default: boolean; display_order: number };
const EMPTY_PAYMENT_ACCOUNT: PurchasePaymentInstructions = { id: '', bank_name: '', bank_branch: '', account_name: '', account_number: '', swift_code: '', payment_instructions: '', is_published: false, is_quotation_default: false, display_order: 0 };

function PurchasePaymentInstructionsPanel({ user }: { user: AdminUser }) {
  const [accounts, setAccounts] = useState<PurchasePaymentInstructions[]>([]);
  const [details, setDetails] = useState<PurchasePaymentInstructions>(EMPTY_PAYMENT_ACCOUNT);
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  const load = useCallback(async (preferredId = editingId) => {
    setLoading(true);
    const { data, error: loadError } = await supabase.from('purchase_payment_accounts').select('*').order('display_order').order('created_at');
    if (loadError) setError(`Payment accounts could not be loaded. Apply the multi-bank payment migration: ${loadError.message}`);
    else {
      const rows = (data ?? []) as PurchasePaymentInstructions[];
      setAccounts(rows);
      const current = rows.find((account) => account.id === preferredId) ?? rows[0];
      setEditingId(current?.id ?? '');
      setDetails(current ?? EMPTY_PAYMENT_ACCOUNT);
    }
    setLoading(false);
  }, [editingId]);

  useEffect(() => { void load(); }, [load]);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved('');
    if (details.is_published && (!details.bank_name.trim() || !details.account_name.trim() || !details.account_number.trim())) {
      setError('Add the verified bank name, account name, and account number before publishing payment instructions.');
      setSaving(false);
      return;
    }
    if (details.is_quotation_default && !details.is_published) {
      setError('Publish this verified bank account before selecting it as the purchase quotation default.');
      setSaving(false);
      return;
    }
    const values = { bank_name: details.bank_name.trim(), bank_branch: details.bank_branch.trim(), account_name: details.account_name.trim(), account_number: details.account_number.trim(), swift_code: details.swift_code.trim(), payment_instructions: details.payment_instructions.trim(), is_published: details.is_published, is_quotation_default: details.is_quotation_default, display_order: details.display_order, updated_by: user.id, updated_at: new Date().toISOString() };
    const { data: savedAccount, error: saveError } = editingId
      ? await supabase.from('purchase_payment_accounts').update(values).eq('id', editingId).select().single()
      : await supabase.from('purchase_payment_accounts').insert(values).select().single();
    setSaving(false);
    if (saveError) { setError(`Payment instructions were not saved: ${saveError.message}`); return; }
    setSaved(details.is_published ? 'Bank account saved and published to client payment instructions.' : 'Bank account saved as a draft and hidden from clients.');
    if (savedAccount) { setEditingId(savedAccount.id); setDetails(savedAccount as PurchasePaymentInstructions); }
    await load(savedAccount?.id);
  };

  const startNewAccount = () => { setEditingId(''); setDetails({ ...EMPTY_PAYMENT_ACCOUNT, display_order: accounts.length }); setSaved(''); setError(''); };
  const removeAccount = async () => {
    if (!editingId || !window.confirm(`Remove ${details.bank_name || 'this bank account'}?`)) return;
    const { error: deleteError } = await supabase.from('purchase_payment_accounts').delete().eq('id', editingId);
    if (deleteError) { setError(`Bank account could not be removed: ${deleteError.message}`); return; }
    const remaining = accounts.filter((account) => account.id !== editingId);
    setAccounts(remaining);
    setEditingId(remaining[0]?.id || '');
    setDetails(remaining[0] || EMPTY_PAYMENT_ACCOUNT);
    setSaved('Bank account removed.');
  };

  const update = (key: keyof PurchasePaymentInstructions, value: string | boolean | number) => setDetails((current) => ({ ...current, [key]: value, ...(key === 'is_published' && value === false ? { is_quotation_default: false } : {}) }));
  return <section className="border border-[#a9d9a8] bg-white p-5 md:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><Building2 className="mt-1 text-[#087f88]" /><div><p className="eyebrow text-[#087f88]">Client payment setup</p><h2 className="mt-2 font-serif text-2xl text-[#123b4b]">Official bank instructions</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Choose which verified accounts clients can see and exactly one account for purchase quotations.</p></div></div><button type="button" onClick={startNewAccount} className="btn-secondary"><Plus size={14} />Add bank account</button></div>{loading ? <p className="mt-5 text-sm text-slate-500">Loading payment accounts...</p> : <div className="mt-5 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"><nav aria-label="Bank accounts" className="grid content-start gap-2">{accounts.map((account) => <button key={account.id} type="button" onClick={() => { setEditingId(account.id); setDetails(account); setError(''); setSaved(''); }} aria-current={editingId === account.id ? 'true' : undefined} className={`border p-3 text-left ${editingId === account.id ? 'border-[#087f88] bg-[#eefbf9]' : 'border-[#e2ded5] bg-white'}`}><span className="block text-xs font-semibold text-[#123b4b]">{account.bank_name}</span><span className="mt-1 block text-[10px] text-slate-500">{account.account_name} · {account.is_published ? 'Published' : 'Draft'}{account.is_quotation_default ? ' · Quotation default' : ''}</span></button>)}{accounts.length === 0 && <p className="border border-dashed border-[#c9c5bd] p-4 text-xs text-slate-500">No bank accounts yet. Add a verified account to show payment instructions to clients.</p>}</nav><form onSubmit={save} className="grid content-start gap-4"><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">Bank name *</span><input required value={details.bank_name} onChange={(event) => update('bank_name', event.target.value)} className="admin-input" placeholder="Enter verified bank name" /></label><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">Branch</span><input value={details.bank_branch} onChange={(event) => update('bank_branch', event.target.value)} className="admin-input" placeholder="Branch name or location" /></label><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">Account name *</span><input required value={details.account_name} onChange={(event) => update('account_name', event.target.value)} className="admin-input" placeholder="Verified beneficiary name" /></label><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">Account number *</span><input required value={details.account_number} onChange={(event) => update('account_number', event.target.value)} className="admin-input font-mono" placeholder="Verified account number" /></label><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">SWIFT / BIC</span><input value={details.swift_code} onChange={(event) => update('swift_code', event.target.value)} className="admin-input font-mono" placeholder="For international transfers" /></label><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">Display order</span><input type="number" min="0" value={details.display_order} onChange={(event) => update('display_order', Number(event.target.value) || 0)} className="admin-input" /></label></div><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">Payment instructions</span><textarea value={details.payment_instructions} onChange={(event) => update('payment_instructions', event.target.value)} rows={3} className="admin-input resize-y" placeholder="Transfer notes, accepted currency, or proof-of-payment directions" /></label><div className="flex flex-wrap gap-4 border-t border-[#e2eeec] pt-4"><label className="flex items-start gap-3 text-sm text-[#123b4b]"><input type="checkbox" checked={details.is_published} onChange={(event) => update('is_published', event.target.checked)} className="mt-1 size-4 accent-[#087f88]" /><span><strong className="block">Publish this account to clients</strong><small className="text-xs text-slate-500">Only published verified accounts appear in the portal.</small></span></label><label className="flex items-start gap-3 text-sm text-[#123b4b]"><input type="checkbox" checked={details.is_quotation_default} disabled={!details.is_published} onChange={(event) => update('is_quotation_default', event.target.checked)} className="mt-1 size-4 accent-[#087f88] disabled:opacity-50" /><span><strong className="block">Use for purchase quotations</strong><small className="text-xs text-slate-500">Only one published account can be selected. Saving this replaces the current quotation account.</small></span></label></div><div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#e2eeec] pt-4"><button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving...' : editingId ? 'Save account changes' : 'Add account'} <Check size={15} /></button>{editingId && <button type="button" onClick={() => void removeAccount()} className="btn-secondary text-[#a55445]">Remove account</button>}</div>{error && <p role="alert" className="text-sm text-[#a55445]">{error}</p>}{saved && <p role="status" className="text-sm text-[#2e6b3e]">{saved}</p>}</form></div>}</section>;

  return <section className="border border-[#a9d9d8] bg-white p-5 md:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-start gap-3"><Building2 className="mt-1 text-[#087f88]" /><div><p className="eyebrow text-[#087f88]">Client payment setup</p><h2 className="mt-2 font-serif text-2xl text-[#123b4b]">Official bank instructions</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Manage verified accounts separately. Only published accounts appear to clients.</p></div></div><button type="button" onClick={startNewAccount} className="btn-secondary"><Plus size={14} />Add bank account</button></div>{loading ? <p className="mt-5 text-sm text-slate-500">Loading payment accounts...</p> : <div className="mt-5 grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"><nav aria-label="Bank accounts" className="grid content-start gap-2">{accounts.map((account) => <button key={account.id} type="button" onClick={() => { setEditingId(account.id); setDetails(account); setError(''); setSaved(''); }} aria-current={editingId === account.id ? 'true' : undefined} className={`border p-3 text-left ${editingId === account.id ? 'border-[#087f88] bg-[#eefbf9]' : 'border-[#e2ded5] bg-white'}`}><span className="block text-xs font-semibold text-[#123b4b]">{account.bank_name}</span><span className="mt-1 block text-[10px] text-slate-500">{account.account_name} · {account.is_published ? 'Published' : 'Draft'}</span></button>)}{accounts.length === 0 && <p className="border border-dashed border-[#c9c5bd] p-4 text-xs text-slate-500">No bank accounts yet. Add a verified account to show payment instructions to clients.</p>}</nav><form onSubmit={save} className="grid content-start gap-4"><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">Bank name *</span><input required value={details.bank_name} onChange={(event) => update('bank_name', event.target.value)} className="admin-input" placeholder="Enter verified bank name" /></label><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">Branch</span><input value={details.bank_branch} onChange={(event) => update('bank_branch', event.target.value)} className="admin-input" placeholder="Branch name or location" /></label><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">Account name *</span><input required value={details.account_name} onChange={(event) => update('account_name', event.target.value)} className="admin-input" placeholder="Verified beneficiary name" /></label><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">Account number *</span><input required value={details.account_number} onChange={(event) => update('account_number', event.target.value)} className="admin-input font-mono" placeholder="Verified account number" /></label><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">SWIFT / BIC</span><input value={details.swift_code} onChange={(event) => update('swift_code', event.target.value)} className="admin-input font-mono" placeholder="For international transfers" /></label><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">Display order</span><input type="number" min="0" value={details.display_order} onChange={(event) => update('display_order', Number(event.target.value) || 0)} className="admin-input" /></label></div><label className="grid gap-1.5 text-xs text-slate-500"><span className="eyebrow">Payment instructions</span><textarea value={details.payment_instructions} onChange={(event) => update('payment_instructions', event.target.value)} rows={3} className="admin-input resize-y" placeholder="Transfer notes, accepted currency, or proof-of-payment directions" /></label><div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2eeec] pt-4"><label className="flex items-center gap-3 text-sm text-[#123b4b]"><input type="checkbox" checked={details.is_published} onChange={(event) => update('is_published', event.target.checked)} className="size-4 accent-[#087f88]" /><span>Publish this account to clients</span></label><div className="flex flex-wrap gap-2"><button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving...' : editingId ? 'Save account changes' : 'Add account'} <Check size={15} /></button>{editingId && <button type="button" onClick={() => void removeAccount()} className="btn-secondary text-[#a55445]">Remove account</button>}</div></div>{error && <p role="alert" className="text-sm text-[#a55445]">{error}</p>}{saved && <p role="status" className="text-sm text-[#2e6b3e]">{saved}</p>}</form></div>}</section>;
}

function FinancialVaultTab({ user, goTo }: { user: AdminUser; goTo?: (tab: AdminTab) => void }) {
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [financials, setFinancials] = useState<VaultFinancial[]>([]);
  const [sales, setSales] = useState<VaultSale[]>([]);
  const [commissions, setCommissions] = useState<VaultCommission[]>([]);
  const [payments, setPayments] = useState<VaultPayment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, VaultDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingUnit, setSavingUnit] = useState<string | null>(null);
  const [error, setError] = useState('');
  const isLockedUnit = (unitId: string) => Boolean(financials.some((row) => row.unit_id === unitId));

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [unitResult, financialResult, saleResult, commissionResult, paymentResult] = await Promise.all([
      supabase.from('project_units').select('*').order('unit_number'),
      supabase.from('unit_financials').select('*'),
      supabase.from('sales').select('id,unit_id,unit_number,sale_price,status,sale_date,deposit_amount'),
      supabase.from('commissions').select('sale_id,amount,status'),
      supabase.from('buyer_payments').select('sale_id,amount'),
    ]);
    const firstError = unitResult.error || financialResult.error || saleResult.error || commissionResult.error || paymentResult.error;
    if (firstError) {
      setError('Vault data is unavailable. Confirm the financial-vault migration is applied and this account has owner/admin access.');
      setLoading(false);
      return;
    }
    const unitRows = (unitResult.data ?? []) as ProjectUnit[];
    const financialRows = (financialResult.data ?? []) as VaultFinancial[];
    setUnits(unitRows);
    setFinancials(financialRows);
    setSales((saleResult.data ?? []) as VaultSale[]);
    setCommissions((commissionResult.data ?? []) as VaultCommission[]);
    setPayments((paymentResult.data ?? []) as VaultPayment[]);
    const byUnit = new Map(financialRows.map((row) => [row.unit_id, row]));
    setDrafts(Object.fromEntries(unitRows.map((unit) => {
      const saved = byUnit.get(unit.id);
      const legacyPrice = Number((unit.price ?? '').replace(/[^0-9.]/g, '')) || 0;
      return [unit.id, {
        recorded_price: formatMoneyInput(String(saved?.recorded_price ?? legacyPrice)),
        construction_cost: formatMoneyInput(String(saved?.construction_cost ?? 0)),
        additional_costs: formatMoneyInput(String(saved?.additional_costs ?? 0)),
        notes: saved?.notes ?? '',
      }];
    })));
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const financialByUnit = new Map(financials.map((row) => [row.unit_id, row]));
  const commissionsBySale = new Map<string, number>();
  commissions.forEach((item) => { if (item.sale_id) commissionsBySale.set(item.sale_id, (commissionsBySale.get(item.sale_id) ?? 0) + Number(item.amount)); });
  const paymentsBySale = new Map<string, number>();
  payments.forEach((item) => paymentsBySale.set(item.sale_id, (paymentsBySale.get(item.sale_id) ?? 0) + Number(item.amount)));
  const completedSales = sales.filter((sale) => sale.status === 'COMPLETED');
  const completedRevenue = completedSales.reduce((sum, sale) => sum + Number(sale.sale_price ?? 0), 0);
  const constructionAndOtherCosts = completedSales.reduce((sum, sale) => {
    const cost = sale.unit_id ? financialByUnit.get(sale.unit_id) : undefined;
    return sum + Number(cost?.construction_cost ?? 0) + Number(cost?.additional_costs ?? 0);
  }, 0);
  const commissionEarned = completedSales.reduce((sum, sale) => sum + (commissionsBySale.get(sale.id) ?? 0), 0);
  const commissionPaid = commissions.filter((item) => item.status === 'PAID' && item.sale_id && completedSales.some((sale) => sale.id === item.sale_id)).reduce((sum, item) => sum + Number(item.amount), 0);
  const estimatedProfit = completedRevenue - constructionAndOtherCosts - commissionEarned;
  const activeSales = sales.filter((sale) => ['RESERVED', 'DEPOSIT_PAID', 'COMPLETED'].includes(sale.status));
  const collected = activeSales.reduce((sum, sale) => sum + Number(sale.deposit_amount ?? 0) + (paymentsBySale.get(sale.id) ?? 0), 0);
  const receivables = Math.max(0, activeSales.reduce((sum, sale) => sum + Number(sale.sale_price ?? 0), 0) - collected);
  const marginRate = completedRevenue ? estimatedProfit / completedRevenue * 100 : 0;
  const missingCosts = completedSales.filter((sale) => !sale.unit_id || !financialByUnit.get(sale.unit_id)?.construction_cost).length;
  const priceGaps = units.filter((unit) => unit.status === 'AVAILABLE' && !(financialByUnit.get(unit.id)?.recorded_price || Number((unit.price ?? '').replace(/[^0-9.]/g, '')))).length;

  const saveUnit = async (unit: ProjectUnit) => {
    if (isLockedUnit(unit.id)) {
      setError('This restricted unit record is locked after saving. It remains visible for review, but cannot be edited or deleted.');
      return;
    }
    const draft = drafts[unit.id];
    const recordedPrice = parseMoney(draft?.recorded_price ?? '');
    const constructionCost = parseMoney(draft?.construction_cost ?? '');
    const additionalCosts = parseMoney(draft?.additional_costs ?? '');
    if ([recordedPrice, constructionCost, additionalCosts].some((amount) => !Number.isFinite(amount) || amount < 0)) {
      setError('Enter valid non-negative amounts before saving.');
      return;
    }
    setSavingUnit(unit.id);
    setError('');
    const { error: saveError } = await supabase.from('unit_financials').upsert({
      unit_id: unit.id,
      recorded_price: recordedPrice,
      construction_cost: constructionCost,
      additional_costs: additionalCosts,
      notes: draft.notes || null,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'unit_id' });
    if (saveError) {
      setError(saveError.message || 'Could not save unit financials.');
      setSavingUnit(null);
      return;
    }
    setSavingUnit(null);
    await load();
  };

  if (loading) return <Spinner />;
  if (error && units.length === 0) return <div className="border border-[#e4b8ad] bg-[#fff7f4] p-5 text-sm text-[#7a4e2e]">{error}<button onClick={() => void load()} className="ml-3 font-semibold underline">Retry</button></div>;

  const advice: { message: string; action: string; tab?: AdminTab; target?: string }[] = [];
  if (missingCosts) advice.push({ message: `${missingCosts} completed sale${missingCosts === 1 ? ' is' : 's are'} missing a recorded construction cost. Enter those costs to improve margin accuracy.`, action: 'Open missing unit costs', target: 'vault-unit-cost-book' });
  if (receivables > 0) advice.push({ message: `${fmtKes(receivables)} remains outstanding across active and completed sales. Match each buyer payment to its scheduled balance.`, action: 'Reconcile buyer payments', tab: 'payments' });
  if (commissionEarned > commissionPaid) advice.push({ message: `${fmtKes(commissionEarned - commissionPaid)} in earned commissions is not yet marked paid. Confirm the supporting sale and update payout status.`, action: 'Review commission queue', tab: 'commissions' });
  if (priceGaps) advice.push({ message: `${priceGaps} available unit${priceGaps === 1 ? ' has' : 's have'} no confirmed price. Set pricing before publishing its purchase path.`, action: 'Open unit inventory', tab: 'units' });
  if (completedRevenue && marginRate < 20) advice.push({ message: `Estimated completed-sale margin is ${marginRate.toFixed(1)}%. Compare unit pricing with recorded construction costs.`, action: 'Review cost book', target: 'vault-unit-cost-book' });
  if (!advice.length) advice.push({ message: 'Recorded costs, receivables, and completed-sale margin show no immediate flags. Review the latest sales and keep monthly records current.', action: 'Review recent sales', tab: 'sales' });

  return <div className="grid gap-7">
    <PurchasePaymentInstructionsPanel user={user} />
    <section className="rounded-xl border border-[#a9d9d8] bg-[#eefbf9] p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow text-[#087f88]">Management signals</p>
          <h2 className="mt-2 font-serif text-3xl text-[#123b4b]">Reconcile before expansion.</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Use the action prompts below to review missing costs, unmatched receipts, and any receivables still awaiting follow-up. Restricted financial records stay visible, but once saved they are locked for audit integrity.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {goTo && <button type="button" onClick={() => goTo('payments')} className="btn-secondary">Reconcile payments</button>}
          {goTo && <button type="button" onClick={() => goTo('sales')} className="btn-secondary">Review sales</button>}
          <button type="button" onClick={() => void navigator.clipboard?.writeText(`NBG vault review: ${fmtKes(receivables)} receivables · ${fmtKes(Math.max(0, commissionEarned - commissionPaid))} comms pending`)} className="btn-secondary">Copy summary</button>
        </div>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-[#d6efee] bg-white p-4">
          <p className="eyebrow text-slate-500">Immediate focus</p>
          <p className="mt-2 text-sm font-semibold text-[#123b4b]">{missingCosts ? `${missingCosts} missing cost entries` : 'No missing cost entries'}</p>
          <p className="mt-1 text-xs text-slate-500">Add or validate the cost book before final reporting.</p>
        </div>
        <div className="rounded-lg border border-[#d6efee] bg-white p-4">
          <p className="eyebrow text-slate-500">Outstanding</p>
          <p className="mt-2 text-sm font-semibold text-[#123b4b]">{fmtKes(receivables)}</p>
          <p className="mt-1 text-xs text-slate-500">Receivables still to reconcile against buyer payments.</p>
        </div>
        <div className="rounded-lg border border-[#d6efee] bg-white p-4">
          <p className="eyebrow text-slate-500">Commission queue</p>
          <p className="mt-2 text-sm font-semibold text-[#123b4b]">{fmtKes(Math.max(0, commissionEarned - commissionPaid))}</p>
          <p className="mt-1 text-xs text-slate-500">Review pending agent payout status before closeout.</p>
        </div>
      </div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatMini label="Estimated realized profit" value={fmtKes(estimatedProfit)} color={estimatedProfit >= 0 ? 'text-[#2e6b3e]' : 'text-[#a55445]'} />
      <StatMini label="Completed sale value" value={fmtKes(completedRevenue)} color="text-[#2e5f7a]" />
      <StatMini label="Commissions earned / paid" value={`${fmtKes(commissionEarned)} / ${fmtKes(commissionPaid)}`} color="text-[#856b2e]" />
      <StatMini label="Buyer receivables" value={fmtKes(receivables)} color={receivables ? 'text-[#a55445]' : 'text-[#2e6b3e]'} />
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]">
      <div className="border border-[#c9c5bd] bg-white p-5 md:p-7">
        <div className="flex items-start justify-between gap-4"><div><p className="eyebrow text-[#087f88]">Completed transactions</p><h2 className="mt-2 font-serif text-2xl text-[#123b4b]">Where each sale goes.</h2></div><span className={`border px-3 py-2 text-xs font-semibold ${marginRate >= 20 ? 'border-[#8dd6cd] bg-[#eefbf9] text-[#087f88]' : 'border-[#e4b8ad] bg-[#fff7f4] text-[#a55445]'}`}>{completedRevenue ? `${marginRate.toFixed(1)}% margin` : 'No completed sales'}</span></div>
        <div className="mt-6 space-y-5">{completedSales.slice(0, 6).map((sale) => {
          const costRow = sale.unit_id ? financialByUnit.get(sale.unit_id) : undefined;
          const gross = Number(sale.sale_price ?? 0);
          const costs = Number(costRow?.construction_cost ?? 0) + Number(costRow?.additional_costs ?? 0);
          const commission = commissionsBySale.get(sale.id) ?? 0;
          const profit = gross - costs - commission;
          const scale = Math.max(gross, costs + commission, 1);
          return <div key={sale.id}><div className="mb-2 flex justify-between gap-3 text-xs"><span className="font-semibold text-[#123b4b]">Unit {sale.unit_number}</span><span className={profit >= 0 ? 'text-[#087f88]' : 'text-[#a55445]'}>{fmtKes(profit)} net</span></div><div className="flex h-3 overflow-hidden bg-[#e6e2da]" aria-label={`Unit ${sale.unit_number}: construction and additional costs, commission, and estimated profit`}><span className="h-full bg-[#d1a549]" style={{ width: `${Math.min(100, costs / scale * 100)}%` }} /><span className="h-full bg-[#df8068]" style={{ width: `${Math.min(100, commission / scale * 100)}%` }} /><span className="h-full bg-[#168f87]" style={{ width: `${Math.max(0, Math.min(100, profit / scale * 100))}%` }} /></div><div className="mt-1 flex justify-between text-[10px] text-slate-400"><span>Sale {fmtKes(gross)}</span><span>Cost {fmtKes(costs)} · Commission {fmtKes(commission)}</span></div></div>;
        })}{completedSales.length === 0 && <p className="border-t border-[#e6e2da] pt-5 text-sm text-slate-500">Completed sales will appear here with their recorded cost and commission breakdown.</p>}</div>
        <div className="mt-5 flex flex-wrap gap-4 border-t border-[#e6e2da] pt-4 text-[10px] uppercase tracking-wide text-slate-500"><span><i className="mr-1.5 inline-block h-2.5 w-2.5 bg-[#d1a549]" />Construction + other costs</span><span><i className="mr-1.5 inline-block h-2.5 w-2.5 bg-[#df8068]" />Commission</span><span><i className="mr-1.5 inline-block h-2.5 w-2.5 bg-[#168f87]" />Estimated profit</span></div>
      </div>
      <div className="border border-[#c9c5bd] bg-[#123b4b] p-5 text-white md:p-7"><p className="eyebrow text-[#8de7e2]">Management signals</p><h2 className="mt-2 font-serif text-2xl">What needs attention.</h2><ul className="mt-5 space-y-4">{advice.map((item) => <li key={item.action} className="border-t border-white/15 pt-4"><p className="flex gap-3 text-sm leading-6 text-white/85"><span className="mt-2 h-2 w-2 shrink-0 bg-[#19c6c9]" />{item.message}</p><button type="button" onClick={() => item.tab && goTo ? goTo(item.tab) : document.getElementById(item.target || 'vault-unit-cost-book')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} className="ml-5 mt-2 inline-flex items-center gap-2 text-xs font-semibold text-[#8de7e2] underline underline-offset-2">{item.action} <ArrowRight size={13} /></button></li>)}</ul><p className="mt-6 border-t border-white/15 pt-4 text-[10px] leading-5 text-white/45">Operational estimate only. Excludes overhead, tax, financing, and expenses not recorded per unit. This is not a bank balance or audited statement.</p></div>
    </section>

    {error && <p className="border border-[#e4b8ad] bg-[#fff7f4] p-3 text-sm text-[#7a4e2e]">{error}</p>}
    <section id="vault-unit-cost-book" className="border border-[#c9c5bd] bg-white">
      <div className="flex items-center justify-between gap-4 border-b border-[#e6e2da] px-5 py-4"><div><p className="eyebrow text-[#087f88]">Restricted records</p><h2 className="mt-1 font-serif text-2xl text-[#123b4b]">Unit price and cost book.</h2></div><div className="text-right"><p className="text-xs text-slate-500">{units.length} units · {fmtKes(constructionAndOtherCosts)} costs on completed sales</p><span className="mt-2 inline-flex rounded-full border border-[#d4c5a3] bg-[#f9f2df] px-2 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-[#856b2e]">Immutable after save</span></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-[#f0ede6] text-[9px] uppercase tracking-[.12em] text-slate-500"><tr>{['Unit', 'Status', 'Recorded price', 'Construction cost', 'Other costs', 'Notes', ''].map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead><tbody>{units.map((unit) => { const draft = drafts[unit.id] ?? { recorded_price: '', construction_cost: '', additional_costs: '', notes: '' }; const updateDraft = (key: keyof VaultDraft, value: string) => setDrafts((current) => ({ ...current, [unit.id]: { ...draft, [key]: value } })); return <tr key={unit.id} className="border-t border-[#e6e2da]"><td className="px-4 py-3 font-semibold">{unit.unit_number}<span className="block font-normal text-slate-400">{unit.type || 'Residence'}</span></td><td className="px-4 py-3">{unit.status}</td><td className="px-4 py-3"><input aria-label={`Price for unit ${unit.unit_number}`} type="number" min="0" step="0.01" className="admin-input w-36" value={draft.recorded_price} onChange={(event) => updateDraft('recorded_price', event.target.value)} /></td><td className="px-4 py-3"><input aria-label={`Construction cost for unit ${unit.unit_number}`} type="number" min="0" step="0.01" className="admin-input w-36" value={draft.construction_cost} onChange={(event) => updateDraft('construction_cost', event.target.value)} /></td><td className="px-4 py-3"><input aria-label={`Other costs for unit ${unit.unit_number}`} type="number" min="0" step="0.01" className="admin-input w-36" value={draft.additional_costs} onChange={(event) => updateDraft('additional_costs', event.target.value)} /></td><td className="px-4 py-3"><input aria-label={`Notes for unit ${unit.unit_number}`} className="admin-input w-44" value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} /></td><td className="px-4 py-3"><button type="button" onClick={() => void saveUnit(unit)} disabled={savingUnit === unit.id} className="btn-secondary !px-3 !py-2 disabled:opacity-50">{savingUnit === unit.id ? 'Saving' : 'Save'}</button></td></tr>; })}{units.length === 0 && <EmptyRow cols={7} text="No units are in the inventory yet." />}</tbody></table></div>
    </section>
  </div>;
}

// ─── Applications workflow ───────────────────────────────

function ApplicationsTab({ canManageFinancials, includeRealtorApplications }: { canManageFinancials: boolean; includeRealtorApplications: boolean }) {
  const [realtorApps, setRealtorApps] = useState<Realtor[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [projects, setProjects] = useState<Pick<Project, 'id' | 'name' | 'location'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionStatus, setActionStatus] = useState<Record<string, { title: string; message: string }>>({});
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [dateRange, setDateRange] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedApplication, setSelectedApplication] = useState<ApplicationRow | null>(null);
  const [investmentReviewDraft, setInvestmentReviewDraft] = useState({ amount: '', notes: '' });
  const [investorDetailsDraft, setInvestorDetailsDraft] = useState({ email: '', phone: '', project_id: '', investment_range: '', investment_structure: '', investor_message: '', consent_to_contact: false });
  const [investmentHistory, setInvestmentHistory] = useState<InvestmentReviewHistory[]>([]);
  const [transitioningInvestment, setTransitioningInvestment] = useState(false);
  const [savingInvestorDetails, setSavingInvestorDetails] = useState(false);
  const pageSize = 10;

  const statusPresentation: Record<ApplicationStatus, { label: string; tone: string }> = {
    PENDING: { label: 'Pending', tone: 'bg-amber-100 text-amber-800' },
    IN_REVIEW: { label: 'In review', tone: 'bg-sky-100 text-sky-800' },
    APPROVED: { label: 'Approved', tone: 'bg-emerald-100 text-emerald-800' },
    ON_HOLD: { label: 'On hold', tone: 'bg-rose-100 text-rose-800' },
    WITHDRAWN: { label: 'Withdrawn', tone: 'bg-violet-100 text-violet-800' },
  };

  const normalizeStatus = (kind: ApplicationRow['kind'], status: string): ApplicationStatus => {
    if (kind === 'realtor') {
      if (status === 'ACTIVE') return 'APPROVED';
      if (status === 'SUSPENDED') return 'ON_HOLD';
      return 'PENDING';
    }
    if (status === 'COMMITTED') return 'APPROVED';
    if (status === 'SOFT_COMMIT') return 'IN_REVIEW';
    if (status === 'WITHDRAWN') return 'WITHDRAWN';
    return 'PENDING';
  };

  const sendClientStatusNotification = async (userId: string | null, itemType: 'realtor' | 'investment', name: string, status: string) => {
    if (!userId) return;

    const notificationMap: Record<string, { title: string; body: string; kind: string }> = {
      PENDING: { title: 'Application update', body: `${name}: your application remains pending while the NBG team completes review. Next action: confirm your details and keep your profile up to date.`, kind: itemType === 'realtor' ? 'APPLICATION_STATUS' : 'INVESTMENT_STATUS' },
      ACTIVE: { title: 'Application approved', body: `${name}: your application has been approved. Next action: complete onboarding, review your commission terms, and continue with the NBG team.`, kind: itemType === 'realtor' ? 'APPLICATION_STATUS' : 'INVESTMENT_STATUS' },
      SUSPENDED: { title: 'Application on hold', body: `${name}: your application is currently on hold. Next action: review the required compliance details and contact NBG for the next step.`, kind: itemType === 'realtor' ? 'APPLICATION_STATUS' : 'INVESTMENT_STATUS' },
      INQUIRY: { title: 'Investment enquiry received', body: `${name}: your enquiry is active. Next action: the NBG team will confirm the best project fit and next steps.`, kind: 'INVESTMENT_STATUS' },
      SOFT_COMMIT: { title: 'Investment soft commitment', body: `${name}: your commitment is progressing. Next action: confirm the project preferences and provide any missing documentation.`, kind: 'INVESTMENT_STATUS' },
      COMMITTED: { title: 'Investment committed', body: `${name}: your investment has been committed. Next action: complete onboarding and prepare for the formal agreement and payment schedule.`, kind: 'INVESTMENT_STATUS' },
      WITHDRAWN: { title: 'Investment status updated', body: `${name}: this opportunity has been withdrawn. Next action: review alternative projects or contact the NBG team to reset your plan.`, kind: 'INVESTMENT_STATUS' },
    };

    const config = notificationMap[status] ?? {
      title: 'Status update',
      body: `${name}: the record has been updated. Please review the next step in your NBG account.`,
      kind: itemType === 'realtor' ? 'APPLICATION_STATUS' : 'INVESTMENT_STATUS',
    };

    await supabase.from('client_notifications').insert({
      user_id: userId,
      title: config.title,
      body: config.body,
      kind: config.kind,
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    const [realtorResult, investmentResult, projectResult] = await Promise.all([
      includeRealtorApplications ? supabase.from('realtors').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [], error: null }),
      supabase.from('investments').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('id,name,location').order('name'),
    ]);
    setRealtorApps((realtorResult.data ?? []) as Realtor[]);
    setInvestments((investmentResult.data ?? []) as Investment[]);
    setProjects((projectResult.data ?? []) as Pick<Project, 'id' | 'name' | 'location'>[]);
    setLoading(false);
  }, [includeRealtorApplications]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('admin-applications-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'realtors' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'investments' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const updateRealtorStatus = async (id: string, status: string) => {
    const target = realtorApps.find((app) => app.id === id);
    await supabase.from('realtors').update({ status }).eq('id', id);
    if (target) {
      await sendClientStatusNotification(target.user_id ?? null, 'realtor', target.name, status);
      setActionStatus((current) => ({ ...current, [id]: {
        title: status === 'ACTIVE' ? 'Approved and notified' : status === 'SUSPENDED' ? 'Hold status saved' : 'Status saved',
        message: status === 'ACTIVE' ? 'The client has been notified and can continue onboarding.' : status === 'SUSPENDED' ? 'The client inbox has been updated with the next compliance step.' : 'The record is updated and the client has been informed.',
      } }));
    }
    await load();
  };

  const updateInvestmentStatus = async (id: string, status: string, saveDecision = false) => {
    const target = investments.find((item) => item.id === id);
    const amount_committed = investmentReviewDraft.amount.trim() ? parseMoney(investmentReviewDraft.amount) : target?.amount_committed ?? null;
    const { error } = await supabase.rpc('advance_investment_application', {
      p_investment_id: id,
      p_status: status,
      p_amount_committed: saveDecision && status === 'COMMITTED' ? amount_committed : null,
      p_decision_notes: saveDecision ? investmentReviewDraft.notes.trim() : '',
    });
    if (error) return error.message;
    if (target) {
      await sendClientStatusNotification(target.investor_user_id ?? null, 'investment', target.investor_name, status);
      setActionStatus((current) => ({ ...current, [id]: {
        title: status === 'COMMITTED' ? 'Committed and notified' : status === 'WITHDRAWN' ? 'Withdrawal saved' : 'Review started',
        message: status === 'COMMITTED' ? 'The investor has been informed of the next agreement steps.' : status === 'WITHDRAWN' ? 'The investor inbox has been updated with alternative options.' : 'The request is now in review and the change is recorded in the audit history.',
      } }));
    }
    await load();
    return '';
  };

  const applications: ApplicationRow[] = useMemo(() => {
    const projectById = new Map(projects.map((project) => [project.id, project]));
    return [
      ...(includeRealtorApplications ? realtorApps : []).map((app) => ({
        key: `realtor-${app.id}`,
        id: app.id,
        reference: app.id.slice(0, 6).toUpperCase(),
        kind: 'realtor' as const,
        name: app.name,
        email: app.email,
        phone: app.phone,
        interest: 'Realtor partnership',
        detail: app.commission_rate ? `${app.commission_rate}% commission` : 'Registration request',
        region: 'Not specified',
        status: normalizeStatus('realtor', app.status),
        rawStatus: app.status,
        createdAt: app.created_at,
        notes: app.notes,
      })),
      ...investments.map((item) => {
        const project = item.project_id ? projectById.get(item.project_id) : null;
        const amount = item.amount_interested == null ? item.investment_range || 'Amount not provided' : fmtKes(item.amount_interested);
        return {
          key: `investment-${item.id}`,
          id: item.id,
          reference: item.reference_code || item.id.slice(0, 6).toUpperCase(),
          kind: 'investment' as const,
          name: item.investor_name,
          email: item.investor_email,
          phone: item.investor_phone,
          interest: project?.name || item.investment_structure || item.investment_range || 'Investment interest',
          detail: amount,
          region: project?.location || 'Not specified',
          status: normalizeStatus('investment', item.status),
          rawStatus: item.status,
          createdAt: item.created_at,
          notes: item.investor_message || item.notes,
        };
      }),
    ];
  }, [includeRealtorApplications, investments, projects, realtorApps]);

  const regions = [...new Set(applications.map((application) => application.region).filter((region) => region !== 'Not specified'))].sort();
  const filteredApplications = useMemo(() => {
    const query = search.trim().toLowerCase();
    const cutoff = dateRange === 'all' ? null : Date.now() - Number(dateRange) * 24 * 60 * 60 * 1000;
    return applications.filter((application) => {
      const matchesQuery = !query || [application.name, application.email, application.phone, application.interest, application.detail, application.region]
        .some((value) => value?.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'ALL' || application.status === statusFilter;
      const matchesType = typeFilter === 'ALL' || application.kind === typeFilter;
      const matchesRegion = regionFilter === 'ALL' || application.region === regionFilter;
      const createdAt = new Date(application.createdAt).getTime();
      const matchesDate = cutoff === null || (Number.isFinite(createdAt) && createdAt >= cutoff);
      return matchesQuery && matchesStatus && matchesType && matchesRegion && matchesDate;
    }).sort((left, right) => {
      const difference = new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      return sortOrder === 'newest' ? -difference : difference;
    });
  }, [applications, dateRange, regionFilter, search, sortOrder, statusFilter, typeFilter]);

  useEffect(() => { setPage(1); }, [dateRange, regionFilter, search, statusFilter, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredApplications.length / pageSize));
  const visibleApplications = filteredApplications.slice((page - 1) * pageSize, page * pageSize);
  const totalApplications = applications.length;
  const getStatusCount = (status: ApplicationStatus) => applications.filter((application) => application.status === status).length;
  const percentage = (count: number) => totalApplications ? `${((count / totalApplications) * 100).toFixed(1)}%` : '0.0%';

  const metricCards = [
    { label: 'Total applications', value: totalApplications, note: 'Realtor + investor', icon: ClipboardList, iconTone: 'bg-sky-100 text-sky-700', cardTone: 'border-sky-100 bg-sky-50/70' },
    { label: 'Approved', value: getStatusCount('APPROVED'), note: percentage(getStatusCount('APPROVED')), icon: Check, iconTone: 'bg-emerald-100 text-emerald-700', cardTone: 'border-emerald-100 bg-emerald-50/70' },
    { label: 'Pending review', value: getStatusCount('PENDING'), note: percentage(getStatusCount('PENDING')), icon: Clock3, iconTone: 'bg-amber-100 text-amber-700', cardTone: 'border-amber-100 bg-amber-50/70' },
    { label: 'In review', value: getStatusCount('IN_REVIEW'), note: percentage(getStatusCount('IN_REVIEW')), icon: Eye, iconTone: 'bg-blue-100 text-blue-700', cardTone: 'border-blue-100 bg-blue-50/70' },
    { label: 'On hold', value: getStatusCount('ON_HOLD'), note: percentage(getStatusCount('ON_HOLD')), icon: AlertCircle, iconTone: 'bg-rose-100 text-rose-700', cardTone: 'border-rose-100 bg-rose-50/70' },
    { label: 'Withdrawn', value: getStatusCount('WITHDRAWN'), note: percentage(getStatusCount('WITHDRAWN')), icon: X, iconTone: 'bg-violet-100 text-violet-700', cardTone: 'border-violet-100 bg-violet-50/70' },
  ];

  const handleExport = () => {
    void downloadReportPdf(
      `nbg-applications-${new Date().toISOString().slice(0, 10)}.pdf`,
      ['Reference', 'Applicant', 'Type', 'Email', 'Phone', 'Interest', 'Region', 'Status', 'Submitted'],
      filteredApplications.map((application) => [application.reference, application.name, application.kind, application.email, application.phone, application.interest, application.region, statusPresentation[application.status].label, application.createdAt]),
      'Client Applications'
    );
  };

  const openApplication = async (application: ApplicationRow) => {
    setSelectedApplication(application);
    const investment = investments.find((item) => item.id === application.id);
    setInvestmentReviewDraft({ amount: investment?.amount_committed?.toString() ?? '', notes: '' });
    setInvestorDetailsDraft({ email: investment?.investor_email ?? '', phone: investment?.investor_phone ?? '', project_id: investment?.project_id ?? '', investment_range: investment?.investment_range ?? '', investment_structure: investment?.investment_structure ?? '', investor_message: investment?.investor_message ?? '', consent_to_contact: Boolean(investment?.consent_to_contact) });
    setInvestmentHistory([]);
    if (application.kind !== 'investment') return;
    const { data } = await supabase.from('investment_application_reviews').select('*').eq('investment_id', application.id).order('created_at', { ascending: false }).limit(10);
    setInvestmentHistory((data ?? []) as InvestmentReviewHistory[]);
    if (application.rawStatus !== 'INQUIRY') return;
    setTransitioningInvestment(true);
    const error = await updateInvestmentStatus(application.id, 'SOFT_COMMIT');
    setTransitioningInvestment(false);
    if (error) {
      setActionStatus((current) => ({ ...current, [application.id]: { title: 'Review not started', message: error } }));
      return;
    }
    setSelectedApplication((current) => current?.id === application.id ? { ...current, rawStatus: 'SOFT_COMMIT', status: 'IN_REVIEW' } : current);
    const { data: reviewRows } = await supabase.from('investment_application_reviews').select('*').eq('investment_id', application.id).order('created_at', { ascending: false }).limit(10);
    setInvestmentHistory((reviewRows ?? []) as InvestmentReviewHistory[]);
  };

  const saveInvestorDetails = async () => {
    if (!selectedApplication || selectedApplication.kind !== 'investment') return;
    setSavingInvestorDetails(true);
    const changes = {
      investor_email: investorDetailsDraft.email.trim().toLowerCase() || null,
      investor_phone: investorDetailsDraft.phone.trim() || null,
      project_id: investorDetailsDraft.project_id || null,
      investment_range: investorDetailsDraft.investment_range.trim() || null,
      investment_structure: investorDetailsDraft.investment_structure.trim() || null,
      investor_message: investorDetailsDraft.investor_message.trim() || null,
      consent_to_contact: investorDetailsDraft.consent_to_contact,
      consent_at: investorDetailsDraft.consent_to_contact ? new Date().toISOString() : null,
    };
    const { error } = await supabase.from('investments').update(changes).eq('id', selectedApplication.id);
    setSavingInvestorDetails(false);
    if (error) {
      setActionStatus((current) => ({ ...current, [selectedApplication.id]: { title: 'Investor details were not saved', message: error.message } }));
      return;
    }
    setInvestments((current) => current.map((investment) => investment.id === selectedApplication.id ? { ...investment, ...changes } : investment));
    setActionStatus((current) => ({ ...current, [selectedApplication.id]: { title: 'Investor details saved', message: 'The updated contact and investment basis is now part of the audit history.' } }));
    const { data } = await supabase.from('investment_application_reviews').select('*').eq('investment_id', selectedApplication.id).order('created_at', { ascending: false }).limit(10);
    setInvestmentHistory((data ?? []) as InvestmentReviewHistory[]);
  };

  const applySelectedStatus = async (status: string) => {
    if (!selectedApplication) return;
    if (selectedApplication.kind === 'realtor') await updateRealtorStatus(selectedApplication.id, status);
    else {
      if (status === 'COMMITTED' && (parseMoney(investmentReviewDraft.amount) <= 0 || investmentReviewDraft.notes.trim().length < 12)) {
        setActionStatus((current) => ({ ...current, [selectedApplication.id]: { title: 'Review details required', message: 'Enter a committed amount and at least 12 characters of decision notes before committing.' } }));
        return;
      }
      if (status === 'WITHDRAWN' && investmentReviewDraft.notes.trim().length < 12) {
        setActionStatus((current) => ({ ...current, [selectedApplication.id]: { title: 'Withdrawal reason required', message: 'Enter at least 12 characters explaining this decision before withdrawing.' } }));
        return;
      }
      setTransitioningInvestment(true);
      const error = await updateInvestmentStatus(selectedApplication.id, status, status === 'COMMITTED' || status === 'WITHDRAWN');
      setTransitioningInvestment(false);
      if (error) {
        setActionStatus((current) => ({ ...current, [selectedApplication.id]: { title: 'Status was not changed', message: error } }));
        return;
      }
      const { data } = await supabase.from('investment_application_reviews').select('*').eq('investment_id', selectedApplication.id).order('created_at', { ascending: false }).limit(10);
      setInvestmentHistory((data ?? []) as InvestmentReviewHistory[]);
    }
    setSelectedApplication((current) => current ? {
      ...current,
      rawStatus: status,
      status: normalizeStatus(current.kind, status),
    } : current);
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4">
      <header className="flex flex-col justify-between gap-4 border-b border-[#dfe6ee] pb-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Users size={21} /></span>
          <div>
            <h2 className="text-xl font-semibold text-[#102744]">Client Applications</h2>
            <p className="text-xs text-slate-500">Manage and track realtor requests and investor interest.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleExport} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"><Download size={14} />Export</button>
          <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold shadow-sm ${filtersOpen ? 'border-sky-200 bg-sky-50 text-sky-800' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><SlidersHorizontal size={14} />Filters</button>
          <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-500 px-3 text-xs font-semibold text-white shadow-sm hover:bg-emerald-600"><RefreshCw size={14} />Refresh</button>
        </div>
      </header>

      <section aria-label="Application totals" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return <div key={metric.label} className={`flex min-h-[76px] items-center gap-3 rounded-lg border px-3 py-2.5 ${metric.cardTone}`}>
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${metric.iconTone}`}><Icon size={17} /></span>
            <div className="min-w-0"><p className="truncate text-[10px] font-medium text-slate-600">{metric.label}</p><p className="text-lg font-bold leading-5 text-[#102744]">{metric.value.toLocaleString()}</p><p className="text-[9px] text-slate-500">{metric.note}</p></div>
          </div>;
        })}
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full lg:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, email, phone..." className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-xs outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" />
          </label>
          {filtersOpen && <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:flex-1 lg:justify-end">
            <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none focus:border-sky-400">
              <option value="ALL">All statuses</option>
              {Object.entries(statusPresentation).map(([value, status]) => <option key={value} value={value}>{status.label}</option>)}
            </select>
            <select aria-label="Filter by application type" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none focus:border-sky-400">
              <option value="ALL">All applications</option><option value="realtor">Realtor</option><option value="investment">Investor</option>
            </select>
            <select aria-label="Filter by region" value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none focus:border-sky-400">
              <option value="ALL">All regions</option>{regions.map((region) => <option key={region} value={region}>{region}</option>)}
            </select>
            <select aria-label="Filter by date submitted" value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="h-9 min-w-0 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-700 outline-none focus:border-sky-400">
              <option value="all">Any date</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option>
            </select>
          </div>}
          <label className="flex h-9 items-center gap-2 whitespace-nowrap rounded-md border border-slate-200 px-2 text-[11px] text-slate-600">
            <span>Sort by:</span><select aria-label="Sort applications" value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'newest' | 'oldest')} className="bg-transparent font-semibold text-slate-700 outline-none"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead className="bg-slate-50 text-[9px] font-semibold uppercase tracking-wide text-slate-500"><tr>
              <th className="w-16 px-3 py-3">#</th><th className="px-3 py-3">Applicant</th><th className="px-3 py-3">Email &amp; phone</th><th className="px-3 py-3">Plan / interest</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Submitted</th><th className="w-24 px-3 py-3 text-right">Actions</th>
            </tr></thead>
            <tbody>
              {visibleApplications.map((application, index) => {
                const presentation = statusPresentation[application.status];
                const initials = application.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
                return <tr key={application.key} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-3 py-3 font-mono text-[10px] text-slate-500">{application.reference}<span className="mt-1 block font-sans text-[9px] text-slate-400">{index + 1 + (page - 1) * pageSize}</span></td>
                  <td className="px-3 py-3"><div className="flex items-center gap-2.5"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${application.kind === 'realtor' ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>{initials}</span><div className="min-w-0"><p className="truncate font-semibold text-slate-800">{application.name}</p><span className="mt-0.5 inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-600">{application.kind === 'realtor' ? 'Realtor' : 'Investor'}</span></div></div></td>
                  <td className="px-3 py-3"><p className="max-w-[190px] truncate text-slate-700">{application.email || 'Email not provided'}</p><p className="mt-1 text-[10px] text-slate-500">{application.phone || 'Phone not provided'}</p></td>
                  <td className="px-3 py-3"><p className="max-w-[190px] truncate font-medium text-slate-700">{application.interest}</p><p className="mt-1 text-[10px] text-slate-500">{application.detail}{application.region !== 'Not specified' ? ` · ${application.region}` : ''}</p></td>
                  <td className="px-3 py-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[9px] font-semibold uppercase ${presentation.tone}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{presentation.label}</span></td>
                  <td className="px-3 py-3"><p className="whitespace-nowrap text-slate-700">{new Date(application.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}</p><p className="mt-1 whitespace-nowrap text-[10px] text-slate-500">{new Date(application.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</p></td>
                  <td className="px-3 py-3 text-right"><button type="button" onClick={() => void openApplication(application)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 text-[10px] font-semibold text-slate-700 hover:border-sky-300 hover:text-sky-800"><Eye size={13} />View</button></td>
                </tr>;
              })}
              {visibleApplications.length === 0 && <tr><td colSpan={7} className="px-4 py-14 text-center"><p className="font-medium text-slate-700">No applications match these filters.</p><p className="mt-1 text-xs text-slate-500">Try changing your search or filters.</p></td></tr>}
            </tbody>
          </table>
        </div>

        <footer className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 text-[10px] text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <span>Showing {filteredApplications.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredApplications.length)} of {filteredApplications.length} applications</span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1} className="h-7 rounded border border-slate-200 px-2 disabled:opacity-40">Previous</button>
            <span className="px-2 text-slate-600">Page {page} of {pageCount}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount} className="h-7 rounded border border-slate-200 px-2 disabled:opacity-40">Next</button>
          </div>
        </footer>
      </section>

      {selectedApplication && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedApplication(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="application-dialog-title" className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">{selectedApplication.kind === 'realtor' ? 'Realtor request' : 'Investor application'} · {selectedApplication.reference}</p><h3 id="application-dialog-title" className="mt-1 text-xl font-semibold text-[#102744]">{selectedApplication.name}</h3></div><button type="button" aria-label="Close application details" onClick={() => setSelectedApplication(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button></header>
          <div className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2">
            <div><p className="text-[9px] font-semibold uppercase text-slate-400">Email</p><p className="mt-1 break-all text-sm text-slate-700">{selectedApplication.email || 'Not provided'}</p></div>
            <div><p className="text-[9px] font-semibold uppercase text-slate-400">Phone</p><p className="mt-1 text-sm text-slate-700">{selectedApplication.phone || 'Not provided'}</p></div>
            <div><p className="text-[9px] font-semibold uppercase text-slate-400">Plan / interest</p><p className="mt-1 text-sm text-slate-700">{selectedApplication.interest}<span className="block text-xs text-slate-500">{selectedApplication.detail}</span></p></div>
            <div><p className="text-[9px] font-semibold uppercase text-slate-400">Status and region</p><p className="mt-1 text-sm text-slate-700">{statusPresentation[selectedApplication.status].label} · {selectedApplication.region}</p></div>
            <div className="sm:col-span-2"><p className="text-[9px] font-semibold uppercase text-slate-400">Submitted</p><p className="mt-1 text-sm text-slate-700">{new Date(selectedApplication.createdAt).toLocaleString('en-KE')}</p></div>
            {selectedApplication.notes && <div className="sm:col-span-2"><p className="text-[9px] font-semibold uppercase text-slate-400">Notes</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{selectedApplication.notes}</p></div>}
            {actionStatus[selectedApplication.id] && <div className="sm:col-span-2 rounded-md border border-emerald-100 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-800">{actionStatus[selectedApplication.id].title}</p><p className="mt-1 text-xs text-slate-600">{actionStatus[selectedApplication.id].message}</p></div>}
            {selectedApplication.kind === 'investment' && (() => {
              const investment = investments.find((item) => item.id === selectedApplication.id);
              const projectLabel = projects.find((project) => project.id === investorDetailsDraft.project_id)?.name || 'No project selected';
              return <div className="sm:col-span-2 rounded-md border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-slate-800">Investor review basis</p><p className="mt-1 text-[10px] text-slate-500">Complete the enquiry details before starting review. Commit and withdrawal decisions require a recorded rationale.</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">{projectLabel}</span></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-[10px] text-slate-500">Investor email<input type="email" value={investorDetailsDraft.email} onChange={(event) => setInvestorDetailsDraft((draft) => ({ ...draft, email: event.target.value }))} className="admin-input !py-2 text-xs" /></label>
                  <label className="grid gap-1 text-[10px] text-slate-500">Phone<input value={investorDetailsDraft.phone} onChange={(event) => setInvestorDetailsDraft((draft) => ({ ...draft, phone: event.target.value }))} className="admin-input !py-2 text-xs" /></label>
                  <label className="grid gap-1 text-[10px] text-slate-500">Project<select value={investorDetailsDraft.project_id} onChange={(event) => setInvestorDetailsDraft((draft) => ({ ...draft, project_id: event.target.value }))} className="admin-input !py-2 text-xs"><option value="">General interest / not selected</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
                  <label className="grid gap-1 text-[10px] text-slate-500">Investment range<input value={investorDetailsDraft.investment_range} onChange={(event) => setInvestorDetailsDraft((draft) => ({ ...draft, investment_range: event.target.value }))} className="admin-input !py-2 text-xs" placeholder="For example, KSh 5–10 million" /></label>
                  <label className="grid gap-1 text-[10px] text-slate-500 sm:col-span-2">Investment structure<input value={investorDetailsDraft.investment_structure} onChange={(event) => setInvestorDetailsDraft((draft) => ({ ...draft, investment_structure: event.target.value }))} className="admin-input !py-2 text-xs" placeholder="Participation or structure discussed" /></label>
                  <label className="grid gap-1 text-[10px] text-slate-500 sm:col-span-2">Investor objectives / enquiry notes<textarea value={investorDetailsDraft.investor_message} onChange={(event) => setInvestorDetailsDraft((draft) => ({ ...draft, investor_message: event.target.value }))} rows={2} className="admin-input resize-y text-xs" /></label>
                  <label className="flex items-start gap-2 text-[10px] leading-4 text-slate-600 sm:col-span-2"><input type="checkbox" checked={investorDetailsDraft.consent_to_contact} onChange={(event) => setInvestorDetailsDraft((draft) => ({ ...draft, consent_to_contact: event.target.checked }))} className="mt-0.5" /><span>Investor consent to be contacted is recorded. Confirm only after consent is actually received.</span></label>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-slate-200 pt-3">
                  <label className="grid min-w-40 flex-1 gap-1 text-[10px] text-slate-500">Committed amount (KES)<input type="number" min="0" step="0.01" disabled={!canManageFinancials} value={investmentReviewDraft.amount} onChange={(event) => setInvestmentReviewDraft((draft) => ({ ...draft, amount: event.target.value }))} className="admin-input !py-2 text-xs disabled:bg-slate-100" />{!canManageFinancials && <span>Admin approval is required to record a commitment.</span>}</label>
                  <label className="grid min-w-52 flex-[2] gap-1 text-[10px] text-slate-500">Review / decision rationale<textarea value={investmentReviewDraft.notes} onChange={(event) => setInvestmentReviewDraft((draft) => ({ ...draft, notes: event.target.value }))} rows={2} maxLength={1200} className="admin-input resize-y text-xs" placeholder="Record the evidence and decision basis (at least 12 characters for final decisions)." /></label>
                  <button type="button" onClick={() => void saveInvestorDetails()} disabled={savingInvestorDetails} className="btn-secondary !px-3 !py-2 disabled:opacity-50">{savingInvestorDetails ? 'Saving…' : 'Save review details'}</button>
                  {investment && <p className="w-full text-[10px] text-slate-500">Account {investment.investor_user_id ? 'linked' : 'not yet linked'} · Consent {investment.consent_to_contact ? 'recorded' : 'missing'} · Amount interested {investment.amount_interested == null ? 'not recorded' : fmtKes(investment.amount_interested)}</p>}
                </div>
                <div className="mt-4 border-t border-slate-200 pt-3"><p className="text-[10px] font-semibold uppercase text-slate-500">Status history</p>{investmentHistory.length ? <ol className="mt-2 grid gap-2">{investmentHistory.map((entry) => <li key={entry.id} className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-[10px] text-slate-600"><span><strong>{entry.from_status.replace(/_/g, ' ')} → {entry.to_status.replace(/_/g, ' ')}</strong> · {entry.actor_email || 'Staff account'}{entry.amount_committed ? ` · ${fmtKes(entry.amount_committed)}` : ''}{entry.decision_notes ? ` · ${entry.decision_notes}` : ''}</span><time>{new Date(entry.created_at).toLocaleString('en-KE')}</time></li>)}</ol> : <p className="mt-2 text-[10px] text-slate-500">No status changes recorded yet.</p>}</div>
              </div>;
            })()}
          </div>
          <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
            {selectedApplication.kind === 'realtor' ? <><button type="button" onClick={() => void applySelectedStatus('PENDING')} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Mark pending</button><button type="button" onClick={() => void applySelectedStatus('SUSPENDED')} className="rounded-md border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700">Place on hold</button><button type="button" onClick={() => void applySelectedStatus('ACTIVE')} className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Approve</button></> : <>{selectedApplication.rawStatus === 'INQUIRY' && <button type="button" disabled={transitioningInvestment} onClick={() => void applySelectedStatus('SOFT_COMMIT')} className="rounded-md border border-sky-200 bg-white px-3 py-2 text-xs font-semibold text-sky-700 disabled:opacity-50">Start review</button>}{selectedApplication.rawStatus === 'SOFT_COMMIT' && <><button type="button" disabled={transitioningInvestment} onClick={() => void applySelectedStatus('WITHDRAWN')} className="rounded-md border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 disabled:opacity-50">Withdraw</button>{canManageFinancials && <button type="button" disabled={transitioningInvestment} onClick={() => void applySelectedStatus('COMMITTED')} className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Commit</button>}</>}</>}
          </footer>
        </section>
      </div>}
    </div>
  );
}

// ─── Overview ────────────────────────────────────────────

function OverviewTab({ goTo }: { goTo: (tab: AdminTab) => void }) {
  const [dateRange, setDateRange] = useState('30');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [data, setData] = useState<{
    leads: Lead[]; sales: Sale[]; units: ProjectUnit[];
    projects: Project[]; realtors: Realtor[]; investments: Investment[]; commissions: Commission[];
    installments: BuyerInstallment[]; payments: BuyerPaymentRecord[]; activity: AuditLog[];
  } | null>(null);

  const load = useCallback(async () => {
      const [leadsR, salesR, unitsR, projectsR, realtorsR, investR, commR, installmentR, paymentsR, activityR] = await Promise.all([
        supabase.from('leads').select('*').order('created_at', { ascending: false }).limit(250),
        supabase.from('sales').select('*').order('created_at', { ascending: false }).limit(500),
        supabase.from('project_units').select('id,project_id,unit_number,type,status'),
        supabase.from('projects').select('id,name,location,image_url').order('name'),
        supabase.from('realtors').select('id,status,total_earned,name').order('total_earned', { ascending: false }),
        supabase.from('investments').select('id,status,amount_interested,investor_name').order('created_at', { ascending: false }),
        supabase.from('commissions').select('id,status,amount,realtor_id,sale_id').order('created_at', { ascending: false }),
        supabase.from('buyer_installments').select('*').order('due_date'),
        supabase.from('buyer_payments').select('id,sale_id,installment_id,amount,payment_date,method,reference,transaction_ref,created_at,notes').order('payment_date', { ascending: false }),
        supabase.from('audit_logs').select('id,action,category,entity_type,entity_label,created_at,actor_email').order('created_at', { ascending: false }).limit(8),
      ]);
      setData({
        leads: (leadsR.data ?? []) as Lead[],
        sales: (salesR.data ?? []) as Sale[],
        units: (unitsR.data ?? []) as ProjectUnit[],
        projects: (projectsR.data ?? []) as Project[],
        realtors: (realtorsR.data ?? []) as Realtor[],
        investments: (investR.data ?? []) as Investment[],
        commissions: (commR.data ?? []) as Commission[],
        installments: (installmentR.data ?? []) as BuyerInstallment[],
        payments: (paymentsR.data ?? []) as BuyerPaymentRecord[],
        activity: (activityR.data ?? []) as AuditLog[],
      });
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel('admin-executive-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buyer_installments' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buyer_payments' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_units' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'realtors' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'commissions' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_logs' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  if (!data) return <Spinner />;

  const rangeDays = Number(dateRange);
  const now = new Date();
  const rangeStart = new Date(now.getTime() - rangeDays * 86400000);
  const previousStart = new Date(rangeStart.getTime() - rangeDays * 86400000);
  const projectById = new Map(data.projects.map((project) => [project.id, project]));
  const unitById = new Map(data.units.map((unit) => [unit.id, unit]));
  const scopedSales = data.sales.filter((sale) => projectFilter === 'ALL' || Boolean(sale.unit_id && unitById.get(sale.unit_id)?.project_id === projectFilter));
  const scopedSaleIds = new Set(scopedSales.map((sale) => sale.id));
  const isInPeriod = (value: string | null | undefined, start: Date, end = now) => Boolean(value && new Date(value).getTime() >= start.getTime() && new Date(value).getTime() <= end.getTime());
  const periodSales = scopedSales.filter((sale) => isInPeriod(sale.sale_date || sale.created_at, rangeStart));
  const periodLeads = data.leads.filter((lead) => isInPeriod(lead.created_at, rangeStart) && (projectFilter === 'ALL' || (lead.project || '').toLowerCase().includes((projectById.get(projectFilter)?.name || '').toLowerCase())));
  const scopedLeads = data.leads.filter((lead) => projectFilter === 'ALL' || (lead.project || '').toLowerCase().includes((projectById.get(projectFilter)?.name || '').toLowerCase()));
  const paidInPeriod = data.payments.filter((payment) => scopedSaleIds.has(payment.sale_id) && isInPeriod(payment.payment_date, rangeStart)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const paidPrevious = data.payments.filter((payment) => scopedSaleIds.has(payment.sale_id) && isInPeriod(payment.payment_date, previousStart, rangeStart)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const pipelineValue = periodSales.filter((sale) => ['RESERVED', 'DEPOSIT_PAID'].includes(sale.status)).reduce((sum, sale) => sum + Number(sale.sale_price || 0), 0);
  const previousPipeline = scopedSales.filter((sale) => ['RESERVED', 'DEPOSIT_PAID'].includes(sale.status) && isInPeriod(sale.created_at, previousStart, rangeStart)).reduce((sum, sale) => sum + Number(sale.sale_price || 0), 0);
  const overdueInstallments = data.installments.filter((item) => scopedSaleIds.has(item.sale_id) && item.status !== 'PAID' && item.due_date < kenyaCalendarDate());
  const receivables = scopedSales.filter((sale) => sale.status !== 'CANCELLED').reduce((sum, sale) => {
    const scheduledPaid = data.installments.filter((item) => item.sale_id === sale.id).reduce((paid, item) => paid + Number(item.paid_amount || 0), 0);
    const receiptPaid = data.payments.filter((payment) => payment.sale_id === sale.id).reduce((paid, payment) => paid + Number(payment.amount || 0), 0);
    return sum + Math.max(Number(sale.sale_price || 0) - Math.max(scheduledPaid, receiptPaid), 0);
  }, 0);
  const percentChange = (current: number, previous: number) => previous ? Math.round((current - previous) / previous * 100) : current ? 100 : 0;
  const revenueChange = percentChange(paidInPeriod, paidPrevious);
  const pipelineChange = percentChange(pipelineValue, previousPipeline);
  const leadChange = percentChange(periodLeads.length, data.leads.filter((lead) => isInPeriod(lead.created_at, previousStart, rangeStart) && (projectFilter === 'ALL' || (lead.project || '').toLowerCase().includes((projectById.get(projectFilter)?.name || '').toLowerCase()))).length);
  const accountingKes = (amount: number) => {
    const absolute = Math.abs(amount);
    const value = absolute >= 1_000_000 ? `${(absolute / 1_000_000).toFixed(1)}M` : absolute >= 10_000 ? `${(absolute / 1_000).toFixed(1)}K` : absolute.toLocaleString('en-KE', { maximumFractionDigits: 0 });
    return `${amount < 0 ? '(KSh ' : 'KSh '}${value}${amount < 0 ? ')' : ''}`;
  };
  const accountingAxis = (amount: number) => amount >= 1_000_000 ? `${(amount / 1_000_000).toFixed(0)}M` : amount >= 10_000 ? `${(amount / 1_000).toFixed(0)}K` : amount.toLocaleString('en-KE', { maximumFractionDigits: 0 });
  const chartBuckets = Array.from({ length: 4 }, (_, index) => {
    const bucketStart = new Date(rangeStart.getTime() + rangeDays * 86400000 * index / 4);
    const bucketEnd = new Date(rangeStart.getTime() + rangeDays * 86400000 * (index + 1) / 4);
    const revenue = data.payments.filter((payment) => scopedSaleIds.has(payment.sale_id) && isInPeriod(payment.payment_date, bucketStart, bucketEnd)).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const sales = scopedSales.filter((sale) => ['RESERVED', 'DEPOSIT_PAID', 'COMPLETED'].includes(sale.status) && isInPeriod(sale.sale_date || sale.created_at, bucketStart, bucketEnd)).length;
    return { label: new Intl.DateTimeFormat('en-KE', rangeDays <= 30 ? { day: 'numeric', month: 'short' } : { month: 'short', year: '2-digit' }).format(bucketStart), revenue, sales };
  });
  const maxChartRevenue = Math.max(...chartBuckets.map((bucket) => bucket.revenue), 1);
  const maxChartSales = Math.max(...chartBuckets.map((bucket) => bucket.sales), 1);
  const salesLinePoints = chartBuckets.map((bucket, index) => `${8 + index * 28},${54 - bucket.sales / maxChartSales * 42}`).join(' ');
  const funnelStatuses = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_BOOKED', 'NEGOTIATING', 'CONVERTED'];
  const funnelColors = ['#12a7a6', '#49bfd0', '#438bf4', '#9a69e8', '#efa143', '#37bd75'];
  const funnelRows = funnelStatuses.map((status, index) => ({ status, index, count: periodLeads.filter((lead) => lead.status === status).length }));
  const priorityOrder: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2, MEDIUM: 2, LOW: 3 };
  const operations = [
    ...scopedLeads.filter((lead) => lead.next_action_at && !['CONVERTED', 'LOST'].includes(lead.status)).map((lead) => ({ id: `lead-${lead.id}`, priority: lead.priority || 'NORMAL', task: `${lead.next_action || 'Follow up'} · ${lead.name}`, assigned: lead.assigned_consultant || 'Unassigned', dueAt: lead.next_action_at as string, status: new Date(lead.next_action_at as string).getTime() < now.getTime() ? 'Overdue' : 'Scheduled', tab: 'leads' as AdminTab })),
    ...overdueInstallments.map((installment) => {
      const sale = scopedSales.find((row) => row.id === installment.sale_id);
      return { id: `installment-${installment.id}`, priority: 'HIGH', task: `Installment ${installment.installment_number} · ${sale?.buyer_name || 'Buyer'} · Unit ${sale?.unit_number || '—'}`, assigned: 'Collections', dueAt: `${installment.due_date}T00:00:00`, status: 'Overdue', tab: 'payments' as AdminTab };
    }),
    ...scopedLeads.filter((lead) => lead.status === 'VIEWING_BOOKED' && !['CONVERTED', 'LOST'].includes(lead.status)).map((lead) => ({ id: `viewing-${lead.id}`, priority: 'MEDIUM', task: `Viewing · ${lead.name}${lead.project ? ` · ${lead.project}` : ''}`, assigned: lead.assigned_consultant || 'Unassigned', dueAt: lead.next_action_at || lead.created_at, status: 'Pending', tab: 'leads' as AdminTab })),
    ...scopedSales.filter((sale) => ['RESERVED', 'DEPOSIT_PAID'].includes(sale.status)).map((sale) => ({ id: `buyer-${sale.id}`, priority: sale.status === 'RESERVED' ? 'HIGH' : 'MEDIUM', task: `${sale.buyer_name} · Unit ${sale.unit_number}`, assigned: 'Sales team', dueAt: sale.reservation_expires_at || sale.created_at, status: sale.status.replace(/_/g, ' '), tab: 'payments' as AdminTab })),
  ].sort((left, right) => (priorityOrder[left.priority.toUpperCase()] ?? 2) - (priorityOrder[right.priority.toUpperCase()] ?? 2) || new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime()).slice(0, 5).map((item) => ({ ...item, priority: ['HIGH', 'URGENT'].includes(item.priority.toUpperCase()) ? 'High' : item.priority.toUpperCase() === 'MEDIUM' ? 'Medium' : 'Low', due: new Date(item.dueAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) }));
  const portfolioRows = data.projects.filter((project) => projectFilter === 'ALL' || project.id === projectFilter).slice(0, 3).map((project) => {
    const units = data.units.filter((unit) => unit.project_id === project.id);
    const available = units.filter((unit) => unit.status === 'AVAILABLE').length;
    const sold = units.filter((unit) => unit.status === 'SOLD').length;
    return { project, units, available, sold, percentSold: units.length ? Math.round(sold / units.length * 100) : 0 };
  });
  const realtorRows = data.realtors.slice(0, 5).map((realtor) => {
    const commissions = data.commissions.filter((commission) => commission.realtor_id === realtor.id);
    const saleIds = [...new Set(commissions.map((commission) => commission.sale_id).filter((saleId): saleId is string => Boolean(saleId)))];
    const attributedValue = scopedSales.filter((sale) => saleIds.includes(sale.id)).reduce((sum, sale) => sum + Number(sale.sale_price || 0), 0);
    return { realtor, saleCount: saleIds.length, attributedValue };
  });
  const activityRows = data.activity.slice(0, 5);

  const revenue = data.sales.filter((s) => s.status === 'COMPLETED').reduce((a, s) => a + (s.sale_price ?? 0), 0);
  const pipeline = data.sales.filter((s) => ['RESERVED', 'DEPOSIT_PAID'].includes(s.status)).reduce((a, s) => a + (s.sale_price ?? 0), 0);
  const committedInvest = data.investments.filter((i) => i.status === 'COMMITTED').reduce((a, i) => a + (i.amount_interested ?? 0), 0);
  const pendingComm = data.commissions.filter((c) => c.status === 'PENDING').reduce((a, c) => a + c.amount, 0);
  const dueFollowUps = data.leads.filter((lead) => lead.next_action_at && new Date(lead.next_action_at).getTime() <= Date.now() && !['CONVERTED', 'LOST'].includes(lead.status)).length;
  const unreadEnquiries = data.leads.filter((lead) => lead.status === 'NEW').length;
  const overduePayments = data.installments.filter((item) => item.status !== 'PAID' && new Date(item.due_date) < new Date(new Date().toDateString())).length;
  const dueToday = data.leads.filter((lead) => lead.next_action_at && new Date(lead.next_action_at).toDateString() === new Date().toDateString()).length;

  const statCards = [
    { label: 'Completed Revenue', value: fmtKes(revenue), sub: `${data.sales.filter((s) => s.status === 'COMPLETED').length} sales`, color: 'text-[#2e6b3e]', tab: 'sales' as AdminTab },
    { label: 'Sales Pipeline', value: fmtKes(pipeline), sub: `${data.sales.filter((s) => ['RESERVED', 'DEPOSIT_PAID'].includes(s.status)).length} active`, color: 'text-[#2e5f7a]', tab: 'sales' as AdminTab },
    { label: 'New Leads', value: String(data.leads.filter((l) => l.status === 'NEW').length), sub: `${data.leads.length} total`, color: 'text-[#3a6f69]', tab: 'leads' as AdminTab },
    { label: 'Committed Investment', value: fmtKes(committedInvest), sub: `${data.investments.filter((i) => i.status === 'COMMITTED').length} investors`, color: 'text-[#6b2e7a]', tab: 'investments' as AdminTab },
    { label: 'Active Realtors', value: String(data.realtors.filter((r) => r.status === 'ACTIVE').length), sub: `${data.realtors.length} total`, color: 'text-[#856b2e]', tab: 'realtors' as AdminTab },
    { label: 'Commissions Pending', value: fmtKes(pendingComm), sub: `${data.commissions.filter((c) => c.status === 'PENDING').length} unpaid`, color: 'text-[#7a4e2e]', tab: 'commissions' as AdminTab },
    { label: 'Available Units', value: String(data.units.filter((u) => u.status === 'AVAILABLE').length), sub: `${data.units.filter((u) => u.status === 'SOLD').length} sold`, color: 'text-[#20afd1]', tab: 'units' as AdminTab },
    { label: 'Investment Inquiries', value: String(data.investments.filter((i) => i.status === 'INQUIRY').length), sub: 'need follow-up', color: 'text-slate-500', tab: 'investments' as AdminTab },
    { label: 'Follow-ups Due', value: String(dueFollowUps), sub: 'action required', color: 'text-[#a55445]', tab: 'leads' as AdminTab },
  ];

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[9px] font-semibold text-[#54717c]">Dashboard <span className="ml-1 text-[#078b91]">⌄</span></p><h2 className="font-serif text-3xl font-semibold leading-tight text-[#123b4b]">Executive Overview</h2><p className="mt-1 text-xs text-[#55717d]">Real-time insights into sales, collections, leads and project performance.</p></div>
        <div className="flex flex-wrap items-center gap-2"><label className="relative"><CalendarDays size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4d7180]" /><select aria-label="Overview date range" value={dateRange} onChange={(event) => setDateRange(event.target.value)} className="admin-input h-8 min-w-32 pl-8 pr-7 text-[10px]"><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="365">Last 12 months</option></select></label><label className="relative"><select aria-label="Overview project filter" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} className="admin-input h-8 min-w-36 pr-7 text-[10px]"><option value="ALL">All projects</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><button type="button" onClick={() => void downloadReportPdf(`nbg-executive-overview-${new Date().toISOString().slice(0, 10)}.pdf`, ['Metric', 'Value'], [['Revenue collected', paidInPeriod], ['Pipeline value', pipelineValue], ['New leads', periodLeads.length], ['Outstanding receivables', receivables]], 'Executive Overview')} className="btn-secondary h-8 !px-3 !py-1.5 text-[10px]"><Download size={13} />Export report</button></div>
      </header>

      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Executive overview metrics">
        {[
          { label: 'Revenue collected', value: accountingKes(paidInPeriod), change: revenueChange, icon: CircleCheck, color: 'text-[#0a8293]', fill: 'bg-[#ddf4f2]', spark: chartBuckets.map((bucket) => bucket.revenue) },
          { label: 'Pipeline value', value: accountingKes(pipelineValue), change: pipelineChange, icon: TrendingUp, color: 'text-[#0d6f9e]', fill: 'bg-[#e2f4f1]', spark: chartBuckets.map((bucket) => bucket.sales) },
          { label: 'New leads', value: String(periodLeads.length), change: leadChange, icon: Users, color: 'text-[#168b8a]', fill: 'bg-[#dcf4f1]', spark: funnelRows.slice(0, 4).map((row) => row.count) },
          { label: 'Outstanding receivables', value: accountingKes(receivables), change: overdueInstallments.length ? 6 : 0, icon: AlertCircle, color: 'text-[#c54350]', fill: 'bg-[#fde9ea]', spark: overdueInstallments.map((item) => Number(item.amount) - Number(item.paid_amount)) },
        ].map(({ label, value, change, icon: Icon, color, fill, spark }) => {
          const highest = Math.max(...spark, 1);
          const points = spark.map((amount, index) => `${index * 25},${25 - amount / highest * 20}`).join(' ');
          return <button key={label} type="button" onClick={() => goTo(label === 'New leads' ? 'leads' : label === 'Pipeline value' || label === 'Revenue collected' ? 'sales' : 'payments')} className="flex min-h-[88px] items-center gap-3 border border-[#dce3e3] bg-white px-3 py-3 text-left shadow-[0_1px_4px_rgba(26,55,65,.05)] transition hover:border-[#20aeb2]">
            <span className={`grid size-9 shrink-0 place-items-center rounded-full ${fill} ${color}`}><Icon size={17} /></span><span className="min-w-0 flex-1"><span className="block text-[10px] font-semibold text-[#31546b]">{label}</span><strong className="mt-0.5 block truncate font-serif text-xl text-[#123b4b]">{value}</strong><span className={`mt-0.5 block text-[9px] font-semibold ${label === 'Outstanding receivables' ? 'text-[#c54350]' : 'text-[#198b78]'}`}>{change >= 0 ? '↑' : '↓'} {Math.abs(change)}% <span className="font-normal text-slate-400">vs. previous period</span></span></span><svg viewBox="0 0 75 28" className="hidden h-7 w-[60px] shrink-0 sm:block" aria-hidden="true"><polyline points={points} fill="none" stroke={label === 'Outstanding receivables' ? '#ff7474' : '#4ac8c6'} strokeWidth="1.6" /></svg>
          </button>;
        })}
      </section>

      <section className="grid gap-2.5 xl:grid-cols-[1.45fr_1fr]">
        <article className="min-w-0 border border-[#dce3e3] bg-white p-3 shadow-[0_1px_4px_rgba(26,55,65,.05)]"><div className="flex items-center justify-between gap-3"><h3 className="font-serif text-base font-semibold text-[#123b4b]">Sales &amp; collections performance</h3><div className="flex gap-3 text-[9px] text-[#55717d]"><span><i className="mr-1 inline-block size-2 rounded-sm bg-[#18b7a7]" />Revenue collected</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-[#1773b5]" />New sales</span></div></div>
          <div className="relative mt-2 h-[148px] border-b border-l border-[#dfe8e9] pl-2"><div className="absolute inset-x-2 top-0 flex h-full flex-col justify-between text-[8px] text-[#8398a0]"><span>{accountingAxis(maxChartRevenue)}</span><span>{accountingAxis(maxChartRevenue * .75)}</span><span>{accountingAxis(maxChartRevenue * .5)}</span><span>{accountingAxis(maxChartRevenue * .25)}</span><span>0</span></div><div className="absolute inset-y-0 left-10 right-3 grid grid-cols-4 items-end gap-3 border-t border-[#edf1f1] bg-[linear-gradient(to_bottom,transparent_24.5%,#edf1f1_25%,transparent_25.5%,transparent_49.5%,#edf1f1_50%,transparent_50.5%,transparent_74.5%,#edf1f1_75%,transparent_75.5%)]">{chartBuckets.map((bucket, index) => <div key={`${bucket.label}-${index}`} className="relative flex h-full items-end justify-center"><span className="w-full max-w-14 bg-[#18b7a7] opacity-90" style={{ height: `${Math.max(bucket.revenue / maxChartRevenue * 88, bucket.revenue ? 4 : 0)}%` }} title={`${bucket.label}: ${accountingKes(bucket.revenue)}`} /><span className="absolute -bottom-4 text-[8px] text-[#587785]">{bucket.label}</span></div>)}<svg viewBox="0 0 100 60" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-label="New sales trend"><polyline points={salesLinePoints} fill="none" stroke="#1773b5" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />{chartBuckets.map((bucket, index) => <circle key={`${bucket.label}-${index}`} cx={8 + index * 28} cy={54 - bucket.sales / maxChartSales * 42} r="1.7" fill="#155d96" vectorEffect="non-scaling-stroke" />)}</svg></div></div>
          <div className="mt-5 flex justify-between text-[8px] text-[#627f89]"><span>Collections in selected period</span><span>{accountingKes(paidInPeriod)}</span></div>
        </article>
        <article className="border border-[#dce3e3] bg-white p-3 shadow-[0_1px_4px_rgba(26,55,65,.05)]"><div className="flex items-center justify-between"><h3 className="font-serif text-base font-semibold text-[#123b4b]">Lead conversion funnel</h3><button type="button" onClick={() => goTo('leads')} className="text-[9px] font-semibold text-[#078b91] hover:underline">View all</button></div><div className="mt-3 space-y-2">{funnelRows.map(({ status, index, count }) => <div key={status} className="grid grid-cols-[82px_32px_1fr] items-center gap-2 text-[9px]"><span className="truncate text-[#476775]">{status.replace(/_/g, ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</span><strong className="text-right text-[#31546b]">{count}</strong><span className="h-3 overflow-hidden bg-[#f1f4f4]"><span className="block h-full" style={{ width: `${periodLeads.length ? count / periodLeads.length * 100 : 0}%`, backgroundColor: funnelColors[index] }} /></span></div>)}</div></article>
      </section>

      <section className="grid gap-2.5 xl:grid-cols-[1.45fr_1fr]">
        <article className="min-w-0 border border-[#dce3e3] bg-white p-3 shadow-[0_1px_4px_rgba(26,55,65,.05)]"><div className="flex items-center justify-between gap-3"><h3 className="font-serif text-base font-semibold text-[#123b4b]">Daily operations &amp; priority queue</h3><button type="button" onClick={() => goTo('leads')} className="text-[9px] font-semibold text-[#078b91] hover:underline">View all</button></div><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[510px] text-left text-[9px]"><thead className="bg-[#f5f7f7] text-[#67818a]"><tr>{['Priority', 'Task', 'Assigned to', 'Due date', 'Status', 'Action'].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{operations.map((item) => <tr key={item.task} className="border-t border-[#eaf0f0]"><td className="px-2 py-2"><span className={`rounded-full px-2 py-1 text-[8px] font-semibold ${item.priority === 'High' ? 'bg-[#fde8e8] text-[#c54550]' : item.priority === 'Medium' ? 'bg-[#fff1d9] text-[#a96b0c]' : 'bg-[#e5f0fb] text-[#4c75a3]'}`}>{item.priority}</span></td><td className="px-2 py-2 font-semibold text-[#31546b]">{item.task}</td><td className="px-2 py-2 text-[#6c8790]">{item.assigned}</td><td className="px-2 py-2 text-[#6c8790]">{item.due}</td><td className="px-2 py-2"><span className={`rounded-full px-2 py-1 text-[8px] ${item.status === 'Overdue' ? 'bg-[#fde8e8] text-[#c54550]' : item.status === 'Pending' ? 'bg-[#fff1d9] text-[#a96b0c]' : 'bg-[#edf3f5] text-[#66808b]'}`}>{item.status}</span></td><td className="px-2 py-2"><button type="button" onClick={() => goTo(item.tab)} className="whitespace-nowrap border border-[#cfe1e4] px-2 py-1 font-semibold text-[#078ba5] hover:bg-[#f1faf9]">Review queue <ChevronRight size={10} className="ml-1 inline" /></button></td></tr>)}</tbody></table></div></article>
        <article className="border border-[#dce3e3] bg-white p-3 shadow-[0_1px_4px_rgba(26,55,65,.05)]"><div className="flex items-center justify-between"><h3 className="font-serif text-base font-semibold text-[#123b4b]">Portfolio snapshot</h3><button type="button" onClick={() => goTo('units')} className="text-[9px] font-semibold text-[#078b91] hover:underline">View all</button></div><div className="mt-2 divide-y divide-[#e9eeee]">{portfolioRows.map(({ project, units, available, sold, percentSold }) => <div key={project.id} className="grid grid-cols-[38px_minmax(90px,1fr)_72px_minmax(70px,1.4fr)_28px] items-center gap-2 py-2"><span className="grid size-9 place-items-center overflow-hidden bg-[#e5f0ee]">{project.image_url ? <img src={project.image_url} alt="" className="h-full w-full object-cover" /> : <Building2 size={16} className="text-[#178a8d]" />}</span><span className="min-w-0"><strong className="block truncate text-[9px] text-[#31546b]">{project.name}</strong><span className="block truncate text-[8px] text-slate-400">{project.location || 'Location pending'}</span></span><span className="text-[8px] text-[#587785]">{available} / {units.length} avail.</span><span className="h-2 overflow-hidden bg-[#edf1f2]"><span className="block h-full bg-[#16a9b0]" style={{ width: `${percentSold}%` }} /></span><strong className="text-right text-[8px] text-[#587785]">{sold}</strong></div>)}{portfolioRows.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Project inventory will appear here.</p>}</div><div className="mt-1 flex justify-between border-t border-[#e9eeee] pt-2 text-[8px] text-slate-400"><span>Project</span><span>Available / total</span><span>Sold</span></div></article>
      </section>

      <section className="grid gap-2.5 xl:grid-cols-[1.1fr_1fr_1fr]">
        <article className="min-w-0 border border-[#dce3e3] bg-white p-3 shadow-[0_1px_4px_rgba(26,55,65,.05)]"><div className="flex items-center justify-between"><h3 className="font-serif text-base font-semibold text-[#123b4b]">Recent leads</h3><button type="button" onClick={() => goTo('leads')} className="text-[9px] font-semibold text-[#078b91] hover:underline">View all</button></div><div className="mt-2 overflow-x-auto"><table className="w-full min-w-[300px] text-left text-[8px]"><thead className="text-[#78909a]"><tr>{['Name', 'Project / unit', 'Source', 'Status', 'Time'].map((label) => <th key={label} className="px-1.5 py-1.5 font-medium">{label}</th>)}</tr></thead><tbody>{periodLeads.slice(0, 5).map((lead) => <tr key={lead.id} className="border-t border-[#edf1f1]"><td className="px-1.5 py-2 font-semibold text-[#31546b]">{lead.name}</td><td className="max-w-[100px] truncate px-1.5 py-2 text-[#67818a]">{[lead.project, lead.unit].filter(Boolean).join(' · ') || '—'}</td><td className="px-1.5 py-2 text-[#67818a]">{lead.source || '—'}</td><td className="px-1.5 py-2"><span className={`rounded-full px-1.5 py-1 text-[7px] ${LEAD_STATUS_COLORS[lead.status] || 'bg-[#e8eef0] text-[#607983]'}`}>{lead.status.replace(/_/g, ' ')}</span></td><td className="px-1.5 py-2 whitespace-nowrap text-[#78909a]">{new Date(lead.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</td></tr>)}</tbody></table>{periodLeads.length === 0 && <p className="py-5 text-center text-[10px] text-slate-400">No leads in this period.</p>}</div></article>
        <article className="min-w-0 border border-[#dce3e3] bg-white p-3 shadow-[0_1px_4px_rgba(26,55,65,.05)]"><div className="flex items-center justify-between"><h3 className="font-serif text-base font-semibold text-[#123b4b]">Top-performing realtors</h3><button type="button" onClick={() => goTo('realtors')} className="text-[9px] font-semibold text-[#078b91] hover:underline">View all</button></div><div className="mt-2 grid grid-cols-[minmax(100px,1.3fr)_45px_minmax(70px,1fr)_12px] gap-2 border-b border-[#edf1f1] pb-1 text-[8px] text-[#78909a]"><span>Realtor</span><span>Sales</span><span>Total value</span><span /></div><div>{realtorRows.map(({ realtor, saleCount, attributedValue }, index) => <button key={realtor.id} type="button" onClick={() => goTo('realtors')} className="grid w-full grid-cols-[minmax(100px,1.3fr)_45px_minmax(70px,1fr)_12px] items-center gap-2 border-b border-[#edf1f1] py-2 text-left text-[8px] hover:bg-[#f8fbfa]"><span className="flex min-w-0 items-center gap-1.5"><span className={`grid size-5 shrink-0 place-items-center rounded-full text-[7px] font-bold text-white ${['bg-[#185b80]', 'bg-[#296a89]', 'bg-[#407a8e]', 'bg-[#285b72]', 'bg-[#4f7485]'][index % 5]}`}>{realtor.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="truncate font-semibold text-[#31546b]">{realtor.name}</span></span><span className="text-[#587785]">{saleCount}</span><span className="truncate text-[#587785]">{accountingKes(attributedValue)}</span><ChevronRight size={11} className="text-[#078b91]" /></button>)}{realtorRows.length === 0 && <p className="py-5 text-center text-[10px] text-slate-400">No realtor activity yet.</p>}</div></article>
        <article className="border border-[#dce3e3] bg-white p-3 shadow-[0_1px_4px_rgba(26,55,65,.05)]"><div className="flex items-center justify-between"><h3 className="font-serif text-base font-semibold text-[#123b4b]">Recent activity</h3><button type="button" onClick={() => goTo('audit')} className="text-[9px] font-semibold text-[#078b91] hover:underline">View all</button></div><div className="mt-2 space-y-2">{activityRows.map((activity, index) => <div key={activity.id} className="flex gap-2"><span className={`grid size-6 shrink-0 place-items-center rounded-full ${['bg-[#ddf3ef] text-[#078b91]', 'bg-[#e5f2fc] text-[#277fa2]', 'bg-[#f2e8fb] text-[#8b5fbe]', 'bg-[#e7f4ec] text-[#3d9667]', 'bg-[#fef0dd] text-[#b67823]'][index % 5]}`}><CircleCheck size={12} /></span><div className="min-w-0 flex-1 border-b border-[#edf1f1] pb-2"><p className="truncate text-[9px] font-semibold text-[#31546b]">{activity.action.replace(/_/g, ' ')} · {activity.entity_label || activity.entity_type.replace(/_/g, ' ')}</p><p className="mt-0.5 truncate text-[8px] text-[#78909a]">{activity.category} · {activity.actor_email || 'NBG team'}</p></div><time className="shrink-0 text-[8px] text-[#8da0a6]">{new Date(activity.created_at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</time></div>)}{activityRows.length === 0 && <p className="py-5 text-center text-[10px] text-slate-400">Recent operational activity will appear here.</p>}</div></article>
      </section>

      <nav aria-label="Executive quick actions" className="flex flex-wrap items-center gap-2 border border-[#dce3e3] bg-white px-3 py-2 shadow-[0_1px_4px_rgba(26,55,65,.05)]"><strong className="mr-2 text-[10px] text-[#31546b]">Quick actions</strong><button type="button" onClick={() => goTo('leads')} className="btn-secondary !h-7 !px-2.5 !py-1 text-[9px]"><Plus size={12} />Add lead</button><button type="button" onClick={() => goTo('payments')} className="btn-secondary !h-7 !px-2.5 !py-1 text-[9px]"><Users size={12} />Add buyer</button><button type="button" onClick={() => goTo('payments')} className="btn-secondary !h-7 !px-2.5 !py-1 text-[9px]"><CreditCard size={12} />Record payment</button><button type="button" onClick={() => goTo('updates')} className="btn-secondary !h-7 !px-2.5 !py-1 text-[9px]"><Upload size={12} />Publish site update</button></nav>

    <div className="hidden">
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

      <section className="rounded-lg border border-[#a9d9d8] bg-[#eefbf9] p-6 shadow-sm"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-[#087f88]">Today at NBG</p><h2 className="mt-2 font-serif text-3xl">Daily operations queue</h2><p className="mt-2 text-sm text-slate-600">The actions most likely to need attention before the day closes.</p></div><button onClick={() => void downloadReportPdf(`nbg-daily-operations-${new Date().toISOString().slice(0, 10)}.pdf`, ['Metric', 'Count'], [['New enquiries', unreadEnquiries], ['Follow-ups due today', dueToday], ['Overdue follow-ups', dueFollowUps], ['Overdue payments', overduePayments]], 'Daily Operations Report')} className="btn-secondary"><FileDown size={15} /> Export daily report PDF</button></div><div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><button onClick={() => goTo('leads')} className="rounded border border-[#a9d9d8] bg-white p-4 text-left"><p className="eyebrow text-slate-500">New enquiries</p><p className="mt-2 font-serif text-3xl text-[#087f88]">{unreadEnquiries}</p><p className="mt-1 text-xs text-slate-500">Open lead queue</p></button><button onClick={() => goTo('leads')} className="rounded border border-[#a9d9d8] bg-white p-4 text-left"><p className="eyebrow text-slate-500">Due today</p><p className="mt-2 font-serif text-3xl text-[#856b2e]">{dueToday}</p><p className="mt-1 text-xs text-slate-500">Scheduled follow-ups</p></button><button onClick={() => goTo('leads')} className="rounded border border-[#e4b8ad] bg-white p-4 text-left"><p className="eyebrow text-slate-500">Overdue follow-ups</p><p className="mt-2 font-serif text-3xl text-[#a55445]">{dueFollowUps}</p><p className="mt-1 text-xs text-slate-500">Needs action</p></button><button onClick={() => goTo('payments')} className="rounded border border-[#e4b8ad] bg-white p-4 text-left"><p className="eyebrow text-slate-500">Pending payments</p><p className="mt-2 font-serif text-3xl text-[#a55445]">{overduePayments}</p><p className="mt-1 text-xs text-slate-500">Overdue installments</p></button></div></section>

      <section>
        <div className="mb-4 flex items-end justify-between"><div><p className="eyebrow text-[#20afd1]">Quick management</p><h2 className="mt-2 font-serif text-3xl">Content and people</h2></div><p className="text-xs text-slate-500">Open a section to manage records and publish changes.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { tab: 'projects' as AdminTab, title: 'Projects', detail: 'Upload hero images and publish developments.', icon: Construction },
            { tab: 'units' as AdminTab, title: 'Units & prices', detail: 'Manage floor sequence, prices, photos, and status.', icon: Building2 },
            { tab: 'updates' as AdminTab, title: 'Site updates', detail: 'Upload progress photos and edit published notes.', icon: Upload },
            { tab: 'realtors' as AdminTab, title: 'Realtors', detail: 'Register agents and track their 3% earnings.', icon: Award },
            { tab: 'investments' as AdminTab, title: 'Investors', detail: 'Record interest, amounts, and follow-up status.', icon: TrendingUp },
          ].map(({ tab, title, detail, icon: Icon }) => <button key={tab} onClick={() => goTo(tab)} className="group rounded-lg border border-[#c9c5bd] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#20afd1] hover:shadow-md"><Icon size={20} className="text-[#20afd1]" /><h3 className="mt-8 text-lg">{title}</h3><p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p><span className="mt-5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[.12em] text-[#247b85]">Open section <ArrowRight size={13} className="transition group-hover:translate-x-1" /></span></button>)}
        </div>
      </section>

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
    </div>
    </div>
  );
}

// ─── Leads ───────────────────────────────────────────────

function LeadsTab({ user }: { user: AdminUser }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [staff, setStaff] = useState<{ id: string; full_name: string | null; role: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [followupFilter, setFollowupFilter] = useState('OVERDUE');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [slaAlerts, setSlaAlerts] = useState<{ id: string; title: string; body: string; created_at: string; read_at: string | null }[]>([]);
  const selectedContactDraft = selected ? createLeadContactDraft(selected) : null;

  const load = useCallback(async () => {
    const [leadResult, staffResult, projectResult] = await Promise.all([
      supabase.from('leads').select('*').order('created_at', { ascending: false }),
      supabase.rpc('get_lead_assignees'),
      supabase.from('projects').select('id,name,is_published').eq('is_published', true).order('name'),
    ]);
    setLeads((leadResult.data ?? []) as Lead[]);
    setStaff(((staffResult.data ?? []) as { user_id: string; full_name: string | null; role: string }[]).map((row) => ({ id: row.user_id, full_name: row.full_name, role: row.role })));
    setProjects((projectResult.data ?? []) as Project[]);
    const { data: alerts } = await supabase.from('client_notifications').select('id,title,body,created_at,read_at').eq('user_id', user.id).eq('kind', 'LEAD_SLA_ALERT').order('created_at', { ascending: false }).limit(8);
    setSlaAlerts((alerts ?? []) as typeof slaAlerts);
    setLoading(false);
  }, [user.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel('admin-leads-overview')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lead_assignee_directory_events' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);
  useEffect(() => {
    const refreshAfterLeadAction = () => { void load(); };
    window.addEventListener('nbg-lead-activity-recorded', refreshAfterLeadAction);
    return () => window.removeEventListener('nbg-lead-activity-recorded', refreshAfterLeadAction);
  }, [load]);

  const filtered = useMemo(() => leads.filter((l) => {
    const q = search.toLowerCase();
    return (statusFilter === 'ALL' || l.status === statusFilter) &&
      (!q || l.name.toLowerCase().includes(q) || (l.email ?? '').toLowerCase().includes(q) || (l.phone ?? '').includes(q));
  }), [leads, search, statusFilter]);
  const todayDate = kenyaCalendarDate();
  const nowMs = Date.now();
  const activeLeads = leads.filter((lead) => !['CONVERTED', 'LOST'].includes(lead.status));
  const followupRows = activeLeads.map((lead) => {
    const lastActionAt = lead.last_action_at || lead.stage_entered_at || lead.created_at;
    const lastActionMs = new Date(lastActionAt).getTime();
    const dueMs = lead.next_action_at ? new Date(lead.next_action_at).getTime() : lastActionMs + 48 * 60 * 60 * 1000;
    const dueDate = new Date(dueMs);
    const overdue = dueMs <= nowMs;
    const hoursOverdue = overdue ? Math.max(1, Math.floor((nowMs - dueMs) / 3600000)) : 0;
    const localDueDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(dueDate);
    const dueToday = !overdue && localDueDate === todayDate;
    const unassigned = !lead.assigned_consultant_user_id && !lead.assigned_consultant;
    const dueSoon = !overdue && !dueToday && dueMs <= nowMs + 3 * 86400000;
    return { lead, dueMs, dueDate, overdue, hoursOverdue, dueToday, unassigned, dueSoon, lastActionAt };
  }).sort((left, right) => Number(right.overdue) - Number(left.overdue) || left.dueMs - right.dueMs);
  const followupCounts = {
    overdue: followupRows.filter((row) => row.overdue).length,
    dueToday: followupRows.filter((row) => row.dueToday).length,
    unassigned: followupRows.filter((row) => row.unassigned).length,
    dueSoon: followupRows.filter((row) => row.dueSoon).length,
  };
  const visibleFollowups = followupRows.filter((row) => followupFilter === 'ALL' || (followupFilter === 'OVERDUE' && row.overdue) || (followupFilter === 'UNASSIGNED' && row.unassigned) || (followupFilter === 'TODAY' && row.dueToday) || (followupFilter === 'SOON' && row.dueSoon)).slice(0, 5);
  const pageSize = 5;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageLeads = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const updateStatus = async (id: string, status: string) => {
    const currentStatus = leads.find((lead) => lead.id === id)?.status;
    const currentIndex = LEAD_STATUSES.indexOf(currentStatus as typeof LEAD_STATUSES[number]);
    const nextIndex = LEAD_STATUSES.indexOf(status as typeof LEAD_STATUSES[number]);
    if (status === 'CONVERTED' && currentStatus !== 'NEGOTIATING') { notifyAdmin('Move the lead through Negotiating before recording a Won outcome.', 'error'); return; }
    if (!['CONVERTED', 'LOST'].includes(status) && nextIndex > currentIndex + 1) { notifyAdmin('Progress leads one stage at a time.', 'error'); return; }
    const terminal = status === 'CONVERTED' || status === 'LOST';
    const outcomeNotes = terminal ? window.prompt(`${status === 'CONVERTED' ? 'Record the win result (agreement, value, or close details)' : 'Record why this lead was lost'}:`)?.trim() : '';
    if (terminal && !outcomeNotes) return;
    const changes = { status, outcome: status === 'CONVERTED' ? 'WON' : status === 'LOST' ? 'LOST' : null, outcome_notes: terminal ? outcomeNotes : null };
    const { error } = await supabase.from('leads').update(changes).eq('id', id);
    if (error) { notifyAdmin(`Lead stage could not be updated: ${error.message}`, 'error'); return; }
    setLeads((p) => p.map((l) => l.id === id ? { ...l, ...changes, stage_entered_at: new Date().toISOString(), last_action_at: new Date().toISOString() } : l));
    if (selected?.id === id) setSelected((s) => s ? { ...s, ...changes, stage_entered_at: new Date().toISOString(), last_action_at: new Date().toISOString() } : s);
    await recordLeadActivity(id, 'STAGE_CHANGE', null, `Lead progressed to ${status.replace('_', ' ')}${terminal ? ` · ${changes.outcome}: ${outcomeNotes}` : ''}`);
  };

  const saveNotes = async (id: string, notes: string) => {
    await supabase.from('leads').update({ notes }).eq('id', id);
    setLeads((p) => p.map((l) => l.id === id ? { ...l, notes } : l));
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="font-serif text-3xl font-semibold text-[#123b4b]">Leads</h2><p className="mt-1 text-xs text-[#55717d]">Manage your leads, track follow-ups and move them through your sales pipeline.</p></div>
        <div className="flex flex-wrap items-center gap-2"><select aria-label="Filter leads by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="admin-input h-8 min-w-36 text-[10px]"><option value="ALL">All statuses</option>{LEAD_STATUSES.map((stage) => <option key={stage} value={stage}>{stage.replace(/_/g, ' ')}</option>)}</select><span className="text-[10px] text-[#7b9299]">{leads.length} leads · {followupCounts.overdue} over 48h without action</span><button type="button" onClick={() => { const exportRows = selectedIds.length ? leads.filter((lead) => selectedIds.includes(lead.id)) : filtered; void downloadReportPdf('nbg-leads.pdf', ['Name', 'Email', 'Phone', 'Status', 'Owner', 'Next action', 'Due'], exportRows.map((lead) => [lead.name, lead.email, lead.phone, lead.status, lead.assigned_consultant, lead.next_action, lead.next_action_at]), 'Lead Register'); }} className="btn-primary h-8 !px-3 !py-1.5 text-[9px]"><Download size={13} />Export PDF</button></div>
      </header>

      <section className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7" aria-label="Lead pipeline stages">
        {LEAD_STATUSES.map((stage, index) => {
          const stageCount = leads.filter((lead) => lead.status === stage).length;
          const StageIcon = [Users, Phone, Award, CalendarDays, TrendingUp, CircleCheck, X][index];
          const tones = ['bg-[#e3f0ff] text-[#2779c2]', 'bg-[#e0f5f0] text-[#15917e]', 'bg-[#f0e8fb] text-[#8a5bc1]', 'bg-[#fff0dd] text-[#c3812a]', 'bg-[#e7f0fb] text-[#3b83c4]', 'bg-[#e2f4e9] text-[#298855]', 'bg-[#fde7e8] text-[#c84953]'];
          return <button key={stage} type="button" onClick={() => { setStatusFilter(statusFilter === stage ? 'ALL' : stage); setPage(1); }} className={`flex min-h-[58px] items-center gap-2 border bg-white px-2.5 text-left shadow-[0_1px_3px_rgba(26,55,65,.04)] ${statusFilter === stage ? 'border-[#078b91]' : 'border-[#dce3e3]'}`}><span className={`grid size-8 shrink-0 place-items-center rounded-full ${tones[index]}`}><StageIcon size={15} /></span><span className="min-w-0"><span className="block truncate text-[9px] text-[#52707c]">{stage.replace(/_/g, ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</span><strong className="mt-0.5 block font-serif text-lg leading-none text-[#123b4b]">{stageCount}</strong></span></button>;
        })}
      </section>

      <section className="mb-3 border border-[#dce3e3] bg-white shadow-[0_1px_4px_rgba(26,55,65,.05)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#e8eeee] px-3 py-2"><div className="flex items-center gap-2"><Clock3 size={17} className="text-[#52778b]" /><div><h3 className="text-xs font-semibold text-[#31546b]">Follow-up Command Center</h3><p className="text-[9px] text-[#7b9299]">Keep track of leads that need your attention. Take action to avoid missed opportunities.</p></div></div><ChevronDown size={14} className="rotate-180 text-[#54717c]" /></div>
        <div className="grid grid-cols-2 gap-2 border-b border-[#e8eeee] p-2 sm:grid-cols-4">
          {[{ key: 'OVERDUE', label: 'Overdue', count: followupCounts.overdue, icon: AlertCircle, tone: 'bg-[#fde7e8] text-[#d14852]' }, { key: 'TODAY', label: 'Due today', count: followupCounts.dueToday, icon: CalendarDays, tone: 'bg-[#fff0dc] text-[#bd7820]' }, { key: 'UNASSIGNED', label: 'Unassigned', count: followupCounts.unassigned, icon: Users, tone: 'bg-[#e5f0ff] text-[#347fc1]' }, { key: 'SOON', label: 'Due soon', count: followupCounts.dueSoon, icon: Clock3, tone: 'bg-[#e1f5f0] text-[#16937e]' }].map(({ key, label, count, icon: Icon, tone }) => <button key={key} type="button" onClick={() => setFollowupFilter(key)} className={`flex min-h-[46px] items-center gap-2 border px-2.5 text-left ${followupFilter === key ? 'border-[#9bd1d2] bg-[#f8fdfd]' : 'border-[#e7eeee] bg-white'}`}><span className={`grid size-8 shrink-0 place-items-center rounded-full ${tone}`}><Icon size={14} /></span><span><span className="block text-[9px] text-[#6b8790]">{label}</span><strong className="font-serif text-base leading-none text-[#123b4b]">{count}</strong></span></button>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e8eeee] px-3 py-2 text-[9px]">
          <div className="flex gap-1 overflow-x-auto">{[['OVERDUE', 'All overdue', followupCounts.overdue], ['UNASSIGNED', 'Unassigned', followupCounts.unassigned], ['TODAY', 'Due today', followupCounts.dueToday], ['SOON', 'Due soon', followupCounts.dueSoon]].map(([key, label, count]) => <button key={key} type="button" onClick={() => setFollowupFilter(String(key))} className={`shrink-0 border-b-2 px-2 py-1.5 font-semibold ${followupFilter === key ? 'border-[#0c9da6] text-[#078b91]' : 'border-transparent text-[#7b9299]'}`}>{label}<span className="ml-1 rounded-full bg-[#edf5f5] px-1.5 py-0.5">{count}</span></button>)}</div><span className="text-[#789099]">Showing {visibleFollowups.length} of {followupRows.filter((row) => followupFilter === 'OVERDUE' ? row.overdue : followupFilter === 'UNASSIGNED' ? row.unassigned : followupFilter === 'TODAY' ? row.dueToday : row.dueSoon).length} requiring attention</span>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-[9px]"><thead className="text-[8px] uppercase text-[#82969d]"><tr>{['Lead', 'Stage', 'Overdue by', 'Owner', 'Action'].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>
          {visibleFollowups.map(({ lead, hoursOverdue, overdue, dueToday, unassigned, dueSoon, dueDate }) => <tr key={lead.id} className="border-t border-[#edf1f1] hover:bg-[#f9fbfb]"><td className="px-3 py-2"><button type="button" onClick={() => setSelected(lead)} className="text-left"><strong className="block text-[9px] text-[#31546b]">{lead.name}</strong><span className="mt-0.5 block text-[8px] text-[#84999f]">{lead.email || lead.phone || 'No contact recorded'}{lead.email && lead.phone ? ` · ${lead.phone}` : ''}</span></button></td><td className="px-3 py-2"><span className="rounded-full bg-[#e6f1fb] px-2 py-1 text-[8px] font-semibold text-[#327bb6]">{lead.status.replace(/_/g, ' ')}</span></td><td className="px-3 py-2"><strong className={`block text-[9px] ${overdue ? 'text-[#d14852]' : 'text-[#a97119]'}`}>{overdue ? `${hoursOverdue}h` : dueToday ? 'Due today' : dueSoon ? 'Due soon' : 'Unassigned'}</strong><span className="text-[8px] text-[#82969d]">{overdue ? `since ${new Date(dueDate).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}` : `Due ${new Date(dueDate).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })}`}</span></td><td className="px-3 py-2"><span className="inline-flex items-center gap-1.5 text-[8px] text-[#65818b]"><span className={`grid size-5 place-items-center rounded-full ${unassigned ? 'bg-[#edf1f3] text-[#7c9299]' : 'bg-[#d8f0ee] text-[#087f88]'}`}>{unassigned ? <Users size={11} /> : (lead.assigned_consultant || 'N').split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>{lead.assigned_consultant || 'Unassigned'}</span></td><td className="px-3 py-2"><button type="button" onClick={() => setSelected(lead)} className="min-w-[74px] bg-[#079eae] px-2.5 py-1.5 text-[8px] font-semibold text-white hover:bg-[#078b91]">{unassigned ? 'Assign owner' : 'Log follow-up'}</button><button type="button" onClick={() => setSelected(lead)} aria-label={`Open ${lead.name} actions`} className="ml-2 text-[#64808a]">⋮</button></td></tr>)}
          {visibleFollowups.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-[10px] text-slate-400">No leads in this follow-up view.</td></tr>}
        </tbody></table></div>
      </section>

      <div className="mb-2 grid gap-2 sm:grid-cols-[minmax(180px,1fr)_150px_auto]">
        <label className="relative"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7b9299]" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by name, email, phone..." className="admin-input h-8 w-full pl-8 text-[10px]" aria-label="Search leads" /></label>
        <select aria-label="Filter lead register by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="admin-input h-8 text-[10px]"><option value="ALL">All statuses</option>{LEAD_STATUSES.map((stage) => <option key={stage} value={stage}>{stage.replace(/_/g, ' ')}</option>)}</select>
        <button type="button" onClick={() => { const exportRows = selectedIds.length ? leads.filter((lead) => selectedIds.includes(lead.id)) : filtered; void downloadReportPdf('nbg-leads.pdf', ['Name', 'Email', 'Phone', 'Status', 'Owner', 'Next action', 'Due'], exportRows.map((lead) => [lead.name, lead.email, lead.phone, lead.status, lead.assigned_consultant, lead.next_action, lead.next_action_at]), 'Lead Register'); }} className="btn-secondary h-8 !px-3 !py-1 text-[9px]"><Download size={12} />Export PDF</button>
      </div>

      <div className="overflow-x-auto border border-[#dce3e3] bg-white shadow-[0_1px_4px_rgba(26,55,65,.05)]"><table className="w-full min-w-[920px] text-left text-[9px]"><thead className="border-b border-[#e4ebeb] bg-white text-[8px] uppercase text-[#789099]"><tr><th className="w-8 px-2 py-2"><input type="checkbox" aria-label="Select current lead page" checked={pageLeads.length > 0 && pageLeads.every((lead) => selectedIds.includes(lead.id))} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...new Set([...current, ...pageLeads.map((lead) => lead.id)])] : current.filter((id) => !pageLeads.some((lead) => lead.id === id)))} /></th>{['Name', 'Contact', 'Source', 'Lead journey / SLA', 'Next action', 'Date', 'Actions'].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}</tr></thead><tbody>
        {pageLeads.map((lead) => { const lastActionMs = Math.max(0, nowMs - new Date(lead.last_action_at || lead.stage_entered_at || lead.created_at).getTime()); const stageIndex = Math.max(0, LEAD_STATUSES.indexOf(lead.status as typeof LEAD_STATUSES[number])); const stale = lastActionMs >= 48 * 3600000 && !['CONVERTED', 'LOST'].includes(lead.status); return <tr key={lead.id} className="border-t border-[#edf1f1] hover:bg-[#fafcfc]"><td className="px-2 py-2"><input type="checkbox" aria-label={`Select ${lead.name}`} checked={selectedIds.includes(lead.id)} onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, lead.id] : current.filter((id) => id !== lead.id))} /></td><td className="px-2 py-2 font-semibold text-[#31546b]">{lead.name}</td><td className="px-2 py-2 text-[#769098]">{lead.email || lead.phone || '—'}{lead.email && lead.phone && <span className="mt-0.5 block">{lead.phone}</span>}</td><td className="px-2 py-2 text-[#769098]">{lead.source || '—'}</td><td className="px-2 py-2"><div className="flex items-center gap-1">{LEAD_STATUSES.map((stage, index) => <span key={stage} className={`grid size-4 place-items-center text-[7px] ${stage === lead.status ? 'bg-[#087f88] text-white' : index < stageIndex ? 'bg-[#d9efeb] text-[#287d72]' : 'bg-[#eef2f3] text-[#a4b0b4]'}`}>{index + 1}</span>)}</div><span className="mt-1 block text-[7px] font-semibold uppercase text-[#61808a]">{lead.status.replace(/_/g, ' ')} · {stale ? `Follow-up due · ${Math.floor(lastActionMs / 3600000)}h idle` : `${Math.floor(lastActionMs / 3600000)}h since action`}</span></td><td className="px-2 py-2"><strong className="block text-[#866322]">{lead.next_action || 'Set action'}</strong>{lead.next_action_at && <span className="mt-0.5 block text-[8px] text-[#789099]">Due {fmt(lead.next_action_at)}</span>}</td><td className="px-2 py-2 whitespace-nowrap text-[#789099]">{fmt(lead.created_at)}</td><td className="px-2 py-2"><button type="button" onClick={() => setSelected(lead)} className="font-semibold text-[#078b91] hover:underline">View</button></td></tr>; })}
        {pageLeads.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-[10px] text-slate-400">No leads match your filters.</td></tr>}
      </tbody></table><footer className="flex items-center justify-between gap-3 border-t border-[#e8eeee] px-3 py-2 text-[9px] text-[#789099]"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} leads</span><div className="flex items-center gap-1"><button type="button" aria-label="Previous leads page" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1} className="grid size-7 place-items-center border border-[#dce3e3] disabled:opacity-40"><ChevronLeft size={12} /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).slice(Math.max(0, currentPage - 3), Math.max(5, currentPage + 2)).map((pageNumber) => <button key={pageNumber} type="button" aria-current={pageNumber === currentPage ? 'page' : undefined} onClick={() => setPage(pageNumber)} className={`grid size-7 place-items-center border text-[9px] ${pageNumber === currentPage ? 'border-[#078b91] bg-[#078b91] text-white' : 'border-[#dce3e3]'}`}>{pageNumber}</button>)}<button type="button" aria-label="Next leads page" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage === pageCount} className="grid size-7 place-items-center border border-[#dce3e3] disabled:opacity-40"><ChevronRight size={12} /></button></div></footer></div>

      <div className="hidden">
      {slaAlerts.length > 0 && <section className="mb-5 border border-[#e4b8ad] bg-[#fff7f4] p-4"><div className="flex items-center gap-2"><AlertCircle size={16} className="text-[#a55445]" /><h3 className="text-sm font-semibold text-[#8d332b]">48-hour follow-ups due</h3></div><p className="mt-2 text-xs leading-5 text-slate-600">Open each lead, review contact history, assign an owner and priority, set the next action and due date, then record the call or message as an activity. Progress one stage at a time.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{slaAlerts.map((alert) => { const leadId = alert.body.match(/Lead ID:\s*([0-9a-f-]{36})/i)?.[1]; const lead = leads.find((item) => item.id === leadId); return <button type="button" key={alert.id} onClick={() => { if (lead) setSelected(lead); }} className="border border-[#efd4ce] bg-white p-3 text-left hover:border-[#d58a7d]"><span className="block text-xs font-semibold text-[#8d332b]">{alert.title}</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">{alert.body.replace(/Lead ID:\s*[0-9a-f-]{36}\.\s*/i, '')}</span><span className="mt-2 block text-[9px] font-semibold text-[#087f88]">{lead ? 'Review lead and set next action' : 'Lead may have been removed'}</span><span className="mt-1 block text-[9px] text-slate-400">{fmt(alert.created_at)}</span></button>; })}</div></section>}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, email, phone…" className="admin-input pl-9 w-full" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="admin-input">
          <option value="ALL">All statuses</option>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <p className="flex items-center text-xs text-slate-400">{filtered.length} lead{filtered.length !== 1 ? 's' : ''} · {leads.filter((lead) => !['CONVERTED', 'LOST'].includes(lead.status) && Date.now() - new Date(lead.last_action_at || lead.stage_entered_at || lead.created_at).getTime() >= 48 * 60 * 60 * 1000).length} over 48h without action</p>
        <button onClick={() => void downloadReportPdf('nbg-leads.pdf', ['Name', 'Email', 'Phone', 'Status', 'Owner', 'Next action', 'Due'], filtered.map((lead) => [lead.name, lead.email, lead.phone, lead.status, lead.assigned_consultant, lead.next_action, lead.next_action_at]), 'Lead Register')} className="admin-add-btn flex items-center gap-2"><Download size={14} /> Export PDF</button>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-[#c9c5bd] bg-white px-2 pt-2">{LEAD_STATUSES.map((stage) => <button key={stage} type="button" onClick={() => setStatusFilter(stage)} className={`flex min-h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-[10px] font-semibold uppercase ${statusFilter === stage ? 'border-[#087f88] text-[#087f88]' : 'border-transparent text-slate-500 hover:text-[#123b4b]'}`}><span>{stage.replace('_', ' ')}</span><span className="grid min-w-5 place-items-center bg-[#f0ede6] px-1 py-0.5 text-[9px]">{leads.filter((lead) => lead.status === stage).length}</span></button>)}</div>

      <div className="mt-5 overflow-x-auto rounded-lg border border-[#c9c5bd] bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-[#c9c5bd] bg-[#f0ede6] text-[10px] uppercase tracking-[.12em] text-slate-400">
            <tr>
              {['Name', 'Contact', 'Source', 'Lead journey / SLA', 'Next action', 'Date', ''].map((h) => (
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
                <td className="px-4 py-3"><div className="flex min-w-[220px] flex-wrap items-center gap-1">{LEAD_STATUSES.map((stage, index) => <span key={stage} className={`grid h-5 min-w-5 place-items-center px-1 text-[8px] font-semibold ${stage === lead.status ? 'bg-[#087f88] text-white' : index < LEAD_STATUSES.indexOf(lead.status as typeof LEAD_STATUSES[number]) || ['CONVERTED', 'LOST'].includes(lead.status) && index < 5 ? 'bg-[#dceeea] text-[#3a6f69]' : 'bg-[#f0ede6] text-slate-400'}`} title={stage.replace('_', ' ')}>{index + 1}</span>)}</div><span className="mt-1 block text-[10px] font-semibold text-[#123b4b]">{lead.status.replace('_', ' ')}</span>{!['CONVERTED', 'LOST'].includes(lead.status) && (() => { const lastActionMs = Date.now() - new Date(lead.last_action_at || lead.stage_entered_at || lead.created_at).getTime(); const stageMs = Date.now() - new Date(lead.stage_entered_at || lead.created_at).getTime(); const overdue = lastActionMs >= 48 * 60 * 60 * 1000; return <><span className={`mt-1 inline-flex items-center gap-1 text-[10px] ${overdue ? 'font-semibold text-[#a55445]' : 'text-slate-400'}`}><Clock3 size={11} />{overdue ? `Follow-up due · ${Math.floor(lastActionMs / 3600000)}h idle` : `${Math.floor(lastActionMs / 3600000)}h since action`}</span><small className="mt-1 block text-[9px] text-slate-400">{Math.floor(stageMs / 3600000)}h in this stage</small></>; })()}</td>
                <td className="px-4 py-3 text-xs"><span className={lead.priority === 'URGENT' ? 'font-semibold text-[#a55445]' : lead.priority === 'HIGH' ? 'font-semibold text-[#856b2e]' : 'text-slate-500'}>{lead.next_action ?? 'Set action'}</span>{lead.next_action_at && <span className="mt-1 block text-[10px] text-slate-400">Due {fmt(lead.next_action_at)}</span>}</td>
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
      </div>

      {selected && <LeadDetailDrawer
        key={selected.id}
        lead={selected}
        leads={leads}
        staff={staff}
        projects={projects}
        contactDraft={selectedContactDraft}
        onClose={() => setSelected(null)}
        onStageChange={(status) => void updateStatus(selected.id, status)}
        onLeadUpdate={(changes) => {
          setLeads((current) => current.map((lead) => lead.id === selected.id ? { ...lead, ...changes } : lead));
          setSelected((current) => current ? { ...current, ...changes } : current);
        }}
        onNotesSave={(notes) => saveNotes(selected.id, notes)}
      />}
    </div>
  );
}

type LeadActivity = { id: string; activity_type: string; channel: string | null; body: string; created_at: string };
type LeadDrawerSection = 'lead-details' | 'follow-up-history' | 'activity-timeline' | 'lead-notes';

function LeadDetailDrawer({ lead, leads, staff, projects, contactDraft, onClose, onStageChange, onLeadUpdate, onNotesSave }: {
  lead: Lead;
  leads: Lead[];
  staff: { id: string; full_name: string | null; role: string }[];
  projects: Project[];
  contactDraft: { subject: string; body: string } | null;
  onClose: () => void;
  onStageChange: (status: string) => void;
  onLeadUpdate: (changes: Partial<Lead>) => void;
  onNotesSave: (notes: string) => void;
}) {
  const [activeSection, setActiveSection] = useState<LeadDrawerSection>('lead-details');
  const drawerRef = useRef<HTMLElement>(null);
  const stageStats = LEAD_STATUSES.slice(0, 4).map((status) => ({ status, count: leads.filter((item) => item.status === status).length }));
  const initials = lead.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [onClose]);

  const goToSection = (section: LeadDrawerSection) => {
    setActiveSection(section);
    drawerRef.current?.querySelector<HTMLElement>(`#${section}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const navItems: { id: LeadDrawerSection; label: string; icon: typeof ClipboardList }[] = [
    { id: 'lead-details', label: 'Lead Details', icon: ClipboardList },
    { id: 'follow-up-history', label: 'Follow-up History', icon: Clock3 },
    { id: 'activity-timeline', label: 'Activity Timeline', icon: CircleCheck },
    { id: 'lead-notes', label: 'Notes', icon: FileText },
  ];

  return <div className="fixed inset-0 z-[90] flex justify-end bg-[#092733]/65 backdrop-blur-[2px]" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="lead-drawer-title" className="flex h-[100dvh] w-full flex-col overflow-hidden bg-[#f7fbfb] text-[#123b4b] shadow-2xl md:w-[min(72vw,1100px)]">
      <header className="relative flex min-h-[82px] shrink-0 items-center justify-between overflow-hidden bg-[radial-gradient(ellipse_at_85%_140%,rgba(104,220,207,.45),transparent_42%),linear-gradient(115deg,#087f88,#0b9ca0_55%,#066671)] px-5 py-4 text-white md:px-7">
        <div className="pointer-events-none absolute -right-12 -top-24 size-64 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-4 -top-20 size-48 rounded-full border border-white/10" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-full border border-white/25 bg-white/15 text-lg font-semibold">{initials || <Users size={20} />}</span>
          <div className="min-w-0"><h2 id="lead-drawer-title" className="truncate font-serif text-xl">{lead.name}</h2><div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-white/75"><span className="rounded-full bg-[#70d9ad] px-2 py-0.5 font-semibold uppercase text-[#075a4d]">{lead.status.replace(/_/g, ' ')}</span><span>Lead ID: #{lead.id.slice(0, 8).toUpperCase()}</span></div></div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close lead details" className="relative grid size-9 shrink-0 place-items-center rounded-full text-white/85 transition hover:bg-white/15 hover:text-white"><X size={20} /></button>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[minmax(150px,25%)_minmax(0,1fr)]">
        <aside className="hidden min-h-0 flex-col overflow-y-auto border-r border-[#e0eeee] bg-[#f1f9f9] p-3 md:flex">
          <div className="shrink-0 border-b border-[#dfebeb] px-2 pb-3"><p className="text-sm font-semibold">{lead.name}</p><p className="mt-0.5 truncate text-[10px] text-[#6f8990]">{lead.email || 'Email not provided'}</p>{lead.phone && <a href={`tel:${lead.phone}`} className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-[#087f88]"><Phone size={11} />{lead.phone}</a>}
            <div className="mt-3 grid gap-1.5">{lead.tracking_code ? <a href={`/verify/${encodeURIComponent(lead.tracking_code)}`} target="_blank" rel="noreferrer" className="flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-[#b8d5d6] bg-white px-2 text-[10px] font-semibold text-[#31546b]">View Full Profile <ArrowRight size={12} /></a> : <button type="button" onClick={() => goToSection('lead-details')} className="flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-[#b8d5d6] bg-white px-2 text-[10px] font-semibold text-[#31546b]">View Full Profile <ArrowRight size={12} /></button>}{lead.phone && <a href={`tel:${lead.phone}`} onClick={() => void recordLeadActivity(lead.id, 'CALL', 'phone', 'Called lead')} className="flex min-h-8 items-center justify-center gap-1.5 rounded-md bg-[#087f88] px-2 text-[10px] font-semibold text-white"><Phone size={12} />Call lead</a>}{lead.email && contactDraft && <a href={`mailto:${lead.email}?subject=${encodeURIComponent(contactDraft.subject)}&body=${encodeURIComponent(contactDraft.body)}`} onClick={() => void recordLeadActivity(lead.id, 'EMAIL', 'email', 'Emailed lead')} className="flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-[#b8d5d6] bg-white px-2 text-[10px] font-semibold text-[#31546b]"><Mail size={12} />Email lead</a>}{lead.phone && contactDraft && <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}?text=${encodeURIComponent(contactDraft.body)}`} target="_blank" rel="noreferrer" onClick={() => void recordLeadActivity(lead.id, 'WHATSAPP', 'whatsapp', 'Opened WhatsApp conversation')} className="flex min-h-8 items-center justify-center gap-1.5 rounded-md border border-[#b8d5d6] bg-white px-2 text-[10px] font-semibold text-[#31546b]"><MessageCircle size={12} />WhatsApp</a>}</div>
          </div>
          <nav aria-label="Lead detail sections" className="shrink-0 border-b border-[#dfebeb] py-3">{navItems.map(({ id, label, icon: Icon }) => <button type="button" key={id} onClick={() => goToSection(id)} className={`flex min-h-8 items-center gap-2 rounded-md px-2 text-left text-[10px] font-medium ${activeSection === id ? 'bg-[#087f88] text-white' : 'text-[#65818a] hover:bg-white hover:text-[#087f88]'}`}><Icon size={13} />{label}</button>)}</nav>
          <div className="mt-3 shrink-0 space-y-2 px-1"><p className="px-1 text-[9px] font-semibold uppercase tracking-[.12em] text-[#65818a]">Quick info</p>{[
            ['Source', lead.source || 'Not recorded'],
            ['Project', lead.project || 'Not selected'],
            ['Home type', lead.apartment_type || lead.unit || 'Not selected'],
            ['Owner', lead.assigned_consultant || 'Unassigned'],
            ['Priority', lead.priority || 'NORMAL'],
          ].map(([label, value]) => <div key={label} className="rounded-md border border-[#e0eeee] bg-white px-2 py-1.5"><p className="text-[8px] text-[#78929a]">{label}</p><p className="mt-0.5 truncate text-[9px] font-semibold text-[#31546b]">{value}</p></div>)}</div>
          {lead.tracking_code && <a href={`/verify/${encodeURIComponent(lead.tracking_code)}`} target="_blank" rel="noreferrer" className="mt-auto pt-3 text-[9px] font-semibold text-[#087f88] underline">View client reference</a>}
        </aside>

        <main className="min-h-0 overflow-y-auto p-3 md:p-4">
          <section id="lead-details" className="scroll-mt-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{stageStats.map(({ status, count }) => <div key={status} className="flex min-h-[46px] items-center gap-2 rounded-md border border-[#e5eeee] bg-white px-2"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#e3f4f3] text-[#087f88]"><Users size={13} /></span><div><p className="text-[8px] text-[#6e8790]">{status.replace(/_/g, ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</p><strong className="font-serif text-base leading-none">{count}</strong></div></div>)}</div>
            <div className="mt-2"><LeadJourney lead={lead} onChange={onStageChange} /></div>
            {lead.message && <p className="mt-2 rounded-md border border-[#e4eeee] bg-white px-3 py-2 text-[10px] leading-4 text-[#55717d]">{lead.message}</p>}
            {lead.outcome && <section className="mt-2 rounded-md border border-[#b9dfc1] bg-[#f0faf3] p-3"><p className="text-[9px] font-semibold uppercase text-[#2e6b3e]">Lead outcome · {lead.outcome}</p><p className="mt-1 text-[10px] leading-4 text-slate-600">{lead.outcome_notes || 'Outcome reason was not recorded.'}</p></section>}
            <div className="mt-2"><LeadActionPanel lead={lead} projects={projects} onUpdate={onLeadUpdate} /></div>
          </section>
          <section id="follow-up-history" className="mt-3 scroll-mt-3"><LeadActivityTimeline leadId={lead.id} followUpsOnly /></section>
          <section id="activity-timeline" className="mt-3 scroll-mt-3"><LeadActivityTimeline leadId={lead.id} /></section>
          <section className="mt-3 scroll-mt-3"><LeadFollowUpForm lead={lead} onUpdate={onLeadUpdate} /></section>
          <section id="lead-notes" className="mt-3 scroll-mt-3 rounded-md border border-[#deebeb] bg-white p-3"><NotesField defaultValue={lead.notes ?? ''} onSave={onNotesSave} /></section>
          <section className="mt-3"><LeadOwnerAssignmentPanel lead={lead} staff={staff} onUpdate={onLeadUpdate} /></section>
        </main>
      </div>
    </section>
  </div>;
}

function LeadFollowUpForm({ lead, onUpdate }: { lead: Lead; onUpdate: (changes: Partial<Lead>) => void }) {
  const [note, setNote] = useState('');
  const [type, setType] = useState('CALL');
  const [outcome, setOutcome] = useState('CONTACTED');
  const [followUpAt, setFollowUpAt] = useState(() => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const quickNotes = ['Interested', 'Needs more info', 'Follow up again', 'Not interested'];

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) { setMessage('Add a note before saving this follow-up.'); return; }
    setSaving(true);
    setMessage('');
    const scheduledAt = new Date(followUpAt).toISOString();
    const changes = { next_action: 'Follow up', next_action_at: scheduledAt };
    const { error } = await supabase.from('leads').update(changes).eq('id', lead.id);
    if (error) { setSaving(false); setMessage(`Follow-up could not be scheduled: ${error.message}`); return; }
    onUpdate(changes);
    const details = [`${note.trim()}`, `Outcome: ${outcome.replace(/_/g, ' ')}`, `Follow-up date: ${fmt(scheduledAt)}`].join('\n');
    const saved = await recordLeadActivity(lead.id, 'FOLLOW_UP', type.toLowerCase(), details);
    setSaving(false);
    if (saved) { setNote(''); setMessage('Follow-up saved.'); }
    else setMessage('The next follow-up was scheduled, but its activity could not be recorded.');
  };

  return <section className="rounded-md border border-[#cce7e7] bg-white p-3 shadow-[0_1px_4px_rgba(25,76,81,.04)]">
    <div className="mb-3 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-[#e3f4f3] text-[#087f88]"><Send size={13} /></span><div><h3 className="text-[11px] font-semibold text-[#31546b]">Log Follow-up</h3><p className="text-[8px] text-[#7b9299]">Record interactions and track the next step.</p></div></div>
    <form onSubmit={(event) => void save(event)} className="grid gap-2 sm:grid-cols-2">
      <label className="sm:col-span-1"><span className="mb-1 block text-[8px] font-semibold text-[#54717c]">Follow-up Note <span className="text-[#c44c50]">*</span></span><textarea required rows={3} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add details about the follow-up, discussion, or next steps..." className="admin-input w-full resize-y text-[9px]" /><span className="mt-0.5 block text-right text-[7px] text-[#82969d]">{note.length}/1000</span></label>
      <div className="grid content-start gap-2"><label><span className="mb-1 block text-[8px] font-semibold text-[#54717c]">Follow-up Type <span className="text-[#c44c50]">*</span></span><select value={type} onChange={(event) => setType(event.target.value)} className="admin-input w-full text-[9px]"><option value="CALL">Call</option><option value="EMAIL">Email</option><option value="WHATSAPP">WhatsApp</option><option value="MEETING">Meeting</option><option value="OTHER">Other</option></select></label><label><span className="mb-1 block text-[8px] font-semibold text-[#54717c]">Outcome <span className="text-[#c44c50]">*</span></span><select value={outcome} onChange={(event) => setOutcome(event.target.value)} className="admin-input w-full text-[9px]"><option value="CONTACTED">Contacted</option><option value="NO_ANSWER">No answer</option><option value="INTERESTED">Interested</option><option value="NEEDS_INFORMATION">Needs more information</option><option value="FOLLOW_UP">Follow up again</option><option value="NOT_INTERESTED">Not interested</option></select></label></div>
      <label><span className="mb-1 block text-[8px] font-semibold text-[#54717c]">Date &amp; Time <span className="text-[#c44c50]">*</span></span><input required type="datetime-local" value={followUpAt} onChange={(event) => setFollowUpAt(event.target.value)} className="admin-input w-full text-[9px]" /></label>
      <div><span className="mb-1 block text-[8px] font-semibold text-[#54717c]">Quick Notes</span><div className="flex flex-wrap gap-1">{quickNotes.map((item) => <button key={item} type="button" onClick={() => setNote((current) => current ? `${current}${current.endsWith(' ') ? '' : ' '}${item}.` : `${item}.`)} className="rounded-full border border-[#dceaea] bg-[#f5fbfb] px-2 py-1 text-[7px] font-medium text-[#54717c] hover:border-[#087f88] hover:text-[#087f88]">{item}</button>)}</div></div>
      {message && <p role="status" className={`text-[9px] sm:col-span-2 ${message === 'Follow-up saved.' ? 'text-[#2e6b3e]' : 'text-[#a55445]'}`}>{message}</p>}
      <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => { setNote(''); setType('CALL'); setOutcome('CONTACTED'); const now = new Date(); setFollowUpAt(new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)); setMessage(''); }} className="min-h-8 border border-[#9ccfd0] px-3 text-[9px] font-semibold text-[#087f88]">Cancel</button><button type="submit" disabled={saving || !note.trim()} className="inline-flex min-h-8 items-center gap-1.5 rounded-md bg-[#087f88] px-4 text-[9px] font-semibold text-white disabled:opacity-50"><Check size={12} />{saving ? 'Saving…' : 'Save Follow-up'}</button></div>
    </form>
  </section>;
}

function LeadOwnerAssignmentPanel({ lead, staff, onUpdate }: { lead: Lead; staff: { id: string; full_name: string | null; role: string }[]; onUpdate: (changes: Partial<Lead>) => void }) {
  const [search, setSearch] = useState('');
  const [assigneeId, setAssigneeId] = useState(lead.assigned_consultant_user_id ?? '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const matches = staff.filter((member) => (member.full_name || '').toLowerCase().includes(search.toLowerCase()));
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const assignee = staff.find((member) => member.id === assigneeId);
    const changes = { assigned_consultant: assignee?.full_name || null, assigned_consultant_user_id: assignee?.id || null };
    setSaving(true);
    setMessage('');
    const { error } = await supabase.from('leads').update(changes).eq('id', lead.id);
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    onUpdate(changes);
    const activityNote = note.trim() ? ` · ${note.trim()}` : '';
    const saved = await recordLeadActivity(lead.id, 'OWNER_ASSIGNMENT', null, `Assigned to ${assignee?.full_name || 'Unassigned'}${activityNote}`);
    if (saved) { setNote(''); setMessage('Lead owner updated.'); }
  };

  return <section className="rounded-md border border-[#cce7e7] bg-white p-3 shadow-[0_1px_4px_rgba(25,76,81,.04)]"><div className="mb-3 flex items-center gap-2"><span className="grid size-7 place-items-center rounded-md bg-[#e3f4f3] text-[#087f88]"><Users size={13} /></span><div><h3 className="text-[11px] font-semibold text-[#31546b]">Assign Lead Owner</h3><p className="text-[8px] text-[#7b9299]">Current owner: {lead.assigned_consultant || 'Unassigned'}</p></div></div><form onSubmit={(event) => void save(event)} className="grid gap-2 sm:grid-cols-2"><label><span className="mb-1 block text-[8px] font-semibold text-[#54717c]">Search Staff</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search staff by name" className="admin-input w-full text-[9px]" /></label><label><span className="mb-1 block text-[8px] font-semibold text-[#54717c]">Assign New Owner</span><select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)} className="admin-input w-full text-[9px]"><option value="">Unassigned</option>{matches.map((member) => <option key={member.id} value={member.id}>{member.full_name || member.id} · {member.role}</option>)}</select></label><label className="sm:col-span-2"><span className="mb-1 block text-[8px] font-semibold text-[#54717c]">Assignment Notes <span className="font-normal text-[#82969d]">(optional)</span></span><input maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add context for this assignment" className="admin-input w-full text-[9px]" /></label>{message && <p role="status" className="text-[9px] text-[#2e6b3e] sm:col-span-2">{message}</p>}<button type="submit" disabled={saving} className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-md bg-[#087f88] px-3 text-[9px] font-semibold text-white disabled:opacity-50 sm:col-span-2"><Users size={12} />{saving ? 'Saving…' : 'Assign Owner'}</button></form></section>;
}

async function recordLeadActivity(leadId: string, activityType: string, channel: string | null, body: string): Promise<boolean> {
  const { error } = await supabase.rpc('record_lead_activity', {
    p_lead_id: leadId,
    p_activity_type: activityType,
    p_channel: channel,
    p_body: body,
  });
  if (error) { notifyAdmin(`Activity could not be recorded: ${error.message}`, 'error'); return false; }
  window.dispatchEvent(new CustomEvent('nbg-lead-activity-recorded', { detail: { leadId } }));
  return true;
}

function LeadJourney({ lead, onChange }: { lead: Lead; onChange: (status: string) => void }) {
  const stages = ['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_BOOKED', 'NEGOTIATING', 'CONVERTED', 'LOST'];
  const activeIndex = stages.indexOf(lead.status);
  const staleMs = Date.now() - new Date(lead.last_action_at || lead.stage_entered_at || lead.created_at).getTime();
  const terminal = lead.status === 'CONVERTED' || lead.status === 'LOST';
  return <section className="border border-[#d6efee] bg-[#f8fdfd] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow text-[#087f88]">Lead journey</p><p className="mt-1 text-xs text-slate-500">Every stage resets the 48-hour action clock.</p></div><span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${terminal ? 'text-[#2e6b3e]' : staleMs >= 48 * 60 * 60 * 1000 ? 'text-[#a55445]' : 'text-slate-500'}`}><Clock3 size={12} />{terminal ? `Outcome ${lead.outcome || (lead.status === 'CONVERTED' ? 'WON' : 'LOST')}` : staleMs >= 48 * 60 * 60 * 1000 ? '48h follow-up overdue' : `${Math.floor(staleMs / 3600000)}h in stage`}</span></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{stages.map((stage, index) => { const current = stage === lead.status; const completed = activeIndex > index || terminal && index < 5; const lost = stage === 'LOST' && lead.status === 'LOST'; const blocked = terminal || stage !== 'LOST' && index > activeIndex + 1 || stage === 'CONVERTED' && lead.status !== 'NEGOTIATING'; return <button key={stage} type="button" disabled={blocked} onClick={() => onChange(stage)} aria-current={current ? 'step' : undefined} className={`min-h-10 border px-2 py-2 text-left text-[10px] font-semibold transition-colors disabled:cursor-default disabled:opacity-55 ${current ? 'border-[#087f88] bg-[#087f88] text-white' : lost ? 'border-[#a55445] bg-[#fff2ee] text-[#a55445]' : completed ? 'border-[#a9d9a8] bg-[#effaf0] text-[#2e6b3e]' : 'border-[#d6efee] bg-white text-slate-500 hover:border-[#087f88]'}`}><span className="mr-1 opacity-70">{index + 1}.</span>{stage.replace('_', ' ')}</button>; })}</div>{terminal && <p className="mt-3 text-xs font-semibold text-[#2e6b3e]">Final result recorded: {lead.status === 'CONVERTED' ? 'WON' : 'LOST'}.</p>}</section>;
}

function LeadActivityTimeline({ leadId, followUpsOnly = false }: { leadId: string; followUpsOnly?: boolean }) {
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [note, setNote] = useState('');
  const load = useCallback(async () => { const { data } = await supabase.from('lead_activities').select('id, activity_type, channel, body, created_at').eq('lead_id', leadId).order('created_at', { ascending: false }); setActivities((data ?? []) as typeof activities); }, [leadId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const handleActivityRecorded = (event: Event) => {
      const detail = (event as CustomEvent<{ leadId: string }>).detail;
      if (detail?.leadId === leadId) void load();
    };
    window.addEventListener('nbg-lead-activity-recorded', handleActivityRecorded);
    return () => window.removeEventListener('nbg-lead-activity-recorded', handleActivityRecorded);
  }, [leadId, load]);
  const visibleActivities = followUpsOnly ? activities.filter((activity) => activity.activity_type === 'FOLLOW_UP') : activities;
  const addNote = async () => {
    if (!note.trim()) return;
    const { error } = await supabase.rpc('record_lead_activity', { p_lead_id: leadId, p_activity_type: 'NOTE', p_channel: null, p_body: note.trim() });
    if (error) { notifyAdmin(`Note could not be saved: ${error.message}`, 'error'); return; }
    setNote('');
    await load();
    notifyAdmin('Activity note added.');
  };
  return <section className="rounded-md border border-[#cce7e7] bg-white p-3 shadow-[0_1px_4px_rgba(25,76,81,.04)]"><div className="flex items-center justify-between"><div><p className="text-[11px] font-semibold text-[#31546b]">{followUpsOnly ? 'Follow-up History' : 'Activity Timeline'}</p><p className="text-[8px] text-[#7b9299]">{followUpsOnly ? 'Previously logged follow-ups for this lead.' : 'Recent interactions and notes.'}</p></div><span className="text-[9px] text-slate-400">{visibleActivities.length} events</span></div><div className="mt-3 max-h-48 space-y-3 overflow-y-auto">{visibleActivities.map((activity) => <div key={activity.id} className="border-l-2 border-[#a9d9d8] pl-3"><p className="text-[10px] leading-4 text-[#123b4b]">{activity.body}</p><p className="mt-1 text-[8px] uppercase tracking-[.1em] text-slate-400">{activity.activity_type.replace(/_/g, ' ')}{activity.channel ? ` · ${activity.channel}` : ''} · {fmt(activity.created_at)}</p></div>)}{visibleActivities.length === 0 && <p className="text-[9px] text-slate-400">{followUpsOnly ? 'No follow-ups have been logged for this lead yet.' : 'Contact actions and notes will appear here.'}</p>}</div>{!followUpsOnly && <div className="mt-3 flex gap-2 border-t border-[#e5eeee] pt-3"><input value={note} onChange={(event) => setNote(event.target.value)} className="admin-input min-w-0 flex-1 text-[9px]" placeholder="Add an activity note" /><button onClick={() => void addNote()} aria-label="Add activity note" className="btn-secondary !px-3"><Plus size={14} /></button></div>}</section>;
}

function LeadActionPanel({ lead, projects, onUpdate }: { lead: Lead; projects: Project[]; onUpdate: (changes: Partial<Lead>) => void }) {
  const [f, setF] = useState({ priority: lead.priority ?? 'NORMAL', next_action: lead.next_action ?? 'Call lead', next_action_at: lead.next_action_at ? lead.next_action_at.slice(0, 16) : '', action_project_id: lead.action_project_id ?? '' });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setF((current) => ({ ...current, priority: lead.priority ?? 'NORMAL', next_action: lead.next_action ?? 'Call lead', next_action_at: lead.next_action_at ? lead.next_action_at.slice(0, 16) : '', action_project_id: lead.action_project_id ?? '' }));
  }, [lead.id, lead.priority, lead.next_action, lead.next_action_at, lead.action_project_id]);

  const save = async () => {
    if (f.next_action === 'Send project details' && !f.action_project_id) {
      setMessage('Choose a published project before saving this action.');
      return;
    }
    setSaving(true); setMessage('');
    const changes = { priority: f.priority, next_action: f.next_action || null, next_action_at: f.next_action_at ? new Date(f.next_action_at).toISOString() : null, action_project_id: f.next_action === 'Send project details' ? f.action_project_id : null };
    const { error } = await supabase.from('leads').update(changes).eq('id', lead.id);
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    onUpdate(changes);
    if (f.next_action === 'Send project details') {
      const { data: accountReceived, error: shareError } = await supabase.rpc('share_lead_project_details', { p_lead_id: lead.id, p_project_id: f.action_project_id });
      if (shareError) { setMessage(`Action saved, but project details could not be shared: ${shareError.message}`); return; }
      setMessage(accountReceived ? 'Action saved and project details shared to the client portal and reference page.' : 'Action saved. Project details are available by reference; no matching client account was found.');
    } else {
      const { error: revokeError } = await supabase.rpc('share_lead_project_details', { p_lead_id: lead.id, p_project_id: null });
      if (revokeError) { setMessage(`Action saved, but the old project share could not be removed: ${revokeError.message}`); return; }
      setMessage('Action plan saved.');
    }
    notifyAdmin('Lead action plan saved.');
    await recordLeadActivity(lead.id, 'ACTION_PLAN', null, `Next action: ${f.next_action || 'No action'}${f.action_project_id ? ` · Project ${projects.find((project) => project.id === f.action_project_id)?.name || ''}` : ''}`);
  };

  const markContacted = async () => {
    const last_contacted_at = new Date().toISOString();
    const { error } = await supabase.from('leads').update({ status: 'CONTACTED', last_contacted_at }).eq('id', lead.id);
    if (!error) { onUpdate({ status: 'CONTACTED', last_contacted_at }); notifyAdmin('Lead marked as contacted.'); await recordLeadActivity(lead.id, 'CONTACTED', null, 'Lead marked as contacted'); }
  };

  return <div className="space-y-4 border-y border-[#c9c5bd] py-5">
    <div className="flex items-center justify-between"><p className="eyebrow text-[#20afd1]">Next action</p><button onClick={markContacted} className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#247b85] hover:underline">Mark contacted</button></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="min-w-0"><span className="eyebrow mb-1.5 block text-slate-400">Owner</span><div className="flex h-9 items-center gap-2 rounded border border-[#dce8e8] bg-[#f7fbfb] px-2 text-[10px] text-[#31546b]"><Users size={12} className="shrink-0 text-[#087f88]" /><span className="truncate">{lead.assigned_consultant || 'Unassigned'}</span></div></div><label className="block min-w-0"><span className="eyebrow mb-1.5 block text-slate-400">Priority</span><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className="admin-input w-full">{LEAD_PRIORITIES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block min-w-0"><span className="eyebrow mb-1.5 block text-slate-400">Action</span><select value={f.next_action} onChange={(e) => setF({ ...f, next_action: e.target.value, action_project_id: e.target.value === 'Send project details' ? f.action_project_id : '' })} className="admin-input w-full">{LEAD_ACTIONS.map((item) => <option key={item}>{item}</option>)}</select></label><label className="block min-w-0"><span className="eyebrow mb-1.5 block text-slate-400">Due date</span><input type="datetime-local" value={f.next_action_at} onChange={(e) => setF({ ...f, next_action_at: e.target.value })} className="admin-input w-full" /></label></div>
    {f.next_action === 'Send project details' && <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Published project to share</span><select required value={f.action_project_id} onChange={(event) => setF({ ...f, action_project_id: event.target.value })} className="admin-input w-full"><option value="">Choose a published project...</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><span className="mt-1 block text-[10px] text-slate-400">Only published project information and public documents will be shared.</span></label>}
    {lead.last_contacted_at && <p className="text-[10px] text-slate-400">Last contacted {fmt(lead.last_contacted_at)}</p>}
    {message && <p className={`text-xs ${message === 'Action plan saved.' ? 'text-[#2e6b3e]' : 'text-[#a55445]'}`}>{message}</p>}
    <button onClick={save} disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving…' : 'Save action plan'} <Check size={15} /></button>
  </div>;
}

function BuyerPaymentsTab({ goTo }: { goTo: (tab: AdminTab) => void }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [installments, setInstallments] = useState<BuyerInstallment[]>([]);
  const [payments, setPayments] = useState<BuyerPaymentRecord[]>([]);
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddBuyer, setShowAddBuyer] = useState(false);
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [unitTypeFilter, setUnitTypeFilter] = useState('ALL');
  const [dueFilter, setDueFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('NEWEST');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [openActions, setOpenActions] = useState('');
  const [selected, setSelected] = useState<Sale | null>(null);
  const [selectedPaymentView, setSelectedPaymentView] = useState<PaymentView>('summary');

  const load = useCallback(async () => {
    const [saleResult, installmentResult, paymentResult, unitResult, projectResult] = await Promise.all([
      supabase.from('sales').select('*').order('created_at', { ascending: false }),
      supabase.from('buyer_installments').select('*').order('due_date'),
      supabase.from('buyer_payments').select('id,sale_id,installment_id,amount,payment_date,method,reference,transaction_ref,created_at,notes').order('payment_date', { ascending: false }),
      supabase.from('project_units').select('id,project_id,unit_number,type').order('unit_number'),
      supabase.from('projects').select('id,name'),
    ]);
    setSales((saleResult.data ?? []) as Sale[]);
    setInstallments((installmentResult.data ?? []) as BuyerInstallment[]);
    setPayments((paymentResult.data ?? []) as BuyerPaymentRecord[]);
    setUnits((unitResult.data ?? []) as ProjectUnit[]);
    setProjects((projectResult.data ?? []) as Project[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const channel = supabase.channel('admin-buyer-payments-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buyer_installments' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buyer_payments' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_units' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  if (loading) return <Spinner />;
  const filtered = sales.filter((sale) => { const query = search.toLowerCase(); return !query || sale.buyer_name.toLowerCase().includes(query) || sale.unit_number.toLowerCase().includes(query); });
  const buyerRequestQueue = sales.filter((sale) => sale.unit_id && ['RESERVED', 'DEPOSIT_PAID'].includes(sale.status)).sort((first, second) => (second.created_at || '').localeCompare(first.created_at || ''));
  const totals = sales.reduce((result, sale) => { const rows = installments.filter((item) => item.sale_id === sale.id); result.paid += (sale.deposit_amount ?? 0) + rows.reduce((sum, item) => sum + item.paid_amount, 0); result.balance += Math.max((sale.sale_price ?? 0) - (sale.deposit_amount ?? 0) - rows.reduce((sum, item) => sum + item.paid_amount, 0), 0); result.overdue += rows.filter((item) => item.status !== 'PAID' && new Date(item.due_date) < new Date(new Date().toDateString())).length; return result; }, { paid: 0, balance: 0, overdue: 0 });
  const today = kenyaCalendarDate();
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const directoryRows = sales.filter((sale) => sale.status !== 'CANCELLED').map((sale) => {
    const schedule = installments.filter((item) => item.sale_id === sale.id);
    const receiptTotal = payments.filter((payment) => payment.sale_id === sale.id).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const ledgerTotal = schedule.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0);
    const paid = Math.max(receiptTotal, ledgerTotal);
    const price = Number(sale.sale_price ?? schedule.reduce((sum, item) => sum + Number(item.amount || 0), 0));
    const balance = Math.max(price - paid, 0);
    const nextInstallment = [...schedule].filter((item) => Number(item.amount) > Number(item.paid_amount)).sort((left, right) => left.due_date.localeCompare(right.due_date))[0];
    const overdue = schedule.some((item) => Number(item.amount) > Number(item.paid_amount) && item.due_date < today);
    const daysToDue = nextInstallment ? Math.round((new Date(`${nextInstallment.due_date}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86400000) : null;
    const status = price > 0 && balance <= 0 ? 'PAID' : overdue ? 'OVERDUE' : daysToDue !== null && daysToDue <= 7 ? 'DUE_SOON' : 'ON_TRACK';
    const unit = sale.unit_id ? unitById.get(sale.unit_id) : units.find((candidate) => candidate.unit_number === sale.unit_number);
    const projectName = unit?.project_id ? projectById.get(unit.project_id)?.name || 'Project pending' : 'Project pending';
    return { sale, unit, projectName, schedule, paid, price, balance, nextInstallment, overdue, daysToDue, status };
  });
  const uniqueBuyerCount = new Set(directoryRows.map(({ sale }) => sale.buyer_user_id || sale.buyer_email?.trim().toLowerCase() || sale.id)).size;
  const activePlanCount = directoryRows.filter((row) => row.balance > 0 && row.schedule.length > 0).length;
  const overdueBuyerCount = new Set(directoryRows.filter((row) => row.overdue).map(({ sale }) => sale.buyer_user_id || sale.buyer_email?.trim().toLowerCase() || sale.id)).size;
  const outstandingTotal = directoryRows.reduce((sum, row) => sum + row.balance, 0);
  const projectOptions = units.reduce<{ id: string; name: string }[]>((options, unit) => {
    const project = unit.project_id ? projectById.get(unit.project_id) : null;
    if (project && !options.some((option) => option.id === project.id)) options.push({ id: project.id, name: project.name });
    return options;
  }, []).sort((left, right) => left.name.localeCompare(right.name));
  const unitTypeOptions = [...new Set(units.map((unit) => unit.type).filter((type): type is string => Boolean(type)))].sort();
  const visibleBuyerRows = directoryRows.filter((row) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [row.sale.buyer_name, row.sale.buyer_email, row.sale.buyer_phone, row.sale.unit_number, row.projectName].some((value) => value?.toLowerCase().includes(query));
    const matchesProject = projectFilter === 'ALL' || row.unit?.project_id === projectFilter;
    const matchesPayment = paymentFilter === 'ALL' || row.status === paymentFilter;
    const matchesUnitType = unitTypeFilter === 'ALL' || row.unit?.type === unitTypeFilter;
    const matchesDue = dueFilter === 'ALL' || (dueFilter === 'OVERDUE' && row.overdue) || (dueFilter === 'NEXT_7' && row.daysToDue !== null && row.daysToDue >= 0 && row.daysToDue <= 7) || (dueFilter === 'NEXT_30' && row.daysToDue !== null && row.daysToDue >= 0 && row.daysToDue <= 30) || (dueFilter === 'NONE' && row.daysToDue === null);
    return matchesSearch && matchesProject && matchesPayment && matchesUnitType && matchesDue;
  }).sort((left, right) => sortBy === 'OLDEST' ? (left.sale.created_at || '').localeCompare(right.sale.created_at || '') : sortBy === 'BALANCE_HIGH' ? right.balance - left.balance : sortBy === 'BALANCE_LOW' ? left.balance - right.balance : (right.sale.created_at || '').localeCompare(left.sale.created_at || ''));
  const pageCount = Math.max(1, Math.ceil(visibleBuyerRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedBuyerRows = visibleBuyerRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return <div>
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h2 className="font-serif text-4xl text-[#123b4b]">Buyers &amp; Collections</h2><p className="mt-2 text-sm text-slate-500">Manage buyer accounts, unit allocations, and payment plans.</p></div><div className="flex gap-2"><button type="button" onClick={() => setShowAddBuyer(true)} className="btn-primary"><Plus size={15} />Add buyer</button><button type="button" onClick={() => void downloadReportPdf(`nbg-buyers-${new Date().toISOString().slice(0, 10)}.pdf`, ['Buyer', 'Email', 'Phone', 'Unit', 'Project', 'Purchase price', 'Paid', 'Outstanding', 'Next due', 'Status'], visibleBuyerRows.map(({ sale, projectName, price, paid, balance, nextInstallment, status }) => [sale.buyer_name, sale.buyer_email, sale.buyer_phone, sale.unit_number, projectName, price, paid, balance, nextInstallment?.due_date || '', status]), 'Buyers & Collections Report')} className="btn-secondary"><Download size={14} />Export</button></div></header>
    <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Buyer collection summary">
      {[{ label: 'Total buyers', value: String(uniqueBuyerCount), icon: Users, tone: 'teal', note: 'Active buyer accounts' }, { label: 'Active payment plans', value: String(activePlanCount), icon: CreditCard, tone: 'green', note: 'With balance remaining' }, { label: 'Overdue accounts', value: String(overdueBuyerCount), icon: AlertCircle, tone: 'red', note: 'Past-due installments' }, { label: 'Outstanding balance', value: fmtKes(outstandingTotal), icon: DollarSign, tone: 'teal', note: 'Across active sales' }].map(({ label, value, icon: Icon, tone, note }) => <article key={label} className="flex min-h-[112px] items-center gap-4 border border-[#d6dfe0] bg-white px-4 py-4"><span className={`grid size-11 shrink-0 place-items-center rounded-full ${tone === 'red' ? 'bg-[#fde7e8] text-[#cb3345]' : tone === 'green' ? 'bg-[#e1f3ee] text-[#16866f]' : 'bg-[#def5f5] text-[#078c9c]'}`}><Icon size={19} /></span><div className="min-w-0"><p className="text-[11px] font-semibold text-[#31546b]">{label}</p><p className="mt-1 truncate font-serif text-2xl font-semibold text-[#123b4b]">{value}</p><p className="mt-1 text-[10px] text-slate-400">{note}</p></div></article>)}
    </section>
    <section className="mb-5 border border-[#d6dfe0] bg-white p-4 sm:p-5">
      <h3 className="font-serif text-2xl text-[#123b4b]">Buyer directory</h3>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1.5fr)_repeat(5,minmax(120px,1fr))]">
        <label className="relative min-w-0"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, email, phone, unit ID..." aria-label="Search buyers" className="admin-input h-[38px] w-full pl-9" /></label>
        <select aria-label="Filter by project" value={projectFilter} onChange={(event) => { setProjectFilter(event.target.value); setPage(1); }} className="admin-input h-[38px]"><option value="ALL">All projects</option>{projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
        <select aria-label="Filter by payment status" value={paymentFilter} onChange={(event) => { setPaymentFilter(event.target.value); setPage(1); }} className="admin-input h-[38px]"><option value="ALL">All statuses</option><option value="ON_TRACK">On track</option><option value="DUE_SOON">Due soon</option><option value="OVERDUE">Overdue</option><option value="PAID">Paid in full</option></select>
        <select aria-label="Filter by unit type" value={unitTypeFilter} onChange={(event) => { setUnitTypeFilter(event.target.value); setPage(1); }} className="admin-input h-[38px]"><option value="ALL">All unit types</option>{unitTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}</select>
        <select aria-label="Filter by due date" value={dueFilter} onChange={(event) => { setDueFilter(event.target.value); setPage(1); }} className="admin-input h-[38px]"><option value="ALL">Any due date</option><option value="OVERDUE">Overdue</option><option value="NEXT_7">Due in 7 days</option><option value="NEXT_30">Due in 30 days</option><option value="NONE">No upcoming due</option></select>
        <select aria-label="Sort buyers" value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="admin-input h-[38px]"><option value="NEWEST">Newest first</option><option value="OLDEST">Oldest first</option><option value="BALANCE_HIGH">Balance: high to low</option><option value="BALANCE_LOW">Balance: low to high</option></select>
      </div>
      <div className="mt-4 overflow-x-auto border border-[#e2e8e8]"><table className="w-full min-w-[1050px] table-fixed text-left"><thead className="bg-[#f4f6f5] text-[10px] font-semibold text-[#567184]"><tr>{[['Buyer', '21%'], ['Unit / Project', '15%'], ['Purchase price', '11%'], ['Paid', '10%'], ['Outstanding', '11%'], ['Next due', '10%'], ['Status', '11%'], ['Actions', '11%']].map(([label, width]) => <th key={label} style={{ width }} className="px-3 py-3">{label}</th>)}</tr></thead><tbody>
        {pagedBuyerRows.map(({ sale, unit, projectName, paid, price, balance, nextInstallment, overdue, status }, index) => {
          const initials = sale.buyer_name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'NB';
          const dueLabel = nextInstallment ? new Date(`${nextInstallment.due_date}T00:00:00`).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
          const statusLabel = status === 'PAID' ? 'Paid in full' : status === 'OVERDUE' ? 'Overdue' : status === 'DUE_SOON' ? 'Due soon' : 'On track';
          const statusStyle = status === 'PAID' ? 'bg-[#e5f5ef] text-[#208267]' : status === 'OVERDUE' ? 'bg-[#fde8e9] text-[#bc3343]' : status === 'DUE_SOON' ? 'bg-[#fff2de] text-[#a76b11]' : 'bg-[#e2f6f4] text-[#078b91]';
          return <tr key={sale.id} className="border-t border-[#e8eded] text-[11px] text-[#31546b] hover:bg-[#f8fbfa]">
            <td className="px-3 py-2"><div className="flex min-w-0 items-center gap-3"><span className={`grid size-9 shrink-0 place-items-center rounded-full text-[11px] font-bold ${['bg-[#d9f1ef] text-[#087f88]', 'bg-[#e0f1e9] text-[#21816e]', 'bg-[#fde5e3] text-[#b84f45]', 'bg-[#e7e9fb] text-[#566cb5]', 'bg-[#fff0d4] text-[#98702c]'][index % 5]}`}>{initials}</span><span className="min-w-0"><strong className="block truncate font-semibold text-[#164b68]">{sale.buyer_name}</strong><span className="mt-1 flex min-w-0 flex-wrap gap-x-2 text-[9px] text-slate-400"><span className="truncate">{sale.buyer_phone || 'Phone unavailable'}</span><span className="truncate">{sale.buyer_email || 'Email unavailable'}</span></span></span></div></td>
            <td className="px-3 py-2"><strong className="block truncate font-medium text-[#31546b]">{sale.unit_number} · {projectName}</strong><span className="mt-1 block truncate text-[9px] text-slate-400">{unit?.type || 'Unit type pending'}</span></td><td className="px-3 py-2">{fmtKes(price)}</td><td className="px-3 py-2">{fmtKes(paid)}</td><td className="px-3 py-2">{fmtKes(balance)}</td><td className="px-3 py-2">{dueLabel}</td>
            <td className="px-3 py-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyle}`}><span className="size-1.5 rounded-full bg-current" />{statusLabel}</span>{overdue && <span className="sr-only">Payment is overdue</span>}</td>
            <td className="px-3 py-2"><div className="flex items-center justify-between gap-1"><button type="button" onClick={() => { setSelectedPaymentView('summary'); setSelected(sale); }} className="whitespace-nowrap font-semibold text-[#078ba5] hover:underline">View account</button><div className="relative"><button type="button" aria-label={`More actions for ${sale.buyer_name}`} aria-expanded={openActions === sale.id} onClick={() => setOpenActions((current) => current === sale.id ? '' : sale.id)} className="grid size-8 place-items-center text-[#078ba5] hover:bg-[#e8f7f6]"><MoreHorizontal size={16} /></button>{openActions === sale.id && <div className="absolute right-0 top-full z-20 min-w-36 border border-[#d6dfe0] bg-white py-1 shadow-lg"><button type="button" onClick={() => { setSelectedPaymentView('record'); setSelected(sale); setOpenActions(''); }} className="block w-full px-3 py-2 text-left text-xs text-[#31546b] hover:bg-[#f2f8f7]">Record payment</button><button type="button" onClick={() => { setSelectedPaymentView('schedule'); setSelected(sale); setOpenActions(''); }} className="block w-full px-3 py-2 text-left text-xs text-[#31546b] hover:bg-[#f2f8f7]">View payment plan</button></div>}</div></div></td>
          </tr>;
        })}
        {pagedBuyerRows.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">No buyers match these filters.</td></tr>}
      </tbody></table></div>
      <footer className="flex flex-wrap items-center justify-between gap-3 pt-3 text-[10px] text-slate-500"><span>Showing {visibleBuyerRows.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, visibleBuyerRows.length)} of {visibleBuyerRows.length} buyer accounts</span><div className="flex items-center gap-2"><label className="flex items-center gap-2"><span>Rows</span><select aria-label="Rows per page" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="h-8 border border-[#d6dfe0] bg-white px-2"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select><ChevronDown size={12} /></label><button type="button" aria-label="Previous page" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1} className="grid size-8 place-items-center border border-[#d6dfe0] disabled:opacity-40"><ChevronLeft size={14} /></button>{Array.from({ length: Math.min(5, pageCount) }, (_, index) => { const pageNumber = Math.max(1, Math.min(pageCount - 4, currentPage - 2)) + index; return <button key={pageNumber} type="button" aria-current={currentPage === pageNumber ? 'page' : undefined} onClick={() => setPage(pageNumber)} className={`grid size-8 place-items-center border text-[10px] ${currentPage === pageNumber ? 'border-[#078b91] bg-[#078b91] text-white' : 'border-[#d6dfe0] bg-white text-[#31546b]'}`}>{pageNumber}</button>; })}<button type="button" aria-label="Next page" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage === pageCount} className="grid size-8 place-items-center border border-[#d6dfe0] disabled:opacity-40"><ChevronRight size={14} /></button></div></footer>
    </section>
    {showAddBuyer && <Modal title="Add buyer" onClose={() => setShowAddBuyer(false)}><SaleForm onCancel={() => setShowAddBuyer(false)} onDone={() => { setShowAddBuyer(false); void load(); }} /></Modal>}
    <div className="hidden">
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-[#20afd1]">Collections</p><h2 className="mt-2 font-serif text-4xl">Buyer payments</h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">Track every buyer repayment, outstanding balance, due date, and overdue installment from one place.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void downloadReportPdf(`nbg-payments-${new Date().toISOString().slice(0, 10)}.pdf`, ['Buyer', 'Unit', 'Sale price', 'Deposit', 'Status'], sales.map((sale) => [sale.buyer_name, sale.unit_number, sale.sale_price, sale.deposit_amount, sale.status]), 'Buyer Payments Report')} className="btn-secondary"><Download size={14} /> Export PDF</button><div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search buyer or unit" className="admin-input pl-9" /></div></div></div>
    <div className="mb-6 grid gap-3 sm:grid-cols-4"><StatMini label="Buyer requests" value={String(buyerRequestQueue.length)} color="text-[#2e5f7a]" /><StatMini label="Collected" value={fmtKes(totals.paid)} color="text-[#2e6b3e]" /><StatMini label="Outstanding balance" value={fmtKes(totals.balance)} color="text-[#856b2e]" /><StatMini label="Overdue installments" value={String(totals.overdue)} color="text-[#a55445]" /></div>
    <section className="mb-7 border border-[#a9d9d8] bg-[#eefbf9] p-4 sm:p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow text-[#087f88]">Operations queue</p><h3 className="mt-1 font-serif text-2xl text-[#123b4b]">Buyer requests & deposits</h3><p className="mt-1 text-xs text-slate-500">Review requests, verify incoming deposits, and continue each buyer’s payment ledger.</p></div><button type="button" onClick={() => goTo('units')} className="btn-secondary !px-3 !py-2"><Building2 size={14} />Unit availability</button></div><div className="mt-4 divide-y divide-[#d6e9e6] border-y border-[#d6e9e6]">{buyerRequestQueue.map((sale) => { const rows = installments.filter((item) => item.sale_id === sale.id); const paid = Number(sale.deposit_amount || 0) + rows.reduce((sum, item) => sum + Number(item.paid_amount || 0), 0); const balance = Math.max(Number(sale.sale_price || 0) - paid, 0); const expired = sale.status === 'RESERVED' && Boolean(sale.reservation_expires_at && new Date(sale.reservation_expires_at).getTime() <= Date.now()); return <article key={`queue-${sale.id}`} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-[180px] flex-1"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-[#123b4b]">{sale.buyer_name}</strong><span className="text-[10px] font-semibold uppercase text-[#087f88]">Unit {sale.unit_number}</span><span className={`border px-2 py-0.5 text-[9px] font-semibold uppercase ${expired ? 'border-[#e4b8ad] bg-[#fff7f4] text-[#a55445]' : sale.status === 'RESERVED' ? 'border-[#e7d3a8] bg-[#fff8e6] text-[#765d2b]' : 'border-[#a9d9d8] bg-white text-[#087f88]'}`}>{expired ? 'Reservation expired' : sale.status.replace('_', ' ')}</span></div><p className="mt-1 text-[10px] text-slate-500">{sale.buyer_email || sale.buyer_phone || 'Buyer contact not recorded'} · {sale.installment_frequency === 'ONE_TIME' ? 'One-time payment' : `${sale.installment_count || 0} scheduled payments`}</p><p className="mt-1 text-xs text-slate-600">{sale.sale_price ? `${fmtKes(paid)} received · ${fmtKes(balance)} remaining` : 'Sale amount pending'}</p></div><div className="flex gap-2"><button type="button" onClick={() => { setSelected(sale); setSelectedPaymentView('summary'); }} className="btn-secondary !px-3 !py-2"><Eye size={14} />Review</button><button type="button" disabled={expired} onClick={() => { setSelected(sale); setSelectedPaymentView('record'); }} className="btn-primary !px-3 !py-2 disabled:opacity-50"><Plus size={14} />Record deposit/payment</button></div></article>; })}{buyerRequestQueue.length === 0 && <p className="py-5 text-sm text-slate-500">No active buyer unit requests. New reservations will appear here automatically.</p>}</div></section>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((sale) => { const rows = installments.filter((item) => item.sale_id === sale.id); const paid = (sale.deposit_amount ?? 0) + rows.reduce((sum, item) => sum + item.paid_amount, 0); const balance = Math.max((sale.sale_price ?? 0) - paid, 0); const percent = sale.sale_price ? Math.min((paid / sale.sale_price) * 100, 100) : 0; const next = rows.find((item) => Number(item.paid_amount) < Number(item.amount)); const overdue = next && new Date(next.due_date) < new Date(new Date().toDateString()); return <button key={sale.id} onClick={() => setSelected(sale)} className="rounded-lg border border-[#c9c5bd] bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#20afd1] hover:shadow-md"><div className="flex items-start justify-between"><div><p className="eyebrow text-[#20afd1]">Unit {sale.unit_number}</p><h3 className="mt-2 text-lg">{sale.buyer_name}</h3></div><CreditCard size={20} className="text-[#20afd1]" /></div><div className="mt-5 flex justify-between text-xs"><span className="text-slate-500">Paid <strong className="text-[#2e6b3e]">{fmtKes(paid)}</strong></span><span className="text-slate-500">Balance <strong className="text-[#856b2e]">{fmtKes(balance)}</strong></span></div><div className="mt-3 h-2 rounded-full bg-[#e6e2da]"><div className="h-full rounded-full bg-[#20afd1]" style={{ width: `${percent}%` }} /></div><div className="mt-4 flex items-center justify-between text-[10px] uppercase tracking-[.1em]">{balance <= 0 ? <span className="font-semibold text-[#2e6b3e]">Paid in full</span> : next ? <span className={overdue ? 'font-semibold text-[#a55445]' : 'text-slate-500'}>{overdue ? 'Overdue' : 'Next due'} · {new Date(next.due_date).toLocaleDateString()}</span> : <span className="font-semibold text-[#856b2e]">Balance due · no schedule</span>}<span className="text-[#20afd1]">Open plan</span></div></button>})}{filtered.length === 0 && <div className="rounded-lg border border-dashed border-[#b8b4ab] p-12 text-center text-sm text-slate-400 md:col-span-2 xl:col-span-3">No buyers found.</div>}</div>
    </div>
    {selected && <Modal title={`Payments · Unit ${selected.unit_number}`} wide onClose={() => { setSelected(null); load(); }}><InstallmentPanel sale={selected} goTo={goTo} initialView={selectedPaymentView} /></Modal>}
  </div>;
}

// ─── Sales ───────────────────────────────────────────────

function SalesTab({ goTo }: { goTo: (tab: AdminTab) => void }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [installments, setInstallments] = useState<BuyerInstallment[]>([]);
  const [payments, setPayments] = useState<BuyerPaymentRecord[]>([]);
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(() => kenyaCalendarDate().slice(0, 7));
  const [page, setPage] = useState(1);
  const [openActions, setOpenActions] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [selectedPaymentView, setSelectedPaymentView] = useState<PaymentView>('summary');

  const load = useCallback(async () => {
    const [salesResult, installmentResult, paymentResult, unitResult, projectResult] = await Promise.all([
      supabase.from('sales').select('*').order('created_at', { ascending: false }),
      supabase.from('buyer_installments').select('*').order('due_date'),
      supabase.from('buyer_payments').select('id,sale_id,installment_id,amount,payment_date,method,reference,transaction_ref,created_at,notes').order('payment_date', { ascending: false }),
      supabase.from('project_units').select('id,project_id,unit_number,type,status,is_published,payment_mode,price').order('unit_number'),
      supabase.from('projects').select('id,name').order('name'),
    ]);
    setSales((salesResult.data ?? []) as Sale[]);
    setInstallments((installmentResult.data ?? []) as BuyerInstallment[]);
    setPayments((paymentResult.data ?? []) as BuyerPaymentRecord[]);
    setUnits((unitResult.data ?? []) as ProjectUnit[]);
    setProjects((projectResult.data ?? []) as Project[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel('admin-sales-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buyer_installments' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buyer_payments' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_units' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'projects' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const monthStart = `${selectedMonth}-01`;
  const monthEnd = new Date(Date.UTC(Number(selectedMonth.slice(0, 4)), Number(selectedMonth.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const inSelectedMonth = (sale: Sale) => {
    const date = (sale.sale_date || sale.created_at || '').slice(0, 10);
    return date >= monthStart && date <= monthEnd;
  };
  const monthSales = sales.filter(inSelectedMonth);
  const monthSaleIds = new Set(monthSales.map((sale) => sale.id));
  const installmentsBySale = new Map<string, BuyerInstallment[]>();
  installments.forEach((item) => installmentsBySale.set(item.sale_id, [...(installmentsBySale.get(item.sale_id) ?? []), item]));
  const paidBySale = new Map<string, number>();
  payments.forEach((payment) => paidBySale.set(payment.sale_id, (paidBySale.get(payment.sale_id) ?? 0) + Number(payment.amount || 0)));
  const completedRevenue = monthSales.filter((sale) => sale.status === 'COMPLETED').reduce((sum, sale) => sum + Number(sale.sale_price || 0), 0);
  const pipelineValue = monthSales.filter((sale) => ['RESERVED', 'DEPOSIT_PAID'].includes(sale.status)).reduce((sum, sale) => sum + Number(sale.sale_price || 0), 0);
  const firstInstallmentIds = new Set(installments.filter((item) => item.installment_number === 1).map((item) => item.id));
  const depositsReceived = payments.filter((payment) => firstInstallmentIds.has(payment.installment_id || '') && payment.payment_date >= monthStart && payment.payment_date <= monthEnd).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const activePlans = monthSales.filter((sale) => sale.status !== 'CANCELLED' && sale.status !== 'COMPLETED' && (installmentsBySale.get(sale.id)?.length ?? 0) > 0).length;
  const statusDistribution = [
    { key: 'DEPOSIT_PAID', label: 'Deposit paid', color: '#12aaa9' },
    { key: 'RESERVED', label: 'Installments', color: '#68bde9' },
    { key: 'COMPLETED', label: 'Completed', color: '#51bf83' },
    { key: 'CANCELLED', label: 'Cancelled', color: '#f0787e' },
  ].map((item) => ({ ...item, count: monthSales.filter((sale) => sale.status === item.key).length }));
  const statusTotal = statusDistribution.reduce((sum, item) => sum + item.count, 0);
  const projectOptions = projects.filter((project) => units.some((unit) => unit.project_id === project.id));
  const filtered = monthSales.filter((sale) => {
    const unit = sale.unit_id ? unitById.get(sale.unit_id) : undefined;
    const schedule = installmentsBySale.get(sale.id) ?? [];
    const planLabel = sale.installment_frequency === 'ONE_TIME' ? 'FULL' : schedule.length ? 'INSTALLMENTS' : 'NO_PLAN';
    const searchMatch = !search.trim() || [sale.unit_number, sale.buyer_name, sale.buyer_email, sale.buyer_phone, ...payments.filter((payment) => payment.sale_id === sale.id).flatMap((payment) => [payment.reference, payment.transaction_ref])].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()));
    return searchMatch && (statusFilter === 'ALL' || sale.status === statusFilter) && (planFilter === 'ALL' || planLabel === planFilter) && (projectFilter === 'ALL' || unit?.project_id === projectFilter);
  });
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageSales = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const formatMonthRange = () => `${new Date(`${monthStart}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })} – ${new Date(`${monthEnd}T00:00:00`).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-serif text-3xl font-semibold text-[#123b4b]">Sales</h2><p className="mt-1 text-xs text-[#55717d]">Manage transactions, revenue and buyer commitments.</p></div><div className="flex flex-wrap items-center gap-2"><label className="relative flex h-8 items-center gap-2 border border-[#d9e2e4] bg-white px-2 text-[10px] text-[#31546b]"><CalendarDays size={13} className="text-[#54717c]" /><span>{formatMonthRange()}</span><input type="month" value={selectedMonth} onChange={(event) => { setSelectedMonth(event.target.value); setPage(1); }} aria-label="Filter sales by month" className="absolute inset-0 size-full cursor-pointer opacity-0" /></label><button type="button" onClick={() => setShowForm(true)} className="btn-primary h-8 !px-3 !py-1.5 text-[10px]"><Plus size={14} />Record Sale</button></div></header>
      <section className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sales metrics">
        {[{ label: 'Completed revenue', value: fmtKes(completedRevenue), icon: CircleCheck, tone: 'green', note: `${monthSales.filter((sale) => sale.status === 'COMPLETED').length} completed sales` }, { label: 'Pipeline value', value: fmtKes(pipelineValue), icon: TrendingUp, tone: 'blue', note: `${monthSales.filter((sale) => ['RESERVED', 'DEPOSIT_PAID'].includes(sale.status)).length} active commitments` }, { label: 'Deposits received', value: fmtKes(depositsReceived), icon: DollarSign, tone: 'violet', note: 'Verified first installments' }, { label: 'Active payment plans', value: String(activePlans), icon: CalendarDays, tone: 'teal', note: `${monthSales.filter((sale) => sale.status !== 'CANCELLED' && (installmentsBySale.get(sale.id)?.length ?? 0) > 0).length} recorded plans` }].map(({ label, value, icon: Icon, tone, note }) => <article key={label} className="flex min-h-[84px] items-center gap-3 border border-[#dce3e3] bg-white px-3 py-3 shadow-[0_1px_4px_rgba(26,55,65,.05)]"><span className={`grid size-9 shrink-0 place-items-center rounded-full ${tone === 'green' ? 'bg-[#e1f3ee] text-[#16866f]' : tone === 'blue' ? 'bg-[#e3f0ff] text-[#2779c2]' : tone === 'violet' ? 'bg-[#f0e8fb] text-[#8a5bc1]' : 'bg-[#def5f5] text-[#078c9c]'}`}><Icon size={17} /></span><span className="min-w-0"><span className="block text-[9px] font-semibold text-[#52707c]">{label}</span><strong className="mt-0.5 block truncate font-serif text-xl text-[#123b4b]">{value}</strong><span className="mt-0.5 block truncate text-[8px] text-[#7b9299]">{note}</span></span></article>)}
      </section>
      <section className="grid gap-2.5 border border-[#dce3e3] bg-white p-3 shadow-[0_1px_4px_rgba(26,55,65,.05)] lg:grid-cols-[1.05fr_1fr]">
        <div><h3 className="font-serif text-base font-semibold text-[#123b4b]">Sales status distribution</h3><div className="mt-3 flex h-7 overflow-hidden rounded"><div className="flex h-full w-full">{statusDistribution.map((item) => <span key={item.key} title={`${item.label}: ${item.count}`} className="grid h-full min-w-[26px] place-items-center border-r border-white/80 text-[8px] font-semibold text-white last:border-0" style={{ width: `${statusTotal ? Math.max(item.count / statusTotal * 100, item.count ? 5 : 0) : 0}%`, backgroundColor: item.color }}>{statusTotal ? `${Math.round(item.count / statusTotal * 100)}%` : '0%'}</span>)}</div></div></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{statusDistribution.map((item) => <div key={item.key} className="flex items-center gap-2 border-l border-[#edf1f1] pl-2"><span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="min-w-0"><span className="block truncate text-[8px] text-[#6d8790]">{item.label}</span><strong className="text-[10px] text-[#31546b]">{item.count} <span className="font-normal text-slate-400">({statusTotal ? Math.round(item.count / statusTotal * 100) : 0}%)</span></strong></span></div>)}</div>
      </section>
      <section className="grid gap-2 sm:grid-cols-[minmax(190px,1fr)_140px_140px_160px_auto_auto]">
        <label className="relative"><Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7b9299]" /><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search by unit, buyer, or reference number..." aria-label="Search sales" className="admin-input h-8 w-full pl-8 text-[9px]" /></label>
        <select aria-label="Filter sales by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} className="admin-input h-8 text-[9px]"><option value="ALL">All payment statuses</option>{SALE_STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select>
        <select aria-label="Filter sales by payment plan" value={planFilter} onChange={(event) => { setPlanFilter(event.target.value); setPage(1); }} className="admin-input h-8 text-[9px]"><option value="ALL">All payment plans</option><option value="INSTALLMENTS">Installments</option><option value="FULL">Full payment</option><option value="NO_PLAN">No plan</option></select>
        <select aria-label="Filter sales by project" value={projectFilter} onChange={(event) => { setProjectFilter(event.target.value); setPage(1); }} className="admin-input h-8 text-[9px]"><option value="ALL">All projects</option>{projectOptions.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
        <button type="button" onClick={() => { setSearch(''); setStatusFilter('ALL'); setPlanFilter('ALL'); setProjectFilter('ALL'); setPage(1); }} className="btn-secondary h-8 !px-3 !py-1 text-[9px]">Clear filters</button><button type="button" onClick={() => void downloadReportPdf(`nbg-sales-${selectedMonth}.pdf`, ['Unit', 'Buyer', 'Sale price', 'Status', 'Payment plan', 'Sale date'], filtered.map((sale) => [sale.unit_number, sale.buyer_name, sale.sale_price, sale.status, sale.installment_frequency === 'ONE_TIME' ? 'Full payment' : `${sale.installment_count} installments`, sale.sale_date]), 'Sales Register')} className="btn-primary h-8 !px-3 !py-1 text-[9px]"><Download size={13} />Export PDF</button>
      </section>
      <section className="overflow-hidden border border-[#dce3e3] bg-white shadow-[0_1px_4px_rgba(26,55,65,.05)]"><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left"><thead className="bg-[#f4f6f5] text-[8px] uppercase text-[#748b93]"><tr>{['Unit', 'Buyer', 'Sale price', 'Payment status', 'Payment plan', 'Sale date', 'Next installment', 'Actions'].map((label) => <th key={label} className="px-3 py-2.5 font-medium">{label}</th>)}</tr></thead><tbody>
        {pageSales.map((sale) => {
          const schedule = installmentsBySale.get(sale.id) ?? [];
          const nextInstallment = [...schedule].filter((item) => Number(item.amount) > Number(item.paid_amount)).sort((left, right) => left.due_date.localeCompare(right.due_date))[0];
          const unit = sale.unit_id ? unitById.get(sale.unit_id) : undefined;
          const projectName = unit?.project_id ? projectById.get(unit.project_id)?.name : null;
          const statusLabel = sale.status.replace(/_/g, ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase());
          const statusTone = sale.status === 'COMPLETED' ? 'bg-[#e1f3e8] text-[#23875a]' : sale.status === 'CANCELLED' ? 'bg-[#fde8e9] text-[#c44752]' : sale.status === 'DEPOSIT_PAID' ? 'bg-[#ddf3f0] text-[#078b91]' : 'bg-[#e6f1fb] text-[#367dab]';
          const planLabel = sale.installment_frequency === 'ONE_TIME' ? 'One-time payment' : schedule.length ? `${Math.max(0, schedule.length - 1)} installments` : 'No plan';
          return <tr key={sale.id} className="border-t border-[#edf1f1] text-[9px] text-[#31546b] hover:bg-[#fafcfc]"><td className="px-3 py-2"><strong className="block font-semibold">{sale.unit_number}</strong><span className="mt-0.5 block text-[8px] text-[#81969e]">{projectName || 'Project pending'}</span></td><td className="px-3 py-2"><strong className="block font-semibold">{sale.buyer_name}</strong><span className="mt-0.5 block text-[8px] text-[#81969e]">{sale.buyer_email || sale.buyer_phone || 'Contact not recorded'}</span></td><td className="px-3 py-2 font-semibold">{fmtKes(sale.sale_price)}</td><td className="px-3 py-2"><span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[8px] font-semibold ${statusTone}`}><span className="size-1.5 rounded-full bg-current" />{statusLabel}</span></td><td className="px-3 py-2">{planLabel}</td><td className="px-3 py-2">{sale.sale_date ? new Date(`${sale.sale_date}T00:00:00`).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td><td className="px-3 py-2">{nextInstallment ? <><span className="block">{new Date(`${nextInstallment.due_date}T00:00:00`).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })}</span><span className="mt-0.5 block text-[8px] text-[#80969d]">{fmtKes(Math.max(0, Number(nextInstallment.amount) - Number(nextInstallment.paid_amount)))}</span></> : <span className="text-[#8799a0]">—</span>}</td><td className="px-3 py-2"><div className="flex items-center gap-1"><button type="button" onClick={() => { setSelectedPaymentView('summary'); setSelectedSale(sale); }} className="inline-flex items-center gap-1 border border-[#d3e6e9] px-2 py-1 text-[8px] font-semibold text-[#078b91]"><Eye size={11} />View</button><div className="relative"><button type="button" onClick={() => setOpenActions((current) => current === sale.id ? '' : sale.id)} aria-label={`More actions for ${sale.unit_number}`} aria-expanded={openActions === sale.id} className="grid size-7 place-items-center text-[#62818c]">⋮</button>{openActions === sale.id && <div className="absolute right-0 top-full z-20 min-w-32 border border-[#d6dfe0] bg-white py-1 shadow-lg"><button type="button" onClick={() => { setSelectedPaymentView('record'); setSelectedSale(sale); setOpenActions(''); }} className="block w-full px-3 py-2 text-left text-[9px] hover:bg-[#f1f8f8]">Record payment</button><button type="button" onClick={() => { setSelectedPaymentView('schedule'); setSelectedSale(sale); setOpenActions(''); }} className="block w-full px-3 py-2 text-left text-[9px] hover:bg-[#f1f8f8]">View schedule</button></div>}</div></div></td></tr>;
        })}
        {pageSales.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-[10px] text-slate-400">No sales match these filters.</td></tr>}
      </tbody></table></div><footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8eeee] px-3 py-2 text-[9px] text-[#789099]"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} transactions</span><div className="flex items-center gap-1"><button type="button" aria-label="Previous sales page" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={currentPage === 1} className="grid size-7 place-items-center border border-[#dce3e3] disabled:opacity-40"><ChevronLeft size={12} /></button>{Array.from({ length: Math.min(4, pageCount) }, (_, index) => { const pageNumber = Math.max(1, Math.min(pageCount - 3, currentPage - 1)) + index; return <button key={pageNumber} type="button" aria-current={currentPage === pageNumber ? 'page' : undefined} onClick={() => setPage(pageNumber)} className={`grid size-7 place-items-center border text-[9px] ${currentPage === pageNumber ? 'border-[#078b91] bg-[#078b91] text-white' : 'border-[#dce3e3]'}`}>{pageNumber}</button>; })}<button type="button" aria-label="Next sales page" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={currentPage === pageCount} className="grid size-7 place-items-center border border-[#dce3e3] disabled:opacity-40"><ChevronRight size={12} /></button></div></footer></section>
      {showForm && <Modal title="Record Sale" onClose={() => setShowForm(false)}><SaleForm onCancel={() => setShowForm(false)} onDone={(sale) => { setSales((current) => [sale, ...current]); setShowForm(false); void load(); }} /></Modal>}
      {selectedSale && <Modal title={`Sale · Unit ${selectedSale.unit_number}`} wide onClose={() => setSelectedSale(null)}><InstallmentPanel sale={selectedSale} goTo={goTo} initialView={selectedPaymentView} /></Modal>}
    </div>
  );
}

function SaleForm({ onDone, onCancel }: { onDone: (s: Sale) => void; onCancel?: () => void }) {
  const [step, setStep] = useState(1);
  const [buyerQuery, setBuyerQuery] = useState('');
  const [buyer, setBuyer] = useState<BuyerProfileMatch | null>(null);
  const [buyerMatches, setBuyerMatches] = useState<BuyerProfileMatch[]>([]);
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [unitId, setUnitId] = useState('');
  const [unitLoading, setUnitLoading] = useState(true);
  const [saleDate, setSaleDate] = useState(kenyaCalendarDate());
  const [initialPayment, setInitialPayment] = useState('');
  const [installmentCount, setInstallmentCount] = useState('12');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedUnit = units.find((unit) => unit.id === unitId) ?? null;
  const unitPrice = parseMoney(selectedUnit?.price || '');
  const oneTime = selectedUnit?.payment_mode === 'ONE_TIME';
  const plannedDeposit = oneTime ? unitPrice : parseMoney(initialPayment);
  const plannedInstallments = oneTime ? 0 : Number(installmentCount) || 0;
  const remainingBalance = Math.max(0, unitPrice - plannedDeposit);
  const estimatedInstallment = plannedInstallments ? remainingBalance / plannedInstallments : 0;

  useEffect(() => {
    let active = true;
    void Promise.all([
      supabase.from('project_units').select('id,project_id,unit_number,type,price,status,is_published,payment_mode').eq('status', 'AVAILABLE').eq('is_published', true).order('unit_number'),
      supabase.from('projects').select('id,name').order('name'),
    ]).then(([unitResult, projectResult]) => {
      if (!active) return;
      if (unitResult.error) setError(`Available units could not be loaded: ${unitResult.error.message}`);
      setUnits((unitResult.data ?? []) as ProjectUnit[]);
      setProjects((projectResult.data ?? []) as Project[]);
      setUnitLoading(false);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const query = buyerQuery.trim();
    if (query.length < 2 || buyer) { setBuyerMatches([]); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.rpc('search_client_profiles', { p_query: query });
      if (active) setBuyerMatches((data ?? []) as BuyerProfileMatch[]);
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [buyerQuery, buyer]);

  const advance = () => {
    setError('');
    if (step === 1 && (!buyer || !selectedUnit)) { setError('Choose a registered client and an available unit.'); return; }
    if (step === 2 && (!saleDate || unitPrice <= 0)) { setError('Choose a sale date and confirm the unit has a recorded price.'); return; }
    if (step === 3 && (!oneTime && (plannedDeposit <= 0 || plannedDeposit >= unitPrice || plannedInstallments < 1))) { setError('Enter an initial payment below the unit price and at least one installment.'); return; }
    setStep((current) => Math.min(4, current + 1));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!buyer || !selectedUnit) { setError('Choose a registered client and an available unit.'); setStep(1); return; }
    if (!saleDate || unitPrice <= 0) { setError('Choose a sale date and confirm the unit has a recorded price.'); setStep(2); return; }
    if (!oneTime && (plannedDeposit <= 0 || plannedDeposit >= unitPrice || plannedInstallments < 1)) { setError('Enter a valid initial payment and installment plan.'); setStep(3); return; }
    const reservationReason = notes.trim() || `Admin sale record for ${buyer.full_name || buyer.email || 'registered client'} and Unit ${selectedUnit.unit_number}.`;
    setSaving(true);
    const { data, error: reservationError } = await supabase.rpc('reserve_unit_for_client', {
      p_unit_id: selectedUnit.id,
      p_buyer_user_id: buyer.user_id,
      p_reservation_hours: 48,
      p_reason: reservationReason,
      p_initial_payment: plannedDeposit,
      p_installment_count: plannedInstallments,
      p_frequency: oneTime ? 'MONTHLY' : frequency,
    });
    const reservedSaleId = (data as { sale_id: string; expires_at: string }[] | null)?.[0]?.sale_id;
    if (reservationError || !reservedSaleId) {
      setSaving(false);
      setError(reservationError?.message || 'The sale could not be recorded. Refresh unit availability and try again.');
      return;
    }
    const { error: detailsError } = await supabase.from('sales').update({ sale_date: saleDate, notes: notes.trim() || null }).eq('id', reservedSaleId);
    if (detailsError) notifyAdmin(`Unit reserved, but the sale date or notes could not be updated: ${detailsError.message}`, 'error');
    const sale: Sale = { id: reservedSaleId, unit_id: selectedUnit.id, buyer_user_id: buyer.user_id, unit_number: selectedUnit.unit_number, buyer_name: buyer.full_name || buyer.email || 'NBG client', buyer_phone: buyer.phone, buyer_email: buyer.email, sale_price: unitPrice, status: 'RESERVED', sale_date: saleDate, notes: notes.trim() || null, deposit_amount: 0, installment_count: plannedInstallments + 1, installment_frequency: oneTime ? 'ONE_TIME' : frequency, reservation_expires_at: (data as { sale_id: string; expires_at: string }[])[0].expires_at, reservation_source: 'ADMIN', created_at: new Date().toISOString() };
    setSaving(false);
    onDone(sale);
  };

  const stepNames = ['Buyer & Unit', 'Sale Details', 'Payment Plan', 'Notes & Confirm'];
  const projectFor = (unit: ProjectUnit) => projects.find((project) => project.id === unit.project_id)?.name || 'Project';
  return (
    <form onSubmit={submit} className="grid gap-3">
      <p className="text-[10px] text-[#6f8991]">Add a new sale to the system. Complete all steps to save the record.</p>
      <ol className="grid grid-cols-4 gap-1" aria-label="Sale entry steps">{stepNames.map((name, index) => <li key={name} aria-current={step === index + 1 ? 'step' : undefined} className={`flex min-w-0 items-center gap-1 border-b-2 px-1 pb-2 text-[8px] ${step === index + 1 ? 'border-[#078b91] text-[#078b91]' : index + 1 < step ? 'border-[#8ac9bb] text-[#4d8179]' : 'border-[#e2e8e8] text-[#81949b]'}`}><span className={`grid size-5 shrink-0 place-items-center rounded-full text-[8px] font-bold ${step === index + 1 ? 'bg-[#078b91] text-white' : 'bg-[#edf1f2]'}`}>{index + 1}</span><span className="truncate">{name}</span></li>)}</ol>
      {step === 1 && <section className="grid gap-3 border border-[#dce5e6] p-3"><h4 className="font-serif text-sm font-semibold text-[#123b4b]">1. Buyer &amp; Unit</h4><div className="grid gap-3 sm:grid-cols-2"><div className="relative"><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Registered client *</span><input value={buyer ? buyer.full_name || buyer.email || '' : buyerQuery} onChange={(event) => { setBuyer(null); setBuyerQuery(event.target.value); }} required className="admin-input w-full" autoComplete="off" placeholder="Search by name, email or phone..." /></label>{buyerMatches.length > 0 && <div className="absolute z-30 mt-1 max-h-48 w-full overflow-y-auto border border-[#d8e0df] bg-white shadow-lg">{buyerMatches.map((match) => <button type="button" key={match.user_id} onClick={() => { setBuyer(match); setBuyerQuery(''); setBuyerMatches([]); }} className="block w-full border-b border-[#e6e2da] px-3 py-2 text-left hover:bg-[#eefbf9]"><strong className="block text-[10px] text-[#31546b]">{match.full_name || 'NBG client'}</strong><span className="text-[9px] text-slate-500">{match.email || 'No email'}{match.phone ? ` · ${match.phone}` : ''}</span></button>)}</div>}{buyer && <p className="mt-1 text-[9px] text-[#078b91]">{buyer.email || buyer.phone || 'Client account selected'} <button type="button" onClick={() => setBuyer(null)} className="ml-1 underline">Change</button></p>}</div><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Unit *</span><select value={unitId} onChange={(event) => { setUnitId(event.target.value); setInitialPayment(''); }} disabled={unitLoading} required className="admin-input w-full"><option value="">{unitLoading ? 'Loading available units...' : 'Select unit'}</option>{units.map((unit) => <option key={unit.id} value={unit.id}>{unit.unit_number} · {projectFor(unit)}{unit.type ? ` · ${unit.type}` : ''}</option>)}</select>{!unitLoading && units.length === 0 && <span className="mt-1 block text-[9px] text-[#a55445]">No published available units can be reserved.</span>}</label></div>{selectedUnit && <p className="border-l-2 border-[#19aeb3] pl-2 text-[9px] text-[#6f8991]">Selected: {selectedUnit.unit_number} · {projectFor(selectedUnit)} · {selectedUnit.type || 'Residence'}</p>}</section>}
      {step === 2 && <section className="grid gap-3 border border-[#dce5e6] p-3"><h4 className="font-serif text-sm font-semibold text-[#123b4b]">2. Sale Details</h4><div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Sale price *</span><div className="flex h-9 items-center border border-[#c9c5bd] bg-[#f7f8f7]"><span className="border-r border-[#dce3e3] px-3 text-[9px] text-[#70878e]">KSh</span><input readOnly value={unitPrice ? formatMoneyInput(String(unitPrice)) : ''} className="min-w-0 flex-1 border-0 bg-transparent px-2 text-[10px] text-[#31546b] outline-none" placeholder="Unit price unavailable" /></div><span className="mt-1 block text-[8px] text-[#82969d]">Price from current published unit inventory.</span></label><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Sale date *</span><input type="date" max={kenyaCalendarDate()} value={saleDate} onChange={(event) => setSaleDate(event.target.value)} required className="admin-input w-full" /></label></div></section>}
      {step === 3 && <section className="grid gap-3 border border-[#dce5e6] p-3"><h4 className="font-serif text-sm font-semibold text-[#123b4b]">3. Payment Plan</h4>{oneTime ? <div className="border border-[#e7d3a8] bg-[#fff8e6] p-3 text-[10px] leading-5 text-[#765d2b]">This unit requires a one-time payment of <strong>{fmtKes(unitPrice)}</strong>. The full amount will remain pending until payment is verified.</div> : <div className="grid gap-3 sm:grid-cols-3"><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Deposit amount *</span><CurrencyInput value={initialPayment} onChange={setInitialPayment} className="admin-input w-full" /></label><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Installments *</span><select value={installmentCount} onChange={(event) => setInstallmentCount(event.target.value)} className="admin-input w-full"><option value="3">3</option><option value="6">6</option><option value="12">12</option><option value="18">18</option><option value="24">24</option><option value="36">36</option></select></label><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Frequency *</span><select value={frequency} onChange={(event) => setFrequency(event.target.value)} className="admin-input w-full"><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUALLY">Annually</option></select></label></div>}<div className="grid grid-cols-3 border border-[#bfe3df] bg-[#f1faf9] p-2.5 text-[8px]"><div><span className="block text-[#70878e]">Deposit required</span><strong className="mt-1 block text-[#31546b]">{fmtKes(plannedDeposit)}</strong></div><div className="border-x border-[#d6e9e6] px-2"><span className="block text-[#70878e]">Remaining balance</span><strong className="mt-1 block text-[#31546b]">{fmtKes(remainingBalance)}</strong></div><div className="pl-2"><span className="block text-[#70878e]">Est. installment</span><strong className="mt-1 block text-[#078b91]">{plannedInstallments ? `${fmtKes(estimatedInstallment)} / month` : 'One-time'}</strong></div></div></section>}
      {step === 4 && <section className="grid gap-3 border border-[#dce5e6] p-3"><h4 className="font-serif text-sm font-semibold text-[#123b4b]">4. Notes &amp; Confirmation</h4><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} maxLength={500} className="admin-input w-full resize-y" placeholder="Add sale notes, agreed terms or reservation context..." /></label><div className="border border-[#bfe3df] bg-[#f1faf9] p-3 text-[9px] leading-5 text-[#55717d]"><p className="font-semibold text-[#31546b]">Sale summary</p><p>{buyer?.full_name || buyer?.email || 'Buyer pending'} · Unit {selectedUnit?.unit_number || '—'} · {selectedUnit ? projectFor(selectedUnit) : 'Project pending'}</p><p>{fmtKes(unitPrice)} · {oneTime ? 'One-time payment' : `${plannedInstallments} ${frequency.toLowerCase()} installments`} · reservation for 48 hours</p><p>Payments remain pending until verified by NBG.</p></div></section>}
      {error && <p role="alert" className="text-[10px] text-[#a55445]">{error}</p>}
      <footer className="flex items-center justify-between gap-2 border-t border-[#e6eaea] pt-3"><button type="button" onClick={() => step === 1 ? onCancel?.() : setStep((current) => Math.max(1, current - 1))} disabled={saving} className="btn-secondary !px-3 !py-2 text-[9px] disabled:opacity-40">{step === 1 ? 'Cancel' : 'Back'}</button>{step < 4 ? <button type="button" onClick={advance} disabled={unitLoading || saving} className="btn-primary !px-3 !py-2 text-[9px] disabled:opacity-50">Continue <ArrowRight size={13} /></button> : <button type="submit" disabled={saving || !selectedUnit || !buyer} className="btn-primary !px-3 !py-2 text-[9px] disabled:opacity-50">{saving ? 'Saving sale...' : 'Save Sale'} <Check size={13} /></button>}</footer>
    </form>
  );
}

type BuyerPaymentRecord = { id: string; sale_id: string; installment_id: string | null; amount: number; payment_date: string; method: string; reference: string | null; transaction_ref?: string; created_at: string; notes: string | null };
type PaymentTarget = { installment: BuyerInstallment | null; amountDue: number };
type PaymentView = 'summary' | 'schedule' | 'transactions' | 'record';

function InstallmentPanel({ sale, goTo, initialView = 'summary' }: { sale: Sale; goTo: (tab: AdminTab) => void; initialView?: PaymentView }) {
  const [installments, setInstallments] = useState<BuyerInstallment[]>([]);
  const [payments, setPayments] = useState<BuyerPaymentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentTarget, setPaymentTarget] = useState<PaymentTarget | null>(null);
  const [loadError, setLoadError] = useState('');
  const [activeView, setActiveView] = useState<PaymentView>(initialView);
  const [realtimeReady, setRealtimeReady] = useState(false);
  const [realtimeNotice, setRealtimeNotice] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [successReference, setSuccessReference] = useState('');
  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError('');
    const [installmentResult, paymentResult] = await Promise.all([
      supabase.from('buyer_installments').select('*').eq('sale_id', sale.id).order('installment_number'),
      supabase.from('buyer_payments').select('id,sale_id,installment_id,amount,payment_date,method,reference,transaction_ref,created_at,notes').eq('sale_id', sale.id).order('payment_date', { ascending: false }),
    ]);
    if (installmentResult.error || paymentResult.error) {
      setLoadError('Payment details could not be loaded. Please retry.');
      setLoading(false);
      return;
    }
    setInstallments((installmentResult.data ?? []) as BuyerInstallment[]);
    setPayments((paymentResult.data ?? []) as BuyerPaymentRecord[]);
    setLoading(false);
  }, [sale.id]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let noticeTimer: number | undefined;
    const refreshFromRealtime = () => {
      setRealtimeNotice('A payment update was received and the ledger is refreshing.');
      if (noticeTimer) window.clearTimeout(noticeTimer);
      noticeTimer = window.setTimeout(() => setRealtimeNotice(''), 5000);
      void load(false);
    };
    const channel = supabase.channel(`sale-payment-updates-${sale.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buyer_payments', filter: `sale_id=eq.${sale.id}` }, refreshFromRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buyer_installments', filter: `sale_id=eq.${sale.id}` }, refreshFromRealtime)
      .subscribe((status) => setRealtimeReady(status === 'SUBSCRIBED'));
    return () => {
      if (noticeTimer) window.clearTimeout(noticeTimer);
      void supabase.removeChannel(channel);
    };
  }, [load, sale.id]);
  const total = sale.sale_price ?? 0;
  const deposit = sale.deposit_amount ?? 0;
  const scheduled = installments.reduce((sum, item) => sum + item.amount, 0);
  const installmentPaid = installments.reduce((sum, item) => sum + item.paid_amount, 0);
  const unallocatedPaid = payments.filter((payment) => !payment.installment_id).reduce((sum, payment) => sum + Number(payment.amount), 0);
  const paid = deposit + installmentPaid + unallocatedPaid;
  const balance = Math.max(total - paid, 0);
  const unscheduledBalance = Math.max(total - deposit - scheduled - unallocatedPaid, 0);
  const progress = total ? Math.min(100, Math.max(0, paid / total * 100)) : 0;
  const overdueCount = installments.filter((item) => Number(item.paid_amount) < Number(item.amount) && new Date(`${item.due_date}T00:00:00`) < new Date(new Date().toDateString())).length;
  const currentPaymentTarget = paymentTarget ? {
    installment: paymentTarget.installment ? installments.find((item) => item.id === paymentTarget.installment?.id) ?? paymentTarget.installment : null,
    amountDue: paymentTarget.installment
      ? Math.max(Number(installments.find((item) => item.id === paymentTarget.installment?.id)?.amount ?? paymentTarget.installment.amount) - Number(installments.find((item) => item.id === paymentTarget.installment?.id)?.paid_amount ?? paymentTarget.installment.paid_amount), 0)
      : unscheduledBalance,
  } : null;
  const openPaymentForm = (target: PaymentTarget) => {
    setPaymentTarget(target);
    setSuccessNotice('');
    setSuccessReference('');
    setActiveView('record');
  };
  const selectPaymentTarget = (targetId: string) => {
    if (!targetId) { setPaymentTarget(null); return; }
    if (targetId === 'unscheduled') { setPaymentTarget({ installment: null, amountDue: unscheduledBalance }); return; }
    const installment = installments.find((item) => item.id === targetId);
    if (installment) setPaymentTarget({ installment, amountDue: Math.max(Number(installment.amount) - Number(installment.paid_amount), 0) });
  };
  const exportPayments = () => void downloadReportPdf(
    `nbg-payment-ledger-${sale.unit_number}-${new Date().toISOString().slice(0, 10)}.pdf`,
    ['Buyer', 'Unit', 'Received date', 'Allocation', 'Amount', 'Method', 'Transaction ID', 'External reference', 'Notes'],
    payments.map((payment) => [sale.buyer_name, sale.unit_number, payment.payment_date, installments.find((item) => item.id === payment.installment_id)?.installment_number ? `Installment ${installments.find((item) => item.id === payment.installment_id)?.installment_number}` : 'Unscheduled sale balance', payment.amount, payment.method, payment.transaction_ref, payment.reference, payment.notes]),
    `Buyer Payment Ledger · Unit ${sale.unit_number}`,
  );
  if (loading) return <Spinner />;
  const navItems: { id: PaymentView; label: string; icon: typeof DollarSign }[] = [
    { id: 'summary', label: 'Overview', icon: DollarSign },
    { id: 'schedule', label: 'Schedule', icon: CalendarDays },
    { id: 'transactions', label: 'Transactions', icon: CreditCard },
    { id: 'record', label: 'Record payment', icon: Plus },
  ];
  const whatsappMessage = encodeURIComponent(`Hello ${sale.buyer_name}, I’m following up about the payment plan for Unit ${sale.unit_number}. Please reply here if you would like the latest balance or a receipt from the NBG team.`);
  return <div className="min-w-0">
    <nav aria-label="Payment sections" className="sticky top-[58px] z-10 -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-[#c9c5bd] bg-[#f0ede6]/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      {navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setActiveView(id)} aria-current={activeView === id ? 'page' : undefined} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${activeView === id ? 'border-[#087f88] text-[#087f88]' : 'border-transparent text-slate-500 hover:text-[#123b4b]'}`}><Icon size={14} />{label}</button>)}
      <span className={`ml-auto hidden shrink-0 items-center gap-1.5 px-2 text-[10px] sm:inline-flex ${realtimeReady ? 'text-[#2e6b3e]' : 'text-slate-400'}`}><span className={`h-2 w-2 rounded-full ${realtimeReady ? 'bg-[#2e6b3e]' : 'bg-slate-300'}`} />{realtimeReady ? 'Live sync' : 'Connecting'}</span>
    </nav>
    <div className="grid gap-3">
      {realtimeNotice && <p role="status" className="border border-[#a9d9d8] bg-[#eefbf9] px-3 py-2 text-xs text-[#087f88]">{realtimeNotice}</p>}
      {successNotice && <section key={successReference || successNotice} role="status" aria-live="polite" className="transaction-success-panel"><span className="transaction-success-icon"><CircleCheck size={22} /></span><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-[#225f3b]">{successNotice}</p><p className="mt-1 text-xs text-[#52725c]">The payment has been posted to the buyer ledger.</p>{successReference && <a href={`/verify/${encodeURIComponent(successReference)}`} target="_blank" rel="noreferrer" className="mt-2 inline-block font-mono text-xs font-semibold text-[#087f88] underline">{successReference} · Verify receipt</a>}</div><span className="transaction-success-check"><Check size={15} /></span></section>}
      {loadError && <p role="alert" className="flex flex-wrap items-center justify-between gap-3 border border-[#e4b8ad] bg-[#fff7f4] px-3 py-2 text-xs text-[#a55445]">{loadError}<button type="button" onClick={() => void load()} className="font-semibold underline">Retry</button></p>}
    </div>

    {activeView === 'summary' && <section className="grid gap-5">
      <div className="grid min-w-0 grid-cols-2 gap-3 xl:grid-cols-4"><StatMini label="Sale price" value={fmtKes(total)} color="text-[#2e5f7a]" /><StatMini label="Paid to date" value={fmtKes(paid)} color="text-[#2e6b3e]" /><StatMini label="Balance due" value={fmtKes(balance)} color="text-[#a55445]" /><StatMini label="Deposit recorded" value={fmtKes(deposit)} color="text-[#856b2e]" /></div>
      <section className="border border-[#c9c5bd] bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow text-[#087f88]">Collection progress</p><p className="mt-2 text-sm text-slate-600">{fmtKes(paid)} received of {fmtKes(total)}</p></div><strong className="font-serif text-2xl text-[#087f88]">{progress.toFixed(0)}%</strong></div><div className="mt-4 h-2 overflow-hidden bg-[#e6e2da]"><div className="h-full bg-[#19a69c] transition-[width]" style={{ width: `${progress}%` }} /></div><div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-slate-500"><span>{installments.length} scheduled installments</span><span>{overdueCount} overdue</span><span>{payments.length} recorded transactions</span></div></section>
      <section className="flex flex-wrap items-center justify-between gap-4 border border-[#c9c5bd] bg-white p-4"><div><p className="text-sm font-semibold text-[#123b4b]">Unit {sale.unit_number} · {sale.buyer_name}</p><p className="mt-1 text-xs text-slate-500">{sale.buyer_email || 'No email on file'}{sale.buyer_phone ? ` · ${sale.buyer_phone}` : ''}</p></div><div className="flex flex-wrap gap-2">{sale.buyer_email && <a href={`mailto:${sale.buyer_email}?subject=${encodeURIComponent(`Payment update for Unit ${sale.unit_number}`)}&body=${encodeURIComponent(`Hello ${sale.buyer_name},\n\nI’m following up about your payment plan for Unit ${sale.unit_number}. Please reply to this email if you need the latest balance or a copy of a receipt.\n\nKind regards,\nNext Bridge Group`)}`} className="btn-secondary !px-3 !py-2"><Mail size={14} /> Email buyer</a>}{sale.buyer_phone && <a href={`https://wa.me/${sale.buyer_phone.replace(/\D/g, '')}?text=${whatsappMessage}`} target="_blank" rel="noreferrer" className="btn-secondary !px-3 !py-2"><MessageCircle size={14} /> WhatsApp</a>}</div></section>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setActiveView('schedule')} className="btn-secondary !px-3 !py-2"><CalendarDays size={14} /> View schedule</button><button type="button" onClick={() => { setActiveView('transactions'); exportPayments(); }} className="btn-secondary !px-3 !py-2"><Download size={14} /> Export ledger</button><button type="button" onClick={() => goTo('documents')} className="btn-secondary !px-3 !py-2"><FileText size={14} /> Receipts & documents</button><button type="button" onClick={() => goTo('sales')} className="btn-secondary !px-3 !py-2"><Building2 size={14} /> Sales</button></div>
    </section>}

    {activeView === 'schedule' && <section className="overflow-hidden border border-[#c9c5bd] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e2da] bg-[#f0ede6] px-4 py-3"><div><h3 className="text-sm font-semibold text-[#123b4b]">Installment schedule</h3><p className="mt-1 text-xs text-slate-500">Record full or partial payments against scheduled installments.</p></div><span className="text-xs text-slate-500">{overdueCount} overdue</span></div>
      <div className="grid gap-3 p-3 sm:p-4">{installments.map((item) => {
        const amountDue = Math.max(Number(item.amount) - Number(item.paid_amount), 0);
        const isFutureDue = item.due_date > kenyaCalendarDate();
        const overdue = amountDue > 0 && item.due_date < kenyaCalendarDate();
        const displayStatus = amountDue === 0 ? isFutureDue ? 'PAID EARLY' : 'PAID' : overdue ? 'OVERDUE' : item.status;
        return <article key={item.id} className="grid min-w-0 gap-3 border border-[#e6e2da] p-3 sm:grid-cols-[minmax(120px,.7fr)_minmax(150px,1fr)_minmax(180px,1.2fr)_minmax(120px,.8fr)_auto] sm:items-center sm:p-4"><div><p className="text-xs font-semibold text-[#123b4b]">Installment {item.installment_number}</p><p className="mt-1 text-xs text-slate-500">Due {new Date(`${item.due_date}T00:00:00`).toLocaleDateString()}</p></div><div><p className="text-[10px] uppercase tracking-wide text-slate-400">Scheduled</p><p className="mt-1 text-sm font-semibold text-[#123b4b]">{fmtKes(item.amount)}</p></div><div><div className="flex justify-between gap-2 text-[10px] text-slate-500"><span>Paid {fmtKes(item.paid_amount)}</span><span>{amountDue ? `${fmtKes(amountDue)} due` : 'Settled'}</span></div><div className="mt-2 h-1.5 overflow-hidden bg-[#e6e2da]"><div className="h-full bg-[#19a69c]" style={{ width: `${item.amount ? Math.min(100, Number(item.paid_amount) / Number(item.amount) * 100) : 100}%` }} /></div></div><span className={`text-xs font-semibold ${displayStatus === 'OVERDUE' ? 'text-[#a55445]' : displayStatus === 'PAID' || displayStatus === 'PAID EARLY' ? 'text-[#2e6b3e]' : 'text-slate-500'}`}>{displayStatus}{displayStatus === 'PAID EARLY' && <span className="mt-1 block text-[10px] font-normal">Due {new Date(`${item.due_date}T00:00:00`).toLocaleDateString()}</span>}</span><button type="button" disabled={!amountDue} onClick={() => openPaymentForm({ installment: item, amountDue })} className="whitespace-nowrap text-left text-xs font-semibold text-[#087f88] hover:underline disabled:text-slate-300">{amountDue ? 'Record payment' : 'Settled'}</button></article>;
      })}</div>
      {installments.length === 0 && <p className="px-4 pb-5 text-sm text-slate-500">No installment plan was created for this sale.</p>}
      {unscheduledBalance > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6e2da] bg-[#f8f7f3] px-4 py-4"><div><p className="text-sm font-semibold text-[#123b4b]">Unscheduled sale balance</p><p className="mt-1 text-xs text-slate-500">For sales without a plan or amounts not covered by scheduled installments.</p></div><div className="flex items-center gap-3"><strong className="text-sm text-[#856b2e]">{fmtKes(unscheduledBalance)}</strong><button type="button" onClick={() => openPaymentForm({ installment: null, amountDue: unscheduledBalance })} className="text-xs font-semibold text-[#087f88] hover:underline">Record payment</button></div></div>}
    </section>}

    {activeView === 'transactions' && <section className="overflow-hidden border border-[#c9c5bd] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e2da] bg-[#f0ede6] px-4 py-3"><div><h3 className="text-sm font-semibold text-[#123b4b]">Transaction ledger</h3><p className="mt-1 text-xs text-slate-500">{payments.length} receipt{payments.length === 1 ? '' : 's'} recorded for this sale.</p></div><button type="button" onClick={exportPayments} disabled={!payments.length} className="btn-secondary !px-3 !py-2 disabled:opacity-50"><Download size={14} /> Export PDF</button></div>
      {payments.length ? <div className="divide-y divide-[#e6e2da]">{payments.map((payment) => { const installment = installments.find((item) => item.id === payment.installment_id); const advance = installment && installment.due_date > payment.payment_date; return <article key={payment.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_1.2fr_1fr_auto] sm:items-center"><div><p className="text-sm font-semibold text-[#123b4b]">{fmtKes(payment.amount)}</p><p className="mt-1 text-xs text-slate-500">Received {new Date(`${payment.payment_date}T00:00:00`).toLocaleDateString()}</p><p className="mt-1 text-[10px] text-slate-400">Posted {payment.transaction_ref ? payment.created_at ? new Date(payment.created_at).toLocaleString() : 'time recorded' : 'in payment ledger'}</p></div><div><p className="text-xs font-medium text-[#123b4b]">{installment ? `Installment ${installment.installment_number}` : 'Unscheduled sale balance'}</p><p className="mt-1 text-xs text-slate-500">{payment.method.replace('_', ' ')}{payment.reference ? ` · External ref ${payment.reference}` : ''}</p>{payment.transaction_ref && <a href={`/verify/${encodeURIComponent(payment.transaction_ref)}`} target="_blank" rel="noreferrer" className="mt-1 inline-block font-mono text-[10px] text-[#087f88] underline">{payment.transaction_ref}</a>}{advance && <p className="mt-1 text-[10px] font-semibold uppercase text-[#856b2e]">Advance received · scheduled {new Date(`${installment.due_date}T00:00:00`).toLocaleDateString()}</p>}</div><p className="text-xs text-slate-500">{payment.notes || 'No additional notes'}</p><span className="text-[10px] font-semibold uppercase tracking-wide text-[#2e6b3e]">Recorded</span></article>; })}</div> : <div className="p-8 text-center"><p className="text-sm font-semibold text-[#123b4b]">No recorded transactions</p><p className="mt-1 text-xs text-slate-500">Payments you record will appear here with their receipt details.</p></div>}
      <div className="flex flex-wrap gap-2 border-t border-[#e6e2da] bg-[#f8f7f3] p-4"><button type="button" onClick={() => goTo('documents')} className="btn-secondary !px-3 !py-2"><FileText size={14} /> Create receipt / open documents</button><button type="button" onClick={() => goTo('sales')} className="btn-secondary !px-3 !py-2"><Building2 size={14} /> Return to sales</button><button type="button" onClick={() => goTo('payments')} className="btn-secondary !px-3 !py-2"><CreditCard size={14} /> All buyer payments</button></div>
    </section>}

    {activeView === 'record' && <section className="grid gap-4 border border-[#c9c5bd] bg-white p-4 sm:p-5">
      <div><p className="eyebrow text-[#087f88]">New receipt</p><h3 className="mt-2 font-serif text-2xl text-[#123b4b]">Record a transaction</h3><p className="mt-1 text-xs text-slate-500">Choose where to allocate this amount. Partial payments are supported.</p></div>
      <label className="block max-w-xl"><span className="eyebrow mb-1.5 block text-slate-500">Allocate payment to</span><select value={currentPaymentTarget?.installment?.id ?? (paymentTarget ? 'unscheduled' : '')} onChange={(event) => selectPaymentTarget(event.target.value)} className="admin-input w-full"><option value="">Choose an installment or balance</option>{installments.map((item) => { const due = Math.max(Number(item.amount) - Number(item.paid_amount), 0); return <option key={item.id} value={item.id} disabled={!due}>Installment {item.installment_number} · {fmtKes(due)} due</option>; })}<option value="unscheduled" disabled={!unscheduledBalance}>Unscheduled balance · {fmtKes(unscheduledBalance)} due</option></select></label>
      {currentPaymentTarget && currentPaymentTarget.amountDue > 0 ? <PaymentForm key={`${currentPaymentTarget.installment?.id ?? 'unscheduled'}-${currentPaymentTarget.amountDue}`} saleId={sale.id} installment={currentPaymentTarget.installment} amountDue={currentPaymentTarget.amountDue} oneTime={sale.installment_frequency === 'ONE_TIME'} onDone={(transactionRef: string) => { setPaymentTarget(null); setSuccessReference(transactionRef); setSuccessNotice('Payment recorded successfully.'); setActiveView('transactions'); void load(false); }} /> : <div className="border border-dashed border-[#c9c5bd] bg-[#f8f7f3] p-5 text-sm text-slate-500">{paymentTarget ? 'This balance has been settled. Select another allocation to record a payment.' : 'Select an open installment or balance to begin.'}</div>}
      <div className="flex flex-wrap gap-2 border-t border-[#e6e2da] pt-4"><button type="button" onClick={() => goTo('documents')} className="btn-secondary !px-3 !py-2"><FileText size={14} /> Receipt documents</button>{sale.buyer_email && <a href={`mailto:${sale.buyer_email}?subject=${encodeURIComponent(`Payment received for Unit ${sale.unit_number}`)}`} className="btn-secondary !px-3 !py-2"><Mail size={14} /> Email buyer</a>}{sale.buyer_phone && <a href={`https://wa.me/${sale.buyer_phone.replace(/\D/g, '')}?text=${whatsappMessage}`} target="_blank" rel="noreferrer" className="btn-secondary !px-3 !py-2"><MessageCircle size={14} /> WhatsApp</a>}</div>
    </section>}
  </div>;
}

function PaymentForm({ saleId, installment, amountDue, oneTime, onDone }: { saleId: string; installment: BuyerInstallment | null; amountDue: number; oneTime: boolean; onDone: (transactionRef: string) => void }) {
  const [amount, setAmount] = useState(String(amountDue));
  const [method, setMethod] = useState('BANK_TRANSFER');
  const [reference, setReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(kenyaCalendarDate);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsedAmount = parseMoney(amount);
    if (parsedAmount <= 0) { setError('Enter a payment amount greater than zero.'); return; }
    if (oneTime && parsedAmount !== amountDue) { setError(`A one-time payment must settle the full amount of ${fmtKes(amountDue)}.`); return; }
    if (parsedAmount > amountDue) { setError(`Payment exceeds the remaining balance of ${fmtKes(amountDue)}.`); return; }
    if (!paymentDate) { setError('Select the date the payment was received.'); return; }
    setSaving(true);
    setError('');
    const { data, error: paymentError } = await supabase.from('buyer_payments').insert({
      sale_id: saleId,
      installment_id: installment?.id ?? null,
      amount: parsedAmount,
      payment_date: paymentDate,
      method,
      reference: reference.trim() || null,
      notes: notes.trim() || null,
    }).select('transaction_ref').single();
    setSaving(false);
    if (paymentError || !data?.transaction_ref) { setError(paymentError?.message || 'Payment was recorded, but its transaction reference could not be loaded. Refresh the ledger before recording another payment.'); return; }
    onDone(data.transaction_ref);
  };
  return <form onSubmit={submit} className="grid gap-4 border border-[#a9d9d8] bg-[#f8fdfc] p-4">
    <div><p className="eyebrow text-[#087f88]">Record payment</p><p className="mt-1 text-xs text-slate-500">{oneTime ? 'Full balance · one-time payment' : installment ? `Installment ${installment.installment_number}` : 'Unscheduled sale balance'} · {fmtKes(amountDue)} remaining</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Amount (KSh)</span><input type="number" min={oneTime ? amountDue : 0.01} max={amountDue} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="admin-input w-full" /></label>
      <label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Received on</span><input type="date" max={kenyaCalendarDate()} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} required className="admin-input w-full" /></label>
      <label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Method</span><select value={method} onChange={(event) => setMethod(event.target.value)} className="admin-input w-full">{PAYMENT_METHODS.map((item) => <option key={item} value={item}>{item.replace('_', ' ')}</option>)}</select></label>
      <label className="block"><span className="eyebrow mb-1.5 block text-slate-500">External reference</span><input value={reference} onChange={(event) => setReference(event.target.value)} className="admin-input w-full" placeholder="Bank / M-Pesa confirmation code" /></label>
    </div>
    <label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Notes</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} className="admin-input w-full resize-y" placeholder="Optional reconciliation details" /></label>
    {error && <p role="alert" className="text-sm text-[#a55445]">{error}</p>}
    <div className="flex justify-end"><button type="submit" disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Recording…' : 'Record payment'} <Check size={15} /></button></div>
  </form>;
}

// ─── Units ───────────────────────────────────────────────

function UnitsTab({ canReserve, canDelete }: { canReserve: boolean; canDelete: boolean }) {
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectLoadError, setProjectLoadError] = useState('');
  const [reservations, setReservations] = useState<{ unit_id: string; buyer_name: string; reservation_expires_at: string | null; reservation_source: string; reservation_reason: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [floorFilter, setFloorFilter] = useState('ALL');
  const [visibilityFilter, setVisibilityFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState<'UNIT' | 'PRICE_ASC' | 'PRICE_DESC'>('UNIT');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ProjectUnit | null>(null);
  const [reservationUnit, setReservationUnit] = useState<ProjectUnit | null>(null);

  const load = useCallback(async () => {
    const [ur, projectResult, sr] = await Promise.all([
      supabase.from('project_units').select('*').order('unit_number'),
      supabase.from('projects').select('id,name,payment_policy').order('name'),
      supabase.from('sales').select('unit_id,buyer_name,reservation_expires_at,reservation_source,reservation_reason').eq('status', 'RESERVED').not('unit_id', 'is', null).order('created_at', { ascending: false }),
    ]);
    let projectData = projectResult.data;
    let projectError = projectResult.error;
    if (projectError && /payment_policy|column/i.test(projectError.message)) {
      const fallbackResult = await supabase.from('projects').select('id,name').order('name');
      projectData = fallbackResult.data?.map((project) => ({ ...project, payment_policy: 'INSTALLMENTS_OPTIONAL' })) ?? null;
      projectError = fallbackResult.error;
    }
    setProjectLoadError(projectError ? `Projects could not be loaded: ${projectError.message}` : '');
    setUnits((ur.data ?? []) as ProjectUnit[]);
    setProjects((projectData ?? []) as Project[]);
    setReservations((sr.data ?? []) as { unit_id: string; buyer_name: string; reservation_expires_at: string | null; reservation_source: string; reservation_reason: string | null }[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const channel = supabase.channel('admin-unit-reservation-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_units' }, () => { void load(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const filtered = useMemo(() => units.filter((unit) => {
    const query = search.trim().toLowerCase();
    return (statusFilter === 'ALL' || unit.status === statusFilter)
      && (typeFilter === 'ALL' || unit.type === typeFilter)
      && (floorFilter === 'ALL' || unit.floor === floorFilter)
      && (visibilityFilter === 'ALL' || String(Boolean(unit.is_published)) === visibilityFilter)
      && (!query || `${unit.unit_number} ${unit.type ?? ''} ${unit.view ?? ''} ${projects.find((project) => project.id === unit.project_id)?.name ?? ''}`.toLowerCase().includes(query));
  }).sort((left, right) => sortOrder === 'PRICE_ASC' ? parseMoney(left.price ?? '') - parseMoney(right.price ?? '') : sortOrder === 'PRICE_DESC' ? parseMoney(right.price ?? '') - parseMoney(left.price ?? '') : left.unit_number.localeCompare(right.unit_number)), [units, projects, search, statusFilter, typeFilter, floorFilter, visibilityFilter, sortOrder]);

  const togglePublished = async (unit: ProjectUnit) => {
    const is_published = !unit.is_published;
    setUnits((p) => p.map((u) => u.id === unit.id ? { ...u, is_published } : u));
    await supabase.from('project_units').update({ is_published }).eq('id', unit.id);
  };

  const remove = async (id: string) => {
    if (!canDelete) { notifyAdmin('Only Admin/Owner can delete inventory units.', 'error'); return; }
    if (!window.confirm('Delete this unit?')) return;
    const { error } = await supabase.from('project_units').delete().eq('id', id);
    if (error) {
      window.dispatchEvent(new CustomEvent('nbg-admin-toast', { detail: { type: 'error', message: error.message || 'Unit could not be deleted.' } }));
      return;
    }
    setUnits((p) => p.filter((u) => u.id !== id));
  };

  if (loading) return <Spinner />;

  const counts = UNIT_STATUSES.reduce((acc, s) => ({ ...acc, [s]: units.filter((u) => u.status === s).length }), {} as Record<string, number>);

  return (
    <div>
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4"><div><p className="eyebrow text-[#087f88]">Inventory management</p><h2 className="mt-1 font-serif text-3xl text-[#123b4b]">Units & Inventory</h2><p className="mt-1 text-sm text-slate-500">Manage apartment inventory, pricing, availability and public visibility.</p></div><div className="flex gap-2"><button type="button" onClick={() => { const csv = ['Unit,Project,Type,Floor,Bedrooms,Area,Price,View,Status,Payment mode,Visibility', ...filtered.map((unit) => [unit.unit_number, projects.find((project) => project.id === unit.project_id)?.name ?? '', unit.type ?? '', unit.floor ?? '', unit.bedrooms ?? '', unit.size ?? '', unit.price ?? '', unit.view ?? '', unit.status, unit.payment_mode ?? 'INSTALLMENTS', unit.is_published ? 'Public' : 'Hidden'].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))].join('\n'); const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); link.download = 'nbg-units.csv'; link.click(); URL.revokeObjectURL(link.href); }} className="btn-secondary"><Download size={14} /> Export CSV</button><button type="button" onClick={() => setShowForm(true)} className="admin-add-btn flex items-center gap-2"><Plus size={15} /> Add unit</button></div></header>
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[{ label: 'Total units', value: units.length, tone: 'text-[#123b4b]', icon: Building2 }, { label: 'Available', value: counts.AVAILABLE || 0, tone: 'text-[#2e6b3e]', icon: Eye }, { label: 'Reserved', value: counts.RESERVED || 0, tone: 'text-[#856b2e]', icon: CalendarDays }, { label: 'Sold', value: counts.SOLD || 0, tone: 'text-[#a55445]', icon: Check }].map(({ label, value, tone, icon: Icon }) => <article key={label} className="flex items-center justify-between border border-[#d6efee] bg-white p-4"><div><p className="eyebrow text-slate-500">{label}</p><p className={`mt-2 text-2xl font-semibold ${tone}`}>{value}</p></div><span className="grid size-10 place-items-center bg-[#eefbf9] text-[#087f88]"><Icon size={18} /></span></article>)}</div>
      <div className="mb-4 grid gap-2 lg:grid-cols-[minmax(220px,1fr)_repeat(4,minmax(110px,auto))]"><label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} className="admin-input w-full pl-9" placeholder="Search unit, type, floor or project" aria-label="Search units" /></label><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="admin-input"><option value="ALL">All statuses</option>{UNIT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select><select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="admin-input"><option value="ALL">All unit types</option>{UNIT_TYPES.map((type) => <option key={type}>{type}</option>)}</select><select value={floorFilter} onChange={(event) => setFloorFilter(event.target.value)} className="admin-input"><option value="ALL">All floors</option>{[...new Set(units.map((unit) => unit.floor).filter(Boolean))].sort((a, b) => Number(a) - Number(b)).map((floor) => <option key={floor ?? 'unknown'} value={floor ?? ''}>Floor {floor}</option>)}</select><select value={visibilityFilter} onChange={(event) => setVisibilityFilter(event.target.value)} className="admin-input"><option value="ALL">Any visibility</option><option value="true">Public</option><option value="false">Hidden</option></select></div>
      <div className="overflow-hidden border border-[#c9c5bd] bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e2da] bg-[#f8f7f3] px-4 py-3"><p className="text-xs text-slate-500">Showing {filtered.length} of {units.length} homes</p><label className="flex items-center gap-2 text-xs text-slate-500">Sort<select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as typeof sortOrder)} className="admin-input !py-1.5"><option value="UNIT">Unit number</option><option value="PRICE_ASC">Price: low to high</option><option value="PRICE_DESC">Price: high to low</option></select></label></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#f4f3ef] text-[10px] uppercase tracking-[.1em] text-[#55777d]"><tr>{['Unit', 'Unit type', 'Floor', 'Beds', 'Area (m²)', 'Price (KES)', 'View', 'Status', 'Payment', 'Public', 'Actions'].map((heading) => <th key={heading} className="px-3 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody>{filtered.map((unit) => { const reservation = reservations.find((item) => item.unit_id === unit.id && item.reservation_expires_at && new Date(item.reservation_expires_at).getTime() > Date.now()); return <tr key={unit.id} className="border-t border-[#e6e2da] hover:bg-[#f8fbfa]"><td className="px-3 py-3"><div className="flex items-center gap-2.5">{unit.image_url ? <img src={unit.image_url} alt="" className="size-11 object-cover" /> : <span className="grid size-11 place-items-center bg-[#eefbf9] text-[#087f88]"><Building2 size={17} /></span>}<span><strong className="block text-xs text-[#123b4b]">{unit.unit_number}</strong><small className="text-[10px] text-slate-400">{projects.find((project) => project.id === unit.project_id)?.name || 'Project pending'}</small></span></div></td><td className="px-3 py-3 text-xs">{unit.type || '—'}</td><td className="px-3 py-3 text-xs">{unit.floor ? `Floor ${unit.floor}` : '—'}</td><td className="px-3 py-3 text-xs">{unit.bedrooms ?? '—'}</td><td className="px-3 py-3 text-xs">{unit.size || '—'}</td><td className="px-3 py-3 text-xs font-semibold">{unit.price ? fmtKes(parseMoney(unit.price)) : 'Price pending'}</td><td className="px-3 py-3 text-xs">{unit.view || '—'}</td><td className="px-3 py-3"><span className={`inline-flex px-2 py-1 text-[10px] font-semibold ${unit.status === 'AVAILABLE' ? 'bg-[#e3f4e6] text-[#2e6b3e]' : unit.status === 'RESERVED' ? 'bg-[#fff2d8] text-[#856b2e]' : 'bg-[#fae4e2] text-[#a55445]'}`}>{unit.status}</span>{reservation && <small className="mt-1 block max-w-[110px] truncate text-[9px] text-slate-400" title={reservation.buyer_name}>{reservation.buyer_name}</small>}</td><td className="px-3 py-3 text-[10px] text-slate-500">{unit.payment_mode === 'ONE_TIME' ? 'One-time' : 'Installments'}</td><td className="px-3 py-3"><button type="button" onClick={() => void togglePublished(unit)} aria-label={`${unit.is_published ? 'Hide' : 'Publish'} ${unit.unit_number}`} className={`text-xs font-semibold ${unit.is_published ? 'text-[#2e6b3e]' : 'text-slate-400'}`}>{unit.is_published ? '● Live' : '○ Hidden'}</button></td><td className="px-3 py-3"><div className="flex items-center gap-2"><button type="button" onClick={() => setEditing(unit)} aria-label={`Edit ${unit.unit_number}`} className="grid size-8 place-items-center border border-[#d6efee] text-[#087f88]"><Pencil size={14} /></button><button type="button" onClick={() => void remove(unit.id)} aria-label={`Delete ${unit.unit_number}`} className="grid size-8 place-items-center border border-[#f0ddda] text-[#a55445]"><Trash2 size={14} /></button>{canReserve && unit.status === 'AVAILABLE' && <button type="button" onClick={() => setReservationUnit(unit)} className="text-[10px] font-semibold text-[#087f88]">Reserve</button>}</div></td></tr>; })}{filtered.length === 0 && <EmptyRow cols={11} text="No homes match these filters." />}</tbody></table></div></div>
      {(showForm || editing) && <div className="fixed inset-0 z-50 flex justify-end bg-[#071116]/55" role="dialog" aria-modal="true" aria-label={editing ? `Edit unit ${editing.unit_number}` : 'Add unit'}><button type="button" className="absolute inset-0 cursor-default" onClick={() => { setShowForm(false); setEditing(null); }} aria-label="Close unit editor" /><aside className="relative z-10 h-full w-full max-w-[560px] overflow-y-auto border-l border-[#c9c5bd] bg-[#faf9f6] shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e6e2da] bg-white px-5 py-4"><div><p className="eyebrow text-[#087f88]">{editing ? 'Inventory record' : 'New inventory'}</p><h3 className="mt-1 font-serif text-2xl text-[#123b4b]">{editing ? `Edit ${editing.unit_number}` : 'Add a unit'}</h3></div><button type="button" onClick={() => { setShowForm(false); setEditing(null); }} aria-label="Close unit editor" className="grid size-9 place-items-center border border-[#d6efee]"><X size={17} /></button></div><div className="p-5"><UnitForm key={editing?.id || 'new-unit'} projects={projects} projectLoadError={projectLoadError} initial={editing ?? undefined} onDone={(unit) => { setUnits((previous) => editing ? previous.map((item) => item.id === unit.id ? unit : item) : [unit, ...previous]); setShowForm(false); setEditing(null); }} /></div></aside></div>}
      {reservationUnit && <Modal title={`Reserve ${reservationUnit.unit_number}`} onClose={() => setReservationUnit(null)}><AdminUnitReservationForm unit={reservationUnit} onDone={() => { setReservationUnit(null); void load(); }} /></Modal>}
    </div>
  );
}

function UnitForm({ projects, projectLoadError, initial, onDone }: { projects: Project[]; projectLoadError: string; initial?: ProjectUnit; onDone: (u: ProjectUnit) => void }) {
  const initialProject = projects.find((project) => project.id === initial?.project_id);
  const initialMode = initialProject?.payment_policy === 'ONE_TIME_ONLY' ? 'ONE_TIME' : initial?.payment_mode ?? '';
  const [f, setF] = useState({ unit_number: initial?.unit_number ?? '', project_id: initial?.project_id ?? '', type: initial?.type ?? '', bedrooms: initial?.bedrooms?.toString() ?? '', bathrooms: initial?.bathrooms?.toString() ?? '', size: initial?.size ?? '', floor: initial?.floor ?? '', parking: initial?.parking ?? '', view: initial?.view ?? '', description: initial?.description ?? '', price: initial?.price ?? '', payment_mode: initialMode as 'ONE_TIME' | 'INSTALLMENTS', is_published: initial?.is_published ?? false });
  const [image, setImage] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr('');
    if (!f.payment_mode) { setErr('Choose a payment mode for this unit.'); return; }
    setSaving(true);
    let image_url: string | null = initial?.image_url ?? null;
    try { if (image) image_url = await uploadPublicMedia(image, 'units'); } catch (error) { setErr(uploadErrorMessage(error)); setSaving(false); return; }
    const values = {
      unit_number: f.unit_number || 'AUTO', project_id: f.project_id || null, type: f.type || null,
      bedrooms: f.bedrooms ? parseInt(f.bedrooms) : null, bathrooms: f.bathrooms ? parseInt(f.bathrooms) : null, size: f.size || null,
      floor: f.floor || null, parking: f.parking || null, view: f.view || null,
      description: f.description || null, price: f.price || null, payment_mode: f.payment_mode, image_url, is_published: f.is_published,
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
          {projectLoadError && <span role="alert" className="mb-2 block text-xs text-[#a55445]">{projectLoadError}</span>}
          <select value={f.project_id} onChange={(e) => { const project = projects.find((item) => item.id === e.target.value); setF({ ...f, project_id: e.target.value, payment_mode: project?.payment_policy === 'ONE_TIME_ONLY' ? 'ONE_TIME' : f.payment_mode }); }} className="admin-input w-full">
            <option value="">— No project —</option>
            {projects.length === 0 && <option value="" disabled>No projects available</option>}
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Unit image</span>{initial?.image_url && !image && <img src={initial.image_url} alt="Current unit" className="mb-2 h-24 w-full object-cover" />}<span className="flex cursor-pointer items-center gap-2 border border-dashed border-[#20afd1] bg-[#f5fbfc] px-3 py-3 text-xs text-[#247b85] hover:bg-[#e8f7fa]"><Upload size={15} /> {image?.name ?? (initial?.image_url ? 'Replace current image' : 'Choose image from computer')}<input type="file" accept="image/*" className="hidden" onChange={(e) => setImage(e.target.files?.[0] ?? null)} /></span></label>
      <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={f.is_published} onChange={(e) => setF({ ...f, is_published: e.target.checked })} /> Publish this unit on the public website</label>
      <div className="grid grid-cols-2 gap-4"><label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Unit type</span><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="admin-input w-full"><option value="">— Select type —</option>{UNIT_TYPES.map((item) => <option key={item}>{item}</option>)}</select></label><AF label="Bedrooms" type="number" value={f.bedrooms} onChange={(v) => setF({ ...f, bedrooms: v })} /></div>
      <div className="grid grid-cols-2 gap-4"><AF label="Bathrooms" type="number" value={f.bathrooms} onChange={(v) => setF({ ...f, bathrooms: v })} /><AF label="Area (m²)" value={f.size} onChange={(v) => setF({ ...f, size: v })} /></div>
      <div className="grid grid-cols-2 gap-4">
        <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Floor</span><select value={f.floor} onChange={(e) => setF({ ...f, floor: e.target.value })} className="admin-input w-full"><option value="">— Select floor —</option>{FLOOR_OPTIONS.map((item) => <option key={item} value={item}>Floor {item}</option>)}</select></label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Parking</span><select value={f.parking} onChange={(e) => setF({ ...f, parking: e.target.value })} className="admin-input w-full"><option value="">— Select parking —</option>{PARKING_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">View</span><select value={f.view} onChange={(e) => setF({ ...f, view: e.target.value })} className="admin-input w-full"><option value="">— Select view —</option>{VIEW_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label>
      </div>
      <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Unit description</span><textarea maxLength={500} value={f.description} onChange={(event) => setF({ ...f, description: event.target.value })} rows={3} className="admin-input w-full resize-y" placeholder="Describe the layout, finishes and key features" /><span className="mt-1 block text-right text-[10px] text-slate-400">{f.description.length}/500</span></label>
      <AF label="Price (KSh)" value={f.price} onChange={(v) => setF({ ...f, price: v })} currency />
      <fieldset><legend className="eyebrow mb-2 text-slate-500">Payment mode *</legend>{projects.find((project) => project.id === f.project_id)?.payment_policy === 'ONE_TIME_ONLY' ? <p className="border border-[#e7d3a8] bg-[#fff8e6] p-3 text-xs font-semibold text-[#765d2b]">One-time payment is required by this project.</p> : <div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={f.payment_mode === 'ONE_TIME'} onClick={() => setF({ ...f, payment_mode: 'ONE_TIME' })} className={`flex items-center gap-2 border p-3 text-left text-xs font-semibold ${f.payment_mode === 'ONE_TIME' ? 'border-[#087f88] bg-[#e8f7f6] text-[#087f88]' : 'border-[#d6efee] bg-white text-slate-600'}`}><CircleCheck size={15} />One-time payment</button><button type="button" aria-pressed={f.payment_mode === 'INSTALLMENTS'} onClick={() => setF({ ...f, payment_mode: 'INSTALLMENTS' })} className={`flex items-center gap-2 border p-3 text-left text-xs font-semibold ${f.payment_mode === 'INSTALLMENTS' ? 'border-[#087f88] bg-[#e8f7f6] text-[#087f88]' : 'border-[#d6efee] bg-white text-slate-600'}`}><CalendarDays size={15} />Installments</button></div>}{!f.payment_mode && <p className="mt-2 text-[10px] text-[#a55445]">Select one option to save this unit.</p>}</fieldset>
      {err && <p className="text-sm text-[#a55445]">{err}</p>}
      <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving…' : initial ? 'Save Unit Changes' : 'Add Unit'} <ArrowRight size={15} /></button>
    </form>
  );
}

function AdminUnitReservationForm({ unit, onDone }: { unit: ProjectUnit; onDone: () => void }) {
  const [buyerQuery, setBuyerQuery] = useState('');
  const [buyer, setBuyer] = useState<BuyerProfileMatch | null>(null);
  const [buyerMatches, setBuyerMatches] = useState<BuyerProfileMatch[]>([]);
  const [hours, setHours] = useState('48');
  const [reason, setReason] = useState('');
  const [initialPayment, setInitialPayment] = useState('');
  const [installments, setInstallments] = useState('12');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const unitPrice = Number((unit.price ?? '').replace(/[^0-9.]/g, '')) || 0;

  useEffect(() => {
    const query = buyerQuery.trim();
    if (query.length < 2 || buyer) { setBuyerMatches([]); return; }
    let active = true;
    const timer = window.setTimeout(async () => {
      const { data } = await supabase.rpc('search_client_profiles', { p_query: query });
      if (active) setBuyerMatches((data ?? []) as BuyerProfileMatch[]);
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [buyerQuery, buyer]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!buyer) { setError('Choose a registered client account.'); return; }
    if (!unitPrice) { setError('A confirmed price is required before reserving this unit.'); return; }
    const oneTime = unit.payment_mode === 'ONE_TIME';
    const amount = oneTime ? unitPrice : parseMoney(initialPayment);
    if (!amount || amount > unitPrice || (!oneTime && amount >= unitPrice) || (!oneTime && Number(installments) < 1)) { setError('Enter a valid initial payment and installment plan for this unit.'); return; }
    setSaving(true);
    const { data, error: reservationError } = await supabase.rpc('reserve_unit_for_client', {
      p_unit_id: unit.id,
      p_buyer_user_id: buyer.user_id,
      p_reservation_hours: Number(hours),
      p_reason: reason.trim(),
      p_initial_payment: amount,
      p_installment_count: oneTime ? 0 : Number(installments),
      p_frequency: oneTime ? 'MONTHLY' : frequency,
    });
    setSaving(false);
    if (reservationError || !data?.length) { setError(reservationError?.message || 'The unit could not be reserved. Refresh inventory and retry.'); return; }
    window.dispatchEvent(new CustomEvent('nbg-admin-toast', { detail: { type: 'success', message: `Unit ${unit.unit_number} reserved for ${buyer.full_name || buyer.email} until ${new Date(data[0].expires_at).toLocaleString()}.` } }));
    onDone();
  };

  return <form onSubmit={submit} className="grid gap-4">
    <p className="text-sm leading-6 text-slate-500">An override reservation requires a registered client, recorded justification, and payment schedule. Maximum duration is 168 hours.</p>
    <div className="relative"><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Registered buyer account *</span><input value={buyer ? buyer.full_name || buyer.email || '' : buyerQuery} onChange={(event) => { setBuyer(null); setBuyerQuery(event.target.value); }} required className="admin-input w-full" autoComplete="off" placeholder="Search name, email, or phone" /></label>{buyerMatches.length > 0 && <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto border border-[#c9c5bd] bg-white shadow-lg">{buyerMatches.map((match) => <button key={match.user_id} type="button" onClick={() => { setBuyer(match); setBuyerQuery(''); setBuyerMatches([]); }} className="block w-full border-b border-[#e6e2da] px-3 py-2 text-left hover:bg-[#eefbf9]"><span className="block text-sm font-semibold">{match.full_name || 'NBG client'}</span><span className="text-xs text-slate-500">{match.email || 'No email'}{match.phone ? ` · ${match.phone}` : ''}</span></button>)}</div>}{buyer && <p className="mt-1 text-xs text-[#087f88]">Client account selected: {buyer.email}</p>}</div>
    <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Reservation duration (hours)</span><input type="number" min="1" max="168" required value={hours} onChange={(event) => setHours(event.target.value)} className="admin-input w-full" /></label><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">{unit.payment_mode === 'ONE_TIME' ? 'Full payment (KSh)' : 'Initial payment (KSh)'}</span>{unit.payment_mode === 'ONE_TIME' ? <p className="admin-input w-full bg-[#f4f1eb]">{fmtKes(unitPrice)}</p> : <CurrencyInput value={initialPayment} onChange={setInitialPayment} className="admin-input w-full" />}</label></div>
    {unit.payment_mode !== 'ONE_TIME' && <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Installments after initial payment</span><input type="number" min="1" max="120" value={installments} onChange={(event) => setInstallments(event.target.value)} className="admin-input w-full" /></label><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Frequency</span><select value={frequency} onChange={(event) => setFrequency(event.target.value)} className="admin-input w-full"><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="ANNUALLY">Annually</option></select></label></div>}
    <label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Reason for override *</span><textarea minLength={12} maxLength={500} required value={reason} onChange={(event) => setReason(event.target.value)} rows={3} className="admin-input w-full resize-y" placeholder="Record the business reason for this reservation" /></label>
    {error && <p role="alert" className="text-sm text-[#a55445]">{error}</p>}
    <button type="submit" disabled={saving || !buyer || !unitPrice} className="btn-primary justify-center disabled:opacity-60">{saving ? 'Reserving…' : 'Confirm reservation'} <CalendarDays size={15} /></button>
  </form>;
}

// ─── Investments ─────────────────────────────────────────

type InvestmentTransaction = { id: string; transaction_ref: string; investment_id: string; project_id: string | null; transaction_type: string; amount: number; currency: string; transaction_date: string; period_start?: string | null; months_covered?: number; covers_full_balance?: boolean; reference: string | null; notes: string | null; created_at: string };
type InvestmentAccount = { user_id: string; full_name: string | null; phone: string | null; email: string | null };

function InvestmentsTab({ canManageFinancials, onReview }: { canManageFinancials: boolean; onReview: () => void }) {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [transactions, setTransactions] = useState<InvestmentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [tableProjectFilter, setTableProjectFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [commitmentDrafts, setCommitmentDrafts] = useState<Record<string, string>>({});
  const [editingCommitmentId, setEditingCommitmentId] = useState<string | null>(null);
  const [openInvestmentActions, setOpenInvestmentActions] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [ir, pr] = await Promise.all([
      supabase.from('investments').select('*').order('created_at', { ascending: false }),
      supabase.from('projects').select('id,name'),
    ]);
    setInvestments((ir.data ?? []) as Investment[]);
    setProjects((pr.data ?? []) as Project[]);
    if (canManageFinancials) {
      const { data, error } = await supabase.from('investment_transactions').select('*').order('transaction_date', { ascending: false });
      if (error) notifyAdmin(`Investment transactions are unavailable: ${error.message}`, 'error');
      setTransactions((data ?? []) as InvestmentTransaction[]);
    }
    setLoading(false);
  }, [canManageFinancials]);
  useEffect(() => { load(); }, [load]);

  const projectNames = useMemo(() => new Map(projects.map((project) => [project.id, project.name])), [projects]);
  const projectInvestments = useMemo(() => investments.filter((investment) => projectFilter === 'ALL' || investment.project_id === projectFilter), [investments, projectFilter]);
  const receivedByInvestment = useMemo(() => transactions.reduce<Record<string, number>>((totals, transaction) => {
    if (transaction.currency === 'KES') totals[transaction.investment_id] = (totals[transaction.investment_id] ?? 0) + Number(transaction.amount || 0);
    return totals;
  }, {}), [transactions]);
  const totalCommittedKes = useMemo(() => projectInvestments.filter((investment) => investment.currency === 'KES').reduce((amount, investment) => amount + Number(investment.amount_committed ?? 0), 0), [projectInvestments]);
  const totalInterestedKes = useMemo(() => projectInvestments.filter((investment) => investment.currency === 'KES').reduce((amount, investment) => amount + Number(investment.amount_interested ?? 0), 0), [projectInvestments]);
  const activeCommitmentCount = useMemo(() => projectInvestments.filter((investment) => ['SOFT_COMMIT', 'COMMITTED'].includes(investment.status)).length, [projectInvestments]);
  const commitmentCoverage = projectInvestments.length ? Math.round(activeCommitmentCount / projectInvestments.length * 100) : 0;
  const projectTransactions = useMemo(() => transactions.filter((transaction) => projectFilter === 'ALL' || transaction.project_id === projectFilter || investments.find((investment) => investment.id === transaction.investment_id)?.project_id === projectFilter), [transactions, investments, projectFilter]);
  const totalReceivedKes = useMemo(() => projectTransactions.filter((transaction) => transaction.currency === 'KES').reduce((amount, transaction) => amount + Number(transaction.amount || 0), 0), [projectTransactions]);
  const pendingInvestments = useMemo(() => projectInvestments.filter((investment) => ['SOFT_COMMIT', 'COMMITTED'].includes(investment.status) && investment.currency === 'KES' && Number(investment.amount_committed ?? 0) > (receivedByInvestment[investment.id] ?? 0)), [projectInvestments, receivedByInvestment]);
  const pendingCommitmentsKes = useMemo(() => Math.max(0, totalCommittedKes - totalReceivedKes), [totalCommittedKes, totalReceivedKes]);
  const filtered = useMemo(() => projectInvestments.filter((investment) => {
    if (statusFilter !== 'ALL' && investment.status !== statusFilter) return false;
    if (tableProjectFilter !== 'ALL' && investment.project_id !== tableProjectFilter) return false;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    const projectName = projectNames.get(investment.project_id ?? '') ?? 'General interest';
    return [investment.investor_name, investment.investor_email, investment.investor_phone, projectName, investment.reference_code, investment.investment_range, investment.investment_structure].filter(Boolean).join(' ').toLowerCase().includes(query);
  }), [projectInvestments, statusFilter, tableProjectFilter, searchQuery, projectNames]);
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const activePage = Math.min(currentPage, pageCount);
  const pageInvestments = filtered.slice((activePage - 1) * pageSize, activePage * pageSize);

  const updateCommitment = async (investment: Investment, rawAmount: string) => {
    const amount_committed = rawAmount.trim() ? parseMoney(rawAmount) : null;
    if (amount_committed !== null && (!Number.isFinite(amount_committed) || amount_committed < 0)) {
      notifyAdmin('Committed amount must be zero or greater.', 'error');
      return;
    }
    const { error } = await supabase.from('investments').update({ amount_committed }).eq('id', investment.id);
    if (error) notifyAdmin(`Could not save committed amount: ${error.message}`, 'error');
    else {
      setInvestments((items) => items.map((item) => item.id === investment.id ? { ...item, amount_committed } : item));
      notifyAdmin('Committed amount saved.');
    }
  };

  if (loading) return <Spinner />;

  return (
    <div className="space-y-4 text-[#17324c]">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[#dce7f0] pb-4">
        <div><p className="eyebrow text-[#087f88]">Investment</p><h2 className="mt-1 text-xl font-semibold">Investor Management</h2><p className="mt-1 text-xs text-slate-500">Track investor details, commitments and payments{projectFilter !== 'ALL' ? ` for ${projectNames.get(projectFilter) ?? 'this project'}` : ' across your projects'}.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="investment-project-filter">Filter by project</label>
          <select id="investment-project-filter" value={projectFilter} onChange={(event) => { setProjectFilter(event.target.value); setCurrentPage(1); }} className="admin-input h-10 min-w-52 bg-white text-xs"><option value="ALL">All Projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          <button type="button" onClick={() => setShowForm(true)} className="admin-add-btn flex h-10 items-center justify-center gap-2 px-4"><Plus size={15} /> Add Investor</button>
          {canManageFinancials && <button type="button" onClick={() => setShowTransactionForm(true)} className="admin-add-btn flex h-10 items-center justify-center gap-2 px-4"><Plus size={15} /> Record Transaction</button>}
        </div>
      </header>

      <section aria-label="Investment summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <article className="flex min-h-24 items-center gap-3 border border-sky-100 bg-sky-50/70 p-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-sky-100 text-sky-700"><Users size={18} /></span><div><p className="text-[9px] font-bold uppercase tracking-[.12em] text-sky-700">Total investors</p><p className="mt-1 text-xl font-semibold">{projectInvestments.length}</p><p className="mt-1 text-[10px] text-slate-500">{projectInvestments.filter((investment) => Boolean(investment.investor_user_id)).length} linked portal accounts</p></div></article>
        <article className="flex min-h-24 items-center gap-3 border border-emerald-100 bg-emerald-50/70 p-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"><DollarSign size={17} /></span><div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-emerald-700">Total committed</p><p className="mt-1 truncate text-lg font-semibold">{fmtKes(totalCommittedKes)}</p><p className="mt-1 text-[9px] text-slate-500">{activeCommitmentCount} active commitments · {commitmentCoverage}%</p><div className="mt-1 h-1 overflow-hidden bg-emerald-100"><span className="block h-full bg-emerald-500" style={{ width: `${commitmentCoverage}%` }} /></div></div></article>
        <article className="flex min-h-24 items-center gap-3 border border-blue-100 bg-blue-50/70 p-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700"><CreditCard size={17} /></span><div className="min-w-0 flex-1"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-blue-700">Total received</p><p className="mt-1 truncate text-lg font-semibold">{canManageFinancials ? fmtKes(totalReceivedKes) : 'Restricted'}</p><p className="mt-1 text-[9px] text-slate-500">{canManageFinancials ? `${totalCommittedKes ? Math.round(totalReceivedKes / totalCommittedKes * 100) : 0}% received` : 'Finance access required'}</p>{canManageFinancials && <div className="mt-1 h-1 overflow-hidden bg-blue-100"><span className="block h-full bg-blue-500" style={{ width: `${Math.min(100, totalCommittedKes ? totalReceivedKes / totalCommittedKes * 100 : 0)}%` }} /></div>}</div></article>
        <article className="flex min-h-24 items-center gap-3 border border-amber-100 bg-amber-50/70 p-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-700"><Clock3 size={17} /></span><div className="min-w-0"><p className="text-[9px] font-bold uppercase tracking-[.12em] text-amber-700">Pending commitments</p><p className="mt-1 truncate text-lg font-semibold">{canManageFinancials ? fmtKes(pendingCommitmentsKes) : 'Restricted'}</p><p className="mt-1 text-[9px] text-slate-500">{canManageFinancials ? `${pendingInvestments.length} investors` : 'Finance access required'}</p></div></article>
      </section>

      <section aria-label="Investor records" className="overflow-hidden border border-[#dce7f0] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-[#e5edf4] p-3">
          <label className="relative min-w-56 flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={searchQuery} onChange={(event) => { setSearchQuery(event.target.value); setCurrentPage(1); }} aria-label="Search investors" placeholder="Search investor, email or project..." className="admin-input h-9 w-full pl-9 text-xs" /></label>
          <select aria-label="Filter by investor status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setCurrentPage(1); }} className="admin-input h-9 min-w-32 bg-white text-xs"><option value="ALL">All Statuses</option>{INVESTMENT_STATUSES.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select>
          <select aria-label="Filter investors by project" value={tableProjectFilter} onChange={(event) => { setTableProjectFilter(event.target.value); setCurrentPage(1); }} className="admin-input h-9 min-w-32 bg-white text-xs"><option value="ALL">All Projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
          <div role="group" aria-label="Investor display mode" className="ml-auto flex items-center border border-[#dce7f0] p-0.5">
            <button type="button" aria-pressed={viewMode === 'cards'} onClick={() => setViewMode('cards')} className={`inline-flex h-8 items-center gap-1.5 px-2 text-[10px] font-semibold ${viewMode === 'cards' ? 'bg-[#eaf4fb] text-[#176c9b]' : 'text-slate-500'}`}><LayoutDashboard size={13} /> Card View</button>
            <button type="button" aria-pressed={viewMode === 'table'} onClick={() => setViewMode('table')} className={`inline-flex h-8 items-center gap-1.5 px-2 text-[10px] font-semibold ${viewMode === 'table' ? 'bg-[#087f88] text-white' : 'text-slate-500'}`}><ClipboardList size={13} /> Table View</button>
          </div>
          <button type="button" onClick={() => void downloadReportPdf('nbg-investment-register.pdf', ['Audit Reference', 'Investor', 'Email', 'Phone', 'Project', 'Range', 'Structure', 'Amount Interested', 'Amount Committed', 'Status', 'Date'], filtered.map((investment) => [investment.reference_code, investment.investor_name, investment.investor_email, investment.investor_phone, projectNames.get(investment.project_id ?? ''), investment.investment_range, investment.investment_structure, investment.amount_interested, investment.amount_committed, investment.status, investment.created_at]), 'Investment Register')} className="btn-secondary inline-flex h-9 items-center gap-1.5 !px-3 !py-1.5 text-[10px]"><Download size={13} /> Export PDF</button>
        </div>

        {viewMode === 'cards' && <div className="grid gap-3 bg-[#f7fafd] p-3 sm:grid-cols-2 xl:grid-cols-3">{pageInvestments.map((investment) => <article key={investment.id} className="border border-[#e1eaf1] bg-white p-3"><div className="flex items-start justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-sky-100 text-[10px] font-bold text-sky-700">{investment.investor_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><div className="min-w-0"><p className="truncate text-xs font-semibold">{investment.investor_name}</p><p className="truncate font-mono text-[9px] text-slate-400">{investment.reference_code || 'Reference pending'}</p></div></div><span className={`shrink-0 px-2 py-1 text-[9px] font-semibold ${INVESTMENT_STATUS_COLORS[investment.status] || 'bg-slate-100 text-slate-700'}`}>{investment.status.replace(/_/g, ' ')}</span></div><div className="mt-3 space-y-1.5 text-[10px] text-slate-600"><p className="truncate">{investment.investor_email || investment.investor_phone || 'Contact not provided'}</p><p className="truncate font-medium text-[#31546b]">{projectNames.get(investment.project_id ?? '') || 'General interest'}</p><p>{[investment.investment_range, investment.investment_structure].filter(Boolean).join(' · ') || 'Terms to discuss'}</p></div><div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#edf2f6] pt-3"><div><p className="text-[8px] uppercase tracking-wide text-slate-400">Interested</p><p className="mt-1 text-xs font-semibold">{formatAccountingCurrency(Number(investment.amount_interested ?? 0), investment.currency)}</p></div><div><p className="text-[8px] uppercase tracking-wide text-slate-400">Committed</p>{canManageFinancials ? <input aria-label={`Committed amount for ${investment.investor_name}`} type="number" min="0" step="0.01" value={commitmentDrafts[investment.id] ?? investment.amount_committed?.toString() ?? ''} onChange={(event) => setCommitmentDrafts((current) => ({ ...current, [investment.id]: event.target.value }))} onBlur={(event) => { void updateCommitment(investment, event.target.value); }} className="admin-input mt-1 h-8 w-full text-xs" placeholder="Not recorded" /> : <p className="mt-1 text-xs font-semibold">{formatAccountingCurrency(Number(investment.amount_committed ?? 0), investment.currency)}</p>}</div></div><div className="mt-3 flex items-center justify-between gap-2 border-t border-[#edf2f6] pt-2"><span className="text-[9px] text-slate-400">{fmt(investment.created_at)}</span><div className="flex items-center gap-2">{canManageFinancials && <InvestmentAccountAssignment investment={investment} onLinked={(userId) => { setInvestments((items) => items.map((item) => item.id === investment.id ? { ...item, investor_user_id: userId } : item)); }} />}<button type="button" onClick={onReview} aria-label={`Open review queue for ${investment.investor_name}`} title="Open review queue" className="grid size-8 shrink-0 place-items-center border border-[#dce7f0] text-[#087f88]"><MoreHorizontal size={16} /></button></div></div></article>)}{pageInvestments.length === 0 && <p className="col-span-full border border-dashed border-[#dce7f0] bg-white p-8 text-center text-xs text-slate-500">No investors match these filters.</p>}</div>}

        {viewMode === 'table' && <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] table-fixed text-left text-sm leading-tight">
          <colgroup>{canManageFinancials ? <><col className="w-[13%]" /><col className="w-[14%]" /><col className="w-[16%]" /><col className="w-[12%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[6%]" /><col className="w-[10%]" /><col className="w-[7%]" /></> : <><col className="w-[18%]" /><col className="w-[18%]" /><col className="w-[25%]" /><col className="w-[15%]" /><col className="w-[8%]" /><col className="w-[10%]" /><col className="w-[6%]" /></>}</colgroup>
          <thead className="border-b border-[#e5edf4] bg-[#f7fafd] text-[9px] uppercase tracking-[.08em] text-[#7b91a6]">
            <tr>{['Investor', 'Contact', 'Project & interest', ...(canManageFinancials ? ['Portal account'] : []), 'Amount interested', ...(canManageFinancials ? ['Committed amount'] : []), 'Currency', 'Status', 'Actions'].map((heading) => <th key={heading} className="px-3 py-2.5 font-semibold">{heading}</th>)}</tr>
          </thead>
          <tbody>
            {pageInvestments.map((investment) => (
              <tr key={investment.id} className="border-b border-[#edf2f6] last:border-0 hover:bg-[#f7fafd]">
                <td className="px-2 py-2"><div className="flex min-w-0 items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-sky-100 text-[9px] font-bold text-sky-700">{investment.investor_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><div className="min-w-0"><strong className="block truncate text-[10px] font-semibold text-[#31546b]" title={investment.investor_name}>{investment.investor_name}</strong><span className="mt-0.5 block truncate font-mono text-[8px] text-slate-400" title={investment.reference_code || 'Reference pending'}>{investment.reference_code || 'Reference pending'}</span></div></div></td>
                <td className="px-2 py-2 text-[9px] text-slate-500"><span className="flex min-w-0 items-center gap-1"><Mail size={9} className="shrink-0 text-[#507b98]" /><span className="truncate" title={investment.investor_email || ''}>{investment.investor_email || '—'}</span></span><span className="mt-1 flex min-w-0 items-center gap-1"><Phone size={9} className="shrink-0 text-[#507b98]" /><span className="truncate">{investment.investor_phone || '—'}</span></span></td>
                <td className="px-2 py-2.5 text-[9px]"><p className="truncate font-medium text-[#31546b]" title={projectNames.get(investment.project_id ?? '') ?? 'General interest'}>{projectNames.get(investment.project_id ?? '') ?? 'General interest'}</p><p className="mt-1 truncate text-slate-500" title={[investment.investment_range, investment.investment_structure].filter(Boolean).join(' · ')}>{[investment.investment_range, investment.investment_structure].filter(Boolean).join(' · ') || 'Terms to discuss'}</p></td>
                {canManageFinancials && <td className="px-2 py-2.5"><InvestmentAccountAssignment investment={investment} onLinked={(userId) => { setInvestments((items) => items.map((item) => item.id === investment.id ? { ...item, investor_user_id: userId } : item)); }} /></td>}
                <td className="whitespace-nowrap px-2 py-2 text-[9px] font-medium">{investment.amount_interested == null ? '—' : Number(investment.amount_interested).toLocaleString('en-KE')}</td>
                {canManageFinancials && <td className="px-2 py-2">{editingCommitmentId === investment.id ? <input autoFocus aria-label={`Committed amount for ${investment.investor_name}`} type="number" min="0" step="0.01" value={commitmentDrafts[investment.id] ?? investment.amount_committed?.toString() ?? ''} onChange={(event) => setCommitmentDrafts((current) => ({ ...current, [investment.id]: event.target.value }))} onBlur={(event) => { void updateCommitment(investment, event.target.value); setEditingCommitmentId(null); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} className="admin-input h-7 w-full max-w-28 text-[9px]" placeholder="Not recorded" /> : <button type="button" aria-label={`Edit committed amount for ${investment.investor_name}`} onClick={() => { setCommitmentDrafts((current) => ({ ...current, [investment.id]: current[investment.id] ?? investment.amount_committed?.toString() ?? '' })); setEditingCommitmentId(investment.id); }} className="whitespace-nowrap text-left text-[9px] font-medium text-[#31546b] hover:text-[#087f88]">{investment.amount_committed == null ? 'Not recorded' : Number(investment.amount_committed).toLocaleString('en-KE')}</button>}</td>}
                <td className="px-2 py-2.5 text-[9px] text-slate-500">{investment.currency}</td>
                <td className="px-2 py-2.5"><span className={`inline-flex whitespace-nowrap px-2 py-1 text-[8px] font-semibold ${INVESTMENT_STATUS_COLORS[investment.status] || 'bg-slate-100 text-slate-700'}`}>{investment.status.replace(/_/g, ' ')}</span></td>
                <td className="relative px-2 py-2"><button type="button" onClick={() => setOpenInvestmentActions((current) => current === investment.id ? null : investment.id)} aria-label={`Actions for ${investment.investor_name}`} aria-expanded={openInvestmentActions === investment.id} title="Investor actions" className="grid size-7 place-items-center text-[#507b98] hover:bg-sky-50"><MoreVertical size={15} /></button>{openInvestmentActions === investment.id && <div className="absolute right-2 top-9 z-20 w-40 border border-[#dce7f0] bg-white py-1 shadow-lg"><button type="button" onClick={() => { setOpenInvestmentActions(null); onReview(); }} className="block w-full px-3 py-2 text-left text-[10px] text-slate-600 hover:bg-sky-50">Open review queue</button>{canManageFinancials && <button type="button" onClick={() => { setCommitmentDrafts((current) => ({ ...current, [investment.id]: current[investment.id] ?? investment.amount_committed?.toString() ?? '' })); setEditingCommitmentId(investment.id); setOpenInvestmentActions(null); }} className="block w-full px-3 py-2 text-left text-[10px] text-slate-600 hover:bg-sky-50">Edit commitment</button>}</div>}
                </td>
              </tr>
            ))}
            {pageInvestments.length === 0 && <EmptyRow cols={canManageFinancials ? 9 : 7} text="No investors match these filters." />}
          </tbody>
        </table>
        </div>}

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e5edf4] px-3 py-2.5 text-[9px] text-slate-500"><span>Showing {filtered.length ? (activePage - 1) * pageSize + 1 : 0}–{Math.min(activePage * pageSize, filtered.length)} of {filtered.length} investors</span><nav aria-label="Investor pages" className="flex items-center gap-1"><button type="button" aria-label="Previous page" disabled={activePage <= 1} onClick={() => setCurrentPage(activePage - 1)} className="grid size-7 place-items-center border border-[#dce7f0] disabled:opacity-40"><ChevronLeft size={14} /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button key={pageNumber} type="button" aria-current={activePage === pageNumber ? 'page' : undefined} onClick={() => setCurrentPage(pageNumber)} className={`grid size-7 place-items-center border text-[9px] ${activePage === pageNumber ? 'border-[#087f88] bg-[#087f88] text-white' : 'border-[#dce7f0] text-slate-600'}`}>{pageNumber}</button>)}<button type="button" aria-label="Next page" disabled={activePage >= pageCount} onClick={() => setCurrentPage(activePage + 1)} className="grid size-7 place-items-center border border-[#dce7f0] disabled:opacity-40"><ChevronRight size={14} /></button></nav></div>
      </section>

      {canManageFinancials && <section className="mt-10"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-[#087f88]">Investment ledger</p><h3 className="mt-2 font-serif text-2xl text-[#123b4b]">Recorded transactions</h3></div><div className="flex items-center gap-3"><span className="text-xs text-slate-500">{transactions.length} record{transactions.length === 1 ? '' : 's'}</span><button type="button" disabled={!transactions.length} onClick={() => void downloadReportPdf('nbg-investment-transactions.pdf', ['Date', 'Investor', 'Project', 'Type', 'Period start', 'Months covered', 'Full settlement', 'Amount', 'Audit reference', 'External reference'], transactions.map((transaction) => [transaction.transaction_date, investments.find((item) => item.id === transaction.investment_id)?.investor_name, projects.find((item) => item.id === transaction.project_id)?.name, transaction.transaction_type, transaction.period_start, transaction.months_covered, transaction.covers_full_balance ? 'Yes' : 'No', `${transaction.currency} ${Number(transaction.amount).toLocaleString()}`, transaction.transaction_ref, transaction.reference]), 'Investment Transaction Ledger')} className="btn-secondary !px-3 !py-2 disabled:opacity-50"><Download size={14} /> Export PDF</button></div></div><div className="mt-4 overflow-x-auto border border-[#c9c5bd] bg-white"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-[#f0ede6] text-[10px] uppercase text-slate-400"><tr>{['Date', 'Investor', 'Project', 'Type', 'Contribution period', 'Amount', 'Audit reference', 'External reference'].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{transactions.map((transaction) => { const investment = investments.find((item) => item.id === transaction.investment_id); const lastCovered = transaction.period_start && transaction.months_covered ? new Date(new Date(`${transaction.period_start}T00:00:00`).setMonth(new Date(`${transaction.period_start}T00:00:00`).getMonth() + transaction.months_covered - 1)).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' }) : ''; return <tr key={transaction.id} className="border-t border-[#e6e2da]"><td className="px-4 py-3 text-xs text-slate-500">{transaction.transaction_date}</td><td className="px-4 py-3">{investment?.investor_name ?? 'Investor record removed'}<span className="mt-1 block font-mono text-[10px] text-slate-400">{investment?.reference_code || '—'}</span></td><td className="px-4 py-3 text-xs">{projects.find((item) => item.id === transaction.project_id)?.name ?? '—'}</td><td className="px-4 py-3 text-xs">{transaction.transaction_type}{transaction.covers_full_balance ? ' · FULL SETTLEMENT' : ''}</td><td className="px-4 py-3 text-xs">{transaction.period_start ? `${new Date(`${transaction.period_start}T00:00:00`).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}${transaction.months_covered && transaction.months_covered > 1 ? ` – ${lastCovered} (${transaction.months_covered} months)` : ''}` : '—'}</td><td className="px-4 py-3">{formatAccountingCurrency(Number(transaction.amount), transaction.currency)}</td><td className="px-4 py-3 font-mono text-xs text-[#087f88]">{transaction.transaction_ref}</td><td className="px-4 py-3 text-xs">{transaction.reference || '—'}</td></tr>; })}{transactions.length === 0 && <EmptyRow cols={8} text="No investment transactions recorded." />}</tbody></table></div></section>}

      {showForm && (
        <Modal title="Add Investor" onClose={() => setShowForm(false)}>
          <InvestmentForm projects={projects} onDone={(i) => { setInvestments((p) => [i, ...p]); setShowForm(false); }} />
        </Modal>
      )}
      {showTransactionForm && <Modal title="Record Investment Transaction" onClose={() => setShowTransactionForm(false)}><InvestmentTransactionForm investments={investments} projects={projects} transactions={transactions} onDone={(transaction) => { setTransactions((current) => [transaction, ...current]); setShowTransactionForm(false); }} /></Modal>}
    </div>
  );
}

function InvestmentAccountAssignment({ investment, onLinked }: { investment: Investment; onLinked: (userId: string) => void }) {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<InvestmentAccount[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const search = async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase.rpc('search_client_profiles', { p_query: query.trim() });
    if (queryError) setError(queryError.message);
    else setMatches((data ?? []) as InvestmentAccount[]);
    setLoading(false);
  };
  const linkAccount = async (account: InvestmentAccount) => {
    setLoading(true);
    setError('');
    const { error: updateError } = await supabase.from('investments').update({ investor_user_id: account.user_id }).eq('id', investment.id);
    if (updateError) setError(updateError.message);
    else { onLinked(account.user_id); setMatches([]); setQuery(''); setSearchOpen(false); }
    setLoading(false);
  };
  return <div className="min-w-0">
    <div className="flex items-center justify-between gap-1">
      <button type="button" aria-label={`${investment.investor_user_id ? 'Change' : 'Link'} client account for ${investment.investor_name}`} title={investment.investor_user_id ? 'Change linked account' : 'Link client account'} onClick={() => { setSearchOpen((open) => !open); setError(''); setMatches([]); }} className="inline-flex min-w-0 items-center gap-1.5 text-[9px] text-slate-500 hover:text-[#087f88]"><span className={`size-1.5 shrink-0 rounded-full ${investment.investor_user_id ? 'bg-emerald-500' : 'bg-slate-300'}`} /><span className="truncate">{investment.investor_user_id ? 'Linked' : 'Not linked'}</span>{investment.investor_user_id ? <ExternalLink size={11} className="shrink-0 text-[#087f88]" /> : <Search size={11} className="shrink-0 text-[#087f88]" />}</button>
    </div>
    {searchOpen && <div className="mt-1 flex gap-1"><input aria-label={`Search client account for ${investment.investor_name}`} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }} className="admin-input h-7 min-w-0 flex-1 text-[9px]" placeholder="Find account" /><button type="button" disabled={loading || query.trim().length < 2} onClick={() => void search()} title="Search client accounts" className="grid size-7 shrink-0 place-items-center border border-[#dce7f0] text-[#087f88] disabled:opacity-50"><Search size={12} /></button></div>}
    {matches.map((account) => <button key={account.user_id} type="button" disabled={loading} onClick={() => void linkAccount(account)} className="mt-1 block w-full border border-[#dce7f0] bg-white p-1.5 text-left text-[9px]"><span className="block truncate font-medium">{account.full_name || 'NBG client'}</span><span className="block truncate text-slate-500">{account.email || account.phone || account.user_id}</span></button>)}
    {error && <p className="mt-1 text-[9px] text-[#a55445]">{error}</p>}
  </div>;
}

function InvestmentTransactionForm({ investments, projects, transactions, onDone }: { investments: Investment[]; projects: Project[]; transactions: InvestmentTransaction[]; onDone: (transaction: InvestmentTransaction) => void }) {
  const today = kenyaCalendarDate();
  const currentMonth = `${today.slice(0, 7)}-01`;
  const nextContributionMonth = (investmentId: string) => {
    const last = transactions.filter((transaction) => transaction.investment_id === investmentId && ['COMMITMENT', 'DEPOSIT'].includes(transaction.transaction_type) && transaction.period_start)
      .sort((left, right) => String(right.period_start).localeCompare(String(left.period_start)))[0];
    if (!last?.period_start) return currentMonth;
    const next = new Date(`${last.period_start}T00:00:00`);
    next.setMonth(next.getMonth() + Math.max(1, Number(last.months_covered) || 1));
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  };
  const [form, setForm] = useState({ investment_id: investments[0]?.id ?? '', transaction_type: 'COMMITMENT', amount: '', currency: 'KES', transaction_date: today, period_start: nextContributionMonth(investments[0]?.id ?? ''), months_covered: '1', covers_full_balance: false, reference: '', notes: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedInvestment = investments.find((investment) => investment.id === form.investment_id);
  const previousContributions = transactions.filter((transaction) => transaction.investment_id === form.investment_id && ['COMMITMENT', 'DEPOSIT'].includes(transaction.transaction_type));
  const outstandingCommitment = Math.max(0, Number(selectedInvestment?.amount_committed || 0) - previousContributions.reduce((sum, transaction) => sum + Number(transaction.amount), 0));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error: insertError } = await supabase.from('investment_transactions').insert({
      investment_id: form.investment_id,
      project_id: selectedInvestment?.project_id ?? null,
      transaction_type: form.transaction_type,
      amount: parseMoney(form.amount),
      currency: form.currency,
      transaction_date: form.transaction_date,
      period_start: ['COMMITMENT', 'DEPOSIT'].includes(form.transaction_type) ? form.period_start : null,
      months_covered: ['COMMITMENT', 'DEPOSIT'].includes(form.transaction_type) ? Number(form.months_covered) : 1,
      covers_full_balance: ['COMMITMENT', 'DEPOSIT'].includes(form.transaction_type) && form.covers_full_balance,
      reference: form.reference.trim() || null,
      notes: form.notes.trim() || null,
      recorded_by: user?.id ?? null,
    }).select().single();
    setSaving(false);
    if (insertError || !data) { setError(insertError?.message || 'Transaction could not be saved.'); return; }
    onDone(data as InvestmentTransaction);
  };

  return <form onSubmit={submit} className="grid gap-4">
    <p className="border-l-2 border-[#19c6c9] pl-3 text-xs leading-5 text-slate-500">The transaction audit reference is generated and locked automatically when this record is saved. The external reference below is for a bank, transfer, or payment receipt number.</p>
    <p className="border-l-2 border-[#d1a549] pl-3 text-xs leading-5 text-slate-600">Future-month contributions and multi-month prepayments require full settlement of the exact outstanding commitment. Earlier contribution months must be recorded first.</p>
    <label className="grid gap-1.5 text-xs text-slate-500">Investor<select required value={form.investment_id} onChange={(event) => setForm({ ...form, investment_id: event.target.value, amount: '', period_start: nextContributionMonth(event.target.value), covers_full_balance: false })} className="admin-input"><option value="">Select an investor record</option>{investments.map((investment) => <option key={investment.id} value={investment.id}>{investment.investor_name} · {projects.find((project) => project.id === investment.project_id)?.name ?? 'General interest'}</option>)}</select></label>
    <div className="grid gap-4 sm:grid-cols-3"><label className="grid gap-1.5 text-xs text-slate-500">Transaction type<select value={form.transaction_type} onChange={(event) => setForm({ ...form, transaction_type: event.target.value })} className="admin-input">{['COMMITMENT', 'DEPOSIT', 'DISTRIBUTION', 'REPAYMENT', 'FEE', 'REFUND', 'OTHER'].map((type) => <option key={type}>{type}</option>)}</select></label><label className="grid gap-1.5 text-xs text-slate-500">Amount<input required type="number" min="0.01" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} className="admin-input" /></label><label className="grid gap-1.5 text-xs text-slate-500">Currency<select value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} className="admin-input"><option>KES</option><option>USD</option><option>GBP</option><option>EUR</option></select></label></div>
    <div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5 text-xs text-slate-500">Transaction date<input required type="date" max={today} value={form.transaction_date} onChange={(event) => setForm({ ...form, transaction_date: event.target.value })} className="admin-input" /></label><AF label="Bank / external reference" value={form.reference} onChange={(value) => setForm({ ...form, reference: value })} /></div>
    {['COMMITMENT', 'DEPOSIT'].includes(form.transaction_type) && <section className="grid gap-3 border border-[#a9d9d8] bg-[#eefbf9] p-4 sm:grid-cols-[1fr_180px]"><label className="grid gap-1.5 text-xs text-slate-600">Contribution month<input required type="month" max={Number(form.months_covered) > 1 || form.covers_full_balance ? undefined : currentMonth.slice(0, 7)} min={nextContributionMonth(form.investment_id).slice(0, 7)} value={form.period_start.slice(0, 7)} onChange={(event) => setForm({ ...form, period_start: `${event.target.value}-01` })} className="admin-input" /><span className="text-[10px] text-slate-500">Next sequential month: {new Date(`${nextContributionMonth(form.investment_id)}T00:00:00`).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' })}. A single future month is blocked; multiple months may be prepaid together.</span></label><label className="grid gap-1.5 text-xs text-slate-600">Months covered<input required type="number" min="1" max="120" step="1" value={form.months_covered} onChange={(event) => setForm({ ...form, months_covered: event.target.value })} className="admin-input" /><span className="text-[10px] text-slate-500">Consecutive monthly periods covered by this payment.</span></label><label className="flex items-start gap-2 text-xs text-slate-600 sm:col-span-2"><input type="checkbox" checked={form.covers_full_balance} disabled={outstandingCommitment <= 0} onChange={(event) => setForm({ ...form, covers_full_balance: event.target.checked, ...(event.target.checked ? { amount: outstandingCommitment.toFixed(2) } : {}) })} /><span>Settle full outstanding commitment {selectedInvestment?.amount_committed != null ? `(${fmtKes(outstandingCommitment)})` : '(set a committed amount first)'}</span></label></section>}
    <label className="grid gap-1.5 text-xs text-slate-500">Notes<textarea rows={3} maxLength={2000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="admin-input resize-y" /></label>
    {error && <p role="alert" className="text-sm text-[#a55445]">{error}</p>}
    <button disabled={saving || !investments.length} className="btn-primary disabled:opacity-60">{saving ? 'Saving...' : 'Save transaction'} <ArrowRight size={15} /></button>
  </form>;
}

function InvestmentForm({ projects, onDone }: { projects: Project[]; onDone: (i: Investment) => void }) {
  const [f, setF] = useState({ investor_name: '', investor_email: '', investor_phone: '', project_id: '', investment_range: '', investment_structure: '', investor_message: '', amount_interested: '', currency: 'KES', status: 'INQUIRY', notes: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    const { data, error } = await supabase.from('investments').insert({
      investor_name: f.investor_name, investor_email: f.investor_email || null,
      investor_phone: f.investor_phone || null, project_id: f.project_id || null,
      investment_range: f.investment_range || null, investment_structure: f.investment_structure || null,
      investor_message: f.investor_message || null,
      amount_interested: f.amount_interested ? parseMoney(f.amount_interested) : null,
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
        <AF label="Amount Interested (KSh)" value={f.amount_interested} onChange={(v) => setF({ ...f, amount_interested: v })} currency />
        <label className="block">
          <span className="eyebrow mb-1.5 block text-slate-400">Currency</span>
          <select value={f.currency} onChange={(e) => setF({ ...f, currency: e.target.value })} className="admin-input w-full">
            {['KES', 'USD', 'GBP', 'EUR'].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <AF label="Indicative investment range" value={f.investment_range} onChange={(v) => setF({ ...f, investment_range: v })} />
        <AF label="Preferred structure" value={f.investment_structure} onChange={(v) => setF({ ...f, investment_structure: v })} />
      </div>
      <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Enquiry notes</span><textarea value={f.investor_message} onChange={(e) => setF({ ...f, investor_message: e.target.value })} rows={3} maxLength={2000} className="admin-input w-full resize-y" /></label>
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
  const [editing, setEditing] = useState<Realtor | null>(null);
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
                  <div className="flex gap-3"><button onClick={() => setSelected(r)} className="text-xs text-[#20afd1] hover:underline">View</button><button onClick={() => setEditing(r)} className="text-xs text-[#247b85] hover:underline">Edit</button></div>
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
      {editing && <Modal title={`Edit ${editing.name}`} onClose={() => setEditing(null)}><RealtorForm initial={editing} onDone={(r) => { setRealtors((p) => p.map((item) => item.id === r.id ? r : item)); setEditing(null); }} /></Modal>}
    </div>
  );
}

function RealtorForm({ initial, onDone }: { initial?: Realtor; onDone: (r: Realtor) => void }) {
  const [f, setF] = useState({ name: initial?.name ?? '', email: initial?.email ?? '', phone: initial?.phone ?? '', id_number: initial?.id_number ?? '', status: initial?.status ?? 'PENDING', notes: initial?.notes ?? '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    const values = { name: f.name, email: f.email, phone: f.phone || null, id_number: f.id_number || null, commission_rate: 3, status: f.status, notes: f.notes || null };
    const response = initial
      ? await supabase.from('realtors').update(values).eq('id', initial.id).select().single()
      : await supabase.from('realtors').insert(values).select().single();
    const { data, error } = response;
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
        <div className="rounded border border-[#c9c5bd] bg-[#f0ede6] px-3 py-2"><span className="eyebrow block text-slate-400">Commission rate</span><p className="mt-1 text-sm font-semibold text-[#17232b]">3% fixed</p><p className="mt-1 text-[10px] text-slate-500">Applied automatically to linked sales</p></div>
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
      <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Saving…' : initial ? 'Save Realtor Changes' : 'Add Realtor'} <ArrowRight size={15} /></button>
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
  const [f, setF] = useState({ realtor_id: '', sale_id: '', amount: '', rate: '3', notes: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedRealtor = realtors.find((r) => r.id === f.realtor_id);
  const selectedSale = sales.find((s) => s.id === f.sale_id);

  useEffect(() => {
    if (selectedSale?.sale_price) setF((prev) => ({ ...prev, rate: '3', amount: String((selectedSale.sale_price! * 3) / 100) }));
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
      amount: parseMoney(f.amount), rate: parseFloat(f.rate), notes: f.notes || null,
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
        <div><span className="eyebrow mb-1.5 block text-slate-400">Commission Rate</span><div className="rounded border border-[#c9c5bd] bg-[#f0ede6] px-3 py-2 text-sm font-semibold text-[#17232b]">3% fixed</div></div>
        <div>
          <AF label="Commission Amount (KSh)" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} required currency />
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

type AdminDocument = { id: string; user_id: string | null; title: string; category: string; file_url: string; created_at: string; is_global?: boolean; recipient_name?: string | null; recipient_email?: string | null; source_record_id?: string | null; document_ref?: string | null; verification_code?: string | null; content_hash?: string | null; content_summary?: string | null; source_type?: string; vendor_name?: string | null; purchase_order_number?: string | null; tax_invoice_number?: string | null; payment_terms?: string | null; bank_name?: string | null; bank_account_reference?: string | null; amount?: number | null; currency?: string | null; due_date?: string | null };
type DocumentClient = { id: string; full_name: string | null; phone: string | null; email: string | null; identity_document_type: string | null; identity_document_number: string | null; residential_address: string | null; preferred_location: string | null };
type ClientKycRequest = { id: string; user_id: string; status: 'PENDING' | 'COMPLETED'; requested_fields: string[]; requested_at: string; completed_at: string | null };

function ClientKycStatus({ client, missingFields }: { client: DocumentClient; missingFields: string[] }) {
  const [request, setRequest] = useState<ClientKycRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const refreshStatus = useCallback(async () => {
    setLoading(true);
    const { data, error: requestError } = await supabase.from('client_kyc_requests').select('*').eq('user_id', client.id).order('requested_at', { ascending: false }).limit(1).maybeSingle();
    if (requestError) setError(requestError.message);
    else {
      const nextRequest = (data ?? null) as ClientKycRequest | null;
      if (request?.status === 'PENDING' && nextRequest?.status === 'COMPLETED') notifyAdmin(`${client.full_name || client.email || 'Client'} completed the requested KYC details.`);
      setRequest(nextRequest);
      setError('');
    }
    setLoading(false);
  }, [client.email, client.full_name, client.id, request?.status]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void supabase.from('client_kyc_requests').select('*').eq('user_id', client.id).order('requested_at', { ascending: false }).limit(1).maybeSingle().then(({ data, error: requestError }) => {
      if (!active) return;
      setRequest((data ?? null) as ClientKycRequest | null);
      setError(requestError?.message || '');
      setLoading(false);
    });
    return () => { active = false; };
  }, [client.id]);
  useEffect(() => {
    if (request?.status !== 'PENDING') return;
    const timer = window.setInterval(() => void refreshStatus(), 15000);
    return () => window.clearInterval(timer);
  }, [refreshStatus, request?.status]);

  const sendRequest = async () => {
    setSending(true);
    setError('');
    const { data, error: requestError } = await supabase.rpc('request_client_kyc_update', { p_user_id: client.id });
    if (requestError || !data) {
      const missingFunction = requestError?.code === 'PGRST202' || /could not find the function.*request_client_kyc_update/i.test(requestError?.message || '');
      setError(missingFunction ? 'KYC alerts are not enabled in Supabase yet. Apply 20260930130000_client_kyc_requests.sql, then reload the Supabase API schema cache.' : requestError?.message || 'The KYC request could not be sent.');
    } else {
      setRequest(data as ClientKycRequest);
      notifyAdmin(`Urgent KYC update request sent to ${client.full_name || client.email || 'the client'}.`);
    }
    setSending(false);
  };

  return <section className={`mt-3 border p-3 ${missingFields.length ? 'border-[#dfaa9e] bg-[#fff5f1]' : 'border-[#a9d9d8] bg-[#eefbf9]'}`}>
    <div className="flex items-start gap-2">
      {missingFields.length ? <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#a55445]" /> : <Check size={16} className="mt-0.5 shrink-0 text-[#2e6b3e]" />}
      <div className="min-w-0 flex-1">
        <p className={`text-xs font-semibold ${missingFields.length ? 'text-[#8d332b]' : 'text-[#2e6b3e]'}`}>{missingFields.length ? 'Urgent: client KYC is incomplete' : 'Client KYC details are complete'}</p>
        {missingFields.length > 0 && <p className="mt-1 text-xs leading-5 text-[#6f4a43]">Missing: {missingFields.join(', ')}. Send a portal alert asking the client to update their profile.</p>}
        {request && <div className="mt-2 flex flex-wrap items-center gap-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Request {request.status.toLowerCase()} · {request.status === 'COMPLETED' && request.completed_at ? `completed ${fmt(request.completed_at)}` : `sent ${fmt(request.requested_at)}`}</p>{request.status === 'PENDING' && <button type="button" onClick={() => void refreshStatus()} disabled={loading} className="text-[10px] font-semibold text-[#087f88] underline disabled:opacity-50">Refresh client status</button>}</div>}
        {missingFields.length > 0 && <button type="button" onClick={() => void sendRequest()} disabled={sending || loading} className="mt-3 inline-flex items-center gap-2 border border-[#a55445] bg-[#a55445] px-3 py-2 text-xs font-semibold text-white hover:bg-[#873c31] disabled:opacity-60"><Send size={13} />{sending ? 'Sending alert...' : request?.status === 'PENDING' ? 'Send reminder' : 'Send urgent client alert'}</button>}
        {error && <p role="alert" className="mt-2 text-xs text-[#a55445]">{error}</p>}
      </div>
    </div>
  </section>;
}

type AdminSupportTicket = { id: string; user_id: string; subject: string; message: string; status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'; staff_reply: string | null; created_at: string; updated_at: string };

function ClientSupportTab() {
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [clients, setClients] = useState<Pick<DocumentClient, 'id' | 'full_name' | 'email'>[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async () => {
    const [{ data, error: ticketError }, { data: clientRows }] = await Promise.all([
      supabase.from('client_support_tickets').select('id,user_id,subject,message,status,staff_reply,created_at,updated_at').order('created_at', { ascending: false }).limit(100),
      supabase.rpc('list_document_client_profiles'),
    ]);
    if (ticketError) setError(`Support requests could not be loaded: ${ticketError.message}`);
    else {
      const rows = (data ?? []) as AdminSupportTicket[];
      setTickets(rows);
      setDrafts((current) => Object.fromEntries(rows.map((ticket) => [ticket.id, current[ticket.id] ?? ticket.staff_reply ?? ''])));
      setError('');
      setClients(((clientRows ?? []) as DocumentClient[]).map(({ id, full_name, email }) => ({ id, full_name, email })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const channel = supabase.channel('admin-client-support')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_support_tickets' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const updateStatus = async (ticket: AdminSupportTicket, status: AdminSupportTicket['status']) => {
    setSaving(ticket.id);
    setError('');
    const { error: updateError } = await supabase.from('client_support_tickets').update({ status, updated_at: new Date().toISOString() }).eq('id', ticket.id);
    if (updateError) setError(`Request status could not be updated: ${updateError.message}`);
    else setTickets((current) => current.map((item) => item.id === ticket.id ? { ...item, status, updated_at: new Date().toISOString() } : item));
    setSaving('');
  };

  const sendReply = async (ticket: AdminSupportTicket) => {
    const reply = (drafts[ticket.id] ?? '').trim();
    if (!reply) return;
    setSaving(ticket.id);
    setError('');
    setSuccess('');
    const updatedAt = new Date().toISOString();
    const nextStatus = ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status;
    const { error: updateError } = await supabase.from('client_support_tickets').update({ staff_reply: reply, status: nextStatus, updated_at: updatedAt }).eq('id', ticket.id);
    if (updateError) setError(`Reply could not be sent: ${updateError.message}`);
    else {
      setTickets((current) => current.map((item) => item.id === ticket.id ? { ...item, staff_reply: reply, status: nextStatus, updated_at: updatedAt } : item));
      const { error: notificationError } = await supabase.from('client_notifications').insert({ user_id: ticket.user_id, title: 'NBG replied to your support request', body: `${ticket.subject}: ${reply}`, kind: 'SUPPORT_REPLY' });
      setSuccess(notificationError ? 'Reply saved. The client can see it in their support request.' : 'Reply sent and client notified.');
    }
    setSaving('');
  };

  if (loading) return <Spinner />;
  return <section className="space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow text-[#20afd1]">Client communication</p><h2 className="mt-2 font-serif text-4xl">Support requests</h2><p className="mt-2 text-sm text-slate-500">Replies and status changes appear in the client portal automatically.</p></div><button type="button" onClick={() => void load()} className="btn-secondary !px-3 !py-2"><RefreshCw size={14} /> Refresh</button></div>
    {error && <p role="alert" className="border border-[#e4b8ad] bg-[#fff7f4] p-3 text-sm text-[#a55445]">{error}</p>}
    {success && <p role="status" className="border border-[#9bcfc4] bg-[#eaf7f2] p-3 text-sm text-[#26765f]">{success}</p>}
    {tickets.length === 0 ? <div className="border border-[#d6efee] bg-white p-8 text-center text-sm text-slate-500">No client support requests yet.</div> : <div className="space-y-3">{tickets.map((ticket) => {
      const client = clients.find((item) => item.id === ticket.user_id);
      return <article key={ticket.id} className="border border-[#d6efee] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#123b4b]">{ticket.subject}</p><p className="mt-1 text-xs text-slate-500">{client?.full_name || client?.email || `Client ${ticket.user_id.slice(0, 8)}`} · {new Date(ticket.created_at).toLocaleString()}</p></div><select aria-label={`Status for ${ticket.subject}`} value={ticket.status} disabled={saving === ticket.id} onChange={(event) => void updateStatus(ticket, event.target.value as AdminSupportTicket['status'])} className="admin-input !w-auto !py-2 text-xs"><option value="OPEN">Open</option><option value="IN_PROGRESS">In progress</option><option value="RESOLVED">Resolved</option></select></div>
        <p className="mt-4 whitespace-pre-wrap border-l-2 border-[#8de7e2] pl-3 text-sm leading-6 text-slate-600">{ticket.message}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]"><textarea value={drafts[ticket.id] ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [ticket.id]: event.target.value }))} rows={2} className="admin-input resize-y" placeholder="Write a reply visible to the client" aria-label={`Reply to ${ticket.subject}`} /><button type="button" disabled={saving === ticket.id || !(drafts[ticket.id] ?? '').trim()} onClick={() => void sendReply(ticket)} className="btn-primary self-end justify-center disabled:opacity-50">{saving === ticket.id ? 'Saving...' : 'Send reply'} <Send size={14} /></button></div>
        {ticket.staff_reply && <p className="mt-3 border-t border-[#e2eeec] pt-3 text-xs leading-5 text-[#26765f]"><strong>Latest reply:</strong> {ticket.staff_reply}</p>}
      </article>;
    })}</div>}
  </section>;
}

function DocumentsTab() {
  const [documents, setDocuments] = useState<AdminDocument[]>([]);
  const [clients, setClients] = useState<DocumentClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<AdminDocument | null>(null);
  const load = useCallback(async () => {
    const [{ data: documentRows, error: documentError }, { data: clientRows, error: clientError }] = await Promise.all([
      supabase.from('client_documents').select('*').order('created_at', { ascending: false }),
      supabase.rpc('list_document_client_profiles'),
    ]);
    if (documentError) notifyAdmin('Documents could not be loaded. Apply the admin operations migration.', 'error');
    if (clientError) notifyAdmin('Client KYC prefill is unavailable. Apply the document KYC migration.', 'error');
    setDocuments((documentRows ?? []) as AdminDocument[]);
    setClients((clientRows ?? []) as DocumentClient[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refreshDirectory = () => { void load(); };
    window.addEventListener('nbg-client-directory-refresh', refreshDirectory);
    return () => window.removeEventListener('nbg-client-directory-refresh', refreshDirectory);
  }, [load]);
  const remove = async (document: AdminDocument) => {
    if (!window.confirm(`Remove ${document.title}?`)) return;
    const { error } = await supabase.from('client_documents').delete().eq('id', document.id);
    if (error) { notifyAdmin(error.message, 'error'); return; }
    setDocuments((items) => items.filter((item) => item.id !== document.id));
    notifyAdmin('Document removed.');
  };
  if (loading) return <Spinner />;
  return <div><div className="mb-6 flex items-end justify-between gap-4"><div><p className="eyebrow text-[#20afd1]">Verified document studio</p><h2 className="mt-2 font-serif text-4xl">Generate and share</h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">Create NBG-branded agreements, receipts, brochures, and floor plans with an identity reference and SHA-256 content hash.</p></div><button onClick={() => setShowForm(true)} className="admin-add-btn flex items-center gap-2"><FileText size={15} /> Generate document</button></div><div className="overflow-x-auto rounded-lg border border-[#c9c5bd] bg-white shadow-sm"><table className="w-full text-left text-sm"><thead className="border-b border-[#c9c5bd] bg-[#f0ede6] text-[10px] uppercase tracking-[.12em] text-slate-400"><tr>{['Document', 'Recipient', 'Source', 'Category', 'Authenticity', 'Added', ''].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody>{documents.map((document) => <tr key={document.id} className="border-b border-[#e6e2da]"><td className="px-4 py-3 font-medium"><p>{document.title}</p><p className="mt-1 text-[10px] text-slate-400">{document.document_ref || 'Uploaded file'}</p></td><td className="px-4 py-3 text-xs text-slate-500">{document.is_global ? <span className="font-semibold text-[#087f88]">All clients</span> : <>{document.recipient_name || clients.find((client) => client.id === document.user_id)?.full_name || document.user_id?.slice(0, 8) || '—'}{document.recipient_email && <span className="mt-1 block text-[10px] text-slate-400">{document.recipient_email}</span>}</>}</td><td className="px-4 py-3 text-xs text-slate-500">{document.source_type === 'GENERATED' ? 'Generated record' : 'Uploaded file'}</td><td className="px-4 py-3 text-xs text-slate-500">{document.category}</td><td className="px-4 py-3 text-xs text-[#087f88]">{document.verification_code ? `Verified · ${document.verification_code}` : 'Legacy upload'}</td><td className="px-4 py-3 text-xs text-slate-400">{fmt(document.created_at)}</td><td className="px-4 py-3 text-right"><div className="flex justify-end gap-3"><button onClick={() => setPreviewDocument(document)} className="text-xs text-[#087f88] hover:underline">View</button><button onClick={() => void remove(document)} className="text-xs text-[#a55445] hover:underline">Remove</button></div></td></tr>)}{documents.length === 0 && <EmptyRow cols={7} text="No generated documents have been shared yet." />}</tbody></table></div>{showForm && <Modal title="Generate NBG document" onClose={() => setShowForm(false)}><DocumentForm clients={clients} onDone={(document) => { setDocuments((items) => [document, ...items]); setShowForm(false); notifyAdmin('Verified document generated and shared.'); }} /></Modal>}{previewDocument && <DocumentPreview document={previewDocument} onClose={() => setPreviewDocument(null)} />}</div>;
}

function DocumentPreview({ document, onClose }: { document: AdminDocument; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [correction, setCorrection] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);
  useEffect(() => { let active = true; void supabase.storage.from('client-documents').createSignedUrl(document.file_url, 3600).then(({ data, error: signedUrlError }) => { if (!active) return; if (signedUrlError || !data?.signedUrl) setError(signedUrlError?.message || 'This document could not be opened. Run the client document storage read-policy SQL, then try again.'); else setUrl(data.signedUrl); }); return () => { active = false; }; }, [document.file_url]);
  const print = () => { if (!url) return; const printWindow = window.open(url, '_blank', 'noopener,noreferrer'); if (printWindow) { printWindow.addEventListener('load', () => printWindow.print()); } };
  const saveCorrection = async () => {
    if (!correction.trim()) return;
    setSavingCorrection(true);
    const updatedSummary = `${document.content_summary || ''}\n\nCORRECTION NOTE · ${new Date().toLocaleString()}\n${correction.trim()}`;
    const { error: updateError } = await supabase.from('client_documents').update({ content_summary: updatedSummary, updated_at: new Date().toISOString() }).eq('id', document.id);
    if (updateError) setError(`Correction could not be saved: ${updateError.message}`);
    else { await supabase.from('document_workflow_events').insert({ document_id: document.id, action: 'EDITED', comment: correction.trim() }); setCorrection(''); setError('Correction recorded. Regenerate the PDF after confirming the updated source data.'); }
    setSavingCorrection(false);
  };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071116]/70 p-4"><div className="flex h-[min(92vh,900px)] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-[#f4f1eb] shadow-2xl"><div className="flex items-center justify-between border-b border-[#c9c5bd] bg-white px-5 py-4"><div><p className="eyebrow text-[#087f88]">Document preview</p><h2 className="mt-1 text-lg font-semibold text-[#123b4b]">{document.title}</h2><p className="mt-1 text-[10px] uppercase tracking-[.1em] text-slate-400">{document.document_ref || document.category} · {document.recipient_name || (document.is_global ? 'All clients' : 'Client')}</p></div><div className="flex items-center gap-2"><a href={url || '#'} target="_blank" rel="noreferrer" download={`${document.document_ref || document.title}.pdf`} onClick={(event) => { if (!url) event.preventDefault(); }} className={`btn-secondary !px-3 !py-2 ${!url ? 'pointer-events-none opacity-50' : ''}`}><Download size={15} /> Download</a><button onClick={print} disabled={!url} className="btn-primary !px-3 !py-2 disabled:opacity-50"><FileDown size={15} /> Print</button><button onClick={onClose} className="ml-2 text-slate-500 hover:text-[#123b4b]" aria-label="Close document preview"><X size={20} /></button></div></div><div className="flex flex-1 flex-col overflow-auto bg-[#d9d5cc] p-4"><div className="mx-auto mb-4 w-full max-w-[820px] rounded border border-[#e4b8ad] bg-[#fff7f4] p-4"><p className="eyebrow text-[#a55445]">Correction log</p><textarea value={correction} onChange={(event) => setCorrection(event.target.value)} rows={2} className="admin-input mt-2 w-full resize-none" placeholder="Record a source correction or missing-data resolution" /><button type="button" onClick={() => void saveCorrection()} disabled={savingCorrection || !correction.trim()} className="btn-secondary mt-2 disabled:opacity-50">{savingCorrection ? 'Recording...' : 'Record correction'}</button></div><div className="flex flex-1 items-center justify-center">{error ? <div className="max-w-lg text-center text-sm text-[#a55445]"><p>{error}</p><p className="mt-3 text-xs text-slate-500">The document record is available, but its private PDF could not be opened. Use Download after correcting storage access.</p></div> : !url ? <p className="text-sm text-slate-500">Preparing secure preview...</p> : <article className="relative min-h-[680px] w-full max-w-[820px] overflow-hidden bg-white px-12 py-12 shadow-lg md:px-20"><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="rotate-[-28deg] text-5xl font-semibold tracking-[.18em] text-slate-200/70">NBG · VERIFIED</span></div><div className="relative"><div className="flex items-start gap-4 border-b border-[#19c6c9] pb-6"><img src="/NBG_LOGO-removebg-preview.png" alt="Next Bridge Group" className="h-16 w-16 object-contain" /><div><p className="text-xl font-semibold tracking-[.12em] text-[#0d4055]">NEXT BRIDGE GROUP LIMITED</p><p className="mt-1 text-[10px] uppercase tracking-[.18em] text-slate-500">Building homes · Creating legacies · Nyali, Mombasa</p></div></div><p className="mt-12 text-[11px] uppercase tracking-[.2em] text-[#087f88]">{document.category.replace('_', ' ')}</p><h3 className="mt-3 font-serif text-4xl text-[#123b4b]">{document.title}</h3><div className="mt-8 grid gap-5 border-y border-[#d6efee] py-6 sm:grid-cols-2"><div><p className="eyebrow text-slate-500">Recipient</p><p className="mt-2 text-sm text-[#123b4b]">{document.recipient_name || (document.is_global ? 'All clients' : 'Client account')}</p></div><div><p className="eyebrow text-slate-500">Issued</p><p className="mt-2 text-sm text-[#123b4b]">{new Date(document.created_at).toLocaleString()}</p></div><div><p className="eyebrow text-slate-500">Document reference</p><p className="mt-2 text-sm text-[#123b4b]">{document.document_ref || 'Legacy document'}</p></div><div><p className="eyebrow text-slate-500">Verification code</p><p className="mt-2 text-sm text-[#087f88]">{document.verification_code || 'Not available'}</p></div></div><p className="mt-10 max-w-xl text-sm leading-7 text-slate-600">This NBG document is available as a secure PDF. Confirm its authenticity using the verification code above before relying on its contents or making a payment.</p><div className="mt-12 border-t border-[#d6efee] pt-5"><p className="text-[10px] uppercase tracking-[.14em] text-slate-500">Integrity hash</p><p className="mt-2 break-all font-mono text-[10px] text-slate-500">{document.content_hash || 'Hash not available for this legacy document'}</p></div></div></article>}</div></div></div></div>;
}

type DocumentProject = Pick<Project, 'id' | 'name' | 'location' | 'description' | 'amenities' | 'floor_plan_url' | 'brochure_url'>;
type DocumentUnit = Pick<ProjectUnit, 'id' | 'project_id' | 'unit_number' | 'type' | 'bedrooms' | 'size' | 'floor' | 'view' | 'price'>;
type DocumentSale = Pick<Sale, 'id' | 'unit_number' | 'buyer_name' | 'sale_price' | 'deposit_amount' | 'status' | 'notes'>;
type DocumentInstallment = Pick<BuyerInstallment, 'id' | 'sale_id' | 'installment_number' | 'due_date' | 'amount' | 'paid_amount' | 'status'>;
type DocumentPayment = { id: string; sale_id: string; installment_id: string | null; amount: number; payment_date: string; method: string; reference: string | null; transaction_ref?: string | null };

function DocumentSelect({ label, value, onChange, children, required = false }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; required?: boolean }) {
  return <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">{label}{required ? ' *' : ''}</span><select required={required} value={value} onChange={(event) => onChange(event.target.value)} className="admin-input w-full">{children}</select></label>;
}

function DocumentEngineFields({ template, value, onChange }: { template: ReturnType<typeof getDocumentTemplate>; value: Record<string, unknown>; onChange: (value: Record<string, unknown>) => void }) {
  if (!template) return null;
  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next });
  const input = (field: DocumentField) => {
    const stored = value[field.key];
    const current = field.type === 'items' && Array.isArray(stored) ? stored.map(String).join('\n') : String(stored ?? '');
    if (field.type === 'select') return <DocumentSelect key={field.key} label={field.label} value={current} onChange={(next) => set(field.key, next)} required={field.required}><option value="">Select...</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</DocumentSelect>;
    if (field.type === 'textarea' || field.type === 'items') return <label key={field.key} className="block"><span className="eyebrow mb-1.5 block text-slate-400">{field.label}{field.required ? ' *' : ''}</span><textarea value={current} onChange={(event) => set(field.key, field.type === 'items' ? event.target.value.split('\n').filter(Boolean) : event.target.value)} rows={field.type === 'items' ? 4 : 3} className="admin-input w-full resize-none" placeholder={field.type === 'items' ? field.help || 'One line per item' : field.help} />{field.help && <span className="mt-1 block text-[10px] text-slate-400">{field.help}</span>}</label>;
    return <AF key={field.key} label={field.label} type={field.type} value={current} onChange={(next) => set(field.key, field.type === 'number' ? next.trim() === '' ? '' : Number(next) : next)} required={field.required} placeholder={field.help} />;
  };
  return <section className="grid gap-4 rounded border border-[#a9d9d8] bg-[#eefbf9] p-4"><div><p className="eyebrow text-[#087f88]">{template.label}</p><p className="mt-2 text-xs leading-5 text-slate-600">{template.purpose}</p><p className="mt-2 text-[10px] uppercase tracking-[.1em] text-[#087f88]">Workflow: {template.workflow.join(' → ')}</p></div><div className="grid gap-4">{template.fields.map(input)}</div></section>;
}

function ReadOnlySummary({ title, rows }: { title: string; rows: [string, string | number | null | undefined][] }) {
  return <section className="rounded border border-[#a9d9d8] bg-[#eefbf9] p-4"><p className="eyebrow text-[#087f88]">{title}</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label}><p className="text-[10px] uppercase tracking-[.1em] text-slate-400">{label}</p><p className="mt-1 text-sm text-[#123b4b]">{value || 'Information not available'}</p></div>)}</div></section>;
}

function ClientInviteForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (client: DocumentClient, message: string) => void }) {
  const [values, setValues] = useState({ full_name: '', email: '', phone: '', identity_document_type: '', identity_document_number: '', residential_address: '' });
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSending(true);
    setError('');
    const { data, error: inviteError } = await supabase.functions.invoke<{ client?: DocumentClient; message?: string; error?: string }>('invite-client', { body: values });
    setSending(false);
    if (inviteError || !data?.client) { setError(data?.error || inviteError?.message || 'The secure client invitation could not be sent.'); return; }
    onCreated(data.client, data.message || `A secure setup link was sent to ${values.email}.`);
  };

  return <form onSubmit={submit} className="grid gap-4">
    <p className="text-sm leading-5 text-slate-600">Create a client login and send a one-time account setup link. KYC details are stored in the client’s private profile.</p>
    <AF label="Client full name" value={values.full_name} onChange={(full_name) => setValues((current) => ({ ...current, full_name }))} required />
    <AF label="Email for account link" type="email" value={values.email} onChange={(email) => setValues((current) => ({ ...current, email }))} required />
    <AF label="Phone number" type="tel" value={values.phone} onChange={(phone) => setValues((current) => ({ ...current, phone }))} required />
    <div className="grid gap-4 sm:grid-cols-2">
      <DocumentSelect label="Identity document type" value={values.identity_document_type} onChange={(identity_document_type) => setValues((current) => ({ ...current, identity_document_type }))} required><option value="">Select type...</option><option value="NATIONAL_ID">National ID</option><option value="PASSPORT">Passport</option></DocumentSelect>
      <AF label="ID / passport number" value={values.identity_document_number} onChange={(identity_document_number) => setValues((current) => ({ ...current, identity_document_number }))} required />
    </div>
    <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Residential address *</span><textarea value={values.residential_address} onChange={(event) => setValues((current) => ({ ...current, residential_address: event.target.value }))} required rows={2} className="admin-input w-full resize-y" autoComplete="street-address" /></label>
    {error && <p role="alert" className="border border-[#e4b8ad] bg-[#fff7f4] p-3 text-sm text-[#a55445]">{error}</p>}
    <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="btn-secondary">Cancel</button><button type="submit" disabled={sending} className="btn-primary disabled:opacity-60">{sending ? 'Sending account link...' : 'Create client & send link'} <Send size={14} /></button></div>
  </form>;
}

function DocumentForm({ clients, onDone }: { clients: DocumentClient[]; onDone: (document: AdminDocument) => void }) {
  const [category, setCategory] = useState<DocumentType>('AGREEMENT');
  const [step, setStep] = useState<'source' | 'details' | 'review'>('source');
  const [projects, setProjects] = useState<Project[]>([]);
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [installments, setInstallments] = useState<DocumentInstallment[]>([]);
  const [payments, setPayments] = useState<DocumentPayment[]>([]);
  const [saleLoadError, setSaleLoadError] = useState('');
  const [paymentLoadError, setPaymentLoadError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [clientId, setClientId] = useState('');
  const [createdClient, setCreatedClient] = useState<DocumentClient | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientDocuments, setClientDocuments] = useState<AdminDocument[]>([]);
  const [clientDocumentsLoading, setClientDocumentsLoading] = useState(false);
  const [buildingCompliancePacket, setBuildingCompliancePacket] = useState(false);
  const [compliancePacketUrl, setCompliancePacketUrl] = useState('');
  const [compliancePacketError, setCompliancePacketError] = useState('');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteNotice, setInviteNotice] = useState('');
  const [shareWithAllClients, setShareWithAllClients] = useState(false);
  const [unitId, setUnitId] = useState('');
  const [saleId, setSaleId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [manual, setManualData] = useState<Record<string, unknown>>({});
  const [invoiceItems, setInvoiceItems] = useState<{ description: string; quantity: number; unit_price: number }[]>([{ description: '', quantity: 1, unit_price: 0 }]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [overrideAcknowledged, setOverrideAcknowledged] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => { void Promise.all([
    supabase.from('projects').select('*').order('name'),
    supabase.from('project_units').select('*').order('unit_number'),
    supabase.from('sales').select('*').order('created_at', { ascending: false }),
    supabase.from('buyer_installments').select('id,sale_id,installment_number,due_date,amount,paid_amount,status').order('due_date'),
    supabase.from('buyer_payments').select('id,sale_id,installment_id,amount,payment_date,method,reference,transaction_ref').order('payment_date', { ascending: false }),
  ]).then(([projectResult, unitResult, saleResult, installmentResult, paymentResult]) => { setProjects((projectResult.data ?? []) as Project[]); setUnits((unitResult.data ?? []) as ProjectUnit[]); setSales((saleResult.data ?? []) as Sale[]); setSaleLoadError(saleResult.error?.message || ''); setInstallments((installmentResult.data ?? []) as DocumentInstallment[]); setPayments((paymentResult.data ?? []) as DocumentPayment[]); setPaymentLoadError(paymentResult.error?.message || ''); }); }, []);

  useEffect(() => {
    let active = true;
    if (!clientId) {
      setClientDocuments([]);
      setClientDocumentsLoading(false);
      return () => { active = false; };
    }
    setClientDocumentsLoading(true);
    void supabase.from('client_documents').select('id,user_id,title,category,file_url,created_at,is_global,recipient_name,recipient_email,source_record_id,document_ref,verification_code,content_hash,content_summary,source_type').eq('user_id', clientId).order('created_at', { ascending: false }).then(({ data, error: documentsError }) => {
      if (!active) return;
      setClientDocuments((data ?? []) as AdminDocument[]);
      if (documentsError) setError(`Client documents could not be loaded: ${documentsError.message}`);
      setClientDocumentsLoading(false);
    });
    return () => { active = false; };
  }, [clientId]);

  useEffect(() => () => { if (compliancePacketUrl) URL.revokeObjectURL(compliancePacketUrl); }, [compliancePacketUrl]);

  const template = DOCUMENT_TEMPLATES[category];
  const project = projects.find((item) => item.id === projectId);
  const availableClients = createdClient && !clients.some((item) => item.id === createdClient.id) ? [...clients, createdClient] : clients;
  const client = availableClients.find((item) => item.id === clientId);
  const unit = units.find((item) => item.id === unitId);
  const sale = sales.find((item) => item.id === saleId);
  const payment = payments.find((item) => item.id === paymentId);
  const salePayments = saleId ? payments.filter((item) => item.sale_id === saleId).sort((left, right) => right.payment_date.localeCompare(left.payment_date)) : [];
  const projectUnits = units.filter((item) => item.project_id === projectId);
  const saleInstallments = installments.filter((item) => item.sale_id === saleId);
  const normalizeSaleMatch = (value: string | null | undefined) => (value || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  const normalizePhoneMatch = (value: string | null | undefined) => (value || '').replace(/\D/g, '').replace(/^0/, '254');
  const clientForSale = (saleRecord: Sale) => {
    if (saleRecord.buyer_user_id) return availableClients.find((candidate) => candidate.id === saleRecord.buyer_user_id);
    if (saleRecord.buyer_email) {
      const matches = availableClients.filter((candidate) => candidate.email && normalizeSaleMatch(candidate.email) === normalizeSaleMatch(saleRecord.buyer_email));
      return matches.length === 1 ? matches[0] : undefined;
    }
    if (saleRecord.buyer_phone) {
      const phoneMatch = normalizePhoneMatch(saleRecord.buyer_phone);
      const matches = availableClients.filter((candidate) => candidate.phone && normalizePhoneMatch(candidate.phone) === phoneMatch);
      return matches.length === 1 ? matches[0] : undefined;
    }
    if (saleRecord.buyer_name) {
      const matches = availableClients.filter((candidate) => candidate.full_name && normalizeSaleMatch(candidate.full_name) === normalizeSaleMatch(saleRecord.buyer_name));
      return matches.length === 1 ? matches[0] : undefined;
    }
    return undefined;
  };
  const saleMatchesClient = (saleRecord: Sale, candidate: DocumentClient | undefined) => {
    if (!candidate) return false;
    return clientForSale(saleRecord)?.id === candidate.id;
  };
  const projectOptions = projects.map((item) => ({ value: item.id, label: `${item.name} · ${item.locality || item.location || 'Location pending'}`, search: `${item.county || ''} ${item.property_category || ''}` }));
  const clientOptions = availableClients.map((item) => ({ value: item.id, label: item.full_name || item.email || item.id, search: `${item.full_name || ''} ${item.email || ''} ${item.phone || ''}` }));
  const filteredClientOptions = clientOptions.filter((option) => `${option.label} ${option.search}`.toLowerCase().includes(clientSearch.trim().toLowerCase()));
  const unitOptions = projectUnits.map((item) => ({ value: item.id, label: `Unit ${item.unit_number} · ${item.type || 'Residence'} · ${item.status}`, search: `${item.size || ''} ${item.view || ''}` }));
  const unitSaleOptions = sales.filter((item) => {
    const saleUnit = item.unit_id ? units.find((candidate) => candidate.id === item.unit_id) : null;
    const sameUnitNumber = Boolean(unit && normalizeSaleMatch(item.unit_number) === normalizeSaleMatch(unit.unit_number));
    const unitMatches = !unitId || item.unit_id === unitId || (sameUnitNumber && (!saleUnit || saleUnit.project_id === unit?.project_id));
    const projectMatches = !projectId || !saleUnit || saleUnit.project_id === projectId;
    return unitMatches && projectMatches;
  });
  const saleOptions = [...unitSaleOptions].sort((left, right) => {
    const leftMatches = !clientId || saleMatchesClient(left, client);
    const rightMatches = !clientId || saleMatchesClient(right, client);
    return Number(rightMatches) - Number(leftMatches) || (right.created_at || '').localeCompare(left.created_at || '');
  }).map((item) => {
    const matchesClient = !clientId || saleMatchesClient(item, client);
    return {
      value: item.id,
      label: `${matchesClient ? '' : `Buyer: ${item.buyer_name} · `}Unit ${item.unit_number} · ${item.status} · ${fmtKes(item.sale_price)}`,
      buyerMatchesClient: matchesClient,
      saleClientId: clientForSale(item)?.id || '',
      search: `${item.buyer_name} ${item.buyer_email || ''} ${item.buyer_phone || ''}`,
    };
  });
  const saleBuyerMismatchCount = saleOptions.filter((option) => !option.buyerMatchesClient).length;
  const linkedClientSales = clientId ? sales.filter((item) => saleMatchesClient(item, client)) : [];
  const clientPurchases = linkedClientSales.filter((saleRecord) => ['RESERVED', 'DEPOSIT_PAID', 'COMPLETED'].includes(saleRecord.status));
  const matchingClientSales = !clientId ? [] : category === 'RECEIPT' ? linkedClientSales : ['AGREEMENT', 'CLIENT_INVOICE'].includes(category) ? unitSaleOptions.filter((item) => saleMatchesClient(item, client)) : [];
  const clientPurchasePriority = (saleRecord: Sale) => ['RESERVED', 'DEPOSIT_PAID'].includes(saleRecord.status) ? 0 : saleRecord.status === 'COMPLETED' ? 1 : 2;
  const preferredClientPurchase = [...clientPurchases].sort((left, right) => clientPurchasePriority(left) - clientPurchasePriority(right) || (right.created_at || '').localeCompare(left.created_at || ''))[0];
  const autoSelectedSaleId = category === 'AGREEMENT' ? preferredClientPurchase?.id || '' : matchingClientSales.length === 1 ? matchingClientSales[0].id : '';
  const autoFilledPurchaseKey = useRef('');
  useEffect(() => {
    if (!clientId || !autoSelectedSaleId) return;
    const selectionKey = `${clientId}:${category}:${autoSelectedSaleId}`;
    if (autoFilledPurchaseKey.current === selectionKey) return;
    autoFilledPurchaseKey.current = selectionKey;
    setSaleId(autoSelectedSaleId);
    const selectedSale = sales.find((item) => item.id === autoSelectedSaleId);
    const matchingUnits = units.filter((item) => item.unit_number === selectedSale?.unit_number);
    const selectedUnit = selectedSale?.unit_id ? units.find((item) => item.id === selectedSale.unit_id) : matchingUnits.length === 1 ? matchingUnits[0] : undefined;
    if (selectedUnit?.project_id && selectedUnit.project_id !== projectId) setProjectId(selectedUnit.project_id);
    if (selectedUnit) setUnitId(selectedUnit.id);
    const latestPayment = payments.filter((item) => item.sale_id === autoSelectedSaleId).sort((left, right) => right.payment_date.localeCompare(left.payment_date))[0];
    if (latestPayment) setPaymentId(latestPayment.id);
  }, [autoSelectedSaleId, category, clientId, paymentId, payments, projectId, saleId, sales, unitId, units]);
  const selectedClientSaleIds = new Set(linkedClientSales.map((saleRecord) => saleRecord.id));
  const paymentOptions = payments.filter((item) => !clientId || selectedClientSaleIds.has(item.sale_id)).map((item) => ({ value: item.id, label: `${item.method} · ${item.transaction_ref || item.reference || 'No reference'} · ${fmtKes(Number(item.amount))}`, search: `${item.sale_id} ${sales.find((saleRecord) => saleRecord.id === item.sale_id)?.unit_number || ''}` }));
  const uniqueMatchingSaleFor = (candidate: DocumentClient | undefined, nextUnitId: string) => {
    if (!candidate || !nextUnitId) return '';
    const nextUnit = units.find((item) => item.id === nextUnitId);
    const matches = sales.filter((saleRecord) => {
      const saleUnit = saleRecord.unit_id ? units.find((item) => item.id === saleRecord.unit_id) : null;
      const sameUnitNumber = Boolean(nextUnit && normalizeSaleMatch(saleRecord.unit_number) === normalizeSaleMatch(nextUnit.unit_number));
      const sameUnit = saleRecord.unit_id === nextUnitId || (sameUnitNumber && (!saleUnit || saleUnit.project_id === nextUnit?.project_id));
      return sameUnit && (!projectId || !saleUnit || saleUnit.project_id === projectId) && saleMatchesClient(saleRecord, candidate);
    });
    return matches.length === 1 ? matches[0].id : '';
  };
  const invoiceSubtotal = invoiceItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity) || 0) * Math.max(0, Number(item.unit_price) || 0), 0);
  const invoiceTax = Math.max(0, Number(manual.tax_amount) || 0);
  const invoiceTotal = invoiceSubtotal + invoiceTax;
  const paymentSchedule = [...(sale?.deposit_amount ? [{ description: 'Deposit', amount: sale.deposit_amount }] : []), ...saleInstallments.map((item) => ({ description: `Installment ${item.installment_number} · ${item.due_date}`, amount: item.amount }))];
  const sourceFields = {
    ...manual,
    project_id: projectId || undefined,
    project_name: project?.name || '',
    project_description: project?.description || '',
    project_coordinates: project?.latitude != null && project.longitude != null ? `${project.latitude}, ${project.longitude}` : '',
    property_reference: unit?.unit_number || '',
    unit_number: unit?.unit_number || '',
    property_type: unit?.type || '',
    size: unit?.size || '',
    buyer_legal_name: client?.full_name || sale?.buyer_name || '',
    buyer_id_passport: client?.identity_document_number || '',
    buyer_id_type: client?.identity_document_type || '',
    buyer_phone: client?.phone || sale?.buyer_phone || '',
    buyer_email: client?.email || sale?.buyer_email || '',
    buyer_residential_address: client?.residential_address || '',
    client_name: client?.full_name || '',
    customer_name: client?.full_name || '',
    site_location: project?.location || project?.locality || '',
    delivery_location: project?.location || project?.locality || '',
    location_information: [project?.location, project?.locality, project?.county, project?.country].filter(Boolean).join(', '),
    county: project?.county || '',
    sub_county: '',
    town: project?.locality || '',
    locality: project?.locality || '',
    estate_area: project?.locality || '',
    plot_lr_number: project?.land_reference || '',
    property_types: project?.property_category ? [project.property_category] : [],
    amenities: project?.amenities || [],
    contact_details: '+254 741 121 575 · hello@nextbridgegroup.com',
    total_purchase_price: sale?.sale_price ?? '',
    amount_received: payment?.amount ?? '',
    payment_id: paymentId || '',
    payment_method: payment?.method || '',
    transaction_reference: payment?.transaction_ref || payment?.reference || '',
    agreement_number: sale?.id || '',
    invoice_items: invoiceItems.filter((item) => item.description.trim()).map((item) => ({ ...item, amount: item.quantity * item.unit_price })),
    subtotal: invoiceSubtotal,
    tax_amount: invoiceTax,
    grand_total: invoiceTotal,
    currency: String(manual.currency || 'KES'),
    invoice_date: String(manual.invoice_date || new Date().toISOString().slice(0, 10)),
    due_date: String(manual.due_date || new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)),
    payment_terms: String(manual.payment_terms || 'Payment is due within 14 days. Use the invoice number as payment reference.'),
    payment_schedule: paymentSchedule,
  };
  const documentData = { ...sourceFields, invoice_items: invoiceItems.filter((item) => item.description.trim()).map((item) => ({ ...item, amount: item.quantity * item.unit_price })), subtotal: invoiceSubtotal, tax_amount: invoiceTax, grand_total: invoiceTotal };
  const missingKycFields = client ? [!client.full_name ? 'full legal name as shown on ID' : '', !client.identity_document_type ? 'identity document type' : '', !client.identity_document_number ? 'ID / passport number' : '', !client.residential_address ? 'residential address' : '', !clientDocuments.some((document) => document.category === 'IDENTITY_DOCUMENT') ? 'identity document upload' : ''].filter(Boolean) : [];
  const generateCompliancePacket = async () => {
    if (!client || buildingCompliancePacket) return;
    setBuildingCompliancePacket(true);
    setCompliancePacketError('');
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const packet = await PDFDocument.create();
      const font = await packet.embedFont(StandardFonts.Helvetica);
      const boldFont = await packet.embedFont(StandardFonts.HelveticaBold);
      const safePdfText = (value: string) => value.replace(/[^\x20-\x7E]/g, ' ');
      const cover = packet.addPage();
      cover.drawText('CLIENT COMPLIANCE PACKET', { x: 48, y: 750, size: 18, font: boldFont, color: rgb(0.05, 0.3, 0.34) });
      cover.drawText(safePdfText(`Client: ${client.full_name || 'Legal name missing'}`), { x: 48, y: 710, size: 12, font: boldFont });
      cover.drawText(safePdfText(`Email: ${client.email || 'Not recorded'}`), { x: 48, y: 690, size: 10, font });
      cover.drawText(safePdfText(`Phone: ${client.phone || 'Not recorded'}`), { x: 48, y: 674, size: 10, font });
      cover.drawText(safePdfText(`ID type: ${client.identity_document_type || 'Missing'} / Number: ${client.identity_document_number || 'Missing'}`), { x: 48, y: 658, size: 10, font });
      cover.drawText(safePdfText(`Residential address: ${client.residential_address || 'Missing'}`), { x: 48, y: 642, size: 10, font, maxWidth: 500 });
      cover.drawText(`Generated: ${new Date().toLocaleString('en-KE')}`, { x: 48, y: 616, size: 9, font });
      cover.drawText('Missing requirements', { x: 48, y: 580, size: 11, font: boldFont, color: rgb(0.56, 0.2, 0.16) });
      const missing = missingKycFields.length ? missingKycFields : ['None identified'];
      missing.forEach((field, index) => cover.drawText(`- ${safePdfText(field)}`, { x: 58, y: 560 - index * 16, size: 9, font }));
      if (!clientDocuments.length) cover.drawText('No client documents are on file.', { x: 48, y: 500, size: 10, font, color: rgb(0.56, 0.2, 0.16) });

      for (const clientDocument of clientDocuments) {
        try {
        const fileResult = await supabase.storage.from('client-documents').download(clientDocument.file_url);
        if (fileResult.error || !fileResult.data) {
          const page = packet.addPage();
          page.drawText(safePdfText(clientDocument.title), { x: 36, y: page.getHeight() - 40, size: 11, font: boldFont, maxWidth: page.getWidth() - 72 });
          page.drawText(`File unavailable: ${safePdfText(fileResult.error?.message || 'Private file could not be downloaded')}`, { x: 36, y: page.getHeight() - 64, size: 9, font, maxWidth: page.getWidth() - 72 });
          continue;
        }
        const bytes = await fileResult.data.arrayBuffer();
        const path = clientDocument.file_url.toLowerCase();
        const contentType = fileResult.data.type.toLowerCase();
        if (path.endsWith('.pdf') || contentType.includes('pdf')) {
          const source = await PDFDocument.load(bytes);
          const pages = await packet.copyPages(source, source.getPageIndices());
          pages.forEach((page) => packet.addPage(page));
        } else if (contentType.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(path)) {
          const bitmap = await createImageBitmap(fileResult.data);
          const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const context = canvas.getContext('2d');
          if (!context) throw new Error(`${clientDocument.title}: image conversion is unavailable`);
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          bitmap.close();
          const imageBlob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error(`${clientDocument.title}: image conversion failed`)), 'image/jpeg', 0.9));
          const image = await packet.embedJpg(await imageBlob.arrayBuffer());
          const page = packet.addPage();
          page.drawText(safePdfText(clientDocument.title), { x: 36, y: page.getHeight() - 30, size: 9, font: boldFont, maxWidth: page.getWidth() - 72 });
          const size = image.scale(Math.min((page.getWidth() - 72) / image.width, (page.getHeight() - 72) / image.height));
          page.drawImage(image, { x: (page.getWidth() - size.width) / 2, y: (page.getHeight() - size.height) / 2 - 10, width: size.width, height: size.height });
        } else {
          const page = packet.addPage();
          page.drawText(safePdfText(clientDocument.title), { x: 36, y: page.getHeight() - 40, size: 11, font: boldFont, maxWidth: page.getWidth() - 72 });
          page.drawText('This legacy file format could not be embedded. Open the original document from the client document register.', { x: 36, y: page.getHeight() - 64, size: 9, font, maxWidth: page.getWidth() - 72 });
        }
        } catch (documentError) {
          const page = packet.addPage();
          const reason = documentError instanceof Error ? documentError.message : 'Document could not be embedded';
          page.drawText(safePdfText(clientDocument.title), { x: 36, y: page.getHeight() - 40, size: 11, font: boldFont, maxWidth: page.getWidth() - 72 });
          page.drawText(safePdfText(`Document could not be embedded: ${reason}`), { x: 36, y: page.getHeight() - 64, size: 9, font, maxWidth: page.getWidth() - 72 });
        }
      }
      const blob = new Blob([await packet.save()], { type: 'application/pdf' });
      setCompliancePacketUrl(URL.createObjectURL(blob));
    } catch (error) {
      setCompliancePacketError(error instanceof Error ? error.message : 'The compliance packet could not be assembled.');
    } finally {
      setBuildingCompliancePacket(false);
    }
  };
  const primaryError = () => {
    if (requiresClient && !client && !shareWithAllClients) return 'Select an existing client account or explicitly share this public brochure/floor plan with all clients.';
    if (shareWithAllClients && !['BROCHURE', 'FLOOR_PLAN'].includes(category)) return 'Only public brochures and floor plans can be shared with all client accounts.';
    if (category === 'AGREEMENT' && (!project || !client || !unit || !sale)) return 'Select a project, client, property/unit, and matching sale before generating an Agreement for Sale.';
    if (category === 'AGREEMENT' && sale && client && !saleMatchesClient(sale, client)) return `The selected sale belongs to ${sale.buyer_name}. Select that buyer profile before generating the agreement.`;
    if (category === 'AGREEMENT' && clientDocumentsLoading) return 'Wait for the selected client’s identity documents to finish loading.';
    if (category === 'RECEIPT' && !client) return 'Select the registered client before looking up their sale and verified payments.';
    if (category === 'RECEIPT' && paymentLoadError) return `Verified payments could not be loaded: ${paymentLoadError}`;
    if (category === 'RECEIPT' && linkedClientSales.length === 0) return 'This client has no recorded sale yet. Select the buyer who owns the sale before creating a receipt.';
    if (category === 'RECEIPT' && paymentOptions.length === 0) return 'This client has a sale, but no recorded payment is available for a receipt yet.';
    if (category === 'RECEIPT' && (!payment || !(payment.transaction_ref || payment.reference))) return 'Select a recorded payment with a transaction reference. Receipts cannot be created from unverified or incomplete payments.';
    if (category === 'CLIENT_INVOICE' && (!client || !project)) return 'Select a client and an existing project before generating a client invoice.';
    if (category === 'BROCHURE' && !project) return 'Select a published project before generating a brochure.';
    if (category === 'FLOOR_PLAN' && (!project || !unit)) return 'Select an existing project and unit before generating a floor plan.';
    return '';
  };
  const linkedFields = category === 'AGREEMENT'
    ? ['project_id', 'property_reference', 'county', 'sub_county', 'town', 'locality', 'estate_area', 'plot_lr_number', 'buyer_legal_name', 'buyer_id_passport', 'buyer_phone', 'buyer_email', 'buyer_residential_address', 'unit_number', 'property_type', 'size', 'total_purchase_price', 'currency', 'payment_schedule']
    : category === 'RECEIPT'
      ? ['payment_id', 'customer_name', 'amount_received', 'payment_method', 'transaction_reference']
      : category === 'CLIENT_INVOICE'
        ? ['client_name', 'site_location', 'currency', 'subtotal', 'tax_amount', 'grand_total', 'invoice_items']
        : category === 'FLOOR_PLAN'
        ? ['project_id', 'unit_number', 'property_type', 'size']
        : ['project_id'];
  const formTemplate = { ...template, fields: template.fields.filter((field) => !linkedFields.includes(field.key)) };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const sourceError = primaryError();
    if (sourceError) { setError(sourceError); return; }
    if (requiredWarnings.length && (!overrideAcknowledged || overrideReason.trim().length < 12)) {
      setError('Review each readiness warning, acknowledge the draft-only override, and enter a reason of at least 12 characters.');
      return;
    }
    setSaving(true); setError('');
    try {
      const numberResult = await supabase.rpc('next_document_number', { document_kind: category });
      const documentNumber = String(numberResult.data || documentIdentity(category).documentRef);
      const verificationCode = await allocateDocumentVerificationCode();
      const title = `${template.label} · ${project?.name || client?.full_name || 'NBG record'}`;
      const readinessOverride = requiredWarnings.length ? { acknowledged: true, reason: overrideReason.trim(), warnings: requiredWarnings } : null;
      const snapshot = { generated_at: new Date().toISOString(), document_type: category, project, client, unit, sale, payment, entered_fields: manual, document_data: documentData, readiness_override: readinessOverride };
      const detailText = `${template.label}\n\nSYSTEM SNAPSHOT\n${JSON.stringify({ ...snapshot, document_data: documentData }, null, 2)}${readinessOverride ? `\n\nDRAFT READINESS OVERRIDE\n${JSON.stringify(readinessOverride, null, 2)}` : ''}`;
      const recipient = client?.full_name || project?.name || 'NBG operations';
      const generatedAmount = category === 'CLIENT_INVOICE' ? invoiceTotal : sale?.sale_price || payment?.amount || Number(manual.amount) || 0;
      const generated = await generateBrandedPdf(category, title, recipient, detailText, String(generatedAmount || ''), documentNumber, verificationCode);
      const fileUrl = await uploadPrivateDocument(generated.blob, `${documentNumber}.pdf`);
      const record = { user_id: clientId || null, is_global: shareWithAllClients, recipient_name: recipient, title, category, file_url: fileUrl, document_ref: documentNumber, document_number: documentNumber, document_type: category, version_number: 1, status: 'DRAFT', approval_status: template.workflow.some((step) => ['LEGAL_REVIEW', 'APPROVAL', 'TECHNICAL_REVIEW'].includes(step)) ? 'PENDING' : 'NOT_REQUIRED', signature_status: template.workflow.includes('SIGNED') ? 'PENDING' : 'NOT_REQUIRED', project_id: projectId || null, unit_id: unitId || null, source_record_id: saleId || paymentId || unitId || projectId || null, content_summary: detailText, form_data: snapshot, content_hash: generated.contentHash, verification_code: generated.verificationCode, generated_at: new Date().toISOString(), source_type: 'GENERATED' };
      const { data: saved, error: saveError } = await supabase.from('client_documents').insert(record).select().single();
      if (saveError || !saved) throw new Error(saveError?.message || 'Could not save generated document. Apply the NBG document engine migration first.');
      await supabase.from('document_workflow_events').insert({ document_id: saved.id, action: 'CREATED', to_status: 'DRAFT', comment: readinessOverride ? `Draft generated with readiness override: ${overrideReason.trim()}` : `${template.label} generated from linked source records` });
      onDone(saved as AdminDocument);
    } catch (generationError) { setError(uploadErrorMessage(generationError)); } finally { setSaving(false); }
  };

  const requiresClient = !['PURCHASE_ORDER', 'SUPPLIER_INVOICE', 'PAYMENT_VOUCHER', 'DELIVERY_NOTE', 'CONSTRUCTION_CONTRACT'].includes(category);
  const requiresUnit = ['AGREEMENT', 'CLIENT_INVOICE', 'FLOOR_PLAN'].includes(category);
  const requiresProject = ['AGREEMENT', 'CLIENT_INVOICE', 'BROCHURE', 'FLOOR_PLAN', 'QUOTATION', 'PURCHASE_ORDER', 'SUPPLIER_INVOICE', 'PAYMENT_VOUCHER', 'DELIVERY_NOTE', 'CONSTRUCTION_CONTRACT'].includes(category);
  const steps: { id: typeof step; title: string; description: string }[] = [
    { id: 'source', title: 'Source records', description: 'Choose document, client, project and property records.' },
    { id: 'details', title: 'Document details', description: 'Review fetched data and complete only the missing fields.' },
    { id: 'review', title: 'Review & generate', description: 'Check the final source summary and issue the verified draft.' },
  ];
  const stepIndex = steps.findIndex((item) => item.id === step);
  const moveStep = (nextStep: typeof step) => {
    if (step === 'source' && nextStep !== 'source') {
      const sourceError = primaryError();
      if (sourceError) { setError(sourceError); return; }
    }
    setError('');
    setStep(nextStep);
  };
  const agreementExtras = formTemplate.fields.filter((field) => ['completion_date', 'fixtures_schedule', 'title_legal_information', 'specifications', 'taxes_and_costs', 'default_termination', 'dispute_resolution'].includes(field.key));
  const visibleTemplate = { ...formTemplate, fields: formTemplate.fields.filter((field) => !agreementExtras.some((extra) => extra.key === field.key)) };
  const templateWarnings = template.validate(documentData);
  const kycWarnings = category === 'AGREEMENT' ? missingKycFields.map((field) => `Client KYC: ${field} is missing.`) : [];
  const requiredWarnings = [...new Set([...templateWarnings, ...kycWarnings])];
  const projectMapUrl = project?.map_url || (project?.latitude != null && project.longitude != null
    ? `https://www.google.com/maps/search/?api=1&query=${project.latitude},${project.longitude}`
    : project?.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([project.location, project.locality, project.county].filter(Boolean).join(', '))}` : '');
  const readableReadinessWarning = (warning: string) => {
    const field = template.fields.find((candidate) => warning.startsWith(`${candidate.key} `));
    if (field) return `${field.label}${warning.slice(field.key.length)}`;
    if (warning.startsWith('At least one payment_schedule')) return 'Payment schedule is empty. Link a sale with installments or add the scheduled payments before generating this agreement.';
    if (warning.startsWith('Payment schedule total')) return warning;
    return warning;
  };

  return <form onSubmit={submit} className="document-composer grid min-h-[min(72vh,720px)] grid-rows-[auto_1fr_auto] gap-4">
    <div className="grid gap-4 border-b border-[#e2ded5] pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow text-[#087f88]">Verified document studio</p><h3 className="mt-2 font-serif text-2xl text-[#123b4b]">{template.label}</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">{template.purpose}</p></div><span className="border border-[#a9d9d8] bg-[#eefbf9] px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-[#087f88]">Step {stepIndex + 1} of {steps.length}</span></div>
      <nav aria-label="Document generation steps" className="grid grid-cols-3 gap-2">{steps.map((item, index) => <button key={item.id} type="button" onClick={() => moveStep(item.id)} aria-current={step === item.id ? 'step' : undefined} className={`min-w-0 border-b-2 px-2 py-2 text-left ${step === item.id ? 'border-[#087f88] text-[#087f88]' : 'border-[#d9d5cc] text-slate-400'}`}><span className="block text-[10px] font-semibold uppercase tracking-wide">0{index + 1} · {item.title}</span><span className="mt-1 hidden text-[10px] text-slate-500 sm:block">{item.description}</span></button>)}</nav>
    </div>

    <div className="min-h-0 overflow-y-auto pr-1">
      {step === 'source' && <div className="grid gap-4 lg:grid-cols-2">
        <section className="grid content-start gap-4 border border-[#d9d5cc] bg-white p-4 sm:p-5">
          <DocumentSelect label="Document type" value={category} onChange={(value) => { setCategory(value as DocumentType); setStep('source'); setProjectId(''); setClientId(''); setClientSearch(''); setUnitId(''); setSaleId(''); setPaymentId(''); setShareWithAllClients(false); setManualData({}); setInvoiceItems([{ description: '', quantity: 1, unit_price: 0 }]); setError(''); setInviteNotice(''); }} required>
            {DOCUMENT_TYPE_OPTIONS.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}
          </DocumentSelect>
          {requiresClient && <section className="grid gap-3 border border-[#d9d5cc] bg-white p-3">
            <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Search all registered clients</span><input type="search" value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} className="admin-input w-full" placeholder="Name, email, or phone" autoComplete="off" /></label>
            <DocumentSelect label="Client / recipient" value={clientId} onChange={(value) => { const nextClient = availableClients.find((item) => item.id === value); setClientId(value); setSaleId(uniqueMatchingSaleFor(nextClient, unitId)); setPaymentId(''); setShareWithAllClients(false); setInviteNotice(''); }} required={requiresClient && !['BROCHURE', 'FLOOR_PLAN'].includes(category)}><option value="">Select a registered client...</option>{filteredClientOptions.map((option) => <option key={option.value} value={option.value}>{option.label}{availableClients.find((item) => item.id === option.value)?.email ? ` · ${availableClients.find((item) => item.id === option.value)?.email}` : ''}</option>)}</DocumentSelect>
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-[10px] text-slate-500">{filteredClientOptions.length} matching account{filteredClientOptions.length === 1 ? '' : 's'} from {availableClients.length} registered clients</p><div className="flex gap-2"><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('nbg-client-directory-refresh'))} className="btn-secondary !px-3 !py-2"><RefreshCw size={14} />Refresh clients</button><button type="button" onClick={() => { setShowInviteForm((open) => !open); setInviteNotice(''); }} className="btn-secondary !px-3 !py-2"><Plus size={14} />{showInviteForm ? 'Close create form' : 'Create client account'}</button></div></div>
            {filteredClientOptions.length === 0 && <p className="text-xs text-slate-500">No registered client matches. Create an account and send a secure setup link.</p>}
            {inviteNotice && <p role="status" className="border border-[#9bcfc4] bg-[#eaf7f2] p-2 text-xs text-[#26765f]">{inviteNotice}</p>}
            {showInviteForm && <div className="border-t border-[#e2eeec] pt-3"><ClientInviteForm onCancel={() => setShowInviteForm(false)} onCreated={(newClient, notice) => { setCreatedClient(newClient); setClientId(newClient.id); setClientSearch(''); setSaleId(''); setPaymentId(''); setShareWithAllClients(false); setShowInviteForm(false); setInviteNotice(notice); setError(''); window.dispatchEvent(new CustomEvent('nbg-client-directory-refresh')); }} /></div>}
          </section>}
          {['BROCHURE', 'FLOOR_PLAN'].includes(category) && !clientId && <label className="flex items-start gap-3 border border-[#a9d9d8] bg-[#eefbf9] p-3 text-xs leading-5 text-[#315a62]"><input type="checkbox" checked={shareWithAllClients} onChange={(event) => setShareWithAllClients(event.target.checked)} className="mt-1 accent-[#087f88]" /><span><strong className="block text-[#123b4b]">Share with all client accounts</strong>Only enable this for public project materials. Otherwise, choose one registered client above.</span></label>}
          {requiresProject && <DocumentSelect label="Project / site" value={projectId} onChange={(value) => { setProjectId(value); setUnitId(''); setSaleId(''); }} required={['AGREEMENT', 'CLIENT_INVOICE', 'BROCHURE', 'FLOOR_PLAN'].includes(category)}><option value="">Select an existing project...</option>{projectOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</DocumentSelect>}
          {requiresUnit && <DocumentSelect label="Unit / property" value={unitId} onChange={(value) => { setUnitId(value); setSaleId(uniqueMatchingSaleFor(client, value)); }} required={category === 'AGREEMENT' || category === 'FLOOR_PLAN'}><option value="">{projectId ? 'Select a unit...' : 'Choose a project first'}</option>{unitOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</DocumentSelect>}
          {(category === 'AGREEMENT' || category === 'CLIENT_INVOICE') && <div><DocumentSelect label="Sale / agreement" value={saleId} onChange={(value) => { const option = saleOptions.find((item) => item.value === value); if (option && !option.saleClientId) { setSaleId(''); setError(`Sale for Unit ${sales.find((item) => item.id === value)?.unit_number || ''} belongs to ${sales.find((item) => item.id === value)?.buyer_name || 'a buyer'} without a matching saved client profile. Add or correct the client profile before generating this document.`); return; } setSaleId(value); if (option?.saleClientId && option.saleClientId !== clientId) { setClientId(option.saleClientId); setError('Client selection updated to match the selected sale buyer.'); } else setError(''); }}><option value="">{category === 'AGREEMENT' ? 'Select sale for this unit...' : 'Optional: link a sale...'}</option>{saleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}{saleOptions.length === 0 && <option value="" disabled>{saleLoadError ? 'Sales could not be loaded' : unitId ? 'No sale is linked to this unit' : projectId ? 'No sales found for this project' : 'Choose a project and unit to find a sale'}</option>}</DocumentSelect>{saleLoadError ? <p role="alert" className="mt-2 text-xs text-[#a55445]">Sales could not be loaded: {saleLoadError}</p> : saleBuyerMismatchCount > 0 ? <p className="mt-2 border border-[#e7d3a8] bg-[#fff8e6] p-2 text-xs leading-5 text-[#765d2b]">This unit has a sale under a different buyer profile. Selecting that sale will switch the client to the recorded buyer.</p> : saleOptions.length === 0 && unitId && unit?.status === 'SOLD' ? <p className="mt-2 border border-[#e4b8ad] bg-[#fff7f4] p-2 text-xs leading-5 text-[#a55445]">This unit is marked sold but has no linked sale record. Create or repair its sale in the Sales section before generating an agreement.</p> : saleOptions.length === 0 && unitId ? <p className="mt-2 text-xs text-slate-500">No sale is linked to this unit yet. Sales for other units are not shown.</p> : null}</div>}
          {category === 'RECEIPT' && <><DocumentSelect label="Verified payment" value={paymentId} onChange={(value) => { const nextPayment = payments.find((item) => item.id === value); const linkedSale = nextPayment ? sales.find((item) => item.id === nextPayment.sale_id) : undefined; const linkedClient = linkedSale ? clientForSale(linkedSale) : undefined; setPaymentId(value); if (linkedSale) setSaleId(linkedSale.id); if (linkedClient && linkedClient.id !== clientId) setClientId(linkedClient.id); }} required><option value="">Select a payment for this client...</option>{paymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</DocumentSelect>{paymentLoadError && <p role="alert" className="text-xs text-[#a55445]">Payments failed to load: {paymentLoadError}</p>}{clientId && linkedClientSales.length === 0 && <p className="text-xs text-[#a55445]">No sale is linked to {client?.full_name || client?.email || 'this client'}.</p>}{clientId && linkedClientSales.length > 0 && paymentOptions.length === 0 && !paymentLoadError && <p className="text-xs text-[#856b2e]">Sale found, but no payment has been recorded for this client yet.</p>}</>}
        </section>
        <section className="grid content-start gap-3">
          {client && <div className="border border-[#a9d9a8] bg-[#eefbf9] p-4"><div className="flex items-start justify-between gap-2"><div><p className="eyebrow text-[#087f88]">Fetched client KYC</p><p className="mt-1 text-sm font-semibold text-[#123b4b]">{client.full_name || client.email || 'Client record'}</p></div><span className="text-[10px] font-semibold uppercase text-[#087f88]">Profile source</span></div><div className="mt-3 grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2"><p><span className="text-slate-400">ID / passport</span><br />{client.identity_document_number || 'Not on file'}</p><p><span className="text-slate-400">Document type</span><br />{client.identity_document_type?.replace('_', ' ') || 'Not on file'}</p><p><span className="text-slate-400">Email / phone</span><br />{[client.email, client.phone].filter(Boolean).join(' · ') || 'Not on file'}</p><p><span className="text-slate-400">Residential address</span><br />{client.residential_address || 'Not on file'}</p></div><ClientKycStatus client={client} missingFields={missingKycFields} /></div>}
          {client && <section className="border border-slate-200 bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow text-[#087f88]">Compliance files</p><h4 className="mt-1 text-sm font-semibold text-[#123b4b]">{clientDocumentsLoading ? 'Loading client files…' : `${clientDocuments.length} documents on file`}</h4></div><button type="button" disabled={clientDocumentsLoading || buildingCompliancePacket} onClick={() => void generateCompliancePacket()} className="btn-secondary !px-3 !py-2 disabled:opacity-50">{buildingCompliancePacket ? 'Preparing PDF…' : 'Preview combined PDF'}</button></div>{clientDocuments.length > 0 && <ul className="mt-3 grid gap-2">{clientDocuments.map((clientDocument) => <li key={clientDocument.id} className="flex flex-wrap justify-between gap-2 border-t border-slate-100 pt-2 text-[10px] text-slate-600"><span>{clientDocument.title} · {clientDocument.category.replace(/_/g, ' ')}</span><span>{new Date(clientDocument.created_at).toLocaleDateString('en-KE')}</span></li>)}</ul>}{missingKycFields.length > 0 && <p className="mt-3 text-xs font-medium text-[#8d332b]">Missing: {missingKycFields.join(', ')}. Request the client’s update above before continuing.</p>}{compliancePacketError && <p role="alert" className="mt-3 text-xs text-[#a55445]">{compliancePacketError}</p>}{compliancePacketUrl && <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/60 p-3 sm:p-6"><section role="dialog" aria-modal="true" aria-label="Client compliance packet preview" className="grid h-[min(94vh,1000px)] w-full max-w-5xl grid-rows-[auto_1fr] bg-white shadow-2xl"><header className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><div><p className="text-xs font-semibold text-[#123b4b]">Client compliance packet</p><p className="mt-1 text-[10px] text-slate-500">{client.full_name || client.email} · {clientDocuments.length} source documents</p></div><button type="button" onClick={() => setCompliancePacketUrl('')} className="btn-secondary !px-3 !py-2">Close preview</button></header><iframe title="Combined client compliance documents" src={compliancePacketUrl} className="h-full min-h-0 w-full" /></section></div>}</section>}
          {project && <div className="border border-[#c9c5bd] bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow text-[#087f88]">Verified site source</p><p className="mt-1 text-sm font-semibold text-[#123b4b]">{project.name}</p><p className="mt-1 text-xs text-slate-500">{[project.location, project.locality, project.county, project.country].filter(Boolean).join(', ') || 'Location not recorded'}</p></div>{projectMapUrl && <a href={projectMapUrl} target="_blank" rel="noreferrer" className="btn-secondary !px-3 !py-2"><MapPin size={14} /> Map</a>}</div><div className="mt-3 grid grid-cols-2 gap-3 text-xs text-slate-500"><p>County<br /><strong className="text-[#123b4b]">{project.county || 'Not recorded'}</strong></p><p>Coordinates<br /><strong className="text-[#123b4b]">{project.latitude != null && project.longitude != null ? `${project.latitude}, ${project.longitude}` : 'Not recorded'}</strong></p></div></div>}
          {unit && <ReadOnlySummary title="Selected property" rows={[["Unit", unit.unit_number], ["Type", unit.type], ["Size", unit.size], ["Floor", unit.floor], ["Price", unit.price]]} />}
          {sale && <ReadOnlySummary title="Selected transaction" rows={[["Status", sale.status], ["Price", fmtKes(sale.sale_price)], ["Deposit", fmtKes(sale.deposit_amount)], ["Payment plan", sale.installment_frequency === 'ONE_TIME' ? 'One-time payment' : `${sale.installment_count} ${sale.installment_frequency.toLowerCase()}`]]} />}
          {payment && <ReadOnlySummary title="Verified payment" rows={[["Amount", fmtKes(payment.amount)], ["Method", payment.method], ["Reference", payment.reference], ["Date", payment.payment_date]]} />}
          {category === 'AGREEMENT' && sale && !payment && (paymentLoadError ? <p role="alert" className="border border-[#e4b8ad] bg-[#fff7f4] p-3 text-xs leading-5 text-[#8d332b]">Recorded payments could not be fetched: {paymentLoadError}. Retry loading the payment data before relying on a payment summary.</p> : <p className="border border-[#e7d3a8] bg-[#fff8e6] p-3 text-xs leading-5 text-[#765d2b]">{salePayments.length ? 'A payment exists for this sale but is not selected. The latest payment should be prefilled; select it in the source step to include it.' : 'No recorded buyer payment is linked to this sale yet. The agreement can still be prepared from the sale and installment schedule.'}</p>)}
          {category === 'AGREEMENT' && client && clientPurchases.length === 0 && <p role="status" className="border border-dashed border-[#e4b8ad] bg-[#fff7f4] p-4 text-xs leading-5 text-[#8d332b]">No active or completed purchase is linked to {client.full_name || client.email}. Create or link the sale in the Sales section before preparing an Agreement for Sale.</p>}
          {category === 'AGREEMENT' && clientPurchases.length > 1 && sale && <p role="status" className="border border-[#d6efee] bg-[#f6fbfc] p-3 text-xs leading-5 text-slate-600">Prefilled from the most recent active purchase. You can select a different matching sale above.</p>}
          {!client && requiresClient && <p className="border border-dashed border-[#c9c5bd] p-4 text-xs leading-5 text-slate-500">Choose a saved client to fetch profile KYC. Their purchase, unit, project, and payments will be filled from linked records.</p>}
        </section>
      </div>}

      {step === 'details' && <div className="grid gap-4">
        {category === 'CLIENT_INVOICE' && <section className="grid gap-4 border border-[#c9c5bd] bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="eyebrow text-[#087f88]">Invoice line items</p><p className="mt-1 text-xs text-slate-500">Add the billed service or item; totals update automatically.</p></div><button type="button" onClick={() => setInvoiceItems((items) => [...items, { description: '', quantity: 1, unit_price: 0 }])} className="btn-secondary !px-3 !py-2"><Plus size={14} /> Add line</button></div><div className="grid gap-2">{invoiceItems.map((item, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_90px_150px_150px_auto] sm:items-end"><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Description</span><input value={item.description} onChange={(event) => setInvoiceItems((items) => items.map((line, lineIndex) => lineIndex === index ? { ...line, description: event.target.value } : line))} className="admin-input w-full" placeholder="Product or service" /></label><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Qty</span><input type="number" min="1" step="1" value={item.quantity} onChange={(event) => setInvoiceItems((items) => items.map((line, lineIndex) => lineIndex === index ? { ...line, quantity: Math.max(1, Number(event.target.value) || 1) } : line))} className="admin-input w-full" /></label><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Unit price</span><input type="number" min="0" step="0.01" value={item.unit_price || ''} onChange={(event) => setInvoiceItems((items) => items.map((line, lineIndex) => lineIndex === index ? { ...line, unit_price: Math.max(0, Number(event.target.value) || 0) } : line))} className="admin-input w-full" /></label><div className="pb-2 text-sm font-semibold text-[#123b4b]">{fmtKes(item.quantity * item.unit_price)}</div><button type="button" disabled={invoiceItems.length === 1} onClick={() => setInvoiceItems((items) => items.filter((_, lineIndex) => lineIndex !== index))} className="mb-2 text-xs text-[#a55445] disabled:opacity-30" aria-label={`Remove line ${index + 1}`}><Trash2 size={15} /></button></div>)}</div><div className="grid gap-4 border-t border-[#e6e2da] pt-4 sm:grid-cols-3"><div><p className="eyebrow text-slate-500">Subtotal</p><p className="mt-1 font-serif text-xl">{fmtKes(invoiceSubtotal)}</p></div><label className="block"><span className="eyebrow mb-1.5 block text-slate-500">Tax (amount)</span><input type="number" min="0" step="0.01" value={String(manual.tax_amount ?? '')} onChange={(event) => setManualData((data) => ({ ...data, tax_amount: Number(event.target.value) || 0 }))} className="admin-input w-full" /></label><div><p className="eyebrow text-[#087f88]">Invoice total</p><p className="mt-1 font-serif text-xl text-[#087f88]">{fmtKes(invoiceTotal)}</p></div></div><DocumentEngineFields template={formTemplate} value={documentData} onChange={setManualData} /></section>}
        {category !== 'CLIENT_INVOICE' && <><DocumentEngineFields template={visibleTemplate} value={documentData} onChange={setManualData} />{category === 'AGREEMENT' && <details className="border border-[#c9c5bd] bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-[#123b4b]">Optional contract particulars</summary><p className="mt-1 text-xs text-slate-500">Leave blank for legal review to complete.</p><div className="mt-4"><DocumentEngineFields template={{ ...template, fields: agreementExtras }} value={documentData} onChange={setManualData} /></div></details>}</>}
        {project && <div className="flex flex-wrap items-center gap-2 border border-[#a9d9d8] bg-[#eefbf9] p-3 text-xs text-[#315a62]"><MapPin size={14} /> Location fields were filled from this project’s saved site address and coordinates.</div>}
      </div>}

      {step === 'review' && <div className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
        <section className="grid content-start gap-4"><ReadOnlySummary title="Document source" rows={[["Type", template.label], ["Client", client?.full_name || 'NBG operations'], ["Project", project?.name], ["Unit", unit?.unit_number], ["Sale", sale?.id], ["Payment", payment?.reference]]} />{category === 'CLIENT_INVOICE' && <div className="overflow-x-auto border border-[#c9c5bd] bg-white"><table className="w-full min-w-[420px] text-left text-xs"><thead className="bg-[#f0ede6] text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="p-3">Description</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Unit</th><th className="p-3 text-right">Total</th></tr></thead><tbody>{invoiceItems.filter((item) => item.description.trim()).map((item, index) => <tr key={index} className="border-t border-[#e6e2da]"><td className="p-3">{item.description}</td><td className="p-3 text-right">{item.quantity}</td><td className="p-3 text-right">{fmtKes(item.unit_price)}</td><td className="p-3 text-right font-semibold">{fmtKes(item.quantity * item.unit_price)}</td></tr>)}</tbody></table></div>}</section>
        <section className="grid content-start gap-3"><div className={`border p-4 ${requiredWarnings.length ? 'border-[#e4b8ad] bg-[#fff7f4]' : 'border-[#c9c5bd] bg-white'}`}><p className="eyebrow text-[#087f88]">Readiness</p><p className="mt-2 text-sm font-semibold text-[#123b4b]">{requiredWarnings.length ? `${requiredWarnings.length} required detail${requiredWarnings.length === 1 ? '' : 's'} need attention.` : 'Required template fields are ready for draft generation.'}</p>{requiredWarnings.length > 0 && <ul role="alert" className="mt-3 grid gap-2 text-xs leading-5 text-[#8d332b]">{requiredWarnings.slice(0, 6).map((warning) => <li key={warning} className="border-l-2 border-[#d58a7d] pl-2">{readableReadinessWarning(warning)}</li>)}</ul>}{requiredWarnings.some((warning) => /buyer_id_passport|buyer_legal_name/.test(warning)) && <button type="button" onClick={() => { setError(''); setStep('source'); }} className="mt-3 text-xs font-semibold text-[#087f88] underline">Return to client KYC details</button>}</div>{category === 'CLIENT_INVOICE' && <div className="border border-[#c9c5bd] bg-white p-4"><div className="flex justify-between text-xs"><span>Subtotal</span><strong>{fmtKes(invoiceSubtotal)}</strong></div><div className="mt-2 flex justify-between text-xs"><span>Tax</span><strong>{fmtKes(invoiceTax)}</strong></div><div className="mt-3 border-t border-[#e6e2da] pt-3"><div className="flex justify-between"><span className="text-sm font-semibold">Total due</span><strong className="font-serif text-xl text-[#087f88]">{fmtKes(invoiceTotal)}</strong></div><div className="mt-3 h-2 overflow-hidden bg-[#e6e2da]"><div className="h-full bg-[#19a69c]" style={{ width: `${invoiceTotal ? Math.min(100, invoiceSubtotal / invoiceTotal * 100) : 0}%` }} /></div><p className="mt-1 text-[10px] text-slate-400">Subtotal and tax composition</p></div></div>}{projectMapUrl && <a href={projectMapUrl} target="_blank" rel="noreferrer" className="btn-secondary justify-center"><MapPin size={14} /> Open verified project map</a>}</section>
      </div>}
      {step === 'review' && requiredWarnings.length > 0 && <section className="border border-[#e7d3a8] bg-[#fff8e6] p-4"><p className="eyebrow text-[#856b2e]">Draft-only override</p><p className="mt-1 text-xs leading-5 text-slate-600">You may generate a DRAFT for review with missing details. This will not mark the document approved, signed, or complete. Resolve the items above before release.</p><label className="mt-3 flex items-start gap-2 text-xs leading-5 text-[#123b4b]"><input type="checkbox" checked={overrideAcknowledged} onChange={(event) => setOverrideAcknowledged(event.target.checked)} className="mt-1" /><span>I reviewed the listed gaps and understand this document is incomplete and remains a draft.</span></label><label className="mt-3 grid gap-1.5 text-xs text-slate-600"><span className="eyebrow">Reason for generating this incomplete draft (12 characters minimum) *</span><textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} disabled={!overrideAcknowledged} minLength={12} maxLength={1000} rows={2} className="admin-input resize-y disabled:bg-slate-100" placeholder="For example: Client ID scan pending; sending draft to legal for review only." /></label></section>}
    </div>

    {error && <p role="alert" className="border border-[#e4b8ad] bg-[#fff7f4] p-3 text-sm text-[#a55445]">{error}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2ded5] pt-4"><button type="button" onClick={() => stepIndex > 0 && moveStep(steps[stepIndex - 1].id)} disabled={stepIndex === 0 || saving} className="btn-secondary disabled:opacity-40">Back</button><div className="flex gap-2">{stepIndex < steps.length - 1 ? <button type="button" onClick={() => moveStep(steps[stepIndex + 1].id)} className="btn-primary">Continue <ArrowRight size={15} /></button> : <button type="submit" disabled={saving || (requiredWarnings.length > 0 && (!overrideAcknowledged || overrideReason.trim().length < 12))} className="btn-primary disabled:opacity-50">{saving ? 'Generating and recording...' : requiredWarnings.length ? 'Generate incomplete draft' : `Generate ${template.label}`} <FileDown size={15} /></button>}</div></div>
  </form>;
}

// Retained as a compatibility fallback; the active path is the progressive DocumentForm above.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacySmartDocumentForm({ clients, onDone }: { clients: { id: string; full_name: string | null }[]; onDone: (document: AdminDocument) => void }) {
  const [category, setCategory] = useState<DocumentType>('AGREEMENT');
  const [projects, setProjects] = useState<{ id: string; name: string; location: string | null }[]>([]);
  const [payments, setPayments] = useState<{ id: string; amount: number; payment_date: string; reference: string | null; method: string }[]>([]);
  const [clientId, setClientId] = useState('');
  const [data, setData] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const template = DOCUMENT_TEMPLATES[category];

  useEffect(() => { void Promise.all([supabase.from('projects').select('id,name,location').order('name'), supabase.from('buyer_payments').select('id,amount,payment_date,reference,method').order('payment_date', { ascending: false })]).then(([projectResult, paymentResult]) => { setProjects((projectResult.data ?? []) as typeof projects); setPayments((paymentResult.data ?? []) as typeof payments); }); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const errors = template.validate({ ...data, project_id: data.project_id || data.projectId });
    if (!clientId && category !== 'BROCHURE' && category !== 'FLOOR_PLAN') errors.push('A client or customer is required for this document.');
    if (errors.length) { setError(errors.join(' ')); return; }
    setSaving(true); setError('');
    try {
      const numberResponse = await supabase.rpc('next_document_number', { document_kind: category });
      const fallback = documentIdentity(category).documentRef;
      const documentNumber = String(numberResponse.data || fallback);
      const verificationCode = await allocateDocumentVerificationCode();
      const title = `${template.label} · ${String(data.project_name || data.project_id || data.client_name || data.customer_name || 'NBG record')}`;
      const detailText = `${template.label}\n\n${Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join('; ') : String(value ?? '')}`).join('\n')}`;
      const generated = await generateBrandedPdf(category, title, clients.find((client) => client.id === clientId)?.full_name || String(data.client_name || data.customer_name || 'NBG operations'), detailText, String(data.amount || data.total_purchase_price || data.grand_total || ''), documentNumber, verificationCode);
      const fileUrl = await uploadPrivateDocument(generated.blob, `${documentNumber}.pdf`);
      const record = { user_id: clientId || null, is_global: !clientId, recipient_name: clients.find((client) => client.id === clientId)?.full_name || String(data.client_name || data.customer_name || 'NBG operations'), title, category, file_url: fileUrl, document_ref: documentNumber, document_number: documentNumber, document_type: category, version_number: 1, status: 'DRAFT', approval_status: template.workflow.includes('APPROVAL') || template.workflow.includes('LEGAL_REVIEW') || template.workflow.includes('TECHNICAL_REVIEW') ? 'PENDING' : 'NOT_REQUIRED', signature_status: template.workflow.includes('SIGNED') ? 'PENDING' : 'NOT_REQUIRED', project_id: String(data.project_id || '') || null, content_summary: detailText, form_data: data, content_hash: generated.contentHash, verification_code: generated.verificationCode, generated_at: new Date().toISOString(), source_type: 'GENERATED' };
      const { data: saved, error: saveError } = await supabase.from('client_documents').insert(record).select().single();
      if (saveError || !saved) throw new Error(saveError?.message || 'Could not save generated document. Apply the document engine migration first.');
      await supabase.from('document_workflow_events').insert({ document_id: saved.id, action: 'CREATED', to_status: 'DRAFT', comment: `${template.label} generated` });
      onDone(saved as AdminDocument);
    } catch (generationError) { setError(uploadErrorMessage(generationError)); }
    finally { setSaving(false); }
  };

  return <form onSubmit={submit} className="grid gap-4"><DocumentSelect label="Document type" value={category} onChange={(value) => { setCategory(value as DocumentType); setData({}); setError(''); }}>{DOCUMENT_TYPE_OPTIONS.map((option) => <option key={option.type} value={option.type}>{option.label}</option>)}</DocumentSelect><DocumentSelect label="Project / development" value={String(data.project_id || '')} onChange={(value) => setData({ ...data, project_id: value })} required={template.fields.some((field) => field.key === 'project_id')}><option value="">Select project...</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.location || 'Location pending'}</option>)}</DocumentSelect>{category === 'RECEIPT' && <DocumentSelect label="Verified recorded payment" value={String(data.payment_id || '')} onChange={(value) => setData({ ...data, payment_id: value })} required><option value="">Select recorded payment...</option>{payments.map((payment) => <option key={payment.id} value={payment.id}>{payment.method} · {payment.reference || 'No reference'} · {fmtKes(Number(payment.amount))} · {new Date(payment.payment_date).toLocaleDateString()}</option>)}</DocumentSelect>}{!['BROCHURE', 'FLOOR_PLAN'].includes(category) && <DocumentSelect label="Client / customer" value={clientId} onChange={setClientId} required><option value="">Select client...</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.full_name || client.id}</option>)}</DocumentSelect>}<DocumentEngineFields template={template} value={data} onChange={setData} />{error && <p className="text-sm text-[#a55445]">{error}</p>}<button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Generating and recording...' : `Generate ${template.label}`} <FileDown size={15} /></button></form>;
}

// Retained temporarily for backward compatibility with existing saved dashboard state.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyDocumentForm({ clients, onDone }: { clients: { id: string; full_name: string | null }[]; onDone: (document: AdminDocument) => void }) {
  const [category, setCategory] = useState('AGREEMENT');
  const [userId, setUserId] = useState('');
  const [isGlobal, setIsGlobal] = useState(false);
  const [projectId, setProjectId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [saleId, setSaleId] = useState('');
  const [installmentId, setInstallmentId] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [vendorName, setVendorName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankReference, setBankReference] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [documentAmount, setDocumentAmount] = useState('');
  const [currency, setCurrency] = useState('KES');
  const [projects, setProjects] = useState<DocumentProject[]>([]);
  const [units, setUnits] = useState<DocumentUnit[]>([]);
  const [sales, setSales] = useState<DocumentSale[]>([]);
  const [installments, setInstallments] = useState<DocumentInstallment[]>([]);
  const [payments, setPayments] = useState<DocumentPayment[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void Promise.all([
      supabase.from('projects').select('id,name,location,description,amenities,floor_plan_url,brochure_url').eq('is_published', true).order('name'),
      supabase.from('project_units').select('id,project_id,unit_number,type,bedrooms,size,floor,view,price').order('unit_number'),
      supabase.from('sales').select('id,unit_number,buyer_name,sale_price,deposit_amount,status,notes').order('created_at', { ascending: false }),
      supabase.from('buyer_installments').select('id,sale_id,installment_number,due_date,amount,paid_amount,status').order('due_date'),
      supabase.from('buyer_payments').select('id,sale_id,installment_id,amount,payment_date,method,reference').order('payment_date', { ascending: false }),
    ]).then(([projectResult, unitResult, saleResult, installmentResult, paymentResult]) => {
      setProjects((projectResult.data ?? []) as DocumentProject[]); setUnits((unitResult.data ?? []) as DocumentUnit[]); setSales((saleResult.data ?? []) as DocumentSale[]); setInstallments((installmentResult.data ?? []) as DocumentInstallment[]); setPayments((paymentResult.data ?? []) as DocumentPayment[]);
    });
  }, []);

  const selectedProject = projects.find((project) => project.id === projectId);
  const selectedUnit = units.find((unit) => unit.id === unitId);
  const selectedSale = sales.find((sale) => sale.id === saleId);
  const selectedPayment = payments.find((payment) => payment.id === paymentId);
  const projectUnits = units.filter((unit) => !projectId || unit.project_id === projectId);
  const saleInstallments = installments.filter((installment) => installment.sale_id === saleId);
  const constructionCategory = ['QUOTATION', 'PURCHASE_ORDER', 'SUPPLIER_INVOICE', 'PAYMENT_VOUCHER', 'DELIVERY_NOTE', 'CONSTRUCTION_CONTRACT'].includes(category);
  const template = getDocumentTemplate(category);
  const generatedTitle = category === 'RECEIPT' ? `Official receipt · ${selectedPayment?.reference || selectedPayment?.id.slice(0, 8) || 'payment'}` : category === 'FLOOR_PLAN' ? `${selectedProject?.name || 'NBG project'} floor plan${selectedUnit ? ` · Unit ${selectedUnit.unit_number}` : ''}` : category === 'BROCHURE' ? `${selectedProject?.name || 'NBG project'} brochure` : constructionCategory ? `${category.replace(/_/g, ' ')} · ${vendorName || selectedProject?.name || 'NBG construction'}` : `Agreement · ${selectedSale?.buyer_name || 'selected client'}`;
  const recipient = clients.find((client) => client.id === userId)?.full_name || selectedSale?.buyer_name || vendorName || 'NBG operations';
  const amount = category === 'RECEIPT' ? String(selectedPayment?.amount ?? '') : category === 'AGREEMENT' ? String(selectedSale?.sale_price ?? '') : documentAmount;
  const details = category === 'RECEIPT' && selectedPayment ? `Document type: ${category}\nPayment received on ${new Date(selectedPayment.payment_date).toLocaleDateString()} by ${selectedPayment.method}. Reference: ${selectedPayment.reference || 'Not supplied'}.` : category === 'FLOOR_PLAN' ? `Document type: ${category}\n${selectedUnit?.type || 'Residence'} · ${selectedUnit?.bedrooms || 0} bedrooms · ${selectedUnit?.size || 'Size on request'} · Floor ${selectedUnit?.floor || '—'} · ${selectedUnit?.view || 'View on request'}.` : category === 'BROCHURE' ? `Document type: ${category}\n${selectedProject?.description || ''}\nLocation: ${selectedProject?.location || 'Kenya'}\nAmenities: ${(selectedProject?.amenities || []).join(', ') || 'To be confirmed'}\nBrochure media: ${selectedProject?.brochure_url || 'To be published'}` : constructionCategory ? `Document type: ${category}\nDocument number: Generated automatically when issued\nVendor: ${vendorName || 'Not supplied'}\nProject: ${selectedProject?.name || 'NBG construction project'}\nAmount: ${currency} ${amount || 'Not supplied'}\nPayment terms: ${paymentTerms || 'Not supplied'}\nDue date: ${dueDate || 'Not supplied'}\nBank: ${bankName || 'Not supplied'} · Account reference: ${bankReference || 'Not supplied'}` : `Document type: ${category}\nSale status: ${selectedSale?.status || 'Draft'}. Unit: ${selectedSale?.unit_number || selectedUnit?.unit_number || 'To be confirmed'}. Deposit: KSh ${Number(selectedSale?.deposit_amount || 0).toLocaleString()}. ${selectedSale?.notes || ''}`;
  useEffect(() => { if (userId && isGlobal) setIsGlobal(false); }, [userId, isGlobal]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!constructionCategory && !isGlobal && !userId) { setError('Select a client or make this document global.'); return; }
    if ((category === 'AGREEMENT' && !saleId) || ((category === 'BROCHURE' || category === 'FLOOR_PLAN' || constructionCategory) && !projectId) || (category === 'RECEIPT' && !paymentId)) { setError(`Select the relevant ${category === 'RECEIPT' ? 'payment' : category === 'AGREEMENT' ? 'sale' : 'project'} before generating this document.`); return; }
    setSaving(true); setError('');
    try {
      const templateErrors = template?.validate({}) ?? [];
      if (templateErrors.length) { setError(templateErrors.join(' ')); setSaving(false); return; }
      const numberResult = await supabase.rpc('next_document_number', { document_kind: category });
      const documentNumber = String(numberResult.data || documentIdentity(category).documentRef);
      const verificationCode = await allocateDocumentVerificationCode();
      const completeDetails = `${details}\n\nENGINE TEMPLATE DATA\n{}`;
      const generated = await generateBrandedPdf(category, generatedTitle, recipient, completeDetails, amount, documentNumber, verificationCode);
      const file_url = await uploadPrivateDocument(generated.blob, `${generated.documentRef}.pdf`);
      const baseRecord = { user_id: isGlobal || constructionCategory ? null : userId, is_global: isGlobal || constructionCategory, recipient_name: isGlobal || constructionCategory ? (vendorName || 'NBG operations') : recipient, recipient_email: null, source_record_id: saleId || paymentId || unitId || projectId || null, project_id: projectId || null, unit_id: unitId || null, title: generatedTitle, category, file_url, document_ref: generated.documentRef, document_number: generated.documentRef, document_type: category, version_number: 1, status: 'DRAFT', approval_status: 'NOT_REQUIRED', signature_status: 'NOT_REQUIRED', verification_code: generated.verificationCode, content_hash: generated.contentHash, content_summary: completeDetails, form_data: {}, generated_at: new Date().toISOString(), generated_by: null, source_type: 'GENERATED' };
      const metadata = { vendor_name: vendorName || null, payment_terms: paymentTerms || null, bank_name: bankName || null, bank_account_reference: bankReference || null, amount: amount ? Number(amount) : null, currency, due_date: dueDate || null };
      const extended = await supabase.from('client_documents').insert({ ...baseRecord, ...metadata }).select().single();
      const result = extended.error && /column|schema cache/i.test(extended.error.message)
        ? await supabase.from('client_documents').insert(baseRecord).select().single()
        : extended;
      if (result.error || !result.data) throw new Error(result.error?.message || 'Could not save generated document');
      onDone(result.data as AdminDocument);
    } catch (generationError) { setError(uploadErrorMessage(generationError)); notifyAdmin('Document generation failed.', 'error'); }
    finally { setSaving(false); }
  };

  return <form onSubmit={submit} className="grid gap-4"><DocumentSelect label="Document type" value={category} onChange={(value) => { setCategory(value); setSaleId(''); setPaymentId(''); }}><option value="AGREEMENT">Agreement from sale</option><option value="RECEIPT">Receipt from payment</option><option value="QUOTATION">Construction quotation</option><option value="PURCHASE_ORDER">Purchase order</option><option value="SUPPLIER_INVOICE">Supplier invoice</option><option value="PAYMENT_VOUCHER">Payment voucher</option><option value="DELIVERY_NOTE">Material delivery note</option><option value="CONSTRUCTION_CONTRACT">Construction contract</option><option value="BROCHURE">Project brochure</option><option value="FLOOR_PLAN">Floor plan</option></DocumentSelect><label className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={isGlobal} onChange={(event) => setIsGlobal(event.target.checked)} /> Make available globally to all clients</label>{!constructionCategory && <DocumentSelect label="Client" value={userId} onChange={setUserId} required={!isGlobal}><option value="">Select client...</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.full_name || client.id}</option>)}</DocumentSelect>}<DocumentSelect label="Project" value={projectId} onChange={(value) => { setProjectId(value); setUnitId(''); }} required={category === 'BROCHURE' || category === 'FLOOR_PLAN' || constructionCategory}><option value="">Select published project...</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name} · {project.location || 'Location pending'}</option>)}</DocumentSelect>{(category === 'FLOOR_PLAN' || category === 'AGREEMENT') && <DocumentSelect label="Unit" value={unitId} onChange={setUnitId}><option value="">Select unit...</option>{projectUnits.map((unit) => <option key={unit.id} value={unit.id}>Unit {unit.unit_number} · {unit.type || 'Residence'} · {unit.size || 'Size pending'}</option>)}</DocumentSelect>}{category === 'AGREEMENT' && <DocumentSelect label="Sale / agreement source" value={saleId} onChange={(value) => { setSaleId(value); const sale = sales.find((item) => item.id === value); if (sale) setUnitId(units.find((unit) => unit.unit_number === sale.unit_number)?.id || ''); }} required><option value="">Select sale...</option>{sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.buyer_name} · Unit {sale.unit_number} · {fmtKes(sale.sale_price)}</option>)}</DocumentSelect>}{category === 'RECEIPT' && <><DocumentSelect label="Payment" value={paymentId} onChange={(value) => { setPaymentId(value); const payment = payments.find((item) => item.id === value); setSaleId(payment?.sale_id || ''); }} required><option value="">Select payment...</option>{payments.map((payment) => <option key={payment.id} value={payment.id}>{fmtKes(Number(payment.amount))} · {new Date(payment.payment_date).toLocaleDateString()} · {payment.reference || payment.method}</option>)}</DocumentSelect><DocumentSelect label="Installment (optional)" value={installmentId} onChange={setInstallmentId}><option value="">Select installment...</option>{saleInstallments.map((installment) => <option key={installment.id} value={installment.id}>#{installment.installment_number} · {fmtKes(Number(installment.amount))} · {installment.status}</option>)}</DocumentSelect></>}{constructionCategory && <><div className="grid gap-4 sm:grid-cols-2"><AF label="Vendor / payee" value={vendorName} onChange={setVendorName} required /><div className="rounded border border-[#c9c5bd] bg-[#f0ede6] px-3 py-2"><span className="eyebrow block text-slate-400">Document number</span><p className="mt-1 text-sm font-semibold text-[#17232b]">Generated automatically on issue</p></div></div><div className="grid gap-4 sm:grid-cols-2"><AF label="Amount" type="number" value={documentAmount} onChange={setDocumentAmount} required /><DocumentSelect label="Currency" value={currency} onChange={setCurrency}><option>KES</option><option>USD</option><option>EUR</option><option>GBP</option></DocumentSelect></div><div className="grid gap-4 sm:grid-cols-2"><AF label="Payment terms" value={paymentTerms} onChange={setPaymentTerms} placeholder="30 days / on delivery" /><AF label="Due date" type="date" value={dueDate} onChange={setDueDate} /></div><div className="grid gap-4 sm:grid-cols-2"><AF label="Bank name" value={bankName} onChange={setBankName} /><AF label="Bank account / reference" value={bankReference} onChange={setBankReference} /></div></>}{<div className="rounded border border-[#a9d9d8] bg-[#eefbf9] p-4"><p className="eyebrow text-[#087f88]">Generated from selected records</p><p className="mt-2 text-sm font-semibold text-[#123b4b]">{generatedTitle}</p><p className="mt-1 text-xs text-slate-500">Prepared for {recipient}{amount ? ` · ${currency} ${Number(amount).toLocaleString()}` : ''}</p></div>}<p className="text-xs leading-5 text-slate-500">The PDF includes the selected NBG record, document reference, verification code, issue timestamp, SHA-256 hash, and construction payment details classified under the selected document type.</p>{error && <p className="text-sm text-[#a55445]">{error}</p>}<button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Generating secure PDF...' : 'Generate and share PDF'} <FileDown size={15} /></button></form>;
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
  const commission = amount * 0.03;

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
          <StatMini label="Realtor commission (3%)" value={fmtKes(commission)} color="text-[#2e6b3e]" />
        </div>
      </div>
    </div>
  );
}

function AuditTrailTab() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [category, setCategory] = useState('ALL');
  const [action, setAction] = useState('ALL');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(500);
    setLogs((data ?? []) as AuditLog[]); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const categories = Array.from(new Set(logs.map((log) => log.category))).sort();
  const filtered = logs.filter((log) => (category === 'ALL' || log.category === category) && (action === 'ALL' || log.action === action));
  if (loading) return <Spinner />;

  return <div>
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow text-[#20afd1]">Nothing goes unnoticed</p><h2 className="mt-2 font-serif text-4xl">Audit trail</h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">Every operational insert, update, and delete is recorded with its category, actor, timestamp, and data change.</p></div><div className="flex flex-wrap gap-2"><select value={category} onChange={(e) => setCategory(e.target.value)} className="admin-input"><option value="ALL">All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><select value={action} onChange={(e) => setAction(e.target.value)} className="admin-input"><option value="ALL">All actions</option><option>INSERT</option><option>UPDATE</option><option>DELETE</option></select><button onClick={() => exportAuditPdf(filtered, category, action)} className="admin-add-btn flex items-center gap-2"><Download size={14} /> Export PDF</button></div></div>
    <div className="mb-4 grid gap-3 sm:grid-cols-3"><StatMini label="Visible events" value={String(filtered.length)} color="text-[#20afd1]" /><StatMini label="Categories" value={String(categories.length)} color="text-[#856b2e]" /><StatMini label="Latest event" value={logs[0] ? fmt(logs[0].created_at) : '—'} color="text-[#3a6f69]" /></div>
    <div className="overflow-x-auto rounded-lg border border-[#c9c5bd] bg-white shadow-sm"><table className="w-full text-left text-sm"><thead className="border-b border-[#c9c5bd] bg-[#f0ede6] text-[10px] uppercase tracking-[.12em] text-slate-400"><tr>{['Time', 'Category', 'Action', 'Record', 'Actor', 'Details'].map((heading) => <th key={heading} className="px-4 py-3 font-semibold">{heading}</th>)}</tr></thead><tbody>{filtered.map((log) => <tr key={log.id} className="border-b border-[#e6e2da] last:border-0 hover:bg-[#f0ede6]/60"><td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{fmt(log.created_at)}</td><td className="px-4 py-3"><span className="rounded bg-[#d4e8f5] px-2 py-1 text-[9px] font-semibold uppercase tracking-[.1em] text-[#2e5f7a]">{log.category}</span></td><td className="px-4 py-3 text-xs font-semibold text-[#17232b]">{log.action}</td><td className="px-4 py-3 text-xs"><p className="font-medium">{log.entity_label || 'Untitled record'}</p><p className="text-slate-400">{log.entity_type}</p></td><td className="px-4 py-3 text-xs text-slate-500">{log.actor_email || 'anonymous'}</td><td className="max-w-[260px] px-4 py-3 text-xs text-slate-500">{log.action === 'UPDATE' ? 'Previous and new values captured' : log.action === 'INSERT' ? 'Record created' : 'Record deleted'}</td></tr>)}{filtered.length === 0 && <EmptyRow cols={6} text="No audit events match these filters." />}</tbody></table></div>
  </div>;
}

// ─── Projects ────────────────────────────────────────────

function ProjectsTab({ canDelete }: { canDelete: boolean }) {
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
    const { error } = await supabase.from('projects').update({ status }).eq('id', id);
    if (error) { notifyAdmin(error.message, 'error'); await load(); } else notifyAdmin('Project status updated.');
  };

  const togglePublished = async (project: Project) => {
    const is_published = !project.is_published;
    setProjects((p) => p.map((r) => r.id === project.id ? { ...r, is_published } : r));
    const { error } = await supabase.from('projects').update({ is_published }).eq('id', project.id);
    if (error) { notifyAdmin(error.message, 'error'); await load(); } else notifyAdmin(is_published ? 'Project published.' : 'Project unpublished.');
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this project and unlink its units?')) return;
    setProjects((p) => p.filter((project) => project.id !== id));
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) { notifyAdmin(error.message, 'error'); await load(); } else notifyAdmin('Project deleted.');
  };

  if (loading) return <Spinner />;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><p className="text-xs text-slate-400">{projects.length} project{projects.length !== 1 ? 's' : ''}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-[#247b85]"><Upload size={12} /> Add or replace images inside the project editor</p></div>
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
            <div className="mt-4 flex items-center justify-between text-xs"><span className="text-slate-300">Created {fmt(p.created_at)}</span><div className="flex items-center gap-3"><button onClick={() => p.is_published && window.open(`/project/${p.id}`, '_blank', 'noopener,noreferrer')} disabled={!p.is_published} className="flex items-center gap-1 uppercase tracking-[.1em] text-[#247b85] disabled:cursor-not-allowed disabled:text-slate-300"><Eye size={13} /> Preview</button><button onClick={() => togglePublished(p)} className={`flex items-center gap-1 uppercase tracking-[.1em] ${p.is_published ? 'text-[#2e6b3e]' : 'text-slate-400'}`}>{p.is_published ? <Eye size={13} /> : <EyeOff size={13} />}{p.is_published ? 'Live' : 'Hidden'}</button></div></div>
            {canDelete && <button onClick={() => remove(p.id)} className="absolute right-4 bottom-4 text-slate-300 hover:text-[#a55445]" aria-label={`Delete ${p.name}`}><Trash2 size={15} /></button>}
          </div>
        ))}
        {projects.length === 0 && <div className="rounded-lg border border-dashed border-[#b8b4ab] p-12 text-center text-sm text-slate-400">No projects yet.</div>}
      </div>
      <LocationMap title="Portfolio locations" projects={projects.map((project) => ({ ...project }))} />

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
  const [f, setF] = useState({ name: initial?.name ?? '', location: initial?.location ?? '', total_floors: initial?.total_floors?.toString() ?? '', property_category: initial?.property_category ?? 'RESIDENTIAL', payment_policy: initial?.payment_policy ?? 'INSTALLMENTS_OPTIONAL', locality: initial?.locality ?? '', county: initial?.county ?? '', country: initial?.country ?? 'Kenya', latitude: initial?.latitude?.toString() ?? '', longitude: initial?.longitude?.toString() ?? '', map_zoom: initial?.map_zoom?.toString() ?? '14', land_reference: initial?.land_reference ?? '', status: initial?.status ?? 'COMING SOON', description: initial?.description ?? '', is_published: initial?.is_published ?? false, price_min: initial?.price_min?.toString() ?? '', price_max: initial?.price_max?.toString() ?? '', amenities: initial?.amenities?.join(', ') ?? '', floor_plan_url: initial?.floor_plan_url ?? '', brochure_url: initial?.brochure_url ?? '', expected_completion: initial?.expected_completion ?? '' });
  const [image, setImage] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    const total_floors = Number(f.total_floors);
    if (!Number.isInteger(total_floors) || total_floors < 1 || total_floors > 250) { setErr('Enter a whole-number floor count between 1 and 250.'); setSaving(false); return; }
    let image_url: string | null = initial?.image_url ?? null;
    try { if (image) image_url = await uploadPublicMedia(image, 'projects'); } catch (error) { setErr(uploadErrorMessage(error)); setSaving(false); return; }
    const values = { name: f.name, location: f.location || null, total_floors, property_category: f.property_category, payment_policy: f.payment_policy, locality: f.locality || null, county: f.county || null, country: f.country || 'Kenya', latitude: Number(f.latitude) || null, longitude: Number(f.longitude) || null, map_zoom: Number(f.map_zoom) || 14, land_reference: f.land_reference || null, status: f.status, description: f.description || null, image_url, is_published: f.is_published, price_min: f.price_min ? parseMoney(f.price_min) : null, price_max: f.price_max ? parseMoney(f.price_max) : null, amenities: f.amenities.split(',').map((item) => item.trim()).filter(Boolean), floor_plan_url: f.floor_plan_url || null, brochure_url: f.brochure_url || null, expected_completion: f.expected_completion || null };
    const response = initial
      ? await supabase.from('projects').update(values).eq('id', initial.id).select().single()
      : await supabase.from('projects').insert(values).select().single();
    let { data, error } = response;
    if (error && /payment_policy/i.test(error.message)) {
      setSaving(false);
      setErr('Apply the project payment policy migration before saving this setting.');
      return;
    }
    if (error && !/total_floors/i.test(error.message) && /column|schema cache|does not exist/i.test(error.message)) {
      const legacyValues = { name: f.name, location: f.location || null, status: f.status, description: f.description || null, image_url, is_published: f.is_published, price_min: f.price_min ? parseMoney(f.price_min) : null, price_max: f.price_max ? parseMoney(f.price_max) : null, amenities: f.amenities.split(',').map((item) => item.trim()).filter(Boolean), floor_plan_url: f.floor_plan_url || null, brochure_url: f.brochure_url || null, expected_completion: f.expected_completion || null };
      const legacyResponse = initial
        ? await supabase.from('projects').update(legacyValues).eq('id', initial.id).select().single()
        : await supabase.from('projects').insert(legacyValues).select().single();
      data = legacyResponse.data;
      error = legacyResponse.error;
      if (!error) notifyAdmin('Project saved. Apply the portfolio expansion migration to persist locality and map fields.');
    }
    setSaving(false);
    if (error || !data) { setErr(error && /total_floors/i.test(error.message) ? 'Apply the latest Supabase migration to configure project floors before saving.' : error?.message || 'Could not save project. Please try again.'); return; }
    onDone(data as Project);
  };

  return (
    <form onSubmit={submit} className="grid gap-4">
      <AF label="Project Name" value={f.name} onChange={(v) => setF({ ...f, name: v })} required />
      <AF label="Location" value={f.location} onChange={(v) => setF({ ...f, location: v })} />
      <label className="grid gap-1.5 text-xs text-slate-500">Total floors, including ground floor<input required type="number" min="1" max="250" step="1" value={f.total_floors} onChange={(event) => setF({ ...f, total_floors: event.target.value })} className="admin-input" /><span>For example, 12 creates Ground Floor through 11th Floor.</span></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Property category</span><select value={f.property_category} onChange={(e) => setF({ ...f, property_category: e.target.value })} className="admin-input w-full"><option>RESIDENTIAL</option><option>COMMERCIAL</option><option>LAND</option><option>MIXED_USE</option><option>HOSPITALITY</option></select></label><AF label="Locality / neighbourhood" value={f.locality} onChange={(v) => setF({ ...f, locality: v })} /></div>
      <label className="block"><span className="eyebrow mb-1.5 block text-slate-400">Buyer payment policy</span><select value={f.payment_policy} onChange={(event) => setF({ ...f, payment_policy: event.target.value as NonNullable<Project['payment_policy']> })} className="admin-input w-full"><option value="INSTALLMENTS_OPTIONAL">One-time payment or optional installments</option><option value="ONE_TIME_ONLY">One-time payment required</option></select><span className="mt-1 block text-[10px] text-slate-500">Clients see this rule on each unit and it is enforced when a purchase request is submitted.</span></label>
      <div className="grid gap-4 sm:grid-cols-3"><AF label="County" value={f.county} onChange={(v) => setF({ ...f, county: v })} /><AF label="Country" value={f.country} onChange={(v) => setF({ ...f, country: v })} /><AF label="Land reference" value={f.land_reference} onChange={(v) => setF({ ...f, land_reference: v })} /></div>
      <div className="grid gap-4 sm:grid-cols-3"><AF label="Latitude" type="number" value={f.latitude} onChange={(v) => setF({ ...f, latitude: v })} placeholder="-4.0435" /><AF label="Longitude" type="number" value={f.longitude} onChange={(v) => setF({ ...f, longitude: v })} placeholder="39.6682" /><AF label="Map zoom" type="number" value={f.map_zoom} onChange={(v) => setF({ ...f, map_zoom: v })} /></div>
      <div className="grid gap-4 sm:grid-cols-2"><AF label="Price from (KSh)" value={f.price_min} onChange={(v) => setF({ ...f, price_min: v })} currency /><AF label="Price to (KSh)" value={f.price_max} onChange={(v) => setF({ ...f, price_max: v })} currency /></div>
      <AF label="Expected completion" value={f.expected_completion} onChange={(v) => setF({ ...f, expected_completion: v })} placeholder="For example, Q4 2028" />
      <AF label="Amenities" value={f.amenities} onChange={(v) => setF({ ...f, amenities: v })} placeholder="Pool, gym, lounge, secure parking" />
      <AF label="Floor plan URL" value={f.floor_plan_url} onChange={(v) => setF({ ...f, floor_plan_url: v })} placeholder="https://..." />
      <AF label="Brochure URL" value={f.brochure_url} onChange={(v) => setF({ ...f, brochure_url: v })} placeholder="https://..." />
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

function UpdatesTab({ canDelete }: { canDelete: boolean }) {
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
        <div><p className="text-xs text-slate-400">{updates.length} update{updates.length !== 1 ? 's' : ''}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-[#247b85]"><Upload size={12} /> Upload or replace construction photos</p></div>
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
                <button onClick={() => setEditing(u)} className="text-slate-300 hover:text-[#20afd1]" aria-label={`Edit ${u.title}`}><Pencil size={16} /></button>
                {canDelete && <button onClick={() => remove(u.id)} className="text-slate-300 hover:text-[#a55445]" aria-label="Delete"><X size={16} /></button>}
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
  const [f, setF] = useState({ project_id: initial?.project_id ?? '', title: initial?.title ?? '', body: initial?.body ?? '', image_url: initial?.image_url ?? '' });
  const [image, setImage] = useState<File | null>(null);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setSaving(true); setErr('');
    let image_url = f.image_url || null;
    try { if (image) image_url = await uploadPublicMedia(image, 'updates'); } catch (error) { setErr(uploadErrorMessage(error)); setSaving(false); return; }
    const values = {
      project_id: f.project_id || null, title: f.title,
      body: f.body || null, image_url,
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

export function AdminSignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const result = await signIn(email.trim(), password);
      if (result.error) {
        const message = result.error.message.toLowerCase();
        setError(message.includes('email not confirmed') ? 'Confirm your email before signing in.' : 'Sign in failed. Check your email and password, or use password recovery.');
      }
    } catch {
      setError('Sign in could not be completed. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const recover = async () => {
    if (!email) { setError('Enter your email first.'); return; }
    setLoading(true); setError(''); setNotice('');
    const { error: resetError } = await resetPassword(email);
    setLoading(false);
    if (resetError) setError(resetError.message);
    else setNotice('Password recovery email sent. Check your inbox.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0f8f9f] px-5">
      <div className="w-full max-w-md">
        <div className="mb-10 flex flex-col items-center gap-4">
          <span className="brand-mark brand-mark-inverse brand-mark-auth"><img src="/NBG_LOGO-removebg-preview.png" alt="Next Bridge Group" /></span>
          <div className="text-center">
            <p className="text-[11px] font-bold tracking-[.22em] text-white">NEXT BRIDGE</p>
            <p className="text-[9px] tracking-[.22em] text-white/40">GROUP LIMITED · STAFF &amp; ADMIN</p>
          </div>
        </div>
        <div className="rounded-lg bg-[#f0ede6] p-8 shadow-2xl">
          <h1 className="font-serif text-3xl">Sign in</h1>
          <p className="mt-2 text-sm text-slate-500">Sign in to open your assigned NBG workspace.</p>
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <AF label="Email" type="email" value={email} onChange={setEmail} required />
            <AF label="Password" type="password" value={password} onChange={setPassword} required />
            {error && <p className="text-sm text-[#a55445]">{error}</p>}
            {notice && <p className="text-sm text-[#2e6b3e]">{notice}</p>}
            <button disabled={loading} className="btn-primary disabled:opacity-60">{loading ? 'Please wait…' : 'Sign in'} <ArrowRight size={15} /></button>
          </form>
          <button onClick={recover} disabled={loading} className="mt-4 w-full text-center text-xs text-slate-500 hover:text-[#20afd1]">Forgot password? Send recovery email</button>
          <p className="mt-5 text-center text-xs leading-5 text-slate-500">Staff access is created by an Admin/Owner invitation. Client self-registration is available through the <a href="/portal" className="font-semibold text-[#087f88] hover:underline">Client Portal</a>.</p>
        </div>
        <p className="mt-6 text-center text-[9px] uppercase tracking-[.14em] text-white/25">
            Staff accounts can only be created or assigned by an Admin/Owner.
        </p>
      </div>
    </div>
  );
}

// ─── Shared UI primitives ────────────────────────────────

function Spinner() {
  return <div className="flex items-center gap-2 text-sm text-slate-400"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#20afd1] border-t-transparent" />Loading…</div>;
}

function SectionGuide({ guide }: { guide: { purpose: string; source: string; recording: string } }) {
  return <div className="section-guide group relative" tabIndex={0} aria-label="Section guide"><Info size={14} /><div className="section-guide-popover"><p className="eyebrow text-[#20afd1]">How this section works</p><p className="mt-2 text-xs leading-5 text-[#17232b]">{guide.purpose}</p><p className="mt-3 text-[10px] leading-4 text-slate-500"><strong>Data:</strong> {guide.source}</p><p className="mt-1 text-[10px] leading-4 text-slate-500"><strong>Recorded:</strong> {guide.recording}</p></div></div>;
}

function StatMini({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-[#c9c5bd] bg-white p-3 shadow-sm sm:p-4">
      <p className="eyebrow break-words text-slate-400">{label}</p>
      <p className={`mt-2 break-words font-serif text-lg leading-tight sm:text-2xl ${color}`}>{value}</p>
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

function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071116]/60 p-4" onClick={onClose}>
      <div className={`max-h-[94vh] w-full ${wide || title === 'Generate NBG document' ? 'max-w-7xl' : 'max-w-lg'} overflow-y-auto rounded-lg bg-[#f0ede6] p-4 shadow-2xl sm:p-6 lg:p-8`} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 -mx-4 -mt-4 mb-5 flex items-center justify-between border-b border-[#c9c5bd] bg-[#f0ede6]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6 lg:-mx-8 lg:-mt-8 lg:px-8">
          <h2 className="min-w-0 truncate pr-3 font-serif text-xl sm:text-2xl">{title}</h2>
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

function AF({ label, name, type = 'text', value, onChange, required = false, placeholder, currency = false }: { label: string; name?: string; type?: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string; currency?: boolean }) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block text-slate-400">{label}{required ? ' *' : ''}</span>
      {currency ? <CurrencyInput value={value} onChange={onChange} required={required} placeholder={placeholder} className="admin-input w-full" /> : <input type={type} name={name} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} className="admin-input w-full" />}
    </label>
  );
}

function fmt(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}
