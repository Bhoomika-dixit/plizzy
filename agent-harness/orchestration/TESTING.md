# V2 test and rollout guide

This branch includes an opt-in planning agent and bounded supervisor. It is **not** the full custom-game/multiplayer architecture.

## Local smoke test
1. Configure Supabase and either `ANTHROPIC_API_KEY` or `PLIZZY_MODEL_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, and `OPENROUTER_MODEL`. Apply `migrations/0007_atomic_generated_game_publication.sql` to the target database.
2. Set PLIZZY_ORCHESTRATION_V2=true.
3. Run npm install, npx tsc --noEmit, npm run lint, npm run build.
4. Generate a simple tapping game. Expect successful V1-compatible saved game.
5. Generate a card/turn-based game. Expect an explicit unsupported-strategy error rather than a misleading tap-game substitute.
6. Generate a multiplayer game with the flag enabled. Expect a 422 response stating that V2 is single-player only.
7. Remove the flag or set false to restore original behavior.
7. Inspect Langfuse traces, database records and generated games.

## Known gaps before E2E-ready launch
- No durable queue, checkpoint store, idempotency or background worker.
- No custom/hybrid game package executor or security-reviewed sandbox.
- No visual generation agent or dedicated repair worker; simulation is deterministic action/termination coverage, not full playtesting.
- No LangGraph dependency or graph checkpointing wired in.
- No server-authoritative multiplayer reducer.
- No CI test suite yet.
- Planner capability recognition is model-driven and must be hardened with contract tests and a versioned capability registry.

Do not merge as a completed V2. Use this branch as a staged implementation and preserve the feature flag.
