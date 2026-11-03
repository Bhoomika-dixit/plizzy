import { createClient } from "@supabase/supabase-js";
import { validateGameDefinitionV2 } from "@/agent-harness/game-definition-v2";
import { type GameEventV2, type RuntimeStateV2 } from "@/agent-harness/runtime-v2";
import { advanceSession, createSession, isSession, moveSession, type SessionState } from "@/agent-harness/multiplayer-runtime";

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
    if (!parsed.valid || version?.game_mode !== "multiplayer") return failure("This saved version cannot be played by this runtime.");
    const definition = parsed.value;
    if (!definition.multiplayer) {
      if (body.action !== "sync") return failure("This legacy game needs regeneration with a multiplayer contract. Its existing rules have not been silently changed.");
      return Response.json({ round, definition, userId: user.id, host, needsRegeneration: true });
    }
    let state: RuntimeStateV2 = round?.state;
    const now = Date.now();
    const clock = now;
    if (body.action === "start") {
      if (round && body.revision !== round.revision) return failure("The round changed. Please try again.", 409);
      const { data: roster, error: rosterError } = await admin.from("room_members").select("user_id").eq("room_id", body.roomId).order("joined_at", { ascending: true });
      if (rosterError) throw rosterError;
      const ids = [user.id, ...(roster ?? []).map(player => player.user_id as string).filter(id => id !== user.id)];
      try { state = createSession(definition, ids.slice(0, definition.multiplayer!.maxPlayers), now); }
      catch (error) { return failure(error instanceof Error ? error.message : "Invalid roster."); }
    } else if (!isSession(state)) {
      // Preserve the old round for inspection but require a new contract-based round.
      return Response.json({ round, definition, userId: user.id, host });
    } else {
      if (body.action === "event" && definition.renderer.id !== "side_scroller.v1" && body.revision !== round.revision) return failure("Another player moved. Try again on the updated board.", 409);
      try { state = body.action === "event" ? moveSession(definition, state, user.id, body.event as GameEventV2, now) : advanceSession(definition, state, now); }
      catch (error) { return failure(error instanceof Error ? error.message : "Invalid move."); }
    }
    let saved = round;
    if (body.action !== "sync" || JSON.stringify(state) !== JSON.stringify(round.state)) {
      let expected = round;
      for (let attempt = 0; attempt < 3; attempt++) {
        const row = { room_id: body.roomId, game_version_id: versionId, state, revision: (expected?.revision ?? -1) + 1, updated_at: new Date(clock).toISOString() };
        const result = expected
          ? await admin.from("multiplayer_rounds").update(row).eq("room_id", body.roomId).eq("revision", expected.revision).select().maybeSingle()
          : await admin.from("multiplayer_rounds").insert(row).select().single();
        if (result.error?.code === "23505" || !result.error && !result.data) {
          if (attempt === 2 || body.action === "start" || definition.renderer.id !== "side_scroller.v1") return failure("The round changed. Please try again.", 409);
          const latest = await admin.from("multiplayer_rounds").select("*").eq("room_id", body.roomId).single();
          if (latest.error) throw latest.error;
          if (latest.data.game_version_id !== versionId || !isSession(latest.data.state) || latest.data.state.session.startedAt !== (state as SessionState).session.startedAt) return failure("A new round started. Refresh the board.", 409);
          expected = latest.data;
          try { state = body.action === "event" ? moveSession(definition, expected.state, user.id, body.event, Date.now()) : advanceSession(definition, expected.state, Date.now()); }
          catch (error) { return failure(error instanceof Error ? error.message : "Invalid input."); }
          continue;
        }
        if (result.error) throw result.error;
        saved = result.data;
        break;
      }
    }
    const assets = definition.assets.map((asset) => asset.value?.startsWith("storage://") ? { ...asset, value: asset.fallback } : asset);
    return Response.json({ round: saved, definition: { ...definition, assets }, userId: user.id, host, serverNow: Date.now() });
  } catch (error) {
    console.error("Multiplayer request failed", error);
    return failure(error instanceof SyntaxError ? "Invalid request." : "Room service unavailable. Check the multiplayer migration and try again.", 500);
  }
}
