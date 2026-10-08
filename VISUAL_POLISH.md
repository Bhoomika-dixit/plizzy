# Visual polish

Notion spec: https://app.notion.com/p/3f314b22fe4b816abe52eb976ddbea1e

This PR branches from main and is independent of the agent orchestration work.

Implemented: Baloo 2 for expressive headings/buttons/wordmark, Fredoka for body text, reusable visual tokens, press feedback, keyboard focus states, reduced-motion support.

Not implemented: Simply Thick (license and font availability pending), animated penguin assets, generation-progress integration, React Native-specific styling, full UI redesign.

Review: run npm install and npm run build; inspect onboarding/auth/create/profile at mobile widths; test keyboard focus, font fallback, reduced motion, text overflow and low-end Android smoothness.

## Added in follow-up
- Animated CSS purple-and-white penguin loader component (`app/components/penguin-loader.tsx`) wired to game-creation waiting state. It is intentionally **indeterminate** until the API exposes trustworthy stages. Includes reduced-motion styling and a status announcement.
- Full CSS consistency pass across global onboarding/auth/footer, shared header, game creation, and profile. This is a styling pass, not a redesign of business flows.
- Detailed licensing decision and acquisition steps in `docs/SIMPLY_THICK_LICENSE.md`. Font binary **not embedded** without authorization.

## Remaining validation
- Verify build/typecheck, lint, small-screen overflow and actual physical-device animation smoothness.
- The current synchronous generation endpoint does not expose stage progress. Do not fake percentages or stages; connect actual backend events in a later integration.
- Add approved Simply Thick font binary only after appropriate webfont/app licenses have been secured.
