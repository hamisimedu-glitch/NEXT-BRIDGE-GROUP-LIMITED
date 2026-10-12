import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!authorization?.startsWith('Bearer ') || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return response({ error: 'A valid admin session is required.' }, 401);
  }

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
  const { data: authData, error: authError } = await caller.auth.getUser();
  const user = authData.user;
  if (authError || !user || user.email?.trim().toLowerCase() !== 'hamisimedu@gmail.com') {
    return response({ error: 'Only the authorized NBG admin can record dashboard sessions.' }, 403);
  }
  const { data: isAdmin, error: roleError } = await caller.rpc('is_dashboard_admin');
  if (roleError || isAdmin !== true) return response({ error: 'An active admin profile is required.' }, 403);

  let input: { session_id?: string; active?: boolean };
  try {
    input = await request.json();
  } catch {
    return response({ error: 'Invalid session details.' }, 400);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.session_id ?? '')) {
    return response({ error: 'A valid session ID is required.' }, 400);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  if (input.active === false) {
    const { error } = await admin.from('admin_session_presence').delete().eq('session_id', input.session_id).eq('user_id', user.id);
    return error ? response({ error: 'Could not close the admin session.' }, 500) : response({ ok: true });
  }

  const { data: previousPresence } = await admin.from('admin_session_presence')
    .select('region,country')
    .eq('session_id', input.session_id)
    .eq('user_id', user.id)
    .maybeSingle();
  const forwardedIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const clientIp = request.headers.get('cf-connecting-ip') || forwardedIp;
  let region: string | null = previousPresence?.region ?? null;
  let country = previousPresence?.country || request.headers.get('cf-ipcountry') || null;
  if (!previousPresence && clientIp) {
    try {
      const lookup = await fetch(`https://ipapi.co/${encodeURIComponent(clientIp)}/json/`, { signal: AbortSignal.timeout(2500) });
      if (lookup.ok) {
        const location = await lookup.json();
        region = typeof location.region === 'string' ? location.region : null;
        country = typeof location.country_name === 'string' ? location.country_name : country;
      }
    } catch {
      // The country header remains available when the regional lookup is unavailable.
    }
  }

  const { error } = await admin.from('admin_session_presence').upsert({
    session_id: input.session_id,
    user_id: user.id,
    user_email: user.email,
    region,
    country,
    last_seen_at: new Date().toISOString(),
  }, { onConflict: 'session_id,user_id' });
  return error ? response({ error: 'Could not update admin session presence.' }, 500) : response({ ok: true });
});