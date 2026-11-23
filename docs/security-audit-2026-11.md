# Security audit — 2026-11-23

Scope: code on `main` (307be5e), the live Supabase project (read-only catalog
queries only), nginx/Docker deploy files, npm dependencies.

## Already strong (verified, no change needed)

- Every table in `public` has RLS enabled; no grants to `anon`; no public views.
- No `SECURITY DEFINER` function lacks a fixed `search_path`; none is executable by `anon`.
  Internal helpers (audit, archive, restore, reports) are not executable by `authenticated`.
- Only reference data (`reading_fields`, `reading_sections`) is readable by every signed-in user.
  Operational tables are station-scoped through `can_access_station`.
- Both storage buckets used by the app are private and station/incident scoped.
- All 28 Auth users have a role; no orphan or foreign-domain accounts (all `@wtco.local`).
- All 25 deactivated profiles are also banned in Auth.
- Server functions and `/api/public/*` verify the JWT with `getClaims` and check `admin` server-side.
- `/mcp` requires a Supabase OAuth token and queries with the caller's own RLS.
- No secrets in tracked files (service-role key, JWT secret, DB URL, private keys).

## Fixed in this change (code/config only — no database change)

| # | Finding | Severity | Fix |
|---|---------|----------|-----|
| 1 | App accepted `postMessage` from any window (`WTCO_CHECKLIST_SUBMIT`, `WTCO_ENTRY_SAVE` write to the DB as the signed-in user) and replied with `targetOrigin "*"` | High | Parent checks `e.origin` and `e.source === iframe`; both sides post only to the same origin |
| 2 | Production CSP allowed `'unsafe-eval'` for the whole app | Medium | Removed for the app (bundle verified to not need it); kept only for the standalone `/checklist/` page |
| 3 | Two CSP headers were sent (nginx + Node), and the checklist page's Tailwind CDN was blocked by nginx's copy | Medium | nginx hides the app's copies and is the single source; per-path CSP |
| 4 | No rate limiting | Medium | 20 r/s per IP site-wide, 5 r/s on `/_serverFn`, `/api`, `/mcp`; 40 connections per IP |
| 5 | Any Host header / direct IP was served | Low | Default servers close the connection (444 / TLS handshake rejected) |
| 6 | TLS protocol/cipher defaults, nginx version exposed, `X-Powered-By` | Low | TLS 1.2/1.3 only, Mozilla intermediate ciphers, `server_tokens off`, header hidden |
| 7 | `client_max_body_size 50m` (uploads go to Supabase directly) | Low | 5 MB; also limits the zod memory advisory below |
| 8 | Hidden files / backups not blocked generically | Low | `/.*` (except `.well-known`) and `.env/.sql/.bak/...` return 404 |
| 9 | Node container ran as root, no log rotation | Low | `USER node`, `no-new-privileges`, `cap_drop: ALL`, 10 MB x 5 logs |
| 10 | Minimum password length 6 | Low | 8 for create / reset / change (existing passwords keep working) |

Verified locally: nginx config passes `nginx -t`; app built and served behind it;
the sign-in page loads with the new CSP and no CSP violations; `.env`, `.git`,
`*.sql` return 404; unknown Host and bare-IP connections are dropped; unit tests pass (40/40).

## Needs owner approval (prepared, NOT applied)

- `docs/pending-database/security-hardening-2026-11.sql`
  - `has_role` / `can_access_station` also require `profiles.active` — a deactivated
    user loses access even if the Auth ban fails (the VPS has no service-role key).
  - Storage buckets accept only images/PDF with a size cap.
- Supabase Auth settings (Lovable Cloud → Users → Auth settings):
  - Turn **off** public sign-ups (accounts are admin-created). Note: the VPS
    `createUser` fallback uses `signUp` when no service key exists, so keep it on
    only if users are created from the VPS; creating users from the Lovable app works either way.
  - Enable leaked-password protection and set minimum length 8.
- Storage bucket `database_export_19_10_26` (11.5 MB export, private, no policies):
  download a copy offline; it can be removed later only if the owner decides.

## Recommended next (not done)

- Bundle the checklist page's CSS instead of loading `cdn.tailwindcss.com`
  (third-party script on the same origin can read the session in localStorage).
- Upgrade `zod` 3 → 4 (GHSA-mrhx-c7xc-m3w5) and `exceljs`'s `uuid` when Lovable allows;
  risk is reduced by the 5 MB body limit and `.max()` bounds on every array input.
- MFA (TOTP) for admin accounts.
