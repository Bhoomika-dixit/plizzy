"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/app/components/app-header";
import PenguinLoader from "@/app/components/penguin-loader";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./game-creator.module.css";

type GameMode = "single_player" | "multiplayer";
type GeneratedGame = { gameId: string; versionId: string; repairCount?: number };
const examples = ["A 4×4 memory card game with ocean animals", "A timed space trivia game with four choices", "A detective game where I inspect clues and name the culprit"];

export default function GameCreator({ mode, title, roomId, savedGame }: { mode: GameMode; title: string; roomId?: string; savedGame?: GeneratedGame }) {
  const router = useRouter();
  const [idea, setIdea] = useState(""); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingGame, setPendingGame] = useState<GeneratedGame | null>(savedGame ?? null);
  async function createGame(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const prompt = idea.trim();
    if (!prompt && !pendingGame) { setError("Tell Plizzy a little about your game first."); return; }
    const supabase = getSupabaseClient(); if (!supabase) { setError("Supabase is not connected yet."); return; }
    const { data: { session } } = await supabase.auth.getSession(); if (!session) { setError("Please sign in before creating a game."); return; }
    setError(""); setSuccess(""); setIsSubmitting(true);
    try {
    let payload = pendingGame;
    if (!payload) {
      const response = await fetch("/api/generate-game", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ title, prompt, mode }) });
      const generated = await response.json() as { error?: string; gameId?: string; versionId?: string; repairCount?: number };
      if (!response.ok || !generated.versionId || !generated.gameId) { setError(generated.error ?? "Plizzy couldn't generate that game yet."); setIsSubmitting(false); return; }
      payload = { gameId: generated.gameId, versionId: generated.versionId, repairCount: generated.repairCount };
      if (mode === "multiplayer") setPendingGame(payload);
    }
    if (mode === "multiplayer") {
      if (roomId) {
        const { error: roomGameError } = await supabase.from("room_games").insert({ room_id: roomId, game_version_id: payload.versionId, added_by: session.user.id, position: 0 });
        if (roomGameError) { setError(`Your game was generated, but could not be added to this room: ${roomGameError.message}`); setIsSubmitting(false); return; }
        router.push(`/footer/rooms/${roomId}`); return;
      } else {
        const { data: roomRows, error: roomError } = await supabase.rpc("create_room_for_game", { target_game_version_id: payload.versionId }); const room = roomRows?.[0];
        if (roomError || !room) { setError(`Your game was generated, but its room could not be created: ${roomError?.message ?? "Unknown error"}`); setIsSubmitting(false); return; }
        router.push(`/footer/rooms/${room.room_id ?? room.id}`); return;
      }
    } else {
      setSuccess(`Your validated game is ready${payload.repairCount ? " (after one safe repair)" : ""}.`);
      router.push(`/play/${payload.gameId}`);
      return;
    }
    } catch { setError("We couldn’t reach Plizzy. Please check your connection and try again."); setIsSubmitting(false); }
  }
  return <main className={styles.stage}><section className={styles.phone}><AppHeader backHref="/footer/create" /><div className={styles.content}><p className={styles.mode}>{roomId ? "ADDING TO YOUR ROOM" : mode === "multiplayer" ? "MULTIPLAYER GAME" : "SINGLE PLAYER GAME"}</p><h1>Create a game <span>✨</span></h1><p className={styles.subtitle}>Describe your game idea and let Plizzy bring it to life.</p><p className={styles.title}>“{title}”</p>{pendingGame && <p className={styles.success} role="status">Your game is already saved. Click Retry room setup below to open its room.</p>}<form onSubmit={createGame}><textarea value={idea} onChange={(event) => setIdea(event.target.value)} maxLength={500} disabled={Boolean(pendingGame) || isSubmitting} placeholder="E.g. a drawing game where one person draws and others guess, but with a twist..." aria-label="Describe your game idea" /><p className={styles.counter}>{idea.length}/500</p><button type="button" className={styles.surprise} disabled={Boolean(pendingGame) || isSubmitting} onClick={() => setIdea("Surprise me with a playful social game that is easy to learn and fun to replay.")}>🪄 &nbsp; Surprise me 🎲</button>{isSubmitting && <PenguinLoader />}{error && <p className={styles.error} role="alert">{error}</p>}{success && <p className={styles.success} role="status">{success}</p>}<button className={styles.submit} type="submit" disabled={isSubmitting}>{isSubmitting ? pendingGame ? "Opening your room…" : "Designing your game…" : pendingGame ? "Retry room setup" : "Create Game"}</button></form><h2>Examples</h2><div className={styles.examples}>{examples.map((example) => <button type="button" key={example} disabled={Boolean(pendingGame) || isSubmitting} onClick={() => setIdea(example)}>{example}</button>)}</div></div></section></main>;
}
