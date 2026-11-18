#!/usr/bin/env node
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const sql=read('supabase/migrations/20261118142142_stage_q64_platform_media_scope_secure_view.sql');
const component=read('src/components/SearchBarWithMediaScope.tsx');
const pagination=read('supabase/migrations/20261118144058_stage_q64b_platform_media_pagination.sql');
const css=read('src/components/SearchBarWithMediaScope.css');
const legacy=read('src/components/GlobalSearch.tsx');
for(const token of [
 'with (security_invoker = true)','public.platform_media_index',
 'platform_media_search','platform_media_facets',
 'revoke all on public.platform_media_index from public, anon',
 'grant select on public.platform_media_index to authenticated',
 'public.platform_media_revision',
 'public.dli_direct_messages','m.deleted_at is null',
 's.is_ready','s.is_published','private.platform_media_touch_revision',
 'alter publication supabase_realtime add table',
])assert.ok(sql.includes(token),'Missing secure indexed search: '+token);
for(const token of ['platform_media_search_page','security invoker','p_offset integer',
 'p_scope text','p_term text','to authenticated']){
 assert.ok(pagination.includes(token),'Q64b paginated security invoker search regression: '+token);
}
for(const excluded of [
 "'storage://dli-member-avatars'",
 "'storage://dli-payment-proofs'","'storage://dli-enrolment-proofs'",
 "'storage://dli-tutor-payout-proofs'",
])assert.ok(!sql.includes(excluded),'Private document indexed: '+excluded);
for(const token of [
 'aria-haspopup="menu"','role="menuitemradio"',
 'onClick={()=>selectScope(null)}',"event.key==='Backspace'",
 'p_scope:scope','platform_media_facets','platform_media_search',
 'platform_media_revision','window.setInterval','storage_path',
 'platform_media_search_page','p_offset:priorCount','setHasMore','Load more media',
 '.download(record.storage_path)','URL.revokeObjectURL',
 "aria-label={'Media type:","scope?'Search '+scope",
])assert.ok(component.includes(token),'Media bar regression: '+token);
for(const token of ['.dli-media-scope-trigger','.dli-media-scope-menu',
 '.dli-media-search-results','.dli-media-preview','@media(max-width:390px)'])
 assert.ok(css.includes(token),'Missing responsive media menu style: '+token);
for(const token of [
 "rpc('dli_people_directory')","from('courses')","from('cohorts')",
 "from('teaching_classes')","from('dli_direct_messages')",
 'canAccessPath(role,path,tier)','SearchBarWithMediaScope',
])assert.ok(legacy.includes(token),'Existing global search lost: '+token);
console.log('Q64: secure view source joins, private files, dynamic facets, input scope and legacy search verified.');
