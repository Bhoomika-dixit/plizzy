# V2 test and rollout guide

This branch includes an opt-in planning agent and bounded supervisor. It is **not** the full custom-game/multiplayer architecture.

## Local smoke test
1. Configure Supabase and ANTHROPIC_API_KEY as in V1. Optional: set PLIZZY_MODEL_PROVIDER=openrouter, OPENROUTER_API_KEY and OPENROUTER_MODEL (only planner uses this provider today).
2. Set PLIZZY_ORCHESTRATION_V2=true.
3. Run npm install, npx tsc --noEmit, npm run lint, npm run build.
4. Generate a simple tapping game. Expect successful V1-compatible saved game.
5. Generate a card/turn-based game. Expect an explicit unsupported-strategy error rather than a misleading tap-game substitute.
6. Remove the flag or set false to restore original behavior.
7. Inspect Langfuse traces, database records and generated games.

## Known gaps before E2E-ready launch
- No durable queue, checkpoint store, idempotency, cancellation or background worker.
- No custom/hybrid game package executor or security-reviewed sandbox.
- No visual generation agent, dedicated repair worker, or simulator beyond schema validation.
- No LangGraph dependency or graph checkpointing wired in.
- No server-authoritative multiplayer reducer.
- No CI build/test confirmation yet.
- Provider abstraction is used by the planner, not yet by the legacy declarative generator.
- Planner capability recognition is model-driven and must be hardened with contract tests.

Do not merge as a completed V2. Use this branch as a staged implementation and preserve the feature flag.
