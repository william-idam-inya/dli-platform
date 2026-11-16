-- Q50: Production-only server-managed Cloudflare RealtimeKit media identities.
-- No client can enumerate, update, or issue arbitrary provider identities.
-- Apply only to production Supabase thoinmwqxmqxrnywjuxq.
CREATE TABLE IF NOT EXISTS public.dli_prod_realtimekit_room_map (
 room_id uuid PRIMARY KEY REFERENCES public.dli_conference_rooms(id) ON DELETE CASCADE,
 provider_meeting_id uuid UNIQUE NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid
);
ALTER TABLE public.dli_prod_realtimekit_room_map ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_prod_realtimekit_room_map FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.dli_prod_realtimekit_room_map TO service_role;

CREATE TABLE IF NOT EXISTS public.dli_prod_realtimekit_participants (
 room_id uuid NOT NULL REFERENCES public.dli_conference_rooms(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 provider_participant_id uuid NOT NULL,
 preset_name text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,user_id),
 UNIQUE(provider_participant_id)
);
ALTER TABLE public.dli_prod_realtimekit_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dli_prod_realtimekit_participants FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.dli_prod_realtimekit_participants TO service_role;

CREATE TABLE IF NOT EXISTS private.dli_prod_realtimekit_issuance_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 user_id uuid NOT NULL,
 room_id uuid NOT NULL,
 requested_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.dli_prod_realtimekit_issuance_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.dli_prod_realtimekit_issuance_audit FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS dli_prod_realtimekit_issuance_user_time_idx
 ON private.dli_prod_realtimekit_issuance_audit(user_id,requested_at DESC);

CREATE OR REPLACE FUNCTION public.dli_prod_realtimekit_access(p_room uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_user uuid:=auth.uid();
 v_room record;
 v_person record;
 v_preset text;
 v_used integer;
 v_role_label text;
 v_is_host boolean;
BEGIN
 IF v_user IS NULL OR p_room IS NULL OR
   NOT private.dli_conference_joined(p_room) THEN RETURN NULL; END IF;
 SELECT id,title,room_type,state,is_locked,created_by INTO v_room
 FROM public.dli_conference_rooms WHERE id=p_room;
 IF NOT FOUND OR v_room.state='ended' THEN RETURN NULL; END IF;
 SELECT full_name,role,status INTO v_person FROM public.authorised_users
 WHERE auth_user_id=v_user AND status='active'::public.dli_account_status;
 IF NOT FOUND THEN RETURN NULL; END IF;
 v_is_host:=private.dli_conference_is_host(p_room);
 -- Waiting rooms can be joined by a host to prepare class, but not students.
 IF v_room.state<>'open' AND NOT v_is_host THEN RETURN NULL; END IF;
 IF v_is_host THEN
  v_preset:=CASE WHEN v_room.room_type='student_seminar'
    THEN 'webinar_presenter' ELSE 'group_call_host' END;
 ELSIF v_room.room_type='student_seminar' THEN
  v_preset:='webinar_viewer';
 ELSE
  v_preset:='group_call_participant';
 END IF;
 -- Preserve executive profile protection even in provider display names.
 v_role_label:=CASE v_person.role
  WHEN 'owner' THEN 'DLI Owner'
  WHEN 'admin' THEN 'DLI Admin'
  WHEN 'assistant_admin' THEN 'DLI Assistant Admin'
  ELSE v_person.full_name END;
 PERFORM pg_advisory_xact_lock(hashtextextended(v_user::text,50));
 SELECT count(*) INTO v_used FROM private.dli_prod_realtimekit_issuance_audit
 WHERE user_id=v_user AND requested_at>now()-interval '1 hour';
 IF v_used>=20 THEN RETURN NULL; END IF;
 INSERT INTO private.dli_prod_realtimekit_issuance_audit(user_id,room_id)
 VALUES(v_user,p_room);
 RETURN jsonb_build_object('preset',v_preset,'display_name',left(v_role_label,100),
  'room_title',left(v_room.title,140),'user_id',v_user);
END;
$$;
REVOKE ALL ON FUNCTION public.dli_prod_realtimekit_access(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.dli_prod_realtimekit_access(uuid) TO authenticated;
COMMENT ON FUNCTION public.dli_prod_realtimekit_access(uuid) IS
 'Q50 production media issue gate: verified active member, joined room, correct role/preset and 20 requests/hour.';
