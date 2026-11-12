import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

// No service/secret key is ever delivered to the browser or recorded in an audit log.
// This is the minimal invitation issuer for Stage B. Stage C adds full user management.
const allowedRoles = new Set([
  'owner','admin','assistant_admin','academic_coordinator',
  'finance_officer','tutor','student',
]);
const allowedOrigins = (Deno.env.get('DLI_APP_ORIGINS') || 'http://localhost:5173')
  .split(',').map((part) => part.trim()).filter(Boolean);

function response(status: number, body: Record<string, unknown>, origin?: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'Vary': 'Origin',
      ...(origin && allowedOrigins.includes(origin) ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      } : {}),
    },
  });
}

function defaultKey(variableName: string): string | undefined {
  try {
    const keys = JSON.parse(Deno.env.get(variableName) ?? '{}') as Record<string, string>;
    return keys.default;
  } catch {
    return undefined;
  }
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin') ?? '';
  if (!allowedOrigins.includes(origin)) {
    return response(403, { error: 'This application origin is not permitted.' });
  }
  if (request.method === 'OPTIONS') return response(200, { ok: true }, origin);
  if (request.method !== 'POST') return response(405, { error: 'POST required.' }, origin);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const publicKey = defaultKey('SUPABASE_PUBLISHABLE_KEYS') ||
    Deno.env.get('SUPABASE_ANON_KEY');
  const adminKey = defaultKey('SUPABASE_SECRET_KEYS') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !publicKey || !adminKey) {
    return response(503, { error: 'Server authentication is not configured.' }, origin);
  }

  const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return response(401, { error: 'Sign in is required.' }, origin);

  const publicClient = createClient(supabaseUrl, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authenticationError } = await publicClient.auth.getUser(bearer);
  if (authenticationError || !auth.user?.id || !auth.user.email_confirmed_at) {
    return response(401, { error: 'Your verified session is required.' }, origin);
  }

  const actor = auth.user;
  const { data: caller, error: callerError } = await admin
    .from('authorised_users')
    .select('role,status,email')
    .eq('auth_user_id', actor.id)
    .maybeSingle();

  if (callerError || !caller || caller.status !== 'active' ||
      caller.email !== actor.email?.toLowerCase()) {
    return response(403, { error: 'Your DLI account is not authorised.' }, origin);
  }

  const raw = await request.text();
  if (raw.length > 4096) return response(413, { error: 'Request too large.' }, origin);
  let input: Record<string, unknown>;
  try { input = JSON.parse(raw); }
  catch { return response(400, { error: 'Invalid request body.' }, origin); }

  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const fullName = typeof input.full_name === 'string' ? input.full_name.trim() : '';
  const role = typeof input.role === 'string' ? input.role : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      fullName.length < 1 || fullName.length > 160 ||
      !allowedRoles.has(role)) {
    return response(400, { error: 'Valid email, name and role are required.' }, origin);
  }

  const { data: permission, error: permissionError } = await admin
    .from('role_assignment_policies')
    .select('granted_role')
    .eq('grantor_role', caller.role)
    .eq('granted_role', role)
    .maybeSingle();
  if (permissionError || !permission) {
    return response(403, { error: 'You may not assign that role.' }, origin);
  }

  const { data: duplicate, error: duplicateError } = await admin
    .from('authorised_users').select('id').eq('email', email).maybeSingle();
  if (duplicateError) return response(500, { error: 'Could not check the authorised-user registry.' }, origin);
  if (duplicate) return response(409, { error: 'That email is already recorded in DLI.' }, origin);

  // Generate only; do not send SMTP from the function.
  const { data: invitation, error: invitationError } = await admin.auth.admin.generateLink({
    type: 'invite', email, options: { redirectTo: `${origin}/set-password` },
  });
  const authUid = invitation?.user?.id;
  const actionLink = invitation?.properties?.action_link;
  if (invitationError || !authUid || !actionLink) {
    return response(500, { error: 'Could not generate the invitation link.' }, origin);
  }

  // Fail closed: registry remains pending until profile and audit are written.
  const { data: created, error: registryError } = await admin
    .from('authorised_users')
    .insert({
      email, auth_user_id: authUid, full_name: fullName,
      role, status: 'pending', created_by: actor.id,
    })
    .select('id')
    .single();
  if (registryError || !created) {
    return response(500, { error: 'Invitation requires administrator review. Do not reuse this link.' }, origin);
  }

  const { error: profileError } = await admin
    .from('profiles').insert({ id: authUid, display_name: fullName });
  if (profileError) {
    return response(500, { error: 'Profile creation failed. Ask DLI administration to review the pending account.' }, origin);
  }

  const { error: auditError } = await admin
    .from('audit_logs')
    .insert({
      actor_id: actor.id,
      subject_id: authUid,
      event_type: 'invitation.created',
      details: { role, manual_delivery_required: true },
    });
  if (auditError) {
    return response(500, { error: 'Audit logging failed. Account remains pending.' }, origin);
  }

  // An UPDATE that matches zero rows is not an error in PostgREST.
  // Verify the pending record really transitioned before returning the
  // one-time link; otherwise an invitation could be reported as usable
  // while the intended account has no active DLI membership.
  const { data: activated, error: activateError } = await admin
    .from('authorised_users')
    .update({ status: 'active' })
    .eq('id', created.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (activateError || activated?.id !== created.id) {
    return response(409, {
      error: 'Invitation activation was not confirmed. Ask DLI administration to review the pending account. Do not reuse this link.',
    }, origin);
  }

  // Return the one-time URL only in this response to this verified administrator.
  return response(201, { email, role, invitation_url: actionLink }, origin);
});
