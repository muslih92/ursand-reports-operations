-- 1. Protect station/active fields on profiles from self-edit
CREATE OR REPLACE FUNCTION public.protect_profile_auth_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- service-role / server jobs have no auth.uid()
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;
  IF NEW.station_id IS DISTINCT FROM OLD.station_id
     OR NEW.active IS DISTINCT FROM OLD.active
     OR NEW.employee_no IS DISTINCT FROM OLD.employee_no THEN
    RAISE EXCEPTION 'Only an administrator can change station, status or employee number'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.protect_profile_auth_fields() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_profiles_protect_auth_fields ON public.profiles;
CREATE TRIGGER trg_profiles_protect_auth_fields BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_auth_fields();

-- 2. Stations: operators only see assigned stations
DROP POLICY IF EXISTS stations_read ON public.stations;
CREATE POLICY stations_read ON public.stations FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
  OR public.has_role(auth.uid(), 'viewer'::app_role)
  OR public.has_role(auth.uid(), 'management'::app_role)
  OR public.can_access_station(auth.uid(), id)
);

-- 3. Database-level shift lock (same rule as the readings page:
--    day shift 06:00-18:00, night 18:00-06:00, Riyadh time; operators only)
CREATE OR REPLACE FUNCTION public.reading_slot_locked(_entry_date date, _slot text)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE mins int; ends timestamp;
BEGIN
  IF _slot IS NULL OR _slot !~ '^[0-9]{1,2}:[0-9]{2}' THEN RETURN false; END IF;
  mins := split_part(_slot, ':', 1)::int * 60 + substr(split_part(_slot, ':', 2), 1, 2)::int;
  IF mins < 360 THEN ends := _entry_date + time '06:00';
  ELSIF mins < 1080 THEN ends := _entry_date + time '18:00';
  ELSE ends := (_entry_date + 1) + time '06:00';
  END IF;
  RETURN (now() AT TIME ZONE 'Asia/Riyadh') >= ends;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_reading_shift_lock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; d date;
BEGIN
  IF auth.uid() IS NULL
     OR public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'supervisor'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  r := COALESCE(NEW, OLD);
  SELECT entry_date INTO d FROM public.reading_entries WHERE id = r.entry_id;
  IF d IS NOT NULL AND public.reading_slot_locked(d, r.time_slot) THEN
    RAISE EXCEPTION 'This reading is locked because its shift has ended' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.time_slot IS DISTINCT FROM NEW.time_slot
     AND public.reading_slot_locked(d, OLD.time_slot) THEN
    RAISE EXCEPTION 'This reading is locked because its shift has ended' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE EXECUTE ON FUNCTION public.enforce_reading_shift_lock() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_reading_values_shift_lock ON public.reading_values;
CREATE TRIGGER trg_reading_values_shift_lock BEFORE INSERT OR UPDATE OR DELETE ON public.reading_values
  FOR EACH ROW EXECUTE FUNCTION public.enforce_reading_shift_lock();

-- 4. Supervisors delete shift reports only for assigned stations
DROP POLICY IF EXISTS "Admins delete shift reports" ON public.shift_reports;
CREATE POLICY "Admins delete shift reports" ON public.shift_reports FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND public.can_access_station(auth.uid(), station_id))
);