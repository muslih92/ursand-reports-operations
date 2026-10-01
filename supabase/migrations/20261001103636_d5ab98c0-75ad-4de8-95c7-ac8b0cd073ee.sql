-- ===== Security hardening (H1, H3 review, M1, M2, M3, M4, L2, L3, L4) =====

-- ---------- H1 + L3: station-scoped reads (supervisor no longer global; management duplicates merged) ----------
DROP POLICY IF EXISTS "entries_read" ON public.reading_entries;
DROP POLICY IF EXISTS "Management can view readings" ON public.reading_entries;
CREATE POLICY "entries_read" ON public.reading_entries FOR SELECT TO authenticated
USING (public.is_unrestricted_viewer(auth.uid()) OR public.has_role(auth.uid(),'viewer'::app_role) OR public.can_access_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "values_read" ON public.reading_values;
DROP POLICY IF EXISTS "Management can view reading values" ON public.reading_values;
CREATE POLICY "values_read" ON public.reading_values FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.reading_entries e WHERE e.id = reading_values.entry_id AND (
  public.is_unrestricted_viewer(auth.uid()) OR public.has_role(auth.uid(),'viewer'::app_role) OR public.can_access_station(auth.uid(), e.station_id))));

DROP POLICY IF EXISTS "incidents_read" ON public.incidents;
DROP POLICY IF EXISTS "Management can view incidents" ON public.incidents;
CREATE POLICY "incidents_read" ON public.incidents FOR SELECT TO authenticated
USING (public.is_unrestricted_viewer(auth.uid()) OR public.has_role(auth.uid(),'viewer'::app_role) OR public.can_access_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "att_read" ON public.incident_attachments;
CREATE POLICY "att_read" ON public.incident_attachments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_attachments.incident_id AND (
  public.is_unrestricted_viewer(auth.uid()) OR public.has_role(auth.uid(),'viewer'::app_role) OR public.can_access_station(auth.uid(), i.station_id))));

DROP POLICY IF EXISTS "Admins and supervisors read all shift reports" ON public.shift_reports;
DROP POLICY IF EXISTS "Management can view shift reports" ON public.shift_reports;
CREATE POLICY "Unrestricted viewers read all shift reports" ON public.shift_reports FOR SELECT TO authenticated
USING (public.is_unrestricted_viewer(auth.uid()) OR public.has_role(auth.uid(),'viewer'::app_role));

DROP POLICY IF EXISTS "availability_select_scoped" ON public.equipment_availability_entries;
DROP POLICY IF EXISTS "Management can view MDR entries" ON public.equipment_availability_entries;
CREATE POLICY "availability_select_scoped" ON public.equipment_availability_entries FOR SELECT TO authenticated
USING (public.is_unrestricted_viewer(auth.uid()) OR public.has_role(auth.uid(),'viewer'::app_role) OR public.can_access_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "stations_read" ON public.stations;
CREATE POLICY "stations_read" ON public.stations FOR SELECT TO authenticated
USING (public.is_unrestricted_viewer(auth.uid()) OR public.has_role(auth.uid(),'viewer'::app_role) OR public.can_access_station(auth.uid(), id));

-- ---------- M1: shift report insert/update scoped to station ----------
DROP POLICY IF EXISTS "Operators insert for own station" ON public.shift_reports;
CREATE POLICY "Operators insert for own station" ON public.shift_reports FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role)
  OR ((public.has_role(auth.uid(),'supervisor'::app_role) OR public.has_role(auth.uid(),'operator'::app_role))
      AND public.can_access_station(auth.uid(), station_id)));

DROP POLICY IF EXISTS "Operators update own reports" ON public.shift_reports;
CREATE POLICY "Operators update own reports" ON public.shift_reports FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role)
  OR (public.has_role(auth.uid(),'supervisor'::app_role) AND public.can_access_station(auth.uid(), station_id))
  OR (operator_id = auth.uid() AND public.can_access_station(auth.uid(), station_id)))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role)
  OR (public.has_role(auth.uid(),'supervisor'::app_role) AND public.can_access_station(auth.uid(), station_id))
  OR (operator_id = auth.uid() AND public.can_access_station(auth.uid(), station_id)));

-- ---------- M2: supervisor routines writes = admin or station supervisor ----------
DROP POLICY IF EXISTS "routines_insert" ON public.supervisor_routines;
CREATE POLICY "routines_insert" ON public.supervisor_routines FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role)
  OR (public.has_role(auth.uid(),'supervisor'::app_role) AND public.can_access_station(auth.uid(), station_id)));
DROP POLICY IF EXISTS "routines_update" ON public.supervisor_routines;
CREATE POLICY "routines_update" ON public.supervisor_routines FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role)
  OR (public.has_role(auth.uid(),'supervisor'::app_role) AND public.can_access_station(auth.uid(), station_id)))
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role)
  OR (public.has_role(auth.uid(),'supervisor'::app_role) AND public.can_access_station(auth.uid(), station_id)));

-- ---------- L4: fire pump delete requires current station access ----------
DROP POLICY IF EXISTS "Owner or admin can delete fire pump tests" ON public.fire_pump_tests;
CREATE POLICY "Owner or admin can delete fire pump tests" ON public.fire_pump_tests FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin'::app_role)
  OR (created_by = auth.uid() AND public.can_access_station(auth.uid(), station_id)));

-- ---------- Management must not write SCADA samples ----------
DROP POLICY IF EXISTS "scada_samples_write" ON public.scada_samples;
CREATE POLICY "scada_samples_write" ON public.scada_samples FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin'::app_role)
  OR ((public.has_role(auth.uid(),'supervisor'::app_role) OR public.has_role(auth.uid(),'operator'::app_role))
      AND public.can_access_station(auth.uid(), station_id)));

-- ---------- M3: persistent one-time installation marker ----------
CREATE TABLE IF NOT EXISTS public.app_installation (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  initialized_at timestamptz NOT NULL DEFAULT now(),
  initialized_by uuid
);
REVOKE ALL ON public.app_installation FROM anon, authenticated;
GRANT ALL ON public.app_installation TO service_role;
ALTER TABLE public.app_installation ENABLE ROW LEVEL SECURITY;
-- no policies: only the server (service role) can read/write
INSERT INTO public.app_installation (id, initialized_at)
SELECT true, now()
WHERE EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::app_role)
   OR EXISTS (SELECT 1 FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- ---------- L2: station_week_scores requires auth and is station-scoped ----------
CREATE OR REPLACE FUNCTION public.station_week_scores(_week_start date DEFAULT NULL::date)
 RETURNS TABLE(station_id uuid, code text, name_en text, name_ar text, availability_score numeric, readings_score numeric, systems_score numeric, reports_score numeric, punctuality_score numeric, total_score numeric, rank integer, week_start date, week_end date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ws date;
  we date;
  unrestricted boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  unrestricted := public.is_unrestricted_viewer(auth.uid()) OR public.has_role(auth.uid(), 'viewer'::app_role);
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
    SELECT re.station_id AS sid, count(DISTINCT re.entry_date)::numeric AS days
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
    SELECT sr.station_id AS sid, count(DISTINCT (sr.report_date, sr.shift))::numeric AS slots
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
  ),
  ranked AS (
    SELECT s.*,
      round(s.av * 0.30 + s.rd * 0.25 + s.sy * 0.15 + s.rp * 0.15 + s.pu * 0.15, 1) AS total,
      (rank() OVER (ORDER BY (s.av * 0.30 + s.rd * 0.25 + s.sy * 0.15 + s.rp * 0.15 + s.pu * 0.15) DESC, s.code))::int AS rnk
    FROM scored s
  )
  SELECT r.id, r.code, r.name_en, r.name_ar, r.av, r.rd, r.sy, r.rp, r.pu, r.total, r.rnk, ws, we
  FROM ranked r
  WHERE unrestricted OR public.can_access_station(auth.uid(), r.id)
  ORDER BY r.total DESC, r.code;
END;
$function$;
REVOKE ALL ON FUNCTION public.station_week_scores(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.station_week_scores(date) TO authenticated, service_role;

-- ---------- M4: least-privilege table grants ----------
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM authenticated', t);
    BEGIN
      EXECUTE format('REVOKE MAINTAIN ON public.%I FROM anon, authenticated', t);
    EXCEPTION WHEN others THEN NULL;
    END;
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

-- ---------- Regression: structural checks for the hardened policies ----------
CREATE OR REPLACE FUNCTION public.security_hardening_report()
 RETURNS TABLE(scenario text, expectation text, passed boolean, detail text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ok boolean; v_bad text;
BEGIN
  scenario := 'h1.no_global_supervisor_grant';
  expectation := 'no station-scoped policy grants supervisors access without can_access_station';
  SELECT string_agg(tablename||'.'||policyname, ', ') INTO v_bad
  FROM pg_policies
  WHERE schemaname IN ('public','storage')
    AND tablename NOT IN ('ops_daily','user_roles','profile_stations')
    AND (COALESCE(qual,'')||' '||COALESCE(with_check,'')) ~ 'has_role\(auth\.uid\(\), ''supervisor''::app_role\) OR has_role\(auth\.uid\(\), ''viewer'''
     OR (tablename IN ('stations','reading_entries','incidents','shift_reports','equipment_availability_entries')
         AND cmd='SELECT' AND COALESCE(qual,'') LIKE '%''supervisor''%');
  passed := v_bad IS NULL; detail := v_bad; RETURN NEXT;

  scenario := 'm1.shift_report_update_scoped';
  expectation := 'shift report update USING and WITH CHECK both require station access for supervisors';
  SELECT bool_and(qual LIKE '%can_access_station%' AND with_check LIKE '%can_access_station%'
                  AND qual NOT LIKE '%OR has_role(auth.uid(), ''supervisor''::app_role))')
    INTO v_ok FROM pg_policies WHERE schemaname='public' AND tablename='shift_reports' AND cmd='UPDATE';
  passed := COALESCE(v_ok,false); detail := NULL; RETURN NEXT;

  scenario := 'm2.routines_write_supervisor_only';
  expectation := 'routine insert/update require admin or a station supervisor';
  SELECT bool_and(COALESCE(qual,with_check) LIKE '%''supervisor''%' AND COALESCE(with_check,qual) LIKE '%''supervisor''%')
    INTO v_ok FROM pg_policies WHERE schemaname='public' AND tablename='supervisor_routines' AND cmd IN ('INSERT','UPDATE');
  passed := COALESCE(v_ok,false); detail := NULL; RETURN NEXT;

  scenario := 'm3.installation_marker';
  expectation := 'an initialized system has a persistent installation marker';
  passed := EXISTS (SELECT 1 FROM public.app_installation)
            OR NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role='admin');
  detail := NULL; RETURN NEXT;

  scenario := 'm4.no_anon_table_grants';
  expectation := 'anon holds no privileges on any public table';
  SELECT string_agg(DISTINCT c.relname, ', ') INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, aclexplode(c.relacl) a
  WHERE n.nspname='public' AND c.relkind='r' AND a.grantee = 'anon'::regrole;
  passed := v_bad IS NULL; detail := v_bad; RETURN NEXT;

  scenario := 'm4.no_truncate_for_app_roles';
  expectation := 'authenticated cannot TRUNCATE any public table';
  SELECT string_agg(DISTINCT c.relname, ', ') INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, aclexplode(c.relacl) a
  WHERE n.nspname='public' AND c.relkind='r' AND a.grantee = 'authenticated'::regrole AND a.privilege_type='TRUNCATE';
  passed := v_bad IS NULL; detail := v_bad; RETURN NEXT;

  scenario := 'rls.all_tables';
  expectation := 'row level security is enabled on every public table';
  SELECT string_agg(c.relname, ', ') INTO v_bad FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind='r' AND NOT c.relrowsecurity;
  passed := v_bad IS NULL; detail := v_bad; RETURN NEXT;

  scenario := 'storage.buckets_private';
  expectation := 'attachment and checklist photo buckets are private';
  SELECT NOT bool_or(public) INTO v_ok FROM storage.buckets WHERE id IN ('incident-attachments','checklist-photos');
  passed := COALESCE(v_ok,true); detail := NULL; RETURN NEXT;

  scenario := 'l2.week_scores_auth';
  expectation := 'station_week_scores rejects signed-out callers and anon cannot execute it';
  passed := pg_get_functiondef('public.station_week_scores(date)'::regprocedure) LIKE '%IF auth.uid() IS NULL THEN%'
        AND NOT has_function_privilege('anon','public.station_week_scores(date)','execute');
  detail := NULL; RETURN NEXT;

  scenario := 'l4.fire_pump_delete_scoped';
  expectation := 'fire pump test creators can only delete while they still have station access';
  SELECT bool_and(qual LIKE '%can_access_station%') INTO v_ok
  FROM pg_policies WHERE schemaname='public' AND tablename='fire_pump_tests' AND cmd='DELETE';
  passed := COALESCE(v_ok,false); detail := NULL; RETURN NEXT;

  scenario := 'app_settings.no_secret_keys';
  expectation := 'client-readable settings contain no credential-like keys';
  SELECT string_agg(s.key||'.'||k, ', ') INTO v_bad
  FROM public.app_settings s, jsonb_object_keys(CASE WHEN jsonb_typeof(s.value)='object' THEN s.value ELSE '{}'::jsonb END) k
  WHERE k ~* '(secret|password|token|api_?key|private|credential|service_role)';
  passed := v_bad IS NULL; detail := v_bad; RETURN NEXT;
  RETURN;
END;
$function$;
REVOKE ALL ON FUNCTION public.security_hardening_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.security_hardening_report() TO service_role;