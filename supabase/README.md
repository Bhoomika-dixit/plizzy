# Multiplayer setup and verification

Apply `migrations/202610270001_multiplayer.sql` in the Supabase SQL editor (or your migration runner) after the existing app schema. It adds the round store; authenticated room members can read committed state, and only the server can write it. The app uses the existing rooms, room_members, room_games, game_versions, profiles, create_room_for_game and remove_room_member schema/functions.

The server needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Browser sign-in also needs NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Keep the service key server-only.

If room creation reports `function gen_random_bytes(integer) does not exist`, apply `migrations/202610270002_fix_room_invite_random_bytes.sql`. This repairs only unqualified pgcrypto calls inside `public.create_room_for_game(uuid)`, using the extension's actual schema. It preserves the RPC's search path and permissions and does not install or move extensions. If pgcrypto is disabled, the migration asks you to enable it through Database > Extensions. If the error persists after this repair, inspect the RPC and its invite-code helpers in the SQL editor; the migration intentionally does not rewrite other functions.

The creator now retains a generated multiplayer game after room setup fails; click **Retry room setup** to retry without another generation request. To recover a previously saved version after reloading, open `/create-game?mode=multiplayer&resumeGame=GAME_UUID&resumeVersion=VERSION_UUID&title=GAME_TITLE` and click **Retry room setup**. The existing authenticated room RPC still enforces ownership.

Run `node --test tests/multiplayer.test.cjs` for the mocked endpoint integration checks. Run `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/eslint/bin/eslint.js app/api/multiplayer app/footer/rooms app/play app/create-game app/footer/create app/footer/library lib/multiplayer app/page.tsx` for static checks.

For live acceptance testing, use two signed-in accounts in separate browser profiles:

1. Create a Play together game; the creator is redirected to its room.
2. Copy the invite link and open it in the second profile. Sign in if needed, then join with the prefilled invite code.
3. The host selects a shelf game and starts the round. One player alone cannot start.
4. Act in either browser and confirm shared boards synchronize, individual boards stay independent, and scores and timers match the generated rules. Supabase Realtime delivers committed state; revision conflicts refresh and revalidate the move once.
5. Reload the second browser and confirm it resumes the persisted round. Wait offline, then reconnect and confirm the timer catches up.
6. Finish the game and start another round as host. Members cannot start or replace rounds.
7. Remove a member and confirm their next action is denied. Non-host members can leave and rejoin by invite.

Room state is delivered using Supabase Realtime Postgres Changes. The `multiplayer_rounds` table must be in `supabase_realtime`, with SELECT granted to authenticated users and the member-only SELECT policy from the bootstrap migration. Moves still go through the authenticated API; clients cannot write directly. Reconnects and revision checks recover missed changes. A slower periodic sync remains for recovery; timed generic games also synchronize their authoritative timer.

All new multiplayer games use the generic authenticated endpoint and the generated V2 multiplayer contract. It declares player slots (2–32), shared or individual boards, cooperative or competitive objectives, and simultaneous or rotating turns. Server-side rules validate each action and persist the next revision with compare-and-set. Side scrollers use server-authoritative catalogue physics; players submit impulses. Shelf metadata is loaded through the membership-checked endpoint so invited players see private queued game titles.

The historical `20261027183724_atomic_tic_tac_toe_moves.sql` migration is retained for existing installations; the current client no longer calls that specialized RPC. The new session format uses the existing JSON column, so no new schema migration is required. Old versions without a multiplayer contract display a regeneration message rather than changing their rules. Private generated artwork uses its fallback visual. See [the multiplayer implementation and verification guide](../docs/MULTIPLAYER.md) for catalogue scope, performance limits and live test instructions. Unit tests do not change the live database.
