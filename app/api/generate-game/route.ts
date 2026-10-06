import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GameMode, parseModelJson, validateGameDefinition } from "@/lib/game-definition";

export const runtime = "nodejs";

const systemPrompt = `You are Plizzy's game designer. Create only safe, declarative GameDefinition v1 JSON. Never output code, markdown, or commentary. Use only these rule effect types: SET_STATE, INCREMENT_STATE, ADD_SCORE, MOVE_ENTITY, SPAWN_ENTITY, DESPAWN_ENTITY, RESPAWN_ENTITY, START_TIMER, STOP_TIMER, ADVANCE_PHASE, RANDOM_CHOICE, END_GAME. Include every required top-level key: schemaVersion, metadata, config, state, players, entities, scenes, actions, rules, phases, winConditions, visuals. schemaVersion must be 1.`;

function env(name: string) { return process.env[name]?.trim(); }
async function askModel(input: string) {
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

export async function POST(request: NextRequest) {
  const url = env("NEXT_PUBLIC_SUPABASE_URL"); const anonKey = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"); const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return NextResponse.json({ error: "Server Supabase configuration is incomplete." }, { status: 503 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const authClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  const body = await request.json() as { title?: unknown; prompt?: unknown; mode?: unknown };
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 500) : "";
  const mode: GameMode | null = body.mode === "single_player" || body.mode === "multiplayer" ? body.mode : null;
  if (!title || !prompt || !mode) return NextResponse.json({ error: "A title, idea, and game mode are required." }, { status: 400 });
  const designRequest = `Title: ${title}\nMode: ${mode}\nCreator idea: ${prompt}\nReturn the complete GameDefinition JSON now.`;
  let attempts = 0; let generated; let validation;
  try {
    generated = await askModel(designRequest); validation = validateGameDefinition(parseModelJson(generated.content), mode);
    if (!validation.valid) { attempts = 1; generated = await askModel(`${designRequest}\nYour previous response was invalid for these reasons: ${validation.errors.join(" ")} Repair it and return only valid JSON.`); validation = validateGameDefinition(parseModelJson(generated.content), mode); }
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Game generation failed." }, { status: 502 }); }
  if (!validation?.valid || !generated) return NextResponse.json({ error: "The generated definition was invalid after repair.", validationErrors: validation && !validation.valid ? validation.errors : [] }, { status: 422 });
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: game, error: gameError } = await admin.from("games").insert({ creator_id: user.id, title, summary: validation.value.metadata.description.slice(0, 500), visibility: "private" }).select("id").single();
  if (gameError || !game) return NextResponse.json({ error: gameError?.message ?? "Could not save the game." }, { status: 500 });
  const { data: version, error: versionError } = await admin.from("game_versions").insert({ game_id: game.id, version_number: 1, prompt, rules_markdown: "# Generated rules\n\nStored in the validated GameDefinition.", min_players: validation.value.players.min, max_players: validation.value.players.max, game_mode: mode, definition: validation.value, generation_metadata: { provider: "anthropic", model: generated.model, schema_version: 1, generated_at: new Date().toISOString(), validation: "passed", repair_count: attempts, usage: generated.usage } }).select("id").single();
  if (versionError || !version) return NextResponse.json({ error: versionError?.message ?? "Could not save the game version." }, { status: 500 });
  await admin.from("games").update({ latest_version_id: version.id }).eq("id", game.id);
  return NextResponse.json({ gameId: game.id, versionId: version.id, definition: validation.value, repairCount: attempts });
}
