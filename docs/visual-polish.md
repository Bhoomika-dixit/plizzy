# Visual polish: bubbly UI direction

Source of truth: https://app.notion.com/p/3f314b22fe4b816abe52eb976ddbea1e

## Included in this PR
- Switch web UI to Baloo 2 headings/buttons and Fredoka body text.
- Introduce semantic purple, lavender, mint, typography, radius and motion tokens.
- Gentle button/card press feedback and keyboard focus indicators.
- Reduced-motion support.

## Deliberately deferred
- **Simply Thick** font: reference supplied by product owner, but commercial licensing and web/mobile embedding rights are not verified. Do not bundle or fetch unlicensed font assets. After clearance, load as a display-only font for celebrations/splash.
- Penguin animation and generation-stage loader: requires approved mascot assets and backend progress events. Do not fabricate percentages or stages.
- React Native native screens: this repository is currently a Next.js web/PWA app. Native-specific Reanimated changes belong in the native app repo once identified.
- Full UI/UX redesign and navigation changes are out of scope.

## QA
Run `npm ci && npm run lint && npm run build`. Visually inspect onboarding, auth, create-game, footer, gameplay and profile on narrow/mobile viewports. Verify font loading, long titles, focus, reduced motion, slow network, and browser fallback. No CI/test verification has been performed by this PR author.
