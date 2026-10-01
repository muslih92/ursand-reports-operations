DROP POLICY IF EXISTS station_notes_update_scoped ON public.station_notes;

CREATE POLICY station_notes_update_scoped
ON public.station_notes
FOR UPDATE
TO authenticated
USING (
  public.can_access_station(auth.uid(), station_id)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'operator'::public.app_role)
      AND category::text = 'maintenance'
    )
  )
)
WITH CHECK (
  public.can_access_station(auth.uid(), station_id)
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'operator'::public.app_role)
      AND category::text = 'maintenance'
    )
  )
);