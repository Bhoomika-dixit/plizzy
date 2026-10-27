import { createClient } from "@supabase/supabase-js";
import { validateGameDefinitionV2 } from "@/agent-harness/game-definition-v2";
import { createRuntimeV2, dispatchGameEventV2, tickRuntimeV2, type GameEventV2, type RuntimeStateV2 } from "@/agent-harness/runtime-v2";
import { createTicTacToe, isTicTacToe, playTicTacToe } from "@/lib/multiplayer/tic-tac-toe";

export const runtime = "nodejs";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const failure = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return failure("Server Supabase configuration is incomplete.", 503);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return failure("Please sign in.", 401);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return failure("Please sign in again.", 401);
  try {
    const body = await request.json();
    if (body.action === "join") {
      if (typeof body.code !== "string" || body.code.length > 100) return failure("Enter a valid invite code.");
      const { data: room, error } = await admin.from("rooms").select("id").eq("invite_code", body.code.trim()).maybeSingle();
      if (error) throw error;
      if (!room) return failure("That invite code was not found.", 404);
      const { data: existing } = await admin.from("room_members").select("user_id").eq("room_id", room.id).eq("user_id", user.id).maybeSingle();
      if (!existing) {
        const { error: insertError } = await admin.from("room_members").insert({ room_id: room.id, user_id: user.id, role: "member" });
        if (insertError && insertError.code !== "23505") throw insertError;
      }
      return Response.json({ roomId: room.id });
    }
    if (typeof body.roomId !== "string" || !uuid.test(body.roomId)) return failure("Invalid room.");
    const [{ data: member }, { data: room }, { data: round, error: roundError }] = await Promise.all([
      admin.from("room_members").select("user_id").eq("room_id", body.roomId).eq("user_id", user.id).maybeSingle(),
      admin.from("rooms").select("host_id").eq("id", body.roomId).maybeSingle(),
      admin.from("multiplayer_rounds").select("*").eq("room_id", body.roomId).maybeSingle(),
    ]);
    if (!member || !room) return failure("You are no longer a member of this room.", 403);
    const host = room.host_id === user.id;
    if (body.action === "shelf") {
      const { data, error } = await admin.from("room_games")
        .select("game_version_id, game_versions!room_games_game_version_id_fkey(game_mode, game:games!game_versions_game_id_fkey(title, summary))")
        .eq("room_id", body.roomId).order("position");
      if (error) throw error;
      return Response.json({ games: data ?? [] });
    }
    if (body.action === "leave") {
      if (host) return failure("The host must stay in the room.");
      const { error } = await admin.from("room_members").delete().eq("room_id", body.roomId).eq("user_id", user.id);
      if (error) throw error;
      return Response.json({ ok: true });
    }
    if (!["sync", "start", "event"].includes(body.action)) return failure("Unknown room action.");
    if (roundError) throw roundError;
    if (body.action === "start" && !host) return failure("Only the host can start a round.", 403);
    const versionId = body.action === "start" ? body.versionId : round?.game_version_id;
    if (!versionId) return Response.json({ round: null, userId: user.id, host });
    const [{ data: shelf }, { data: version }] = await Promise.all([
      admin.from("room_games").select("game_version_id").eq("room_id", body.roomId).eq("game_version_id", versionId).maybeSingle(),
      admin.from("game_versions").select("definition, game_mode").eq("id", versionId).single(),
    ]);
    if (!shelf) return failure("This game is not on the room shelf.", 403);
    const parsed = validateGameDefinitionV2(version?.definition);
    if (!parsed.valid || version?.game_mode !== "multiplayer" || parsed.value.renderer.id === "side_scroller.v1") return failure("This version does not support shared play.");
    const definition = parsed.value;
    let state: RuntimeStateV2 = round?.state;
    const now = Date.now();
    let clock = round ? Date.parse(round.updated_at) : now;
    if (body.action === "start") {
      const { count } = await admin.from("room_members").select("user_id", { count: "exact", head: true }).eq("room_id", body.roomId);
      if ((count ?? 0) < 2) return failure("Invite at least one friend before starting.");
      if (round && body.revision !== round.revision) return failure("The round changed. Please try again.", 409);
      if (isTicTacToe(definition)) {
        const { data: opponents, error: playersError } = await admin.from("room_members").select("user_id").eq("room_id", body.roomId).neq("user_id", user.id).order("joined_at", { ascending: true }).limit(1);
        if (playersError || !opponents?.[0]) return failure("A second player must join before starting.");
        state = createTicTacToe(definition, user.id, opponents[0].user_id);
      } else state = createRuntimeV2(definition);
      clock = now;
    } else {
      for (let i = 0, elapsed = Math.min(3600, Math.floor((now - clock) / 1000)); i < elapsed && state.status === "playing" && state.timerRunning; i++) state = tickRuntimeV2(definition, state);
      clock += Math.floor((now - clock) / 1000) * 1000;
      if (body.action === "event") {
        if (body.revision !== round.revision) return failure("Another player moved. Try again on the updated board.", 409);
        if (state.status !== "playing") return failure("This round has finished.");
        const event = body.event as GameEventV2;
        const interaction = definition.interactions.find((item) => {
          if (item.event !== event?.type) return false;
          if (!event.entityId || !item.target.entityIds?.length && !item.target.tags?.length) return true;
          const entity = definition.entities.find((entry) => entry.id === event.entityId);
          return item.target.entityIds?.includes(event.entityId) || item.target.tags?.some((tag) => entity?.tags?.includes(tag));
        });
        if (!interaction) return failure("Unsupported game action.");
        const allowed = ["type", "entityId", "targetEntityId", "text", "direction"];
        if (Object.keys(event).some((name) => !allowed.includes(name)) || Object.values(event).some((value) => typeof value !== "string" || value.length > 500)) return failure("Invalid action.");
        if (event.direction && !["left", "right", "up", "down"].includes(event.direction)) return failure("Invalid direction.");
        if (event.entityId) {
          const entity = definition.entities.find((item) => item.id === event.entityId);
          if (!entity || !state.entities[entity.id]?.visible || (interaction.target.entityIds?.length || interaction.target.tags?.length) && !interaction.target.entityIds?.includes(entity.id) && !interaction.target.tags?.some((tag) => entity.tags?.includes(tag))) return failure("Invalid target.");
        } else if (!["text_input.v1", "swipe.v1", "keyboard_move.v1"].includes(interaction.type)) return failure("Select an entity.");
        if (event.targetEntityId && !state.entities[event.targetEntityId]?.visible) return failure("Invalid drop target.");
        if (isTicTacToe(definition)) {
          try { state = playTicTacToe(definition, state, user.id, event.entityId); }
          catch (error) { return failure(error instanceof Error ? error.message : "Invalid move."); }
        } else state = dispatchGameEventV2(definition, state, event);
      }
    }
    let saved = round;
    if (body.action !== "sync" || JSON.stringify(state) !== JSON.stringify(round.state)) {
      const row = { room_id: body.roomId, game_version_id: versionId, state, revision: (round?.revision ?? -1) + 1, updated_at: new Date(clock).toISOString() };
      const result = round
        ? await admin.from("multiplayer_rounds").update(row).eq("room_id", body.roomId).eq("revision", round.revision).select().maybeSingle()
        : await admin.from("multiplayer_rounds").insert(row).select().single();
      if (result.error?.code === "23505" || !result.error && !result.data) return failure("The round changed. Please try again.", 409);
      if (result.error) throw result.error;
      saved = result.data;
    }
    const assets = definition.assets.map((asset) => asset.value?.startsWith("storage://") ? { ...asset, value: asset.fallback } : asset);
    return Response.json({ round: saved, definition: { ...definition, assets }, userId: user.id, host });
  } catch (error) {
    console.error("Multiplayer request failed", error);
    return failure(error instanceof SyntaxError ? "Invalid request." : "Room service unavailable. Check the multiplayer migration and try again.", 500);
  }
}
