
REVOKE ALL ON FUNCTION public.audit_station_messages() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.security_test_report()
RETURNS TABLE(scenario text, expectation text, passed boolean, detail text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_admin uuid;
  v_mgmt uuid;
  v_sup uuid;
  v_sup_station uuid;
  v_op uuid;            -- operator on the supervisor's station
  v_op_other uuid;      -- operator on a different station
  v_op_other_station uuid;
  v_ok boolean;
BEGIN
  SELECT ur.user_id INTO v_admin FROM public.user_roles ur WHERE ur.role = 'admin' LIMIT 1;
  SELECT ur.user_id INTO v_mgmt FROM public.user_roles ur WHERE ur.role = 'management' LIMIT 1;

  SELECT ur.user_id, p.station_id INTO v_sup, v_sup_station
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'supervisor' AND p.station_id IS NOT NULL
  LIMIT 1;

  SELECT ur.user_id INTO v_op
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'operator' AND p.station_id = v_sup_station
  LIMIT 1;

  SELECT ur.user_id, p.station_id INTO v_op_other, v_op_other_station
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role = 'operator'
    AND p.station_id IS NOT NULL
    AND p.station_id <> v_sup_station
    AND NOT EXISTS (SELECT 1 FROM public.profile_stations ps WHERE ps.user_id = ur.user_id AND ps.station_id = v_sup_station)
  LIMIT 1;

  -- Fixture sanity
  scenario := 'fixtures'; expectation := 'one user per role plus two stations are available';
  passed := v_admin IS NOT NULL AND v_mgmt IS NOT NULL AND v_sup IS NOT NULL AND v_op IS NOT NULL AND v_op_other IS NOT NULL;
  detail := format('admin=%s mgmt=%s sup=%s station=%s op=%s op_other=%s', v_admin, v_mgmt, v_sup, v_sup_station, v_op, v_op_other);
  RETURN NEXT;
  IF NOT passed THEN RETURN; END IF;

  -- Station scoping
  scenario := 'station_scope.own_station'; expectation := 'operator can access their own station';
  passed := public.can_access_station(v_op, v_sup_station); detail := NULL; RETURN NEXT;

  scenario := 'station_scope.foreign_station'; expectation := 'operator cannot access a station they are not assigned to';
  passed := NOT public.can_access_station(v_op, v_op_other_station); detail := NULL; RETURN NEXT;

  scenario := 'station_scope.null_station'; expectation := 'a null station never grants access';
  passed := NOT public.can_access_station(v_op, NULL); detail := NULL; RETURN NEXT;

  scenario := 'roles.unrestricted_viewers'; expectation := 'admin and management are unrestricted, operators are not';
  passed := public.is_unrestricted_viewer(v_admin) AND public.is_unrestricted_viewer(v_mgmt) AND NOT public.is_unrestricted_viewer(v_op);
  detail := NULL; RETURN NEXT;

  -- Station broadcast (no role/user targeting)
  scenario := 'message.station_broadcast'; expectation := 'station members and unrestricted viewers see it, other stations do not';
  passed :=
        public.can_view_station_message(v_op,  v_sup_station, v_sup, NULL, NULL, NULL)
    AND public.can_view_station_message(v_sup, v_sup_station, v_sup, NULL, NULL, NULL)
    AND public.can_view_station_message(v_mgmt,v_sup_station, v_sup, NULL, NULL, NULL)
    AND public.can_view_station_message(v_admin,v_sup_station, v_sup, NULL, NULL, NULL)
    AND NOT public.can_view_station_message(v_op_other, v_sup_station, v_sup, NULL, NULL, NULL);
  detail := NULL; RETURN NEXT;

  -- Supervisor-only thread: management must be excluded
  scenario := 'message.supervisor_only'; expectation := 'supervisors see it; management and operators do not; admin retains oversight';
  passed :=
        public.can_view_station_message(v_sup, v_sup_station, v_sup, ARRAY['supervisor'], ARRAY[v_sup_station], NULL)
    AND NOT public.can_view_station_message(v_mgmt, v_sup_station, v_sup, ARRAY['supervisor'], ARRAY[v_sup_station], NULL)
    AND NOT public.can_view_station_message(v_op,   v_sup_station, v_sup, ARRAY['supervisor'], ARRAY[v_sup_station], NULL)
    AND public.can_view_station_message(v_admin, v_sup_station, v_sup, ARRAY['supervisor'], ARRAY[v_sup_station], NULL);
  detail := NULL; RETURN NEXT;

  -- Role targeting still respects station scope
  scenario := 'message.role_target_station_scoped'; expectation := 'an operator from another station is excluded from an operator-targeted station thread';
  passed :=
        public.can_view_station_message(v_op, v_sup_station, v_sup, ARRAY['operator'], ARRAY[v_sup_station], NULL)
    AND NOT public.can_view_station_message(v_op_other, v_sup_station, v_sup, ARRAY['operator'], ARRAY[v_sup_station], NULL);
  detail := NULL; RETURN NEXT;

  -- Explicit user targeting
  scenario := 'message.user_target'; expectation := 'only listed users (plus admin) see a direct message';
  passed :=
        public.can_view_station_message(v_op, v_sup_station, v_sup, NULL, NULL, ARRAY[v_op, v_sup])
    AND public.can_view_station_message(v_sup, v_sup_station, v_sup, NULL, NULL, ARRAY[v_op, v_sup])
    AND NOT public.can_view_station_message(v_mgmt, v_sup_station, v_sup, NULL, NULL, ARRAY[v_op, v_sup])
    AND NOT public.can_view_station_message(v_op_other, v_sup_station, v_sup, NULL, NULL, ARRAY[v_op, v_sup])
    AND public.can_view_station_message(v_admin, v_sup_station, v_sup, NULL, NULL, ARRAY[v_op, v_sup]);
  detail := NULL; RETURN NEXT;

  -- Author always sees replies to their own thread
  scenario := 'message.author_sees_own'; expectation := 'the author sees their thread even when not in the target list';
  passed := public.can_view_station_message(v_mgmt, v_sup_station, v_mgmt, ARRAY['supervisor'], ARRAY[v_sup_station], NULL);
  detail := NULL; RETURN NEXT;

  scenario := 'message.anonymous'; expectation := 'an unauthenticated caller sees nothing';
  passed := NOT public.can_view_station_message(NULL, v_sup_station, v_sup, NULL, NULL, NULL);
  detail := NULL; RETURN NEXT;

  -- Existing rows must never be visible to a user outside their scope
  scenario := 'message.live_rows_scoped'; expectation := 'every stored message an out-of-scope operator can see is one addressed to them';
  SELECT bool_and(
           NOT public.can_view_station_message(v_op_other, m.station_id, m.author_id, m.audience_roles, m.target_station_ids, m.target_user_ids)
           OR m.author_id = v_op_other
           OR public.can_access_station(v_op_other, m.station_id)
           OR (m.target_user_ids IS NOT NULL AND v_op_other = ANY(m.target_user_ids))
         )
    INTO v_ok
  FROM public.station_messages m;
  passed := COALESCE(v_ok, true); detail := NULL; RETURN NEXT;

  -- Notification privacy
  scenario := 'notifications.select_policy'; expectation := 'notifications are readable only by their owner';
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='notifications' AND cmd='SELECT'
      AND qual = '(user_id = auth.uid())'
  ) INTO v_ok;
  passed := v_ok; detail := NULL; RETURN NEXT;

  scenario := 'notifications.no_client_insert'; expectation := 'clients cannot insert notifications directly';
  SELECT NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notifications' AND cmd='INSERT'
  ) INTO v_ok;
  passed := v_ok; detail := NULL; RETURN NEXT;

  scenario := 'notifications.rls_enabled'; expectation := 'row level security is enabled on notifications and messages';
  SELECT bool_and(c.relrowsecurity) INTO v_ok
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('notifications','station_messages','audit_events','profiles','user_roles');
  passed := COALESCE(v_ok,false); detail := NULL; RETURN NEXT;

  -- Audit log protection
  scenario := 'audit.admin_only_read'; expectation := 'only admins can read the audit log and no one can write it from the client';
  SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_events' AND cmd='SELECT')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_events' AND cmd IN ('INSERT','UPDATE','DELETE'))
    INTO v_ok;
  passed := v_ok; detail := NULL; RETURN NEXT;

  scenario := 'audit.no_anon_exec'; expectation := 'anonymous callers cannot execute notification or audit helpers';
  SELECT bool_and(NOT has_function_privilege('anon', p.oid, 'execute')) INTO v_ok
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef;
  passed := COALESCE(v_ok,false); detail := NULL; RETURN NEXT;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.security_test_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.security_test_report() TO service_role;
