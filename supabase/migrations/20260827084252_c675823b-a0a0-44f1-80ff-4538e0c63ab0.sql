CREATE TABLE public.defeat_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  sl_no integer NOT NULL DEFAULT 1,
  defeat_number text,
  area_system text,
  defeat_duration text,
  date_issued date,
  issued_signature text,
  date_released text,
  released_signature text,
  remarks text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.defeat_records TO authenticated;
GRANT ALL ON public.defeat_records TO service_role;

ALTER TABLE public.defeat_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View defeat records for accessible stations"
ON public.defeat_records FOR SELECT TO authenticated
USING (public.can_access_station(auth.uid(), station_id) OR public.is_unrestricted_viewer(auth.uid()));

CREATE POLICY "Staff can add defeat records"
ON public.defeat_records FOR INSERT TO authenticated
WITH CHECK (
  (public.can_access_station(auth.uid(), station_id) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'operator'))
);

CREATE POLICY "Staff can edit defeat records"
ON public.defeat_records FOR UPDATE TO authenticated
USING (
  (public.can_access_station(auth.uid(), station_id) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'operator'))
)
WITH CHECK (
  (public.can_access_station(auth.uid(), station_id) OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'))
  AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management') OR public.has_role(auth.uid(), 'operator'))
);

CREATE POLICY "Admins can delete defeat records"
ON public.defeat_records FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER defeat_records_touch_updated_at
BEFORE UPDATE ON public.defeat_records
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_defeat_records_station ON public.defeat_records(station_id, sl_no);