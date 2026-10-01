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
    AND (
      -- supervisor granted as a bare OR-branch (not combined with AND can_access_station)
      (COALESCE(qual,'')||' '||COALESCE(with_check,'')) ~ 'OR has_role\(auth\.uid\(\), ''supervisor''::app_role\) OR'
      OR (COALESCE(qual,'')||' '||COALESCE(with_check,'')) ~ 'OR has_role\(auth\.uid\(\), ''supervisor''::app_role\)\)?$'
      OR (tablename IN ('stations','reading_entries','reading_values','incidents','incident_attachments','shift_reports','equipment_availability_entries')
          AND cmd='SELECT' AND COALESCE(qual,'') LIKE '%''supervisor''%')
    );
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