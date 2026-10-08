# Agent orchestration V2: safe foundation

This is the first, feature-flagged increment toward the [Notion architecture](https://app.notion.com/p/3f314b22fe4b8126a98ae856a9487932). It is wired into `/api/generate-game` only when `PLIZZY_ORCHESTRATION_V2=true` and supports **single-player only**.

- `contracts.ts`: typed planning, routing, worker, artifact and workflow contracts.
- `policy.ts`: deterministic capability and execution gates. Unsupported custom/hybrid generation fails explicitly rather than silently returning a tap game.
- `workflow.ts`: injected planner/generator/repair workers, bounded steps, abortable deadlines, schema validation, and stage events.
- `simulator.ts`: bounded, deterministic action-coverage and termination gate before a V2 definition is persisted.

**Important:** V1 remains the only executor. This module does not yet deliver durable jobs, LangGraph checkpoints, generated-code sandboxing, custom/hybrid packages, or an authoritative multiplayer reducer. The route uses an atomic database publication RPC; apply migration `0007_atomic_generated_game_publication.sql` before enabling V2.

## Next integration steps
1. Add persistent Supabase job/checkpoint storage, idempotency, cancellation and a background worker.
2. Add cost-budget enforcement and provider rate limiting to the common model client.
3. Add contract and route integration tests, then run regression tests against existing single-player games.
4. Add validated hybrid/custom executors with sandboxing and mobile UI contracts.
5. Introduce LangGraph orchestration once durable execution semantics are chosen; preserve the worker contracts.
