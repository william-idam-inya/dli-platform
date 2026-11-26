import { useCallback, useEffect, useState } from 'react';
import { Download, Eye, EyeOff, FileText, Plus, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './CourseOutlinePanel.css';

type OutlineFile = {
  id: string;
  offering_id: string;
  object_path: string;
  file_name: string;
  size_bytes: number;
  is_ready: boolean;
  is_published: boolean;
};

export default function CourseOutlinePanel({ offeringId, canManage }: {
  offeringId: string;
  canManage: boolean;
}) {
  const [files, setFiles] = useState<OutlineFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!supabase) { setLoading(false); setError('DLI services are unavailable.'); return; }
    setLoading(true);
    const result = await supabase.from('dli_cohort_outline_files')
      .select('id,offering_id,object_path,file_name,size_bytes,is_ready,is_published')
      .eq('offering_id', offeringId).order('created_at', { ascending: false });
    if (result.error) setError('The course outline list could not be loaded.');
    else { setFiles((result.data ?? []) as OutlineFile[]); setError(''); }
    setLoading(false);
  }, [offeringId]);

  useEffect(() => { void refresh(); }, [refresh]);

  async function upload(file?: File) {
    if (!supabase || !file || busy) return;
    setError(''); setMessage('');
    if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF course outline.'); return;
    }
    if (file.size < 1 || file.size > 10 * 1024 * 1024) {
      setError('The PDF must be no larger than 10 MB.'); return;
    }
    setBusy(true);
    const id = crypto.randomUUID();
    const path = `cohort-outlines/${offeringId}/${id}`;
    const reservation = await supabase.from('dli_cohort_outline_files').insert({
      id, offering_id: offeringId, object_path: path,
      file_name: file.name.replace(/[\\/]/g, '_').slice(0, 160), size_bytes: file.size,
    }).select('id').single();
    if (reservation.error) {
      setError('You cannot add an outline here, or the file details were rejected.');
      setBusy(false); return;
    }
    const stored = await supabase.storage.from('dli-course-outlines').upload(path, file, {
      contentType: 'application/pdf', upsert: false,
    });
    if (stored.error) {
      setError('The PDF upload did not finish. Refresh and upload it again.');
      setBusy(false); return;
    }
    const completed = await supabase.from('dli_cohort_outline_files')
      .update({ is_ready: true, is_published: true }).eq('id', id).select('id').maybeSingle();
    if (completed.error || !completed.data) {
      setError('The uploaded PDF could not be published. Ask an administrator to review it.');
    } else {
      setMessage('Course outline uploaded and made available to this class.');
    }
    await refresh();
    setBusy(false);
  }

  async function setPublished(item: OutlineFile) {
    if (!supabase || busy) return;
    setBusy(true); setError(''); setMessage('');
    const result = await supabase.from('dli_cohort_outline_files')
      .update({ is_published: !item.is_published }).eq('id', item.id).select('id').maybeSingle();
    if (result.error || !result.data) setError('The outline visibility could not be changed.');
    else setMessage(item.is_published ? 'Outline hidden from students.' : 'Outline visible to this class.');
    await refresh(); setBusy(false);
  }

  async function download(item: OutlineFile) {
    if (!supabase || busy) return;
    setBusy(true); setError(''); setMessage('');
    const result = await supabase.storage.from('dli-course-outlines').download(item.object_path);
    if (result.error || !result.data) setError('You do not have access to this outline, or it is unavailable.');
    else {
      const url = URL.createObjectURL(result.data);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = item.file_name; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    setBusy(false);
  }

  return <section className="course-outline-panel" aria-label="Course outline PDFs">
    <header><FileText size={18}/><div><h3>Course outline</h3>
      <p>PDFs attached to this class subject are shared with its assigned students and tutors.</p>
    </div></header>
    {error && <p role="alert" className="auth-feedback error">{error}</p>}
    {message && <p role="status" className="auth-feedback success">{message}</p>}
    {canManage && <label className="course-outline-upload">
      <input type="file" accept="application/pdf,.pdf" disabled={busy}
        onChange={event => { void upload(event.target.files?.[0]); event.currentTarget.value = ''; }}/>
      <span><Plus size={15}/>{busy ? 'Saving PDF…' : 'Upload course outline (PDF, up to 10 MB)'}</span>
    </label>}
    {loading ? <p role="status">Loading course outlines…</p> : files.length === 0 ?
      <p className="academic-empty">No course outline has been shared for this subject yet.</p> :
      <ul className="course-outline-list">{files.filter(file => file.is_ready &&
        (canManage || file.is_published)).map(item => <li key={item.id}>
        <FileText size={16}/><span>{item.file_name}</span>
        {!item.is_published && <small>Hidden from students</small>}
        {canManage && <button type="button" className="user-outline-button"
          disabled={busy} onClick={() => void setPublished(item)}>
          {item.is_published ? <EyeOff size={14}/> : <Eye size={14}/>}
          {item.is_published ? 'Hide' : 'Publish'}</button>}
        <button type="button" className="user-outline-button" disabled={busy}
          onClick={() => void download(item)}><Download size={14}/> Download</button>
      </li>)}</ul>}
    <button type="button" className="course-outline-refresh" disabled={loading || busy}
      onClick={() => void refresh()}><RefreshCw size={14}/> Refresh outlines</button>
  </section>;
}
