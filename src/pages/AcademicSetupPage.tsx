import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  BookOpen, CheckCircle2, CircleOff, GraduationCap, LibraryBig,
  Plus, RefreshCw, School, ShieldCheck, Settings2, ArrowRight,
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
  const [viewProgramme, setViewProgramme] = useState('');
  const [viewLevel, setViewLevel] = useState('');

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
  // This explorer shows approved active COURSE CATALOGUE records only.
  // A teaching class, scheduled offering, tutor or student access requires
  // separate approved course-offering and roster configuration.
  const availableCourses = useMemo(() => courses.filter(course =>
    course.is_active &&
    programmes.some(item => item.id === course.programme_id && item.is_active) &&
    levels.some(item => item.id === course.academic_level_id && item.is_active) &&
    subjects.some(item => item.id === course.subject_id &&
      item.academic_level_id === course.academic_level_id && item.is_active),
  ), [courses, programmes, levels, subjects]);
  const selectedProgramme = activeProgrammes.find(item => item.id === viewProgramme)
    ?? activeProgrammes[0] ?? null;
  const programmeCourses = availableCourses.filter(
    item => item.programme_id === selectedProgramme?.id,
  );
  const offeredLevels = activeLevels.filter(
    item => programmeCourses.some(course => course.academic_level_id === item.id),
  );
  const selectedLevel = offeredLevels.find(item => item.id === viewLevel)
    ?? offeredLevels[0] ?? null;
  const pathwayCourses = programmeCourses.filter(item =>
    item.academic_level_id === selectedLevel?.id &&
    programmeCourses.findIndex(other =>
      other.academic_level_id === item.academic_level_id &&
      other.subject_id === item.subject_id,
    ) === programmeCourses.indexOf(item),
  ).sort((a, b) => {
    const first = subjects.find(item => item.id === a.subject_id)?.name ?? a.title;
    const second = subjects.find(item => item.id === b.subject_id)?.name ?? b.title;
    return first.localeCompare(second);
  });

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
    if (courses.some(item => item.programme_id === courseProgrammeId &&
      item.academic_level_id === courseLevelId && item.subject_id === courseSubjectId)) {
      setError('This programme, level and subject already have a course. Use the existing course in Catalogue management.');
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
          <h1>Academic structure</h1>
          
        </div>
      </div>

      {notice && <p role="status" className="auth-feedback success">{notice}</p>}
      <ErrorMessage message={error}/>

      <div className="academic-top-actions">
        <p>{loading ? 'Loading the course catalogue…' : 'Current DLI catalogue · Live database records'}</p>
        <button type="button" className="user-outline-button" disabled={loading || Boolean(saving)}
          onClick={() => { void refresh(); }}><RefreshCw size={16}/> Refresh</button>
      </div>

      <div className="academic-overview-stats" aria-label="Academic catalogue totals">
        <div><LibraryBig size={19}/><strong>{activeProgrammes.length}</strong><span>Active programmes</span></div>
        <div><BookOpen size={19}/><strong>{subjects.filter(item => item.is_active).length}</strong><span>Subjects by level</span></div>
        <div><GraduationCap size={19}/><strong>{availableCourses.length}</strong><span>Active catalogue courses</span></div>
      </div>

      {loading ? (
        <section className="panel academic-pathway" role="status">Loading programmes, levels and subjects…</section>
      ) : activeProgrammes.length === 0 ? (
        <section className="panel academic-pathway">
          <h2>No active programmes yet</h2>
          <p>Open Catalogue management below to configure an approved DLI programme.</p>
        </section>
      ) : (
        <section className="panel academic-pathway" aria-label="Programme and subject explorer">
          <div className="academic-step">
            <div className="academic-step-title">
              <span className="academic-step-marker" aria-hidden="true">1</span>
              <div><h2>Choose a programme</h2><p>Which DLI learning service do you want to view?</p></div>
            </div>
            <div className="academic-choice-grid" role="group" aria-label="Select a DLI programme">
              {activeProgrammes.map(item => (
                <button key={item.id} type="button"
                  className={'academic-programme-choice' + (item.id === selectedProgramme?.id ? ' selected' : '')}
                  aria-pressed={item.id === selectedProgramme?.id}
                  onClick={() => { setViewProgramme(item.id); setViewLevel(''); }}>
                  <span className="academic-choice-icon"><School size={20}/></span>
                  <span className="academic-choice-copy">
                    <strong>{item.name}</strong>
                    <small>{item.code === 'dli-scholars-club' ? 'Free weekend lectures' :
                      item.code === 'dli-online' ? 'DLI online learning' :
                      item.description || 'DLI learning programme'}</small>
                  </span>
                  {item.id === selectedProgramme?.id && <CheckCircle2 size={19} className="academic-choice-check"/>}
                </button>
              ))}
            </div>
          </div>

          <div className="academic-step">
            <div className="academic-step-title">
              <span className="academic-step-marker" aria-hidden="true">2</span>
              <div><h2>Choose an academic level</h2><p>Only levels with an active curriculum course in this programme appear here.</p></div>
            </div>
            {offeredLevels.length === 0 ? (
              <p className="academic-empty">No academic levels are currently offered in this programme. Configure a course under Catalogue management.</p>
            ) : (
              <div className="academic-level-options" role="group" aria-label="Select an academic level">
                {offeredLevels.map(level => (
                  <button type="button" key={level.id}
                    className={'academic-level-choice' + (level.id === selectedLevel?.id ? ' selected' : '')}
                    aria-pressed={level.id === selectedLevel?.id}
                    onClick={() => setViewLevel(level.id)}>
                    {level.name}
                    <span>{programmeCourses.filter(c => c.academic_level_id === level.id).length} subjects</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="academic-step academic-step-last">
            <div className="academic-step-title">
              <span className="academic-step-marker" aria-hidden="true">3</span>
              <div><h2>Catalogue subjects</h2>
                <p>{selectedProgramme?.name}{selectedLevel ? ' · ' + selectedLevel.name : ''}</p>
              </div>
              <span className="academic-available-count">{pathwayCourses.length} configured</span>
            </div>
            {pathwayCourses.length > 0 ? (
              <div className="academic-subject-grid">
                {pathwayCourses.map(course => (
                  <div className="academic-subject-tile" key={course.id}>
                    <span className="academic-subject-icon"><BookOpen size={18}/></span>
                    <strong>{subjectNameFor(course.subject_id)}</strong>
                    <CheckCircle2 size={17} className="academic-subject-check" aria-label="Active in the catalogue"/>
                  </div>
                ))}
              </div>
            ) : (
              <p className="academic-empty">No active catalogue subjects for this selection. Check Catalogue management below.</p>
            )}
          </div>

          <div className="academic-definition">
            <ShieldCheck size={19}/>
            <div><strong>How do subjects and courses differ?</strong>
              <p>A subject is what DLI teaches (such as Mathematics).
                A course is that subject offered within a particular DLI programme and academic level.
                These catalogue records do not mean a teaching class is published or a lesson or quiz is available. A cohort offering, matching roster and approved access are required separately.</p>
            </div>
          </div>
        </section>
      )}

      <div className="academic-next-steps" aria-label="Where to go next">
        <Link to="/classes" className="academic-next-link">
          <span><strong>Organise classes &amp; timetable</strong><small>Set up lessons, sessions, tutors and students.</small></span>
          <ArrowRight size={18}/>
        </Link>
        <Link to="/study" className="academic-next-link">
          <span><strong>Learning &amp; results</strong><small>View lessons, assignments, quizzes and attendance.</small></span>
          <ArrowRight size={18}/>
        </Link>
      </div>

      <details className="academic-admin-drawer">
        <summary>
          <span className="academic-admin-summary-icon"><Settings2 size={20}/></span>
          <span><strong>Catalogue management</strong>
            <small>Advanced settings: create, activate or deactivate programmes, levels, subjects and courses</small>
          </span>
          <span className="academic-manage-label">Manage catalogue</span>
        </summary>
        <div className="academic-admin-content">
          <p className="academic-admin-guidance">
            These controls change the shared DLI academic catalogue. Use them only for
            institutionally approved updates. Deactivating a record hides it from new choices
            but preserves existing records. Class scheduling and assessments are managed separately.
          </p>
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
          <p className="academic-code-hint">Existing offerings for the programme and level selected above</p>
          <div className="academic-record-list academic-course-list">
            {courses.filter(item => item.programme_id === courseProgrammeId &&
              item.academic_level_id === courseLevelId).map(item => <div className="academic-record" key={item.id}>
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
        </div>
      </details>
    </div>
  );
}
