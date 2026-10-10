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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'Sign in as NBG staff to invite a client.' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = Deno.env.get('APP_URL')?.replace(/\/$/, '');
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appUrl) {
    return response({ error: 'Client invitations are not configured. Set the Supabase function secrets and APP_URL.' }, 503);
  }

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return response({ error: 'Your staff session has expired. Sign in and try again.' }, 401);
  const { data: isStaff, error: roleError } = await caller.rpc('is_dashboard_staff');
  if (roleError || isStaff !== true) return response({ error: 'Only authorized NBG staff can create client invitations.' }, 403);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return response({ error: 'Invalid invitation details.' }, 400);
  }

  const fullName = String(input.full_name ?? '').trim();
  const email = String(input.email ?? '').trim().toLowerCase();
  const phone = String(input.phone ?? '').trim();
  const identityDocumentType = String(input.identity_document_type ?? '').trim();
  const identityDocumentNumber = String(input.identity_document_number ?? '').trim();
  const residentialAddress = String(input.residential_address ?? '').trim();
  if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !phone || !identityDocumentNumber || !residentialAddress || !['NATIONAL_ID', 'PASSPORT'].includes(identityDocumentType)) {
    return response({ error: 'Enter the client name, valid email, phone, ID type and number, and residential address.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/portal?complete_profile=1`,
    data: { role: 'client', full_name: fullName, phone },
  });
  if (inviteError || !invitation.user) {
    const message = inviteError?.message || 'The invitation could not be created.';
    const alreadyRegistered = /already (registered|exists)|user exists|duplicate/i.test(message);
    return response({ error: alreadyRegistered ? 'An account already uses this email. Refresh the client directory and select the existing account.' : message }, alreadyRegistered ? 409 : 400);
  }

  const clientProfile = {
    id: invitation.user.id,
    role: 'client',
    full_name: fullName,
    phone,
    identity_document_type: identityDocumentType,
    identity_document_number: identityDocumentNumber,
    residential_address: residentialAddress,
    updated_at: new Date().toISOString(),
  };
  const { error: profileError } = await admin.from('profiles').upsert(clientProfile, { onConflict: 'id' });
  if (profileError) return response({ error: `The invitation was sent, but the client profile could not be saved: ${profileError.message}` }, 500);

  return response({
    client: {
      id: invitation.user.id,
      full_name: fullName,
      email,
      phone,
      identity_document_type: identityDocumentType,
      identity_document_number: identityDocumentNumber,
      residential_address: residentialAddress,
      preferred_location: null,
    },
    message: `A secure account setup link was sent to ${email}.`,
  });
});