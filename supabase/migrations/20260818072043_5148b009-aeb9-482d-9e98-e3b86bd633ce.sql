DROP POLICY IF EXISTS "View templates in scope" ON public.reading_templates;
CREATE POLICY "View templates in scope" ON public.reading_templates
FOR SELECT TO authenticated
USING (station_id IS NULL OR public.is_unrestricted_viewer(auth.uid()) OR station_id = public.user_station(auth.uid()));