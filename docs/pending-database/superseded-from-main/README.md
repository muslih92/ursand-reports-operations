# Superseded migrations from `main`

These two hand-written migrations lived only on `main` (Sept 2026). They were moved
here during the `lovable-sync` → `main` merge so they are **not** auto-applied:

- `20260927093000_station_scoped_permissions.sql` drops and recreates the readings
  RLS policies with older rules (supervisors read all stations). Newer migrations on
  `lovable-sync` (2026-10-01) already scope supervisors with `can_access_station`;
  re-running this file would weaken that.
- `20260928090000_reading_entries_station_unique.sql` is already covered by the
  Lovable migration `20260928095208_…`.

Do not apply them to the shared database. Kept for history only.
