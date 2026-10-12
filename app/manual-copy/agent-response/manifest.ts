/** Contains only the game-specific data and assets supplied by an agent. */
import fishImage from "./assets/sprites/fish.jpg";
import type { GameManifest } from "../runtime/game-manifest";

export const manifest = {
  schemaVersion: 1,
  engine: "falling_tap",
  metadata: {
    id: "fish-tap",
    title: "Fish Tap",
    instructions: "Tap each fish before it reaches the ground.",
  },
  theme: {
    pageBackground: "#061426",
    arenaBackground: "linear-gradient(#0a3565, #062347)",
    groundColor: "#5a3714",
    accentColor: "#1570c7",
    textColor: "#eef6ff",
  },
  assets: {
    target: {
      src: fishImage,
      alt: "A tappable fish",
    },
  },
  rules: {
    roundDurationMs: 30_000,
    targetFallDurationMs: 10_000,
    targetSpawnIntervalMs: 850,
    pointsPerTarget: 1,
  },
} as const satisfies GameManifest;
