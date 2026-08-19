CREATE TABLE public.supervisor_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id),
  routine_date date NOT NULL,
  weekday smallint NOT NULL,
  supervisor_id uuid,
  supervisor_name text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, routine_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supervisor_routines TO authenticated;
GRANT ALL ON public.supervisor_routines TO service_role;

ALTER TABLE public.supervisor_routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "routines_select" ON public.supervisor_routines FOR SELECT TO authenticated
USING (public.is_unrestricted_viewer(auth.uid()) OR public.can_access_station(auth.uid(), station_id));

CREATE POLICY "routines_insert" ON public.supervisor_routines FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_access_station(auth.uid(), station_id));

CREATE POLICY "routines_update" ON public.supervisor_routines FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_access_station(auth.uid(), station_id))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.can_access_station(auth.uid(), station_id));

CREATE POLICY "routines_delete" ON public.supervisor_routines FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role) OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND public.can_access_station(auth.uid(), station_id)));

CREATE TRIGGER supervisor_routines_touch_updated_at
BEFORE UPDATE ON public.supervisor_routines
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();