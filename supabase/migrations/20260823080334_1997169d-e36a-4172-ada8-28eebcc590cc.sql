ALTER TABLE public.scada_parameters ADD COLUMN IF NOT EXISTS equipment_label text;

DELETE FROM public.scada_samples;
DELETE FROM public.scada_parameters;

WITH sec AS (
  SELECT
    t.station_id,
    s.id AS section_id,
    s.name_en,
    s.name_ar,
    s.sort_order,
    CASE
      WHEN s.name_en ~* 'MAIN' THEN 'MP'
      WHEN s.name_en ~* 'BOOSTER|LIFTING' THEN 'BP'
      ELSE 'STATION'
    END AS eq_type
  FROM public.reading_sections s
  JOIN public.reading_templates t ON t.id = s.template_id
  WHERE t.active AND t.station_id IS NOT NULL
),
sec_no AS (
  SELECT sec.*,
    ROW_NUMBER() OVER (PARTITION BY station_id, eq_type ORDER BY sort_order, name_en)::int AS eq_no
  FROM sec
)
INSERT INTO public.scada_parameters (
  station_id, equipment_type, equipment_no, equipment_label,
  group_key, param_key, name_en, name_ar, unit,
  reference_value, limit_mode, hi, hh, lo, ll, min_value, max_value, sort_order, active
)
SELECT
  sn.station_id,
  sn.eq_type,
  sn.eq_no,
  sn.name_en,
  CASE
    WHEN f.label_en ~* 'VIB' THEN 'vibration'
    WHEN f.label_en ~* 'TEMP' THEN 'temperature'
    WHEN f.label_en ~* 'PRESS' THEN 'pressure'
    WHEN f.label_en ~* 'FLOW' THEN 'flow'
    WHEN f.label_en ~* 'CURRENT|AMP|VOLT|POWER|(^|[^A-Z])KW|(^|[^A-Z])MW|(^|[^A-Z])KV|HZ' THEN 'electrical'
    WHEN sn.name_en ~* 'CHILLER' THEN 'chiller'
    WHEN sn.name_en ~* 'COOLING' THEN 'cooling'
    WHEN sn.name_en ~* 'SURGE' THEN 'surge'
    ELSE 'general'
  END AS group_key,
  'f_' || replace(f.id::text, '-', '') AS param_key,
  f.label_en,
  COALESCE(f.label_ar, f.label_en),
  f.unit,
  NULL, 'fixed',
  f.max_value, NULL, f.min_value, NULL,
  f.min_value, f.max_value,
  f.sort_order,
  true
FROM sec_no sn
JOIN public.reading_fields f ON f.section_id = sn.section_id;