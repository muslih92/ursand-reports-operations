CREATE TABLE public.ops_daily (
  day date NOT NULL,
  model text NOT NULL,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, model)
);
GRANT SELECT ON public.ops_daily TO authenticated;
GRANT ALL ON public.ops_daily TO service_role;
ALTER TABLE public.ops_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ops_daily_read_authenticated" ON public.ops_daily FOR SELECT TO authenticated USING (true);
CREATE POLICY "ops_daily_admin_write" ON public.ops_daily FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX ops_daily_model_day_idx ON public.ops_daily (model, day);