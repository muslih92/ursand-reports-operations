
CREATE TABLE public.scada_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  equipment_type text NOT NULL DEFAULT 'STATION',
  equipment_no integer NOT NULL DEFAULT 0,
  group_key text NOT NULL,
  param_key text NOT NULL,
  name_en text NOT NULL,
  name_ar text,
  unit text,
  scada_tag text,
  reference_value numeric,
  limit_mode text NOT NULL DEFAULT 'fixed',
  hi numeric, hh numeric, lo numeric, ll numeric,
  min_value numeric, max_value numeric,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_id, equipment_type, equipment_no, param_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scada_parameters TO authenticated;
GRANT ALL ON public.scada_parameters TO service_role;
ALTER TABLE public.scada_parameters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scada_params_read" ON public.scada_parameters FOR SELECT TO authenticated USING (true);
CREATE POLICY "scada_params_admin_write" ON public.scada_parameters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'supervisor'));

CREATE TRIGGER trg_scada_parameters_touch BEFORE UPDATE ON public.scada_parameters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.scada_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parameter_id uuid NOT NULL REFERENCES public.scada_parameters(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  ts timestamptz NOT NULL DEFAULT now(),
  value numeric NOT NULL,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_scada_samples_param_ts ON public.scada_samples (parameter_id, ts DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scada_samples TO authenticated;
GRANT ALL ON public.scada_samples TO service_role;
ALTER TABLE public.scada_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scada_samples_read" ON public.scada_samples FOR SELECT TO authenticated USING (true);
CREATE POLICY "scada_samples_write" ON public.scada_samples FOR INSERT TO authenticated
  WITH CHECK (public.is_unrestricted_viewer(auth.uid()) OR public.can_access_station(auth.uid(), station_id));
CREATE POLICY "scada_samples_admin_manage" ON public.scada_samples FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
