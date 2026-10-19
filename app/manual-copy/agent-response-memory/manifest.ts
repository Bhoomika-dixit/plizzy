/** Contains the Memory Match game's content and generated card-back asset. */
import cardBack from "./assets/memory-card-back.png";
import type { GameManifest } from "../runtime/game-manifest";

export const manifest = {
  schemaVersion: 1,
  engine: "memory_match",
  metadata: {
    id: "animal-memory-match",
    title: "Animal Memory",
    instructions: "Reveal two cards. Find every matching animal pair in as few moves as you can.",
  },
  theme: {
    pageBackground: "#172554",
    accentColor: "#f59e0b",
    textColor: "#f8fafc",
  },
  assets: { cardBack },
  rules: {
    pairs: [
      { id: "fox", symbol: "🦊", label: "Fox" },
      { id: "panda", symbol: "🐼", label: "Panda" },
      { id: "whale", symbol: "🐳", label: "Whale" },
      { id: "tiger", symbol: "🐯", label: "Tiger" },
      { id: "penguin", symbol: "🐧", label: "Penguin" },
      { id: "koala", symbol: "🐨", label: "Koala" },
    ],
    mismatchDelayMs: 850,
  },
} as const satisfies GameManifest;
