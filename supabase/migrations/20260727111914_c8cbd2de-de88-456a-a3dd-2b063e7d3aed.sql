
CREATE POLICY "Management can view MDR entries"
  ON public.equipment_availability_entries FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'management'));

CREATE POLICY "Management can view MDR values"
  ON public.equipment_availability_values FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'management'));

CREATE POLICY "Management can view incidents"
  ON public.incidents FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'management'));

CREATE POLICY "Management can view readings"
  ON public.reading_entries FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'management'));

CREATE POLICY "Management can view reading values"
  ON public.reading_values FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'management'));

CREATE POLICY "Management can view shift reports"
  ON public.shift_reports FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'management'));
