import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const staffRoles = ['staff', 'hr', 'leads', 'finance', 'project_manager', 'it'] as const;
type StaffRole = typeof staffRoles[number];

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
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const appUrl = Deno.env.get('APP_URL')?.replace(/\/$/, '');
  if (!authorization?.startsWith('Bearer ')) return response({ error: 'Sign in as an Admin/Owner to invite staff.' }, 401);
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !appUrl) return response({ error: 'Staff invitations are not configured.' }, 503);

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  if (authError || !authData.user) return response({ error: 'Your session has expired. Sign in and try again.' }, 401);
  const { data: canManageRoles, error: roleError } = await caller.rpc('can_manage_dashboard_roles');
  if (roleError || canManageRoles !== true) return response({ error: 'Only an Admin/Owner can invite staff accounts.' }, 403);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return response({ error: 'Invalid invitation details.' }, 400);
  }

  const fullName = String(input.full_name ?? '').trim();
  const email = String(input.email ?? '').trim().toLowerCase();
  const phone = String(input.phone ?? '').trim();
  const requestedRole = String(input.role ?? 'staff');
  if (!fullName || fullName.length > 160 || phone.length > 50 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return response({ error: 'Enter a valid staff name and email address.' }, 400);
  }
  if (email === 'hamisimedu@gmail.com') return response({ error: 'The primary Admin account cannot be invited or reassigned.' }, 400);
  if (!staffRoles.includes(requestedRole as StaffRole)) return response({ error: 'Select a valid staff dashboard role.' }, 400);

  const role = requestedRole as StaffRole;
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: invitation, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/dashboard`,
    data: { full_name: fullName, phone, role },
  });
  if (inviteError || !invitation.user) {
    const message = inviteError?.message || 'The invitation could not be created.';
    const alreadyRegistered = /already (registered|exists)|user exists|duplicate/i.test(message);
    return response({ error: alreadyRegistered ? 'An account already uses this email. Find it under Client accounts and assign the staff role there.' : message }, alreadyRegistered ? 409 : 400);
  }

  const { data: profile, error: profileError } = await admin.from('profiles').upsert({
    id: invitation.user.id,
    role,
    full_name: fullName,
    phone: phone || null,
  }, { onConflict: 'id' }).select('id,full_name,phone,role,created_at').single();
  if (profileError || !profile) {
    return response({ error: 'The invitation was sent, but the staff profile could not be assigned. Ask an Admin/Owner to review the account.' }, 500);
  }

  return response({
    employee: {
      user_id: profile.id,
      full_name: profile.full_name,
      email,
      phone: profile.phone,
      role: profile.role,
      created_at: profile.created_at,
    },
    message: `Staff invitation sent to ${email}.`,
  });
});