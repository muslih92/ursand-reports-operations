-- Generator tests: explicit delete scoping (admin, or supervisor within own station only)
DROP POLICY IF EXISTS gen_tests_delete ON public.generator_tests;
CREATE POLICY gen_tests_delete ON public.generator_tests
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (
      public.has_role(auth.uid(), 'supervisor'::app_role)
      AND station_id = public.get_user_station(auth.uid())
    )
  );

-- Incident attachments: replace catch-all ALL policy with explicit per-command policies
DROP POLICY IF EXISTS att_write ON public.incident_attachments;

CREATE POLICY att_insert ON public.incident_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.incidents i
      WHERE i.id = incident_attachments.incident_id
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR ((public.has_role(auth.uid(), 'supervisor'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role))
              AND i.station_id = public.get_user_station(auth.uid()))
        )
    )
  );

CREATE POLICY att_update ON public.incident_attachments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.incidents i
      WHERE i.id = incident_attachments.incident_id
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR ((public.has_role(auth.uid(), 'supervisor'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role))
              AND i.station_id = public.get_user_station(auth.uid()))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.incidents i
      WHERE i.id = incident_attachments.incident_id
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR ((public.has_role(auth.uid(), 'supervisor'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role))
              AND i.station_id = public.get_user_station(auth.uid()))
        )
    )
  );

CREATE POLICY att_delete ON public.incident_attachments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.incidents i
      WHERE i.id = incident_attachments.incident_id
        AND (
          public.has_role(auth.uid(), 'admin'::app_role)
          OR ((public.has_role(auth.uid(), 'supervisor'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role))
              AND i.station_id = public.get_user_station(auth.uid()))
        )
    )
  );