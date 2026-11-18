import {useCallback} from 'react';
import {useAuth} from '../auth/AuthProvider';
import {canAccessPath} from '../auth/permissions';
import {supabase} from '../lib/supabase';
import SearchBarWithMediaScope,{type NavigationHit} from './SearchBarWithMediaScope';

// Retain legacy global navigation matches alongside new role-filtered media.
const clean=(s:string)=>s.trim().replace(/[^\p{L}\p{N}\s-]/gu,'').slice(0,70);
export default function GlobalSearch(){
 const {account}=useAuth();
 const role=account?.role,tier=account?.studentTier??'free';
 const loadNavigationMatches=useCallback(async(term:string):Promise<NavigationHit[]>=>{
  if(!supabase||!role||clean(term).length<2)return [];
  const q=clean(term),like='%'+q+'%';
  const permitted=(path:string)=>canAccessPath(role,path,tier);
  const jobs:PromiseLike<NavigationHit[]>[]=[];
  if(permitted('/people'))jobs.push(supabase.rpc('dli_people_directory').then(({data,error})=>
   error||!Array.isArray(data)?[]:data.filter(row=>
     typeof row.full_name==='string'&&row.full_name.toLowerCase().includes(q.toLowerCase()))
     .slice(0,6).map(row=>({kind:'person' as const,id:row.user_id,
       title:row.full_name,detail:'Member · '+String(row.member_role??'DLI'),to:'/people'}))));
  if(permitted('/academics'))jobs.push(supabase.from('courses').select('id,title')
   .ilike('title',like).limit(5).then(({data,error})=>error?[]:(data??[]).map(row=>({
    kind:'course' as const,id:row.id,title:row.title,detail:'Course',to:'/academics'}))));
  if(permitted('/cohorts'))jobs.push(supabase.from('cohorts').select('id,name')
   .ilike('name',like).limit(5).then(({data,error})=>error?[]:(data??[]).map(row=>({
    kind:'cohort' as const,id:row.id,title:row.name,detail:'Cohort',to:'/cohorts'}))));
  if(permitted('/classes'))jobs.push(supabase.from('teaching_classes')
   .select('id,class_group_name,subject_name')
   .or('class_group_name.ilike.'+like+',subject_name.ilike.'+like)
   .limit(7).then(({data,error})=>error?[]:(data??[]).map(row=>({
    kind:'class' as const,id:row.id,title:row.class_group_name||row.subject_name||'DLI class',
    detail:'Class & timetable',to:'/classes'}))));
  if(permitted('/communications'))jobs.push(supabase.from('dli_direct_messages')
   .select('id,thread_id').ilike('body',like).limit(5)
   .then(({data,error})=>error?[]:(data??[]).map(row=>({
    kind:'message' as const,id:row.id,title:'Matching private message',
    detail:'Open your authorised Messages',to:'/communications'}))));
  const settled=await Promise.allSettled(jobs),unique=new Map<string,NavigationHit>();
  for(const item of settled)if(item.status==='fulfilled')
   for(const hit of item.value)unique.set(hit.kind+':'+hit.id,hit);
  return [...unique.values()].slice(0,15);
 },[role,tier]);
 return <SearchBarWithMediaScope loadNavigationMatches={loadNavigationMatches}/>;
}
