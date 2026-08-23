CREATE OR REPLACE FUNCTION public.notify_station_roles(
  _station_id uuid,
  _kind text,
  _title text,
  _body text,
  _link text DEFAULT NULL,
  _roles text[] DEFAULT ARRAY['management','admin','supervisor']
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inserted integer;
BEGIN
  IF _station_id IS NULL OR _title IS NULL OR _roles IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.notifications (user_id, station_id, kind, title, body, link)
  SELECT DISTINCT ur.user_id, _station_id, _kind, _title, _body, _link
  FROM public.user_roles ur
  WHERE ur.user_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
    AND ur.role::text = ANY(_roles)
    AND (
      ur.role IN ('management'::app_role, 'admin'::app_role)
      OR public.can_access_station(ur.user_id, _station_id)
    );

  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.notify_station_roles(uuid, text, text, text, text, text[]) TO authenticated;