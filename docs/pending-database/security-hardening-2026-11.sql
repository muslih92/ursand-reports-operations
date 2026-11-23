-- REVIEW ONLY. Not installed, not part of the automatic migration directory.
-- Apply only after the owner approves and a fresh backup is verified.
--
-- What it does (no data is changed or deleted; only two helper functions and
-- two storage bucket limits are redefined):
--
-- 1) Deactivated accounts lose all database access immediately.
--    Today has_role() and can_access_station() only look at user_roles /
--    station assignments, so a user whose profile is set active = false keeps
--    full RLS access for as long as their Auth account is not banned (on the
--    self-hosted server there is no service-role key, so the ban step can fail
--    silently). With this change RLS also requires profiles.active = true.
--    Checked 2026-11-23: every currently active user (1 admin, 1 management,
--    1 operator) has an active profile, so nobody who works today is affected.
--
-- 2) Storage buckets only accept the file types the app uploads, with a size cap.
--    Checked 2026-11-23: both buckets are empty, so no existing file is affected.
--
-- Rollback: re-run the previous definitions from
-- supabase/migrations (has_role / can_access_station) and set the two bucket
-- columns back to NULL.

BEGIN;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND p.active
  )
$function$;

CREATE OR REPLACE FUNCTION public.can_access_station(_user_id uuid, _station_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _station_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.profiles a WHERE a.id = _user_id AND a.active)
    AND (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _user_id AND p.station_id = _station_id)
      OR EXISTS (SELECT 1 FROM public.profile_stations ps WHERE ps.user_id = _user_id AND ps.station_id = _station_id)
    )
$function$;

-- Incident attachments: images and PDF, max 20 MB.
UPDATE storage.buckets
   SET file_size_limit = 20971520,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif','application/pdf']
 WHERE id = 'incident-attachments';

-- Checklist photos: images only (size cap already 10 MB).
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif']
 WHERE id = 'checklist-photos';

COMMIT;

-- Verify after applying (expect: active admin still true, an inactive user false):
-- SELECT u.id, p.active, public.has_role(u.id, r.role) FROM public.user_roles r
--   JOIN public.profiles p ON p.id = r.user_id JOIN auth.users u ON u.id = r.user_id;
