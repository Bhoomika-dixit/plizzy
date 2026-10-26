import { GameCondition, GameDefinitionV2, GameEffectV2, GameEntityV2, GameValue, ValueSource } from "./game-definition-v2";

export type GameEventV2 = { type: string; entityId?: string; targetEntityId?: string; text?: string; direction?: string; [key: string]: GameValue | undefined };
export type RuntimeEntityV2 = { id: string; x: number; y: number; visible: boolean; state: Record<string, GameValue> };
export type RuntimeStateV2 = {
  values: Record<string, GameValue>;
  entities: Record<string, RuntimeEntityV2>;
  selectedEntityIds: string[];
  secondsRemaining: number;
  timerRunning: boolean;
  status: "playing" | "finished";
  outcome?: "win" | "lose";
  resultTextKey?: string;
  seed: number;
};

const clone = (state: RuntimeStateV2): RuntimeStateV2 => ({ ...state, values: { ...state.values }, selectedEntityIds: [...state.selectedEntityIds], entities: Object.fromEntries(Object.entries(state.entities).map(([id, entity]) => [id, { ...entity, state: { ...entity.state } }])) });
function random(seed: number) { const next = (seed * 1664525 + 1013904223) >>> 0; return { seed: next, unit: next / 4294967296 }; }
function entityFor(definition: GameDefinitionV2, id?: string) { return definition.entities.find((entity) => entity.id === id); }

function valueOf(source: ValueSource, state: RuntimeStateV2, event: GameEventV2): GameValue {
  if (source.source === "literal") return source.value;
  if (source.source === "state") return state.values[source.key] ?? null;
  if (source.source === "event") return event[source.key] ?? null;
  const entityId = source.entityId === "$event" ? event.entityId : source.entityId;
  return entityId ? state.entities[entityId]?.state[source.key] ?? null : null;
}

function conditionPasses(condition: GameCondition, state: RuntimeStateV2, event: GameEventV2) {
  const left = valueOf(condition.left, state, event);
  const right = condition.right ? valueOf(condition.right, state, event) : null;
  switch (condition.operator) {
    case "eq": return left === right;
    case "neq": return left !== right;
    case "gt": return typeof left === "number" && typeof right === "number" && left > right;
    case "gte": return typeof left === "number" && typeof right === "number" && left >= right;
    case "lt": return typeof left === "number" && typeof right === "number" && left < right;
    case "lte": return typeof left === "number" && typeof right === "number" && left <= right;
    case "truthy": return Boolean(left);
    case "falsy": return !left;
    case "includes": return typeof left === "string" && typeof right === "string" && left.toLocaleLowerCase().includes(right.toLocaleLowerCase());
  }
}

function effectValue(effect: GameEffectV2, state: RuntimeStateV2, event: GameEventV2): GameValue {
  if (isValueSource(effect.value)) return valueOf(effect.value, state, event);
  return effect.value ?? null;
}
function isValueSource(value: unknown): value is ValueSource { return value !== null && typeof value === "object" && "source" in value; }

function applyEffect(state: RuntimeStateV2, event: GameEventV2, effect: GameEffectV2) {
  const next = clone(state);
  const entityId = effect.entityId === "$event" ? event.entityId : effect.entityId;
  switch (effect.type) {
    case "SET_STATE": if (effect.key) next.values[effect.key] = effectValue(effect, next, event); break;
    case "INCREMENT_STATE": if (effect.key) next.values[effect.key] = (typeof next.values[effect.key] === "number" ? next.values[effect.key] as number : 0) + (effect.amount ?? 1); break;
    case "ADD_SCORE": { const key = effect.key ?? "score"; next.values[key] = (typeof next.values[key] === "number" ? next.values[key] as number : 0) + (effect.amount ?? 1); break; }
    case "SET_ENTITY_STATE": if (entityId && effect.key && next.entities[entityId]) next.entities[entityId].state[effect.key] = effectValue(effect, next, event); break;
    case "MOVE_ENTITY": if (entityId && next.entities[entityId]) {
      let x = effect.x; let y = effect.y;
      if (x === undefined || y === undefined) { const first = random(next.seed); const second = random(first.seed); next.seed = second.seed; x ??= 8 + first.unit * 84; y ??= 12 + second.unit * 76; }
      next.entities[entityId].x = x; next.entities[entityId].y = y;
      break;
    }
    case "SHOW_ENTITY": if (entityId && next.entities[entityId]) next.entities[entityId].visible = true; break;
    case "HIDE_ENTITY": if (entityId && next.entities[entityId]) next.entities[entityId].visible = false; break;
    case "CLEAR_SELECTION": next.selectedEntityIds = []; break;
    case "START_TIMER": next.secondsRemaining = effect.durationSeconds ?? next.secondsRemaining; next.timerRunning = true; break;
    case "STOP_TIMER": next.timerRunning = false; break;
    case "END_GAME": next.status = "finished"; next.timerRunning = false; next.outcome = effect.outcome ?? "win"; next.resultTextKey = effect.reasonTextKey; break;
  }
  return next;
}

function matchesEntity(definition: GameDefinitionV2, event: GameEventV2, entityId?: string, tag?: string) {
  if (entityId && event.entityId !== entityId) return false;
  if (tag && !entityFor(definition, event.entityId)?.tags?.includes(tag)) return false;
  return true;
}

function runEvent(definition: GameDefinitionV2, state: RuntimeStateV2, event: GameEventV2, allowStateEvent = true): RuntimeStateV2 {
  let current = state;
  let stateChanged = false;
  for (const rule of definition.rules) {
    if (rule.trigger.event !== event.type || !matchesEntity(definition, event, rule.trigger.entityId, rule.trigger.tag) || !rule.conditions?.every((condition) => conditionPasses(condition, current, event)) && Boolean(rule.conditions?.length)) continue;
    for (const effect of rule.effects) {
      current = applyEffect(current, event, effect);
      if (["SET_STATE", "INCREMENT_STATE", "ADD_SCORE", "SET_ENTITY_STATE"].includes(effect.type)) stateChanged = true;
    }
  }
  return stateChanged && allowStateEvent && event.type !== "STATE_CHANGED" && current.status === "playing" ? runEvent(definition, current, { type: "STATE_CHANGED", entityId: event.entityId }, false) : current;
}

export function createRuntimeV2(definition: GameDefinitionV2): RuntimeStateV2 {
  const initial: RuntimeStateV2 = {
    values: { ...definition.state },
    entities: Object.fromEntries(definition.entities.map((entity) => [entity.id, { id: entity.id, x: entity.position?.x ?? 50, y: entity.position?.y ?? 50, visible: entity.state.visible !== false, state: { ...entity.state } }])),
    selectedEntityIds: [],
    secondsRemaining: definition.timer?.durationSeconds ?? 0,
    timerRunning: Boolean(definition.timer?.startOnLoad),
    status: "playing",
    seed: definition.config.seed,
  };
  return runEvent(definition, initial, { type: "GAME_STARTED" });
}

export function dispatchGameEventV2(definition: GameDefinitionV2, state: RuntimeStateV2, event: GameEventV2) {
  if (state.status !== "playing") return state;
  let prepared = state;
  if (event.type === "ENTITY_SELECTED" && event.entityId) {
    prepared = clone(state);
    prepared.selectedEntityIds = prepared.selectedEntityIds.includes(event.entityId) ? prepared.selectedEntityIds.filter((id) => id !== event.entityId) : [...prepared.selectedEntityIds, event.entityId];
    event.selectedCount = prepared.selectedEntityIds.length;
  }
  return runEvent(definition, prepared, event);
}

export function tickRuntimeV2(definition: GameDefinitionV2, state: RuntimeStateV2) {
  if (state.status !== "playing" || !state.timerRunning) return state;
  const next = clone(state);
  next.secondsRemaining = Math.max(0, next.secondsRemaining - 1);
  const ticked = runEvent(definition, next, { type: "TIMER_TICK", secondsRemaining: next.secondsRemaining });
  return ticked.secondsRemaining === 0 && ticked.status === "playing" ? runEvent(definition, ticked, { type: "TIMER_COMPLETED", secondsRemaining: 0 }) : ticked;
}

export function entityDisplay(entity: GameEntityV2, runtime: RuntimeEntityV2) {
  if (entity.behaviours.some((item) => item.id === "flip.v1") && runtime.state.faceUp === false) return entity.content.backValue ?? "?";
  if (entity.behaviours.some((item) => item.id === "reveal.v1") && runtime.state.revealed === false) return entity.content.backValue ?? "?";
  return entity.content.value;
}
