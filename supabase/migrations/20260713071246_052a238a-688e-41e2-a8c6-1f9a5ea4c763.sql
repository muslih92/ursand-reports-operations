-- 1) Add custom time_slots per template
ALTER TABLE public.reading_templates
  ADD COLUMN IF NOT EXISTS time_slots text[] NOT NULL DEFAULT '{}';

-- 2) Sections table
CREATE TABLE IF NOT EXISTS public.reading_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES public.reading_templates(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  name_en text NOT NULL,
  name_ar text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_sections TO authenticated;
GRANT ALL ON public.reading_sections TO service_role;

ALTER TABLE public.reading_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read sections"
  ON public.reading_sections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins manage sections"
  ON public.reading_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3) Link fields to a section (nullable for backward compat with any pre-existing rows)
ALTER TABLE public.reading_fields
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.reading_sections(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reading_fields_section ON public.reading_fields(section_id);
CREATE INDEX IF NOT EXISTS idx_reading_sections_template ON public.reading_sections(template_id);
