import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, CircleOff, ClipboardCheck, GraduationCap, LockKeyhole, Plus, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './AcademicAssignmentsPage.css';

type Role = 'tutor' | 'student';
type Member = { auth_user_id: string; full_name: string; email: string; role: Role; status: 'active' };
type Offering = { id: string; course_id: string; cohort_id: string; is_active: boolean };
type Course = { id: string; title: string; is_active: boolean };
type Cohort = { id: string; name: string; is_active: boolean };
type MemberLink = { id: string; offering_id: string; is_active: boolean; tutor_id?: string; student_id?: string };
type Table = 'tutor_assignments' | 'student_enrolments';

export default function AcademicAssignmentsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [tutors, setTutors] = useState<MemberLink[]>([]);
  const [learners, setLearners] = useState<MemberLink[]>([]);
  const [offeringId, setOfferingId] = useState('');
  const [tutorId, setTutorId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) { setError('Supabase is not configured.'); setLoading(false); return; }
    setLoading(true);
    const [m,o,c,h,t,s] = await Promise.all([
      supabase.from('authorised_users').select('auth_user_id,full_name,email,role,status')
        .eq('status','active').in('role',['tutor','student']).order('full_name'),
      supabase.from('course_offerings').select('id,course_id,cohort_id,is_active'),
      supabase.from('courses').select('id,title,is_active'),
      supabase.from('cohorts').select('id,name,is_active'),
      supabase.from('tutor_assignments').select('id,offering_id,tutor_id,is_active'),
      supabase.from('student_enrolments').select('id,offering_id,student_id,is_active'),
    ]);
    if (m.error || o.error || c.error || h.error || t.error || s.error) {
      setError('Could not load the live class assignment registry. Check your role or refresh.');
    } else {
      setMembers((m.data ?? []).filter(x => !!x.auth_user_id) as Member[]);
      setOfferings((o.data ?? []) as Offering[]);
      setCourses((c.data ?? []) as Course[]);
      setCohorts((h.data ?? []) as Cohort[]);
      setTutors((t.data ?? []) as MemberLink[]);
      setLearners((s.data ?? []) as MemberLink[]);
      setError(null);
    }
    setLoading(false);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const availableOfferings = useMemo(() => offerings.filter(o =>
    o.is_active && courses.some(c => c.id===o.course_id && c.is_active) &&
    cohorts.some(h => h.id===o.cohort_id && h.is_active)),[offerings,courses,cohorts]);
  const availableTutors = members.filter(m => m.role==='tutor');
  const availableStudents = members.filter(m => m.role==='student');
  const pickedOffering = availableOfferings.some(o=>o.id===offeringId)
    ? offeringId : availableOfferings[0]?.id ?? '';
  const pickedTutor = availableTutors.some(m=>m.auth_user_id===tutorId)
    ? tutorId : availableTutors[0]?.auth_user_id ?? '';
  const pickedStudent = availableStudents.some(m=>m.auth_user_id===studentId)
    ? studentId : availableStudents[0]?.auth_user_id ?? '';

  const courseTitle = (id: string) => courses.find(x=>x.id===id)?.title ?? 'Course unavailable';
  const cohortTitle = (id: string) => cohorts.find(x=>x.id===id)?.name ?? 'Cohort unavailable';
  const offeringTitle = (id: string) => {
    const o=offerings.find(x=>x.id===id);
    return o ? `${courseTitle(o.course_id)} · ${cohortTitle(o.cohort_id)}` : 'Offering unavailable';
  };
  const memberName = (id: string) => members.find(x=>x.auth_user_id===id)?.full_name ??
    'Member not currently authorised';

  async function addLink(table: Table, userId: string) {
    if (!supabase || busy || !pickedOffering || !userId) return;
    setBusy(table); setError(null); setNotice(null);
    const payload = table==='tutor_assignments'
      ? { offering_id:pickedOffering,tutor_id:userId }
      : { offering_id:pickedOffering,student_id:userId };
    const { error: writeError } = await supabase.from(table).insert(payload);
    if (writeError) {
      setError(writeError.code==='23505'
        ? 'This person already has a record for the selected offering. Reactivate an inactive link instead.'
        : writeError.code==='23514'
        ? 'The person or course offering does not meet the required active role and identity checks.'
        : 'Assignment not saved. Check your permissions and selections.');
    } else {
      setNotice(table==='tutor_assignments'
        ? 'Tutor assigned. The change is stored and audited.'
        : 'Student enrolled. The change is stored and audited.');
      await refresh();
    }
    setBusy(null);
  }

  function submit(event: FormEvent<HTMLFormElement>, table: Table) {
    event.preventDefault();
    void addLink(table,table==='tutor_assignments'?pickedTutor:pickedStudent);
  }

  async function toggle(table: Table, row: MemberLink) {
    if (!supabase || busy) return;
    const label=table==='tutor_assignments'?'tutor assignment':'student enrolment';
    if (row.is_active && !window.confirm(
      `Deactivate this ${label}? The account remains registered and the audit history is retained.`,
    )) return;
    setBusy(row.id);setNotice(null);setError(null);
    const { data, error: writeError } = await supabase.from(table)
      .update({is_active:!row.is_active}).eq('id',row.id).select('id').maybeSingle();
    if (writeError || !data) {
      setError('Could not update the link. It may no longer satisfy the active-role requirements.');
    } else {
      setNotice('Assignment status updated in Supabase and recorded in the audit log.');
      await refresh();
    }
    setBusy(null);
  }

  function Section({ role, rows, table }: { role: Role; rows: MemberLink[]; table: Table }) {
    const students = role==='student';
    const chosen = students?pickedStudent:pickedTutor;
    const selectName=students?'student':'tutor';
    const choices=students?availableStudents:availableTutors;
    return <section className="panel academic-panel academic-assign-panel">
      <div className="panel-heading"><div>
        <p className="section-kicker">{students?'02 · LEARNERS':'01 · EDUCATORS'}</p>
        <h2>{students?'Student enrolments':'Tutor assignments'}</h2>
      </div></div>
      <form className="academic-form academic-members-form" onSubmit={e=>submit(e,table)}>
        <label htmlFor={selectName+'-assignment-select'}>{students?'Active student':'Active tutor'}</label>
        <select id={selectName+'-assignment-select'} value={chosen}
          onChange={e => students?setStudentId(e.target.value):setTutorId(e.target.value)}>
          {choices.map(m=><option key={m.auth_user_id} value={m.auth_user_id}>
            {m.full_name} ({m.email})
          </option>)}
        </select>
        {!choices.length && <p className="academic-code-hint">
          No authorised {selectName} account exists yet. Invite only an approved DLI member
          through <Link to="/users">Users &amp; access</Link>.
        </p>}
        <button className="academic-submit" type="submit"
          disabled={loading||Boolean(busy)||!pickedOffering||!chosen}>
          <Plus size={15}/>{busy===table?'Saving…':students?'Enrol student':'Assign tutor'}
        </button>
      </form>
      <div className="academic-record-list academic-members-list">
        {rows.map(row=><div className="academic-record" key={row.id}>
          <div className="academic-record-text">
            <strong>{memberName((students?row.student_id:row.tutor_id) ?? '')}</strong>
            <small>{offeringTitle(row.offering_id)}</small>
          </div>
          <span className={row.is_active?'academic-badge active':'academic-badge inactive'}>
            {row.is_active?'Active':'Inactive'}
          </span>
          <button className="academic-toggle" type="button" disabled={Boolean(busy)}
            onClick={()=>{void toggle(table,row);}}>
            {row.is_active?<CircleOff size={15}/>:<CheckCircle2 size={15}/>}
            {row.is_active?'Deactivate':'Reactivate'}
          </button>
        </div>)}
        {!loading&&rows.length===0&&<p className="academic-empty">
          No {students?'student enrolments':'tutor assignments'} have been recorded.
        </p>}
      </div>
    </section>;
  }

  return <div className="module-page academic-assignments-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><Users size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> ACADEMIC OPERATIONS</div>
        <h1>Class assignments</h1>
        <p>Assign verified tutors and enrol authorised students into approved course offerings.</p>
      </div>
      <span className="module-status"><span/> Stage D3</span>
    </div>
    <div className="module-notice">
      <div className="notice-icon"><ShieldCheck size={20}/></div>
      <div><strong>Only existing authorised DLI identities can be assigned</strong>
        <p>Each person must have the correct active role. PostgreSQL validates the identity and
        offering and writes an audit event. Assignments are not invitations, lessons, or attendance.</p>
      </div>
    </div>
    {error&&<p role="alert" className="auth-feedback error">{error}</p>}
    {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
    <div className="academic-summary">
      <div><GraduationCap size={18}/><strong>{availableOfferings.length}</strong><span>Active offerings</span></div>
      <div><Users size={18}/><strong>{availableTutors.length}</strong><span>Authorised tutors</span></div>
      <div><ClipboardCheck size={18}/><strong>{availableStudents.length}</strong><span>Authorised students</span></div>
      <div><BookOpen size={18}/><strong>{tutors.filter(x=>x.is_active).length+learners.filter(x=>x.is_active).length}</strong><span>Active class links</span></div>
    </div>
    <div className="academic-top-actions">
      <p role="status">{loading?'Loading authorised class members…':'Live DLI development records'}</p>
      <button type="button" className="user-outline-button" disabled={loading||Boolean(busy)}
        onClick={()=>{void refresh();}}><RefreshCw size={15}/> Refresh</button>
    </div>
    <section className="panel academic-assign-offering">
      <label htmlFor="d3-offering">Select an approved active course offering</label>
      <select id="d3-offering" value={pickedOffering} onChange={e=>setOfferingId(e.target.value)}>
        {availableOfferings.map(o=><option value={o.id} key={o.id}>
          {offeringTitle(o.id)}
        </option>)}
      </select>
      {!availableOfferings.length&&<p className="academic-empty">
        No active offering exists yet. Create an approved course and cohort in
        <Link to="/cohorts"> Cohorts &amp; topics</Link> first.
      </p>}
    </section>
    <div className="academic-columns">
      <Section role="tutor" rows={tutors} table="tutor_assignments"/>
      <Section role="student" rows={learners} table="student_enrolments"/>
    </div>
    <div className="module-footnote"><LockKeyhole size={15}/>
      Only staff administrators can manage assignments. Enrolled students and assigned tutors
      will see their own classes under My classes.
    </div>
  </div>;
}
