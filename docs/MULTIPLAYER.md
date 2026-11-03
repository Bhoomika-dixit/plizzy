# Catalogue-based multiplayer

## Design and execution

The existing requirements-first designer now handles both requested modes. The requirements tool freezes the player count, all six tools retain requirement bindings, and the rules tool must produce the multiplayer contract. Final validation checks the mode and maximum player count against the accepted requirements before saving. A competitive prompt is not rewritten as cooperative, and game names never select an execution engine.

The contract declares version, minimum/maximum players (2–32), cooperative/competitive objective, shared/individual board, simultaneous/round-robin turns, and unique player symbols. Individual boards are simultaneous. The first joined members fill the configured slots at start; additional members spectate. A fixed roster prevents late joins from taking over another player's board. The host can restart if a participant leaves.

`agent-harness/multiplayer-runtime.ts` wraps the existing deterministic V2 rules engine. The server injects actorId, actorIndex and actorSymbol, validates interaction targets and payloads, and rejects spectators, forged fields, wrong turns and no-op moves. Shared turns rotate only after a legal state change. Individual boards isolate actions; the public scoreboard is derived from authoritative state. Competitive ties are allowed; individual cooperative play requires everyone to finish successfully. Generated winnerSymbol can name the winner of a shared game or use `draw`.

Entity content.stateKey renders generated entity state, allowing generated marks and labels without special components. STATE_CHANGED retains trusted actor context so generic generated winning conditions can compare actor symbols.

## Catalogue coverage

Arena, grid, card grid, circles, lanes, scene and list reuse the generic renderer with the projected player board. Tap, selection, drag/drop, text, swipe and keyboard input use the same action dispatcher.

Side scrollers use individual simultaneous boards and the original catalogue renderer in controlled mode. The server simulates gravity, obstacles, collision, bounds, score and time using the existing catalogue physics functions and configuration limits. A three-second countdown gives subscribers a chance to connect. Clients predict their board at animation-frame speed and batch impulse times; they never submit positions, scores or collision results. The server checks ordered inputs, player identity, batch size and time bounds, then settles a four-second input window. Local play and the local score respond immediately; the shared scoreboard and final results follow confirmation. Prediction reconciles from committed snapshots. Recovery reads are deduplicated and do not block input batches. This transport is suitable for the current individual-board side scroller, not a dedicated low-latency game server for new physics game families. Connections slower than the input window receive an explicit reconnect/restart error.

This scope is the current public-information catalogue. Hidden/private hands, arbitrary drawing, chat, unsupported renderers and new game families are not introduced by this change. The agent must report missing capabilities rather than substituting a different game. Thirty-two is a schema capacity limit, not a load-tested concurrency guarantee.

## Persistence and transport

Existing multiplayer_rounds JSON stores the versioned session, roster, boards, turn, physics and winners. Supabase Realtime delivers committed revisions to authorized room members. The Next.js endpoint validates membership and all writes use revision compare-and-set; clients cannot submit complete state. A conflicting move may be revalidated once, but ambiguous network failures are not automatically replayed. Periodic sync advances timers and physics and recovers missed notifications. The old tic-tac-toe RPC is no longer invoked; historical migration files are retained.

No database schema change is required for the new JSON format. Existing Realtime publication, member-read RLS and service-only write grants remain required. Earlier multiplayer games without a contract remain intact and show a regeneration message.

## Verification

`node --test tests/multiplayer.test.cjs` covers catalogue renderer validation, catalogue input dispatch, multi-player turn rotation, isolated boards, spoofing/illegal actions, authoritative physics, timers, conflicts, reconnects and solo compatibility.

Opt-in provider checks: `node --env-file=.env tests/generation-smoke.cjs TITLE PROMPT`, with PLIZZY_DEMO_EMAIL and PLIZZY_DEMO_PASSWORD supplied through environment variables. Opt-in playback: `node --env-file=.env tests/generated-playback.cjs VERSION_UUID ...`. These use real services and may create demo games or incur model usage; they are not part of the default test command.

Verified with real generation and playback: three-player simultaneous competitive trivia, a two-player turn-based grid game, and a two-player side-scroller race. Two-account browser tests completed the generated grid match through the generic engine and a flying race with independent boards, an active player scoring 14 against an inactive player's zero, and matching winners in both accounts. The full catalogue has unit coverage; full multi-account browser acceptance for every renderer and 32-player load testing remain outstanding.
