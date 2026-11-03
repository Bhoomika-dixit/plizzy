# Empty-project bootstrap

The original base schema lived in ignored local `migrations/0001` through `0007` files. The versioned SQL here preserves that schema for a new Supabase project. It contains schema, policies, and storage-bucket definitions only; no development users, games, credentials, or other data are copied.

For a **new, empty** project:

1. Concatenate `20261103165500_production_bootstrap.sql` and `publishing.sql` in that order and apply them together as one migration named `production_bootstrap`.
2. Apply the files in `supabase/migrations/` in filename order. They configure multiplayer Realtime, repair pgcrypto resolution, retain the legacy move RPC, and install the daily quota and publishing restriction.
3. Check that every public table has RLS, `multiplayer_rounds` is in `supabase_realtime`, and browser roles cannot execute `publish_generated_game` or `consume_game_generation`.
4. Configure Auth, SMTP and code-only email templates separately, then verify OTP sign-in from the intended app origin.

The bootstrap explicitly refuses to run when `public.profiles` already exists. Do not run it against the existing development project or an initialized production database. Supabase migration-history versions assigned by its management API can differ from source filenames; compare migration names and SQL rather than blindly replaying files on an initialized project.

The new `prod` project was initialized this way on 3 November 2026. See [the beta deployment notes](../../docs/BETA_DEPLOYMENT.md).
