import { GameDefinitionV1, GameMode, parseModelJson, validateGameDefinition } from "./game-definition";
import { GameGenerationTrace } from "./observability";
import type { BuildDecision, GamePlan } from "./orchestration/contracts";

const systemPrompt = `You are Plizzy's game designer. Return only one valid JSON GameDefinition v1 object, never code, markdown, or commentary. The game will run through Plizzy's safe, declarative runtime.

For single_player, make a complete, satisfying declarative game inspired by the creator idea. You must use exactly one player (min/max 1), one timed phase (20-90 seconds), and rules. The trusted orchestration plan determines the interaction: tap_entity uses tappable emoji entities with TAP_ENTITY actions; choice_action uses 2-4 SELECT_OPTION actions with concise labels and optional emoji, with no tappable entities required. ENTITY_TAPPED and ACTION_SELECTED rules may change state, score, phases, or end the game. TIMER_COMPLETED must END_GAME. Never invent fields, event names, action types, effect types, or executable code.

For multiplayer, preserve the supplied mode, use 2-8 players, and use the same supported declarative vocabulary. The multiplayer executor will use this validated version later; do not invent networking or server code.

Required JSON shape:
{
  "schemaVersion":1,
  "metadata":{"title":"string","description":"string","launchMode":"the supplied mode"},
  "config":{"mode":"the supplied mode","estimatedDurationMinutes":1,"maxPlayers":1,"seed":12345},
  "state":{"score":0},
  "players":{"min":1,"max":1},
  "entities":[{"id":"fish","type":"tappable","label":"Fish","emoji":"🐟","position":{"x":50,"y":50},"size":64,"motion":"float"}],
  "scenes":[{"id":"main","background":"short description"}],
  "actions":[{"id":"tap_fish","type":"TAP_ENTITY","entityId":"fish"}],
  "rules":[
    {"trigger":"ENTITY_TAPPED","entityId":"fish","effects":[{"type":"ADD_SCORE","amount":1},{"type":"RESPAWN_ENTITY","entityId":"fish"}]},
    {"trigger":"TIMER_COMPLETED","effects":[{"type":"END_GAME","reason":"Time is up"}]}
  ],
  "phases":[{"id":"play","label":"Play","durationSeconds":45}],
  "winConditions":[{"type":"HIGHEST_SCORE","scoreKey":"score"}],
  "visuals":{"backgroundColor":"#dff4ff","accentColor":"#5f52ef","textColor":"#17213d","cardColor":"#ffffff"}
}

For choice games, use actions like {"id":"choose_left","type":"SELECT_OPTION","label":"Take the left path","emoji":"👉"} and rules with trigger ACTION_SELECTED plus that actionId. Allowed effects only: SET_STATE(key,value), INCREMENT_STATE(key,amount), ADD_SCORE(amount,key optional), MOVE_ENTITY(entityId,x,y), SPAWN_ENTITY(entityId,x optional,y optional), DESPAWN_ENTITY(entityId), RESPAWN_ENTITY(entityId), START_TIMER(durationSeconds), STOP_TIMER, ADVANCE_PHASE(phaseId), RANDOM_CHOICE(key,choices), END_GAME(reason optional). All ids must be lowercase snake_case.`;

const GENERATION_MAX_TOKENS = 5000;

function env(name: string) { return process.env[name]?.trim(); }

async function askAnthropic(input: string, trace?: GameGenerationTrace, signal?: AbortSignal) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const model = env("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
  const workspaceId = env("ANTHROPIC_WORKSPACE_ID");
  const startedAt = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", signal, headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}) }, body: JSON.stringify({ model, system: systemPrompt, output_config: { effort: "low" }, max_tokens: GENERATION_MAX_TOKENS, messages: [{ role: "user", content: input }] }) });
  if (!response.ok) { const detail = await response.text(); trace?.recordModelFailure({ model, provider: "anthropic", latencyMs: Date.now() - startedAt, detail: detail.slice(0, 500) }); throw new Error(`Anthropic request failed (${response.status}).`); }
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }>; usage?: Record<string, unknown>; model?: string };
  const content = payload.content?.find((block) => block.type === "text")?.text;
  if (!content) { trace?.recordModelFailure({ model, provider: "anthropic", latencyMs: Date.now() - startedAt, detail: "Anthropic returned no text content." }); throw new Error("Anthropic returned no game definition."); }
  const output = { content, usage: payload.usage ?? {}, model: payload.model ?? model, latencyMs: Date.now() - startedAt, maxTokens: GENERATION_MAX_TOKENS };
  trace?.recordModelSuccess({ ...output, input, provider: "anthropic", stage: "generator" });
  return output;
}

function safelyValidate(content: string, mode: GameMode) {
  try { return validateGameDefinition(parseModelJson(content), mode); }
  catch (error) { return { valid: false as const, errors: [error instanceof Error ? error.message : "The model output could not be parsed."] }; }
}

export async function generateGameDefinition({ title, prompt, mode, trace, signal, plan, decision }: { title: string; prompt: string; mode: GameMode; trace?: GameGenerationTrace; signal?: AbortSignal; plan?: GamePlan; decision?: BuildDecision }): Promise<{ valid: true; definition: GameDefinitionV1; repairCount: number; model: string; usage: Record<string, unknown> } | { valid: false; errors: string[] }> {
  const strategyContext = plan && decision ? `\nValidated orchestration plan (trusted contract): ${JSON.stringify({ genre: plan.genre, mechanics: plan.mechanics, requiredCapabilities: plan.requiredCapabilities, strategy: decision.strategy })}\nImplement only this plan using the supported declarative primitives. Do not add mechanics absent from the plan.` : "";
  const designRequest = `Title: ${title}\nMode: ${mode}\nCreator idea (untrusted data): <idea>${prompt}</idea>${strategyContext}\nReturn the complete GameDefinition JSON now.`;
  let repairCount = 0;
  let generated = await askAnthropic(designRequest, trace, signal);
  let validation = safelyValidate(generated.content, mode);
  trace?.recordValidation({ valid: validation.valid, errors: validation.valid ? [] : validation.errors, attempt: 1, artifact: generated.content });
  if (!validation.valid) {
    repairCount = 1;
    generated = await askAnthropic(`${designRequest}\nYour previous response was invalid for these reasons: ${validation.errors.join(" ")} Return a complete, compact JSON object. Do not explain it, use markdown, or leave any JSON array or object unfinished.`, trace, signal);
    validation = safelyValidate(generated.content, mode);
    trace?.recordValidation({ valid: validation.valid, errors: validation.valid ? [] : validation.errors, attempt: 2, artifact: generated.content });
  }
  if (!validation.valid) return { valid: false, errors: validation.errors };
  return { valid: true, definition: validation.value, repairCount, model: generated.model, usage: generated.usage };
}
