# GameDefinition V2

GameDefinition V2 is Plizzy's compositional single-player contract. An AI agent selects capabilities through public manifests, fills their declared placeholders, and saves one validated definition. It never reads or writes implementation source.

## Generation pipeline

1. The creator submits a title and idea.
2. The agent infers the game plan.
3. The agent calls all six tools in `agent-harness/tools`.
4. Each tool selects executable modules by public catalogue ID and validates their placeholders.
5. The agent assembles a `GameDefinitionV2` from successful tool results.
6. The composition validator verifies references, renderer/input compatibility, required copy, assets, physics configuration, and end conditions.
7. Intent coverage rejects a mechanically incorrect approximation.
8. The simulator checks that an end state is reachable.
9. A single bounded repair is allowed before rejection.
10. The accepted definition is persisted and executed through statically registered catalogue implementations.

## Executable catalogue

The canonical catalogue lives in the top-level `catalogue/` directory. Its six tool-aligned folders are `renderers`, `interactions`, `entity-behaviours`, `rules`, `assets`, and `text`. Each contains public manifests and actual executable modules. `catalogue/manifests.ts` is the model-facing projection; `agent-harness/tools/catalog.ts` is only a compatibility proxy.

Renderer options include the generic arena, grid, card grid, circles, lanes, scene, and list layouts plus `side_scroller.v1`. The side-scroller implementation supplies one-button gravity, scrolling obstacle pairs, collision and bounds detection, score-on-pass, timer completion, and progressive difficulty.

Interaction modules include tap, select, drag/drop, swipe, text input, keyboard movement, and `impulse.v1`. Behaviour modules include static, fall, move, flip, float, bounce, spawn, reveal, gravity, horizontal scrolling, and obstacle spawning.

Rules remain data-driven event-condition-effect transitions. The executable rules catalogue also supplies collision, score-on-pass, bounds, and difficulty helpers. Definitions cannot contain JavaScript or arbitrary expressions.

Assets use executable resolvers for emoji, gradients, generated images, and stored images. Every provider-backed image has a local fallback so a game remains playable. Text uses named placeholders for welcome copy, instructions, score/timer labels, results, replay copy, and renderer-specific hints.

## Intent coverage

Validation checks both schema correctness and whether the selected modules preserve the creator's requested mechanics. Flappy-style, flying-obstacle, and side-scroller prompts must use `side_scroller.v1`, `impulse.v1`, gravity, and scrolling/spawning obstacles. A lane, card, or tappable-entity approximation is rejected and sent through the bounded repair pass.

## Versioning

New single-player generations use schema version 2. Existing schema-version-1 games remain supported by the legacy validator and runtime. Multiplayer generation is intentionally disabled until the V2 single-player contract is stable.
