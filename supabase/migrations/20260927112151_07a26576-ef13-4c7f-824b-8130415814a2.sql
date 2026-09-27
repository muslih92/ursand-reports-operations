DROP POLICY IF EXISTS values_delete ON public.reading_values;
CREATE POLICY values_delete ON public.reading_values FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.reading_entries e WHERE e.id = reading_values.entry_id AND (has_role(auth.uid(),'admin') OR ((has_role(auth.uid(),'supervisor') OR has_role(auth.uid(),'operator')) AND can_access_station(auth.uid(), e.station_id)))));