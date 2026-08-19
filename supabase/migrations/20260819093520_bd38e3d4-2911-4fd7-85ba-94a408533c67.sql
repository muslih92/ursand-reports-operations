DROP POLICY IF EXISTS "availability_select_scoped" ON public.equipment_availability_entries;
CREATE POLICY "availability_select_scoped" ON public.equipment_availability_entries
FOR SELECT USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'management'::app_role)
  OR has_role(auth.uid(), 'viewer'::app_role)
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR can_access_station(auth.uid(), station_id)
);

DROP POLICY IF EXISTS "View availability values in scope" ON public.equipment_availability_values;
CREATE POLICY "View availability values in scope" ON public.equipment_availability_values
FOR SELECT USING (
  is_unrestricted_viewer(auth.uid())
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.station_equipment se
    WHERE se.id = equipment_availability_values.equipment_id
      AND can_access_station(auth.uid(), se.station_id)
  )
);

DROP POLICY IF EXISTS "View station equipment in scope" ON public.station_equipment;
CREATE POLICY "View station equipment in scope" ON public.station_equipment
FOR SELECT USING (
  is_unrestricted_viewer(auth.uid())
  OR has_role(auth.uid(), 'supervisor'::app_role)
  OR can_access_station(auth.uid(), station_id)
);