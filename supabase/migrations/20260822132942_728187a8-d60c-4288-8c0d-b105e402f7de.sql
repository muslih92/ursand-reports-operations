
DROP POLICY IF EXISTS "View availability values in scope" ON public.equipment_availability_values;
CREATE POLICY "View availability values in scope"
ON public.equipment_availability_values FOR SELECT
USING (
  public.is_unrestricted_viewer(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.station_equipment se
    WHERE se.id = equipment_availability_values.equipment_id
      AND public.can_access_station(auth.uid(), se.station_id)
  )
);

DROP POLICY IF EXISTS "View station equipment in scope" ON public.station_equipment;
CREATE POLICY "View station equipment in scope"
ON public.station_equipment FOR SELECT
USING (
  public.is_unrestricted_viewer(auth.uid())
  OR public.can_access_station(auth.uid(), station_id)
);

DROP POLICY IF EXISTS "scada_params_admin_write" ON public.scada_parameters;
CREATE POLICY "scada_params_admin_write"
ON public.scada_parameters FOR ALL
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND public.can_access_station(auth.uid(), station_id))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND public.can_access_station(auth.uid(), station_id))
);
