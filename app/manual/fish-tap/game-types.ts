/** Declares the state and event contracts shared by the Fish Tap engine and renderer. */
export type GamePhase = "intro" | "playing" | "finished";

export type FishStatus = "falling" | "caught" | "missed";

export type FishEntity = {
  id: string;
  x: number;
  y: number;
  spawnedAt: number;
  status: FishStatus;
};

export type FishTapState = {
  phase: GamePhase;
  startedAt: number | null;
  lastSpawnedAt: number | null;
  timeLeftMs: number;
  score: number;
  caught: number;
  missed: number;
  fish: FishEntity[];
  nextFishId: number;
};

export type FishTapEvent =
  | { type: "START"; now: number }
  | { type: "FRAME"; now: number; arenaWidth: number }
  | { type: "TAP_FISH"; fishId: string; now: number }
  | { type: "REPLAY" };
