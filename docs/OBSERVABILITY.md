# Langfuse observability

Plizzy exports a deliberately small observation tree through the Langfuse OpenTelemetry processor configured in `instrumentation.node.ts`. Tracing is enabled only when both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are configured.

## Generation hierarchy

Every generation creates one root observation:

- `plizzy.game_generation` with type `chain`

The chain contains one agent observation, and the catalogue tool calls are nested inside that agent:

- `plizzy.game_designer` with type `agent`

Every Anthropic turn is also recorded beneath the agent as `plizzy.game_design_model` with type `generation`. Each generation contains its model, input/output, latency, exclusive token buckets, and USD cost details. Langfuse therefore exposes per-call cost and automatically aggregates total cost for the complete trace.

- `plizzy.tool.render_identification_tool`
- `plizzy.tool.interaction_handler_tool`
- `plizzy.tool.entity_behaviour_tool`
- `plizzy.tool.rules_execution_tool`
- `plizzy.tool.asset_generation_tool`
- `plizzy.tool.text_generation_tool`

Each tool observation records its input, normalized output or validation errors, latency, call ID, turn, and success state.

The agent output includes a `totalUsageAndCost` section with total input, output, cache-read, cache-write, and overall tokens plus total USD cost. Prompt loading, orchestration decisions, validation, simulation, and persistence remain summaries rather than separate observations or events.

Gameplay telemetry has been removed. Playing a game no longer sends requests to a telemetry endpoint and no longer creates Langfuse event rows.

Existing historical observations already stored by Langfuse are not modified by this code change.

## Environment

Required variables:

- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_BASE_URL` (optional; defaults to Langfuse Cloud)
- `LANGFUSE_ENVIRONMENT` (optional)

`exportMode: "immediate"` is used so serverless requests export the completed chain and tool calls without waiting for a later batch flush.
