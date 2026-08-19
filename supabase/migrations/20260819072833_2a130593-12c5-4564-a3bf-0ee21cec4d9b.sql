CREATE TABLE IF NOT EXISTS public.profile_stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  station_id uuid NOT NULL REFERENCES public.stations(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, station_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profile_stations TO authenticated;
GRANT ALL ON public.profile_stations TO service_role;
ALTER TABLE public.profile_stations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profile_stations_read_own ON public.profile_stations;
CREATE POLICY profile_stations_read_own ON public.profile_stations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS profile_stations_admin_manage ON public.profile_stations;
CREATE POLICY profile_stations_admin_manage ON public.profile_stations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.can_access_station(_user_id uuid, _station_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _station_id IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.station_id = _station_id)
    OR EXISTS (SELECT 1 FROM public.profile_stations ps WHERE ps.user_id = _user_id AND ps.station_id = _station_id)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_station(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_station(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_station(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_station(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS availability_select_scoped ON public.equipment_availability_entries;
CREATE POLICY availability_select_scoped ON public.equipment_availability_entries FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'management') OR has_role(auth.uid(),'viewer') OR can_access_station(auth.uid(), station_id));

DROP POLICY IF EXISTS availability_write_scoped ON public.equipment_availability_entries;
CREATE POLICY availability_write_scoped ON public.equipment_availability_entries FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), station_id)))
WITH CHECK (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), station_id)));

DROP POLICY IF EXISTS "Manage availability values in scope" ON public.equipment_availability_values;
CREATE POLICY "Manage availability values in scope" ON public.equipment_availability_values FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND EXISTS (SELECT 1 FROM station_equipment se WHERE se.id = equipment_availability_values.equipment_id AND can_access_station(auth.uid(), se.station_id))))
WITH CHECK (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND EXISTS (SELECT 1 FROM station_equipment se WHERE se.id = equipment_availability_values.equipment_id AND can_access_station(auth.uid(), se.station_id))));

DROP POLICY IF EXISTS "View availability values in scope" ON public.equipment_availability_values;
CREATE POLICY "View availability values in scope" ON public.equipment_availability_values FOR SELECT TO authenticated
USING (is_unrestricted_viewer(auth.uid()) OR EXISTS (SELECT 1 FROM station_equipment se WHERE se.id = equipment_availability_values.equipment_id AND can_access_station(auth.uid(), se.station_id)));

DROP POLICY IF EXISTS "Authenticated can update fire pump tests" ON public.fire_pump_tests;
CREATE POLICY "Authenticated can update fire pump tests" ON public.fire_pump_tests FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), station_id)))
WITH CHECK (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), station_id)));

DROP POLICY IF EXISTS fire_pump_insert_scoped ON public.fire_pump_tests;
CREATE POLICY fire_pump_insert_scoped ON public.fire_pump_tests FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') OR can_access_station(auth.uid(), station_id));

DROP POLICY IF EXISTS fire_pump_select_scoped ON public.fire_pump_tests;
CREATE POLICY fire_pump_select_scoped ON public.fire_pump_tests FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'management') OR has_role(auth.uid(),'viewer') OR can_access_station(auth.uid(), station_id));

DROP POLICY IF EXISTS gen_tests_delete ON public.generator_tests;
CREATE POLICY gen_tests_delete ON public.generator_tests FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'supervisor') AND can_access_station(auth.uid(), station_id)));

DROP POLICY IF EXISTS gen_tests_insert ON public.generator_tests;
CREATE POLICY gen_tests_insert ON public.generator_tests FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), station_id)));

DROP POLICY IF EXISTS gen_tests_select_scoped ON public.generator_tests;
CREATE POLICY gen_tests_select_scoped ON public.generator_tests FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'management') OR has_role(auth.uid(),'viewer') OR can_access_station(auth.uid(), station_id));

DROP POLICY IF EXISTS gen_tests_update ON public.generator_tests;
CREATE POLICY gen_tests_update ON public.generator_tests FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), station_id)))
WITH CHECK (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), station_id)));

DROP POLICY IF EXISTS att_delete ON public.incident_attachments;
CREATE POLICY att_delete ON public.incident_attachments FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM incidents i WHERE i.id = incident_attachments.incident_id AND (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), i.station_id)))));

DROP POLICY IF EXISTS att_insert ON public.incident_attachments;
CREATE POLICY att_insert ON public.incident_attachments FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM incidents i WHERE i.id = incident_attachments.incident_id AND (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), i.station_id)))));

DROP POLICY IF EXISTS att_read ON public.incident_attachments;
CREATE POLICY att_read ON public.incident_attachments FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM incidents i WHERE i.id = incident_attachments.incident_id AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'viewer') OR can_access_station(auth.uid(), i.station_id))));

DROP POLICY IF EXISTS att_update ON public.incident_attachments;
CREATE POLICY att_update ON public.incident_attachments FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM incidents i WHERE i.id = incident_attachments.incident_id AND (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), i.station_id)))))
WITH CHECK (EXISTS (SELECT 1 FROM incidents i WHERE i.id = incident_attachments.incident_id AND (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), i.station_id)))));

DROP POLICY IF EXISTS incidents_insert ON public.incidents;
CREATE POLICY incidents_insert ON public.incidents FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), station_id)));

DROP POLICY IF EXISTS incidents_read ON public.incidents;
CREATE POLICY incidents_read ON public.incidents FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'viewer') OR can_access_station(auth.uid(), station_id));

DROP POLICY IF EXISTS incidents_update ON public.incidents;
CREATE POLICY incidents_update ON public.incidents FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'supervisor') AND can_access_station(auth.uid(), station_id)) OR (has_role(auth.uid(),'operator') AND reported_by = auth.uid()))
WITH CHECK (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'supervisor') AND can_access_station(auth.uid(), station_id)) OR (has_role(auth.uid(),'operator') AND reported_by = auth.uid()));

DROP POLICY IF EXISTS entries_insert ON public.reading_entries;
CREATE POLICY entries_insert ON public.reading_entries FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), station_id)));

DROP POLICY IF EXISTS entries_read ON public.reading_entries;
CREATE POLICY entries_read ON public.reading_entries FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'viewer') OR can_access_station(auth.uid(), station_id));

DROP POLICY IF EXISTS entries_update ON public.reading_entries;
CREATE POLICY entries_update ON public.reading_entries FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), station_id)))
WITH CHECK (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), station_id)));

DROP POLICY IF EXISTS "View templates in scope" ON public.reading_templates;
CREATE POLICY "View templates in scope" ON public.reading_templates FOR SELECT TO authenticated
USING (station_id IS NULL OR is_unrestricted_viewer(auth.uid()) OR can_access_station(auth.uid(), station_id));

DROP POLICY IF EXISTS values_read ON public.reading_values;
CREATE POLICY values_read ON public.reading_values FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM reading_entries e WHERE e.id = reading_values.entry_id AND (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'viewer') OR can_access_station(auth.uid(), e.station_id))));

DROP POLICY IF EXISTS values_write ON public.reading_values;
CREATE POLICY values_write ON public.reading_values FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM reading_entries e WHERE e.id = reading_values.entry_id AND (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), e.station_id)))))
WITH CHECK (EXISTS (SELECT 1 FROM reading_entries e WHERE e.id = reading_values.entry_id AND (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), e.station_id)))));

DROP POLICY IF EXISTS "Operators insert for own station" ON public.shift_reports;
CREATE POLICY "Operators insert for own station" ON public.shift_reports FOR INSERT TO authenticated
WITH CHECK (can_access_station(auth.uid(), station_id) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'supervisor'));

DROP POLICY IF EXISTS "Operators read own station shift reports" ON public.shift_reports;
CREATE POLICY "Operators read own station shift reports" ON public.shift_reports FOR SELECT TO authenticated
USING (can_access_station(auth.uid(), station_id));

DROP POLICY IF EXISTS "Manage station equipment in scope" ON public.station_equipment;
CREATE POLICY "Manage station equipment in scope" ON public.station_equipment FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'supervisor') AND can_access_station(auth.uid(), station_id)))
WITH CHECK (has_role(auth.uid(),'admin') OR (has_role(auth.uid(),'supervisor') AND can_access_station(auth.uid(), station_id)));

DROP POLICY IF EXISTS "View station equipment in scope" ON public.station_equipment;
CREATE POLICY "View station equipment in scope" ON public.station_equipment FOR SELECT TO authenticated
USING (is_unrestricted_viewer(auth.uid()) OR can_access_station(auth.uid(), station_id));