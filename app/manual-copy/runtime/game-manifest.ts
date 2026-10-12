/** Defines the safe, declarative contract that an agent may use to describe a game. */
import type { StaticImageData } from "next/image";

export type FallingTapManifest = {
  schemaVersion: 1;
  engine: "falling_tap";
  metadata: {
    id: string;
    title: string;
    instructions: string;
  };
  theme: {
    pageBackground: string;
    arenaBackground: string;
    groundColor: string;
    accentColor: string;
    textColor: string;
  };
  assets: {
    target: {
      src: StaticImageData;
      alt: string;
    };
  };
  rules: {
    roundDurationMs: number;
    targetFallDurationMs: number;
    targetSpawnIntervalMs: number;
    pointsPerTarget: number;
  };
};

export type GameManifest = FallingTapManifest;
