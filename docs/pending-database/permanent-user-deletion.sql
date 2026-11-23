-- REVIEW ONLY. Not installed, not part of the automatic migration directory.
-- Apply atomically through the approved migration workflow after backup verification.
CREATE TABLE public.historical_user_identities (
  id uuid PRIMARY KEY,
  full_name text,
  employee_no text,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.historical_user_identities TO authenticated;
GRANT ALL ON public.historical_user_identities TO service_role;
ALTER TABLE public.historical_user_identities ENABLE ROW LEVEL SECURITY;
CREATE POLICY historical_identity_admin_read ON public.historical_user_identities
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY historical_identity_scoped_read ON public.historical_user_identities
 FOR SELECT TO authenticated USING (
 public.is_unrestricted_viewer(auth.uid()) OR public.has_role(auth.uid(),'viewer')
 OR id=auth.uid()
 OR EXISTS(SELECT 1 FROM public.deleted_items d WHERE (d.deleted_by=id OR d.restored_by=id) AND public.can_access_station(auth.uid(),d.station_id))
 OR EXISTS(SELECT 1 FROM public.reading_entries e WHERE e.operator_id=id AND public.can_access_station(auth.uid(),e.station_id))
 OR EXISTS(SELECT 1 FROM public.station_notes n WHERE n.author_id=id AND public.can_access_station(auth.uid(),n.station_id))
 );

CREATE TABLE public.user_deletion_operations (
  target_id uuid PRIMARY KEY REFERENCES public.historical_user_identities(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES public.historical_user_identities(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('delete','deactivate')),
  state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','completed')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT ALL ON public.user_deletion_operations TO service_role;
GRANT SELECT ON public.user_deletion_operations TO authenticated;
ALTER TABLE public.user_deletion_operations ENABLE ROW LEVEL SECURITY;
CREATE POLICY deletion_operations_admin_read ON public.user_deletion_operations
 FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- First preserve existing profile identity. Never overwrite operation-time names.
INSERT INTO public.historical_user_identities(id, full_name, employee_no)
SELECT id, NULLIF(btrim(full_name),''), NULLIF(btrim(employee_no),'') FROM public.profiles;
INSERT INTO public.historical_user_identities(id)
SELECT id FROM auth.users ON CONFLICT (id) DO NOTHING;

-- Include historical UUIDs without foreign keys and targets no longer in Auth.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('app_installation','initialized_by'),('audit_events','actor_id'),
    ('checklist_entries','operator_id'),('checklist_reports','operator_id'),
    ('defeat_records','created_by'),('deleted_items','deleted_by'),('deleted_items','restored_by'),
    ('equipment_availability_entries','operator_id'),('equipment_availability_entries','supervisor_id'),
    ('fire_pump_tests','created_by'),('fire_pump_tests','operator_id'),
    ('generator_tests','created_by'),('generator_tests','operator_id'),
    ('incident_attachments','uploaded_by'),('incidents','reported_by'),('notifications','user_id'),
    ('reading_entries','operator_id'),('scada_samples','recorded_by'),('shift_reports','operator_id'),
    ('station_messages','author_id'),('station_notes','author_id'),
    ('supervisor_routines','created_by'),('supervisor_routines','supervisor_id')
  ) AS refs(t,c) LOOP
    EXECUTE format('INSERT INTO public.historical_user_identities(id) SELECT DISTINCT %I FROM public.%I WHERE %I IS NOT NULL ON CONFLICT (id) DO NOTHING',r.c,r.t,r.c);
  END LOOP;
END $$;
INSERT INTO public.historical_user_identities(id)
SELECT DISTINCT target FROM public.station_messages CROSS JOIN LATERAL unnest(target_user_ids) target
WHERE target IS NOT NULL ON CONFLICT (id) DO NOTHING;
-- Snapshot names fill unknown identities only; no operational row is rewritten.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('reading_entries','operator_id','operator_name'),
    ('equipment_availability_entries','operator_id','operator_name'),
    ('equipment_availability_entries','supervisor_id','supervisor_name'),
    ('shift_reports','operator_id','reported_by'),('incidents','reported_by','reporter_name'),
    ('station_notes','author_id','author_name'),('station_messages','author_id','author_name'),
    ('checklist_entries','operator_id','operator_name'),('checklist_reports','operator_id','operator_name'),
    ('fire_pump_tests','operator_id','operator_name'),('generator_tests','operator_id','operator_name'),
    ('supervisor_routines','supervisor_id','supervisor_name')
  ) AS refs(t,c,n) LOOP
    EXECUTE format('UPDATE public.historical_user_identities h SET full_name=s.name FROM (SELECT %I AS id,min(NULLIF(btrim(%I),'''')) AS name FROM public.%I GROUP BY %I HAVING count(DISTINCT NULLIF(btrim(%I),''''))=1) s WHERE h.id=s.id AND h.full_name IS NULL AND s.name IS NOT NULL',r.c,r.n,r.t,r.c,r.n);
  END LOOP;
END $$;
-- Capture UUIDs inside archived JSON, so restoring deleted operational rows stays possible.
INSERT INTO public.historical_user_identities(id)
SELECT DISTINCT trim(both '"' from v::text)::uuid
FROM public.deleted_items d CROSS JOIN LATERAL jsonb_path_query(d.row_data,'$.**') v
WHERE jsonb_typeof(v)='string' AND trim(both '"' from v::text) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION public.capture_historical_profile() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
 INSERT INTO public.historical_user_identities(id,full_name,employee_no)
 VALUES(NEW.id,NULLIF(btrim(NEW.full_name),''),NULLIF(btrim(NEW.employee_no),''))
 ON CONFLICT(id) DO UPDATE SET
 full_name=COALESCE(historical_user_identities.full_name,EXCLUDED.full_name),
 employee_no=COALESCE(historical_user_identities.employee_no,EXCLUDED.employee_no);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_historical_profile() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER capture_historical_profile AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.capture_historical_profile();

-- Retarget only these six constraints; original UUID columns and every row remain.
DO $$
DECLARE r record;
BEGIN
 FOR r IN SELECT * FROM (VALUES
 ('reading_entries','operator_id','reading_entries_operator_id_fkey'),
 ('equipment_availability_entries','operator_id','equipment_availability_entries_operator_id_fkey'),
 ('shift_reports','operator_id','shift_reports_operator_id_fkey'),
 ('incidents','reported_by','incidents_reported_by_fkey'),
 ('incident_attachments','uploaded_by','incident_attachments_uploaded_by_fkey'),
 ('station_notes','author_id','station_notes_author_id_fkey')) AS refs(t,c,k) LOOP
  EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',r.t,r.k);
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.historical_user_identities(id) ON DELETE RESTRICT',r.t,r.k,r.c);
 END LOOP;
END $$;

-- Serializes ALL app-controlled admin removal paths, not just the deletion API.
-- No writes or triggers on the managed auth schema.
CREATE FUNCTION public.guard_last_active_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE target uuid; reducing boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(820261019);
 IF TG_TABLE_NAME='profiles' THEN
  target:=OLD.id;
  IF TG_OP='DELETE' THEN reducing:=OLD.active;
 ELSE
  IF NEW.active AND NOT OLD.active AND EXISTS(SELECT 1 FROM public.user_deletion_operations WHERE target_id=target AND state='prepared')
  THEN RAISE EXCEPTION 'DELETION_IN_PROGRESS'; END IF;
  reducing:=OLD.active AND NOT NEW.active;
 END IF;
 ELSE
  target:=OLD.user_id;
  IF TG_OP='DELETE' THEN reducing:=OLD.role='admin';
  ELSE reducing:=OLD.role='admin' AND (NEW.role<>'admin' OR NEW.user_id<>OLD.user_id); END IF;
 END IF;
 IF reducing AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=target AND role='admin')
 AND NOT EXISTS(
  SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.id=r.user_id
  JOIN auth.users u ON u.id=p.id
  WHERE r.role='admin' AND p.active AND p.id<>target
    AND (u.banned_until IS NULL OR u.banned_until<=now())
    AND NOT EXISTS(SELECT 1 FROM public.user_deletion_operations o WHERE o.target_id=p.id AND o.state='prepared')
 ) THEN RAISE EXCEPTION 'LAST_ACTIVE_ADMIN'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_last_active_admin() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_profile_last_admin BEFORE DELETE OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_last_active_admin();
CREATE TRIGGER guard_role_last_admin BEFORE DELETE OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_last_active_admin();

CREATE FUNCTION public.prepare_user_deletion(_actor uuid,_target uuid,_action text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE job public.user_deletion_operations; r record; protected integer:=0;
BEGIN
 PERFORM pg_advisory_xact_lock(820261019);
 IF _actor=_target THEN RAISE EXCEPTION 'SELF_DELETE'; END IF;
 IF _action NOT IN ('delete','deactivate') THEN RAISE EXCEPTION 'INVALID_INPUT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id
 WHERE p.id=_actor AND p.active AND (u.banned_until IS NULL OR u.banned_until<=now())
 AND public.has_role(_actor,'admin')) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 -- Fail closed if any one of the six references is still linked to Auth.
 FOR r IN SELECT * FROM (VALUES ('reading_entries','operator_id'),
 ('equipment_availability_entries','operator_id'),('shift_reports','operator_id'),
 ('incidents','reported_by'),('incident_attachments','uploaded_by'),('station_notes','author_id')) refs(t,c) LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=ANY(k.conkey)
   WHERE k.contype='f' AND k.conrelid=to_regclass('public.'||r.t) AND a.attname=r.c
   AND k.confrelid='public.historical_user_identities'::regclass AND k.confdeltype='r' AND k.convalidated)
   OR EXISTS(SELECT 1 FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=ANY(k.conkey)
    WHERE k.contype='f' AND k.conrelid=to_regclass('public.'||r.t) AND a.attname=r.c AND k.confrelid='auth.users'::regclass)
  THEN RAISE EXCEPTION 'RELATIONS_NOT_READY'; END IF;
  protected:=protected+1;
 END LOOP;
 SELECT * INTO job FROM public.user_deletion_operations WHERE target_id=_target FOR UPDATE;
 IF FOUND THEN
  IF job.action=_action THEN RETURN jsonb_build_object('state',job.state,'protected_relations',protected); END IF;
  IF job.state<>'completed' OR job.action<>'deactivate' OR _action<>'delete' THEN RAISE EXCEPTION 'ACTION_CONFLICT'; END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=_target) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.historical_user_identities WHERE id=_target) THEN RAISE EXCEPTION 'IDENTITY_NOT_READY'; END IF;
 -- Reserve by disabling the profile in this transaction before any external Auth call.
 -- The shared trigger checks the remaining effective admin count under the same lock.
 UPDATE public.profiles SET active=false WHERE id=_target;
 IF NOT FOUND THEN RAISE EXCEPTION 'IDENTITY_NOT_READY'; END IF;
 INSERT INTO public.user_deletion_operations(target_id,requested_by,action) VALUES(_target,_actor,_action)
 ON CONFLICT(target_id) DO UPDATE SET requested_by=EXCLUDED.requested_by,action=EXCLUDED.action,state='prepared',requested_at=now(),completed_at=NULL;
 INSERT INTO public.audit_events(actor_id,event_type,entity_table,entity_id,details)
 VALUES(_actor,'user_deletion_prepared','historical_user_identities',_target,jsonb_build_object('action',_action));
 RETURN jsonb_build_object('state','prepared','protected_relations',protected);
END $$;
REVOKE ALL ON FUNCTION public.prepare_user_deletion(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_user_deletion(uuid,uuid,text) TO service_role;

CREATE FUNCTION public.complete_user_deletion(_actor uuid,_target uuid,_action text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE job public.user_deletion_operations;
BEGIN
 PERFORM pg_advisory_xact_lock(820261019);
 IF _actor=_target OR NOT public.has_role(_actor,'admin') OR NOT EXISTS(
 SELECT 1 FROM public.profiles p JOIN auth.users u ON u.id=p.id WHERE p.id=_actor AND p.active
 AND (u.banned_until IS NULL OR u.banned_until<=now())) THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 SELECT * INTO job FROM public.user_deletion_operations WHERE target_id=_target FOR UPDATE;
 IF NOT FOUND OR job.action<>_action THEN RAISE EXCEPTION 'ACTION_CONFLICT'; END IF;
 IF _action='delete' AND EXISTS(SELECT 1 FROM auth.users WHERE id=_target) THEN RAISE EXCEPTION 'DELETE_NOT_CONFIRMED'; END IF;
 IF _action='deactivate' AND NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.id=u.id
 WHERE u.id=_target AND NOT p.active AND u.banned_until>now()) THEN RAISE EXCEPTION 'DEACTIVATION_NOT_CONFIRMED'; END IF;
 IF job.state<>'completed' THEN
  UPDATE public.user_deletion_operations SET state='completed',completed_at=now() WHERE target_id=_target;
  INSERT INTO public.audit_events(actor_id,event_type,entity_table,entity_id,details)
  VALUES(_actor,'user_deletion_completed','historical_user_identities',_target,jsonb_build_object('action',_action));
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.complete_user_deletion(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_user_deletion(uuid,uuid,text) TO service_role;

-- Authenticated edit path must not assume the protection has been installed.
CREATE FUNCTION public.admin_removal_guards_ready() RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT public.has_role(auth.uid(),'admin') AND
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.profiles'::regclass AND tgname='guard_profile_last_admin' AND tgenabled='O') AND
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.user_roles'::regclass AND tgname='guard_role_last_admin' AND tgenabled='O')
$$;
REVOKE ALL ON FUNCTION public.admin_removal_guards_ready() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_removal_guards_ready() TO authenticated,service_role;
