export type GameMode = "single_player" | "multiplayer";

export type GameDefinitionV1 = {
  schemaVersion: 1;
  metadata: { title: string; description: string; launchMode: GameMode };
  config: { mode: GameMode; estimatedDurationMinutes: number; maxPlayers: number };
  state: Record<string, unknown>;
  players: { min: number; max: number };
  entities: Array<Record<string, unknown>>;
  scenes: Array<Record<string, unknown>>;
  actions: Array<{ id: string; type: string; [key: string]: unknown }>;
  rules: Array<{ trigger: string; effects: Array<{ type: string; [key: string]: unknown }> }>;
  phases: Array<Record<string, unknown>>;
  winConditions: Array<Record<string, unknown>>;
  visuals: Record<string, unknown>;
};

const allowedEffects = new Set(["SET_STATE", "INCREMENT_STATE", "ADD_SCORE", "MOVE_ENTITY", "SPAWN_ENTITY", "DESPAWN_ENTITY", "RESPAWN_ENTITY", "START_TIMER", "STOP_TIMER", "ADVANCE_PHASE", "RANDOM_CHOICE", "END_GAME"]);

export function validateGameDefinition(value: unknown, mode: GameMode): { valid: true; value: GameDefinitionV1 } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, errors: ["Definition must be a JSON object."] };
  const definition = value as Record<string, unknown>;
  if (definition.schemaVersion !== 1) errors.push("schemaVersion must be 1.");
  const metadata = definition.metadata as Record<string, unknown> | undefined;
  const config = definition.config as Record<string, unknown> | undefined;
  const players = definition.players as Record<string, unknown> | undefined;
  if (!metadata || typeof metadata.title !== "string" || typeof metadata.description !== "string") errors.push("metadata must include title and description strings.");
  if (!config || config.mode !== mode || typeof config.estimatedDurationMinutes !== "number" || typeof config.maxPlayers !== "number") errors.push("config must match the requested mode and include duration and maxPlayers.");
  if (!players || typeof players.min !== "number" || typeof players.max !== "number") errors.push("players must include numeric min and max.");
  for (const key of ["state", "visuals"]) if (!definition[key] || typeof definition[key] !== "object" || Array.isArray(definition[key])) errors.push(`${key} must be an object.`);
  for (const key of ["entities", "scenes", "actions", "rules", "phases", "winConditions"]) if (!Array.isArray(definition[key])) errors.push(`${key} must be an array.`);
  if (Array.isArray(definition.rules)) definition.rules.forEach((rule, index) => { const effects = (rule as { effects?: unknown }).effects; if (!Array.isArray(effects)) { errors.push(`rules[${index}].effects must be an array.`); return; } effects.forEach((effect, effectIndex) => { const type = (effect as { type?: unknown }).type; if (typeof type !== "string" || !allowedEffects.has(type)) errors.push(`rules[${index}].effects[${effectIndex}] uses an unsupported primitive.`); }); });
  return errors.length ? { valid: false, errors } : { valid: true, value: definition as GameDefinitionV1 };
}

export function parseModelJson(content: string): unknown {
  const source = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  return JSON.parse(source);
}
