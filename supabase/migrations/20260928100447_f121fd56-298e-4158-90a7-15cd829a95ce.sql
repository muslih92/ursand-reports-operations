DROP POLICY IF EXISTS values_delete ON public.reading_values;
CREATE POLICY values_delete ON public.reading_values FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));