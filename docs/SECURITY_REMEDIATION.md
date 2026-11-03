# Security remediation — 3 November 2026

## Publishing permissions

Apply `supabase/migrations/20261103153106_restrict_game_publishing.sql` after the existing app schema in every environment. The legacy `publish_generated_game` RPC now uses SECURITY INVOKER with an empty search path. EXECUTE is revoked from PUBLIC, anon, and authenticated; only the server's service_role retains access (in addition to the database owner). Its creator parameter is server-only. The current generation API does not call this RPC: it validates the session with Supabase `getUser()` and persists that verified user's ID, ignoring submitted ownership fields.

The connected development project has this migration applied. Live REST tests denied anonymous and authenticated publishing with both own and forged creator IDs, created no records on denial, and confirmed service-role publishing still works. The Supabase advisor no longer flags this function. `tests/publishing-security-smoke.cjs` reproduces the check with disposable fixtures and no email or AI calls.

## Dependencies

Next.js and eslint-config-next are pinned to 16.4.4, beyond the patched 16.4.1 release for [GHSA-673q-mjm6-r5xr](https://github.com/advisories/GHSA-673q-mjm6-r5xr). The lockfile also updates compatible transitive dependencies. `npm audit --omit=dev` reports zero vulnerabilities; the production build and static checks pass.

The full development-tree audit still reports 16 moderate affected package entries, all rooted in [minimatch globparts amplification, GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249). The only patched major is 11.0.1; current ESLint and its plugins still depend on older majors, including the callable CommonJS v3 API. A blanket override would break those callers, and npm's suggested forced downgrade to ESLint 4 is unsuitable for the current configuration. These packages process repository lint patterns, not player-supplied generation prompts, and are excluded from the production dependency tree. Keep lint inputs trusted and revisit this advisory when compatible upstream releases are available. No advisory was suppressed and no lint rule was removed to hide it.

## SVG covers

`agent-harness/cover-svg.ts` escapes every generated text value and interpolated attribute. Titles are truncated by Unicode character before XML escaping, avoiding partial entities or surrogate pairs. Asset URLs are replaced with a fixed decorative character. Regression tests cover script/image tag breakouts, XML special characters, attribute injection, Unicode, and the actual API storage-upload path with mocked AI and persistence.

All 12 existing private cover objects were downloaded and parsed locally with DTD resolution prohibited. Their elements and attributes passed the SVG safety inspection; none required replacement.

## Verification

```powershell
node --test tests/auth.test.cjs tests/multiplayer.test.cjs tests/generation-limit.test.cjs tests/cover-svg.test.cjs tests/generation-security.test.cjs
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js app/api/generate-game/route.ts agent-harness/cover-svg.ts app/create-game/game-creator.tsx
node node_modules/next/dist/bin/next build --webpack
npm audit --omit=dev
node tests/secret-audit.cjs
# Optional live fixture test (requires ignored server-only environment configuration):
node --env-file=.env tests/publishing-security-smoke.cjs
```

These changes address the three reported findings and the separate daily generation quota. They are not a claim that the whole application is free of vulnerabilities; other Supabase advisor notices and the development-only dependency advisory still need assessment before production rollout.
