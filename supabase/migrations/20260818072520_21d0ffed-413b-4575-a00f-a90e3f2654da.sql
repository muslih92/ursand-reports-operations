UPDATE public.reading_templates t
SET station_id = s.id
FROM public.stations s
WHERE s.code = t.code AND t.station_id IS DISTINCT FROM s.id;