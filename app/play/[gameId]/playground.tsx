"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AppHeader from "@/app/components/app-header";
import { GameDefinitionV1, validateGameDefinition } from "@/agent-harness/game-definition";
import { createRuntime, dispatchTap, RuntimeState, tickRuntime } from "@/agent-harness/runtime";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./playground.module.css";

type StoredGame = { id: string; title: string; latest_version_id: string | null };
type StoredVersion = { id: string; game_mode: "single_player" | "multiplayer"; definition: unknown };

export default function GamePlayground({ gameId }: { gameId: string }) {
  const [definition, setDefinition] = useState<GameDefinitionV1 | null>(null);
  const [gameTitle, setGameTitle] = useState("");
  const [runtime, setRuntime] = useState<RuntimeState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionNote, setActionNote] = useState("");

  useEffect(() => {
    async function loadGame() {
      const supabase = getSupabaseClient();
      if (!supabase) { setError("Supabase is not connected yet."); setLoading(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Please sign in to play this game."); setLoading(false); return; }
      const { data: game, error: gameError } = await supabase.from("games").select("id, title, latest_version_id").eq("id", gameId).maybeSingle();
      if (gameError || !game) { setError(gameError?.message ?? "This game is no longer available."); setLoading(false); return; }
      const typedGame = game as StoredGame;
      if (!typedGame.latest_version_id) { setError("This game does not have a playable version yet."); setLoading(false); return; }
      const { data: version, error: versionError } = await supabase.from("game_versions").select("id, game_mode, definition").eq("id", typedGame.latest_version_id).maybeSingle();
      if (versionError || !version) { setError(versionError?.message ?? "The playable version could not be found."); setLoading(false); return; }
      const typedVersion = version as StoredVersion;
      if (typedVersion.game_mode !== "single_player") { setError("This playground is ready for single-player games. Choose this game in its room to play together."); setLoading(false); return; }
      const validation = validateGameDefinition(typedVersion.definition, "single_player");
      if (!validation.valid) { setError("This saved game definition is not compatible with the current runtime."); setLoading(false); return; }
      setGameTitle(typedGame.title); setDefinition(validation.value); setRuntime(createRuntime(validation.value)); setLoading(false);
      await supabase.from("user_games").upsert({ user_id: user.id, game_id: typedGame.id, is_saved: true, last_played_at: new Date().toISOString() }, { onConflict: "user_id,game_id" });
    }
    void loadGame();
  }, [gameId]);

  useEffect(() => {
    if (!definition || !runtime || runtime.status !== "playing" || !runtime.timerRunning) return;
    const interval = window.setInterval(() => setRuntime((current) => current ? tickRuntime(definition, current) : current), 1000);
    return () => window.clearInterval(interval);
  }, [definition, runtime]);

  function tap(entityId: string) {
    if (!definition || !runtime) return;
    const result = dispatchTap(definition, runtime, entityId);
    setRuntime(result.state); setActionNote(result.error ?? "Nice tap!");
    window.setTimeout(() => setActionNote(""), 700);
  }

  if (loading) return <main className={styles.stage}><section className={styles.phone}><AppHeader backHref="/footer/library" /><div className={styles.status}><i /><i /><i /><p>Building your playground…</p></div></section></main>;
  if (error || !definition || !runtime) return <main className={styles.stage}><section className={styles.phone}><AppHeader backHref="/footer/library" /><div className={styles.failure}><span>✦</span><h1>Not ready to play</h1><p>{error || "This game could not be loaded."}</p><Link href="/footer/library">Back to your library</Link></div></section></main>;

  const score = typeof runtime.values.score === "number" ? runtime.values.score : 0;
  const phase = definition.phases.find((item) => item.id === runtime.phaseId);
  return <main className={styles.stage}><section className={styles.phone} style={{ "--game-bg": definition.visuals.backgroundColor, "--game-accent": definition.visuals.accentColor, "--game-text": definition.visuals.textColor, "--game-card": definition.visuals.cardColor } as React.CSSProperties}>
    <AppHeader backHref="/footer/library" />
    <div className={styles.content}>
      <p className={styles.eyebrow}>SOLO PLAYGROUND</p><h1>{gameTitle}</h1><p className={styles.description}>{definition.metadata.description}</p>
      <div className={styles.hud}><div><small>Score</small><strong>{score}</strong></div><div><small>{phase?.label ?? "Play"}</small><strong>{runtime.secondsRemaining}s</strong></div></div>
      {runtime.status === "playing" ? <>
        <div className={styles.board} role="application" aria-label={`${gameTitle} game board`}>
          <p>Tap everything you can!</p>
          {definition.entities.map((entity) => { const present = runtime.entities[entity.id]; const motion = entity.motion === "bob" ? styles.bob : entity.motion === "none" ? "" : styles.float; return present?.visible ? <button key={entity.id} type="button" onClick={() => tap(entity.id)} className={`${styles.entity} ${motion}`} style={{ left: `${present.x}%`, top: `${present.y}%`, fontSize: `${entity.size}px` }} aria-label={`Tap ${entity.label}`}><span>{entity.emoji}</span></button> : null; })}
          {actionNote && <p className={styles.note} role="status">{actionNote}</p>}
        </div>
        <p className={styles.hint}>Every tap is checked against this game&apos;s saved rules.</p>
      </> : <div className={styles.result}><span>✦</span><p className={styles.eyebrow}>ROUND COMPLETE</p><h2>{runtime.endReason || "Time is up!"}</h2><strong>{score}</strong><p>points scored. Your game is saved in the library whenever you&apos;re ready for another round.</p><div><button type="button" onClick={() => { setRuntime(createRuntime(definition)); setActionNote(""); }}>Play again</button><Link href="/footer/library">Back to library</Link></div></div>}
    </div>
  </section></main>;
}
