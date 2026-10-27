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
4. Act in either browser and confirm both show the same board, score and timer. Updates are polled every second; conflicting moves are rejected and the board refreshes.
5. Reload the second browser and confirm it resumes the persisted round. Wait offline, then reconnect and confirm the timer catches up.
6. Finish the game and start another round as host. Members cannot start or replace rounds.
7. Remove a member and confirm their next action is denied. Non-host members can leave and rejoin by invite.

Room state is delivered using Supabase Realtime Postgres Changes. The `multiplayer_rounds` table must be in `supabase_realtime`, with SELECT granted to authenticated users and the member-only SELECT policy from the bootstrap migration. Moves still go through the authenticated API; clients cannot write directly. Reconnects and revision checks recover missed changes. A slower periodic sync remains for recovery; timed generic games also synchronize their authoritative timer.

Apply the CLI-generated `20261027183724_atomic_tic_tac_toe_moves.sql` migration for the optimized tic-tac-toe move path. The client calls a single authenticated Supabase RPC. The function checks membership and assigned player, locks the round, validates its revision and the empty cell, calculates the result and commits one update. Its search path is empty, anonymous/PUBLIC execution is revoked, and authenticated clients still have no direct table write privileges. Generic games continue to use the Next.js endpoint. Room shelf metadata is loaded through the membership-checked endpoint so invited players see private queued game titles.

Tic-tac-toe uses server-enforced X/O turns, occupied-cell checks, eight winning lines and draws. The host is X and the earliest joined other member is O; additional members watch. Start a new round to upgrade a previously running cooperative round. Other games use the V2 generic cooperative board runtime. Executable side-scroller games are excluded. Private generated artwork uses its fallback visual. The V2 definition retains its existing single_player format; game_versions.game_mode selects the multiplayer transport. Unit tests do not change the live database.
