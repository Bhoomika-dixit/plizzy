import { getSupabaseClient } from "@/lib/supabase/client";

export class MultiplayerRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function multiplayerRequest(body: Record<string, unknown>) {
  const client = getSupabaseClient();
  const session = client ? (await client.auth.getSession()).data.session : null;
  if (!session) throw new Error("Please sign in to play with friends.");
  const response = await fetch("/api/multiplayer", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new MultiplayerRequestError(result.error ?? "The room could not be updated.", response.status);
  return result;
}
