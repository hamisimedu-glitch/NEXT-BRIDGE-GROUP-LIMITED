import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'Sign in as finance staff to publish payment receipts.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return response({ error: 'Receipt publishing is not configured.' }, 503);

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return response({ error: 'Your session has expired. Sign in and try again.' }, 401);
  const { data: canManageFinance, error: roleError } = await caller.rpc('can_manage_finance');
  if (roleError || canManageFinance !== true) return response({ error: 'Only authorized finance staff can publish payment receipts.' }, 403);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return response({ error: 'Invalid receipt data.' }, 400);
  }

  const paymentId = String(input.payment_id ?? '');
  const documentNumber = String(input.document_number ?? '').trim().toUpperCase();
  const verificationCode = String(input.verification_code ?? '').trim().toUpperCase();
  const claimedHash = String(input.content_hash ?? '').trim().toLowerCase();
  const pdfBase64 = String(input.pdf_base64 ?? '');
  if (!isUuid(paymentId)) return response({ error: 'A valid payment ID is required.' }, 400);
  if (!/^NBG-RCP-[A-Z0-9-]{5,40}$/.test(documentNumber)) return response({ error: 'A valid receipt document number is required.' }, 400);
  if (!/^NBGV-\d{8}-[A-Z0-9-]{6,40}$/.test(verificationCode)) return response({ error: 'A valid verification code is required.' }, 400);
  if (!/^[a-f0-9]{64}$/.test(claimedHash) || !pdfBase64 || pdfBase64.length > 8_000_000) return response({ error: 'Receipt file data is invalid or too large.' }, 400);

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = Uint8Array.from(atob(pdfBase64), (character) => character.charCodeAt(0));
  } catch {
    return response({ error: 'Receipt PDF encoding is invalid.' }, 400);
  }
  if (pdfBytes.byteLength > 6_000_000 || new TextDecoder().decode(pdfBytes.slice(0, 5)) !== '%PDF-') {
    return response({ error: 'Receipt must be a valid PDF smaller than 6 MB.' }, 400);
  }
  const actualHash = bytesToHex(new Uint8Array(await crypto.subtle.digest('SHA-256', pdfBytes)));
  if (actualHash !== claimedHash) return response({ error: 'Receipt integrity verification failed. Generate it again.' }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: payment, error: paymentError } = await admin.from('buyer_payments')
    .select('id,sale_id,installment_id,amount,payment_date,method,reference,transaction_ref,created_at,notes')
    .eq('id', paymentId)
    .maybeSingle();
  if (paymentError || !payment) return response({ error: 'The recorded payment could not be found.' }, 404);
  if (!payment.transaction_ref || Number(payment.amount) <= 0) return response({ error: 'Only a saved payment with a valid transaction reference can receive a receipt.' }, 409);

  const { data: sale, error: saleError } = await admin.from('sales')
    .select('id,buyer_user_id,buyer_name,buyer_email,unit_id,unit_number')
    .eq('id', payment.sale_id)
    .maybeSingle();
  if (saleError || !sale) return response({ error: 'The sale linked to this payment could not be found.' }, 404);
  if (!sale.buyer_user_id) return response({ error: 'This sale is not linked to a client account. Link the buyer before sharing a receipt.' }, 409);

  const { data: existing, error: existingError } = await admin.from('client_documents')
    .select('id,title,document_ref,verification_code,file_url,user_id,receipt_confirmed_at')
    .eq('source_payment_id', payment.id)
    .maybeSingle();
  if (existingError) return response({ error: `Could not check for an existing receipt: ${existingError.message}` }, 500);
  if (existing) {
    if (existing.user_id !== sale.buyer_user_id) return response({ error: 'An existing receipt is linked to a different client. Contact an Admin/Owner.' }, 409);
    return response({ document: existing, already_generated: true, message: 'A verified receipt already exists for this payment.' });
  }

  const storagePath = `receipts/${sale.id}/${payment.id}.pdf`;
  const { error: storageError } = await admin.storage.from('client-documents').upload(storagePath, pdfBytes, {
    upsert: true,
    contentType: 'application/pdf',
  });
  if (storageError) return response({ error: `Receipt PDF could not be stored: ${storageError.message}` }, 500);

  const title = `Payment receipt · Unit ${sale.unit_number}`;
  const documentRecord = {
    user_id: sale.buyer_user_id,
    is_global: false,
    recipient_name: sale.buyer_name,
    recipient_email: sale.buyer_email,
    title,
    category: 'RECEIPT',
    file_url: storagePath,
    document_ref: documentNumber,
    document_number: documentNumber,
    document_type: 'RECEIPT',
    version_number: 1,
    status: 'ISSUED',
    approval_status: 'PENDING',
    signature_status: 'NOT_REQUIRED',
    project_id: null,
    unit_id: sale.unit_id,
    source_record_id: payment.id,
    source_payment_id: payment.id,
    content_summary: `Automatic payment receipt for transaction ${payment.transaction_ref}, amount ${payment.amount}, received ${payment.payment_date}.`,
    form_data: { sale, payment, auto_generated: true },
    content_hash: actualHash,
    verification_code: verificationCode,
    generated_at: new Date().toISOString(),
    generated_by: authData.user.id,
    created_by: authData.user.id,
    updated_by: authData.user.id,
  };
  const { data: saved, error: saveError } = await admin.from('client_documents').insert(documentRecord)
    .select('id,title,document_ref,verification_code,file_url,user_id,receipt_confirmed_at')
    .single();
  if (saveError || !saved) {
    const { data: winningReceipt } = await admin.from('client_documents')
      .select('id,title,document_ref,verification_code,file_url,user_id,receipt_confirmed_at')
      .eq('source_payment_id', payment.id)
      .maybeSingle();
    if (winningReceipt?.user_id === sale.buyer_user_id) {
      return response({ document: winningReceipt, already_generated: true, message: 'A verified receipt already exists and is available in the client portal.' });
    }
    await admin.storage.from('client-documents').remove([storagePath]);
    return response({ error: `The receipt PDF was created, but its client document could not be saved: ${saveError?.message || 'Unknown database error'}` }, 500);
  }

  await admin.from('document_workflow_events').insert({
    document_id: saved.id,
    action: 'CREATED',
    to_status: 'ISSUED',
    comment: 'Automatically generated from a recorded buyer payment and shared with its linked client.',
    actor_id: authData.user.id,
    actor_email: authData.user.email,
  });
  const { error: notificationError } = await admin.from('client_notifications').insert({
    user_id: sale.buyer_user_id,
    title: 'Payment receipt available',
    body: `Your receipt for Unit ${sale.unit_number} is now available in Documents. Reference ${documentNumber}.`,
    kind: 'PAYMENT_RECEIPT',
    action_url: '/portal?section=resources',
  });

  return response({
    document: saved,
    already_generated: false,
    notification_sent: !notificationError,
    message: notificationError
      ? 'Verified receipt generated and available in the client portal. The notification could not be sent.'
      : 'Verified receipt generated, shared, and the client was notified.',
  });
});
