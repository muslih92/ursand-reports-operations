
CREATE OR REPLACE FUNCTION public.station_week_scores(_week_start date DEFAULT NULL)
RETURNS TABLE(
  station_id uuid,
  code text,
  name_en text,
  name_ar text,
  availability_score numeric,
  readings_score numeric,
  systems_score numeric,
  reports_score numeric,
  punctuality_score numeric,
  total_score numeric,
  rank integer,
  week_start date,
  week_end date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ws date;
  we date;
BEGIN
  ws := COALESCE(_week_start, (date_trunc('week', (now() AT TIME ZONE 'Asia/Riyadh')::date)::date));
  we := ws + 6;

  RETURN QUERY
  WITH st AS (
    SELECT s.id, s.code, s.name_en, s.name_ar FROM public.stations s WHERE s.active
  ),
  avail AS (
    SELECT e.station_id AS sid,
           count(*) FILTER (WHERE v.status IN (
             'in_service','standby','fixed_speed','in_service_fixed_speed',
             'standby_fixed_speed','emergency_standby','testing'
           ))::numeric AS good,
           count(*)::numeric AS total
    FROM public.equipment_availability_entries e
    JOIN public.equipment_availability_values v ON v.entry_id = e.id
    WHERE e.entry_date BETWEEN ws AND we
    GROUP BY e.station_id
  ),
  reads AS (
    SELECT re.station_id AS sid,
           count(DISTINCT re.entry_date)::numeric AS days
    FROM public.reading_entries re
    WHERE re.entry_date BETWEEN ws AND we
    GROUP BY re.station_id
  ),
  vals AS (
    SELECT re.station_id AS sid,
           count(*)::numeric AS filled,
           count(*) FILTER (
             WHERE rv.recorded_at IS NOT NULL
               AND rv.time_slot ~ '^[0-9]{1,2}:[0-9]{2}$'
               AND abs(extract(epoch FROM (
                     (rv.recorded_at AT TIME ZONE 'Asia/Riyadh')
                     - (re.entry_date + rv.time_slot::time)
                   ))) <= 5400
           )::numeric AS on_time,
           count(*) FILTER (WHERE rv.recorded_at IS NOT NULL)::numeric AS timed
    FROM public.reading_entries re
    JOIN public.reading_values rv ON rv.entry_id = re.id
    WHERE re.entry_date BETWEEN ws AND we AND rv.value IS NOT NULL
    GROUP BY re.station_id
  ),
  reps AS (
    SELECT sr.station_id AS sid,
           count(DISTINCT (sr.report_date, sr.shift))::numeric AS slots
    FROM public.shift_reports sr
    WHERE sr.report_date BETWEEN ws AND we
    GROUP BY sr.station_id
  ),
  scored AS (
    SELECT
      st.id, st.code, st.name_en, st.name_ar,
      round(COALESCE(a.good / NULLIF(a.total, 0) * 100, 0), 1) AS av,
      round(LEAST(COALESCE(r.days, 0) / 7 * 100, 100), 1) AS rd,
      round(LEAST(COALESCE(v.filled, 0) / 200 * 100, 100), 1) AS sy,
      round(LEAST(COALESCE(p.slots, 0) / 14 * 100, 100), 1) AS rp,
      round(COALESCE(v.on_time / NULLIF(v.timed, 0) * 100, 0), 1) AS pu
    FROM st
    LEFT JOIN avail a ON a.sid = st.id
    LEFT JOIN reads r ON r.sid = st.id
    LEFT JOIN vals  v ON v.sid = st.id
    LEFT JOIN reps  p ON p.sid = st.id
  )
  SELECT
    s.id, s.code, s.name_en, s.name_ar,
    s.av, s.rd, s.sy, s.rp, s.pu,
    round(s.av * 0.30 + s.rd * 0.25 + s.sy * 0.15 + s.rp * 0.15 + s.pu * 0.15, 1) AS total,
    (rank() OVER (ORDER BY (s.av * 0.30 + s.rd * 0.25 + s.sy * 0.15 + s.rp * 0.15 + s.pu * 0.15) DESC, s.code))::int,
    ws, we
  FROM scored s
  ORDER BY total DESC, s.code;
END;
$$;

REVOKE ALL ON FUNCTION public.station_week_scores(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.station_week_scores(date) TO authenticated, service_role;
