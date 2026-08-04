CREATE TABLE public.generator_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id uuid NOT NULL REFERENCES public.stations(id),
  test_date date NOT NULL DEFAULT current_date,
  genset_tag text,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  supervisor_notes text,
  supervisor_name text,
  operator_name text,
  operator_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generator_tests TO authenticated;
GRANT ALL ON public.generator_tests TO service_role;

ALTER TABLE public.generator_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gen_tests_select" ON public.generator_tests FOR SELECT TO authenticated USING (true);

CREATE POLICY "gen_tests_insert" ON public.generator_tests FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')
  OR (public.has_role(auth.uid(), 'operator') AND station_id = public.get_user_station(auth.uid()))
);

CREATE POLICY "gen_tests_update" ON public.generator_tests FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')
  OR (public.has_role(auth.uid(), 'operator') AND station_id = public.get_user_station(auth.uid()))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor')
  OR (public.has_role(auth.uid(), 'operator') AND station_id = public.get_user_station(auth.uid()))
);

CREATE POLICY "gen_tests_delete" ON public.generator_tests FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'supervisor'));

CREATE TRIGGER generator_tests_touch_updated_at BEFORE UPDATE ON public.generator_tests
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();