CREATE TABLE public.checklist_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  shift text NOT NULL DEFAULT '',
  operator_id uuid,
  operator_name text,
  employee_no text,
  ok_count integer NOT NULL DEFAULT 0,
  remark_count integer NOT NULL DEFAULT 0,
  na_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  completion_pct numeric NOT NULL DEFAULT 0,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  remarks jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX checklist_reports_station_date_idx ON public.checklist_reports (station_id, report_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.checklist_reports TO authenticated;
GRANT ALL ON public.checklist_reports TO service_role;

ALTER TABLE public.checklist_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_reports_select_scoped"
  ON public.checklist_reports FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'management')
    OR public.is_unrestricted_viewer(auth.uid())
    OR public.can_access_station(auth.uid(), station_id)
  );

CREATE POLICY "checklist_reports_insert_scoped"
  ON public.checklist_reports FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.can_access_station(auth.uid(), station_id)
  );

CREATE POLICY "checklist_reports_update_admin"
  ON public.checklist_reports FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "checklist_reports_delete_admin"
  ON public.checklist_reports FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER checklist_reports_touch
  BEFORE UPDATE ON public.checklist_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();