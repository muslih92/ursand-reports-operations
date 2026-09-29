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
