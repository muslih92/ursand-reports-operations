-- Replies inherit targeting, and both the replier AND the root author stay visible
CREATE OR REPLACE FUNCTION public.station_messages_inherit_targets()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE p record;
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    SELECT audience_roles, target_station_ids, target_user_ids, station_id, author_id
      INTO p FROM public.station_messages WHERE id = NEW.parent_id;
    IF FOUND THEN
      NEW.audience_roles := p.audience_roles;
      NEW.target_station_ids := p.target_station_ids;
      NEW.target_user_ids := CASE
        WHEN p.target_user_ids IS NULL THEN NULL
        ELSE (SELECT ARRAY(
          SELECT DISTINCT u
          FROM unnest(p.target_user_ids || ARRAY[NEW.author_id, p.author_id]) u
          WHERE u IS NOT NULL))
      END;
      NEW.station_id := p.station_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Allow replies from anyone who can view the parent thread
DROP POLICY IF EXISTS "station_messages_insert" ON public.station_messages;
CREATE POLICY "station_messages_insert" ON public.station_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      (
        parent_id IS NULL
        AND (
          public.is_unrestricted_viewer(auth.uid())
          OR public.can_access_station(auth.uid(), station_id)
        )
      )
      OR (
        parent_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.station_messages p
          WHERE p.id = parent_id
            AND public.can_view_station_message(
              auth.uid(), p.station_id, p.author_id,
              p.audience_roles, p.target_station_ids, p.target_user_ids
            )
        )
      )
    )
  );