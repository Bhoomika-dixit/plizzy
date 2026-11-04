# Production admin dashboard

URL: https://admin.plizzy.in. The sole application superuser is `bhoomika@plizzy.in`. This is a read-only reporting role, not a Postgres superuser, and does not grant database credentials or user-management powers.

## Sign-in and authorization

Supabase sends numeric email codes through the existing production SMTP configuration. The account must already exist; the admin sign-in form does not create accounts. Admin sessions have their own browser storage key, separate from the player app.

`GET /api/admin` verifies the bearer token with Supabase Auth, checks the current confirmed email, verifies the JWT claims through the SDK, and requires OTP authentication. The server-only reporting RPC independently checks the single pinned Auth user ID, current email, account ban/deletion status, and a live, unexpired Auth session. User-editable metadata cannot grant access. Signing out locally invalidates that admin session.

The private `plizzy_private.admin_access` table has a singleton primary key, RLS, and no browser role grants. The reporting function has a fixed empty search path and is executable only by `service_role`; `anon` and `authenticated` cannot call it directly. Its elevated privilege is needed to aggregate Auth users and otherwise private application records. API responses are private/no-store. The client never receives a service key, refresh tokens from other accounts, prompts, game definitions, or session IP addresses.

Production host routing serves the admin page only on the admin subdomain, with localhost `/admin` available for development. Other production origins redirect `/admin` to the canonical admin URL and return 404 for the admin API. Server authorization applies independently of host routing.

## Reporting definitions

- Registered users: current, non-deleted Auth accounts, including the superuser and unverified registrations. Verification status is reported separately.
- Games: saved `games` records, including archived games; solo/multiplayer classification comes from each game's latest version. Generation attempts are not game counts.
- Signed in recently: users whose latest Auth sign-in falls within the selected 7/30/90-day UTC period. This does not measure every visit or completed gameplay session.
- Daily generation usage: admitted generation attempts, including failures. Quotas reset at UTC midnight. The three-attempt limit remains unchanged.
- Trends: UTC calendar days, including today, with empty days shown as zero. Period controls affect trends/new registrations/new games/recent sign-ins/period attempts. User creation counts, game lists, rooms, and game mix are all-time.
- User directory: server-side search, sorting, and 20-row pagination. User details show the latest 20 games; the overview shows the latest 10. The dashboard refreshes each minute while visible and supports manual refresh. It preserves the last successful report on transient errors and labels it accordingly.

The existing schema does not provide reliable per-play telemetry or recorded AI failure/spend events. The dashboard does not invent those metrics.

## Provisioning and changes

Apply the tracked admin migrations, create the designated account through Supabase Auth's email-code flow if it does not exist, then run [the explicit provisioning script](../supabase/admin/provision_superuser.sql). The script resolves the generated Auth ID by the exact email and refuses to replace a different existing admin. Verification still requires access to that mailbox.

The first admin migration and its follow-up preserve the owner's correction from a mistyped address. The mistyped, unverified Auth record has no admin permission; it was not silently deleted.

To revoke access, remove the singleton grant and revoke the account's sessions through trusted administrative tooling. Replacing the account requires a deliberate migration/provisioning change; changing a profile email or adding `role` metadata cannot elevate a player.

Cloudflare DNS: DNS-only CNAME `admin` to the Vercel project's recommended target (`46433eed993300b1.vercel-dns-017.com`). Existing marketing/app/email records remain in place. No additional production environment secrets are required.

## Verification

Run `node --test tests/*.test.cjs`, `npx tsc --noEmit`, targeted ESLint, and `npm run build -- --webpack`. Check SQL ACLs, a successful OTP dashboard read, denied anonymous/ordinary-user requests, server-side search/details, and live domain routing before declaring the release complete. Never record verification codes or access tokens in documentation.
