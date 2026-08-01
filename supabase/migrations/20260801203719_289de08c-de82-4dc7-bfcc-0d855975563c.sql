
DROP POLICY IF EXISTS incident_att_read ON storage.objects;
DROP POLICY IF EXISTS incident_att_insert ON storage.objects;
DROP POLICY IF EXISTS incident_att_delete ON storage.objects;

CREATE POLICY incident_att_read ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'incident-attachments'
  AND EXISTS (
    SELECT 1 FROM public.incidents i
    WHERE i.id::text = (storage.foldername(name))[1]
      AND (
        public.has_role(auth.uid(), 'admin') OR
        public.has_role(auth.uid(), 'supervisor') OR
        public.has_role(auth.uid(), 'viewer') OR
        i.station_id = public.get_user_station(auth.uid())
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
        public.has_role(auth.uid(), 'admin') OR
        public.has_role(auth.uid(), 'supervisor') OR
        (public.has_role(auth.uid(), 'operator') AND i.station_id = public.get_user_station(auth.uid()))
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
        public.has_role(auth.uid(), 'admin') OR
        public.has_role(auth.uid(), 'supervisor') OR
        (public.has_role(auth.uid(), 'operator') AND i.station_id = public.get_user_station(auth.uid()))
      )
  )
);
