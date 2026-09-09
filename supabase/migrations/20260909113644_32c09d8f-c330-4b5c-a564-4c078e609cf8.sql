ALTER TABLE public.checklist_reports ADD COLUMN IF NOT EXISTS submitted_at timestamptz NOT NULL DEFAULT now();

DELETE FROM public.checklist_reports a
USING public.checklist_reports b
WHERE a.station_id = b.station_id
  AND a.report_date = b.report_date
  AND a.shift = b.shift
  AND (a.created_at < b.created_at OR (a.created_at = b.created_at AND a.id < b.id));

CREATE UNIQUE INDEX IF NOT EXISTS checklist_reports_station_date_shift_key
  ON public.checklist_reports (station_id, report_date, shift);