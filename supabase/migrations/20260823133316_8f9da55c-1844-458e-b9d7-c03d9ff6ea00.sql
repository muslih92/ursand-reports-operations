REVOKE ALL ON FUNCTION public.can_view_station_message(uuid, uuid, uuid, text[], uuid[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_station_message(uuid, uuid, uuid, text[], uuid[], uuid[]) TO authenticated;
REVOKE ALL ON FUNCTION public.list_message_recipients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_message_recipients() TO authenticated;
REVOKE ALL ON FUNCTION public.notify_users(uuid[], uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_users(uuid[], uuid, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.notify_stations_roles(uuid[], text, text, text, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_stations_roles(uuid[], text, text, text, text, text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.station_messages_inherit_targets() FROM PUBLIC, anon, authenticated;