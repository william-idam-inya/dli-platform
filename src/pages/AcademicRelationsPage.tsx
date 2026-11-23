import {confirmAction} from '../components/ConfirmationDialogService';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, CircleOff, GraduationCap, Layers3, Plus, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './AcademicRelationsPage.css';

type RecordStatus = { id: string; is_active: boolean };
type Programme = RecordStatus & { name: string };
type Level = RecordStatus & { name: string; sort_order: number };
type Course = RecordStatus & { title: string; programme_id: string; academic_level_id: string };
type Topic = RecordStatus & { course_id: string; title: string; sort_order: number };
type Cohort = RecordStatus & {
  name: string; programme_id: string; academic_level_id: string;
  starts_on: string | null; ends_on: string | null;
};
type Offering = RecordStatus & {
  course_id: string; cohort_id: string; programme_id: string; academic_level_id: string;
};
type AcademicTable = 'topics' | 'cohorts' | 'course_offerings';

function AcademicStatus({ active }: { active: boolean }) {
  return <span className={active ? 'academic-badge active' : 'academic-badge inactive'}>
    {active ? 'Active' : 'Inactive'}
  </span>;
}

export default function AcademicRelationsPage() {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [levels, setLevels] = useState<Level[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [topicCourse, setTopicCourse] = useState('');
  const [topicTitle, setTopicTitle] = useState('');
  const [topicOrder, setTopicOrder] = useState('100');

  const [cohortName, setCohortName] = useState('');
  const [cohortProgramme, setCohortProgramme] = useState('');
  const [cohortLevel, setCohortLevel] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [offeringCohort, setOfferingCohort] = useState('');
  const [offeringCourse, setOfferingCourse] = useState('');

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError('DLI services are temporarily unavailable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    const [p,l,c,t,h,o] = await Promise.all([
      supabase.from('programmes').select('id,name,is_active').order('name'),
      supabase.from('academic_levels').select('id,name,sort_order,is_active').order('sort_order'),
      supabase.from('courses').select('id,title,programme_id,academic_level_id,is_active').order('title'),
      supabase.from('topics').select('id,course_id,title,sort_order,is_active').order('sort_order').order('title'),
      supabase.from('cohorts').select('id,name,programme_id,academic_level_id,starts_on,ends_on,is_active').order('name'),
      supabase.from('course_offerings').select('id,course_id,cohort_id,programme_id,academic_level_id,is_active')
        .order('created_at',{ascending:false}),
    ]);
    if (p.error || l.error || c.error || t.error || h.error || o.error) {
      setError('The academic relationships could not be loaded. Refresh and check your account permissions.');
    } else {
      setProgrammes(p.data ?? []);
      setLevels(l.data ?? []);
      setCourses(c.data ?? []);
      setTopics(t.data ?? []);
      setCohorts(h.data ?? []);
      setOfferings(o.data ?? []);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const activeProgrammes = programmes.filter(p => p.is_active);
  const activeLevels = levels.filter(l => l.is_active);
  const activeCourses = courses.filter(c => c.is_active);
  const activeCohorts = cohorts.filter(c => c.is_active);

  const currentTopicCourse = activeCourses.some(c => c.id === topicCourse)
    ? topicCourse : activeCourses[0]?.id ?? '';
  const currentProgramme = activeProgrammes.some(p => p.id === cohortProgramme)
    ? cohortProgramme : activeProgrammes[0]?.id ?? '';
  const currentLevel = activeLevels.some(l => l.id === cohortLevel)
    ? cohortLevel : activeLevels[0]?.id ?? '';
  const currentCohort = activeCohorts.some(c => c.id === offeringCohort)
    ? offeringCohort : activeCohorts[0]?.id ?? '';
  const selectedCohort = cohorts.find(c => c.id === currentCohort);
  const eligibleCourses = useMemo(() => selectedCohort
    ? activeCourses.filter(c => c.programme_id === selectedCohort.programme_id &&
        c.academic_level_id === selectedCohort.academic_level_id)
    : [], [activeCourses, selectedCohort]);
  const currentOfferingCourse = eligibleCourses.some(c => c.id === offeringCourse)
    ? offeringCourse : eligibleCourses[0]?.id ?? '';

  const programmeName = (id: string) => programmes.find(p => p.id === id)?.name ?? 'Unknown programme';
  const levelName = (id: string) => levels.find(l => l.id === id)?.name ?? 'Unknown level';
  const courseTitle = (id: string) => courses.find(c => c.id === id)?.title ?? 'Unknown course';
  const cohortNameFor = (id: string) => cohorts.find(c => c.id === id)?.name ?? 'Unknown cohort';

  async function create(table: AcademicTable, values: Record<string, unknown>,
    success: string, clear: () => void) {
    if (!supabase || busy) return;
    setBusy(table);
    setError(null); setNotice(null);
    const { error: writeError } = await supabase.from(table).insert(values);
    if (writeError) {
      setError(writeError.code === '23505'
        ? 'A matching record already exists. Choose a distinct name or selection.'
        : writeError.code === '23503' || writeError.code === '23514'
        ? 'This relationship is invalid or references an inactive catalogue item. Refresh and try again.'
        : 'The record could not be saved. Check your permissions and the supplied values.');
    } else {
      clear();
      setNotice(success);
      await refresh();
    }
    setBusy(null);
  }

  async function toggle(table: AcademicTable, row: RecordStatus, name: string) {
    if (!supabase || busy) return;
    if (row.is_active && !await confirmAction(
      `Deactivate "${name}"? The record will remain stored and can be reactivated.`,
    )) return;
    setBusy(row.id);
    setError(null); setNotice(null);
    const { data, error: writeError } = await supabase.from(table)
      .update({ is_active: !row.is_active })
      .eq('id', row.id).select('id').maybeSingle();
    if (writeError || !data) {
      setError('Could not save the status change. Please refresh and retry.');
    } else {
      setNotice(`"${name}" is now ${row.is_active ? 'inactive' : 'active'}.`);
      await refresh();
    }
    setBusy(null);
  }

  function submitTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = topicTitle.trim();
    const sortOrder = Number(topicOrder);
    if (!currentTopicCourse || title.length < 2 || !Number.isInteger(sortOrder) ||
        sortOrder < 0 || sortOrder > 10000) {
      setError('Choose an active course, a topic title and a valid display order.');
      return;
    }
    void create('topics', { course_id: currentTopicCourse, title, sort_order: sortOrder },
      'Topic saved to the DLI catalogue.', () => { setTopicTitle(''); setTopicOrder('100'); });
  }

  function submitCohort(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = cohortName.trim();
    if (name.length < 2 || !currentProgramme || !currentLevel ||
      (startsOn && endsOn && endsOn < startsOn)) {
      setError('Enter a cohort name, active programme and level, and a valid date range.');
      return;
    }
    void create('cohorts', {
      programme_id:currentProgramme, academic_level_id:currentLevel, name,
      starts_on: startsOn || null, ends_on: endsOn || null,
    }, 'Cohort saved to the DLI catalogue.', () => {
      setCohortName(''); setStartsOn(''); setEndsOn('');
    });
  }

  function submitOffering(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCohort || !currentOfferingCourse) {
      setError('Select an active cohort and a matching active course first.');
      return;
    }
    void create('course_offerings', {
      cohort_id: selectedCohort.id,
      course_id: currentOfferingCourse,
      programme_id: selectedCohort.programme_id,
      academic_level_id: selectedCohort.academic_level_id,
    }, 'Course offering saved in the advanced catalogue. New class tutor and student assignments are managed together in Classes & timetable.',
    () => setOfferingCourse(''));
  }

  function Toggle({ table, row, label }: { table: AcademicTable; row: RecordStatus; label: string }) {
    return <button type="button" className="academic-toggle" disabled={Boolean(busy)}
      onClick={() => { void toggle(table,row,label); }}>
      {row.is_active ? <CircleOff size={15}/> : <CheckCircle2 size={15}/>}
      {row.is_active ? 'Deactivate' : 'Activate'}
    </button>;
  }

  return <div className="module-page academic-relations">
    <Link to="/academics" className="back-link"><ArrowLeft size={16}/> Academic catalogue</Link>
    <div className="module-page-hero">
      <span className="module-page-icon"><Layers3 size={25}/></span>
      <div className="module-page-copy">
        <h1>Cohorts &amp; topics</h1>
        
      </div>

    </div>
    
    {error && <p className="auth-feedback error" role="alert">{error}</p>}
    {notice && <p className="auth-feedback success" role="status">{notice}</p>}
    <div className="academic-summary">
      <div><GraduationCap size={18}/><strong>{courses.length}</strong><span>Courses</span></div>
      <div><BookOpen size={18}/><strong>{topics.length}</strong><span>Topics</span></div>
      <div><Layers3 size={18}/><strong>{cohorts.length}</strong><span>Cohorts</span></div>
      <div><GraduationCap size={18}/><strong>{offerings.length}</strong><span>Course offerings</span></div>
    </div>
    <div className="academic-top-actions">
      {loading&&<p role="status">Loading live academic relationships…</p>}
      <button className="user-outline-button" type="button" disabled={loading || Boolean(busy)}
        onClick={() => { void refresh(); }}><RefreshCw size={16}/> Refresh</button>
      <Link className="user-outline-button" to="/classes">
        <GraduationCap size={16}/> Set up a class and assign tutors
      </Link>
    </div>
    <div className="academic-columns">
      <section className="panel academic-panel">
        <div className="panel-heading"><div><h2>Topics</h2>
        </div></div>
        <form className="academic-form academic-relations-form" onSubmit={submitTopic}>
          <label htmlFor="d2-topic-course">Course</label>
          <select id="d2-topic-course" value={currentTopicCourse} required
            onChange={e=>setTopicCourse(e.target.value)}>
            {activeCourses.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
          {!activeCourses.length && <p className="academic-code-hint">
            Create an approved course in Academic Setup before adding topics.
          </p>}
          <label htmlFor="d2-topic-title">Topic title</label>
          <input id="d2-topic-title" required minLength={2} maxLength={180}
            value={topicTitle} onChange={e=>setTopicTitle(e.target.value)}/>
          <label htmlFor="d2-topic-order">Display order</label>
          <input id="d2-topic-order" type="number" required min={0} max={10000}
            value={topicOrder} onChange={e=>setTopicOrder(e.target.value)}/>
          <button type="submit" className="academic-submit"
            disabled={Boolean(busy)||loading||!currentTopicCourse}>
            <Plus size={15}/>{busy==='topics'?'Saving topic…':'Add topic'}
          </button>
        </form>
        <div className="academic-record-list academic-relations-list">
          {topics.map(item=><div className="academic-record" key={item.id}>
            <div className="academic-record-text">
              <strong>{item.title}</strong>
              <small>{courseTitle(item.course_id)} · Order {item.sort_order}</small>
            </div>
            <AcademicStatus active={item.is_active}/>
            <Toggle table="topics" row={item} label={item.title}/>
          </div>)}
          {!loading && topics.length===0 && <p className="academic-empty">No topics recorded yet.</p>}
        </div>
      </section>

      <section className="panel academic-panel">
        <div className="panel-heading"><div><h2>Cohorts</h2>
        </div></div>
        <form className="academic-form academic-relations-form" onSubmit={submitCohort}>
          <label htmlFor="d2-cohort-name">Cohort name</label>
          <input id="d2-cohort-name" required minLength={2} maxLength={160}
            value={cohortName} onChange={e=>setCohortName(e.target.value)}
            placeholder="An approved cohort name"/>
          <label htmlFor="d2-cohort-programme">Programme</label>
          <select id="d2-cohort-programme" required value={currentProgramme}
            onChange={e=>setCohortProgramme(e.target.value)}>
            {activeProgrammes.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}
          </select>
          <label htmlFor="d2-cohort-level">Academic level</label>
          <select id="d2-cohort-level" required value={currentLevel}
            onChange={e=>setCohortLevel(e.target.value)}>
            {activeLevels.map(l=><option value={l.id} key={l.id}>{l.name}</option>)}
          </select>
          <div className="academic-relations-dates">
            <label htmlFor="d2-cohort-start">Start date (optional)
              <input id="d2-cohort-start" type="date" value={startsOn}
                onChange={e=>setStartsOn(e.target.value)}/>
            </label>
            <label htmlFor="d2-cohort-end">End date (optional)
              <input id="d2-cohort-end" type="date" value={endsOn}
                onChange={e=>setEndsOn(e.target.value)}/>
            </label>
          </div>
          <button className="academic-submit" type="submit"
            disabled={Boolean(busy)||loading||!currentProgramme||!currentLevel}>
            <Plus size={15}/>{busy==='cohorts'?'Saving cohort…':'Create cohort'}
          </button>
        </form>
        <div className="academic-record-list academic-relations-list">
          {cohorts.map(item=><div className="academic-record" key={item.id}>
            <div className="academic-record-text">
              <strong>{item.name}</strong>
              <small>{programmeName(item.programme_id)} · {levelName(item.academic_level_id)}</small>
              {(item.starts_on||item.ends_on) && <small>
                {item.starts_on||'Date not set'} – {item.ends_on||'Ongoing'}
              </small>}
            </div>
            <AcademicStatus active={item.is_active}/>
            <Toggle table="cohorts" row={item} label={item.name}/>
          </div>)}
          {!loading && cohorts.length===0 && <p className="academic-empty">No teaching cohorts yet.</p>}
        </div>
      </section>
    </div>
    <section className="panel academic-panel academic-offerings-panel">
      <div className="panel-heading"><div><h2>Course offerings</h2>
      </div></div>
      <p className="academic-empty">Attach a course to a cohort in the same programme and academic level.
        No tutor or learner is assigned by creating an offering.</p>
      <form className="academic-form academic-relations-form" onSubmit={submitOffering}>
        <label htmlFor="d2-offering-cohort">Teaching cohort</label>
        <select id="d2-offering-cohort" required value={currentCohort}
          onChange={e=>{setOfferingCohort(e.target.value);setOfferingCourse('');}}>
          {activeCohorts.map(h=><option key={h.id} value={h.id}>
            {h.name} · {levelName(h.academic_level_id)}
          </option>)}
        </select>
        <label htmlFor="d2-offering-course">Matching course</label>
        <select id="d2-offering-course" required value={currentOfferingCourse}
          onChange={e=>setOfferingCourse(e.target.value)}>
          {eligibleCourses.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        {!eligibleCourses.length && <p className="academic-code-hint">
          {activeCohorts.length
            ? 'No active course matches this cohort. Create a matching course in Academic Setup.'
            : 'Create a cohort first. A matching approved course is also required.'}
        </p>}
        <button className="academic-submit" type="submit"
          disabled={Boolean(busy)||loading||!currentCohort||!currentOfferingCourse}>
          <Plus size={15}/>{busy==='course_offerings'?'Saving offering…':'Create course offering'}
        </button>
      </form>
      <div className="academic-record-list academic-relations-list">
        {offerings.map(item=><div className="academic-record" key={item.id}>
          <div className="academic-record-text">
            <strong>{courseTitle(item.course_id)}</strong>
            <small>{cohortNameFor(item.cohort_id)} · {programmeName(item.programme_id)}</small>
            <small>{levelName(item.academic_level_id)}</small>
          </div>
          <AcademicStatus active={item.is_active}/>
          <Toggle table="course_offerings" row={item}
            label={courseTitle(item.course_id)+' in '+cohortNameFor(item.cohort_id)}/>
        </div>)}
        {!loading && offerings.length===0 && <p className="academic-empty">
          No course offerings yet. These are created after approved courses and cohorts exist.
        </p>}
      </div>
    </section>
    
  </div>;
}
