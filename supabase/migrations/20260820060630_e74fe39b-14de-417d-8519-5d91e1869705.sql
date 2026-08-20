UPDATE public.reading_fields f
SET unit = 'KW'
FROM public.reading_templates t
WHERE t.id = f.template_id
  AND t.code IN ('PS1_FG','PS2_FG','PS3_FG')
  AND f.unit = 'MW';