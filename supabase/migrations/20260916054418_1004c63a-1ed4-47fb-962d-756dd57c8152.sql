DROP POLICY IF EXISTS checklist_reports_update_scoped ON public.checklist_reports;
CREATE POLICY checklist_reports_update_scoped ON public.checklist_reports
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.can_access_station(auth.uid(), station_id) AND (
        operator_id = auth.uid()
        OR public.has_role(auth.uid(), 'supervisor'::app_role)
      ))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.can_access_station(auth.uid(), station_id) AND (
        operator_id = auth.uid()
        OR public.has_role(auth.uid(), 'supervisor'::app_role)
      ))
);

DROP POLICY IF EXISTS checklist_reports_delete_admin ON public.checklist_reports;
CREATE POLICY checklist_reports_delete_scoped ON public.checklist_reports
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND public.can_access_station(auth.uid(), station_id))
);