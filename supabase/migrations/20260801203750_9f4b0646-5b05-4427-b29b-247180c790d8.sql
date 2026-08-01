
DROP POLICY IF EXISTS "Authenticated can update fire pump tests" ON public.fire_pump_tests;
CREATE POLICY "Authenticated can update fire pump tests" ON public.fire_pump_tests
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'supervisor') OR
  (public.has_role(auth.uid(), 'operator') AND station_id = public.get_user_station(auth.uid()))
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'supervisor') OR
  (public.has_role(auth.uid(), 'operator') AND station_id = public.get_user_station(auth.uid()))
);
