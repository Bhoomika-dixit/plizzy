# Plizzy agent harness

This folder owns the Plizzy GameDefinition contract, deterministic runtime, model prompting, Anthropic requests, validation, bounded repair, and Langfuse workflow observations. Only the pure definition and runtime modules are imported by the client; provider access, observability, and orchestration remain server-only. Next.js routes in `app/api` authenticate requests and persist accepted output.

If Anthropic reports that an organisation-level API key is not scoped to a workspace, set `ANTHROPIC_WORKSPACE_ID` on the server. A workspace-scoped key does not need this variable.
