<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Station/authorization fields on profiles (station_id, active, employee_no) are admin-only via trigger protect_profile_auth_fields; operator shift lock is also enforced in the DB by trg_reading_values_shift_lock (must mirror shiftEnd() in readings.tsx) — why: frontend checks alone were bypassable.
- Station-note status changes are role/category scoped in RLS: admin/supervisor manage all accessible notes; operators manage maintenance only — why: UI-only restrictions are bypassable.
- Operational hard deletes are archived by database triggers in deleted_items and restored only through an authenticated server function for 30 days — why: recovery must survive page changes without exposing privileged restore access.
- Reading cell number/status rules live in src/lib/reading-validation.ts (malformed numbers are never saved; quick-mark aliases normalize to codes) — why: one shared rule for the reading page and any future database check.
- Supervisor access to station data always requires can_access_station; only admin/management/viewer read all stations, verified by security_hardening_report() and tests/security-hardening.test.ts — why: a role check alone gave supervisors global access.
- First-admin setup is gated by the app_installation marker plus no admin/profile/auth user (fail closed) — why: prevents setup takeover.
- User deletion and explicit deactivation share user-deletion.server.ts; self-hosted servers relay to the managed /api/public/admin-delete-user with the caller's bearer token and never follow redirects — why: the service key remains managed, every path checks admin/self-access and preserves historical attribution.
- deleteUser uses requireSupabaseAuthFlexible (src/lib/server-auth.ts), which accepts the Bearer header or the Supabase session cookie and verifies the JWT via getClaims; the relayed token always comes from the verified context, never re-read raw — why: cookie-based deployments (Hostinger) send no Authorization header.
- Keep historicalReferences in user-deletion.server.ts aligned with all user-reference columns when adding schema — why: references without foreign keys also need deletion protection.
- Permanent deletion requires prepare/complete database RPCs and durable reservations; never fall back to unguarded Auth deletion when staged SQL is missing — why: identity, relation readiness, last-active-admin concurrency and completion must fail closed.
- Historical attribution uses historical-identities.ts; operation-time snapshots take precedence and inactive/missing profiles fall back to historical identities — why: login removal must not erase attribution or rewrite old names.
- Unapproved database work lives under docs/pending-database, outside automatic migrations; isolated tests explicitly target a local socket — why: preview and production share one backend.
