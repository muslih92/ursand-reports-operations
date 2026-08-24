REVOKE ALL ON FUNCTION public.notify_station(uuid, text, text, text, text, boolean) FROM anon, public;
REVOKE ALL ON FUNCTION public.notify_station_roles(uuid, text, text, text, text, text[]) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.notify_station(uuid, text, text, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.notify_station_roles(uuid, text, text, text, text, text[]) TO authenticated, service_role;