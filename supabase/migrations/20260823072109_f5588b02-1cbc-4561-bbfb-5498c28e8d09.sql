-- Notifications
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  station_id uuid REFERENCES public.stations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, read, created_at DESC);

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Fan-out helper: notify supervisors/admins of a station (+ management, always)
CREATE OR REPLACE FUNCTION public.notify_station(
  _station_id uuid,
  _kind text,
  _title text,
  _body text,
  _link text DEFAULT NULL,
  _include_operators boolean DEFAULT false
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  RETURN inserted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_station(uuid, text, text, text, text, boolean) TO authenticated;

-- Station <-> Management messaging
CREATE TABLE public.station_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.station_messages(id) ON DELETE CASCADE,
  subject text,
  body text NOT NULL,
  author_id uuid,
  author_name text,
  author_role text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_station_messages_station ON public.station_messages(station_id, created_at DESC);
CREATE INDEX idx_station_messages_parent ON public.station_messages(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.station_messages TO authenticated;
GRANT ALL ON public.station_messages TO service_role;
ALTER TABLE public.station_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "station_messages_select" ON public.station_messages
  FOR SELECT TO authenticated
  USING (public.is_unrestricted_viewer(auth.uid()) OR public.can_access_station(auth.uid(), station_id));

CREATE POLICY "station_messages_insert" ON public.station_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (public.is_unrestricted_viewer(auth.uid()) OR public.can_access_station(auth.uid(), station_id))
  );

CREATE POLICY "station_messages_delete_own_or_admin" ON public.station_messages
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));