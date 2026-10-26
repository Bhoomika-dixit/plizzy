# Plizzy agent harness

## Requirements-first tool flow

The game designer exposes only `requirements_tool` during its first phase. That tool validates and freezes a versioned requirements contract derived from the creator prompt. Its six requirement sections map directly to the six implementation tools.

After registration, each implementation tool must receive a `requirement` binding containing the contract ID, version, and every requirement ID assigned to that tool. Calls with missing, foreign, or stale requirement IDs are rejected. The accepted contract is saved in `game_versions.generation_metadata.requirements` and recorded in the Langfuse tool chain.

Every tool owns an explicit skill contract under `agent-harness/tools/skills`. The skill is included in that tool's model-facing description and defines its responsibility and boundaries.

This folder owns Plizzy's versioned GameDefinition contracts, deterministic runtimes, model orchestration, validation, bounded repair, reachability simulation, and Langfuse observations.

## V2 creation flow

`prompt.md` is the complete agent prompt. The agent receives public capability manifests projected from the six executable folders in `../catalogue`; it never reads implementation source. It must successfully call all six typed tools in `tools/` before it may assemble a `GameDefinitionV2`.

The V2 definition is validated as a complete composition, checked against the creator's mechanical intent, and tested for a reachable end state. Playback invokes only statically registered catalogue modules. Provider credentials, prompt loading, tool orchestration, and observability remain server-only.

Generation is represented in Langfuse as one chain containing catalogue tool calls. Other workflow details are summarized on the chain, and gameplay events are not emitted. See `docs/OBSERVABILITY.md`.

## Compatibility

New single-player games use V2. The player still validates and executes existing V1 tap games through the legacy runtime. Multiplayer generation is intentionally paused until the single-player capability model is stable.

If Anthropic reports that an organisation-level API key is not scoped to a workspace, set `ANTHROPIC_WORKSPACE_ID` on the server. A workspace-scoped key does not need this variable.
