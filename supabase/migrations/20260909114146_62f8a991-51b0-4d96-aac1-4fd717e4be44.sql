DROP POLICY IF EXISTS checklist_reports_update_admin ON public.checklist_reports;

CREATE POLICY checklist_reports_update_scoped
ON public.checklist_reports FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR can_access_station(auth.uid(), station_id)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR can_access_station(auth.uid(), station_id)
);