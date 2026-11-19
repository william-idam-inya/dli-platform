import { useState } from 'react';
import { Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './ManualShareControls.css';

type ManualChannel = 'email' | 'whatsapp';
type ShareableDraft = {
  id: string;
  title: string;
  body: string;
  revision: number;
  intended_channel: 'email' | 'whatsapp' | 'in_app';
};
type Props = {
  draft: ShareableDraft;
  clearedForCopy: boolean;
  disabled?: boolean;
  onStale: () => void;
};

/**
 * H6: explicit, user-driven handoff to an external composer.
 * Never sends a message and never stores any recipient/contact.
 * Both H2 clearance and the server-side H6 INSERT RLS are verified.
 */
export default function ManualShareControls({
  draft, clearedForCopy, disabled = false, onStale,
}: Props) {
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  if (draft.intended_channel === 'in_app') return null;

  const channel: ManualChannel = draft.intended_channel;
  const label = channel === 'email' ? 'Open email composer' : 'Open WhatsApp composer';

  async function prepare() {
    if (preparing || disabled || !clearedForCopy || !supabase) return;
    const destination = channel === 'email' ? 'your installed email app' : 'WhatsApp';
    if (!window.confirm(
      'This will open the approved message in ' + destination +
      '. It will not be sent automatically. Choose a recipient, review it and press Send yourself. Continue?'
    )) return;

    setPreparing(true);
    setError(null);
    setNotice(null);
    try {
      // Re-read current draft AND latest non-comment review at click-time.
      // A stale local approval must not produce an external compose URL.
      const [d, r] = await Promise.all([
        supabase.from('communication_drafts')
          .select('id,title,body,revision,intended_channel,status')
          .eq('id', draft.id).maybeSingle(),
        supabase.from('communication_draft_reviews')
          .select('draft_revision,review_action,created_at,id')
          .eq('draft_id', draft.id)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true }),
      ]);
      if (d.error || r.error || !d.data) {
        setError('Unable to validate current draft clearance. Refresh and retry.');
        return;
      }
      const current = d.data;
      const decision = (r.data ?? []).filter(item =>
        item.draft_revision === current.revision && item.review_action !== 'comment'
      ).at(-1);
      if (current.id !== draft.id ||
          current.status !== 'draft' ||
          current.revision !== draft.revision ||
          current.title !== draft.title ||
          current.body !== draft.body ||
          current.intended_channel !== channel ||
          decision?.review_action !== 'approved_for_manual_copy') {
        setError('Draft or review clearance has changed. Refresh and request clearance for the current revision.');
        onStale();
        return;
      }

      // Atomic DB policy rechecks H2 approval, draft revision, channel,
      // live staff role, and records PREPARED (never SENT).
      const { data: prepared, error: insertError } = await supabase
        .from('communication_manual_preparations')
        .insert({
          draft_id: current.id,
          draft_revision: current.revision,
          channel,
        })
        .select('id').maybeSingle();
      if (insertError || !prepared) {
        setError('Preparation was not authorised. Refresh and verify independent manual-copy clearance.');
        return;
      }
      setNotice('Preparation recorded. Opening an external composer is not confirmation of sending.');
      // No recipient is preselected or stored.
      // Explicit external handoff only after consent and a server-verified preparation.
      const url = channel === 'whatsapp'
        ? 'https://wa.me/?text=' + encodeURIComponent(current.body)
        : 'mailto:?subject=' + encodeURIComponent(current.title)
          + '&body=' + encodeURIComponent(
            current.body.replace(/\r\n|\r|\n/g, '\r\n')
          );
      window.location.assign(url);
    } catch {
      setError('Could not open the external composer. You may use the existing manual copy action; no message was sent.');
    } finally {
      setPreparing(false);
    }
  }

  return <section className="manual-share-controls" aria-label="Manual external message preparation">
    <div className="manual-share-title"><ShieldCheck size={16}/>
      <strong>Share approved message</strong>
    </div>
    <p>Review the message and choose a recipient before sending it from your email or WhatsApp app.</p>
    <button type="button" className="academic-submit"
      disabled={disabled || preparing || !clearedForCopy}
      onClick={() => { void prepare(); }}>
      {channel === 'email' ? <Mail size={15}/> : <MessageCircle size={15}/>}
      {preparing ? 'Validating current clearance…' : label}
    </button>
    {!clearedForCopy && <small>Manual handoff is locked until a different Owner/Admin
      independently clears this exact revision.</small>}
    {error && <p className="auth-feedback error" role="alert">{error}</p>}
    {notice && <p className="auth-feedback success" role="status">{notice}</p>}
  </section>;
}
