DROP POLICY IF EXISTS "Staff can add defeat records" ON public.defeat_records;
DROP POLICY IF EXISTS "Staff can edit defeat records" ON public.defeat_records;

CREATE POLICY "Supervisors can add defeat records"
ON public.defeat_records FOR INSERT TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'supervisor') AND public.can_access_station(auth.uid(), station_id))
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Supervisors can edit defeat records"
ON public.defeat_records FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(), 'supervisor') AND public.can_access_station(auth.uid(), station_id))
  OR public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  (public.has_role(auth.uid(), 'supervisor') AND public.can_access_station(auth.uid(), station_id))
  OR public.has_role(auth.uid(), 'admin')
);