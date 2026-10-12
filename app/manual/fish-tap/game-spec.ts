/** Defines the fixed rules, timing, scoring, and asset references for Fish Tap. */
export const fishTapGameSpec = {
    id: "fish-tap",
    title: "Fish Tap",
    arena: {
      width: 720,
      height: 420,
      groundHeight: 36,
    },
    round: {
      durationMs: 30_000,
      fishFallDurationMs: 10_000,
      spawnIntervalMs: 850,
    },
    scoring: {
      pointsPerFish: 1,
    },
    assets: {
        fishAssetId: "fish",
    },
  } as const;
