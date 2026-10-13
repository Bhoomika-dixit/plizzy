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

export type SudokuTwistManifest = {
  schemaVersion: 1;
  engine: "sudoku_twist";
  metadata: {
    id: string;
    title: string;
    instructions: string;
  };
  theme: {
    pageBackground: string;
    accentColor: string;
    textColor: string;
  };
  rules: {
    gridSize: 4;
    boxSize: 2;
    puzzle: Array<Array<number | null>>;
    twist: "both_diagonals_unique";
  };
};

export type GameManifest = FallingTapManifest | SudokuTwistManifest;
