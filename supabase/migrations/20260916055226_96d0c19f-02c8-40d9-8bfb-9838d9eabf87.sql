CREATE OR REPLACE FUNCTION public.notify_station(_station_id uuid, _kind text, _title text, _body text, _link text DEFAULT NULL::text, _include_operators boolean DEFAULT false)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _station_id IS NULL OR _title IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.can_access_station(auth.uid(), _station_id)
  ) THEN
    RAISE EXCEPTION 'not allowed to notify this station';
  END IF;

  INSERT INTO public.notifications (user_id, station_id, kind, title, body, link)
  SELECT DISTINCT ur.user_id, _station_id, _kind, _title, _body, _link
  FROM public.user_roles ur
  WHERE ur.user_id <> auth.uid()
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
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _station_id IS NULL OR _title IS NULL OR _roles IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.can_access_station(auth.uid(), _station_id)
  ) THEN
    RAISE EXCEPTION 'not allowed to notify this station';
  END IF;

  INSERT INTO public.notifications (user_id, station_id, kind, title, body, link)
  SELECT DISTINCT ur.user_id, _station_id, _kind, _title, _body, _link
  FROM public.user_roles ur
  WHERE ur.user_id <> auth.uid()
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
DECLARE
  inserted integer;
  s uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _station_ids IS NULL OR _title IS NULL OR _roles IS NULL THEN RETURN 0; END IF;

  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'management'::app_role)) THEN
    FOREACH s IN ARRAY _station_ids LOOP
      IF NOT public.can_access_station(auth.uid(), s) THEN
        RAISE EXCEPTION 'not allowed to notify this station';
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.notifications (user_id, station_id, kind, title, body, link)
  SELECT DISTINCT ur.user_id, _station_ids[1], _kind, _title, _body, _link
  FROM public.user_roles ur
  WHERE ur.user_id <> auth.uid()
    AND ur.role::text = ANY(_roles)
    AND (
      ur.role IN ('management'::app_role, 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM unnest(_station_ids) x WHERE public.can_access_station(ur.user_id, x))
    );
  GET DIAGNOSTICS inserted = ROW_COUNT;

  INSERT INTO public.audit_events (actor_id, event_type, entity_table, station_id, details)
  VALUES (auth.uid(), 'notification.stations_roles', 'notifications', _station_ids[1],
    jsonb_build_object('kind', _kind, 'title', _title, 'recipients', inserted, 'roles', to_jsonb(_roles), 'station_ids', to_jsonb(_station_ids)));

  RETURN inserted;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_station(uuid, text, text, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_station_roles(uuid, text, text, text, text, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.notify_stations_roles(uuid[], text, text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_station(uuid, text, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_station_roles(uuid, text, text, text, text, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.notify_stations_roles(uuid[], text, text, text, text, text[]) TO authenticated;