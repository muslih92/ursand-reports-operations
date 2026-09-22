CREATE OR REPLACE FUNCTION public.staff_month_scores(_month date DEFAULT NULL::date)
 RETURNS TABLE(user_id uuid, full_name text, employee_no text, role text, station_code text, m1 numeric, m2 numeric, m3 numeric, m4 numeric, total_score numeric, rank integer, month_start date, month_end date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ms date;
  me date;
  nd numeric;
  ref date := DATE '2026-01-05';
  d date;
  unrestricted boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  unrestricted := public.is_unrestricted_viewer(auth.uid()) OR public.has_role(auth.uid(), 'viewer'::app_role);

  d := COALESCE(_month, (now() AT TIME ZONE 'Asia/Riyadh')::date);
  ms := ref + (floor((d - ref)::numeric / 14) * 14)::int;
  me := ms + 13;
  nd := 14::numeric;

  INSERT INTO public.audit_events (actor_id, event_type, entity_table, station_id, details)
  VALUES (auth.uid(), 'leaderboard.staff_month.read', 'profiles',
          public.get_user_station(auth.uid()),
          jsonb_build_object('period_start', ms, 'period_end', me, 'unrestricted', unrestricted));

  RETURN QUERY
  WITH people AS (
    SELECT p.id, p.full_name, p.employee_no,
           CASE WHEN ur.role::text = 'supervisor' THEN 'supervisor' ELSE 'operator' END AS rl,
           s.code AS scode,
           p.station_id AS sid
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.stations s ON s.id = p.station_id
    WHERE p.active AND ur.role::text IN ('operator','supervisor')
  ),
  op_reads AS (
    SELECT re.operator_id AS uid, count(DISTINCT re.entry_date)::numeric AS days
    FROM public.reading_entries re
    WHERE re.entry_date BETWEEN ms AND me AND re.operator_id IS NOT NULL
    GROUP BY re.operator_id
  ),
  op_vals AS (
    SELECT re.operator_id AS uid,
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
    WHERE re.entry_date BETWEEN ms AND me AND re.operator_id IS NOT NULL AND rv.value IS NOT NULL
    GROUP BY re.operator_id
  ),
  op_reports AS (
    SELECT sr.operator_id AS uid, count(DISTINCT (sr.report_date, sr.shift))::numeric AS slots
    FROM public.shift_reports sr
    WHERE sr.report_date BETWEEN ms AND me AND sr.operator_id IS NOT NULL
    GROUP BY sr.operator_id
  ),
  sv_avail AS (
    SELECT e.supervisor_id AS uid, count(DISTINCT e.entry_date)::numeric AS days
    FROM public.equipment_availability_entries e
    WHERE e.entry_date BETWEEN ms AND me AND e.supervisor_id IS NOT NULL
    GROUP BY e.supervisor_id
  ),
  sv_routines AS (
    SELECT r.supervisor_id AS uid, count(DISTINCT r.routine_date)::numeric AS days
    FROM public.supervisor_routines r
    WHERE r.routine_date BETWEEN ms AND me AND r.supervisor_id IS NOT NULL
    GROUP BY r.supervisor_id
  ),
  sv_replies AS (
    SELECT m.author_id AS uid, count(*)::numeric AS replies
    FROM public.station_messages m
    WHERE m.created_at::date BETWEEN ms AND me AND m.author_id IS NOT NULL
    GROUP BY m.author_id
  ),
  sv_incidents AS (
    SELECT ps.user_id AS uid,
           count(*)::numeric AS total,
           count(*) FILTER (WHERE i.status::text IN ('closed','resolved'))::numeric AS closed
    FROM public.incidents i
    JOIN public.profile_stations ps ON ps.station_id = i.station_id
    WHERE i.occurred_at::date BETWEEN ms AND me
    GROUP BY ps.user_id
  ),
  scored AS (
    SELECT
      pe.id, pe.full_name, pe.employee_no, pe.rl, pe.scode, pe.sid,
      CASE WHEN pe.rl = 'operator'
        THEN round(LEAST(COALESCE(orr.days,0) / nd * 100, 100), 1)
        ELSE round(LEAST(COALESCE(sa.days,0) / nd * 100, 100), 1) END AS a1,
      CASE WHEN pe.rl = 'operator'
        THEN round(LEAST(COALESCE(orp.slots,0) / (nd * 2) * 100, 100), 1)
        ELSE round(LEAST(COALESCE(sr2.days,0) / nd * 100, 100), 1) END AS a2,
      CASE WHEN pe.rl = 'operator'
        THEN round(COALESCE(ov.on_time / NULLIF(ov.timed,0) * 100, 0), 1)
        ELSE round(COALESCE(si.closed / NULLIF(si.total,0) * 100, 100), 1) END AS a3,
      CASE WHEN pe.rl = 'operator'
        THEN round(LEAST(COALESCE(ov.filled,0) / (nd * 80) * 100, 100), 1)
        ELSE round(LEAST(COALESCE(sm.replies,0) / 10 * 100, 100), 1) END AS a4
    FROM people pe
    LEFT JOIN op_reads    orr ON orr.uid = pe.id
    LEFT JOIN op_vals     ov  ON ov.uid  = pe.id
    LEFT JOIN op_reports  orp ON orp.uid = pe.id
    LEFT JOIN sv_avail    sa  ON sa.uid  = pe.id
    LEFT JOIN sv_routines sr2 ON sr2.uid = pe.id
    LEFT JOIN sv_replies  sm  ON sm.uid  = pe.id
    LEFT JOIN sv_incidents si ON si.uid  = pe.id
  ),
  totals AS (
    SELECT sc.*,
      CASE WHEN sc.rl = 'operator'
        THEN round(sc.a1*0.35 + sc.a2*0.20 + sc.a3*0.30 + sc.a4*0.15, 1)
        ELSE round(sc.a1*0.35 + sc.a2*0.25 + sc.a3*0.20 + sc.a4*0.20, 1) END AS tot
    FROM scored sc
  ),
  ranked AS (
    SELECT t.*, (rank() OVER (PARTITION BY t.rl ORDER BY t.tot DESC, t.full_name))::int AS rnk
    FROM totals t
    WHERE t.tot > 0
  )
  SELECT r.id, r.full_name,
         CASE WHEN unrestricted THEN r.employee_no ELSE NULL END,
         r.rl, r.scode,
         r.a1, r.a2, r.a3, r.a4, r.tot,
         r.rnk, ms, me
  FROM ranked r
  WHERE unrestricted
     OR r.id = auth.uid()
     OR public.can_access_station(auth.uid(), r.sid)
  ORDER BY r.rl, r.tot DESC, r.full_name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.staff_month_scores(date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.staff_month_scores(date) TO authenticated;