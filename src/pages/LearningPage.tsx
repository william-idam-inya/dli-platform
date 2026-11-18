import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookOpen, CheckCircle2, CircleOff, ExternalLink, FileText, GraduationCap, Link2, Pencil, Plus, RefreshCw } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import './AcademicSetupPage.css';
import './LearningPage.css';
import LessonFilesPanel from './LessonFilesPanel';

type Offering = { id: string; course_id: string; cohort_id: string; is_active: boolean };
type Course = { id: string; title: string };
type Cohort = { id: string; name: string };
type Lesson = {
  id: string;
  offering_id: string;
  title: string;
  content: string;
  sort_order: number;
  is_published: boolean;
  updated_at: string;
};
type LearningResource = {
  id: string;
  lesson_id: string;
  title: string;
  resource_url: string;
  resource_type: 'link' | 'video' | 'document';
  is_published: boolean;
};
type ResourceType = LearningResource['resource_type'];

const EDIT_ROLES = new Set(['owner', 'admin', 'assistant_admin', 'tutor']);
function validHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && Boolean(u.hostname) && value.length <= 2048;
  } catch { return false; }
}

export default function LearningPage() {
  const { account } = useAuth();
  const [searchParams] = useSearchParams();
  const canEdit = Boolean(account && EDIT_ROLES.has(account.role));
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [selectedOffering, setSelectedOffering] = useState(() => searchParams.get('offering') ?? '');
  const [resourceLessonId, setResourceLessonId] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonBody, setLessonBody] = useState('');
  const [lessonOrder, setLessonOrder] = useState('100');
  const [resourceTitle, setResourceTitle] = useState('');
  const [resourceUrl, setResourceUrl] = useState('');
  const [resourceType, setResourceType] = useState<ResourceType>('link');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [editOrder, setEditOrder] = useState('100');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      setError('Supabase is not configured.');
      return;
    }
    setLoading(true);
    try {
    const [offeringsResult, coursesResult, cohortsResult, lessonsResult, resourcesResult] =
      await Promise.all([
        supabase.from('course_offerings').select('id,course_id,cohort_id,is_active')
          .eq('is_active', true),
        supabase.from('courses').select('id,title'),
        supabase.from('cohorts').select('id,name'),
        supabase.from('lessons').select(
          'id,offering_id,title,content,sort_order,is_published,updated_at',
        ).order('sort_order').order('title'),
        supabase.from('lesson_resources').select(
          'id,lesson_id,title,resource_url,resource_type,is_published',
        ).order('created_at'),
      ]);
    if (offeringsResult.error || coursesResult.error || cohortsResult.error ||
        lessonsResult.error || resourcesResult.error) {
      console.warn('[DLI] Learning catalogue request failed',{
        offerings:offeringsResult.error?.code,courses:coursesResult.error?.code,
        cohorts:cohortsResult.error?.code,lessons:lessonsResult.error?.code,
        resources:resourcesResult.error?.code,
      });
      setError('Learning content is temporarily unavailable. Try Refresh or contact DLI support if it continues.');
    } else {
      setOfferings((offeringsResult.data ?? []) as Offering[]);
      setCourses((coursesResult.data ?? []) as Course[]);
      setCohorts((cohortsResult.data ?? []) as Cohort[]);
      setLessons((lessonsResult.data ?? []) as Lesson[]);
      setResources((resourcesResult.data ?? []) as LearningResource[]);
      setError(null);
    }
    } catch {
      setError('The learning connection was interrupted. Try Refresh or contact DLI support.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const offered = offerings.filter(item => item.is_active);
  const currentOffering = offered.some(item => item.id === selectedOffering)
    ? selectedOffering : offered[0]?.id ?? '';
  const currentLessons = useMemo(
    () => lessons.filter(item => item.offering_id === currentOffering),
    [lessons, currentOffering],
  );
  const chosenResourceLesson = currentLessons.some(item => item.id === resourceLessonId)
    ? resourceLessonId : currentLessons[0]?.id ?? '';

  function offeringLabel(offering: Offering) {
    const course = courses.find(item => item.id === offering.course_id)?.title ?? 'Course unavailable';
    const cohort = cohorts.find(item => item.id === offering.cohort_id)?.name ?? 'Cohort unavailable';
    return `${course} · ${cohort}`;
  }

  async function createLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving || !canEdit) return;
    const title = lessonTitle.trim();
    const content = lessonBody.trim();
    const order = Number(lessonOrder);
    if (!currentOffering || title.length < 2 || !Number.isInteger(order) ||
        order < 0 || order > 10000 || content.length > 30000) {
      setError('Select an active offering and enter a valid lesson title, content and order.');
      return;
    }
    setSaving('new-lesson'); setNotice(null); setError(null);
    const { error: writeError } = await supabase.from('lessons').insert({
      offering_id: currentOffering, title, content,
      sort_order: order, is_published: false,
    });
    if (writeError) {
      setError(writeError.code === '23505'
        ? 'A lesson with that title already exists in this class.'
        : 'The draft lesson was not saved. Check your role and the current offering.');
    } else {
      setLessonTitle(''); setLessonBody(''); setLessonOrder('100');
      setNotice('Draft lesson saved. Students cannot see it until it is published.');
      await refresh();
    }
    setSaving(null);
  }

  async function createResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving || !canEdit) return;
    const title = resourceTitle.trim();
    const url = resourceUrl.trim();
    if (!chosenResourceLesson || title.length < 2 || !validHttpsUrl(url)) {
      setError('Select a lesson and enter a title and a complete HTTPS resource link.');
      return;
    }
    setSaving('new-resource'); setNotice(null); setError(null);
    const { error: writeError } = await supabase.from('lesson_resources').insert({
      lesson_id: chosenResourceLesson, title,
      resource_url: url, resource_type: resourceType, is_published: false,
    });
    if (writeError) {
      setError(writeError.code === '23505'
        ? 'This resource URL is already attached to that lesson.'
        : 'The resource was not saved. Check the HTTPS link and your permissions.');
    } else {
      setResourceTitle(''); setResourceUrl(''); setResourceType('link');
      setNotice('Resource saved as a draft link; it is not yet visible to Students.');
      await refresh();
    }
    setSaving(null);
  }

  function startEdit(lesson: Lesson) {
    setEditingId(lesson.id);
    setEditTitle(lesson.title);
    setEditBody(lesson.content);
    setEditOrder(String(lesson.sort_order));
    setError(null);
  }

  async function saveLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || saving || !canEdit || !editingId) return;
    const title = editTitle.trim();
    const content = editBody.trim();
    const order = Number(editOrder);
    const original = lessons.find(lesson => lesson.id === editingId);
    if (!original || title.length < 2 || !Number.isInteger(order) ||
        order < 0 || order > 10000 || content.length > 30000 ||
        (original.is_published && content.length === 0)) {
      setError('Enter a valid title, order and non-empty text for published lessons.');
      return;
    }
    setSaving(editingId); setError(null); setNotice(null);
    const { data, error: writeError } = await supabase.from('lessons')
      .update({ title, content, sort_order: order })
      .eq('id', editingId).select('id').maybeSingle();
    if (writeError || !data) {
      setError('The lesson could not be updated. Check your permissions.');
    } else {
      setEditingId(null);
      setNotice('Lesson changes saved in Supabase.');
      await refresh();
    }
    setSaving(null);
  }

  async function setLessonPublished(lesson: Lesson) {
    if (!supabase || saving || !canEdit) return;
    if (!lesson.is_published && !lesson.content.trim()) {
      setError('Add lesson content before publishing.');
      return;
    }
    if (!window.confirm(lesson.is_published
      ? 'Unpublish this lesson? Students will lose access to it and its resources.'
      : 'Publish this lesson to Students enrolled in this class?')) return;
    setSaving(lesson.id); setError(null); setNotice(null);
    const { data, error: writeError } = await supabase.from('lessons')
      .update({ is_published: !lesson.is_published })
      .eq('id', lesson.id).select('id').maybeSingle();
    if (writeError || !data) {
      setError('Could not change publication status. Check your permissions and lesson content.');
    } else {
      setNotice(lesson.is_published ? 'Lesson unpublished.' : 'Lesson published to enrolled Students.');
      await refresh();
    }
    setSaving(null);
  }

  async function setResourcePublished(resource: LearningResource) {
    if (!supabase || saving || !canEdit) return;
    if (!window.confirm(resource.is_published
      ? 'Unpublish this link for Students?'
      : 'Publish this link for Students when its parent lesson is published?')) return;
    setSaving(resource.id); setError(null); setNotice(null);
    const { data, error: writeError } = await supabase.from('lesson_resources')
      .update({ is_published: !resource.is_published })
      .eq('id', resource.id).select('id').maybeSingle();
    if (writeError || !data) {
      setError('Could not update the resource publication status.');
    } else {
      setNotice(resource.is_published ? 'Resource link unpublished.' : 'Resource link published.');
      await refresh();
    }
    setSaving(null);
  }

  return <div className="module-page learning-page">
    <div className="module-page-hero">
      <span className="module-page-icon"><BookOpen size={25}/></span>
      <div className="module-page-copy">
        <div className="eyebrow"><span className="eyebrow-line"/> TEACHING &amp; LEARNING</div>
        <h1>Courses &amp; lessons</h1>
        
      </div>
    </div>

    {error && <p role="alert" className="auth-feedback error">{error}</p>}
    {notice && <p role="status" className="auth-feedback success">{notice}</p>}
    <div className="academic-summary">
      <div><GraduationCap size={18}/><strong>{loading?'…':error?'—':offered.length}</strong><span>Accessible classes</span></div>
      <div><BookOpen size={18}/><strong>{loading?'…':error?'—':lessons.length}</strong><span>Visible lessons</span></div>
      <div><FileText size={18}/><strong>{loading?'…':error?'—':lessons.filter(x => x.is_published).length}</strong><span>Published lessons</span></div>
      <div><Link2 size={18}/><strong>{loading?'…':error?'—':resources.length}</strong><span>Visible links</span></div>
    </div>

    <div className="academic-top-actions">
      <p role="status">{loading ? 'Loading authorised lessons…' : error ? 'Learning content needs attention' : 'Your authorised learning records'}</p>
      <Link to="/study?tab=assignments" className="user-outline-button">
        <FileText size={16}/> Assignments
      </Link>
      <button type="button" className="user-outline-button" disabled={loading || Boolean(saving)}
        onClick={() => { void refresh(); }}><RefreshCw size={16}/> Refresh</button>
    </div>
    <section className="panel learning-class-selector">
      <label htmlFor="learning-offering">Choose an accessible course offering</label>
      <select id="learning-offering" value={currentOffering}
        onChange={e => { setSelectedOffering(e.target.value); setResourceLessonId(''); setEditingId(null); }}>
        {offered.map(item => <option key={item.id} value={item.id}>{offeringLabel(item)}</option>)}
      </select>
      {!offered.length && <p className="academic-empty">
        {canEdit
          ? <>No active class offering exists yet. Create an approved course and cohort under <Link to="/cohorts">Cohorts &amp; topics</Link>.</>
          : 'No enrolled or assigned active class is available to your account.'}
      </p>}
    </section>

    <section className="panel learning-lessons">
      <div className="panel-heading"><div>
        <p className="section-kicker">LESSON CONTENT</p>
        <h2>Lessons for this class</h2>
        <p className="user-caption">{canEdit ? 'Drafts are visible to class editors only.' : 'Only published lessons appear.'}</p>
      </div></div>
      {!loading && currentOffering && currentLessons.length === 0 &&
        <p className="academic-empty">No accessible lessons have been recorded for this offering.</p>}
      <div className="learning-lesson-list">
        {currentLessons.map(lesson => (
          <article className="learning-lesson" key={lesson.id}>
            <div className="learning-lesson-header">
              <div>
                <span className="learning-order">Lesson order {lesson.sort_order}</span>
                <h3>{lesson.title}</h3>
              </div>
              {canEdit && <span className={lesson.is_published ? 'academic-badge active' : 'academic-badge inactive'}>
                {lesson.is_published ? 'Published' : 'Draft'}
              </span>}
            </div>
            {editingId === lesson.id ? <form className="academic-form learning-editor" onSubmit={e => { void saveLesson(e); }}>
              <label htmlFor="edit-lesson-title">Lesson title</label>
              <input id="edit-lesson-title" value={editTitle} minLength={2} maxLength={180} required
                onChange={e => setEditTitle(e.target.value)}/>
              <label htmlFor="edit-lesson-text">Lesson text</label>
              <textarea id="edit-lesson-text" value={editBody} maxLength={30000} rows={8}
                onChange={e => setEditBody(e.target.value)}/>
              <label htmlFor="edit-lesson-order">Order</label>
              <input id="edit-lesson-order" type="number" min={0} max={10000} required value={editOrder}
                onChange={e => setEditOrder(e.target.value)}/>
              <div className="learning-button-row">
                <button type="submit" className="academic-submit" disabled={Boolean(saving)}>Save changes</button>
                <button type="button" className="user-outline-button" onClick={() => setEditingId(null)}
                  disabled={Boolean(saving)}>Cancel</button>
              </div>
            </form> : <p className="learning-lesson-text">{lesson.content || 'This draft has no lesson text yet.'}</p>}
            {canEdit && editingId !== lesson.id && <div className="learning-button-row">
              <button type="button" className="user-outline-button" disabled={Boolean(saving)}
                onClick={() => startEdit(lesson)}><Pencil size={15}/> Edit lesson</button>
              <button type="button" className="user-outline-button" disabled={Boolean(saving)}
                onClick={() => { void setLessonPublished(lesson); }}>
                {lesson.is_published ? <CircleOff size={15}/> : <CheckCircle2 size={15}/>}
                {lesson.is_published ? 'Unpublish' : 'Publish'}
              </button>
            </div>}
            <div className="learning-resources">
              <strong>Learning resources</strong>
              {resources.filter(res => res.lesson_id === lesson.id).map(res => (
                <div className="learning-resource" key={res.id}>
                  <ExternalLink size={14}/>
                  <div className="learning-resource-info">
                    <a href={res.resource_url} target="_blank" rel="noopener noreferrer">
                      {res.title} <span>({res.resource_type})</span>
                    </a>
                    <small>External HTTPS link — check the source before opening.</small>
                  </div>
                  {canEdit && <button type="button" className="academic-toggle"
                    disabled={Boolean(saving)}
                    onClick={() => { void setResourcePublished(res); }}>
                    {res.is_published ? <CircleOff size={14}/> : <CheckCircle2 size={14}/>}
                    {res.is_published ? 'Unpublish' : 'Publish'}
                  </button>}
                </div>
              ))}
              {resources.every(res => res.lesson_id !== lesson.id) &&
                <p>No accessible resource links for this lesson.</p>}
            </div>
          </article>
        ))}
      </div>
    </section>

    <LessonFilesPanel
      lessons={currentLessons.map(lesson => ({
        id: lesson.id, title: lesson.title, is_published: lesson.is_published,
      }))}
      canEdit={canEdit}
    />

    {canEdit && <div className="academic-columns">
      <section className="panel academic-panel">
        <div className="panel-heading"><div>
          <p className="section-kicker">AUTHOR CONTENT</p><h2>Create draft lesson</h2>
        </div></div>
        <form className="academic-form learning-editor" onSubmit={e => { void createLesson(e); }}>
          <label htmlFor="new-lesson-title">Title</label>
          <input id="new-lesson-title" required minLength={2} maxLength={180}
            value={lessonTitle} onChange={e => setLessonTitle(e.target.value)}/>
          <label htmlFor="new-lesson-text">Lesson text</label>
          <textarea id="new-lesson-text" rows={7} maxLength={30000}
            value={lessonBody} onChange={e => setLessonBody(e.target.value)}
            placeholder="Enter approved original teaching content…"/>
          <label htmlFor="new-lesson-order">Lesson order</label>
          <input id="new-lesson-order" type="number" min={0} max={10000} required
            value={lessonOrder} onChange={e => setLessonOrder(e.target.value)}/>
          <button type="submit" className="academic-submit"
            disabled={Boolean(saving) || loading || !currentOffering}>
            <Plus size={15}/>{saving === 'new-lesson' ? 'Saving draft…' : 'Save draft lesson'}
          </button>
        </form>
      </section>

      <section className="panel academic-panel">
        <div className="panel-heading"><div>
          <p className="section-kicker">EXTERNAL RESOURCES</p><h2>Add resource link</h2>
        </div></div>
        <form className="academic-form learning-editor" onSubmit={e => { void createResource(e); }}>
          <label htmlFor="resource-lesson">Parent lesson</label>
          <select id="resource-lesson" value={chosenResourceLesson}
            onChange={e => setResourceLessonId(e.target.value)} required>
            {currentLessons.map(lesson =>
              <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}
          </select>
          <label htmlFor="resource-title">Resource title</label>
          <input id="resource-title" required minLength={2} maxLength={180}
            value={resourceTitle} onChange={e => setResourceTitle(e.target.value)}/>
          <label htmlFor="resource-kind">Type</label>
          <select id="resource-kind" value={resourceType}
            onChange={e => setResourceType(e.target.value as ResourceType)}>
            <option value="link">Web link</option>
            <option value="video">Video link</option>
            <option value="document">Document link</option>
          </select>
          <label htmlFor="resource-url">HTTPS link</label>
          <input id="resource-url" required type="url" maxLength={2048}
            placeholder="https://..." value={resourceUrl}
            onChange={e => setResourceUrl(e.target.value)}/>
          <p className="academic-code-hint">This stores a link, not a file upload. It remains unpublished until approved.</p>
          <button className="academic-submit" type="submit"
            disabled={Boolean(saving) || loading || !chosenResourceLesson}>
            <Plus size={15}/>{saving === 'new-resource' ? 'Saving link…' : 'Save draft resource'}
          </button>
        </form>
      </section>
    </div>}
    
  </div>;
}
