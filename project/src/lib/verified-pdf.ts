import { GState, jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';

export type VerifiedPdfRow = Record<string, string | number | null | undefined>;

async function sha256(blob: Blob) {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createVerifiedPdf(title: string, documentType: string, rows: VerifiedPdfRow[], _dataSnapshot?: unknown) {
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
    pdf.setFillColor(8, 127, 136);
    pdf.rect(left - 1, 8, right - left + 2, 22, 'F');
    pdf.addImage(logo, 'PNG', left, 11, 18, 18);
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(15); pdf.text('NEXT BRIDGE GROUP LIMITED', 40, 19);
    pdf.setTextColor(206, 249, 250); pdf.setFontSize(7); pdf.text('VERIFIED BUSINESS REPORT', 40, 26);
    pdf.setDrawColor(25, 198, 201); pdf.line(left, 36, right, 36);
  };
  const drawFooter = () => {
    const page = pdf.getCurrentPageInfo().pageNumber;
    pdf.setDrawColor(220, 224, 222); pdf.line(left, footerTop, right, footerTop);
    pdf.setTextColor(90, 86, 77); pdf.setFontSize(7);
    pdf.text(`${documentRef} · Page ${page}`, left, footerTop + 7);
    pdf.text(`Verify: ${verificationCode}`, left, footerTop + 13);
    pdf.addImage(qr, 'PNG', right - 18, footerTop + 1, 18, 18);
  };

  const isStatement = documentType === 'CLIENT_PAYMENT_STATEMENT' && rows.some((row) => Object.prototype.hasOwnProperty.call(row, 'Description'));

  drawWatermark();
  drawHeader();
  pdf.setTextColor(18, 59, 75); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(19);
  const titleLines = pdf.splitTextToSize(title, right - left);
  pdf.text(titleLines, left, 49);
  let y = 49 + titleLines.length * 8 + 4;
  pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(90, 86, 77);
  pdf.text(`Report type: ${documentType.replace(/_/g, ' ')} · Generated: ${new Date().toLocaleString()}`, left, y); y += 6;
  pdf.text(`Document reference: ${documentRef}`, left, y); y += 10;

  if (isStatement) {
    const statementRows = rows as VerifiedPdfRow[];
    const header = ['Payment', 'Due', 'Amount', 'Paid', 'Transaction ID', 'Status'];
    const tableStartY = y + 4;
    const tableWidth = right - left;
    const columnWidths = [48, 18, 24, 24, 43, 21];
    const xPositions = columnWidths.reduce<number[]>((positions, width, index) => [
      ...positions,
      index === 0 ? left : positions[index - 1] + columnWidths[index - 1],
    ], []);

    pdf.setFillColor(13, 59, 75);
    pdf.rect(left, tableStartY, tableWidth, 10, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(6.2);
    header.forEach((label, index) => {
      pdf.text(pdf.splitTextToSize(label, columnWidths[index] - 3), xPositions[index] + 1.5, tableStartY + 6.5);
    });

    pdf.setTextColor(18, 59, 75);
    pdf.setFont('helvetica', 'normal');
    let currentY = tableStartY + 14;

    statementRows.forEach((row, index) => {
      const values = [String(row.Description ?? ''), String(row.Due ?? ''), String(row.Amount ?? '—'), String(row.Paid ?? '—'), String(row.Reference ?? row['Transaction ID'] ?? ''), String(row.Status ?? '')];
      const wrappedValues = values.map((value, columnIndex) => pdf.splitTextToSize(value, columnWidths[columnIndex] - 3));
      const maxLines = Math.max(...wrappedValues.map((value) => value.length));
      const rowHeight = Math.max(10, maxLines * 4.5 + 4);
      if (currentY + rowHeight > footerTop - 12) {
        pdf.addPage(); drawWatermark(); drawHeader(); currentY = 48;
      }
      pdf.setFillColor(index % 2 === 0 ? 246 : 250, 248, 249);
      pdf.rect(left, currentY - 2, tableWidth, rowHeight + 2, 'F');
      pdf.setDrawColor(204, 214, 214); pdf.setLineWidth(0.2);
      pdf.line(left, currentY - 2, right, currentY - 2);
      wrappedValues.forEach((value, columnIndex) => {
        pdf.text(value, xPositions[columnIndex] + 1.5, currentY + 3);
      });
      currentY += rowHeight + 2;
    });
    y = currentY + 12;
  } else {
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
  });
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
