
CREATE TABLE public.shift_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  shift text NOT NULL CHECK (shift IN ('day','night')),
  line1_label text NOT NULL DEFAULT 'LINE A/B',
  line1_mp1 text, line1_mp2 text, line1_mp3 text, line1_mp4 text,
  line1_inlet text, line1_outlet text, line1_flow text, line1_svs text,
  line2_label text NOT NULL DEFAULT 'LINE G',
  line2_mp1 text, line2_mp2 text, line2_mp3 text, line2_mp4 text,
  line2_inlet text, line2_outlet text, line2_flow text, line2_svs text,
  remarks text[] NOT NULL DEFAULT '{}',
  reported_by text,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shift_reports TO authenticated;
GRANT ALL ON public.shift_reports TO service_role;

ALTER TABLE public.shift_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and supervisors read all shift reports"
  ON public.shift_reports FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'viewer'));

CREATE POLICY "Operators read own station shift reports"
  ON public.shift_reports FOR SELECT TO authenticated
  USING (station_id = public.get_user_station(auth.uid()));

CREATE POLICY "Operators insert for own station"
  ON public.shift_reports FOR INSERT TO authenticated
  WITH CHECK (
    station_id = public.get_user_station(auth.uid())
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE POLICY "Operators update own reports"
  ON public.shift_reports FOR UPDATE TO authenticated
  USING (
    operator_id = auth.uid()
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'supervisor')
  );

CREATE POLICY "Admins delete shift reports"
  ON public.shift_reports FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

CREATE TRIGGER shift_reports_touch
  BEFORE UPDATE ON public.shift_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX shift_reports_station_date_idx
  ON public.shift_reports(station_id, report_date DESC);
