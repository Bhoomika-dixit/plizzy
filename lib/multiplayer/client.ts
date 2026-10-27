import { getSupabaseClient } from "@/lib/supabase/client";

export async function multiplayerRequest(body: Record<string, unknown>) {
  const client = getSupabaseClient();
  const session = client ? (await client.auth.getSession()).data.session : null;
  if (!session) throw new Error("Please sign in to play with friends.");
  if (body.action === "tic_move") {
    const { data, error } = await client!.rpc("play_tic_tac_toe", {
      target_room_id: body.roomId, expected_revision: body.revision, target_entity_id: body.entityId,
    });
    if (error) throw new Error(error.message);
    if (!data?.[0]) throw new Error("The move could not be saved.");
    return { round: data[0] };
  }
  const response = await fetch("/api/multiplayer", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "The room could not be updated.");
  return result;
}
