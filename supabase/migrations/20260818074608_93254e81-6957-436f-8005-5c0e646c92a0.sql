
-- 1. Station-scope supervisors on operational tables
DROP POLICY IF EXISTS "Authenticated can update fire pump tests" ON public.fire_pump_tests;
CREATE POLICY "Authenticated can update fire pump tests" ON public.fire_pump_tests FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND station_id = get_user_station(auth.uid())))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND station_id = get_user_station(auth.uid())));

DROP POLICY IF EXISTS gen_tests_insert ON public.generator_tests;
CREATE POLICY gen_tests_insert ON public.generator_tests FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND station_id = get_user_station(auth.uid())));

DROP POLICY IF EXISTS gen_tests_update ON public.generator_tests;
CREATE POLICY gen_tests_update ON public.generator_tests FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND station_id = get_user_station(auth.uid())))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND station_id = get_user_station(auth.uid())));

DROP POLICY IF EXISTS gen_tests_delete ON public.generator_tests;
CREATE POLICY gen_tests_delete ON public.generator_tests FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR (has_role(auth.uid(),'supervisor'::app_role) AND station_id = get_user_station(auth.uid())));

DROP POLICY IF EXISTS incidents_insert ON public.incidents;
CREATE POLICY incidents_insert ON public.incidents FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND station_id = get_user_station(auth.uid())));

DROP POLICY IF EXISTS incidents_update ON public.incidents;
CREATE POLICY incidents_update ON public.incidents FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR (has_role(auth.uid(),'supervisor'::app_role) AND station_id = get_user_station(auth.uid())) OR (has_role(auth.uid(),'operator'::app_role) AND reported_by = auth.uid()))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR (has_role(auth.uid(),'supervisor'::app_role) AND station_id = get_user_station(auth.uid())) OR (has_role(auth.uid(),'operator'::app_role) AND reported_by = auth.uid()));

DROP POLICY IF EXISTS entries_insert ON public.reading_entries;
CREATE POLICY entries_insert ON public.reading_entries FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND station_id = get_user_station(auth.uid())));

DROP POLICY IF EXISTS entries_update ON public.reading_entries;
CREATE POLICY entries_update ON public.reading_entries FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND station_id = get_user_station(auth.uid())))
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND station_id = get_user_station(auth.uid())));

DROP POLICY IF EXISTS values_write ON public.reading_values;
CREATE POLICY values_write ON public.reading_values FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.reading_entries e WHERE e.id = reading_values.entry_id AND (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND e.station_id = get_user_station(auth.uid())))))
WITH CHECK (EXISTS (SELECT 1 FROM public.reading_entries e WHERE e.id = reading_values.entry_id AND (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND e.station_id = get_user_station(auth.uid())))));

DROP POLICY IF EXISTS att_write ON public.incident_attachments;
CREATE POLICY att_write ON public.incident_attachments FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_attachments.incident_id AND (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND i.station_id = get_user_station(auth.uid())))))
WITH CHECK (EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = incident_attachments.incident_id AND (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND i.station_id = get_user_station(auth.uid())))));

-- 2. Explicit ownership-checked UPDATE policy on incident attachment files
DROP POLICY IF EXISTS incident_att_update ON storage.objects;
CREATE POLICY incident_att_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'incident-attachments' AND EXISTS (SELECT 1 FROM public.incidents i WHERE i.id::text = (storage.foldername(objects.name))[1] AND (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND i.station_id = get_user_station(auth.uid())))))
WITH CHECK (bucket_id = 'incident-attachments' AND EXISTS (SELECT 1 FROM public.incidents i WHERE i.id::text = (storage.foldername(objects.name))[1] AND (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND i.station_id = get_user_station(auth.uid())))));

DROP POLICY IF EXISTS incident_att_delete ON storage.objects;
CREATE POLICY incident_att_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'incident-attachments' AND EXISTS (SELECT 1 FROM public.incidents i WHERE i.id::text = (storage.foldername(objects.name))[1] AND (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND i.station_id = get_user_station(auth.uid())))));

DROP POLICY IF EXISTS incident_att_read ON storage.objects;
CREATE POLICY incident_att_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'incident-attachments' AND EXISTS (SELECT 1 FROM public.incidents i WHERE i.id::text = (storage.foldername(objects.name))[1] AND (is_unrestricted_viewer(auth.uid()) OR has_role(auth.uid(),'viewer'::app_role) OR i.station_id = get_user_station(auth.uid()))));

DROP POLICY IF EXISTS incident_att_insert ON storage.objects;
CREATE POLICY incident_att_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'incident-attachments' AND EXISTS (SELECT 1 FROM public.incidents i WHERE i.id::text = (storage.foldername(objects.name))[1] AND (has_role(auth.uid(),'admin'::app_role) OR ((has_role(auth.uid(),'supervisor'::app_role) OR has_role(auth.uid(),'operator'::app_role)) AND i.station_id = get_user_station(auth.uid())))));

-- 3. Lock down SECURITY DEFINER helper functions
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.user_station(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_user_station(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_unrestricted_viewer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.user_station(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_user_station(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_unrestricted_viewer(uuid) TO authenticated, service_role;
