ALTER POLICY "availability_select_scoped" ON public.equipment_availability_entries TO authenticated;
ALTER POLICY "View availability values in scope" ON public.equipment_availability_values TO authenticated;
ALTER POLICY "scada_params_admin_write" ON public.scada_parameters TO authenticated;
ALTER POLICY "View station equipment in scope" ON public.station_equipment TO authenticated;