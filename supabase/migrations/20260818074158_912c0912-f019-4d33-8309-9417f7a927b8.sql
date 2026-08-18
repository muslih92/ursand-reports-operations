
DROP POLICY IF EXISTS "Operators & up manage availability values" ON public.equipment_availability_values;
CREATE POLICY "Manage availability values in scope"
ON public.equipment_availability_values FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR ((has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
      AND EXISTS (SELECT 1 FROM public.station_equipment se
                  WHERE se.id = equipment_availability_values.equipment_id
                    AND se.station_id = user_station(auth.uid())))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR ((has_role(auth.uid(), 'supervisor'::app_role) OR has_role(auth.uid(), 'operator'::app_role))
      AND EXISTS (SELECT 1 FROM public.station_equipment se
                  WHERE se.id = equipment_availability_values.equipment_id
                    AND se.station_id = user_station(auth.uid())))
);

DROP POLICY IF EXISTS "Admins & supervisors manage station equipment" ON public.station_equipment;
CREATE POLICY "Manage station equipment in scope"
ON public.station_equipment FOR ALL TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role) AND station_id = user_station(auth.uid()))
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR (has_role(auth.uid(), 'supervisor'::app_role) AND station_id = user_station(auth.uid()))
);
