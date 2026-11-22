-- Each station must have its own daily reading entry for a template.
-- The original schema incorrectly made (template_id, entry_date) globally unique,
-- which prevented two stations from recording the same template on the same day.
ALTER TABLE public.reading_entries
  DROP CONSTRAINT IF EXISTS reading_entries_template_id_entry_date_key;

ALTER TABLE public.reading_entries
  ADD CONSTRAINT reading_entries_template_station_date_key
  UNIQUE (template_id, station_id, entry_date);