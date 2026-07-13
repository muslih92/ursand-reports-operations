
UPDATE public.reading_templates
SET time_slots = ARRAY['04:00','08:00','16:00','20:00'],
    frequency  = 'every_4h'
WHERE frequency = 'every_6h';
