-- Q34: Telegram-pattern direct-message interactions.
-- Keep Q16 admin-routed contact restrictions, 30 messages/hour guard,
-- private media controls and original audit records. No public messaging.

ALTER TABLE public.dli_direct_messages
 ADD COLUMN reply_to_id uuid REFERENCES public.dli_direct_messages(id) ON DELETE RESTRICT,
 ADD COLUMN forwarded_from_id uuid REFERENCES public.dli_direct_messages(id) ON DELETE RESTRICT,
 ADD COLUMN edited_at timestamptz,
 ADD COLUMN deleted_at timestamptz;
CREATE INDEX dli_direct_messages_reply_idx ON public.dli_direct_messages(reply_to_id)
 WHERE reply_to_id IS NOT NULL;

CREATE TABLE private.dli_direct_message_revisions(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 message_id uuid NOT NULL REFERENCES public.dli_direct_messages(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 previous_body text NOT NULL,
 change_kind text NOT NULL CHECK(change_kind IN ('edit','soft_delete')),
 changed_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON private.dli_direct_message_revisions FROM PUBLIC,anon,authenticated;

CREATE TABLE public.dli_direct_reactions(
 message_id uuid NOT NULL REFERENCES public.dli_direct_messages(id) ON DELETE RESTRICT,
 reactor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
 emoji text NOT NULL CHECK(char_length(emoji) BETWEEN 1 AND 14),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(message_id,reactor_id)
);
CREATE INDEX dli_direct_reactions_message_idx ON public.dli_direct_reactions(message_id);
ALTER TABLE public.dli_direct_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_direct_reactions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.dli_direct_reactions TO authenticated;
CREATE POLICY dli_direct_reactions_participants ON public.dli_direct_reactions
 FOR SELECT TO authenticated USING(
  EXISTS(SELECT 1 FROM public.dli_direct_messages m
         WHERE m.id=message_id AND m.deleted_at IS NULL));

CREATE FUNCTION private.dli_message_context_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $q34$
DECLARE v_thread uuid;v_file uuid;
BEGIN
 IF NEW.reply_to_id IS NOT NULL THEN
   SELECT thread_id INTO v_thread FROM public.dli_direct_messages
     WHERE id=NEW.reply_to_id AND deleted_at IS NULL;
   IF v_thread IS DISTINCT FROM NEW.thread_id THEN
     RAISE EXCEPTION 'Replies must reference a visible message in the same conversation'
       USING errcode='23514';
   END IF;
 END IF;
 IF NEW.forwarded_from_id IS NOT NULL THEN
   SELECT m.thread_id,m.file_id INTO v_thread,v_file
   FROM public.dli_direct_messages m WHERE m.id=NEW.forwarded_from_id
     AND m.deleted_at IS NULL;
   IF NOT FOUND OR v_file IS NOT NULL OR NOT EXISTS(
      SELECT 1 FROM public.dli_direct_threads t
      WHERE t.id=v_thread AND auth.uid() IN(t.participant_a,t.participant_b)
       AND private.dli_direct_allowed(t.participant_a,t.participant_b)
   ) THEN RAISE EXCEPTION 'Only accessible text messages can be forwarded'
     USING errcode='42501'; END IF;
 END IF;
 RETURN NEW;
END $q34$;
CREATE TRIGGER dli_message_context_check BEFORE INSERT
 ON public.dli_direct_messages FOR EACH ROW
 EXECUTE FUNCTION private.dli_message_context_guard();

-- One authoritative participant check reused across user-initiated actions.
CREATE FUNCTION private.dli_direct_can_modify(p_message uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $q34$
 SELECT auth.uid() IS NOT NULL AND EXISTS(
 SELECT 1 FROM public.dli_direct_messages m
 JOIN public.dli_direct_threads t ON t.id=m.thread_id
 WHERE m.id=p_message AND m.sender_id=auth.uid()
   AND auth.uid() IN(t.participant_a,t.participant_b)
   AND private.dli_direct_allowed(t.participant_a,t.participant_b));
$q34$;

CREATE FUNCTION private.dli_set_message_reaction_impl(p_message uuid,p_emoji text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $q34$
DECLARE v_thread uuid;v_current text;
BEGIN
 IF auth.uid() IS NULL OR p_message IS NULL OR p_emoji IS NULL OR
   p_emoji NOT IN('👍','❤️','😂','😊','👏','🙏','🎓','🔥','😍','😮','😢','😡','💯','🥳','🤔','💪','✅','🎉','😎','🙌')
 THEN RAISE EXCEPTION 'Choose an approved reaction' USING errcode='23514'; END IF;
 SELECT m.thread_id INTO v_thread FROM public.dli_direct_messages m
 JOIN public.dli_direct_threads t ON t.id=m.thread_id
 WHERE m.id=p_message AND m.deleted_at IS NULL
   AND auth.uid() IN(t.participant_a,t.participant_b)
   AND private.dli_direct_allowed(t.participant_a,t.participant_b);
 IF NOT FOUND THEN RAISE EXCEPTION 'Message not available for reaction'
  USING errcode='42501';END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_message::text),933);
 SELECT emoji INTO v_current FROM public.dli_direct_reactions
 WHERE message_id=p_message AND reactor_id=auth.uid();
 IF v_current=p_emoji THEN
  DELETE FROM public.dli_direct_reactions
   WHERE message_id=p_message AND reactor_id=auth.uid();
  RETURN false;
 END IF;
 INSERT INTO public.dli_direct_reactions(message_id,reactor_id,emoji)
  VALUES(p_message,auth.uid(),p_emoji)
 ON CONFLICT(message_id,reactor_id) DO UPDATE
  SET emoji=EXCLUDED.emoji,created_at=now();
 RETURN true;
END $q34$;

CREATE FUNCTION private.dli_edit_direct_message_impl(p_message uuid,p_body text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $q34$
DECLARE v_before text;
BEGIN
 IF NOT private.dli_direct_can_modify(p_message) THEN
  RAISE EXCEPTION 'You may only edit your own permitted messages'
    USING errcode='42501'; END IF;
 IF p_body IS NULL OR char_length(btrim(p_body)) NOT BETWEEN 1 AND 2000 THEN
  RAISE EXCEPTION 'Edited messages require 1–2000 characters'
    USING errcode='23514';END IF;
 SELECT body INTO v_before FROM public.dli_direct_messages
 WHERE id=p_message AND sender_id=auth.uid() AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Message is unavailable or deleted'
   USING errcode='42501';END IF;
 IF v_before=p_body THEN RETURN true;END IF;
 INSERT INTO private.dli_direct_message_revisions(message_id,actor_id,previous_body,change_kind)
 VALUES(p_message,auth.uid(),v_before,'edit');
 UPDATE public.dli_direct_messages SET body=btrim(p_body),edited_at=now()
 WHERE id=p_message;
 INSERT INTO public.audit_logs(actor_id,event_type,details)
 VALUES(auth.uid(),'messaging.message_edited',jsonb_build_object('message_id',p_message));
 RETURN true;
END $q34$;

CREATE FUNCTION private.dli_delete_direct_message_impl(p_message uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $q34$
DECLARE v_before text;
BEGIN
 IF NOT private.dli_direct_can_modify(p_message) THEN
  RAISE EXCEPTION 'You may only remove your own permitted messages'
   USING errcode='42501';END IF;
 SELECT body INTO v_before FROM public.dli_direct_messages
 WHERE id=p_message AND sender_id=auth.uid() AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RETURN false;END IF;
 INSERT INTO private.dli_direct_message_revisions(message_id,actor_id,previous_body,change_kind)
 VALUES(p_message,auth.uid(),v_before,'soft_delete');
 UPDATE public.dli_direct_messages
  SET body='Message deleted',file_id=NULL,deleted_at=now()
 WHERE id=p_message;
 DELETE FROM public.dli_direct_reactions WHERE message_id=p_message;
 INSERT INTO public.audit_logs(actor_id,event_type,details)
 VALUES(auth.uid(),'messaging.message_removed_from_chat',
   jsonb_build_object('message_id',p_message));
 RETURN true;
END $q34$;

CREATE FUNCTION private.dli_forward_direct_message_impl(p_source uuid,p_thread uuid)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''
AS $q34$
DECLARE v_source record;v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR p_source IS NULL OR p_thread IS NULL THEN
  RAISE EXCEPTION 'Select a source message and permitted destination'
    USING errcode='23514';END IF;
 SELECT m.body,m.file_id,m.deleted_at,m.thread_id INTO v_source
 FROM public.dli_direct_messages m
 JOIN public.dli_direct_threads t ON t.id=m.thread_id
 WHERE m.id=p_source AND auth.uid() IN(t.participant_a,t.participant_b)
   AND private.dli_direct_allowed(t.participant_a,t.participant_b);
 IF NOT FOUND OR v_source.deleted_at IS NOT NULL OR v_source.file_id IS NOT NULL THEN
  RAISE EXCEPTION 'Only accessible text messages may be forwarded'
    USING errcode='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dli_direct_threads t WHERE t.id=p_thread
   AND auth.uid() IN(t.participant_a,t.participant_b)
   AND private.dli_direct_allowed(t.participant_a,t.participant_b))
 THEN RAISE EXCEPTION 'Destination conversation is restricted'
    USING errcode='42501';END IF;
 -- Normal direct-message INSERT applies sender rate cap, RLS, auditing
 -- and both reply/forward validation triggers, unchanged.
 INSERT INTO public.dli_direct_messages(thread_id,body,forwarded_from_id)
 VALUES(p_thread,v_source.body,p_source) RETURNING id INTO v_id;
 RETURN v_id;
END $q34$;

CREATE FUNCTION public.dli_set_message_reaction(p_message uuid,p_emoji text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $q34$ SELECT private.dli_set_message_reaction_impl(p_message,p_emoji); $q34$;
CREATE FUNCTION public.dli_edit_direct_message(p_message uuid,p_body text)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $q34$ SELECT private.dli_edit_direct_message_impl(p_message,p_body); $q34$;
CREATE FUNCTION public.dli_delete_direct_message(p_message uuid)
RETURNS boolean LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $q34$ SELECT private.dli_delete_direct_message_impl(p_message); $q34$;
CREATE FUNCTION public.dli_forward_direct_message(p_source uuid,p_thread uuid)
RETURNS uuid LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path=''
AS $q34$ SELECT private.dli_forward_direct_message_impl(p_source,p_thread); $q34$;

REVOKE ALL ON FUNCTION private.dli_message_context_guard(),
 private.dli_direct_can_modify(uuid),
 private.dli_set_message_reaction_impl(uuid,text),
 private.dli_edit_direct_message_impl(uuid,text),
 private.dli_delete_direct_message_impl(uuid),
 private.dli_forward_direct_message_impl(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.dli_direct_can_modify(uuid),
 private.dli_set_message_reaction_impl(uuid,text),
 private.dli_edit_direct_message_impl(uuid,text),
 private.dli_delete_direct_message_impl(uuid),
 private.dli_forward_direct_message_impl(uuid,uuid)
 TO authenticated;

REVOKE ALL ON FUNCTION public.dli_set_message_reaction(uuid,text),
 public.dli_edit_direct_message(uuid,text),
 public.dli_delete_direct_message(uuid),
 public.dli_forward_direct_message(uuid,uuid)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dli_set_message_reaction(uuid,text),
 public.dli_edit_direct_message(uuid,text),
 public.dli_delete_direct_message(uuid),
 public.dli_forward_direct_message(uuid,uuid) TO authenticated;
