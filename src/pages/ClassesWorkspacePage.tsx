import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CalendarClock, CheckCircle2, GraduationCap, Pencil, Plus, RefreshCw, Users, Video, Wallet, MessageCircle } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import PrivateClassesPage from './PrivateClassesPage';
import SubjectArtwork from '../components/SubjectArtwork';
import ChatMemberAvatar from '../components/ChatMemberAvatar';
import ChatMemberProfileOverlay from '../components/ChatMemberProfileOverlay';
import {ConfirmDialog,type ConfirmChoice} from '../components/ModalDialog';
import {makeTopicPacingPreview} from '../lib/topicPacing';
import './AcademicSetupPage.css';
import './ClassesWorkspacePage.css';

type Person = { id:string; auth_user_id:string; full_name:string; role:'student'|'tutor' };
type Subject = { id:string; name:string; academic_level_id:string; is_active:boolean };
type AcademicLevel = { id:string; code:string; name:string; sort_order:number; is_active:boolean };
type Programme = { id:string; name:string; code:string };
type Course = { id:string; title:string; programme_id:string; academic_level_id:string; subject_id:string; is_active:boolean };
type ClassType = 'free_demo'|'group_5_science'|'group_10'|'private_1_to_1';
type ClassRow = {
  id:string;subject_id:string;subject_name:string;tutor_id:string;tutor_name:string;
  weekday:number;starts_at:string;ends_at:string;meeting_url:string;
  state:'draft'|'published'|'archived';billing_mode:'free'|'manual_transfer';
  class_type:ClassType;class_start_date:string;programme_id:string;
  class_group_id:string;class_group_name:string;offering_id:string|null;
};
type Member = { id:string;class_id:string;student_id:string;student_name:string;is_active:boolean };
type CoTutor = {class_id:string;tutor_id:string;tutor_name:string;is_active:boolean};
type Cohort = {id:string;name:string;programme_id:string;academic_level_id:string;is_active:boolean};
type Offering = {id:string;cohort_id:string;course_id:string;is_active:boolean};
type Topic = {id:string;course_id:string;title:string;is_active:boolean};
type CohortPlan = {cohort_id:string;course_id:string;topic_id:string;position:number};
type Pacing = {class_id:string;topics_per_meeting:number};
type TopicDelivery = {class_id:string;course_id:string;topic_id:string;topic_order:number;meeting_number:number;meeting_date:string};
type ClassCurriculum = {class_group_id:string;cohort_id:string};
type LessonRow = { key:string;subject_id:string;tutor_id:string;second_tutor_id:string;topics_per_meeting:number;weekday:number;starts_at:string;ends_at:string };
type GroupDetails = {
  class_type:ClassType;class_start_date:string;class_group_name:string;
  class_group_id:string;academic_level_id:string;meeting_url:string;
};
type ClassGroup = { id:string;rows:ClassRow[];first:ClassRow;state:'draft'|'published'|'archived' };
const WEEKDAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const CLASS_TYPES: {id:ClassType;label:string;hint:string;capacity:number|null}[]=[
  {id:'group_5_science',label:'Group of 5 Students',hint:'Up to five paid students; any approved subject combination',capacity:5},
  {id:'group_10',label:'Group of 10',hint:'Up to ten paid students; any approved subject combination',capacity:10},
  {id:'private_1_to_1',label:'Private · 1 student',hint:'One student with a personalised subject timetable',capacity:1},
  {id:'free_demo',label:'Free · Scholars Club',hint:'Free classes; an individual student roster is optional',capacity:null},
];
const STAFF=new Set(['admin','assistant_admin']);
const EMPTY:GroupDetails={class_type:'group_5_science',class_start_date:'',class_group_name:'',class_group_id:'',academic_level_id:'',meeting_url:''};
const newLesson=():LessonRow=>({key:crypto.randomUUID(),subject_id:'',tutor_id:'',second_tutor_id:'',topics_per_meeting:1,weekday:1,starts_at:'16:00',ends_at:'17:00'});
const meetValid=(url:string)=>/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[/?#][A-Za-z0-9_=&%-]*)?$/.test(url);
const tier=(type:ClassType)=>CLASS_TYPES.find(t=>t.id===type)??CLASS_TYPES[0];
const dayTime=(c:ClassRow)=>WEEKDAYS[c.weekday]+' · '+c.starts_at.slice(0,5)+'–'+c.ends_at.slice(0,5)+' WAT';

function errorMessage(e:unknown){
  const code=(e as {code?:string;message?:string}|null)?.code;
  const msg=(e as {code?:string;message?:string}|null)?.message??'';
  if(code==='23505')return 'A student or tutor has a timetable conflict. Adjust the time before publishing.';
  if(code==='23514'){
    if(/overlap|overlapping|booked|conflict/i.test(msg))return 'Two subject sessions overlap or a student/tutor has another class at that time.';
    if(/capacity|duplicates/i.test(msg))return 'The group exceeds its capacity or repeats a subject/student.';
    if(/roster|same/i.test(msg))return 'Every subject must share the same student list and meeting link.';
    return 'Check programme, academic level, subjects, tutors, class times and student eligibility.';
  }
  if(code==='42501')return 'You do not have permission to change this class, or the group is no longer editable.';
  if(code==='PGRST202')return 'The unified two-tutor class service has not been deployed to this environment.';
  return 'The class operation could not be completed. Refresh and review your selections.';
}

export default function ClassesWorkspacePage(){
  const {account}=useAuth();
  const [params,setParams]=useSearchParams();
  const staff=Boolean(account&&STAFF.has(account.role));
  const paying=account?.role==='owner'||account?.role==='admin'||account?.role==='assistant_admin'||(account?.role==='student'&&account.studentTier==='paid');
  const communicating=account?.role==='owner'||account?.role==='admin'||
    (account?.role==='student'&&account.studentTier==='paid')||account?.role==='tutor';
  const tab=params.get('tab')==='payments'&&paying?'payments':
    params.get('tab')==='messages'&&communicating?'messages':'classes';

  const [people,setPeople]=useState<Person[]>([]);
  const [subjects,setSubjects]=useState<Subject[]>([]);
  const [levels,setLevels]=useState<AcademicLevel[]>([]);
  const [courses,setCourses]=useState<Course[]>([]);
  const [programmes,setProgrammes]=useState<Programme[]>([]);
  const [paidStudents,setPaidStudents]=useState<string[]>([]);
  const [classes,setClasses]=useState<ClassRow[]>([]);
  const [members,setMembers]=useState<Member[]>([]);
  const [coTutors,setCoTutors]=useState<CoTutor[]>([]);
  const [classCurricula,setClassCurricula]=useState<ClassCurriculum[]>([]);
  const [cohorts,setCohorts]=useState<Cohort[]>([]);
  const [offerings,setOfferings]=useState<Offering[]>([]);
  const [topics,setTopics]=useState<Topic[]>([]);
  const [cohortPlans,setCohortPlans]=useState<CohortPlan[]>([]);
  const [pacingRows,setPacingRows]=useState<Pacing[]>([]);
  const [deliveryRows,setDeliveryRows]=useState<TopicDelivery[]>([]);
  const [selectedCohortId,setSelectedCohortId]=useState(params.get('cohort')??'');
  const [chosen,setChosen]=useState<string[]>([]);
  const [form,setForm]=useState<GroupDetails>(EMPTY);
  const [lessons,setLessons]=useState<LessonRow[]>([newLesson()]);
  const [editing,setEditing]=useState<string|null>(null);
  const [showBuilder,setShowBuilder]=useState(Boolean(params.get('cohort')));
  const [pendingChange,setPendingChange]=useState<{group:ClassGroup;state:'published'|'archived'}|null>(null);
  const [search,setSearch]=useState('');
  const [profileTarget,setProfileTarget]=useState<Person|null>(null);
  const [tutorFilter,setTutorFilter]=useState('');
  const [showArchived,setShowArchived]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!supabase||!account){setLoading(false);setError('A verified DLI account is required.');return;}
    setLoading(true);
    try{
      const [c,m,p,s,l,co,pr,paid,coRows,curriculumRows,h,o,t,sequence,pacing,delivery]=await Promise.all([
        supabase.from('teaching_classes').select('id,subject_id,subject_name,tutor_id,tutor_name,weekday,starts_at,ends_at,meeting_url,state,billing_mode,class_type,class_start_date,programme_id,class_group_id,class_group_name,offering_id').limit(500),
        supabase.from('teaching_class_members').select('id,class_id,student_id,student_name,is_active').limit(3000),
        staff?supabase.from('authorised_users').select('id,auth_user_id,full_name,role').eq('status','active').in('role',['student','tutor']).order('full_name'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('subjects').select('id,name,academic_level_id,is_active').eq('is_active',true).order('name'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('academic_levels').select('id,code,name,sort_order,is_active').eq('is_active',true).order('sort_order'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('courses').select('id,title,programme_id,academic_level_id,subject_id,is_active').eq('is_active',true).limit(500):Promise.resolve({data:[],error:null}),
        staff?supabase.from('programmes').select('id,name,code').eq('is_active',true).order('name'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('dli_student_entitlements').select('student_id').eq('tier','paid'):Promise.resolve({data:[],error:null}),
        supabase.from('dli_class_co_tutors').select('class_id,tutor_id,tutor_name,is_active').limit(1000),
        staff?supabase.from('dli_class_curricula').select('class_group_id,cohort_id').limit(500):Promise.resolve({data:[],error:null}),
        staff?supabase.from('cohorts').select('id,name,programme_id,academic_level_id,is_active').eq('is_active',true).order('name'):Promise.resolve({data:[],error:null}),
        staff?supabase.from('course_offerings').select('id,cohort_id,course_id,is_active').eq('is_active',true).limit(500):Promise.resolve({data:[],error:null}),
        supabase.from('topics').select('id,course_id,title,is_active').eq('is_active',true).limit(1000),
        staff?supabase.from('dli_cohort_topic_plan').select('cohort_id,course_id,topic_id,position').order('position').limit(2000):Promise.resolve({data:[],error:null}),
        supabase.from('dli_class_topic_pacing').select('class_id,topics_per_meeting').limit(1000),
        supabase.from('dli_class_topic_delivery').select('class_id,course_id,topic_id,topic_order,meeting_number,meeting_date').order('meeting_date').limit(3000),
      ]);
      if([c,m,p,s,l,co,pr,paid,coRows,curriculumRows,h,o,sequence,pacing,delivery].some(x=>x.error)||(staff&&t.error)){
        setError('Could not load the class register or approved academic subjects. Check permissions and refresh.');
      }else{
        setClasses((c.data??[]) as ClassRow[]);
        setMembers((m.data??[]) as Member[]);
        setCoTutors((coRows.data??[]) as CoTutor[]);
        setClassCurricula((curriculumRows.data??[]) as ClassCurriculum[]);
        setCohorts((h.data??[]) as Cohort[]);
        setOfferings((o.data??[]) as Offering[]);
        setTopics((t.data??[]) as Topic[]);
        setCohortPlans((sequence.data??[]) as CohortPlan[]);
        setPacingRows((pacing.data??[]) as Pacing[]);
        setDeliveryRows((delivery.data??[]) as TopicDelivery[]);
        setPeople((p.data??[]) as Person[]);
        setSubjects((s.data??[]) as Subject[]);
        setLevels((l.data??[]) as AcademicLevel[]);
        setCourses((co.data??[]) as Course[]);
        setProgrammes((pr.data??[]) as Programme[]);
        setPaidStudents((paid.data??[]).map(x=>x.student_id));
        setError(null);
      }
    }catch{setError('The class register could not be reached. Check your internet connection.');}
    finally{setLoading(false);}
  },[account?.id,staff]);
  useEffect(()=>{void refresh();},[refresh]);

  const students=people.filter(p=>p.role==='student');
  const tutors=people.filter(p=>p.role==='tutor');
  const capacity=tier(form.class_type).capacity;
  const selectedCohort=cohorts.find(h=>h.id===selectedCohortId&&h.is_active)??null;
  const programmeId=selectedCohort?.programme_id??'';
  const levelId=selectedCohort?.academic_level_id??'';
  const cohortProgramme=programmes.find(p=>p.id===programmeId);
  const paidCohort=cohortProgramme?.code==='dli-online';
  const cohortOfferings=offerings.filter(o=>o.cohort_id===selectedCohortId&&o.is_active&&
    courses.some(c=>c.id===o.course_id&&c.is_active));
  const availableSubjects=subjects.filter(s=>s.academic_level_id===levelId&&s.is_active&&
    cohortOfferings.some(o=>courses.some(c=>c.id===o.course_id&&c.subject_id===s.id)));
  const cohortReady=cohortOfferings.length>0&&cohortOfferings.every(o=>cohortPlans.some(p=>
    p.cohort_id===selectedCohortId&&p.course_id===o.course_id));
  const eligibleStudents=students.filter(p=>form.class_type==='free_demo'||paidStudents.includes(p.auth_user_id));
  const studentOptions=eligibleStudents.filter(p=>p.full_name.toLowerCase().includes(search.trim().toLowerCase()));
  const chosenSet=useMemo(()=>new Set(chosen),[chosen]);
  const topicsById=useMemo(()=>new Map(topics.map(topic=>[topic.id,topic.title])),[topics]);
  const coTutorByClass=useMemo(()=>{
    const byClass=new Map<string,CoTutor>();
    for(const tutor of coTutors)if(tutor.is_active&&!byClass.has(tutor.class_id))
      byClass.set(tutor.class_id,tutor);
    return byClass;
  },[coTutors]);
  const pacingByClass=useMemo(()=>new Map(pacingRows.map(row=>[row.class_id,row.topics_per_meeting])),[pacingRows]);
  const deliveryByClass=useMemo(()=>{
    const byClass=new Map<string,TopicDelivery[]>();
    for(const item of deliveryRows){
      const group=byClass.get(item.class_id)??[];
      group.push(item);byClass.set(item.class_id,group);
    }
    for(const rows of byClass.values())rows.sort((a,b)=>a.meeting_date.localeCompare(b.meeting_date));
    return byClass;
  },[deliveryRows]);
  const membersByClass=useMemo(()=>{
    const index=new Map<string,Member[]>();
    for(const m of members){
      if(!m.is_active)continue;
      const items=index.get(m.class_id)??[];
      items.push(m);index.set(m.class_id,items);
    }
    return index;
  },[members]);
  // Lagos is UTC+01:00 year-round. Compare ISO calendar dates, not device timezone.
  const todayWAT=new Date(Date.now()+3600000).toISOString().slice(0,10);
  // Only actual active enrolment rows count as CURRENT classes.
  // The class being edited/created is a proposed destination, not enrolment.
  const studentClassNames=useMemo(()=>{
    const byClass=new Map(classes.map(c=>[c.id,c]));
    const byStudent=new Map<string,Set<string>>();
    for(const member of members){
      if(!member.is_active)continue;
      const cl=byClass.get(member.class_id);
      if(!cl||cl.state==='archived')continue;
      const name=cl.class_group_name?.trim()||cl.subject_name?.trim();
      if(!name)continue;
      const list=byStudent.get(member.student_id)??new Set<string>();
      list.add(name);
      byStudent.set(member.student_id,list);
    }
    return new Map([...byStudent].map(([id,names])=>[id,[...names].sort()]));
  },[members,classes]);
  const targetClassName=form.class_group_name.trim()||selectedCohort?.name||'Choose a cohort first';

  const groups=useMemo(()=>{
    const result=new Map<string,ClassGroup>();
    for(const row of classes){
      if(row.state==='archived'&&!showArchived)continue;
      if(tutorFilter&&row.tutor_id!==tutorFilter&&
        !coTutors.some(c=>c.class_id===row.id&&c.is_active&&c.tutor_id===tutorFilter))continue;
      const group=result.get(row.class_group_id);
      if(group){group.rows.push(row);continue;}
      result.set(row.class_group_id,{id:row.class_group_id,first:row,rows:[row],state:row.state});
    }
    return [...result.values()].map(group=>({...group,
      rows:group.rows.sort((a,b)=>a.weekday-b.weekday||a.starts_at.localeCompare(b.starts_at)),
      state:group.rows.every(r=>r.state==='archived')?'archived':
        group.rows.every(r=>r.state==='published')?'published':'draft',
    } as ClassGroup));
  },[classes,coTutors,showArchived,tutorFilter]);

  const draftGroups=useMemo(()=>{
    const map=new Map<string,ClassRow[]>();
    for(const row of classes){
      if(row.state==='archived')continue;
      const arr=map.get(row.class_group_id)??[];
      arr.push(row);map.set(row.class_group_id,arr);
    }
    return [...map.entries()].filter(([,rows])=>rows.every(c=>c.state==='draft'&&!c.offering_id))
      .map(([id,rows])=>({id,rows,first:rows[0]}));
  },[classes]);

  const requested=params.get('registry')??'';
  useEffect(()=>{
    if(!requested)return;
    const student=students.find(s=>s.id===requested);
    if(student&&eligibleStudents.some(s=>s.auth_user_id===student.auth_user_id))
      setChosen(current=>current.length?current:[student.auth_user_id]);
  },[requested,students.length,paidStudents.length,form.class_type]);

  function editGroup(groupId:string){
    const group=draftGroups.find(g=>g.id===groupId);
    if(!group){setError('Only unlinked draft groups can be edited here.');return;}
    const first=group.first;
    const matchingCurriculum=classCurricula.find(c=>c.class_group_id===groupId);
    if(matchingCurriculum)setSelectedCohortId(matchingCurriculum.cohort_id);
    setEditing(groupId);
    setForm({
      class_type:first.class_type,
      class_start_date:first.class_start_date,
      class_group_name:first.class_group_name,
      class_group_id:first.class_group_id,
      academic_level_id:subjects.find(s=>s.id===first.subject_id)?.academic_level_id??'',
      meeting_url:first.meeting_url,
    });
    setLessons(group.rows.map(c=>({
      key:c.id,subject_id:c.subject_id,tutor_id:c.tutor_id,
      second_tutor_id:coTutors.find(co=>co.class_id===c.id&&co.is_active)?.tutor_id??'',
      topics_per_meeting:pacingRows.find(p=>p.class_id===c.id)?.topics_per_meeting??1,
      weekday:c.weekday,starts_at:c.starts_at.slice(0,5),ends_at:c.ends_at.slice(0,5),
    })));
    setChosen(members.filter(m=>m.class_id===first.id&&m.is_active).map(m=>m.student_id));
    setError(null);setNotice(null);setParams({tab:'classes'});setShowBuilder(true);
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function cancelEdit(){
    setEditing(null);setShowBuilder(false);
    if(selectedCohortId)chooseCohort(selectedCohortId);
    else {setForm(EMPTY);setLessons([newLesson()]);setChosen([]);setError(null);}
  }
  function chooseCohort(id:string){
    const cohort=cohorts.find(h=>h.id===id);
    setSelectedCohortId(id);
    setEditing(null);setChosen([]);
    if(!cohort){setLessons([newLesson()]);setForm(EMPTY);return;}
    const isFree=programmes.find(p=>p.id===cohort.programme_id)?.code==='dli-scholars-club';
    const sessions=offerings.filter(o=>o.cohort_id===id&&o.is_active)
      .map(o=>courses.find(c=>c.id===o.course_id))
      .filter((c):c is Course=>Boolean(c&&c.is_active))
      .map((c,i)=>({...newLesson(),subject_id:c.subject_id,
        weekday:(i+1)%7,topics_per_meeting:1}));
    setForm(v=>({...v,class_type:isFree?'free_demo':'group_5_science',
      class_group_name:cohort.name,academic_level_id:cohort.academic_level_id,
      class_start_date:'',class_group_id:''}));
    setLessons(sessions.length?sessions:[newLesson()]);
    setError(null);setNotice(null);
  }
  useEffect(()=>{
    const wanted=params.get('cohort');
    if(wanted&&selectedCohortId===wanted&&!editing&&!form.class_group_name&&
      cohorts.some(h=>h.id===wanted))chooseCohort(wanted);
  },[cohorts,selectedCohortId,form.class_group_name,editing,params]);

  function chooseType(type:ClassType){
    if(!selectedCohort||Boolean(editing))return;
    if((!paidCohort&&type!=='free_demo')||(paidCohort&&type==='free_demo'))return;
    setChosen([]);
    setForm(v=>({...v,class_type:type}));
    setError(null);
  }
  function setLesson(key:string,changes:Partial<LessonRow>){
    setLessons(old=>old.map(row=>row.key===key?{...row,...changes}:row));
  }
  function setStudent(id:string,value:boolean){
    if(value&&capacity!==null&&chosen.length>=capacity&&!chosenSet.has(id)){
      setError('This class has reached its '+capacity+'-student limit.');return;
    }
    setChosen(existing=>value?[...new Set([...existing,id])]:existing.filter(x=>x!==id));
  }
  function selectMatching(){
    setChosen(existing=>{
      const possible=studentOptions.map(s=>s.auth_user_id).filter(id=>!existing.includes(id));
      return [...existing,...(capacity===null?possible:possible.slice(0,Math.max(0,capacity-existing.length)))];
    });
  }

  async function save(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!supabase||!staff||busy)return;
    const url=form.meeting_url.trim();
    const unique=new Set(lessons.map(l=>l.subject_id));
    const validRows=lessons.length>0&&lessons.length<=15&&unique.size===lessons.length&&
      lessons.every(l=>l.subject_id&&l.tutor_id&&l.second_tutor_id&&l.tutor_id!==l.second_tutor_id&&
        Number.isInteger(l.topics_per_meeting)&&l.topics_per_meeting>=1&&l.topics_per_meeting<=10&&
        availableSubjects.some(s=>s.id===l.subject_id)&&
        tutors.some(t=>t.auth_user_id===l.tutor_id)&&
        tutors.some(t=>t.auth_user_id===l.second_tutor_id)&&
        l.weekday>=0&&l.weekday<=6&&l.starts_at<l.ends_at);
    const overlaps=lessons.some((a,i)=>lessons.some((b,j)=>i<j&&a.weekday===b.weekday&&
      a.starts_at<b.ends_at&&a.ends_at>b.starts_at));
    if(!selectedCohort||!cohortReady||lessons.length!==cohortOfferings.length||
      !programmeId||!levelId||!form.class_start_date||
      form.class_group_name.trim().length<2||form.class_group_name.trim().length>120||
      !meetValid(url)||!validRows||overlaps||
      (capacity!==null&&chosen.length>capacity)||
      chosen.some(id=>!eligibleStudents.some(s=>s.auth_user_id===id))){
      setError('Choose approved courses, non-overlapping times, TWO different tutors per subject, eligible students, a class name and one Google Meet link.');
      return;
    }
    setBusy(true);setError(null);setNotice(null);
    try{
      // A single SQL transaction saves both tutors, the academic cohort,
      // weekly course timetable and the shared student roster.
      const result=await supabase.rpc('dli_save_cohort_class',{
        p_source_cohort:selectedCohort.id,
        p_group_id:editing,
        p_programme_id:programmeId,
        p_level_id:levelId,
        p_class_type:form.class_type,
        p_start_date:form.class_start_date,
        p_group_name:form.class_group_name.trim(),
        p_meeting_url:url,
        p_students:chosen,
        p_lessons:lessons.map(({subject_id,tutor_id,second_tutor_id,topics_per_meeting,weekday,starts_at,ends_at})=>
          ({subject_id,tutor_id,second_tutor_id,topics_per_meeting,weekday,starts_at,ends_at})), 
      });
      if(result.error||!result.data){setError(errorMessage(result.error));return;}
      cancelEdit();
      setNotice(editing?'Draft updated: courses, two tutors, timetable and students saved together.':
        'Cohort class draft created with '+lessons.length+' course'+(lessons.length===1?'':'s')+
        '. Publishing assigns teaching dates for each ordered topic.');
      await refresh();
    }catch{setError('The class could not be saved. Refresh the register before trying again.');}
    finally{setBusy(false);}
  }

  async function changeState(group:ClassGroup,state:'published'|'archived'){
    if(!supabase||!staff||busy)return;
    setBusy(true);setError(null);setNotice(null);
    try{
      const integrated=classCurricula.some(row=>row.class_group_id===group.id);
      const cohortDriven=group.rows.some(r=>pacingRows.some(p=>p.class_id===r.id));
      const result=await supabase.rpc(cohortDriven?'dli_set_cohort_class_state':
        integrated?'dli_set_unified_class_state':'dli_set_teaching_group_state',{
        p_group_id:group.id,p_state:state,
      });
      if(result.error||!result.data){setError(errorMessage(result.error));return;}
      setNotice(state==='published'?'All courses published: two tutors, academic assignments, student enrolments and weekly schedules synchronised.':'Group archived, including its managed academic offerings and teaching links.');
      await refresh();
    }catch{setError('Group status could not be confirmed. Please refresh.');}
    finally{setBusy(false);}
  }

  if(params.get('tab')==='messages'&&communicating)
    return <Navigate to={'/communications?section=class'+
      (params.get('class')?'&class='+encodeURIComponent(params.get('class')!):'')} replace/>;

  return <div className="module-page classes-workspace">
    <div className="module-page-hero">
      <span className="module-page-icon"><CalendarClock size={25}/></span>
      <div className="module-page-copy">
        <h1>{staff?'Classes & timetable':account?.role==='tutor'?'My teaching classes':'My classes'}</h1>
        
      </div>
    </div>
    
    {(paying||communicating)&&<nav className="classes-tabs" aria-label="Class workspace sections">
      <button className={tab==='classes'?'selected':''} type="button" onClick={()=>setParams({tab:'classes'})}>
        <CalendarClock size={15}/> Classes &amp; schedule
      </button>
      {paying&&<button className={tab==='payments'?'selected':''} type="button"
        onClick={()=>setParams(requested?{tab:'payments',registry:requested}:{tab:'payments'})}>
        <Wallet size={15}/> Fees &amp; payment evidence
      </button>}
    </nav>}
    {tab==='payments'&&paying?<PrivateClassesPage billingOnly embedded/>:<>
      {error&&<p className="auth-feedback error" role="alert">{error}</p>}
      {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
      <div className="academic-top-actions">
        <p>{loading?'Loading authorised classes…':
          staff?groups.length+' class group'+(groups.length===1?'':'s')+' visible to your role':
          account?.role==='student'?groups.length+' class'+(groups.length===1?'':'es')+' in your timetable':
          groups.length+' teaching class'+(groups.length===1?'':'es')+' assigned'}</p>
        <button className="user-outline-button" type="button" disabled={busy||loading} onClick={()=>void refresh()}>
          <RefreshCw size={15}/> Refresh
        </button>
      </div>
      {staff&&<div className="classes-create-toggle">
        <button type="button" className="user-outline-button"
          aria-expanded={showBuilder||Boolean(editing)}
          aria-controls="dli-create-class-group"
          onClick={()=>{if(editing)cancelEdit();else setShowBuilder(v=>!v);}}>
          <Plus size={17}/> {showBuilder||editing?'Close class builder':'Create New Class Group'}
        </button>
      </div>}
      {staff&&(showBuilder||Boolean(editing))&&<section id="dli-create-class-group"
        className="panel classes-builder">
        <div className="panel-heading"><div>
          <h2>{editing?'Edit draft class group':'Create a multi-subject class'}</h2>
          <p className="user-caption">Choose a completed cohort, configure tutors and a delivery pace for every course, then publish the dated schedule.</p>
        </div></div>
        {draftGroups.length>0&&<div className="classes-draft-picker">
          <label htmlFor="classes-draft">Continue an existing draft</label>
          <select id="classes-draft" value={editing??''} disabled={busy}
            onChange={e=>e.target.value?editGroup(e.target.value):cancelEdit()}>
            <option value="">Create a new class</option>
            {draftGroups.map(g=><option key={g.id} value={g.id}>
              {g.first.class_group_name||'Unnamed group'} · {tier(g.first.class_type).label}
            </option>)}
          </select>
        </div>}
        <form className="academic-form classes-form" onSubmit={e=>void save(e)}>
          <div className="classes-section-heading"><span>1</span><div><h3>Select cohort</h3>
            <p>Only courses and ordered topics saved in Advanced Curriculum are available here.</p>
          </div></div>
          <label htmlFor="classes-cohort">Academic cohort
            <select id="classes-cohort" required value={selectedCohort?.id??''}
              disabled={busy||Boolean(editing)} onChange={e=>chooseCohort(e.target.value)}>
              <option value="">Choose a cohort</option>
              {cohorts.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </label>
          {!selectedCohort&&<p className="academic-code-hint">
            Create a cohort, assign its courses and save the topic order in <Link to="/cohorts">Advanced Curriculum</Link>.
          </p>}
          {selectedCohort&&!cohortReady&&<p className="auth-feedback error" role="status">
            This cohort is not ready. Every assigned course must have an ordered topic plan.
            <Link to="/cohorts"> Complete the curriculum</Link> before scheduling.
          </p>}
          <div className="classes-section-heading"><span>2</span><div><h3>Billing mode &amp; class capacity</h3><p>{paidCohort?'Select the paid class capacity. Payment assignments are available below.':'Scholars Club cohorts are free and need no payment assignment.'}</p></div></div>
          <div className="classes-tier-grid" role="group" aria-label="Class type">
            {CLASS_TYPES.filter(type=>selectedCohort&&(paidCohort?type.id!=='free_demo':type.id==='free_demo')).map(type=><button key={type.id} type="button" disabled={busy||Boolean(editing)}
              aria-pressed={form.class_type===type.id}
              className={'classes-tier'+(form.class_type===type.id?' selected':'')}
              onClick={()=>chooseType(type.id)}>
              <strong>{type.label}</strong><small>{type.hint}</small>
            </button>)}
          </div>
          <p className="academic-code-hint">Programme: <strong>{cohortProgramme?.name??'Choose a cohort first'}</strong>. Paid students must have verified access before publication.</p>

          <div className="classes-section-heading"><span>3</span><div><h3>Class start date and identity</h3>
            <p>The programme and academic level are inherited from the selected cohort.</p></div></div>
          <p className="academic-code-hint">Academic level:
            <strong> {levels.find(l=>l.id===levelId)?.name??'Choose a cohort first'}</strong></p>
          <div className="classes-field-pair">
            <label htmlFor="classes-start-date">Class start date (WAT)
              <input id="classes-start-date" type="date" required value={form.class_start_date}
                disabled={busy||Boolean(editing)}
                onChange={e=>setForm(v=>({...v,class_start_date:e.target.value}))}/>
            </label>
            <label htmlFor="classes-group-name">Class/group name
              <input id="classes-group-name" required minLength={2} maxLength={120}
                placeholder="Example: JSS2 Group A" value={form.class_group_name}
                onChange={e=>setForm(v=>({...v,class_group_name:e.target.value}))}/>
            </label>
          </div>

          <div className="classes-section-heading"><span>4</span><div><h3>Choose students</h3><p>Each selected student will belong to all subjects in this class. You may save a draft before students are available.</p></div></div>
          <fieldset className="classes-student-picker">
            <legend>{capacity===null?'Free class · no fixed student limit':'Students · '+chosen.length+' of '+capacity+' seats'}</legend>
            <input type="search" placeholder="Search eligible students by name…" value={search}
              onChange={e=>setSearch(e.target.value)} aria-label="Search eligible students"/>
            <div className="classes-seat-progress" role="status" aria-live="polite">
              {chosen.length} selected{capacity!==null?' · '+(capacity-chosen.length)+' available seat'+(capacity-chosen.length===1?'':'s'):''}
            </div>
            {chosen.length>0&&<p className="classes-selected-names">
              Selected: {chosen.map(id=>students.find(s=>s.auth_user_id===id)?.full_name??'Unavailable student').join(' · ')}
            </p>}
            <div className="classes-selection-actions">
              <button type="button" disabled={!studentOptions.length||busy} onClick={selectMatching}>Select matching (within limit)</button>
              <button type="button" disabled={!chosen.length||busy} onClick={()=>setChosen([])}>Clear students</button>
            </div>
            <div className="classes-student-list">
              {studentOptions.map(s=>{
                const current=studentClassNames.get(s.auth_user_id)??[];
                const selected=chosenSet.has(s.auth_user_id);
                const checkboxId='class-student-'+s.id;
                return <div key={s.id} className={'classes-student-option'+(selected?' selected':'')}>
                  <button type="button" className="classes-student-photo-button"
                    onClick={()=>setProfileTarget(s)}
                    aria-label={'View verified profile for '+s.full_name}
                    title={'View '+s.full_name+' profile'}>
                    <ChatMemberAvatar userId={s.auth_user_id} name={s.full_name}
                      className="classes-student-photo"/>
                    <span>View profile</span>
                  </button>
                  <div className="classes-student-info">
                    <label htmlFor={checkboxId} className="classes-student-identity">
                      <strong>{s.full_name}</strong>
                      <span>{current.length?'Current class: '+current.join(', '):'No active class recorded'}</span>
                      <span className="classes-student-target">Assign to: {targetClassName}</span>
                    </label>
                    <label htmlFor={checkboxId} className="classes-student-check">
                      <input id={checkboxId} type="checkbox" checked={selected}
                        disabled={busy||(!selected&&capacity!==null&&chosen.length>=capacity)}
                        onChange={e=>setStudent(s.auth_user_id,e.target.checked)}/>
                      <span>{selected?'Selected':'Select student'}</span>
                    </label>
                  </div>
                </div>;
              })}
              {!studentOptions.length&&<p className="academic-empty">
                {form.class_type==='free_demo'?'No active students yet. You can still save and publish a free class.':
                  'No approved Paid Students yet. Save this class as a draft; student enrolment must be approved before publication.'}
              </p>}
            </div>
          </fieldset>

          <div className="classes-section-heading"><span>5</span><div><h3>Cohort courses, tutors &amp; topic pacing</h3>
            <p>Courses and topics come from the cohort. Set two tutors, a weekly day/time, and how many ordered topics are taught per meeting.</p>
          </div></div>
          <div className="classes-lesson-list">
            {lessons.map((lesson,index)=><fieldset className="classes-lesson-card" key={lesson.key}>
              <legend>Subject {index+1}</legend>
              <div className="classes-field-pair">
                <div className="classes-readonly-course" aria-label={'Course imported from cohort '+(index+1)}>
                  <span>Course / subject</span>
                  <strong>{courses.find(c=>c.programme_id===programmeId&&
                    c.academic_level_id===levelId&&c.subject_id===lesson.subject_id)?.title??
                    availableSubjects.find(s=>s.id===lesson.subject_id)?.name??'Choose a cohort first'}</strong>
                </div>
                <label htmlFor={'classes-tutor-'+lesson.key}>Primary tutor
                  <select id={'classes-tutor-'+lesson.key} required value={lesson.tutor_id}
                    onChange={e=>setLesson(lesson.key,{tutor_id:e.target.value})}>
                    <option value="">Choose tutor</option>
                    {tutors.map(t=><option key={t.id} value={t.auth_user_id}
                      disabled={t.auth_user_id===lesson.second_tutor_id}>{t.full_name}</option>)}
                  </select>
                </label>
                <label htmlFor={'classes-second-tutor-'+lesson.key}>Second tutor
                  <select id={'classes-second-tutor-'+lesson.key} required value={lesson.second_tutor_id}
                    onChange={e=>setLesson(lesson.key,{second_tutor_id:e.target.value})}>
                    <option value="">Choose second tutor</option>
                    {tutors.map(t=><option key={t.id} value={t.auth_user_id}
                      disabled={t.auth_user_id===lesson.tutor_id}>{t.full_name}</option>)}
                  </select>
                </label>
              </div>
              <label className="classes-pacing-control" htmlFor={'classes-pacing-'+lesson.key}>
                Topic pacing · delivery rate
                <select id={'classes-pacing-'+lesson.key} value={lesson.topics_per_meeting} required
                  onChange={e=>setLesson(lesson.key,{topics_per_meeting:Number(e.target.value)})}>
                  {[1,2,3,4,5,6,7,8,9,10].map(rate=><option key={rate} value={rate}>
                    {rate} topic{rate===1?'':'s'} per meeting
                  </option>)}
                </select>
              </label>
              <div className="classes-schedule-grid">
                <label htmlFor={'classes-weekday-'+lesson.key}>Weekly day
                  <select id={'classes-weekday-'+lesson.key} value={lesson.weekday}
                    onChange={e=>setLesson(lesson.key,{weekday:Number(e.target.value)})}>
                    {WEEKDAYS.map((day,i)=><option key={day} value={i}>{day}</option>)}
                  </select>
                </label>
                <label>Start time (WAT)
                  <input type="time" required value={lesson.starts_at}
                    onChange={e=>setLesson(lesson.key,{starts_at:e.target.value})}/>
                </label>
                <label>End time (WAT)
                  <input type="time" required value={lesson.ends_at}
                    onChange={e=>setLesson(lesson.key,{ends_at:e.target.value})}/>
                </label>
              </div>
              <div className="classes-pacing-preview" aria-label="Planned topic teaching dates">
                <strong>Scheduled topic sequence</strong>
                {makeTopicPacingPreview(form.class_start_date,lesson.weekday,
                  cohortPlans.filter(p=>p.cohort_id===selectedCohortId&&
                    cohortOfferings.some(o=>courses.some(c=>c.id===o.course_id&&c.subject_id===lesson.subject_id&&c.id===p.course_id)))
                    .sort((a,b)=>a.position-b.position)
                    .map(p=>({id:p.topic_id,title:topics.find(t=>t.id===p.topic_id)?.title??'Topic'})),
                  lesson.topics_per_meeting).map(week=><div key={week.meeting}>
                    <time dateTime={week.date}>{week.date}</time>
                    <span>Meeting {week.meeting}: {week.topics.map(t=>t.title).join(' · ')}</span>
                  </div>)}
              </div>
            </fieldset>)}
          </div>
          <p className="academic-code-hint">Courses and their order are controlled in
            <Link to="/cohorts"> Advanced Curriculum</Link>. Refresh this page after making curriculum changes.</p>
          {tutors.length<2&&<p className="academic-code-hint">At least two active tutors are required. Authorise tutors under <Link to="/users">Users &amp; access</Link>.</p>}

          <div className="classes-section-heading"><span>6</span><div><h3>One Google Meet link</h3><p>All subject sessions in this class use this link. Tutors and students see it only when permitted.</p></div></div>
          <label htmlFor="classes-meet">Google Meet link for the entire group</label>
          <input id="classes-meet" type="url" required maxLength={2048}
            placeholder="https://meet.google.com/abc-defg-hij" value={form.meeting_url}
            onChange={e=>setForm(v=>({...v,meeting_url:e.target.value}))}/>
          <p className="academic-code-hint">Academic course offerings, both tutor assignments and student enrolments are activated together when the group is published. Paid student eligibility is still verified; this action never collects payment or creates a receipt.</p>
          <div className="classes-form-actions">
            <button className="academic-submit" type="submit"
              disabled={busy||loading||!form.class_start_date||!levelId||!programmeId||
                !selectedCohort||!cohortReady||!availableSubjects.length||tutors.length<2}>
              {editing?<Pencil size={16}/>:<Plus size={16}/>}
              {busy?'Saving entire class…':editing?'Save all class changes':'Create class draft'}
            </button>
            {editing&&<button type="button" className="user-outline-button" onClick={cancelEdit} disabled={busy}>Cancel editing</button>}
          </div>
        </form>
      </section>}
      {staff&&selectedCohort&&paidCohort&&<details className="panel classes-cohort-billing" id="cohort-billing">
        <summary><Wallet size={19}/> Payment assignment &amp; billing configuration — {selectedCohort.name}</summary>
        <p>This is a paid DLI cohort. Assign each approved student's monthly fee using the existing audited
          manual-transfer workflow. DLI account details are set by authorised administrators.
          Submitting a receipt never confirms a bank credit or grants access automatically.</p>
        <p><strong>Selected class structure:</strong> {tier(form.class_type).label} · {chosen.length} student{chosen.length===1?'':'s'} selected.
          Fee amounts and rates are managed in the existing finance editor, not inferred from topic counts.</p>
        <PrivateClassesPage billingOnly embedded/>
      </details>}
      {staff&&selectedCohort&&!paidCohort&&<p className="classes-free-billing-note">
        <CheckCircle2 size={17}/> Free Scholars Club cohort · No payment assignment or bank details required.
      </p>}

      <section className="panel classes-directory">
        <div data-dli-tour="classes" className="panel-heading"><div>
          <h2>{staff?'All individual and group classes':account?.role==='tutor'?'My assigned subject sessions':'My subject timetable'}</h2>
          <p className="user-caption">Each group has one student list and one Meet link. Every course has two tutors and its own timetable.</p>
        </div></div>
        {staff&&<div className="classes-filters">
          <label>Tutor<select value={tutorFilter} onChange={e=>setTutorFilter(e.target.value)}>
            <option value="">All tutors</option>
            {tutors.map(t=><option key={t.id} value={t.auth_user_id}>{t.full_name}</option>)}
          </select></label>
          <label className="classes-toggle"><input type="checkbox" checked={showArchived}
            onChange={e=>setShowArchived(e.target.checked)}/> Include archived</label>
        </div>}
        {!loading&&!groups.length&&<p className="academic-empty">
          {staff?'No classes yet. Select Create New Class Group to add the first draft.':
            account?.role==='student'?'No classes are available to you yet. Check back for published sessions or contact DLI administration.':
            'Your DLI administrator will assign your teaching classes.'}
        </p>}
        <div className="classes-cards">{groups.map(group=>{
          const activeRows=group.rows.filter(c=>c.state!=='archived');
          const roster=membersByClass.get(group.first.id)??[];
          const groupName=group.first.class_group_name||'Class '+group.id.slice(0,8);
          const canEdit=staff&&draftGroups.some(g=>g.id===group.id);
          return <article className="classes-card" key={group.id}>
            <div className="classes-card-heading">
              <div><h3><Users size={18}/>{groupName}</h3>
                <small>{tier(group.first.class_type).label} · {group.rows.length} subject{group.rows.length===1?'':'s'}</small>
              </div>
              <span className={'classes-state '+group.state}>{group.state}</span>
            </div>
            <p><CalendarClock size={15}/>Starts {group.first.class_start_date} · {activeRows.length} weekly subject sessions</p>
            {(staff||account?.role==='tutor')&&<p><GraduationCap size={15}/>Students: {roster.map(m=>m.student_name).join(', ')||'Not assigned yet'}</p>}
            <div className="ref-course-tabs" aria-label="Related class learning areas">
              {account?.role!=='assistant_admin'&&
               <Link to={'/study?tab=lessons&class='+encodeURIComponent(group.id)}>Learning resources</Link>}
              {account?.role!=='assistant_admin'&&
               <Link to={'/study?tab=assignments&class='+encodeURIComponent(group.id)}>Assignments</Link>}
              {account?.role!=='assistant_admin'&&
               <Link to={'/study?tab=quizzes&class='+encodeURIComponent(group.id)}>Quizzes</Link>}
            </div>
            <div className="classes-group-sessions">
              {group.rows.map(c=><div className="classes-group-session" key={c.id}>
                <div><strong><SubjectArtwork subject={c.subject_name}/>{c.subject_name}</strong>
                  <small>{dayTime(c)}</small>
                  <small>Primary tutor: {c.tutor_name}</small>
                  {coTutorByClass.get(c.id)&&<small>Second tutor: {coTutorByClass.get(c.id)?.tutor_name}</small>}
                  {staff&&c.offering_id&&<small>Linked academic offering · tutor assignments verified</small>}
                  {pacingByClass.has(c.id)&&<small>
                    Delivery rate: {pacingByClass.get(c.id)} topic(s) per weekly meeting
                  </small>}
                  {(deliveryByClass.get(c.id)?.length??0)>0&&<>
                    {deliveryByClass.get(c.id)?.find(p=>p.meeting_date>=todayWAT)&&
                      <small className="dli-live-pulse">
                        Next topic: {topicsById.get(deliveryByClass.get(c.id)!.find(p=>p.meeting_date>=todayWAT)!.topic_id)??'Course topic'}
                      </small>}
                    <details className="classes-delivery-list">
                      <summary>View all {deliveryByClass.get(c.id)?.length} scheduled meetings</summary>
                      {deliveryByClass.get(c.id)?.map(p=>
                        <span key={p.topic_id}>
                          <time dateTime={p.meeting_date}>{p.meeting_date}</time>
                          <span>Meeting {p.meeting_number} · {topicsById.get(p.topic_id)??'Topic details unavailable'}</span>
                        </span>)}
                    </details>
                  </>}
                </div>
                {c.state==='archived'&&<span className="classes-state archived">Archived</span>}
                {communicating&&c.state==='published'&&
                  <Link to={'/communications?section=class&class='+encodeURIComponent(c.id)}>
                    <MessageCircle size={14}/> Subject chat
                  </Link>}
              </div>)}
            </div>
            <div className="classes-card-actions">
              {group.state==='published'&&<a href={group.first.meeting_url} target="_blank"
                rel="noopener noreferrer"><Video size={15}/> Shared Google Meet</a>}
              {(account?.role==='student'||account?.role==='tutor')&&group.state==='published'&&
                <Link to={'/feedback?class='+encodeURIComponent(group.first.id)}>Report an issue</Link>}
              {canEdit&&<button type="button" disabled={busy} onClick={()=>{editGroup(group.id);setShowBuilder(true);}}><Pencil size={14}/> Edit group</button>}
              {staff&&group.state==='draft'&&
                <button type="button" disabled={busy} onClick={()=>setPendingChange({group,state:'published'})}>
                  <CheckCircle2 size={14}/> Publish entire group
                </button>}
              {staff&&group.state!=='archived'&&<button type="button" disabled={busy}
                onClick={()=>setPendingChange({group,state:'archived'})}>Archive group</button>}
            </div>
          </article>;
        })}</div>
      </section>
      
    </>}
    <ConfirmDialog
      request={pendingChange?({
        title:pendingChange.state==='published'?'Publish class group':'Archive class group',
        message:pendingChange.state==='published'
          ?'Publish all '+pendingChange.group.rows.length+' subjects to the assigned tutors and students?'
          :'Archive this class group and revoke its joining links?',
        confirmLabel:pendingChange.state==='published'?'Publish':'Archive',
        danger:pendingChange.state==='archived',
      } satisfies ConfirmChoice):null}
      onCancel={()=>setPendingChange(null)}
      onConfirm={()=>{const next=pendingChange;setPendingChange(null);
        if(next)void changeState(next.group,next.state);}}/>
    {profileTarget&&<ChatMemberProfileOverlay
      userId={profileTarget.auth_user_id} fallbackName={profileTarget.full_name}
      contextItems={[
        {label:'Current classes',value:(studentClassNames.get(profileTarget.auth_user_id)??[]).join(', ')||'No active class recorded'},
        {label:'Class being assigned',value:targetClassName},
      ]}
      confirmLabel={chosenSet.has(profileTarget.auth_user_id)?'Remove from selection':'Select this student'}
      onConfirm={()=>{
        const alreadyChosen=chosenSet.has(profileTarget.auth_user_id);
        if(!alreadyChosen&&capacity!==null&&chosen.length>=capacity){
          setError('This class has reached its '+capacity+'-student limit.');
          return;
        }
        setStudent(profileTarget.auth_user_id,!alreadyChosen);
        setProfileTarget(null);
      }}
      onClose={()=>setProfileTarget(null)}/>}
  </div>;
}
