DROP POLICY IF EXISTS scada_params_read ON public.scada_parameters;
CREATE POLICY scada_params_read ON public.scada_parameters
FOR SELECT TO authenticated
USING (public.is_unrestricted_viewer(auth.uid()) OR public.can_access_station(auth.uid(), station_id));

DROP POLICY IF EXISTS scada_samples_read ON public.scada_samples;
CREATE POLICY scada_samples_read ON public.scada_samples
FOR SELECT TO authenticated
USING (public.is_unrestricted_viewer(auth.uid()) OR public.can_access_station(auth.uid(), station_id));