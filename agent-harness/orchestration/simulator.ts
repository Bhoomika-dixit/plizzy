import type { GameDefinitionV1 } from "../game-definition";
import { createRuntime, dispatchTap, tickRuntime } from "../runtime";

/** Pure, bounded deterministic playtest. No generated code is evaluated. */
export function simulateGame(definition: GameDefinitionV1): { valid: boolean; errors: string[]; taps: number; ticks: number } {
  const errors: string[] = [];
  let taps = 0;
  let ticks = 0;
  try {
    let state = createRuntime(definition);
    if (state.status !== "playing") errors.push("Game finishes immediately.");
    const initialDuration = Math.min(600, definition.phases[0]?.durationSeconds ?? 0);
    for (let i = 0; i < Math.min(5, initialDuration) && state.status === "playing"; i++) {
      const target = definition.entities.find(entity => state.entities[entity.id]?.visible);
      if (target) {
        const result = dispatchTap(definition, state, target.id);
        if (result.error) errors.push(result.error);
        state = result.state;
        taps++;
      }
      state = tickRuntime(definition, state);
      ticks++;
    }
    for (let i = 0; i < 600 && state.status === "playing"; i++) {
      state = tickRuntime(definition, state);
      ticks++;
      if (!state.timerRunning) { errors.push("Timer stopped before game ended."); break; }
    }
    if (state.status !== "finished") errors.push("Game does not terminate within 600 ticks.");
    for (const value of Object.values(state.values)) {
      if (typeof value === "number" && !Number.isFinite(value)) errors.push("Simulation produced a non-finite number.");
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Simulation crashed.");
  }
  return { valid: errors.length === 0, errors, taps, ticks };
}
