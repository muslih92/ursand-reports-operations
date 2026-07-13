CREATE POLICY "incident_att_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'incident-attachments');
CREATE POLICY "incident_att_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'incident-attachments');
CREATE POLICY "incident_att_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'incident-attachments');