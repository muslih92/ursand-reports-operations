
DELETE FROM public.reading_fields WHERE template_id IN (
  SELECT id FROM public.reading_templates WHERE code IN
  ('PS1_AB','PS2_AB','PS3_AB','PS4_AB','PS5_AB','PS6_AB',
   'PS1_C','PS2_C','PS3_C','PS4_C',
   'PS1_FG','PS2_FG','PS3_FG')
);
DELETE FROM public.reading_sections WHERE template_id IN (
  SELECT id FROM public.reading_templates WHERE code IN
  ('PS1_AB','PS2_AB','PS3_AB','PS4_AB','PS5_AB','PS6_AB',
   'PS1_C','PS2_C','PS3_C','PS4_C',
   'PS1_FG','PS2_FG','PS3_FG')
);
