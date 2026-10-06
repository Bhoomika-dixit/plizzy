import { GameDefinitionV1, GameEffect, Primitive } from "./game-definition";

export type RuntimeEntity = { id: string; x: number; y: number; visible: boolean };
export type RuntimeState = { values: Record<string, Primitive>; entities: Record<string, RuntimeEntity>; phaseId: string; secondsRemaining: number; timerRunning: boolean; status: "playing" | "finished"; seed: number; endReason?: string };
export type RuntimeResult = { state: RuntimeState; error?: string };

const clone = (state: RuntimeState): RuntimeState => ({ ...state, values: { ...state.values }, entities: Object.fromEntries(Object.entries(state.entities).map(([id, entity]) => [id, { ...entity }])) });
function nextRandom(seed: number) { const value = (seed * 1664525 + 1013904223) >>> 0; return { seed: value, unit: value / 4294967296 }; }
function trigger(definition: GameDefinitionV1, state: RuntimeState, event: "GAME_STARTED" | "ENTITY_TAPPED" | "TIMER_COMPLETED", entityId?: string) {
  let current = state;
  for (const rule of definition.rules) if (rule.trigger === event && (rule.entityId === undefined || rule.entityId === entityId)) for (const effect of rule.effects) current = applyEffect(definition, current, effect);
  return current;
}
function applyEffect(definition: GameDefinitionV1, state: RuntimeState, effect: GameEffect): RuntimeState {
  const next = clone(state);
  switch (effect.type) {
    case "SET_STATE": next.values[effect.key] = effect.value; break;
    case "INCREMENT_STATE": { const current = next.values[effect.key]; next.values[effect.key] = (typeof current === "number" ? current : 0) + effect.amount; break; }
    case "ADD_SCORE": { const key = effect.key ?? "score"; const current = next.values[key]; next.values[key] = (typeof current === "number" ? current : 0) + effect.amount; break; }
    case "MOVE_ENTITY": if (next.entities[effect.entityId]) Object.assign(next.entities[effect.entityId], { x: effect.x, y: effect.y, visible: true }); break;
    case "SPAWN_ENTITY": if (next.entities[effect.entityId]) Object.assign(next.entities[effect.entityId], { visible: true, ...(effect.x === undefined ? {} : { x: effect.x }), ...(effect.y === undefined ? {} : { y: effect.y }) }); break;
    case "DESPAWN_ENTITY": if (next.entities[effect.entityId]) next.entities[effect.entityId].visible = false; break;
    case "RESPAWN_ENTITY": if (next.entities[effect.entityId]) { const first = nextRandom(next.seed); const second = nextRandom(first.seed); next.seed = second.seed; Object.assign(next.entities[effect.entityId], { visible: true, x: 10 + first.unit * 80, y: 16 + second.unit * 66 }); } break;
    case "START_TIMER": next.secondsRemaining = effect.durationSeconds; next.timerRunning = true; break;
    case "STOP_TIMER": next.timerRunning = false; break;
    case "ADVANCE_PHASE": { const phase = definition.phases.find((item) => item.id === effect.phaseId); if (phase) { next.phaseId = phase.id; next.secondsRemaining = phase.durationSeconds; next.timerRunning = true; } break; }
    case "RANDOM_CHOICE": { const choice = nextRandom(next.seed); next.seed = choice.seed; next.values[effect.key] = effect.choices[Math.floor(choice.unit * effect.choices.length)]; break; }
    case "END_GAME": next.status = "finished"; next.timerRunning = false; next.endReason = effect.reason; break;
  }
  return next;
}

export function createRuntime(definition: GameDefinitionV1): RuntimeState {
  const firstPhase = definition.phases[0];
  const initial: RuntimeState = { values: { ...definition.state }, entities: Object.fromEntries(definition.entities.map((entity) => [entity.id, { id: entity.id, x: entity.position.x, y: entity.position.y, visible: true }])), phaseId: firstPhase.id, secondsRemaining: firstPhase.durationSeconds, timerRunning: true, status: "playing", seed: definition.config.seed };
  return trigger(definition, initial, "GAME_STARTED");
}

export function dispatchTap(definition: GameDefinitionV1, state: RuntimeState, entityId: string): RuntimeResult {
  if (state.status !== "playing" || !state.entities[entityId]?.visible) return { state, error: "That target is not available right now." };
  if (!definition.actions.some((action) => action.type === "TAP_ENTITY" && action.entityId === entityId)) return { state, error: "That action is not allowed in this game." };
  return { state: trigger(definition, state, "ENTITY_TAPPED", entityId) };
}

export function tickRuntime(definition: GameDefinitionV1, state: RuntimeState): RuntimeState {
  if (state.status !== "playing" || !state.timerRunning) return state;
  const next = clone(state); next.secondsRemaining = Math.max(0, next.secondsRemaining - 1);
  return next.secondsRemaining === 0 ? trigger(definition, next, "TIMER_COMPLETED") : next;
}
