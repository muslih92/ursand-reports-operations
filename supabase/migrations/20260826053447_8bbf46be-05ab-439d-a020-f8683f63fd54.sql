
-- 1) Leaderboard scoping + employee_no masking
CREATE OR REPLACE FUNCTION public.staff_month_scores(_month date DEFAULT NULL::date)
 RETURNS TABLE(user_id uuid, full_name text, employee_no text, role text, station_code text, m1 numeric, m2 numeric, m3 numeric, m4 numeric, total_score numeric, rank integer, month_start date, month_end date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  ms date;
  me date;
  nd numeric;
  unrestricted boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  unrestricted := public.is_unrestricted_viewer(auth.uid()) OR public.has_role(auth.uid(), 'viewer'::app_role);

  ms := date_trunc('month', COALESCE(_month, (now() AT TIME ZONE 'Asia/Riyadh')::date))::date;
  me := (ms + interval '1 month - 1 day')::date;
  nd := (me - ms + 1)::numeric;

  RETURN QUERY
  WITH people AS (
    SELECT p.id, p.full_name, p.employee_no,
           CASE WHEN ur.role::text = 'supervisor' THEN 'supervisor' ELSE 'operator' END AS rl,
           s.code AS scode,
           p.station_id AS sid
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.stations s ON s.id = p.station_id
    WHERE p.active AND ur.role::text IN ('operator','supervisor')
  ),
  op_reads AS (
    SELECT re.operator_id AS uid,
           count(DISTINCT re.entry_date)::numeric AS days
    FROM public.reading_entries re
    WHERE re.entry_date BETWEEN ms AND me AND re.operator_id IS NOT NULL
    GROUP BY re.operator_id
  ),
  op_vals AS (
    SELECT re.operator_id AS uid,
           count(*)::numeric AS filled,
           count(*) FILTER (
             WHERE rv.recorded_at IS NOT NULL
               AND rv.time_slot ~ '^[0-9]{1,2}:[0-9]{2}$'
               AND abs(extract(epoch FROM (
                     (rv.recorded_at AT TIME ZONE 'Asia/Riyadh')
                     - (re.entry_date + rv.time_slot::time)
                   ))) <= 5400
           )::numeric AS on_time,
           count(*) FILTER (WHERE rv.recorded_at IS NOT NULL)::numeric AS timed
    FROM public.reading_entries re
    JOIN public.reading_values rv ON rv.entry_id = re.id
    WHERE re.entry_date BETWEEN ms AND me AND re.operator_id IS NOT NULL AND rv.value IS NOT NULL
    GROUP BY re.operator_id
  ),
  op_reports AS (
    SELECT sr.operator_id AS uid,
           count(DISTINCT (sr.report_date, sr.shift))::numeric AS slots
    FROM public.shift_reports sr
    WHERE sr.report_date BETWEEN ms AND me AND sr.operator_id IS NOT NULL
    GROUP BY sr.operator_id
  ),
  sv_avail AS (
    SELECT e.supervisor_id AS uid,
           count(DISTINCT e.entry_date)::numeric AS days
    FROM public.equipment_availability_entries e
    WHERE e.entry_date BETWEEN ms AND me AND e.supervisor_id IS NOT NULL
    GROUP BY e.supervisor_id
  ),
  sv_routines AS (
    SELECT r.supervisor_id AS uid,
           count(DISTINCT r.routine_date)::numeric AS days
    FROM public.supervisor_routines r
    WHERE r.routine_date BETWEEN ms AND me AND r.supervisor_id IS NOT NULL
    GROUP BY r.supervisor_id
  ),
  sv_replies AS (
    SELECT m.author_id AS uid, count(*)::numeric AS replies
    FROM public.station_messages m
    WHERE m.created_at::date BETWEEN ms AND me AND m.author_id IS NOT NULL
    GROUP BY m.author_id
  ),
  sv_incidents AS (
    SELECT ps.user_id AS uid,
           count(*)::numeric AS total,
           count(*) FILTER (WHERE i.status::text IN ('closed','resolved'))::numeric AS closed
    FROM public.incidents i
    JOIN public.profile_stations ps ON ps.station_id = i.station_id
    WHERE i.occurred_at::date BETWEEN ms AND me
    GROUP BY ps.user_id
  ),
  scored AS (
    SELECT
      pe.id, pe.full_name, pe.employee_no, pe.rl, pe.scode, pe.sid,
      CASE WHEN pe.rl = 'operator'
        THEN round(LEAST(COALESCE(orr.days,0) / nd * 100, 100), 1)
        ELSE round(LEAST(COALESCE(sa.days,0) / nd * 100, 100), 1) END AS a1,
      CASE WHEN pe.rl = 'operator'
        THEN round(LEAST(COALESCE(orp.slots,0) / (nd * 2) * 100, 100), 1)
        ELSE round(LEAST(COALESCE(sr2.days,0) / nd * 100, 100), 1) END AS a2,
      CASE WHEN pe.rl = 'operator'
        THEN round(COALESCE(ov.on_time / NULLIF(ov.timed,0) * 100, 0), 1)
        ELSE round(COALESCE(si.closed / NULLIF(si.total,0) * 100, 100), 1) END AS a3,
      CASE WHEN pe.rl = 'operator'
        THEN round(LEAST(COALESCE(ov.filled,0) / (nd * 80) * 100, 100), 1)
        ELSE round(LEAST(COALESCE(sm.replies,0) / 20 * 100, 100), 1) END AS a4
    FROM people pe
    LEFT JOIN op_reads    orr ON orr.uid = pe.id
    LEFT JOIN op_vals     ov  ON ov.uid  = pe.id
    LEFT JOIN op_reports  orp ON orp.uid = pe.id
    LEFT JOIN sv_avail    sa  ON sa.uid  = pe.id
    LEFT JOIN sv_routines sr2 ON sr2.uid = pe.id
    LEFT JOIN sv_replies  sm  ON sm.uid  = pe.id
    LEFT JOIN sv_incidents si ON si.uid  = pe.id
  ),
  totals AS (
    SELECT sc.*,
      CASE WHEN sc.rl = 'operator'
        THEN round(sc.a1*0.35 + sc.a2*0.20 + sc.a3*0.30 + sc.a4*0.15, 1)
        ELSE round(sc.a1*0.35 + sc.a2*0.25 + sc.a3*0.20 + sc.a4*0.20, 1) END AS tot
    FROM scored sc
  ),
  ranked AS (
    SELECT t.*, (rank() OVER (PARTITION BY t.rl ORDER BY t.tot DESC, t.full_name))::int AS rnk
    FROM totals t
    WHERE t.tot > 0
  )
  SELECT r.id, r.full_name,
         CASE WHEN unrestricted THEN r.employee_no ELSE NULL END,
         r.rl, r.scode,
         r.a1, r.a2, r.a3, r.a4, r.tot,
         r.rnk, ms, me
  FROM ranked r
  WHERE unrestricted
     OR r.id = auth.uid()
     OR public.can_access_station(auth.uid(), r.sid)
  ORDER BY r.rl, r.tot DESC, r.full_name;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.staff_month_scores(date) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.staff_month_scores(date) TO authenticated;

-- 2) notify_users scoping
CREATE OR REPLACE FUNCTION public.notify_users(_user_ids uuid[], _station_id uuid, _kind text, _title text, _body text DEFAULT NULL::text, _link text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE inserted integer;
BEGIN
  IF _user_ids IS NULL OR _title IS NULL OR auth.uid() IS NULL THEN RETURN 0; END IF;

  INSERT INTO public.notifications (user_id, station_id, kind, title, body, link)
  SELECT DISTINCT u, _station_id, _kind, _title, _body, _link
  FROM unnest(_user_ids) u
  WHERE u <> auth.uid()
    AND (
      public.is_unrestricted_viewer(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = u AND public.can_access_station(auth.uid(), p.station_id)
      )
      OR EXISTS (
        SELECT 1 FROM public.profile_stations ps
        WHERE ps.user_id = u AND public.can_access_station(auth.uid(), ps.station_id)
      )
    );
  GET DIAGNOSTICS inserted = ROW_COUNT;

  INSERT INTO public.audit_events (actor_id, event_type, entity_table, station_id, details)
  VALUES (auth.uid(), 'notification.users', 'notifications', _station_id,
    jsonb_build_object('kind', _kind, 'title', _title, 'recipients', inserted, 'targets', array_length(_user_ids, 1)));

  RETURN inserted;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.notify_users(uuid[], uuid, text, text, text, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.notify_users(uuid[], uuid, text, text, text, text) TO authenticated;

-- 3) Incident attachment storage policies use can_access_station
DROP POLICY IF EXISTS incident_att_read ON storage.objects;
DROP POLICY IF EXISTS incident_att_insert ON storage.objects;
DROP POLICY IF EXISTS incident_att_update ON storage.objects;
DROP POLICY IF EXISTS incident_att_delete ON storage.objects;

CREATE POLICY incident_att_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'incident-attachments'
  AND EXISTS (
    SELECT 1 FROM public.incidents i
    WHERE i.id::text = (storage.foldername(name))[1]
      AND (
        public.is_unrestricted_viewer(auth.uid())
        OR public.has_role(auth.uid(), 'viewer'::app_role)
        OR public.can_access_station(auth.uid(), i.station_id)
      )
  )
);

CREATE POLICY incident_att_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'incident-attachments'
  AND EXISTS (
    SELECT 1 FROM public.incidents i
    WHERE i.id::text = (storage.foldername(name))[1]
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR ((public.has_role(auth.uid(), 'supervisor'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role))
            AND public.can_access_station(auth.uid(), i.station_id))
      )
  )
);

CREATE POLICY incident_att_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'incident-attachments'
  AND EXISTS (
    SELECT 1 FROM public.incidents i
    WHERE i.id::text = (storage.foldername(name))[1]
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR ((public.has_role(auth.uid(), 'supervisor'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role))
            AND public.can_access_station(auth.uid(), i.station_id))
      )
  )
)
WITH CHECK (
  bucket_id = 'incident-attachments'
  AND EXISTS (
    SELECT 1 FROM public.incidents i
    WHERE i.id::text = (storage.foldername(name))[1]
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR ((public.has_role(auth.uid(), 'supervisor'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role))
            AND public.can_access_station(auth.uid(), i.station_id))
      )
  )
);

CREATE POLICY incident_att_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'incident-attachments'
  AND EXISTS (
    SELECT 1 FROM public.incidents i
    WHERE i.id::text = (storage.foldername(name))[1]
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR ((public.has_role(auth.uid(), 'supervisor'::app_role) OR public.has_role(auth.uid(), 'operator'::app_role))
            AND public.can_access_station(auth.uid(), i.station_id))
      )
  )
);

-- 4) shift_reports update WITH CHECK
DROP POLICY IF EXISTS "Operators update own reports" ON public.shift_reports;
CREATE POLICY "Operators update own reports" ON public.shift_reports FOR UPDATE TO authenticated
USING (
  operator_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'supervisor'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR (public.has_role(auth.uid(), 'supervisor'::app_role) AND public.can_access_station(auth.uid(), station_id))
  OR (operator_id = auth.uid() AND public.can_access_station(auth.uid(), station_id))
);
