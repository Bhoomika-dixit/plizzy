# Executable module catalogue

This directory is the runtime capability library used by GameDefinition V2. It has exactly six tool-aligned catalogues:

- `renderers`: visual game loops and layouts
- `interactions`: input-to-event handlers
- `entity-behaviours`: reusable physics and entity updates
- `rules`: collision, scoring, bounds, difficulty, and rule helpers
- `assets`: safe asset and background resolution
- `text`: named copy-slot interpolation

Each catalogue keeps its public `manifest.ts` separate from executable `runtime.ts` or renderer components. The design agent receives only the manifests through `manifests.ts`; it selects IDs and fills placeholders. Browser and server code use statically imported registries, so generated definitions never contain or execute arbitrary JavaScript.

Asset prompt flow: the generation policy is defined in `agent-harness/prompt.md`, the asset tool contract is in `agent-harness/tools/asset-generation-tool.ts`, and the agent writes the concrete per-asset prompt into `GameDefinitionV2.assets[].prompt`. `assets/runtime.ts` consumes that prompt for the executable local visual fallback. No separate external image-model request is currently made.

`side_scroller.v1` is a specialized executable renderer. Its module runs gravity, impulse input, obstacle spawning and scrolling, collision and bounds checks, score-on-pass, a timer, and progressive speed. It is selected only when its published capabilities satisfy the registered requirements.

To add a capability, implement the code in its matching folder, register it statically, publish only its configuration contract in the manifest, and extend composition validation and simulation for its required events.
