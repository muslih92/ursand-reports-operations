DROP POLICY IF EXISTS "authenticated can read settings" ON public.app_settings;
CREATE POLICY "read shared or admin settings" ON public.app_settings
FOR SELECT TO authenticated
USING (key = 'powerbi_report' OR public.has_role(auth.uid(), 'admin'::app_role));