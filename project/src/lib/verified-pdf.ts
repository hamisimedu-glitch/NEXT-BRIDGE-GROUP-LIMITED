import { GState, jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';

export type VerifiedPdfRow = Record<string, string | number | null | undefined>;
export type VerifiedPdfStatementContext = {
  accountHolder: string;
  accountEmail: string;
  project: string;
  unit: string;
  statementDate: string;
  periodStart: string;
  periodEnd: string;
  scheduledTotal: number;
  paidTotal: number;
  balance: number;
};

async function sha256(blob: Blob) {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createVerifiedPdf(title: string, documentType: string, rows: VerifiedPdfRow[], _dataSnapshot?: unknown, purchaseSaleId?: string, statementContext?: VerifiedPdfStatementContext) {
  const { data: reservedCode, error: reserveError } = await supabase.rpc('reserve_export_verification_code');
  if (reserveError || !reservedCode) throw new Error(reserveError?.message || 'Could not reserve a verification code. Apply the verified PDF exports migration first.');
  const verificationCode = String(reservedCode);

  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const documentRef = `NBG-${documentType.slice(0, 4).toUpperCase()}-${day}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const verificationUrl = `${window.location.origin}/verify/${encodeURIComponent(verificationCode)}`;
  const [logo, qr] = await Promise.all([
    fetch('/NBG_LOGO-removebg-preview.png').then((response) => response.blob()).then((blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onloadend = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('The NBG logo could not be loaded.')); reader.readAsDataURL(blob); })),
    QRCode.toDataURL(verificationUrl, { errorCorrectionLevel: 'M', margin: 1, width: 256 }),
  ]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const left = 16;
  const right = 194;
  const footerTop = 270;
  const drawWatermark = () => {
    pdf.setGState(new GState({ opacity: 0.07 }));
    pdf.addImage(logo, 'PNG', 65, 104, 80, 80);
    pdf.setGState(new GState({ opacity: 1 }));
  };
  const drawHeader = () => {
    pdf.addImage(logo, 'PNG', left, 10, 16, 16);
    pdf.setTextColor(31, 58, 52); pdf.setFont('times', 'bold'); pdf.setFontSize(12); pdf.text('NEXT BRIDGE GROUP LIMITED', 36, 16);
    pdf.setTextColor(93, 102, 99); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.text('BUILDING HOMES · CREATING LEGACIES', 36, 22);
    pdf.setDrawColor(31, 58, 52); pdf.setLineWidth(.55); pdf.line(left, 34, right, 34);
    pdf.setDrawColor(176, 141, 87); pdf.setLineWidth(.2); pdf.line(left, 35.5, right, 35.5);
  };
  const drawFooter = () => {
    const page = pdf.getCurrentPageInfo().pageNumber;
    pdf.setDrawColor(31, 58, 52); pdf.setLineWidth(.45); pdf.line(left, footerTop, right, footerTop);
    pdf.setDrawColor(176, 141, 87); pdf.setLineWidth(.2); pdf.line(left, footerTop + 1.5, right, footerTop + 1.5);
    pdf.addImage(logo, 'PNG', left, footerTop + 4, 11, 11);
    pdf.setTextColor(93, 102, 99); pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5);
    pdf.text(`${documentRef} · Page ${page}`, left + 15, footerTop + 8);
    pdf.text(`Verify: ${verificationCode}`, left + 15, footerTop + 13);
    pdf.addImage(qr, 'PNG', right - 15, footerTop + 3, 15, 15);
  };

  const isStatement = documentType === 'CLIENT_PAYMENT_STATEMENT' && rows.some((row) => Object.prototype.hasOwnProperty.call(row, 'Description'));

  if (isStatement) {
    const statementRows = rows as VerifiedPdfRow[];
      const context = statementContext ?? {
        accountHolder: 'NBG client', accountEmail: '', project: 'Not specified', unit: 'Not specified',
        statementDate: new Date().toLocaleDateString(), periodStart: 'Not specified', periodEnd: 'Not specified',
        scheduledTotal: 0, paidTotal: 0, balance: 0,
      };
      pdf.setProperties({ title, subject: 'Verified client payment statement', author: 'Next Bridge Group Limited', creator: 'NBG Client Portal' });
      drawWatermark();
      drawHeader();
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(18); pdf.setTextColor(16, 39, 68);
      pdf.text('CLIENT ACCOUNT STATEMENT', left, 48);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(83, 107, 131);
      pdf.text('PAYMENT HISTORY AND OUTSTANDING BALANCE', left, 54);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(7); pdf.setTextColor(8, 127, 136);
      pdf.text('STATEMENT DATE', right, 47, { align: 'right' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(16, 39, 68);
      pdf.text(context.statementDate, right, 53, { align: 'right' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7); pdf.setTextColor(83, 107, 131);
      pdf.text(`Document reference: ${documentRef}`, right, 59, { align: 'right' });

      const detailTop = 64;
      pdf.setFillColor(245, 249, 252); pdf.setDrawColor(220, 231, 239); pdf.setLineWidth(0.25);
      pdf.roundedRect(left, detailTop, right - left, 25, 2, 2, 'FD');
      const details = [
        ['ACCOUNT HOLDER', context.accountHolder],
        ['ACCOUNT EMAIL', context.accountEmail || 'Not provided'],
        ['PROJECT / UNIT', [context.project, context.unit].filter(Boolean).join(' · ') || 'Not specified'],
        ['STATEMENT PERIOD', `${context.periodStart} to ${context.periodEnd}`],
      ];
      details.forEach(([label, value], index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        const x = left + 5 + column * 88;
        const y = detailTop + 7 + row * 11;
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.8); pdf.setTextColor(94, 116, 136);
        pdf.text(label, x, y);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.4); pdf.setTextColor(25, 52, 77);
        pdf.text(pdf.splitTextToSize(value, 80), x, y + 4);
      });

      const summaryTop = 95;
      const tableWidth = right - left;
      const cardGap = 3;
      const cardWidth = (tableWidth - cardGap * 2) / 3;
      const summaryCards = [
        { label: 'SCHEDULED', value: context.scheduledTotal, fill: [240, 247, 252] },
        { label: 'PAYMENTS RECEIVED', value: context.paidTotal, fill: [235, 249, 243] },
        { label: 'OUTSTANDING BALANCE', value: context.balance, fill: [255, 247, 234] },
      ];
      summaryCards.forEach((card, index) => {
        const x = left + index * (cardWidth + cardGap);
        pdf.setFillColor(card.fill[0], card.fill[1], card.fill[2]);
        pdf.setDrawColor(225, 233, 238);
        pdf.roundedRect(x, summaryTop, cardWidth, 19, 2, 2, 'FD');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.8); pdf.setTextColor(82, 105, 126);
        pdf.text(card.label, x + 4, summaryTop + 6);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10); pdf.setTextColor(16, 39, 68);
        pdf.text(`KES ${Number(card.value).toLocaleString('en-KE')}`, x + 4, summaryTop + 14);
      });

      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(16, 39, 68);
      pdf.text('TRANSACTION LEDGER', left, 123);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(96, 116, 134);
      pdf.text(`${statementRows.length} scheduled item${statementRows.length === 1 ? '' : 's'}`, right, 123, { align: 'right' });

      const header = ['VALUE DATE', 'PAYMENT / REFERENCE', 'SCHEDULED (KES)', 'RECEIVED (KES)', 'BALANCE (KES)', 'STATUS'];
      const columnWidths = [22, 55, 27, 27, 27, 20];
      const xPositions = columnWidths.reduce<number[]>((positions, width, index) => [
        ...positions,
        index === 0 ? left : positions[index - 1] + columnWidths[index - 1],
      ], []);
      const drawTableHeader = (top: number) => {
        pdf.setFillColor(16, 39, 68);
        pdf.rect(left, top, tableWidth, 9, 'F');
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.7); pdf.setTextColor(255, 255, 255);
        header.forEach((label, index) => pdf.text(label, xPositions[index] + 2, top + 5.8));
        return top + 9;
      };

      let currentY = drawTableHeader(127);
      statementRows.forEach((row, index) => {
        const scheduled = Number(row.Amount ?? row.Scheduled ?? 0) || 0;
        const received = Number(row.Paid ?? row.Received ?? 0) || 0;
        const balance = Math.max(0, scheduled - received);
        const dateValue = String(row.Due ?? row.Date ?? '');
        const dateLabel = dateValue && dateValue !== '—' ? new Date(`${dateValue.slice(0, 10)}T00:00:00`).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not set';
        const description = String(row.Description ?? row.Payment ?? 'Scheduled payment');
        const reference = String(row.Reference ?? row['Transaction ID'] ?? '');
        const detailsText = [description, reference ? `Ref: ${reference}` : ''].filter(Boolean).join('\n');
        const detailLines = pdf.splitTextToSize(detailsText, columnWidths[1] - 4);
        const rowHeight = Math.max(10, detailLines.length * 3.6 + 3.5);
        if (currentY + rowHeight > footerTop - 30) {
          pdf.addPage(); drawWatermark(); drawHeader();
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9); pdf.setTextColor(16, 39, 68);
          pdf.text('TRANSACTION LEDGER · CONTINUED', left, 45);
          currentY = drawTableHeader(49);
        }
        pdf.setFillColor(index % 2 === 0 ? 249 : 255, index % 2 === 0 ? 251 : 255, index % 2 === 0 ? 253 : 255);
        pdf.rect(left, currentY, tableWidth, rowHeight, 'F');
        pdf.setDrawColor(228, 235, 240); pdf.setLineWidth(0.2);
        pdf.line(left, currentY + rowHeight, right, currentY + rowHeight);
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.5); pdf.setTextColor(42, 64, 86);
        pdf.text(dateLabel, xPositions[0] + 2, currentY + 5.5);
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.5); pdf.setTextColor(25, 52, 77);
        pdf.text(detailLines[0] || '', xPositions[1] + 2, currentY + 4.5);
        if (detailLines.length > 1) {
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(5.8); pdf.setTextColor(96, 116, 134);
          pdf.text(detailLines.slice(1), xPositions[1] + 2, currentY + 8);
        }
        const amounts = [scheduled, received, balance];
        amounts.forEach((amount, amountIndex) => {
          const columnIndex = amountIndex + 2;
          pdf.setFont('helvetica', amountIndex === 2 && balance > 0 ? 'bold' : 'normal');
          pdf.setFontSize(6.5);
          pdf.setTextColor(amountIndex === 2 && balance > 0 ? 150 : 42, amountIndex === 2 && balance > 0 ? 72 : 64, amountIndex === 2 && balance > 0 ? 24 : 86);
          pdf.text(amount.toLocaleString('en-KE'), xPositions[columnIndex] + columnWidths[columnIndex] - 2, currentY + 5.5, { align: 'right' });
        });
        const status = String(row.Status ?? 'PENDING').replace(/_/g, ' ').toUpperCase();
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(5.8);
        pdf.setTextColor(status === 'PAID' ? 0 : status === 'OVERDUE' ? 179 : 153, status === 'PAID' ? 132 : status === 'OVERDUE' ? 66 : 105, status === 'PAID' ? 91 : status === 'OVERDUE' ? 61 : 24);
        pdf.text(pdf.splitTextToSize(status, columnWidths[5] - 3), xPositions[5] + 2, currentY + 5.5);
        currentY += rowHeight;
      });

      if (statementRows.length === 0) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(96, 116, 134);
        pdf.text('No payment schedule items were available for this statement period.', left + 3, currentY + 8);
      }
      const noteY = Math.min(Math.max(currentY + 8, 151), footerTop - 20);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(6.3); pdf.setTextColor(91, 105, 118);
      const note = 'Prepared from Next Bridge Group records. This is a client account statement, not a bank-issued statement or proof of funds. Payments remain subject to verification and posting by NBG.';
      pdf.text(pdf.splitTextToSize(note, right - left), left, noteY);
    } else {
      drawWatermark();
      drawHeader();
      pdf.setTextColor(18, 59, 75); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(19);
      const titleLines = pdf.splitTextToSize(title, right - left);
      pdf.text(titleLines, left, 49);
      let y = 49 + titleLines.length * 8 + 4;
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(90, 86, 77);
      pdf.text(`Report type: ${documentType.replace(/_/g, ' ')} · Generated: ${new Date().toLocaleString()}`, left, y); y += 6;
      pdf.text(`Document reference: ${documentRef}`, left, y); y += 10;

      rows.forEach((row, index) => {
        const entries = Object.entries(row);
        const rowLines = entries.flatMap(([label, value]) => pdf.splitTextToSize(`${label}: ${String(value ?? '—')}`, right - left - 8));
        const blockHeight = rowLines.length * 4 + 8;
        if (y + blockHeight > footerTop - 5) {
          pdf.addPage(); drawWatermark(); drawHeader(); y = 48;
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(90, 86, 77);
        }
        pdf.setFillColor(index % 2 ? 255 : 246, index % 2 ? 255 : 248, index % 2 ? 255 : 245);
        pdf.rect(left, y - 3, right - left, blockHeight, 'F');
        pdf.setTextColor(13, 64, 85); pdf.setFont('helvetica', 'bold'); pdf.text(`${index + 1}.`, left + 3, y + 1);
        pdf.setTextColor(45, 55, 60); pdf.setFont('helvetica', 'normal');
        pdf.text(rowLines, left + 11, y + 1);
        y += blockHeight + 3;
      });
    }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) { pdf.setPage(page); drawFooter(); }
  const blob = pdf.output('blob');
  const contentHash = await sha256(blob);
  const { error: registrationError } = await supabase.rpc('register_export_verification', {
    p_verification_code: verificationCode,
    p_title: title,
    p_category: documentType,
    p_document_ref: documentRef,
    p_content_hash: contentHash,
    p_purchase_sale_id: purchaseSaleId ?? null,
  });
  if (registrationError?.code === 'PGRST202') {
    throw new Error('NBG’s quotation-verification migration is not active yet. Ask the administrator to apply the latest Supabase migrations, then retry the PDF download.');
  }
  if (registrationError) throw new Error(`The PDF was created but its verification record could not be registered: ${registrationError.message}`);
  return { blob, verificationCode, documentRef };
}

export function downloadPdf(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
