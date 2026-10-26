import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { generateGameDefinition } from "@/agent-harness/game-designer";
import { GameMode } from "@/agent-harness/game-definition";
import { gameRulesMarkdownV2, GameDefinitionV2 } from "@/agent-harness/game-definition-v2";
import { startGameGenerationTrace } from "@/agent-harness/observability";
import { materializeGeneratedAssets, saveGeneratedAssetRecords } from "@/agent-harness/generated-asset-materializer";

export const runtime = "nodejs";

function env(name: string) { return process.env[name]?.trim(); }
function coverSvg(title: string, definition: GameDefinitionV2) {
  const safeTitle = title.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);
  const entities = definition.entities.slice(0, 4).map((entity, index) => `<text x="${90 + index * 105}" y="205" font-size="64">${entity.content.kind === "asset" ? "✦" : entity.content.value}</text>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${definition.visuals.backgroundColor}"/><stop offset="1" stop-color="${definition.visuals.accentColor}"/></linearGradient></defs><rect width="720" height="420" rx="42" fill="url(#bg)"/><circle cx="635" cy="72" r="120" fill="#fff" opacity=".18"/><text x="56" y="84" fill="${definition.visuals.textColor}" font-family="Arial, sans-serif" font-size="23" font-weight="700">PLIZZY ORIGINAL</text><text x="56" y="145" fill="${definition.visuals.textColor}" font-family="Arial, sans-serif" font-size="44" font-weight="800">${safeTitle.slice(0, 28)}</text>${entities}</svg>`;
}

async function saveCoverAsset(admin: SupabaseClient, gameId: string, versionId: string, title: string, definition: GameDefinitionV2) {
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
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 500) : "";
  const mode: GameMode | null = body.mode === "single_player" || body.mode === "multiplayer" ? body.mode : null;
  if (!title || !prompt || !mode) return NextResponse.json({ error: "A title, idea, and game mode are required." }, { status: 400 });
  if (mode !== "single_player") return NextResponse.json({ error: "Multiplayer generation is paused while the single-player V2 runtime is completed." }, { status: 400 });

  const workflowId = randomUUID();
  const trace = startGameGenerationTrace({ workflowId, userId: user.id, title, prompt, mode });
  try {
    const generated = await generateGameDefinition({ title, prompt, mode, trace });
    trace.completeAgent(generated.valid ? { accepted: true, model: generated.model, repairCount: generated.repairCount, toolsUsed: generated.toolsUsed, requirementId: generated.requirementContract.requirementId, requirementVersion: generated.requirementContract.requirementVersion } : { accepted: false, validationErrors: generated.errors });
    if (!generated.valid) { trace.finish({ workflowId, accepted: false, validationErrors: generated.errors }); return NextResponse.json({ error: "The generated definition was invalid after repair.", validationErrors: generated.errors }, { status: 422 }); }
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const gameId = randomUUID();
    const versionId = randomUUID();
    let stageStartedAt = Date.now();
    const materialized = await materializeGeneratedAssets({ admin, gameId, versionId, definition: generated.definition, trace });
    const definition = materialized.definition;
    trace.recordPersistenceStage({ stage: "materialize_generated_assets", successful: true, latencyMs: Date.now() - stageStartedAt, output: { assetCount: materialized.records.length, assetIds: materialized.records.map((asset) => asset.assetId) } });
    stageStartedAt = Date.now();
    const { data: game, error: gameError } = await admin.from("games").insert({ id: gameId, creator_id: user.id, title, summary: definition.metadata.description.slice(0, 500), visibility: "private" }).select("id").single();
    trace.recordPersistenceStage({ stage: "create_game", successful: !gameError && Boolean(game), latencyMs: Date.now() - stageStartedAt, output: game ? { gameId: game.id } : undefined, error: gameError?.message });
    if (gameError || !game) throw new Error(gameError?.message ?? "Could not save the game.");
    stageStartedAt = Date.now();
    const { data: version, error: versionError } = await admin.from("game_versions").insert({ id: versionId, game_id: game.id, version_number: 1, prompt, rules_markdown: gameRulesMarkdownV2(definition), min_players: 1, max_players: 1, estimated_duration_minutes: definition.config.estimatedDurationMinutes, game_mode: mode, definition, visual_theme: definition.visuals, generation_metadata: { provider: "anthropic", model: generated.model, image_provider: "vercel-ai-gateway", image_model: process.env.AI_GATEWAY_IMAGE_MODEL?.trim() || "openai/gpt-image-2", generated_asset_count: materialized.records.length, schema_version: 2, prompt_version: "game-definition-v2-requirements", tools_used: generated.toolsUsed, requirements: generated.requirementContract, generated_at: new Date().toISOString(), validation: "passed", repair_count: generated.repairCount, usage: generated.usage, workflow_id: workflowId, langfuse_trace_id: trace.traceId ?? null, langfuse_root_span_id: trace.observationId ?? null } }).select("id").single();
    trace.recordPersistenceStage({ stage: "create_version", successful: !versionError && Boolean(version), latencyMs: Date.now() - stageStartedAt, output: version ? { versionId: version.id, schemaVersion: 2 } : undefined, error: versionError?.message });
    if (versionError || !version) throw new Error(versionError?.message ?? "Could not save the game version.");
    stageStartedAt = Date.now();
    await saveGeneratedAssetRecords(admin, version.id, definition, materialized.records);
    trace.recordPersistenceStage({ stage: "save_generated_asset_records", successful: true, latencyMs: Date.now() - stageStartedAt, output: { assetCount: materialized.records.length } });
    stageStartedAt = Date.now();
    const { error: latestError } = await admin.from("games").update({ latest_version_id: version.id }).eq("id", game.id);
    trace.recordPersistenceStage({ stage: "set_latest_version", successful: !latestError, latencyMs: Date.now() - stageStartedAt, output: latestError ? undefined : { gameId: game.id, versionId: version.id }, error: latestError?.message });
    if (latestError) throw new Error(latestError.message);
    stageStartedAt = Date.now();
    const { error: libraryError } = await admin.from("user_games").upsert({ user_id: user.id, game_id: game.id, is_saved: true, last_played_at: null }, { onConflict: "user_id,game_id" });
    trace.recordPersistenceStage({ stage: "save_to_library", successful: !libraryError, latencyMs: Date.now() - stageStartedAt, output: libraryError ? undefined : { gameId: game.id }, error: libraryError?.message });
    if (libraryError) throw new Error(libraryError.message);
    let asset: { bucket: string; path: string } | undefined; let assetWarning: string | undefined;
    stageStartedAt = Date.now();
    try { asset = await saveCoverAsset(admin, game.id, version.id, title, definition); trace.recordPersistenceStage({ stage: "save_cover_asset", successful: true, latencyMs: Date.now() - stageStartedAt, output: asset }); }
    catch (error) { assetWarning = error instanceof Error ? error.message : "The cover asset could not be saved."; trace.recordPersistenceStage({ stage: "save_cover_asset", successful: false, latencyMs: Date.now() - stageStartedAt, error: assetWarning }); }
    trace.recordPersistence({ gameId: game.id, versionId: version.id, userGameSaved: true, asset: asset ?? null, error: assetWarning });
    trace.finish({ workflowId, accepted: true, gameId: game.id, versionId: version.id, coverAssetCreated: Boolean(asset), generatedAssetCount: materialized.records.length });
    return NextResponse.json({ gameId: game.id, versionId: version.id, definition, repairCount: generated.repairCount, generatedAssetCount: materialized.records.length, assetWarning });
  } catch (error) {
    trace.fail(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Game generation failed." }, { status: 502 });
  }
}
