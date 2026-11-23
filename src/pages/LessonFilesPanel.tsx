import {confirmAction} from '../components/ConfirmationDialogService';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, CircleOff, Download, FilePlus2, LockKeyhole, RefreshCw } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './LessonFilesPanel.css';

const BUCKET = 'dli-lesson-files';
const MAX_BYTES = 5 * 1024 * 1024; // Temporary development safeguard, not DLI policy.
const ALLOWED_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

type LessonRef = { id: string; title: string; is_published: boolean };
type LessonFile = {
  id: string;
  lesson_id: string;
  object_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  is_ready: boolean;
  is_published: boolean;
};

type UploadStage = 'registering' | 'uploading' | 'finalizing' | null;
const stageLabel: Record<Exclude<UploadStage, null>, string> = {
  registering: 'Registering an authorised file…',
  uploading: 'Uploading the file to private storage…',
  finalizing: 'Confirming the uploaded file…',
};

function readableSize(size: number) {
  return size < 1024 * 1024
    ? `${Math.ceil(size / 1024)} KB`
    : `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

export default function LessonFilesPanel({
  lessons, canEdit,
}: {
  lessons: LessonRef[];
  canEdit: boolean;
}) {
  const [files, setFiles] = useState<LessonFile[]>([]);
  const [chosenLesson, setChosenLesson] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStage, setUploadStage] = useState<UploadStage>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const lessonsKey = lessons.map(item => item.id).sort().join(',');
  const currentLessonId = lessons.some(item => item.id === chosenLesson)
    ? chosenLesson : lessons[0]?.id ?? '';
  const selectedLesson = lessons.find(item => item.id === currentLessonId);
  const lessonName = (id: string) =>
    lessons.find(item => item.id === id)?.title ?? 'Lesson unavailable';

  const refresh = useCallback(async () => {
    if (!supabase || !lessonsKey) {
      setFiles([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: readError } = await supabase.from('lesson_files')
      .select('id,lesson_id,object_path,file_name,mime_type,size_bytes,is_ready,is_published')
      .in('lesson_id', lessonsKey.split(','))
      .order('created_at', { ascending: false });
    if (readError) {
      setError('Could not read private lesson-file records. Check your access and retry.');
    } else {
      setFiles((data ?? []) as LessonFile[]);
      setError(null);
    }
    setLoading(false);
  }, [lessonsKey]);

  useEffect(() => { void refresh(); }, [refresh]);

  const visibleFiles = useMemo(
    () => files.filter(item => lessons.some(lesson => lesson.id === item.lesson_id)),
    [files, lessons],
  );

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = supabase;
    if (!client || !canEdit || uploadStage || busyId || !selectedFile || !selectedLesson) return;

    const file = selectedFile;
    const extension = Object.keys(ALLOWED_TYPES).find(ext =>
      file.name.toLowerCase().endsWith(ext),
    );
    if (!extension || ALLOWED_TYPES[extension] !== file.type) {
      setError('Choose a PDF, PNG, JPG or DOCX with the corresponding file type.');
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      setError('The temporary development upload limit is 5 MiB per file.');
      return;
    }
    if (file.name.length > 160 || file.name.includes('/') || file.name.includes('\\')) {
      setError('Use a filename of 160 characters or fewer, without directory separators.');
      return;
    }

    const fileId = crypto.randomUUID();
    const lessonId = selectedLesson.id;
    const objectPath = `lessons/${lessonId}/${fileId}`;
    setError(null);
    setNotice(null);
    setUploadStage('registering');

    try {
      // The reservation must exist before Storage RLS permits the upload.
      const reservation = await client.from('lesson_files').insert({
        id: fileId,
        lesson_id: lessonId,
        object_path: objectPath,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
      }).select('id').maybeSingle();
      if (reservation.error || !reservation.data) {
        setError('The file was not registered. Your account or lesson may not permit uploads.');
        return;
      }

      setUploadStage('uploading');
      const uploaded = await client.storage.from(BUCKET).upload(objectPath, file, {
        contentType: file.type,
        upsert: false,
        cacheControl: '0',
      });
      if (uploaded.error) {
        setError('The private upload failed. Its pending metadata remains for administrator review. No file was published.');
        await refresh();
        return;
      }

      setUploadStage('finalizing');
      const completed = await client.from('lesson_files')
        .update({ is_ready: true }).eq('id', fileId).select('id').maybeSingle();
      if (completed.error || !completed.data) {
        setError('The file uploaded, but its verification did not finish. Keep it unpublished and ask an administrator to review it.');
        await refresh();
        return;
      }

      setSelectedFile(null);
      setNotice('Private file uploaded successfully. It is still a draft until published.');
      await refresh();
    } catch {
      setError('The file workflow stopped unexpectedly. Check connectivity and review the pending record before retrying.');
    } finally {
      setUploadStage(null);
    }
  }

  async function setPublished(file: LessonFile) {
    const client = supabase;
    if (!client || !canEdit || !file.is_ready || uploadStage || busyId) return;
    if (!await confirmAction(file.is_published
      ? 'Unpublish this private file from Students?'
      : 'Publish this file to Students only when its parent lesson is published?')) return;
    setBusyId(file.id);
    setNotice(null);
    setError(null);
    const { error: writeError, data } = await client.from('lesson_files')
      .update({ is_published: !file.is_published })
      .eq('id', file.id).select('id').maybeSingle();
    if (writeError || !data) {
      setError('Could not change the file publishing status. Check the lesson permissions.');
    } else {
      setNotice(file.is_published ? 'File unpublished.' : 'File published to the authorised class.');
      await refresh();
    }
    setBusyId(null);
  }

  async function downloadFile(file: LessonFile) {
    const client = supabase;
    if (!client || !file.is_ready || downloadingId) return;
    setDownloadingId(file.id);
    setError(null);
    try {
      // A user-scoped authenticated download rechecks Storage RLS each time.
      // Do not create a reusable signed URL or a public asset URL.
      const result = await client.storage.from(BUCKET).download(file.object_path);
      if (result.error || !result.data) {
        setError('You cannot download this file. It may be unpublished or your class access may have changed.');
        return;
      }
      const objectUrl = URL.createObjectURL(result.data);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = file.file_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch {
      setError('The private download failed. Refresh and retry.');
    } finally {
      setDownloadingId(null);
    }
  }

  return <section className="panel learning-file-panel" aria-label="Private lesson files">
    <div className="panel-heading">
      <div>
        <h2>Lesson files</h2>
        <p className="user-caption">
          Files are stored in a private Supabase bucket. Downloads require current class access.
        </p>
      </div>
      <button type="button" className="user-outline-button"
        disabled={loading || Boolean(uploadStage) || Boolean(busyId)}
        onClick={() => { void refresh(); }}>
        <RefreshCw size={15}/> Refresh files
      </button>
    </div>

    {error && <p className="auth-feedback error" role="alert">{error}</p>}
    {notice && <p className="auth-feedback success" role="status">{notice}</p>}
    <p role="status" className="learning-file-status">
      {uploadStage ? stageLabel[uploadStage] :
        loading ? 'Loading private file permissions…' :
        `${visibleFiles.length} accessible file ${visibleFiles.length === 1 ? 'record' : 'records'}`}
    </p>

    {canEdit && <form className="academic-form learning-file-upload" onSubmit={e => { void upload(e); }}>
      <label htmlFor="learning-upload-lesson">Attach to lesson</label>
      <select id="learning-upload-lesson" required value={currentLessonId}
        onChange={e => setChosenLesson(e.target.value)}>
        {lessons.map(item => <option key={item.id} value={item.id}>
          {item.title}{item.is_published ? '' : ' (draft)'}
        </option>)}
      </select>
      <label htmlFor="learning-upload-file">Select PDF, JPG, PNG or DOCX</label>
      <input id="learning-upload-file" type="file" required
        accept=".pdf,.jpg,.jpeg,.png,.docx"
        onChange={e => setSelectedFile(e.target.files?.[0] ?? null)}/>
      <p className="academic-code-hint">
        Development safeguard: maximum 5 MiB per file. The uploaded file stays
        unpublished until you approve it. No public URL is generated.
      </p>
      <button type="submit" className="academic-submit"
        disabled={!selectedFile || !selectedLesson || Boolean(uploadStage) || loading || Boolean(busyId)}>
        <FilePlus2 size={15}/>
        {uploadStage ? stageLabel[uploadStage] : 'Upload private draft file'}
      </button>
    </form>}

    <div className="learning-private-file-list">
      {visibleFiles.map(file => {
        const parent = lessons.find(item => item.id === file.lesson_id);
        return <div className="learning-private-file-row" key={file.id}>
          <div className="learning-private-file-name">
            <strong>{file.file_name}</strong>
            <small>{lessonName(file.lesson_id)} · {readableSize(file.size_bytes)}</small>
            {canEdit && <small>
              {!file.is_ready ? 'Upload pending — not downloadable' :
                file.is_published && parent?.is_published ? 'Published for this class' :
                  file.is_published ? 'Published file; parent lesson is still a draft' :
                    'Unpublished file'}
            </small>}
          </div>
          <div className="learning-private-file-actions">
            {file.is_ready && <button className="user-outline-button" type="button"
              disabled={Boolean(downloadingId)}
              onClick={() => { void downloadFile(file); }}>
              <Download size={15}/>{downloadingId === file.id ? 'Downloading…' : 'Download'}
            </button>}
            {canEdit && file.is_ready && <button className="academic-toggle"
              type="button" disabled={Boolean(uploadStage) || Boolean(busyId)}
              onClick={() => { void setPublished(file); }}>
              {file.is_published ? <CircleOff size={15}/> : <CheckCircle2 size={15}/>}
              {file.is_published ? 'Unpublish' : 'Publish'}
            </button>}
          </div>
        </div>;
      })}
      {!loading && visibleFiles.length === 0 &&
        <p className="academic-empty">No private files are available for these lessons.</p>}
    </div>
    <p className="learning-file-footnote"><LockKeyhole size={15}/>
      This view does not expose public or reusable signed links. Browser downloads require
      permission at the time of the request. Already downloaded copies cannot be recalled.
    </p>
  </section>;
}
