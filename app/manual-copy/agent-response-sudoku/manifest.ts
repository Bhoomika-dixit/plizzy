/** Contains only the game-specific configuration supplied for the Sudoku Twist game. */
import type { GameManifest } from "../runtime/game-manifest";

export const manifest = {
  schemaVersion: 1,
  engine: "sudoku_twist",
  metadata: {
    id: "diagonal-sudoku",
    title: "Sudoku Twist",
    instructions: "Fill each row, column, 2×2 box, and both purple diagonals with 1–4 exactly once.",
  },
  theme: {
    pageBackground: "#17112a",
    accentColor: "#8b5cf6",
    textColor: "#f7f3ff",
  },
  rules: {
    gridSize: 4,
    boxSize: 2,
    puzzle: [
      [3, null, 1, null],
      [null, 2, null, 4],
      [2, null, 4, null],
      [null, 3, null, 1],
    ],
    twist: "both_diagonals_unique",
  },
} as const satisfies GameManifest;
