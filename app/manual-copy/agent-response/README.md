# Agent response contract

This folder is fully replaceable. For a supported engine, an agent supplies `manifest.ts` and any local files under `assets/`.

`manifest.ts` must named-export `manifest`, which must satisfy `GameManifest`: a supported `engine`, game metadata, theme tokens, asset references, and engine-specific rules. It must not include a renderer, animation loop, state reducer, or route code.

The stable runtime lives in `../runtime`; the stable route is `../play/page.tsx`.
