import { AssetKind, BehaviourId, InteractionId, RendererId, RuleEffectType, RuleEvent, RuleOperator, assetCatalog, behaviourCatalog, interactionCatalog, rendererCatalog, requiredTextSlots, ruleCatalog } from "./tools/catalog";

export type GameValue = string | number | boolean | null;
export type ValueSource =
  | { source: "literal"; value: GameValue }
  | { source: "state"; key: string }
  | { source: "event"; key: string }
  | { source: "entity_state"; entityId: string | "$event"; key: string };
export type GameCondition = { left: ValueSource; operator: RuleOperator; right?: ValueSource };
export type GameEffectV2 = {
  type: RuleEffectType;
  key?: string;
  value?: GameValue | ValueSource;
  amount?: number;
  entityId?: string | "$event";
  x?: number;
  y?: number;
  outcome?: "win" | "lose";
  reasonTextKey?: string;
  durationSeconds?: number;
};
export type GameRuleV2 = { id: string; trigger: { event: RuleEvent; entityId?: string; tag?: string }; conditions?: GameCondition[]; effects: GameEffectV2[] };
export type GameEntityV2 = {
  id: string;
  type: string;
  label: string;
  content: { kind: "emoji" | "text" | "asset"; value: string; backValue?: string };
  position?: { x: number; y: number };
  grid?: { row: number; column: number };
  size?: number;
  tags?: string[];
  state: Record<string, GameValue>;
  behaviours: Array<{ id: BehaviourId; config?: Record<string, GameValue> }>;
};
export type GameAssetV2 = { id: string; kind: AssetKind; role: "character" | "background" | "object" | "ui"; value?: string; prompt?: string; fallback: string; aspectRatio?: string };
export type GameInteractionV2 = { id: string; type: InteractionId; target: { entityIds?: string[]; tags?: string[] }; event: RuleEvent; config?: Record<string, GameValue> };
export type GameDefinitionV2 = {
  schemaVersion: 2;
  metadata: { title: string; description: string; genre: string; launchMode: "single_player" };
  config: { mode: "single_player"; estimatedDurationMinutes: number; seed: number };
  renderer: { id: RendererId; config: { rows?: number; columns?: number; lanes?: number; rings?: number; width?: number; height?: number; backgroundAssetId?: string; playerAssetId?: string; obstacleAssetId?: string; gravity?: number; impulse?: number; obstacleSpeed?: number; gapSize?: number; obstacleWidth?: number; spawnIntervalSeconds?: number; difficultyRate?: number } };
  state: Record<string, GameValue>;
  entities: GameEntityV2[];
  interactions: GameInteractionV2[];
  rules: GameRuleV2[];
  timer: { durationSeconds: number; startOnLoad: boolean } | null;
  outcomes: { win: { textKey: string }; lose?: { textKey: string } };
  assets: GameAssetV2[];
  texts: Record<string, string>;
  visuals: { backgroundColor: string; accentColor: string; textColor: string; cardColor: string };
};

const idPattern = /^[a-z][a-z0-9_]{0,63}$/;
const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isValue = (value: unknown): value is GameValue => value === null || ["string", "number", "boolean"].includes(typeof value);
const isId = (value: unknown): value is string => typeof value === "string" && idPattern.test(value);
const isHex = (value: unknown) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
const inRange = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

function validateValueSource(value: unknown, path: string, entityIds: Set<string>, stateKeys: Set<string>, errors: string[]) {
  if (!isObject(value) || !["literal", "state", "event", "entity_state"].includes(String(value.source))) { errors.push(`${path} is not a supported value source.`); return; }
  if (value.source === "literal" && !isValue(value.value)) errors.push(`${path}.value must be primitive.`);
  if (value.source === "state" && (typeof value.key !== "string" || !stateKeys.has(value.key))) errors.push(`${path} references unknown state.`);
  if (value.source === "event" && typeof value.key !== "string") errors.push(`${path}.key is required.`);
  if (value.source === "entity_state" && ((value.entityId !== "$event" && (typeof value.entityId !== "string" || !entityIds.has(value.entityId))) || typeof value.key !== "string")) errors.push(`${path} references invalid entity state.`);
}

export function validateGameDefinitionV2(value: unknown): { valid: true; value: GameDefinitionV2 } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObject(value)) return { valid: false, errors: ["Definition must be an object."] };
  if (value.schemaVersion !== 2) errors.push("schemaVersion must be 2.");
  const metadata = isObject(value.metadata) ? value.metadata : {};
  const config = isObject(value.config) ? value.config : {};
  if (typeof metadata.title !== "string" || typeof metadata.description !== "string" || typeof metadata.genre !== "string" || metadata.launchMode !== "single_player") errors.push("metadata must describe a single-player game.");
  if (config.mode !== "single_player" || !inRange(config.estimatedDurationMinutes, 1, 30) || typeof config.seed !== "number") errors.push("config must contain single_player mode, duration, and seed.");
  const renderer = isObject(value.renderer) ? value.renderer : {};
  if (typeof renderer.id !== "string" || !(renderer.id in rendererCatalog) || !isObject(renderer.config)) errors.push("renderer must use a catalog renderer and config object.");
  const rendererId = typeof renderer.id === "string" && renderer.id in rendererCatalog ? renderer.id as RendererId : null;
  const rendererConfig = isObject(renderer.config) ? renderer.config : {};
  if ((rendererId === "grid.v1" || rendererId === "card_grid.v1") && (!inRange(rendererConfig.rows, 2, rendererId === "grid.v1" ? 12 : 6) || !inRange(rendererConfig.columns, 2, rendererId === "grid.v1" ? 12 : 6))) errors.push("Grid renderer rows and columns are outside catalog limits.");
  if (rendererId === "lanes.v1" && !inRange(rendererConfig.lanes, 2, 6)) errors.push("Lane count must be between 2 and 6.");
  if (rendererId === "circles.v1" && rendererConfig.rings !== undefined && !inRange(rendererConfig.rings, 1, 3)) errors.push("Circle rings must be between 1 and 3.");
  if (rendererId === "side_scroller.v1") {
    if (!inRange(rendererConfig.gravity, 35, 120) || !inRange(rendererConfig.impulse, -60, -15) || !inRange(rendererConfig.obstacleSpeed, 12, 40) || !inRange(rendererConfig.gapSize, 22, 48) || !inRange(rendererConfig.obstacleWidth, 8, 18) || !inRange(rendererConfig.spawnIntervalSeconds, 1.1, 3) || !inRange(rendererConfig.difficultyRate, 0, .15)) errors.push("side_scroller.v1 requires all physics placeholders within catalog limits.");
    if (![rendererConfig.playerAssetId, rendererConfig.obstacleAssetId, rendererConfig.backgroundAssetId].every((item) => typeof item === "string")) errors.push("side_scroller.v1 requires player, obstacle, and background asset placeholders.");
  }
  const state = isObject(value.state) ? value.state : {};
  if (!Object.entries(state).every(([key, item]) => isId(key) && isValue(item))) errors.push("state must contain primitive values under safe keys.");
  if (typeof state.score !== "number") errors.push("state.score must be numeric.");
  const stateKeys = new Set(Object.keys(state));
  const entities = Array.isArray(value.entities) ? value.entities : [];
  if (!entities.length) errors.push("At least one entity is required.");
  const entityIds = new Set<string>(); const entityTags = new Set<string>();
  entities.forEach((entity, index) => {
    if (!isObject(entity) || !isId(entity.id) || entityIds.has(entity.id)) { errors.push(`entities[${index}] has an invalid or duplicate id.`); return; }
    entityIds.add(entity.id);
    if (typeof entity.type !== "string" || typeof entity.label !== "string" || !isObject(entity.content) || !["emoji", "text", "asset"].includes(String(entity.content.kind)) || typeof entity.content.value !== "string") errors.push(`entities[${index}] has invalid display content.`);
    if (!isObject(entity.state) || !Object.entries(entity.state).every(([key, item]) => isId(key) && isValue(item))) errors.push(`entities[${index}].state is invalid.`);
    if (!Array.isArray(entity.behaviours) || !entity.behaviours.every((item) => isObject(item) && typeof item.id === "string" && item.id in behaviourCatalog)) errors.push(`entities[${index}].behaviours is invalid.`);
    if (entity.position !== undefined && (!isObject(entity.position) || !inRange(entity.position.x, 0, 100) || !inRange(entity.position.y, 0, 100))) errors.push(`entities[${index}].position must be within the stage.`);
    if (entity.grid !== undefined && (!isObject(entity.grid) || !inRange(entity.grid.row, 1, 12) || !inRange(entity.grid.column, 1, 12))) errors.push(`entities[${index}].grid is invalid.`);
    if (entity.tags !== undefined && (!Array.isArray(entity.tags) || !entity.tags.every(isId))) errors.push(`entities[${index}].tags is invalid.`);
    if (Array.isArray(entity.tags)) entity.tags.forEach((tag) => { if (typeof tag === "string") entityTags.add(tag); });
  });
  const interactions = Array.isArray(value.interactions) ? value.interactions : [];
  if (!interactions.length) errors.push("At least one interaction is required.");
  const interactionIds = new Set<string>();
  interactions.forEach((interaction, index) => {
    if (!isObject(interaction) || !isId(interaction.id) || typeof interaction.type !== "string" || !(interaction.type in interactionCatalog) || !isObject(interaction.target) || interaction.event !== interactionCatalog[interaction.type as InteractionId].emits) errors.push(`interactions[${index}] is invalid or emits the wrong catalog event.`);
    else { if (interactionIds.has(interaction.id)) errors.push(`interactions[${index}] has a duplicate id.`); interactionIds.add(interaction.id); }
    if (isObject(interaction) && rendererId && typeof interaction.type === "string" && interaction.type in interactionCatalog && !rendererCatalog[rendererId].interactions.includes(interaction.type as never)) errors.push(`interactions[${index}] is incompatible with ${rendererId}.`);
    const target = isObject(interaction) && isObject(interaction.target) ? interaction.target : {};
    if (Array.isArray(target.entityIds) && !target.entityIds.every((id) => typeof id === "string" && entityIds.has(id))) errors.push(`interactions[${index}] references an unknown entity.`);
    if (Array.isArray(target.tags) && !target.tags.every((tag) => typeof tag === "string" && entityTags.has(tag))) errors.push(`interactions[${index}] references an unknown tag.`);
  });
  const rules = Array.isArray(value.rules) ? value.rules : [];
  if (!rules.length) errors.push("At least one rule is required.");
  const consumedEvents = new Set<string>(); const ruleIds = new Set<string>();
  let hasEnd = false;
  rules.forEach((rule, index) => {
    if (!isObject(rule) || !isId(rule.id) || !isObject(rule.trigger) || typeof rule.trigger.event !== "string" || !Array.isArray(rule.effects) || !rule.effects.length) { errors.push(`rules[${index}] is invalid.`); return; }
    if (!ruleCatalog.events.includes(rule.trigger.event as never)) errors.push(`rules[${index}] uses an unsupported event.`);
    if (ruleIds.has(rule.id)) errors.push(`rules[${index}] has a duplicate id.`); else ruleIds.add(rule.id);
    consumedEvents.add(String(rule.trigger.event));
    if (rule.trigger.entityId !== undefined && (typeof rule.trigger.entityId !== "string" || !entityIds.has(rule.trigger.entityId))) errors.push(`rules[${index}] references an unknown trigger entity.`);
    if (rule.trigger.tag !== undefined && (typeof rule.trigger.tag !== "string" || !entityTags.has(rule.trigger.tag))) errors.push(`rules[${index}] references an unknown trigger tag.`);
    if (Array.isArray(rule.conditions)) rule.conditions.forEach((condition, conditionIndex) => {
      if (!isObject(condition) || !isObject(condition.left) || typeof condition.operator !== "string" || !ruleCatalog.operators.includes(condition.operator as never)) { errors.push(`rules[${index}].conditions[${conditionIndex}] is invalid.`); return; }
      validateValueSource(condition.left, `rules[${index}].conditions[${conditionIndex}].left`, entityIds, stateKeys, errors);
      if (condition.right !== undefined) validateValueSource(condition.right, `rules[${index}].conditions[${conditionIndex}].right`, entityIds, stateKeys, errors);
    });
    rule.effects.forEach((effect, effectIndex) => {
      if (!isObject(effect) || typeof effect.type !== "string" || !ruleCatalog.effects.includes(effect.type as never)) { errors.push(`rules[${index}].effects[${effectIndex}] is invalid.`); return; }
      if (effect.type === "END_GAME") hasEnd = true;
      if (["SET_STATE", "INCREMENT_STATE", "ADD_SCORE"].includes(effect.type) && effect.key !== undefined && (typeof effect.key !== "string" || !stateKeys.has(effect.key))) errors.push(`rules[${index}].effects[${effectIndex}] references unknown state.`);
      if (["SET_ENTITY_STATE", "MOVE_ENTITY", "SHOW_ENTITY", "HIDE_ENTITY"].includes(effect.type) && effect.entityId !== "$event" && (typeof effect.entityId !== "string" || !entityIds.has(effect.entityId))) errors.push(`rules[${index}].effects[${effectIndex}] references unknown entity.`);
      if (["INCREMENT_STATE", "ADD_SCORE"].includes(effect.type) && typeof effect.amount !== "number") errors.push(`rules[${index}].effects[${effectIndex}] requires a numeric amount.`);
      if (effect.type === "SET_STATE" && (typeof effect.key !== "string" || effect.value === undefined)) errors.push(`rules[${index}].effects[${effectIndex}] requires key and value.`);
      if (effect.type === "SET_ENTITY_STATE" && (typeof effect.key !== "string" || effect.value === undefined)) errors.push(`rules[${index}].effects[${effectIndex}] requires entity key and value.`);
      if ((effect.type === "SET_STATE" || effect.type === "SET_ENTITY_STATE") && isObject(effect.value) && "source" in effect.value) validateValueSource(effect.value, `rules[${index}].effects[${effectIndex}].value`, entityIds, stateKeys, errors);
      if (effect.type === "START_TIMER" && !inRange(effect.durationSeconds, 5, 1800)) errors.push(`rules[${index}].effects[${effectIndex}] requires a valid duration.`);
      if (effect.type === "END_GAME" && !["win", "lose"].includes(String(effect.outcome))) errors.push(`rules[${index}].effects[${effectIndex}] requires a win or lose outcome.`);
    });
  });
  interactions.forEach((interaction, index) => { if (isObject(interaction) && typeof interaction.event === "string" && !consumedEvents.has(interaction.event)) errors.push(`interactions[${index}] emits ${interaction.event}, but no rule consumes it.`); });
  if (rendererId === "side_scroller.v1") {
    if (!interactions.some((interaction) => isObject(interaction) && interaction.type === "impulse.v1")) errors.push("side_scroller.v1 requires impulse.v1 interaction.");
    if (!entities.some((entity) => isObject(entity) && Array.isArray(entity.tags) && entity.tags.includes("player") && Array.isArray(entity.behaviours) && entity.behaviours.some((behaviour) => isObject(behaviour) && behaviour.id === "gravity.v1"))) errors.push("side_scroller.v1 requires a player entity with gravity.v1.");
    if (!entities.some((entity) => isObject(entity) && Array.isArray(entity.tags) && entity.tags.includes("obstacle") && Array.isArray(entity.behaviours) && entity.behaviours.some((behaviour) => isObject(behaviour) && behaviour.id === "horizontal_scroll.v1") && entity.behaviours.some((behaviour) => isObject(behaviour) && behaviour.id === "obstacle_spawner.v1"))) errors.push("side_scroller.v1 requires an obstacle entity with scrolling and spawning behaviours.");
    for (const event of ["IMPULSE", "COLLISION_DETECTED", "OBSTACLE_PASSED", "PLAYER_OUT_OF_BOUNDS"]) if (!consumedEvents.has(event)) errors.push(`side_scroller.v1 rules must handle ${event}.`);
  }
  if (!hasEnd) errors.push("At least one reachable rule must contain END_GAME.");
  const timer = value.timer;
  if (timer !== null && (!isObject(timer) || !inRange(timer.durationSeconds, 5, 1800) || typeof timer.startOnLoad !== "boolean")) errors.push("timer must be null or a valid timer configuration.");
  if (isObject(timer) && !consumedEvents.has("TIMER_COMPLETED")) errors.push("Timed games must handle TIMER_COMPLETED.");
  const texts = isObject(value.texts) ? value.texts : {};
  if (!Object.values(texts).every((item) => typeof item === "string" && item.length <= 500)) errors.push("All text slots must be strings no longer than 500 characters.");
  requiredTextSlots.forEach((slot) => { if (typeof texts[slot] !== "string" || !String(texts[slot]).trim()) errors.push(`texts must include ${slot}.`); });
  const outcomes = isObject(value.outcomes) ? value.outcomes : {};
  const win = isObject(outcomes.win) ? outcomes.win : {};
  const lose = isObject(outcomes.lose) ? outcomes.lose : null;
  if (typeof win.textKey !== "string" || typeof texts[win.textKey] !== "string") errors.push("outcomes.win must reference a text slot.");
  if (lose && (typeof lose.textKey !== "string" || typeof texts[lose.textKey] !== "string")) errors.push("outcomes.lose must reference a text slot.");
  rules.forEach((rule, ruleIndex) => { if (isObject(rule) && Array.isArray(rule.effects)) rule.effects.forEach((effect, effectIndex) => { if (isObject(effect) && effect.type === "END_GAME" && (typeof effect.reasonTextKey !== "string" || typeof texts[effect.reasonTextKey] !== "string")) errors.push(`rules[${ruleIndex}].effects[${effectIndex}] must reference result text.`); }); });
  const assets = Array.isArray(value.assets) ? value.assets : [];
  if (!Array.isArray(value.assets)) errors.push("assets must be an array.");
  const assetIds = new Set<string>();
  assets.forEach((asset, index) => {
    if (!isObject(asset) || !isId(asset.id) || assetIds.has(asset.id) || typeof asset.kind !== "string" || !(asset.kind in assetCatalog) || !["character", "background", "object", "ui"].includes(String(asset.role)) || typeof asset.fallback !== "string") { errors.push(`assets[${index}] is invalid.`); return; }
    assetIds.add(asset.id);
    if (asset.kind === "generated_image" && typeof asset.prompt !== "string") errors.push(`assets[${index}] requires a generation prompt.`);
    if ((asset.kind === "emoji" || asset.kind === "gradient" || asset.kind === "stored_image") && typeof asset.value !== "string") errors.push(`assets[${index}] requires a value.`);
  });
  if (typeof rendererConfig.backgroundAssetId === "string" && !assetIds.has(rendererConfig.backgroundAssetId)) errors.push("renderer backgroundAssetId references an unknown asset.");
  entities.forEach((entity, index) => { if (isObject(entity) && isObject(entity.content) && entity.content.kind === "asset" && (typeof entity.content.value !== "string" || !assetIds.has(entity.content.value))) errors.push(`entities[${index}] references an unknown asset.`); });
  const visuals = isObject(value.visuals) ? value.visuals : {};
  if (![visuals.backgroundColor, visuals.accentColor, visuals.textColor, visuals.cardColor].every(isHex)) errors.push("visuals must contain four six-digit hex colours.");
  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as GameDefinitionV2 };
}

export function parseGameDefinitionV2(content: string) {
  const source = content.trim();
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? source;
  const first = fenced.indexOf("{");
  const last = fenced.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("The agent did not return a JSON game definition.");
  return JSON.parse(fenced.slice(first, last + 1)) as unknown;
}

export function gameRulesMarkdownV2(definition: GameDefinitionV2) {
  return `# ${definition.metadata.title}\n\n${definition.metadata.description}\n\n## How to play\n\n${definition.texts["welcome.instructions"]}\n\n## Outcome\n\n${definition.texts["result.winTitle"]}`;
}
