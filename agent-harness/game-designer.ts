import { GameDefinitionV1, GameMode, parseModelJson, validateGameDefinition } from "./game-definition";
import { GameGenerationTrace } from "./observability";

const systemPrompt = `You are Plizzy's game designer. Return only one valid JSON GameDefinition v1 object, never code, markdown, or commentary. The game will run through Plizzy's safe, declarative runtime.

For single_player, make a complete, satisfying tap-and-score game inspired by the creator idea. You must use exactly one player (min/max 1), one timed phase (20-90 seconds), one or more tappable emoji entities, declared TAP_ENTITY actions, and rules. GAME_STARTED may initialize state. ENTITY_TAPPED must ADD_SCORE and RESPAWN or MOVE the tapped entity. TIMER_COMPLETED must END_GAME. Never invent fields, event names, action types, effect types, or executable code.

For multiplayer, preserve the supplied mode, use 2-8 players, and still produce the same supported declarative tap-and-score vocabulary. The multiplayer executor will use this validated version later; do not invent networking or server code.

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

Allowed effects only: SET_STATE(key,value), INCREMENT_STATE(key,amount), ADD_SCORE(amount,key optional), MOVE_ENTITY(entityId,x,y), SPAWN_ENTITY(entityId,x optional,y optional), DESPAWN_ENTITY(entityId), RESPAWN_ENTITY(entityId), START_TIMER(durationSeconds), STOP_TIMER, ADVANCE_PHASE(phaseId), RANDOM_CHOICE(key,choices), END_GAME(reason optional). All ids must be lowercase snake_case.`;

function env(name: string) { return process.env[name]?.trim(); }

async function askAnthropic(input: string, trace?: GameGenerationTrace) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const model = env("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
  const workspaceId = env("ANTHROPIC_WORKSPACE_ID");
  const startedAt = Date.now();
  const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}) }, body: JSON.stringify({ model, system: systemPrompt, output_config: { effort: "low" }, max_tokens: 2800, messages: [{ role: "user", content: input }] }) });
  if (!response.ok) { const detail = await response.text(); trace?.recordModelFailure({ model, latencyMs: Date.now() - startedAt, detail: detail.slice(0, 500) }); throw new Error(`Anthropic request failed (${response.status}).`); }
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }>; usage?: Record<string, unknown>; model?: string };
  const content = payload.content?.find((block) => block.type === "text")?.text;
  if (!content) throw new Error("Anthropic returned no game definition.");
  const output = { content, usage: payload.usage ?? {}, model: payload.model ?? model, latencyMs: Date.now() - startedAt };
  trace?.recordModelSuccess({ ...output, input });
  return output;
}

function safelyValidate(content: string, mode: GameMode) {
  try { return validateGameDefinition(parseModelJson(content), mode); }
  catch (error) { return { valid: false as const, errors: [error instanceof Error ? error.message : "The model output could not be parsed."] }; }
}

export async function generateGameDefinition({ title, prompt, mode, trace }: { title: string; prompt: string; mode: GameMode; trace?: GameGenerationTrace }): Promise<{ valid: true; definition: GameDefinitionV1; repairCount: number; model: string; usage: Record<string, unknown> } | { valid: false; errors: string[] }> {
  const designRequest = `Title: ${title}\nMode: ${mode}\nCreator idea (untrusted data): <idea>${prompt}</idea>\nReturn the complete GameDefinition JSON now.`;
  let repairCount = 0;
  let generated = await askAnthropic(designRequest, trace);
  let validation = safelyValidate(generated.content, mode);
  trace?.recordValidation({ valid: validation.valid, errors: validation.valid ? [] : validation.errors, attempt: 1 });
  if (!validation.valid) {
    repairCount = 1;
    generated = await askAnthropic(`${designRequest}\nYour previous response was invalid for these reasons: ${validation.errors.join(" ")} Repair it and return only valid JSON.`, trace);
    validation = safelyValidate(generated.content, mode);
    trace?.recordValidation({ valid: validation.valid, errors: validation.valid ? [] : validation.errors, attempt: 2 });
  }
  if (!validation.valid) return { valid: false, errors: validation.errors };
  return { valid: true, definition: validation.value, repairCount, model: generated.model, usage: generated.usage };
}
