import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateGameDefinition } from "@/agent-harness/game-designer";
import { GameMode } from "@/agent-harness/game-definition";

export const runtime = "nodejs";

function env(name: string) { return process.env[name]?.trim(); }

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
  let generated;
  try { generated = await generateGameDefinition({ title, prompt, mode }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Game generation failed." }, { status: 502 }); }
  if (!generated.valid) return NextResponse.json({ error: "The generated definition was invalid after repair.", validationErrors: generated.errors }, { status: 422 });
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: game, error: gameError } = await admin.from("games").insert({ creator_id: user.id, title, summary: generated.definition.metadata.description.slice(0, 500), visibility: "private" }).select("id").single();
  if (gameError || !game) return NextResponse.json({ error: gameError?.message ?? "Could not save the game." }, { status: 500 });
  const { data: version, error: versionError } = await admin.from("game_versions").insert({ game_id: game.id, version_number: 1, prompt, rules_markdown: "# Generated rules\n\nStored in the validated GameDefinition.", min_players: generated.definition.players.min, max_players: generated.definition.players.max, game_mode: mode, definition: generated.definition, generation_metadata: { provider: "anthropic", model: generated.model, schema_version: 1, generated_at: new Date().toISOString(), validation: "passed", repair_count: generated.repairCount, usage: generated.usage } }).select("id").single();
  if (versionError || !version) return NextResponse.json({ error: versionError?.message ?? "Could not save the game version." }, { status: 500 });
  await admin.from("games").update({ latest_version_id: version.id }).eq("id", game.id);
  return NextResponse.json({ gameId: game.id, versionId: version.id, definition: generated.definition, repairCount: generated.repairCount });
}
