import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { generateGameDefinition } from "@/agent-harness/game-designer";
import { executeV2 } from "@/agent-harness/orchestration/execute";
import { gameRulesMarkdown, GameDefinitionV1, GameMode } from "@/agent-harness/game-definition";
import { startGameGenerationTrace } from "@/agent-harness/observability";

export const runtime = "nodejs";

function env(name: string) { return process.env[name]?.trim(); }
function coverSvg(title: string, definition: GameDefinitionV1) {
  const safeTitle = title.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
  const entities = definition.entities.slice(0, 4).map((entity, index) => `<text x="${90 + index * 105}" y="205" font-size="64">${entity.emoji}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${definition.visuals.backgroundColor}"/><stop offset="1" stop-color="${definition.visuals.accentColor}"/></linearGradient></defs><rect width="720" height="420" rx="42" fill="url(#bg)"/><circle cx="635" cy="72" r="120" fill="#fff" opacity=".18"/><text x="56" y="84" fill="${definition.visuals.textColor}" font-family="Arial, sans-serif" font-size="23" font-weight="700">PLIZZY ORIGINAL</text><text x="56" y="145" fill="${definition.visuals.textColor}" font-family="Arial, sans-serif" font-size="44" font-weight="800">${safeTitle.slice(0, 28)}</text>${entities}</svg>`;
}

async function saveCoverAsset(admin: SupabaseClient, gameId: string, versionId: string, title: string, definition: GameDefinitionV1) {
  const bucket = "game-assets"; const path = `games/${gameId}/versions/${versionId}/cover.svg`;
  const { error: bucketError } = await admin.storage.createBucket(bucket, { public: false, fileSizeLimit: "2MB", allowedMimeTypes: ["image/svg+xml"] });
  if (bucketError && !/already exists|duplicate/i.test(bucketError.message)) throw bucketError;
  const { error: uploadError } = await admin.storage.from(bucket).upload(path, Buffer.from(coverSvg(title, definition)), { contentType: "image/svg+xml", upsert: true });
  if (uploadError) throw uploadError;
  const { error: assetError } = await admin.from("game_assets").insert({ game_version_id: versionId, storage_bucket: bucket, storage_path: path, asset_type: "cover", alt_text: `Cover art for ${title}`, metadata: { generator: "plizzy-svg-v1", visual_spec: definition.visuals } });
  if (assetError) throw assetError;
  return { bucket, path };
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
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 3000) : "";
  const mode: GameMode | null = body.mode === "single_player" || body.mode === "multiplayer" ? body.mode : null;
  if (!title || !prompt || !mode) return NextResponse.json({ error: "A title, idea, and game mode are required." }, { status: 400 });

  const workflowId = randomUUID();
  const trace = startGameGenerationTrace({ workflowId, userId: user.id, title, prompt, mode });
  try {
    const useV2 = process.env.PLIZZY_ORCHESTRATION_V2 === "true";
    if (useV2 && mode !== "single_player") {
      trace.finish({ workflowId, accepted: false, reason: "V2 multiplayer requires an authoritative action reducer." });
      return NextResponse.json({ error: "V2 generation currently supports single-player games only." }, { status: 422 });
    }
    const generated = useV2 ? await executeV2({ title, prompt, mode }, trace) : await generateGameDefinition({ title, prompt, mode, trace });
    if (!generated.valid) { trace.finish({ workflowId, accepted: false, validationErrors: generated.errors }); return NextResponse.json({ error: "The generated definition was invalid after repair.", validationErrors: generated.errors }, { status: 422 }); }
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: published, error: publicationError } = await admin.rpc("publish_generated_game", {
      p_creator_id: user.id, p_title: title, p_summary: generated.definition.metadata.description.slice(0, 500), p_prompt: prompt,
      p_rules_markdown: gameRulesMarkdown(generated.definition), p_min_players: generated.definition.players.min,
      p_max_players: generated.definition.players.max, p_estimated_duration_minutes: generated.definition.config.estimatedDurationMinutes,
      p_game_mode: mode, p_definition: generated.definition, p_visual_theme: generated.definition.visuals,
      p_generation_metadata: { provider: useV2 ? (process.env.PLIZZY_MODEL_PROVIDER || "anthropic") : "anthropic", model: generated.model, schema_version: 1, prompt_version: "game-definition-v1", generated_at: new Date().toISOString(), validation: "passed", repair_count: generated.repairCount, usage: generated.usage, orchestration_version: useV2 ? "v2" : "v1", workflow_id: workflowId, langfuse_trace_id: trace.traceId ?? null },
    }).single() as { data: { game_id: string; version_id: string } | null; error: { message: string } | null };
    if (publicationError || !published) throw new Error(publicationError?.message ?? "Could not atomically publish the game.");
    const game = { id: published.game_id }; const version = { id: published.version_id };
    let asset: { bucket: string; path: string } | undefined; let assetWarning: string | undefined;
    try { asset = await saveCoverAsset(admin, game.id, version.id, title, generated.definition); }
    catch (error) { assetWarning = error instanceof Error ? error.message : "The cover asset could not be saved."; }
    trace.recordPersistence({ gameId: game.id, versionId: version.id, userGameSaved: true, asset: asset ?? null, error: assetWarning });
    trace.finish({ workflowId, accepted: true, gameId: game.id, versionId: version.id, assetCreated: Boolean(asset) });
    return NextResponse.json({ gameId: game.id, versionId: version.id, definition: generated.definition, repairCount: generated.repairCount, assetWarning });
  } catch (error) {
    trace.fail(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Game generation failed." }, { status: 502 });
  }
}
