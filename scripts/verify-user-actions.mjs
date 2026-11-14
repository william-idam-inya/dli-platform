// Q16 account action regression. No browser, network, users or database writes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registryFailureMessage} from '../src/lib/registryFeedback.ts';

const read = name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const page=read('src/pages/UserManagementPage.tsx');
const dialog=read('src/components/UserActionDialog.tsx');
const css=read('src/styles.css');
const edge=read('supabase/functions/admin-manage-users/index.ts');

assert.match(page,/Save role change/,'role save must be explicit');
assert.match(page,/Unsaved: /,'selected roles must be distinguished from saved roles');
assert.match(page,/Discard selection/,'cancel unsaved role change');
assert.match(page,/requestAction\(user,'change_role'\)/,'click opens a visible confirmation');
assert.match(page,/setPendingAction\(\{user,action,newRole:/);
assert.match(page,/<UserActionDialog/);
assert.match(page,/setDialogError\(await registryFailureMessage\(requestError,data\)\)/);
assert.match(page,/data\.user\.role!==newRole/,'check actual server-confirmed role');
assert.match(page,/setNotice\(success\[action\]\)/,'show success only after server confirms');
assert.match(page,/setSelectedRoles\(current=>\{/,'remove stale staged role');
assert.match(page,/await loadUsers\(true\)/,'refresh registry after save');
assert.match(page,/await loadAudit\(\)/,'refresh audit after save');
assert.match(page,/role="status" aria-live="polite"/);
assert.doesNotMatch(page,/window\.confirm/,'native browser alerts are not discoverable');
assert.doesNotMatch(page,/<section className="user-lifecycle-review"/,'inline confirmation used to appear above scroll');
assert.match(dialog,/createPortal\(/,'dialogs must escape scroll containers');
assert.match(dialog,/document\.body/);
assert.match(dialog,/role="dialog" aria-modal="true"/);
assert.match(dialog,/aria-labelledby="user-modal-title"/);
assert.match(dialog,/event\.key === 'Escape'/);
assert.match(dialog,/event\.key !== 'Tab'/);
assert.match(dialog,/getClientRects\(\)\.length > 0/);
assert.match(dialog,/savingLatest\.current/,'modal must not dismiss during save');
assert.match(dialog,/onConfirm\(reason\.trim\(\)\)/);
assert.match(dialog,/action==='change_role'/);
assert.match(dialog,/subject\.email\.toLowerCase\(\)/);
assert.match(dialog,/reason\.trim\(\)\.length >= 12/);
assert.match(dialog,/Confirm & /);
assert.match(css,/\.user-modal-backdrop\s*\{[\s\S]*?position:fixed;/);
assert.match(css,/\.user-save-role/);
assert.match(css,/\.user-action-toast/);
assert.match(css,/min-height:44px/);
for(const text of [
  "requestClient.auth.getUser(token)",
  "admin_manage_dli_user'",
  "admin_manage_dli_user_lifecycle'",
  "p_new_role: action === 'change_role' ? newRole : null",
]) assert.ok(edge.includes(text),'must retain server authority '+text);
assert.equal(await registryFailureMessage(null,{error:'You cannot manage that account or assign the selected role.'}),
  'You cannot manage that account or assign the selected role.');
assert.match(await registryFailureMessage({context:new Response('{}',{status:409})},null),/status or verification/);
assert.match(await registryFailureMessage({context:new Response('{}',{status:401})},null),/session has expired/);
assert.match(await registryFailureMessage(null,{error:'secret database stack trace'}),/did not confirm/);
console.log('Q16 visible user-action dialogs, explicit role saving, backend result checks and mobile feedback passed offline.');
