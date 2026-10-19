/**
 * Public tool contracts and private orchestration for composing a game from
 * primitives. Template source code is never included in the model prompt.
 */
import { parseModelJson } from "./game-definition";
import { GameCompositionTrace } from "./observability";

export type RenderSurface = "arena" | "grid" | "cards" | "circles";
export type Interaction = "tap" | "drag" | "select" | "swipe" | "type" | "draw";
export type Behaviour = "spawn" | "fall" | "move" | "flip" | "rotate" | "reveal";
export type TemplateId = "falling_tap" | "sudoku_twist" | "memory_match";

export type ComposerToolCall = {
  tool: "render_identification_tool" | "interaction_handler_tool" | "entity_behaviour_tool" | "rules_execution_tool" | "asset_generation_tool" | "text_generation_tool";
  input: Record<string, unknown>;
};

export type GameRecipe = {
  schemaVersion: 1;
  templateId: TemplateId;
  render: { surface: RenderSurface };
  interactions: Interaction[];
  behaviours: Behaviour[];
  rules: Record<string, unknown>;
  assets: Array<{ id: string; kind: "character" | "background" | "icon"; prompt: string }>;
  text: { title: string; instructions: string; resultText: string };
};

/** The entire catalog exposed to the orchestration agent. It contains no renderer code. */
export const composerToolCatalog = [
  { name: "render_identification_tool", description: "Selects one render surface.", input: { surface: ["arena", "grid", "cards", "circles"] } },
  { name: "interaction_handler_tool", description: "Selects player interactions.", input: { interactions: ["tap", "drag", "select", "swipe", "type", "draw"] } },
  { name: "entity_behaviour_tool", description: "Selects animation and entity behaviours.", input: { behaviours: ["spawn", "fall", "move", "flip", "rotate", "reveal"] } },
  { name: "rules_execution_tool", description: "Supplies declarative scoring, timer, constraint, and outcome rules.", input: { rules: "JSON object" } },
  { name: "asset_generation_tool", description: "Supplies asset-generation briefs, never executable code.", input: { assets: [{ id: "safe_id", kind: ["character", "background", "icon"], prompt: "string" }] } },
  { name: "text_generation_tool", description: "Supplies player-facing copy.", input: { title: "string", instructions: "string", resultText: "string" } },
] as const;

/** Public Anthropic tool definitions. These are contracts only; renderer source stays private. */
const anthropicComposerTools = [
  { name: "render_identification_tool", description: composerToolCatalog[0].description, input_schema: { type: "object", properties: { surface: { type: "string", enum: ["arena", "grid", "cards", "circles"] } }, required: ["surface"], additionalProperties: false } },
  { name: "interaction_handler_tool", description: composerToolCatalog[1].description, input_schema: { type: "object", properties: { interactions: { type: "array", items: { type: "string", enum: ["tap", "drag", "select", "swipe", "type", "draw"] }, minItems: 1 } }, required: ["interactions"], additionalProperties: false } },
  { name: "entity_behaviour_tool", description: composerToolCatalog[2].description, input_schema: { type: "object", properties: { behaviours: { type: "array", items: { type: "string", enum: ["spawn", "fall", "move", "flip", "rotate", "reveal"] } } }, required: ["behaviours"], additionalProperties: false } },
  { name: "rules_execution_tool", description: composerToolCatalog[3].description, input_schema: { type: "object", properties: { rules: { type: "object" } }, required: ["rules"], additionalProperties: false } },
  { name: "asset_generation_tool", description: composerToolCatalog[4].description, input_schema: { type: "object", properties: { assets: { type: "array", items: { type: "object", properties: { id: { type: "string" }, kind: { type: "string", enum: ["character", "background", "icon"] }, prompt: { type: "string" } }, required: ["id", "kind", "prompt"], additionalProperties: false } } }, required: ["assets"], additionalProperties: false } },
  { name: "text_generation_tool", description: composerToolCatalog[5].description, input_schema: { type: "object", properties: { title: { type: "string" }, instructions: { type: "string" }, resultText: { type: "string" } }, required: ["title", "instructions", "resultText"], additionalProperties: false } },
] as const;

const renderSurfaces = new Set<RenderSurface>(["arena", "grid", "cards", "circles"]);
const interactions = new Set<Interaction>(["tap", "drag", "select", "swipe", "type", "draw"]);
const behaviours = new Set<Behaviour>(["spawn", "fall", "move", "flip", "rotate", "reveal"]);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const unique = <T,>(values: T[]) => [...new Set(values)];

/**
 * What it does: Validates tool selections and compiles them into a playable-template recipe.
 * Can be generated by AI?: No.
 */
export function compileToolCalls(calls: ComposerToolCall[]): { valid: true; recipe: GameRecipe } | { valid: false; errors: string[] } {
  const errors: string[] = [];
  const selectedRender = calls.find((call) => call.tool === "render_identification_tool")?.input;
  const selectedInteractions = calls.find((call) => call.tool === "interaction_handler_tool")?.input;
  const selectedBehaviours = calls.find((call) => call.tool === "entity_behaviour_tool")?.input;
  const selectedRules = calls.find((call) => call.tool === "rules_execution_tool")?.input;
  const selectedAssets = calls.find((call) => call.tool === "asset_generation_tool")?.input;
  const selectedText = calls.find((call) => call.tool === "text_generation_tool")?.input;

  const surface = selectedRender?.surface;
  if (!renderSurfaces.has(surface as RenderSurface)) errors.push("Select one supported render surface.");

  const requestedInteractions = Array.isArray(selectedInteractions?.interactions) ? selectedInteractions.interactions.filter((item): item is Interaction => typeof item === "string" && interactions.has(item as Interaction)) : [];
  if (!requestedInteractions.length) errors.push("Select at least one supported interaction.");

  const requestedBehaviours = Array.isArray(selectedBehaviours?.behaviours) ? selectedBehaviours.behaviours.filter((item): item is Behaviour => typeof item === "string" && behaviours.has(item as Behaviour)) : [];
  if (!isRecord(selectedRules?.rules)) errors.push("Provide a declarative rules object.");

  const text = selectedText;
  if (!isText(text?.title) || !isText(text?.instructions) || !isText(text?.resultText)) errors.push("Provide title, instructions, and result text.");

  const assetItems = Array.isArray(selectedAssets?.assets) ? selectedAssets.assets : [];
  const assets = assetItems.flatMap<{ id: string; kind: "character" | "background" | "icon"; prompt: string }>((asset) => {
    if (!isRecord(asset) || !isText(asset.id) || !isText(asset.prompt) || (asset.kind !== "character" && asset.kind !== "background" && asset.kind !== "icon")) return [];
    return [{ id: asset.id, prompt: asset.prompt, kind: asset.kind }];
  });

  let templateId: TemplateId | undefined;
  const rules = isRecord(selectedRules?.rules) ? selectedRules.rules : {};
  if (surface === "arena" && requestedInteractions.includes("tap") && requestedBehaviours.includes("fall") && requestedBehaviours.includes("spawn") && typeof rules.timerSeconds === "number" && typeof rules.pointsPerTap === "number") templateId = "falling_tap";
  if (surface === "grid" && requestedInteractions.includes("select") && rules.constraint === "diagonal_sudoku") templateId = "sudoku_twist";
  if (surface === "cards" && requestedInteractions.includes("select") && requestedBehaviours.includes("flip") && rules.goal === "match_pairs") templateId = "memory_match";
  if (!templateId) errors.push("No installed template supports this combination of primitives yet.");

  if (errors.length || !templateId || !isText(text?.title) || !isText(text?.instructions) || !isText(text?.resultText) || !renderSurfaces.has(surface as RenderSurface)) return { valid: false, errors };

  return {
    valid: true,
    recipe: {
      schemaVersion: 1,
      templateId,
      render: { surface: surface as RenderSurface },
      interactions: unique(requestedInteractions),
      behaviours: unique(requestedBehaviours),
      rules,
      assets,
      text: { title: text.title.trim(), instructions: text.instructions.trim(), resultText: text.resultText.trim() },
    },
  };
}

/**
 * What it does: Returns the model instructions for emitting tool calls without exposing template implementation.
 * Can be generated by AI?: No.
 */
export function composerSystemPrompt() {
  return `You are Plizzy's game composition agent. Call every available tool exactly once. Do not write JSON or explanatory text. Never output React, HTML, CSS, JavaScript, renderer code, or template code. Choose exactly one supported combination: falling-tap requires arena + tap + spawn + fall + numeric timerSeconds and pointsPerTap; diagonal Sudoku requires grid + select + constraint="diagonal_sudoku"; memory match requires cards + select + flip + goal="match_pairs". Every game needs at least one asset brief and player-facing title, instructions, and result text.`;
}

/**
 * What it does: Asks the configured model for a tool-call plan, then validates and compiles the result locally.
 * Can be generated by AI?: No.
 */
export async function composeGameFromPrompt(prompt: string, trace?: GameCompositionTrace) {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const model = process.env.ANTHROPIC_MODEL?.trim() ?? "claude-sonnet-5-5";
  const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  const startedAt = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}) },
    body: JSON.stringify({ model, system: composerSystemPrompt(), max_tokens: 1600, tools: anthropicComposerTools, messages: [{ role: "user", content: `Creator idea: <idea>${prompt}</idea>` }] }),
  });
  if (!response.ok) { const detail = await response.text(); trace?.recordModelFailure({ model, latencyMs: Date.now() - startedAt, detail: detail.slice(0, 500) }); throw new Error(`Composer model request failed (${response.status}).`); }
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }>; usage?: Record<string, unknown>; model?: string };
  const toolCalls = payload.content?.flatMap<ComposerToolCall>((block) => {
    if (block.type !== "tool_use" || !isRecord(block.input) || !block.name) return [];
    return [{ tool: block.name as ComposerToolCall["tool"], input: block.input }];
  }) ?? [];
  if (!toolCalls.length) {
    const content = payload.content?.find((block) => block.type === "text")?.text;
    if (!content) throw new Error("Composer model returned no tool plan.");
    const parsed = parseModelJson(content);
    if (isRecord(parsed) && Array.isArray(parsed.toolCalls)) toolCalls.push(...parsed.toolCalls.filter((call): call is ComposerToolCall => isRecord(call) && typeof call.tool === "string" && isRecord(call.input)));
  }
  const output = JSON.stringify({ toolCalls });
  trace?.recordModelSuccess({ input: prompt, content: output, usage: payload.usage ?? {}, model: payload.model ?? model, latencyMs: Date.now() - startedAt });
  return compileToolCalls(toolCalls);
}
