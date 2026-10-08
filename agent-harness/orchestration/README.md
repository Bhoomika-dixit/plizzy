# Agent orchestration V2: safe foundation

This is the first, **non-production-wired** increment toward the [Notion architecture](https://app.notion.com/p/3f314b22fe4b8126a98ae856a9487932).

- `contracts.ts`: typed planning, routing, worker, artifact and workflow contracts.
- `policy.ts`: deterministic capability and execution gates. Unsupported custom/hybrid generation fails explicitly rather than silently returning a tap game.
- `workflow.ts`: injected planner/generator/repair workers, bounded steps, deadline checks, schema validation, and stage events.

**Important:** No changes to the existing `/api/generate-game` route or V1 single-player runtime. This module does not yet deliver LangGraph persistence, async jobs, generated-code sandboxing, multiplayer, or additional game genres. The deadline guard checks between awaited stages; provider-level request timeouts and cancellation must be added before production use.

## Next integration steps
1. Implement structured LLM planner and model provider adapter.
2. Add persistent Supabase job/checkpoint storage, idempotent writes, cancellation and provider timeouts.
3. Wire the graph behind a feature flag; run regression tests against existing single-player games.
4. Add validated hybrid/custom executors with sandboxing and mobile UI contracts.
5. Introduce LangGraph orchestration once durable execution semantics are chosen; preserve the worker contracts.
