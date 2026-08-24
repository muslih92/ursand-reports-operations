
CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  event_type text NOT NULL,
  entity_table text,
  entity_id uuid,
  station_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS audit_events_occurred_at_idx ON public.audit_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_type_idx ON public.audit_events (event_type);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON public.audit_events (actor_id);

GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_events_admin_read ON public.audit_events;
CREATE POLICY audit_events_admin_read ON public.audit_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.log_audit_event(
  _event_type text,
  _entity_table text DEFAULT NULL,
  _entity_id uuid DEFAULT NULL,
  _station_id uuid DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.audit_events (actor_id, event_type, entity_table, entity_id, station_id, details)
  VALUES (auth.uid(), _event_type, _entity_table, _entity_id, _station_id, COALESCE(_details, '{}'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit_event(text, text, uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.audit_station_messages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record;
BEGIN
  r := COALESCE(NEW, OLD);
  INSERT INTO public.audit_events (actor_id, event_type, entity_table, entity_id, station_id, details)
  VALUES (
    auth.uid(),
    'message.' || lower(TG_OP),
    'station_messages',
    r.id,
    r.station_id,
    jsonb_build_object(
      'parent_id', r.parent_id,
      'author_id', r.author_id,
      'author_role', r.author_role,
      'subject', r.subject,
      'audience_roles', r.audience_roles,
      'target_station_ids', r.target_station_ids,
      'target_user_count', COALESCE(array_length(r.target_user_ids, 1), 0)
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_station_messages_audit ON public.station_messages;
CREATE TRIGGER trg_station_messages_audit
AFTER INSERT OR UPDATE OR DELETE ON public.station_messages
FOR EACH ROW EXECUTE FUNCTION public.audit_station_messages();

-- Notification fan-out auditing
CREATE OR REPLACE FUNCTION public.notify_station(_station_id uuid, _kind text, _title text, _body text, _link text DEFAULT NULL::text, _include_operators boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted integer;
BEGIN
  IF _station_id IS NULL OR _title IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notifications (user_id, station_id, kind, title, body, link)
  SELECT DISTINCT ur.user_id, _station_id, _kind, _title, _body, _link
  FROM public.user_roles ur
  WHERE ur.user_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    AND (
      ur.role IN ('management'::app_role, 'admin'::app_role)
      OR (ur.role = 'supervisor'::app_role AND public.can_access_station(ur.user_id, _station_id))
      OR (_include_operators AND ur.role = 'operator'::app_role AND public.can_access_station(ur.user_id, _station_id))
    );

  GET DIAGNOSTICS inserted = ROW_COUNT;

  INSERT INTO public.audit_events (actor_id, event_type, entity_table, station_id, details)
  VALUES (auth.uid(), 'notification.station', 'notifications', _station_id,
    jsonb_build_object('kind', _kind, 'title', _title, 'recipients', inserted, 'include_operators', _include_operators));

  RETURN inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_station_roles(_station_id uuid, _kind text, _title text, _body text, _link text DEFAULT NULL::text, _roles text[] DEFAULT ARRAY['management'::text, 'admin'::text, 'supervisor'::text])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted integer;
BEGIN
  IF _station_id IS NULL OR _title IS NULL OR _roles IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notifications (user_id, station_id, kind, title, body, link)
  SELECT DISTINCT ur.user_id, _station_id, _kind, _title, _body, _link
  FROM public.user_roles ur
  WHERE ur.user_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    AND ur.role::text = ANY(_roles)
    AND (
      ur.role IN ('management'::app_role, 'admin'::app_role)
      OR public.can_access_station(ur.user_id, _station_id)
    );

  GET DIAGNOSTICS inserted = ROW_COUNT;

  INSERT INTO public.audit_events (actor_id, event_type, entity_table, station_id, details)
  VALUES (auth.uid(), 'notification.station_roles', 'notifications', _station_id,
    jsonb_build_object('kind', _kind, 'title', _title, 'recipients', inserted, 'roles', to_jsonb(_roles)));

  RETURN inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_stations_roles(_station_ids uuid[], _kind text, _title text, _body text, _link text DEFAULT NULL::text, _roles text[] DEFAULT ARRAY['management'::text, 'admin'::text, 'supervisor'::text])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inserted integer;
BEGIN
  IF _station_ids IS NULL OR _title IS NULL OR _roles IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.notifications (user_id, station_id, kind, title, body, link)
  SELECT DISTINCT ur.user_id, _station_ids[1], _kind, _title, _body, _link
  FROM public.user_roles ur
  WHERE ur.user_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    AND ur.role::text = ANY(_roles)
    AND (
      ur.role IN ('management'::app_role, 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM unnest(_station_ids) s WHERE public.can_access_station(ur.user_id, s))
    );
  GET DIAGNOSTICS inserted = ROW_COUNT;

  INSERT INTO public.audit_events (actor_id, event_type, entity_table, station_id, details)
  VALUES (auth.uid(), 'notification.stations_roles', 'notifications', _station_ids[1],
    jsonb_build_object('kind', _kind, 'title', _title, 'recipients', inserted, 'roles', to_jsonb(_roles), 'station_ids', to_jsonb(_station_ids)));

  RETURN inserted;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_users(_user_ids uuid[], _station_id uuid, _kind text, _title text, _body text DEFAULT NULL::text, _link text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inserted integer;
BEGIN
  IF _user_ids IS NULL OR _title IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.notifications (user_id, station_id, kind, title, body, link)
  SELECT DISTINCT u, _station_id, _kind, _title, _body, _link
  FROM unnest(_user_ids) u
  WHERE u <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  GET DIAGNOSTICS inserted = ROW_COUNT;

  INSERT INTO public.audit_events (actor_id, event_type, entity_table, station_id, details)
  VALUES (auth.uid(), 'notification.users', 'notifications', _station_id,
    jsonb_build_object('kind', _kind, 'title', _title, 'recipients', inserted, 'targets', array_length(_user_ids, 1)));

  RETURN inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_stations_roles(uuid[], text, text, text, text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_users(uuid[], uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_station(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_station_roles(uuid, text, text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_stations_roles(uuid[], text, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_users(uuid[], uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_station(uuid, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_station_roles(uuid, text, text, text, text, text[]) TO authenticated;

-- Fix self-referential parent check that rejected legitimate replies
DROP POLICY IF EXISTS station_messages_insert ON public.station_messages;
CREATE POLICY station_messages_insert ON public.station_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      (parent_id IS NULL AND (public.is_unrestricted_viewer(auth.uid()) OR public.can_access_station(auth.uid(), station_id)))
      OR (parent_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.station_messages p
            WHERE p.id = station_messages.parent_id
              AND public.can_view_station_message(auth.uid(), p.station_id, p.author_id, p.audience_roles, p.target_station_ids, p.target_user_ids)
          ))
    )
  );
