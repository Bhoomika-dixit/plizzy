import { GameMode, parseModelJson, validateGameDefinition } from "./game-definition";

const systemPrompt = `You are Plizzy's game designer. Create only safe, declarative GameDefinition v1 JSON. Never output code, markdown, or commentary. Use only these rule effect types: SET_STATE, INCREMENT_STATE, ADD_SCORE, MOVE_ENTITY, SPAWN_ENTITY, DESPAWN_ENTITY, RESPAWN_ENTITY, START_TIMER, STOP_TIMER, ADVANCE_PHASE, RANDOM_CHOICE, END_GAME. Include every required top-level key: schemaVersion, metadata, config, state, players, entities, scenes, actions, rules, phases, winConditions, visuals. schemaVersion must be 1.`;

function env(name: string) { return process.env[name]?.trim(); }

async function askAnthropic(input: string) {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const model = env("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
  const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model, system: systemPrompt, effort: "low", max_tokens: 2800, messages: [{ role: "user", content: input }] }) });
  if (!response.ok) throw new Error(`Anthropic request failed (${response.status}).`);
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }>; usage?: Record<string, unknown>; model?: string };
  const content = payload.content?.find((block) => block.type === "text")?.text;
  if (!content) throw new Error("Anthropic returned no game definition.");
  return { content, usage: payload.usage ?? {}, model: payload.model ?? model };
}

export async function generateGameDefinition({ title, prompt, mode }: { title: string; prompt: string; mode: GameMode }) {
  const designRequest = `Title: ${title}\nMode: ${mode}\nCreator idea: ${prompt}\nReturn the complete GameDefinition JSON now.`;
  let repairCount = 0;
  let generated = await askAnthropic(designRequest);
  let validation = validateGameDefinition(parseModelJson(generated.content), mode);
  if (!validation.valid) {
    repairCount = 1;
    generated = await askAnthropic(`${designRequest}\nYour previous response was invalid for these reasons: ${validation.errors.join(" ")} Repair it and return only valid JSON.`);
    validation = validateGameDefinition(parseModelJson(generated.content), mode);
  }
  if (!validation.valid) return { valid: false as const, errors: validation.errors };
  return { valid: true as const, definition: validation.value, repairCount, model: generated.model, usage: generated.usage };
}
