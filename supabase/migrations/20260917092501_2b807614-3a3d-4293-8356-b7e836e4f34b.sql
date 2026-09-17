CREATE TABLE IF NOT EXISTS public.checklist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  shift text NOT NULL,
  system text NOT NULL,
  status text NOT NULL DEFAULT 'no_obs',
  note text,
  checked_at text,
  operator_id uuid,
  operator_name text,
  images text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, report_date, shift, system)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_entries TO authenticated;
GRANT ALL ON public.checklist_entries TO service_role;

ALTER TABLE public.checklist_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY checklist_entries_select_scoped ON public.checklist_entries
  FOR SELECT TO authenticated
  USING (public.is_unrestricted_viewer(auth.uid()) OR public.can_access_station(auth.uid(), station_id));

CREATE POLICY checklist_entries_insert_scoped ON public.checklist_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_station(auth.uid(), station_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY checklist_entries_update_scoped ON public.checklist_entries
  FOR UPDATE TO authenticated
  USING (public.can_access_station(auth.uid(), station_id) OR public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.can_access_station(auth.uid(), station_id) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY checklist_entries_delete_scoped ON public.checklist_entries
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND public.can_access_station(auth.uid(), station_id))
  );

CREATE TRIGGER checklist_entries_touch
  BEFORE UPDATE ON public.checklist_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY checklist_photos_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'checklist-photos'
    AND (
      public.is_unrestricted_viewer(auth.uid())
      OR public.can_access_station(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY checklist_photos_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'checklist-photos'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.can_access_station(auth.uid(), ((storage.foldername(name))[1])::uuid)
    )
  );

CREATE POLICY checklist_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'checklist-photos'
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND public.can_access_station(auth.uid(), ((storage.foldername(name))[1])::uuid))
    )
  );