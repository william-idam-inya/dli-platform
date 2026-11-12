import { createClient } from 'npm:@supabase/supabase-js@2.118.0';
import { confirmedInvitationActivation } from './activation-check.mjs';
import { assessPendingInvitation } from './recovery-check.mjs';

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

  // Staff-controlled, scoped recovery: inspect a known registry ID first.
  // Never delete an Auth identity, reissue a token, or make an unlinked
  // identity active automatically. Those cases require manual review.
  const action = typeof input.action === 'string' ? input.action : 'invite';
  if (action === 'inspect_pending' || action === 'recover_pending') {
    const registryId = typeof input.registry_id === 'string' ? input.registry_id : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(registryId)) {
      return response(400, { error: 'Choose a valid pending registry record.' }, origin);
    }
    const { data: record, error: lookupError } = await admin.from('authorised_users')
      .select('id,email,full_name,role,status,auth_user_id')
      .eq('id', registryId).maybeSingle();
    if (lookupError) return response(503, { error: 'Registry could not be inspected.' }, origin);
    if (!record || !record.role) return response(404, { error: 'Record not available.' }, origin);

    const { data: recoveryPermission, error: recoveryPermissionError } = await admin
      .from('role_assignment_policies')
      .select('granted_role')
      .eq('grantor_role', caller.role)
      .eq('granted_role', record.role)
      .maybeSingle();
    if (recoveryPermissionError || !recoveryPermission) {
      return response(403, { error: 'You cannot recover this account role.' }, origin);
    }
    if (record.status !== 'pending') {
      return response(409, {
        error: 'This account is not pending; it will not be changed.',
        recovery_status: 'not_pending',
      }, origin);
    }
    let authUser = null;
    if (record.auth_user_id) {
      const identity = await admin.auth.admin.getUserById(record.auth_user_id);
      if (identity.error) return response(503, { error: 'Auth identity could not be verified.' }, origin);
      authUser = identity.data.user;
    }
    const assessment = assessPendingInvitation(record, authUser);
    if (!assessment.ready) {
      return response(409, {
        error: 'Automated recovery is unsafe for this record. An owner must review it manually.',
        recovery_status: assessment.reason,
      }, origin);
    }
    const { data: profile, error: profileLookupError } = await admin.from('profiles')
      .select('id').eq('id', record.auth_user_id).maybeSingle();
    if (profileLookupError) return response(503, { error: 'Profile could not be inspected.' }, origin);
    if (action === 'inspect_pending') {
      return response(200, {
        recovery_status: 'pending_linked',
        profile_exists: Boolean(profile),
        requires_admin_confirmation: true,
      }, origin);
    }
    if (!profile) {
      const { error: profileCreateError } = await admin.from('profiles')
        .insert({ id: record.auth_user_id, display_name: record.full_name });
      if (profileCreateError) {
        return response(409, { error: 'Profile recovery needs manual review.' }, origin);
      }
    }
    // Audit the attempt before the status change; a failed audit must not
    // silently turn an invitation active. Neither token nor link is logged.
    const { error: recoveryAuditError } = await admin.from('audit_logs').insert({
      actor_id: actor.id,
      subject_id: record.auth_user_id,
      event_type: 'invitation.recovery_attempt',
      details: { registry_id: record.id, manual_delivery_required: true },
    });
    if (recoveryAuditError) return response(503, { error: 'Recovery was not audited; no activation attempted.' }, origin);

    const { data: recovered, error: recoveryError } = await admin.from('authorised_users')
      .update({ status: 'active' })
      .eq('id', record.id).eq('status', 'pending')
      .eq('auth_user_id', record.auth_user_id)
      .select('id').maybeSingle();
    if (recoveryError || !confirmedInvitationActivation(recovered, record.id)) {
      return response(409, { error: 'Recovery activation was not confirmed. Refresh the registry.' }, origin);
    }
    return response(200, {
      recovery_status: 'recovered',
      invitation_url: null,
      delivery_note: 'No invitation link is recovered or regenerated; arrange a separately verified password/invitation link.',
    }, origin);
  }
  if (action !== 'invite') {
    return response(400, { error: 'Unsupported invitation action.' }, origin);
  }

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

  // Reserve the unique email in DLI *before* touching Auth. This makes
  // partial creation identifiable and prevents concurrent duplicate invites.
  // A failed generation deliberately leaves a pending, unbound record for
  // manual review; never delete an unknown Auth identity automatically.
  const { data: created, error: registryError } = await admin
    .from('authorised_users')
    .insert({
      email, auth_user_id: null, full_name: fullName,
      role, status: 'pending', created_by: actor.id,
    })
    .select('id').single();
  if (registryError || !created) {
    return response(registryError?.code === '23505' ? 409 : 500, {
      error: 'Invitation could not be reserved. Review the account registry before retrying.',
    }, origin);
  }

  // Generate only; do not send SMTP from the function.
  const { data: invitation, error: invitationError } = await admin.auth.admin.generateLink({
    type: 'invite', email, options: { redirectTo: `${origin}/set-password` },
  });
  const authUid = invitation?.user?.id;
  const actionLink = invitation?.properties?.action_link;
  if (invitationError || !authUid || !actionLink ||
      invitation.user?.email?.toLowerCase() !== email) {
    return response(409, {
      error: 'Invitation needs an administrator recovery review. Do not retry or reuse a link.',
    }, origin);
  }
  const { data: bound, error: bindingError } = await admin.from('authorised_users')
    .update({ auth_user_id: authUid })
    .eq('id', created.id).eq('status', 'pending')
    .is('auth_user_id', null)
    .select('id').maybeSingle();
  if (bindingError || !confirmedInvitationActivation(bound, created.id)) {
    return response(409, {
      error: 'Identity could not be bound to the reserved invitation. Manual review required.',
    }, origin);
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
  if (activateError) {
    return response(500, {
      error: 'Invitation activation failed. Ask DLI administration to review the pending account. Do not reuse this link.',
    }, origin);
  }
  if (!confirmedInvitationActivation(activated, created.id)) {
    return response(409, {
      error: 'Invitation activation was not confirmed. Ask DLI administration to review the pending account. Do not reuse this link.',
    }, origin);
  }

  // Return the one-time URL only in this response to this verified administrator.
  return response(201, { email, role, invitation_url: actionLink }, origin);
});
