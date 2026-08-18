
-- helper: unrestricted viewers (admin + management)
CREATE OR REPLACE FUNCTION public.is_unrestricted_viewer(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'management'::app_role)
$$;

CREATE OR REPLACE FUNCTION public.user_station(_user_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT station_id FROM public.profiles WHERE id = _user_id
$$;

-- station_equipment
DROP POLICY IF EXISTS "Authenticated can view station equipment" ON public.station_equipment;
CREATE POLICY "View station equipment in scope" ON public.station_equipment
FOR SELECT TO authenticated
USING (public.is_unrestricted_viewer(auth.uid()) OR station_id = public.user_station(auth.uid()));

-- reading templates
DROP POLICY IF EXISTS "templates_read" ON public.reading_templates;
CREATE POLICY "View templates in scope" ON public.reading_templates
FOR SELECT TO authenticated
USING (public.is_unrestricted_viewer(auth.uid()) OR station_id = public.user_station(auth.uid()));

-- availability values
DROP POLICY IF EXISTS "Authenticated view availability values" ON public.equipment_availability_values;
DROP POLICY IF EXISTS "Management can view MDR values" ON public.equipment_availability_values;
CREATE POLICY "View availability values in scope" ON public.equipment_availability_values
FOR SELECT TO authenticated
USING (
  public.is_unrestricted_viewer(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.station_equipment se
    WHERE se.id = equipment_availability_values.equipment_id
      AND se.station_id = public.user_station(auth.uid())
  )
);
