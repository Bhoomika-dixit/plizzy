# Simply Thick font licensing decision

Reference supplied by product owner: an inflated, squishy, bubbly Simply Thick type specimen.

**Do not commit or distribute Simply Thick font binaries until the correct license is purchased and archived.** Different vendors list fonts with the same name and potentially different creators. Confirm the exact font that matches the reference.

Potential source: https://creativemarket.com/ariodsgn/91980007-Simply-Thick-Bubble-Playful-Font

Creative Market lists **separate Desktop, Webfont, and App licenses** for that product. A desktop/commercial use license does not automatically authorize embedding in a website/PWA or mobile application. Confirm coverage of production domains, monthly pageviews, app distribution, seat counts, and whether a webfont may be self-hosted. Record receipt/license ID privately, not in this public repository.

A similarly named product is also listed by another designer at https://www.creativefabrica.com/product/simply-thick/ ; **do not conflate these products or their licenses**.

After approval:
1. Place an authorized webfont at `public/fonts/simply-thick.woff2` if the license permits repository distribution, or load through an approved private/CDN workflow.
2. Define `@font-face { font-family: "Simply Thick"; src: url("/fonts/simply-thick.woff2") format("woff2"); font-display: swap; }`.
3. Apply it to large celebratory/display-only text; keep Baloo 2 for UI headings and Fredoka for body.
4. Confirm the separate app embedding rights before shipping Android React Native binaries.
5. Check glyph coverage, font fallback, rendering, and actual brand specimen match.

Until then, the code intentionally uses Baloo 2 as the licensed-friendly visual fallback.
