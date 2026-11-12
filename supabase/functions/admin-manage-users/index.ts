import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

// Stage C account management. All mutations are performed by one audited
// database transaction; raw service keys never reach browser code.
const configuredOrigins = (Deno.env.get('DLI_APP_ORIGINS') || '')
  .split(',').map(value => value.trim()).filter(Boolean);
const productionOrigin = Deno.env.get('SUPABASE_URL') ===
  'https://thoinmwqxmqxrnywjuxq.supabase.co'
  ? ['https://dli-platform-prod.pages.dev']
  : [];
const origins = [...new Set([...productionOrigin, ...configuredOrigins])];
const roles = new Set([
  'owner', 'admin', 'assistant_admin', 'academic_coordinator',
  'finance_officer', 'tutor', 'student',
]);
const actions = new Set(['list', 'audit', 'change_role', 'suspend', 'reactivate', 'revoke']);

function reply(status: number, data: Record<string, unknown>, origin: string) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
      ...(origins.includes(origin) ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      } : {}),
    },
  });
}

function defaultKey(name: string) {
  try {
    const value = JSON.parse(Deno.env.get(name) ?? '{}') as Record<string, string>;
    return value.default;
  } catch { return undefined; }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin') ?? '';
  if (!origins.includes(origin)) return reply(403, { error: 'Origin not authorised.' }, origin);
  if (req.method === 'OPTIONS') return reply(200, { ok: true }, origin);
  if (req.method !== 'POST') return reply(405, { error: 'POST required.' }, origin);

  const url = Deno.env.get('SUPABASE_URL');
  const publicKey = defaultKey('SUPABASE_PUBLISHABLE_KEYS') || Deno.env.get('SUPABASE_ANON_KEY');
  const secretKey = defaultKey('SUPABASE_SECRET_KEYS') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publicKey || !secretKey) {
    return reply(503, { error: 'Server access is not configured.' }, origin);
  }

  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return reply(401, { error: 'Sign-in required.' }, origin);

  const requestClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authError } = await requestClient.auth.getUser(token);
  if (authError || !auth.user?.id || !auth.user.email || !auth.user.email_confirmed_at) {
    return reply(401, { error: 'Verified user session required.' }, origin);
  }
  const actor = auth.user;
  const { data: caller, error: callerError } = await admin.from('authorised_users')
    .select('role,status,email').eq('auth_user_id', actor.id).maybeSingle();
  if (callerError || !caller || caller.status !== 'active' ||
    caller.email !== actor.email.toLowerCase() ||
    !['owner', 'admin', 'assistant_admin'].includes(caller.role)) {
    return reply(403, { error: 'User management is not permitted for this account.' }, origin);
  }

  const raw = await req.text();
  if (raw.length > 4096) return reply(413, { error: 'Request too large.' }, origin);
  let input: Record<string, unknown>;
  try { input = JSON.parse(raw); }
  catch { return reply(400, { error: 'Invalid JSON request.' }, origin); }
  const action = typeof input.action === 'string' ? input.action : '';
  if (!actions.has(action)) return reply(400, { error: 'Unsupported action.' }, origin);

  if (action === 'list') {
    const page = typeof input.page === 'number' && Number.isSafeInteger(input.page) &&
      input.page >= 0 && input.page <= 10000 ? input.page : 0;
    const size = 50;
    const { data: allowed, error: allowedError } = await admin.from('role_assignment_policies')
      .select('granted_role').eq('grantor_role', caller.role);
    if (allowedError) return reply(500, { error: 'Role permissions could not be loaded.' }, origin);

    // requestClient carries the real user's JWT. PostgreSQL RLS determines
    // which registry rows the caller can see, even if this function is bypassed.
    const { data: users, error: listError } = await requestClient.from('authorised_users')
      .select('id,email,full_name,role,status,created_at,updated_at')
      .order('created_at', { ascending: false })
      .range(page * size, page * size + size);
    if (listError) return reply(500, { error: 'Could not load authorised users.' }, origin);

    return reply(200, {
      users: (users ?? []).slice(0, size),
      has_more: (users ?? []).length > size,
      page,
      allowed_roles: (allowed ?? []).map(item => item.granted_role),
    }, origin);
  }

  if (action === 'audit') {
    // Audit RLS permits Owner/Admin and the Assistant Admin's own actions only.
    const { data, error } = await requestClient.from('audit_logs')
      .select('id,actor_id,subject_id,event_type,details,created_at')
      .order('created_at', { ascending: false }).limit(30);
    if (error) return reply(500, { error: 'Could not load the audit trail.' }, origin);
    return reply(200, { events: data ?? [] }, origin);
  }

  const userId = typeof input.user_id === 'string' ? input.user_id : '';
  const newRole = typeof input.role === 'string' ? input.role : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId) ||
      (action === 'change_role' && !roles.has(newRole))) {
    return reply(400, { error: 'Choose a valid user and role.' }, origin);
  }

  const { data: updated, error: updateError } = await admin.rpc('admin_manage_dli_user', {
    p_actor_uid: actor.id,
    p_registry_id: userId,
    p_action: action,
    p_new_role: action === 'change_role' ? newRole : null,
  });
  if (updateError) {
    if (updateError.code === '42501') {
      return reply(403, { error: 'You cannot manage that account or assign the selected role.' }, origin);
    }
    if (updateError.code === '22023' || updateError.message?.includes('last active DLI Owner')) {
      return reply(409, { error: 'This change is not permitted in the account\'s current state.' }, origin);
    }
    return reply(500, { error: 'The account was not updated. Please retry or contact the Founder.' }, origin);
  }
  return reply(200, { user: updated, action }, origin);
});
