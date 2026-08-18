-- Station scoping for equipment availability (MDR), fire pump and generator tests
DROP POLICY IF EXISTS "Authenticated view availability entries" ON public.equipment_availability_entries;
DROP POLICY IF EXISTS "Operators & up manage availability entries" ON public.equipment_availability_entries;

CREATE POLICY "availability_select_scoped" ON public.equipment_availability_entries
FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'management')
  OR has_role(auth.uid(), 'viewer') OR station_id = get_user_station(auth.uid())
);

CREATE POLICY "availability_write_scoped" ON public.equipment_availability_entries
FOR ALL TO authenticated USING (
  has_role(auth.uid(), 'admin')
  OR ((has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'operator')) AND station_id = get_user_station(auth.uid()))
) WITH CHECK (
  has_role(auth.uid(), 'admin')
  OR ((has_role(auth.uid(), 'supervisor') OR has_role(auth.uid(), 'operator')) AND station_id = get_user_station(auth.uid()))
);

DROP POLICY IF EXISTS "Authenticated can view fire pump tests" ON public.fire_pump_tests;
CREATE POLICY "fire_pump_select_scoped" ON public.fire_pump_tests
FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'management')
  OR has_role(auth.uid(), 'viewer') OR station_id = get_user_station(auth.uid())
);

DROP POLICY IF EXISTS "Authenticated can create fire pump tests" ON public.fire_pump_tests;
CREATE POLICY "fire_pump_insert_scoped" ON public.fire_pump_tests
FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin') OR station_id = get_user_station(auth.uid())
);

DROP POLICY IF EXISTS "gen_tests_select" ON public.generator_tests;
CREATE POLICY "gen_tests_select_scoped" ON public.generator_tests
FOR SELECT TO authenticated USING (
  has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'management')
  OR has_role(auth.uid(), 'viewer') OR station_id = get_user_station(auth.uid())
);
