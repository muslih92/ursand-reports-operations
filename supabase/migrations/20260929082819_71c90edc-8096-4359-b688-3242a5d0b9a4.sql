DROP FUNCTION IF EXISTS public.restore_deleted_item(uuid);

CREATE OR REPLACE FUNCTION public.restore_deleted_item(_item_id uuid, _actor_id uuid)
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
  IF _actor_id IS NULL THEN
    RAISE EXCEPTION 'Actor is required';
  END IF;

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
  IF requested.deleted_by <> _actor_id AND NOT public.has_role(_actor_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Not allowed to restore this item';
  END IF;

  FOR archived IN
    SELECT *
    FROM public.deleted_items
    WHERE deletion_txid = requested.deletion_txid
      AND restored_at IS NULL
      AND deleted_at >= now() - interval '30 days'
    ORDER BY CASE table_name
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
    IF archived.deleted_by <> _actor_id AND NOT public.has_role(_actor_id, 'admin'::public.app_role) THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'INSERT INTO public.%I SELECT (jsonb_populate_record(NULL::public.%I, $1)).* ON CONFLICT DO NOTHING',
      archived.table_name,
      archived.table_name
    ) USING archived.row_data;

    UPDATE public.deleted_items
    SET restored_at = now(), restored_by = _actor_id
    WHERE id = archived.id;
    restored_count := restored_count + 1;
  END LOOP;

  PERFORM public.log_audit_event(
    'restore', requested.table_name, requested.record_id, requested.station_id,
    jsonb_build_object('trash_item_id', requested.id, 'restored_count', restored_count, 'actor_id', _actor_id)
  );

  RETURN restored_count;
END;
$$;

REVOKE ALL ON FUNCTION public.restore_deleted_item(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restore_deleted_item(uuid, uuid) TO service_role;