ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS incident_no text,
  ADD COLUMN IF NOT EXISTS report_data jsonb NOT NULL DEFAULT '{}'::jsonb;