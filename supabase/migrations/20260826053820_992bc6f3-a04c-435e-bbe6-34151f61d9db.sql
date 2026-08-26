
-- ---------------------------------------------------------------
-- 1) Generic audit trigger for security-sensitive writes
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  sid uuid;
  details jsonb;
BEGIN
  r := COALESCE(NEW, OLD);
  BEGIN
    sid := (to_jsonb(r) ->> 'station_id')::uuid;
  EXCEPTION WHEN others THEN
    sid := NULL;
  END;

  details := jsonb_build_object('op', TG_OP);
  IF TG_TABLE_NAME = 'user_roles' THEN
    details := details || jsonb_build_object(
      'target_user', (to_jsonb(r) ->> 'user_id'),
      'role', (to_jsonb(r) ->> 'role')
    );
  ELSIF TG_TABLE_NAME = 'incident_attachments' THEN
    details := details || jsonb_build_object(
      'incident_id', (to_jsonb(r) ->> 'incident_id'),
      'file_name', (to_jsonb(r) ->> 'file_name')
    );
  END IF;

  INSERT INTO public.audit_events (actor_id, event_type, entity_table, entity_id, station_id, details)
  VALUES (
    auth.uid(),
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    (to_jsonb(r) ->> 'id')::uuid,
    sid,
    details
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_shift_reports ON public.shift_reports;
CREATE TRIGGER trg_audit_shift_reports
AFTER INSERT OR UPDATE OR DELETE ON public.shift_reports
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_incidents ON public.incidents;
CREATE TRIGGER trg_audit_incidents
AFTER INSERT OR UPDATE OR DELETE ON public.incidents
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_incident_attachments ON public.incident_attachments;
CREATE TRIGGER trg_audit_incident_attachments
AFTER INSERT OR DELETE ON public.incident_attachments
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_availability_entries ON public.equipment_availability_entries;
CREATE TRIGGER trg_audit_availability_entries
AFTER INSERT OR UPDATE OR DELETE ON public.equipment_availability_entries
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_profiles ON public.profiles;
CREATE TRIGGER trg_audit_profiles
AFTER INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

DROP TRIGGER IF EXISTS trg_audit_user_roles ON public.user_roles;
CREATE TRIGGER trg_audit_user_roles
AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.audit_row_change();

-- ---------------------------------------------------------------
-- 2) Audit sensitive reads (leaderboard) - function becomes VOLATILE
-- ---------------------------------------------------------------
DROP FUNCTION IF EXISTS public.staff_month_scores(date);
CREATE FUNCTION public.staff_month_scores(_month date DEFAULT NULL::date)
 RETURNS TABLE(user_id uuid, full_name text, employee_no text, role text, station_code text, m1 numeric, m2 numeric, m3 numeric, m4 numeric, total_score numeric, rank integer, month_start date, month_end date)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ms date;
  me date;
  nd numeric;
  unrestricted boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  unrestricted := public.is_unrestricted_viewer(auth.uid()) OR public.has_role(auth.uid(), 'viewer'::app_role);

  ms := date_trunc('month', COALESCE(_month, (now() AT TIME ZONE 'Asia/Riyadh')::date))::date;
  me := (ms + interval '1 month - 1 day')::date;
  nd := (me - ms + 1)::numeric;

  INSERT INTO public.audit_events (actor_id, event_type, entity_table, station_id, details)
  VALUES (auth.uid(), 'leaderboard.staff_month.read', 'profiles',
          public.get_user_station(auth.uid()),
          jsonb_build_object('month', ms, 'unrestricted', unrestricted));

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
        ELSE round(LEAST(COALESCE(sm.replies,0) / 20 * 100, 100), 1) END AS a4
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

-- ---------------------------------------------------------------
-- 3) Regression scenarios in the security self-test
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.security_regression_report()
RETURNS TABLE(scenario text, expectation text, passed boolean, detail text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ok boolean;
  v_def text;
BEGIN
  -- Leaderboard scoping
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'staff_month_scores' LIMIT 1;

  scenario := 'leaderboard.masks_employee_no';
  expectation := 'employee numbers are only returned to unrestricted viewers';
  passed := v_def LIKE '%CASE WHEN unrestricted THEN r.employee_no%';
  detail := NULL; RETURN NEXT;

  scenario := 'leaderboard.station_scoped';
  expectation := 'restricted callers only see people from stations they can access';
  passed := v_def LIKE '%can_access_station(auth.uid(), r.sid)%';
  detail := NULL; RETURN NEXT;

  scenario := 'leaderboard.anonymous_blocked';
  expectation := 'a signed-out or expired session returns no leaderboard rows';
  passed := v_def LIKE '%IF auth.uid() IS NULL THEN%' AND NOT has_function_privilege('anon', 'public.staff_month_scores(date)', 'execute');
  detail := NULL; RETURN NEXT;

  -- Notifications targeting
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'notify_users' LIMIT 1;

  scenario := 'notify_users.scoped';
  expectation := 'targets must share a station with the sender unless the sender is admin/management';
  passed := v_def LIKE '%can_access_station(auth.uid()%' AND v_def LIKE '%is_unrestricted_viewer(auth.uid())%';
  detail := NULL; RETURN NEXT;

  scenario := 'notify_users.anonymous_blocked';
  expectation := 'signed-out callers cannot send notifications';
  passed := v_def LIKE '%auth.uid() IS NULL THEN RETURN 0%'
        AND NOT has_function_privilege('anon', 'public.notify_users(uuid[],uuid,text,text,text,text)', 'execute');
  detail := NULL; RETURN NEXT;

  -- Incident attachment storage policies
  scenario := 'incident_attachments.storage_uses_can_access_station';
  expectation := 'attachment storage rules honor multi-station assignments';
  SELECT bool_and(
           COALESCE(qual, '') || COALESCE(with_check, '') NOT LIKE '%get_user_station%'
           AND COALESCE(qual, '') || COALESCE(with_check, '') LIKE '%can_access_station%'
         )
    INTO v_ok
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'incident_att_%';
  passed := COALESCE(v_ok, false); detail := NULL; RETURN NEXT;

  scenario := 'incident_attachments.authenticated_only';
  expectation := 'attachment storage rules apply to signed-in users only';
  SELECT bool_and(roles::text = '{authenticated}') INTO v_ok
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'incident_att_%';
  passed := COALESCE(v_ok, false); detail := NULL; RETURN NEXT;

  -- Shift report update scoping
  scenario := 'shift_reports.update_with_check';
  expectation := 'updates cannot move a report to another station or operator';
  SELECT bool_and(with_check IS NOT NULL
                  AND with_check LIKE '%can_access_station%'
                  AND with_check LIKE '%operator_id = auth.uid()%')
    INTO v_ok
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'shift_reports' AND cmd = 'UPDATE';
  passed := COALESCE(v_ok, false); detail := NULL; RETURN NEXT;

  -- Role changes take effect immediately (no cached role tables)
  scenario := 'roles.single_source_of_truth';
  expectation := 'roles are stored only in user_roles and checked through has_role';
  SELECT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name IN ('role','app_role','is_admin')
  ) INTO v_ok;
  passed := v_ok; detail := NULL; RETURN NEXT;

  -- Audit coverage
  scenario := 'audit.write_triggers_present';
  expectation := 'sensitive tables record who changed what';
  SELECT bool_and(x.has_trigger) INTO v_ok FROM (
    SELECT t.tbl, EXISTS (
      SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_proc p ON p.oid = tg.tgfoid
      WHERE n.nspname = 'public' AND c.relname = t.tbl
        AND p.proname IN ('audit_row_change','audit_station_messages')
        AND NOT tg.tgisinternal
    ) AS has_trigger
    FROM (VALUES ('shift_reports'),('incidents'),('incident_attachments'),
                 ('equipment_availability_entries'),('profiles'),('user_roles'),
                 ('station_messages')) AS t(tbl)
  ) x;
  passed := COALESCE(v_ok, false); detail := NULL; RETURN NEXT;

  scenario := 'audit.read_logged_for_leaderboard';
  expectation := 'viewing the staff leaderboard is recorded in the audit log';
  SELECT pg_get_functiondef(p.oid) LIKE '%leaderboard.staff_month.read%' INTO v_ok
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'staff_month_scores' LIMIT 1;
  passed := COALESCE(v_ok, false); detail := NULL; RETURN NEXT;

  RETURN;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.security_regression_report() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.security_regression_report() TO authenticated;
