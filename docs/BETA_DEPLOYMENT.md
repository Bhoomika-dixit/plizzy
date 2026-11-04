# Plizzy beta deployment

## Targets

- Landing page: https://plizzy.in (canonical), with https://www.plizzy.in redirecting to it.
- Application: https://app.plizzy.in. The landing page links to the app, marks Google Play as coming soon, and explains the iPhone Safari Home Screen shortcut.
- Read-only admin dashboard: https://admin.plizzy.in, restricted to the provisioned OTP superuser `bhoomika@plizzy.in`. See [admin operations](ADMIN_DASHBOARD.md).
- Vercel team: `bhoomika-dixits-projects`; project `plizzy` (`prj_yTHIdss8m20HOYIDABXI7ZDMz71f`).
- Supabase organization: `Bhoomika-dixit's Org`; project `prod` (`rmhtmgqxigvrmflicczg`), Mumbai `ap-south-1`.
- Initial production app source: merged commit `04eac0eb121405569c60cfda40191d279dba77d2` (PR #12). Later releases include the landing/app domain split; inspect the current Vercel deployment for its exact source commit.
- Runtime: Node.js 24, Next.js 16.4.4, Vercel Fluid Compute in `bom1`. Build: `npm run build -- --webpack`; install: `npm ci`; default function timeout: 300 seconds.

Development remains on its existing Supabase project. Production has a fresh schema and storage buckets; development users and games were not copied.

## Configuration

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` point to `prod` and are public Config values. `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `LANGFUSE_PUBLIC_KEY`, and `LANGFUSE_SECRET_KEY` are Production-only Secrets entered directly by the account owner. The Supabase variable accepts the new project's modern secret API key; its historical variable name is retained by the application. Anthropic model and Langfuse base URL are Config values; `LANGFUSE_ENVIRONMENT=production` separates traces. Vercel OIDC is enabled for generated image access through AI Gateway.

Supabase Auth's Site URL is `https://app.plizzy.in`. Email-code templates are stored in `supabase/templates/`. Custom SMTP uses `smtp.resend.com`, port 465, username `resend`, sender `login@auth.plizzy.in`, display name `Plizzy`. The owner entered the SMTP password directly; no credential is recorded here.

Cloudflare authoritative DNS was updated with Vercel's project-specific recommendations:

| Type | Name | Value | Proxy |
| --- | --- | --- | --- |
| A | `@` | `216.198.79.1` | DNS only |
| A | `@` | `64.29.17.1` | DNS only |
| CNAME | `app` | `46433eed993300b1.vercel-dns-017.com` | DNS only |
| CNAME | `admin` | `46433eed993300b1.vercel-dns-017.com` | DNS only |
| CNAME | `www` | `46433eed993300b1.vercel-dns-017.com` | DNS only |

Root and www TTL is 300 seconds; app uses Auto TTL. Existing email MX, SPF, and DKIM records were preserved. Recheck Vercel's current domain recommendations before future DNS changes; these are this project's values, not universal Vercel records.

## Landing and application routing

Both domains use the same Vercel project. Next.js Proxy rewrites the marketing root to the static landing page and permanently redirects old application paths to the same path and query on `app.plizzy.in`, preserving invite links. Localhost and preview deployments retain their existing application routes; `/welcome` previews the landing page locally. Run `node --test tests/domain-routing.test.cjs` to verify host routing and landing behavior.

Authentication storage is scoped to the browser origin, so existing users must sign in once on the new app subdomain. Accounts and saved games remain in the same production database. The app manifest and Apple touch icon support Home Screen installation; there is no native App Store release or offline-play guarantee.

## Schema and release operations

Use [the empty-project bootstrap](../supabase/bootstrap/README.md) only for a new database. The current `prod` already has the bootstrap and seven incremental migrations applied, including Realtime, quota, restricted publishing, and admin reporting with the corrected superuser email.

The first deployment was created through the Vercel API from the exact Git commit. Automatic deployments on GitHub pushes are **not configured** because the Vercel GitHub integration is not installed. Connecting the repository requires the owner to authorize that integration. Until then, use the Vercel dashboard or API to create deployments from an explicitly reviewed commit, and select this project and Production target.

Environment changes require a new deployment; they do not update an already built deployment. Keep preview secrets separate from Production. Vercel's existing Deployment Protection was retained; public access is through the custom domain.

Before a later release, verify its commit, migrations, environment-variable names/types, build, authentication, quota protection, and game creation. Roll back the Vercel deployment through the dashboard if a release fails; database migrations need their own compatible rollback plan.

## Initial checks

- Both website domains have HTTPS; `www` returns a permanent 308 redirect to the canonical origin.
- Home page returns 200; unauthenticated generation and multiplayer API calls return 401.
- All 13 public tables have RLS, and multiplayer rounds are published through Supabase Realtime.
- Anonymous publishing and browser access to the quota RPC are denied.
- Vercel reported no grouped runtime errors during initial checks.
- The runtime dependency audit is clean. The development-only minimatch advisory remains documented in [the security notes](SECURITY_REMEDIATION.md).

Production acceptance also confirmed email-code delivery and verification, profile creation, and a complete authenticated generation. The private `Beta launch check` space quiz was saved, rendered, and played through all three questions to a 3-point win. This used one daily generation attempt. A successful build alone does not establish that these flows work; repeat the relevant acceptance steps after configuration changes.
