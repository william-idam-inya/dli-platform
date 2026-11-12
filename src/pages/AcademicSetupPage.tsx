import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BookOpen, CheckCircle2, CircleOff, GraduationCap, Layers3, LibraryBig,
  Plus, RefreshCw, School, ShieldCheck,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import { Link } from 'react-router-dom';

type CatalogueTable = 'programmes' | 'academic_levels' | 'subjects' | 'courses';

type BaseRecord = { id: string; is_active: boolean };
type Programme = BaseRecord & {
  code: string; name: string; description: string; created_at: string;
};
type AcademicLevel = BaseRecord & {
  code: string; name: string; sort_order: number; created_at: string;
};
type Subject = BaseRecord & {
  academic_level_id: string; code: string; name: string;
};
type Course = BaseRecord & {
  programme_id: string; academic_level_id: string; subject_id: string;
  title: string; description: string; created_at: string;
};

function codeFor(label: string): string {
  return label.toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60).replace(/-+$/g, '');
}

function Badge({ active }: { active: boolean }) {
  return <span className={active ? 'academic-badge active' : 'academic-badge inactive'}>
    {active ? 'Active' : 'Inactive'}
  </span>;
}

function ActionButton({ active, disabled, onClick }: {
  active: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button type="button" className="academic-toggle" onClick={onClick} disabled={disabled}>
      {active ? <CircleOff size={15}/> : <CheckCircle2 size={15}/>}
      {active ? 'Deactivate' : 'Activate'}
    </button>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  return message ? <p role="alert" className="auth-feedback error">{message}</p> : null;
}

export default function AcademicSetupPage() {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [levels, setLevels] = useState<AcademicLevel[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [programmeName, setProgrammeName] = useState('');
  const [programmeDescription, setProgrammeDescription] = useState('');
  const [levelName, setLevelName] = useState('');
  const [levelOrder, setLevelOrder] = useState('100');
  const [chosenLevel, setChosenLevel] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [courseProgramme, setCourseProgramme] = useState('');
  const [courseLevel, setCourseLevel] = useState('');
  const [courseSubject, setCourseSubject] = useState('');
  const [courseTitle, setCourseTitle] = useState('');
  const [courseDescription, setCourseDescription] = useState('');

  const refresh = useCallback(async () => {
    if (!supabase) {
      setError('The Supabase connection is not configured.');
      setLoading(false);
      return;
    }
    setLoading(true);
    const [programmesResult, levelsResult, subjectsResult, coursesResult] = await Promise.all([
      supabase.from('programmes').select('id,code,name,description,is_active,created_at')
        .order('name'),
      supabase.from('academic_levels').select('id,code,name,sort_order,is_active,created_at')
        .order('sort_order').order('name'),
      supabase.from('subjects').select('id,academic_level_id,code,name,is_active')
        .order('name'),
      supabase.from('courses').select('id,programme_id,academic_level_id,subject_id,title,description,is_active,created_at')
        .order('created_at', { ascending: false }),
    ]);
    if (programmesResult.error || levelsResult.error || subjectsResult.error || coursesResult.error) {
      setError('Could not load the academic catalogue. Check your permissions or try Refresh.');
    } else {
      setProgrammes((programmesResult.data ?? []) as Programme[]);
      setLevels((levelsResult.data ?? []) as AcademicLevel[]);
      setSubjects((subjectsResult.data ?? []) as Subject[]);
      setCourses((coursesResult.data ?? []) as Course[]);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const activeProgrammes = programmes.filter(item => item.is_active);
  const activeLevels = levels.filter(item => item.is_active);
  const chosenLevelId = levels.some(item => item.id === chosenLevel)
    ? chosenLevel : levels[0]?.id ?? '';
  const courseProgrammeId = activeProgrammes.some(item => item.id === courseProgramme)
    ? courseProgramme : activeProgrammes[0]?.id ?? '';
  const courseLevelId = activeLevels.some(item => item.id === courseLevel)
    ? courseLevel : activeLevels[0]?.id ?? '';
  const subjectOptions = subjects.filter(
    subject => subject.academic_level_id === courseLevelId && subject.is_active,
  );
  const courseSubjectId = subjectOptions.some(item => item.id === courseSubject)
    ? courseSubject : subjectOptions[0]?.id ?? '';

  const levelSubjects = useMemo(() => subjects.filter(
    subject => subject.academic_level_id === chosenLevelId,
  ), [subjects, chosenLevelId]);

  async function create(table: CatalogueTable, values: Record<string, unknown>,
    successMessage: string, reset: () => void) {
    if (!supabase || saving) return;
    setSaving(table);
    setError(null);
    setNotice(null);
    const { error: writeError } = await supabase.from(table).insert(values);
    if (writeError) {
      setError(writeError.code === '23505'
        ? 'A record with this code or course title already exists in the selected catalogue.'
        : writeError.code === '23503'
          ? 'The selected academic relationship is no longer valid. Refresh and retry.'
          : 'The record was not saved. Check the entries and your permissions.');
    } else {
      reset();
      setNotice(successMessage);
      await refresh();
    }
    setSaving(null);
  }

  async function toggle(table: CatalogueTable, item: BaseRecord, name: string) {
    if (!supabase || saving) return;
    if (item.is_active && !window.confirm(
      `Deactivate "${name}"? This hides it from new selections but preserves existing records.`,
    )) return;
    setSaving(item.id);
    setError(null);
    setNotice(null);
    const { data, error: writeError } = await supabase.from(table)
      .update({ is_active: !item.is_active })
      .eq('id', item.id).select('id').maybeSingle();
    if (writeError || !data) {
      setError('The status could not be updated. Your permissions or the record may have changed.');
    } else {
      setNotice(`"${name}" is now ${item.is_active ? 'inactive' : 'active'}.`);
      await refresh();
    }
    setSaving(null);
  }

  function submitProgramme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = programmeName.trim();
    const code = codeFor(name);
    if (name.length < 2 || code.length < 2) {
      setError('Enter a programme name that produces a valid code.');
      return;
    }
    void create('programmes', { name, code, description: programmeDescription.trim() },
      'Programme saved to Supabase.', () => {
        setProgrammeName(''); setProgrammeDescription('');
      });
  }

  function submitLevel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = levelName.trim();
    const code = codeFor(name);
    const sortOrder = Number(levelOrder);
    if (name.length < 2 || code.length < 2 || !Number.isInteger(sortOrder) ||
        sortOrder < 0 || sortOrder > 10000) {
      setError('Enter a valid academic level and order between 0 and 10000.');
      return;
    }
    void create('academic_levels', { name, code, sort_order: sortOrder },
      'Academic level saved to Supabase.', () => {
        setLevelName(''); setLevelOrder('100');
      });
  }

  function submitSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = subjectName.trim();
    const code = codeFor(name);
    if (!chosenLevelId || name.length < 2 || code.length < 2) {
      setError('Choose an academic level and enter a valid subject name.');
      return;
    }
    void create('subjects', { academic_level_id: chosenLevelId, name, code },
      'Subject saved to Supabase.', () => setSubjectName(''));
  }

  function submitCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = courseTitle.trim();
    if (!courseProgrammeId || !courseLevelId || !courseSubjectId || title.length < 2) {
      setError('Choose an active programme, level and subject, and enter a course title.');
      return;
    }
    void create('courses', {
      programme_id: courseProgrammeId,
      academic_level_id: courseLevelId,
      subject_id: courseSubjectId,
      title, description: courseDescription.trim(),
    }, 'Course saved to Supabase.', () => {
      setCourseTitle(''); setCourseDescription('');
    });
  }

  const programmeNameFor = (id: string) => programmes.find(item => item.id === id)?.name ?? 'Unknown programme';
  const levelNameFor = (id: string) => levels.find(item => item.id === id)?.name ?? 'Unknown level';
  const subjectNameFor = (id: string) => subjects.find(item => item.id === id)?.name ?? 'Unknown subject';

  return (
    <div className="module-page academic-page">
      <div className="module-page-hero">
        <span className="module-page-icon"><School size={25}/></span>
        <div className="module-page-copy">
          <div className="eyebrow"><span className="eyebrow-line"/> ACADEMIC OPERATIONS</div>
          <h1>Academic setup</h1>
          <p>Maintain the institutional programme, level, subject and course catalogue.</p>
        </div>
        <span className="module-status"><span/> Stage D1</span>
      </div>

      <div className="module-notice">
        <div className="notice-icon"><ShieldCheck size={20}/></div>
        <div>
          <strong>Real records, protected by Supabase permissions</strong>
          <p>Only the Owner, Admin or Academic Coordinator may edit these catalogues.
            Changes persist in PostgreSQL. Deactivation preserves the record.
            Cohorts, tutor assignments and student enrolments are the next Stage D steps.</p>
        </div>
      </div>

      {notice && <p role="status" className="auth-feedback success">{notice}</p>}
      <ErrorMessage message={error}/>
      <div className="academic-summary">
        <div><LibraryBig size={18}/><strong>{programmes.length}</strong><span>Programmes</span></div>
        <div><Layers3 size={18}/><strong>{levels.length}</strong><span>Levels</span></div>
        <div><BookOpen size={18}/><strong>{subjects.length}</strong><span>Subjects</span></div>
        <div><GraduationCap size={18}/><strong>{courses.length}</strong><span>Courses</span></div>
      </div>
      <div className="academic-top-actions">
        <p>{loading ? 'Loading the live catalogue…' : 'Showing live DLI development records'}</p>
        <button type="button" className="user-outline-button" disabled={loading || Boolean(saving)}
          onClick={() => { void refresh(); }}><RefreshCw size={16}/> Refresh catalogue</button>
      </div>

      <div className="academic-columns">
        <section className="panel academic-panel">
          <div className="panel-heading"><div>
            <p className="section-kicker">01 · INSTITUTION</p>
            <h2>Programmes</h2>
          </div></div>
          {loading ? <p role="status" className="academic-empty">Loading programmes…</p> :
            <div className="academic-record-list">
              {programmes.map(item => <div className="academic-record" key={item.id}>
                <div className="academic-record-text">
                  <strong>{item.name}</strong><small>{item.code}</small>
                </div>
                <Badge active={item.is_active}/>
                <ActionButton active={item.is_active} disabled={Boolean(saving)}
                  onClick={() => { void toggle('programmes', item, item.name); }}/>
              </div>)}
              {programmes.length === 0 && <p className="academic-empty">No programmes recorded.</p>}
            </div>}
          <form className="academic-form" onSubmit={submitProgramme}>
            <h3><Plus size={15}/> Add programme</h3>
            <label htmlFor="programme-name">Programme name</label>
            <input id="programme-name" required minLength={2} maxLength={160} value={programmeName}
              onChange={event=>setProgrammeName(event.target.value)} placeholder="Name approved by DLI"/>
            <label htmlFor="programme-description">Description (optional)</label>
            <textarea id="programme-description" maxLength={1000} rows={2}
              value={programmeDescription} onChange={event=>setProgrammeDescription(event.target.value)}/>
            <p className="academic-code-hint">Code: {codeFor(programmeName) || 'generated-from-name'}</p>
            <button type="submit" className="academic-submit" disabled={Boolean(saving) || loading}>
              <Plus size={15}/> {saving === 'programmes' ? 'Saving programme…' : 'Save programme'}
            </button>
          </form>
        </section>

        <section className="panel academic-panel">
          <div className="panel-heading"><div>
            <p className="section-kicker">02 · DIVISIONS</p>
            <h2>Academic levels</h2>
          </div></div>
          {loading ? <p role="status" className="academic-empty">Loading levels…</p> :
            <div className="academic-record-list">
              {levels.map(item => <div className="academic-record" key={item.id}>
                <div className="academic-record-text">
                  <strong>{item.name}</strong><small>{item.code} · Order {item.sort_order}</small>
                </div>
                <Badge active={item.is_active}/>
                <ActionButton active={item.is_active} disabled={Boolean(saving)}
                  onClick={() => { void toggle('academic_levels', item, item.name); }}/>
              </div>)}
              {levels.length === 0 && <p className="academic-empty">No levels recorded.</p>}
            </div>}
          <form className="academic-form" onSubmit={submitLevel}>
            <h3><Plus size={15}/> Add academic level</h3>
            <label htmlFor="level-name">Level name</label>
            <input id="level-name" required minLength={2} maxLength={160} value={levelName}
              onChange={event=>setLevelName(event.target.value)} placeholder="New approved academic level"/>
            <label htmlFor="level-order">Display order</label>
            <input id="level-order" type="number" required min={0} max={10000}
              value={levelOrder} onChange={event=>setLevelOrder(event.target.value)}/>
            <p className="academic-code-hint">Code: {codeFor(levelName) || 'generated-from-name'}</p>
            <button type="submit" className="academic-submit" disabled={Boolean(saving) || loading}>
              <Plus size={15}/> {saving === 'academic_levels' ? 'Saving level…' : 'Save academic level'}
            </button>
          </form>
        </section>
      </div>

      <div className="academic-columns">
        <section className="panel academic-panel">
          <div className="panel-heading"><div>
            <p className="section-kicker">03 · SUBJECTS</p>
            <h2>Subject catalogue</h2>
          </div></div>
          <label className="academic-filter" htmlFor="subjects-level">View subjects for</label>
          <select id="subjects-level" value={chosenLevelId} onChange={event => setChosenLevel(event.target.value)}>
            {levels.map(item => <option value={item.id} key={item.id}>{item.name}{item.is_active ? '' : ' (inactive)'}</option>)}
          </select>
          {loading ? <p role="status" className="academic-empty">Loading subjects…</p> :
            <div className="academic-record-list">
              {levelSubjects.map(item => <div className="academic-record" key={item.id}>
                <div className="academic-record-text">
                  <strong>{item.name}</strong><small>{item.code}</small>
                </div>
                <Badge active={item.is_active}/>
                <ActionButton active={item.is_active} disabled={Boolean(saving)}
                  onClick={() => { void toggle('subjects', item, item.name); }}/>
              </div>)}
              {levelSubjects.length === 0 && <p className="academic-empty">No subjects for this level yet.</p>}
            </div>}
          <form className="academic-form" onSubmit={submitSubject}>
            <h3><Plus size={15}/> Add subject to selected level</h3>
            <label htmlFor="subject-name">Subject name</label>
            <input id="subject-name" required minLength={2} maxLength={160}
              value={subjectName} onChange={event=>setSubjectName(event.target.value)}
              placeholder="Name approved by DLI"/>
            <p className="academic-code-hint">Code: {codeFor(subjectName) || 'generated-from-name'}</p>
            <button className="academic-submit" type="submit"
              disabled={Boolean(saving) || loading || !chosenLevelId}>
              <Plus size={15}/> {saving === 'subjects' ? 'Saving subject…' : 'Save subject'}
            </button>
          </form>
        </section>

        <section className="panel academic-panel">
          <div className="panel-heading"><div>
            <p className="section-kicker">04 · COURSES</p>
            <h2>Course catalogue</h2>
          </div></div>
          <form className="academic-form academic-course-form" onSubmit={submitCourse}>
            <label htmlFor="course-programme">Programme</label>
            <select id="course-programme" value={courseProgrammeId}
              onChange={event=>setCourseProgramme(event.target.value)} required>
              {activeProgrammes.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            <label htmlFor="course-level">Academic level</label>
            <select id="course-level" value={courseLevelId}
              onChange={event=>{setCourseLevel(event.target.value); setCourseSubject('');}} required>
              {activeLevels.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            <label htmlFor="course-subject">Subject</label>
            <select id="course-subject" value={courseSubjectId}
              onChange={event=>setCourseSubject(event.target.value)} required>
              {subjectOptions.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            {courseLevelId && subjectOptions.length === 0 && (
              <p className="academic-code-hint">Add an active subject to this level first.</p>
            )}
            <label htmlFor="course-title">Course title</label>
            <input id="course-title" required minLength={2} maxLength={180} value={courseTitle}
              onChange={event=>setCourseTitle(event.target.value)}
              placeholder="e.g. course title approved by DLI"/>
            <label htmlFor="course-description">Description (optional)</label>
            <textarea id="course-description" rows={2} maxLength={1000}
              value={courseDescription} onChange={event=>setCourseDescription(event.target.value)}/>
            <button className="academic-submit" type="submit"
              disabled={Boolean(saving) || loading || !courseProgrammeId || !courseSubjectId}>
              <Plus size={15}/> {saving === 'courses' ? 'Saving course…' : 'Create course'}
            </button>
          </form>
          <div className="academic-record-list academic-course-list">
            {courses.map(item => <div className="academic-record" key={item.id}>
              <div className="academic-record-text">
                <strong>{item.title}</strong>
                <small>{programmeNameFor(item.programme_id)} · {levelNameFor(item.academic_level_id)}</small>
                <small>{subjectNameFor(item.subject_id)}</small>
              </div>
              <Badge active={item.is_active}/>
              <ActionButton active={item.is_active} disabled={Boolean(saving)}
                onClick={() => { void toggle('courses', item, item.title); }}/>
            </div>)}
            {!loading && courses.length === 0 && (
              <p className="academic-empty">No courses yet. Choose an active subject and create the first course.</p>
            )}
          </div>
        </section>
      </div>
      <div className="module-footnote">
        <ShieldCheck size={15}/> Subjects and courses form the reusable learning catalogue.
        Enrol one or multiple students and allocate a tutor through
        <Link to="/classes" className="text-link"> Classes &amp; timetable</Link>.
        Existing course-specific topics and cohort offerings remain available under
        <Link to="/cohorts" className="text-link"> Advanced curriculum tools</Link>.
      </div>
    </div>
  );
}
