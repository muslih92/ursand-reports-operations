
-- 1) equipment_availability_values: split blanket ALL policy; deletes limited to admins/supervisors in scope
DROP POLICY IF EXISTS "Manage availability values in scope" ON public.equipment_availability_values;

CREATE POLICY "Insert availability values in scope"
ON public.equipment_availability_values FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR ((has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
      AND EXISTS (SELECT 1 FROM public.station_equipment se
                  WHERE se.id = equipment_availability_values.equipment_id
                    AND can_access_station(auth.uid(), se.station_id)))
);

CREATE POLICY "Update availability values in scope"
ON public.equipment_availability_values FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR ((has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
      AND EXISTS (SELECT 1 FROM public.station_equipment se
                  WHERE se.id = equipment_availability_values.equipment_id
                    AND can_access_station(auth.uid(), se.station_id)))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR ((has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
      AND EXISTS (SELECT 1 FROM public.station_equipment se
                  WHERE se.id = equipment_availability_values.equipment_id
                    AND can_access_station(auth.uid(), se.station_id)))
);

CREATE POLICY "Delete availability values in scope"
ON public.equipment_availability_values FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role)
      AND EXISTS (SELECT 1 FROM public.station_equipment se
                  WHERE se.id = equipment_availability_values.equipment_id
                    AND can_access_station(auth.uid(), se.station_id)))
);

-- 2) ops_daily: role-gated analytics reads instead of every authenticated user
DROP POLICY IF EXISTS "ops_daily_read_authenticated" ON public.ops_daily;

CREATE POLICY "ops_daily_read_roles"
ON public.ops_daily FOR SELECT TO authenticated
USING (
  is_unrestricted_viewer(auth.uid())
  OR has_role(auth.uid(), 'viewer'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
);

-- 3) profiles: station-scope employee PII for supervisors/viewers
DROP POLICY IF EXISTS "profiles_read" ON public.profiles;

CREATE POLICY "profiles_read"
ON public.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR is_unrestricted_viewer(auth.uid())
  OR ((has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'viewer'::app_role))
      AND (
        can_access_station(auth.uid(), profiles.station_id)
        OR EXISTS (SELECT 1 FROM public.profile_stations ps
                   WHERE ps.user_id = profiles.id
                     AND can_access_station(auth.uid(), ps.station_id))
      ))
);
