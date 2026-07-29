CREATE TABLE public.fire_pump_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  test_date date NOT NULL DEFAULT current_date,
  pump_tag text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  supervisor_notes text,
  supervisor_name text,
  operator_name text,
  operator_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fire_pump_tests TO authenticated;
GRANT ALL ON public.fire_pump_tests TO service_role;

ALTER TABLE public.fire_pump_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view fire pump tests"
  ON public.fire_pump_tests FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can create fire pump tests"
  ON public.fire_pump_tests FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated can update fire pump tests"
  ON public.fire_pump_tests FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Owner or admin can delete fire pump tests"
  ON public.fire_pump_tests FOR DELETE TO authenticated
  USING (created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER fire_pump_tests_touch_updated_at
  BEFORE UPDATE ON public.fire_pump_tests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();