ALTER TABLE public.station_messages
  ADD COLUMN IF NOT EXISTS audience_roles text[],
  ADD COLUMN IF NOT EXISTS target_station_ids uuid[],
  ADD COLUMN IF NOT EXISTS target_user_ids uuid[];

-- Replies inherit the visibility of their root message
CREATE OR REPLACE FUNCTION public.station_messages_inherit_targets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE p record;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT audience_roles, target_station_ids, target_user_ids, station_id
      INTO p FROM public.station_messages WHERE id = NEW.parent_id;
    IF FOUND THEN
      NEW.audience_roles := p.audience_roles;
      NEW.target_station_ids := p.target_station_ids;
      -- the replier must also stay visible in the thread
      NEW.target_user_ids := CASE
        WHEN p.target_user_ids IS NULL THEN NULL
        ELSE (SELECT ARRAY(SELECT DISTINCT u FROM unnest(p.target_user_ids || ARRAY[NEW.author_id]) u WHERE u IS NOT NULL))
      END;
      NEW.station_id := p.station_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_station_messages_inherit ON public.station_messages;
CREATE TRIGGER trg_station_messages_inherit
BEFORE INSERT ON public.station_messages
FOR EACH ROW EXECUTE FUNCTION public.station_messages_inherit_targets();

-- Visibility helper
CREATE OR REPLACE FUNCTION public.can_view_station_message(
  _user uuid, _station uuid, _author uuid,
  _roles text[], _stations uuid[], _users uuid[]
) RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user IS NOT NULL AND (
    _author = _user
    OR public.has_role(_user, 'admin'::app_role)
    OR (
      CASE
        WHEN _users IS NOT NULL AND array_length(_users, 1) > 0 THEN _user = ANY(_users)
        ELSE
          (_roles IS NULL OR EXISTS (
             SELECT 1 FROM public.user_roles ur
             WHERE ur.user_id = _user AND ur.role::text = ANY(_roles)
          ))
          AND (
            public.is_unrestricted_viewer(_user)
            OR public.can_access_station(_user, _station)
            OR (_stations IS NOT NULL AND EXISTS (
                 SELECT 1 FROM unnest(_stations) s WHERE public.can_access_station(_user, s)
               ))
          )
      END
    )
  )
$$;

GRANT EXECUTE ON FUNCTION public.can_view_station_message(uuid, uuid, uuid, text[], uuid[], uuid[]) TO authenticated;

DROP POLICY IF EXISTS "station_messages_select" ON public.station_messages;
CREATE POLICY "station_messages_select" ON public.station_messages
  FOR SELECT TO authenticated
  USING (public.can_view_station_message(auth.uid(), station_id, author_id, audience_roles, target_station_ids, target_user_ids));

-- Recipients the current user is allowed to address
CREATE OR REPLACE FUNCTION public.list_message_recipients()
RETURNS TABLE (user_id uuid, full_name text, employee_no text, role text, station_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.id, p.full_name, p.employee_no, ur.role::text, p.station_id
  FROM public.profiles p
  JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE p.active
    AND p.id <> auth.uid()
    AND (
      public.is_unrestricted_viewer(auth.uid())
      OR public.can_access_station(auth.uid(), p.station_id)
      OR EXISTS (
        SELECT 1 FROM public.profile_stations ps
        WHERE ps.user_id = p.id AND public.can_access_station(auth.uid(), ps.station_id)
      )
    )
$$;

GRANT EXECUTE ON FUNCTION public.list_message_recipients() TO authenticated;

-- Notify explicit users
CREATE OR REPLACE FUNCTION public.notify_users(
  _user_ids uuid[], _station_id uuid, _kind text, _title text,
  _body text DEFAULT NULL, _link text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE inserted integer;
BEGIN
  IF _user_ids IS NULL OR _title IS NULL THEN RETURN 0; END IF;
  INSERT INTO public.notifications (user_id, station_id, kind, title, body, link)
  SELECT DISTINCT u, _station_id, _kind, _title, _body, _link
  FROM unnest(_user_ids) u
  WHERE u <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_users(uuid[], uuid, text, text, text, text) TO authenticated;

-- Restrict station fan-out notifications to the stations the message targets
CREATE OR REPLACE FUNCTION public.notify_stations_roles(
  _station_ids uuid[], _kind text, _title text, _body text,
  _link text DEFAULT NULL, _roles text[] DEFAULT ARRAY['management','admin','supervisor']
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_stations_roles(uuid[], text, text, text, text, text[]) TO authenticated;