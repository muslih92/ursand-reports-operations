-- Security hardening: station-scoped access for the URS readings module.
-- Rules:
-- Admin: view/update/delete all readings and view all stations.
-- Supervisor: view all stations/readings; write only assigned stations.
-- Operator: view/write only assigned stations.
-- Management/Viewer: view all stations/readings; no reading writes.
-- Only Admin can delete reading entries or reading values.

ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_values ENABLE ROW LEVEL SECURITY;

-- Remove legacy policies because permissive RLS policies are OR-ed together.
DROP POLICY IF EXISTS stations_read ON public.stations;
DROP POLICY IF EXISTS stations_admin ON public.stations;
DROP POLICY IF EXISTS "stations_read" ON public.stations;
DROP POLICY IF EXISTS "stations_admin" ON public.stations;
DROP POLICY IF EXISTS entries_read ON public.reading_entries;
DROP POLICY IF EXISTS entries_insert ON public.reading_entries;
DROP POLICY IF EXISTS entries_update ON public.reading_entries;
DROP POLICY IF EXISTS entries_delete ON public.reading_entries;
DROP POLICY IF EXISTS "entries_read" ON public.reading_entries;
DROP POLICY IF EXISTS "entries_insert" ON public.reading_entries;
DROP POLICY IF EXISTS "entries_update" ON public.reading_entries;
DROP POLICY IF EXISTS "entries_delete" ON public.reading_entries;
DROP POLICY IF EXISTS "Management can view readings" ON public.reading_entries;
DROP POLICY IF EXISTS values_read ON public.reading_values;
DROP POLICY IF EXISTS values_write ON public.reading_values;
DROP POLICY IF EXISTS "values_read" ON public.reading_values;
DROP POLICY IF EXISTS "values_write" ON public.reading_values;

-- Stations: only Operators are station-scoped. Supervisors and above can view all.
CREATE POLICY stations_select_scoped ON public.stations
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'management'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
  OR public.has_role(auth.uid(), 'viewer'::app_role)
  OR public.can_access_station(auth.uid(), id)
);

CREATE POLICY stations_admin_write ON public.stations
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Reading entries: read scope is role-based; write scope is station-based.
CREATE POLICY reading_entries_select_scoped ON public.reading_entries
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'management'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
  OR public.has_role(auth.uid(), 'viewer'::app_role)
  OR public.can_access_station(auth.uid(), station_id)
);

CREATE POLICY reading_entries_insert_scoped ON public.reading_entries
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    (public.has_role(auth.uid(), 'supervisor'::app_role)
     OR public.has_role(auth.uid(), 'operator'::app_role))
    AND public.can_access_station(auth.uid(), station_id)
  )
);
CREATE POLICY reading_entries_update_scoped ON public.reading_entries
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    (public.has_role(auth.uid(), 'supervisor'::app_role)
     OR public.has_role(auth.uid(), 'operator'::app_role))
    AND public.can_access_station(auth.uid(), station_id)
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (
    (public.has_role(auth.uid(), 'supervisor'::app_role)
     OR public.has_role(auth.uid(), 'operator'::app_role))
    AND public.can_access_station(auth.uid(), station_id)
  )
);

CREATE POLICY reading_entries_delete_admin ON public.reading_entries
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Reading values inherit the station scope of their parent reading entry.
CREATE POLICY reading_values_select_scoped ON public.reading_values
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reading_entries e
    WHERE e.id = reading_values.entry_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'management'::app_role)
        OR public.has_role(auth.uid(), 'supervisor'::app_role)
        OR public.has_role(auth.uid(), 'viewer'::app_role)
        OR public.can_access_station(auth.uid(), e.station_id)
      )
  )
);

CREATE POLICY reading_values_insert_scoped ON public.reading_values
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reading_entries e
    WHERE e.id = reading_values.entry_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (
          (public.has_role(auth.uid(), 'supervisor'::app_role)
           OR public.has_role(auth.uid(), 'operator'::app_role))
          AND public.can_access_station(auth.uid(), e.station_id)
        )
      )
  )
);
CREATE POLICY reading_values_update_scoped ON public.reading_values
FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.reading_entries e
    WHERE e.id = reading_values.entry_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (
          (public.has_role(auth.uid(), 'supervisor'::app_role)
           OR public.has_role(auth.uid(), 'operator'::app_role))
          AND public.can_access_station(auth.uid(), e.station_id)
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reading_entries e
    WHERE e.id = reading_values.entry_id
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR (
          (public.has_role(auth.uid(), 'supervisor'::app_role)
           OR public.has_role(auth.uid(), 'operator'::app_role))
          AND public.can_access_station(auth.uid(), e.station_id)
        )
      )
  )
);

CREATE POLICY reading_values_delete_admin ON public.reading_values
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));
