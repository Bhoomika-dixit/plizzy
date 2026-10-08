# Visual polish

Notion spec: https://app.notion.com/p/3f314b22fe4b816abe52eb976ddbea1e

This PR branches from main and is independent of the agent orchestration work.

Implemented: Baloo 2 for expressive headings/buttons/wordmark, Fredoka for body text, reusable visual tokens, press feedback, keyboard focus states, reduced-motion support.

Not implemented: Simply Thick (license and font availability pending), animated penguin assets, generation-progress integration, React Native-specific styling, full UI redesign.

Review: run npm install and npm run build; inspect onboarding/auth/create/profile at mobile widths; test keyboard focus, font fallback, reduced motion, text overflow and low-end Android smoothness.
