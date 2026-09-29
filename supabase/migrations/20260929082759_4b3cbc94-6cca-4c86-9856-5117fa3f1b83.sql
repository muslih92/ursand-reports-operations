CREATE TABLE public.deleted_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  station_id uuid,
  record_label text,
  row_data jsonb NOT NULL,
  deletion_txid bigint NOT NULL,
  deleted_by uuid NOT NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  restored_by uuid,
  restored_at timestamptz,
  CONSTRAINT deleted_items_table_chk CHECK (table_name = ANY (ARRAY[
    'shift_reports','supervisor_routines','reading_entries','reading_values',
    'equipment_availability_entries','equipment_availability_values',
    'checklist_reports','checklist_entries','fire_pump_tests','generator_tests',
    'incidents','incident_attachments','defeat_records','station_messages','station_notes'
  ])),
  CONSTRAINT deleted_items_restore_pair_chk CHECK ((restored_by IS NULL) = (restored_at IS NULL))
);

GRANT SELECT ON public.deleted_items TO authenticated;
GRANT ALL ON public.deleted_items TO service_role;

ALTER TABLE public.deleted_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY deleted_items_read_own_or_admin
ON public.deleted_items
FOR SELECT
TO authenticated
USING (deleted_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX deleted_items_active_idx ON public.deleted_items (deleted_at DESC) WHERE restored_at IS NULL;
CREATE INDEX deleted_items_txid_idx ON public.deleted_items (deletion_txid);

CREATE OR REPLACE FUNCTION public.archive_deleted_operational_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb := to_jsonb(OLD);
  actor uuid := auth.uid();
  resolved_station uuid;
  label text;
BEGIN
  IF actor IS NULL THEN
    RETURN OLD;
  END IF;

  IF payload ? 'station_id' AND NULLIF(payload->>'station_id', '') IS NOT NULL THEN
    resolved_station := (payload->>'station_id')::uuid;
  ELSIF TG_TABLE_NAME = 'reading_values' THEN
    SELECT e.station_id INTO resolved_station FROM public.reading_entries e WHERE e.id = (payload->>'entry_id')::uuid;
  ELSIF TG_TABLE_NAME = 'equipment_availability_values' THEN
    SELECT e.station_id INTO resolved_station FROM public.equipment_availability_entries e WHERE e.id = (payload->>'entry_id')::uuid;
  ELSIF TG_TABLE_NAME = 'incident_attachments' THEN
    SELECT i.station_id INTO resolved_station FROM public.incidents i WHERE i.id = (payload->>'incident_id')::uuid;
  ELSIF TG_TABLE_NAME = 'checklist_entries' THEN
    resolved_station := NULLIF(payload->>'station_id', '')::uuid;
  END IF;

  label := COALESCE(
    NULLIF(payload->>'title', ''),
    NULLIF(payload->>'subject', ''),
    NULLIF(payload->>'incident_no', ''),
    NULLIF(payload->>'report_date', ''),
    NULLIF(payload->>'entry_date', ''),
    NULLIF(payload->>'test_date', ''),
    NULLIF(payload->>'routine_date', ''),
    NULLIF(payload->>'defeat_number', ''),
    NULLIF(payload->>'file_name', ''),
    payload->>'id'
  );

  INSERT INTO public.deleted_items (
    table_name, record_id, station_id, record_label, row_data, deletion_txid, deleted_by
  ) VALUES (
    TG_TABLE_NAME, OLD.id, resolved_station, label, payload, txid_current(), actor
  );

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_deleted_operational_row() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_deleted_operational_row() TO service_role;

CREATE TRIGGER archive_shift_reports_before_delete BEFORE DELETE ON public.shift_reports FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_supervisor_routines_before_delete BEFORE DELETE ON public.supervisor_routines FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_reading_entries_before_delete BEFORE DELETE ON public.reading_entries FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_reading_values_before_delete BEFORE DELETE ON public.reading_values FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_availability_entries_before_delete BEFORE DELETE ON public.equipment_availability_entries FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_availability_values_before_delete BEFORE DELETE ON public.equipment_availability_values FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_checklist_reports_before_delete BEFORE DELETE ON public.checklist_reports FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_checklist_entries_before_delete BEFORE DELETE ON public.checklist_entries FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_fire_pump_tests_before_delete BEFORE DELETE ON public.fire_pump_tests FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_generator_tests_before_delete BEFORE DELETE ON public.generator_tests FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_incidents_before_delete BEFORE DELETE ON public.incidents FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_incident_attachments_before_delete BEFORE DELETE ON public.incident_attachments FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_defeat_records_before_delete BEFORE DELETE ON public.defeat_records FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_station_messages_before_delete BEFORE DELETE ON public.station_messages FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();
CREATE TRIGGER archive_station_notes_before_delete BEFORE DELETE ON public.station_notes FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_operational_row();

CREATE OR REPLACE FUNCTION public.restore_deleted_item(_item_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested public.deleted_items%ROWTYPE;
  archived public.deleted_items%ROWTYPE;
  restored_count integer := 0;
BEGIN
  SELECT * INTO requested
  FROM public.deleted_items
  WHERE id = _item_id;

  IF requested.id IS NULL THEN
    RAISE EXCEPTION 'Deleted item not found';
  END IF;
  IF requested.restored_at IS NOT NULL THEN
    RAISE EXCEPTION 'Item has already been restored';
  END IF;
  IF requested.deleted_at < now() - interval '30 days' THEN
    RAISE EXCEPTION 'The 30-day restore period has expired';
  END IF;
  IF requested.deleted_by <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not allowed to restore this item';
  END IF;

  FOR archived IN
    SELECT *
    FROM public.deleted_items
    WHERE deletion_txid = requested.deletion_txid
      AND restored_at IS NULL
      AND deleted_at >= now() - interval '30 days'
    ORDER BY CASE table_name
      WHEN 'stations' THEN 1
      WHEN 'incidents' THEN 10
      WHEN 'reading_entries' THEN 10
      WHEN 'equipment_availability_entries' THEN 10
      WHEN 'checklist_reports' THEN 10
      WHEN 'station_messages' THEN 10
      WHEN 'incident_attachments' THEN 20
      WHEN 'reading_values' THEN 20
      WHEN 'equipment_availability_values' THEN 20
      WHEN 'checklist_entries' THEN 20
      ELSE 15
    END, deleted_at
  LOOP
    IF archived.deleted_by <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I, $1)).* ON CONFLICT DO NOTHING',
      archived.table_name,
      archived.table_name
    ) USING archived.row_data;

    UPDATE public.deleted_items
    SET restored_at = now(), restored_by = auth.uid()
    WHERE id = archived.id;
    restored_count := restored_count + 1;
  END LOOP;

  PERFORM public.log_audit_event(
    'restore', requested.table_name, requested.record_id, requested.station_id,
    jsonb_build_object('trash_item_id', requested.id, 'restored_count', restored_count)
  );

  RETURN restored_count;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_deleted_item(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_deleted_item(uuid) TO authenticated, service_role;