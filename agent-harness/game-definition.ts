export type GameMode = "single_player" | "multiplayer";

export type Primitive = string | number | boolean;
export type GameEntity = {
  id: string;
  type: "tappable";
  label: string;
  emoji: string;
  position: { x: number; y: number };
  size: number;
  motion?: "float" | "bob" | "fall" | "none";
};
export type GameEffect =
  | { type: "SET_STATE"; key: string; value: Primitive }
  | { type: "INCREMENT_STATE"; key: string; amount: number }
  | { type: "ADD_SCORE"; key?: string; amount: number }
  | { type: "MOVE_ENTITY"; entityId: string; x: number; y: number }
  | { type: "SPAWN_ENTITY"; entityId: string; x?: number; y?: number }
  | { type: "DESPAWN_ENTITY"; entityId: string }
  | { type: "RESPAWN_ENTITY"; entityId: string }
  | { type: "START_TIMER"; durationSeconds: number }
  | { type: "STOP_TIMER" }
  | { type: "ADVANCE_PHASE"; phaseId: string }
  | { type: "RANDOM_CHOICE"; key: string; choices: Primitive[] }
  | { type: "END_GAME"; reason?: string };
export type GameRule = {
  trigger: "GAME_STARTED" | "ENTITY_TAPPED" | "ACTION_SELECTED" | "TIMER_COMPLETED";
  entityId?: string;
  actionId?: string;
  effects: GameEffect[];
};
export type GameAction =
  | { id: string; type: "TAP_ENTITY"; entityId: string }
  | { id: string; type: "SELECT_OPTION"; label: string; emoji?: string };

export type GameDefinitionV1 = {
  schemaVersion: 1;
  metadata: { title: string; description: string; launchMode: GameMode };
  config: { mode: GameMode; estimatedDurationMinutes: number; maxPlayers: number; seed: number };
  state: Record<string, Primitive>;
  players: { min: number; max: number };
  entities: GameEntity[];
  scenes: Array<{ id: string; background: string; title?: string }>;
  actions: GameAction[];
  rules: GameRule[];
  phases: Array<{ id: string; label: string; durationSeconds: number }>;
  winConditions: Array<{ type: "HIGHEST_SCORE" | "TARGET_SCORE"; scoreKey?: string; target?: number }>;
  visuals: { backgroundColor: string; accentColor: string; textColor: string; cardColor: string };
};

const effectTypes = new Set<GameEffect["type"]>(["SET_STATE", "INCREMENT_STATE", "ADD_SCORE", "MOVE_ENTITY", "SPAWN_ENTITY", "DESPAWN_ENTITY", "RESPAWN_ENTITY", "START_TIMER", "STOP_TIMER", "ADVANCE_PHASE", "RANDOM_CHOICE", "END_GAME"]);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isPrimitive = (value: unknown): value is Primitive => ["string", "number", "boolean"].includes(typeof value);
const isId = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value);
const inBoard = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;

function validateEffect(effect: unknown, index: string, entityIds: Set<string>, phaseIds: Set<string>, errors: string[]) {
  if (!isRecord(effect) || typeof effect.type !== "string" || !effectTypes.has(effect.type as GameEffect["type"])) { errors.push(`${index} uses an unsupported primitive.`); return; }
  const requiresEntity = ["MOVE_ENTITY", "SPAWN_ENTITY", "DESPAWN_ENTITY", "RESPAWN_ENTITY"].includes(effect.type);
  if (requiresEntity && (!isId(effect.entityId) || !entityIds.has(effect.entityId))) errors.push(`${index} references an unknown entity.`);
  if (effect.type === "MOVE_ENTITY" && (!inBoard(effect.x) || !inBoard(effect.y))) errors.push(`${index} requires board positions from 0 to 100.`);
  if ((effect.type === "SET_STATE" && (!isId(effect.key) || !isPrimitive(effect.value))) || (effect.type === "INCREMENT_STATE" && (!isId(effect.key) || typeof effect.amount !== "number")) || (effect.type === "ADD_SCORE" && typeof effect.amount !== "number")) errors.push(`${index} has invalid state values.`);
  if (effect.type === "START_TIMER" && (!(typeof effect.durationSeconds === "number") || effect.durationSeconds < 1 || effect.durationSeconds > 600)) errors.push(`${index} requires a timer between 1 and 600 seconds.`);
  if (effect.type === "ADVANCE_PHASE" && (!isId(effect.phaseId) || !phaseIds.has(effect.phaseId))) errors.push(`${index} references an unknown phase.`);
  if (effect.type === "RANDOM_CHOICE" && (!isId(effect.key) || !Array.isArray(effect.choices) || effect.choices.length === 0 || !effect.choices.every(isPrimitive))) errors.push(`${index} requires a state key and non-empty primitive choices.`);
}

export function validateGameDefinition(value: unknown, mode: GameMode): { valid: true; value: GameDefinitionV1 } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) return { valid: false, errors: ["Definition must be a JSON object."] };
  if (value.schemaVersion !== 1) errors.push("schemaVersion must be 1.");
  const metadata = isRecord(value.metadata) ? value.metadata : undefined;
  const config = isRecord(value.config) ? value.config : undefined;
  const players = isRecord(value.players) ? value.players : undefined;
  const visuals = isRecord(value.visuals) ? value.visuals : undefined;
  if (!metadata || typeof metadata.title !== "string" || typeof metadata.description !== "string" || metadata.launchMode !== mode) errors.push("metadata must include title, description, and requested launchMode.");
  if (!config || config.mode !== mode || typeof config.estimatedDurationMinutes !== "number" || typeof config.maxPlayers !== "number" || typeof config.seed !== "number") errors.push("config must match the requested mode and include duration, players, and a numeric seed.");
  if (!players || typeof players.min !== "number" || typeof players.max !== "number" || players.min < 1 || players.max < players.min || (mode === "single_player" && (players.min !== 1 || players.max !== 1))) errors.push("players must be valid for the requested mode.");
  if (!isRecord(value.state) || !Object.entries(value.state).every(([key, stateValue]) => isId(key) && isPrimitive(stateValue))) errors.push("state must be an object of primitive values with safe keys.");
  if (!visuals || !["backgroundColor", "accentColor", "textColor", "cardColor"].every((key) => typeof visuals[key] === "string")) errors.push("visuals must provide the supported colour fields.");
  if (!Array.isArray(value.entities)) errors.push("entities must be an array.");
  const entities = Array.isArray(value.entities) ? value.entities : [];
  const entityIds = new Set<string>();
  entities.forEach((entity, index) => {
    if (!isRecord(entity) || !isId(entity.id) || entityIds.has(entity.id) || entity.type !== "tappable" || typeof entity.label !== "string" || typeof entity.emoji !== "string" || !isRecord(entity.position) || !inBoard(entity.position.x) || !inBoard(entity.position.y) || typeof entity.size !== "number" || entity.size < 24 || entity.size > 128 || (entity.motion !== undefined && entity.motion !== "float" && entity.motion !== "bob" && entity.motion !== "fall" && entity.motion !== "none")) errors.push(`entities[${index}] is not a supported tappable entity.`);
    else entityIds.add(entity.id);
  });
  if (!Array.isArray(value.scenes) || value.scenes.length === 0 || !value.scenes.every((scene) => isRecord(scene) && isId(scene.id) && typeof scene.background === "string")) errors.push("scenes must include at least one renderable scene.");
  if (!Array.isArray(value.phases) || value.phases.length === 0) errors.push("phases must include a timed playable phase.");
  const phases = Array.isArray(value.phases) ? value.phases : [];
  const phaseIds = new Set<string>();
  phases.forEach((phase, index) => { if (!isRecord(phase) || !isId(phase.id) || phaseIds.has(phase.id) || typeof phase.label !== "string" || typeof phase.durationSeconds !== "number" || phase.durationSeconds < 5 || phase.durationSeconds > 600) errors.push(`phases[${index}] is invalid.`); else phaseIds.add(phase.id); });
  const actions = Array.isArray(value.actions) ? value.actions : [];
  const actionIds = new Set<string>();
  actions.forEach((action, index) => {
    if (!isRecord(action) || !isId(action.id) || actionIds.has(action.id)) { errors.push(`actions[${index}] has an invalid id.`); return; }
    actionIds.add(action.id);
    if (action.type === "TAP_ENTITY" && isId(action.entityId) && entityIds.has(action.entityId)) return;
    if (action.type === "SELECT_OPTION" && typeof action.label === "string" && action.label.length > 0 && action.label.length <= 80 && (action.emoji === undefined || typeof action.emoji === "string")) return;
    errors.push(`actions[${index}] must be a supported tap or choice action.`);
  });
  if (!actions.length) errors.push("actions must contain at least one interaction.");
  if (!Array.isArray(value.rules) || value.rules.length === 0) errors.push("rules must contain declared event transitions.");
  let hasTimerEnd = false;
  (Array.isArray(value.rules) ? value.rules : []).forEach((rule, index) => {
    if (!isRecord(rule) || (rule.trigger !== "GAME_STARTED" && rule.trigger !== "ENTITY_TAPPED" && rule.trigger !== "ACTION_SELECTED" && rule.trigger !== "TIMER_COMPLETED") || (rule.entityId !== undefined && (!isId(rule.entityId) || !entityIds.has(rule.entityId))) || (rule.actionId !== undefined && (!isId(rule.actionId) || !actionIds.has(rule.actionId))) || (rule.trigger === "ENTITY_TAPPED" && !rule.entityId) || (rule.trigger === "ACTION_SELECTED" && !rule.actionId) || !Array.isArray(rule.effects) || rule.effects.length === 0) { errors.push(`rules[${index}] is invalid.`); return; }
    if (rule.trigger === "TIMER_COMPLETED" && rule.effects.some((effect) => isRecord(effect) && effect.type === "END_GAME")) hasTimerEnd = true;
    rule.effects.forEach((effect, effectIndex) => validateEffect(effect, `rules[${index}].effects[${effectIndex}]`, entityIds, phaseIds, errors));
  });
  if (!hasTimerEnd) errors.push("A timed single-player game must end with END_GAME on TIMER_COMPLETED.");
  if (!Array.isArray(value.winConditions) || value.winConditions.length === 0 || !value.winConditions.every((condition) => isRecord(condition) && (condition.type === "HIGHEST_SCORE" || condition.type === "TARGET_SCORE") && (condition.scoreKey === undefined || isId(condition.scoreKey)) && (condition.type !== "TARGET_SCORE" || typeof condition.target === "number"))) errors.push("winConditions must use a supported outcome.");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as GameDefinitionV1 };
}

export function parseModelJson(content: string): unknown {
  const source = content.trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? source;
  const first = fenced.indexOf("{"); const last = fenced.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("The model response did not contain a JSON object.");
  return JSON.parse(fenced.slice(first, last + 1));
}

export function gameRulesMarkdown(definition: GameDefinitionV1) {
  const duration = definition.phases[0]?.durationSeconds ?? 60;
  const targets = definition.entities.map((entity) => `${entity.emoji} ${entity.label}`).join(", ");
  const options = definition.actions.filter((action): action is Extract<GameAction, { type: "SELECT_OPTION" }> => action.type === "SELECT_OPTION").map((action) => `${action.emoji ?? ""} ${action.label}`.trim()).join(", ");
  const interaction = options ? `Choose from: ${options}.` : `Tap ${targets} to score points.`;
  return `# ${definition.metadata.title}\n\n${definition.metadata.description}\n\n## How to play\n\n${interaction} Finish before the ${duration}-second timer ends.\n\n## Win condition\n\nFinish with the best score you can.`;
}
