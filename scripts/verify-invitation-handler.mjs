// Isolated handler-level test of the actual Supabase Edge source. All API calls are
// faked in memory. No credentials, real users, database calls, or invitations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { confirmedInvitationActivation } from '../supabase/functions/admin-create-user/activation-check.mjs';
import { assessPendingInvitation } from '../supabase/functions/admin-create-user/recovery-check.mjs';

const source = readFileSync(new URL('../supabase/functions/admin-create-user/index.ts', import.meta.url), 'utf8');
const javascript = stripTypeScriptTypes(source, { mode: 'strip' })
  .split('\n').filter(line => !/^import\s+/.test(line)).join('\n');
const actorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const guestId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const registryId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const email = 'test-invitation@example.invalid';
const requestOrigin = 'http://localhost:5173';
let state;
let handler;
let clientIndex = 0;

function fresh() {
  return {
    registry: [],
    identities: [],
    profiles: [],
    audits: [],
    fail: '',
    callerRole: 'owner',
    reservationObserved: false,
  };
}

function query(table) {
  const ctx = { operation: 'select', filters: [], values: null, columns: '*' };
  const builder = {
    select(columns) { ctx.columns = columns; return this; },
    eq(key, value) { ctx.filters.push([key,value]); return this; },
    is(key, value) { ctx.filters.push([key,value]); return this; },
    insert(values) { ctx.operation = 'insert'; ctx.values = values; return this; },
    update(values) { ctx.operation = 'update'; ctx.values = values; return this; },
    single() { return Promise.resolve(execute()); },
    maybeSingle() { return Promise.resolve(execute()); },
    then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
  };
  function execute() {
    let rows;
    if(table === 'authorised_users') {
      rows = [...state.registry,
        { id:actorId, auth_user_id:actorId, email:'owner@example.invalid',
          full_name:'Owner Tester', role:state.callerRole,status:'active' }];
    } else if(table === 'role_assignment_policies') {
      rows = state.callerRole === 'owner'
        ? [{grantor_role:'owner',granted_role:'student'}, {grantor_role:'owner',granted_role:'tutor'}]
        : [];
    } else if(table === 'profiles') rows = state.profiles;
    else if(table === 'audit_logs') rows = state.audits;
    else throw new Error('Unmocked table '+table);
    const selected = rows.filter(row => ctx.filters.every(([k,v])=>row[k] === v));
    let failureKey = table+':'+ctx.operation;
    if(table === 'authorised_users' && ctx.operation === 'update') {
      failureKey = ctx.values.auth_user_id ? 'authorised_users:binding' : 'authorised_users:activation';
    }
    if(state.fail === failureKey) {
      state.fail = '';
      return { data: null, error: { code:'MOCK',message:'isolated test failure' } };
    }
    if(state.fail === 'authorised_users:activation-zero' &&
       table === 'authorised_users' && ctx.operation === 'update' && ctx.values.status === 'active') {
      state.fail = '';
      return { data:null, error:null };
    }
    if(ctx.operation === 'select') return { data:selected[0]??null, error:null };
    if(ctx.operation === 'insert') {
      const value = { ...ctx.values };
      if(table === 'authorised_users') {
        value.id = registryId;
        if(state.registry.some(r=>r.email===value.email))return {data:null,error:{code:'23505'}};
        state.registry.push(value);
      } else if(table === 'profiles') {
        if(state.profiles.some(p=>p.id===value.id))return {data:null,error:{code:'23505'}};
        state.profiles.push(value);
      } else if(table === 'audit_logs') state.audits.push(value);
      else throw Error('Unexpected insert '+table);
      return {data:value,error:null};
    }
    if(ctx.operation === 'update') {
      if(selected.length !== 1) return {data:null,error:null};
      const mutable = state.registry.find(row=>row.id===selected[0].id);
      assert.ok(mutable,'only pending registry may be updated');
      Object.assign(mutable, ctx.values);
      return {data:mutable,error:null};
    }
    throw Error('Unhandled query operation '+ctx.operation);
  }
  return builder;
}

function createClient() {
  if(clientIndex++ === 0) {
    return {auth: {getUser:async token => token === 'approved-test-token'
      ? {data:{user:{id:actorId,email:'owner@example.invalid',email_confirmed_at:'2026-11-12'}},error:null}
      : {data:{user:null},error:{message:'test authentication denied'}}}};
  }
  return {
    from:query,
    auth:{admin:{
      generateLink:async ({email:recipient})=>{
        state.reservationObserved = state.registry.some(row =>
          row.email === recipient && row.status === 'pending' && row.auth_user_id === null);
        if(state.fail === 'generateLink'){
          state.fail='';
          return {data:null,error:{message:'isolated Auth generation error'}};
        }
        const existing = state.identities.find(x=>x.email===recipient);
        const user = existing ?? {id:guestId,email:recipient};
        if(!existing)state.identities.push(user);
        return {data:{user,properties:{action_link:'https://example.invalid/mock-one-time-link'}},error:null};
      },
      getUserById:async id=>({
        data:{user:state.identities.find(u=>u.id===id)??null},error:null,
      }),
    }},
  };
}

const env={DLI_APP_ORIGINS:requestOrigin,SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_ANON_KEY:'safe-test-public-key',SUPABASE_SERVICE_ROLE_KEY:'safe-test-service-key'};
const deno={env:{get:name=>env[name]},serve:fn=>{handler=fn;}};
new Function('Deno','createClient','confirmedInvitationActivation','assessPendingInvitation',javascript)(
  deno,createClient,confirmedInvitationActivation,assessPendingInvitation);
assert.equal(typeof handler,'function');

async function invoke(body,{origin=requestOrigin,token='approved-test-token'}={}) {
  clientIndex=0;
  const req=new Request('https://example.supabase.co/functions/v1/admin-create-user',{
    method:'POST',headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify(body),
  });
  const res=await handler(req);
  return {status:res.status,data:await res.json()};
}
function requestBody() {return {email,full_name:'Test Guest',role:'student'};}

state=fresh();
let result=await invoke(requestBody());
assert.equal(result.status,201);
assert.ok(result.data.invitation_url);
assert.equal(state.reservationObserved,true,'Auth generation must occur after email reservation');
assert.equal(state.registry.length,1);
assert.equal(state.registry[0].status,'active');
assert.equal(state.registry[0].auth_user_id,guestId);
assert.equal(state.profiles.length,1);
assert.equal(state.audits.length,1);
assert.equal((await invoke(requestBody())).status,409,'duplicate invitations blocked');

state=fresh();
state.fail='generateLink';
result=await invoke(requestBody());
assert.equal(result.status,409);
assert.ok(!result.data.invitation_url);
assert.equal(state.registry[0].status,'pending');
assert.equal(state.registry[0].auth_user_id,null);
result=await invoke({action:'inspect_pending',registry_id: registryId});
assert.equal(result.status,409);
assert.equal(result.data.recovery_status,'unbound_identity');

for(const failedStep of ['profiles:insert','audit_logs:insert','authorised_users:activation-zero']) {
  state=fresh();
  state.fail=failedStep;
  result=await invoke(requestBody());
  assert.notEqual(result.status,201,'failed stage should never expose invitation: '+failedStep);
  assert.ok(!result.data.invitation_url,'no link on failed '+failedStep);
  assert.equal(state.registry[0].status,'pending');
  assert.equal(state.registry[0].auth_user_id,guestId);
  const inspect=await invoke({action:'inspect_pending',registry_id: registryId});
  assert.equal(inspect.status,200,failedStep);
  assert.equal(inspect.data.recovery_status,'pending_linked');
  const recovered=await invoke({action:'recover_pending',registry_id: registryId});
  assert.equal(recovered.status,200,failedStep);
  assert.equal(recovered.data.recovery_status,'recovered');
  assert.equal(recovered.data.invitation_url,null);
  assert.equal(state.registry[0].status,'active');
  assert.ok(state.audits.some(a=>a.event_type==='invitation.recovery_attempt'));
  assert.equal((await invoke({action:'recover_pending',registry_id: registryId})).status,409,
    'recovery must not reactivate an already active record');
}

state=fresh();
state.fail='profiles:insert';
await invoke(requestBody());
state.identities[0].email='mismatch@example.invalid';
assert.equal((await invoke({action:'recover_pending',registry_id: registryId})).status,409);
assert.equal(state.registry[0].status,'pending');

state=fresh();
state.callerRole='student';
assert.equal((await invoke(requestBody())).status,403,'role policy is authoritative');
assert.equal(state.registry.length,0);

state=fresh();
assert.equal((await invoke(requestBody(),{origin:'https://unapproved.example.invalid'})).status,403);
assert.equal((await invoke(requestBody(),{token:'bad'})).status,401);
assert.equal(state.registry.length,0);

console.log('DLI isolated invitation handler checks passed: registration, partial failures, guarded recovery and role/origin denial.');
