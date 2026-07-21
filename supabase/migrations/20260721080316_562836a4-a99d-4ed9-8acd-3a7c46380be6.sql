UPDATE public.reading_templates
SET time_slots = ARRAY(
  SELECT s FROM unnest(time_slots) WITH ORDINALITY AS t(s, ord)
  ORDER BY ((substring(s,1,2)::int - 8 + 24) % 24), ord
);