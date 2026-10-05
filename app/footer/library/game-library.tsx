"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FooterNav from "@/app/components/footer-nav";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./game-library.module.css";

type GameMode = "single_player" | "multiplayer";
type Game = { id: string; title: string; summary: string | null; created_at: string };
type Version = { game_id: string; version_number: number; game_mode: GameMode };
type LibraryGame = Game & { mode: GameMode; version: number };

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

export default function GameLibrary() {
  const [games, setGames] = useState<LibraryGame[]>([]);
  const [filter, setFilter] = useState<"all" | GameMode>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadLibrary() {
      const supabase = getSupabaseClient();
      if (!supabase) { setError("Supabase is not connected yet."); setLoading(false); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Sign in to see the games you create."); setLoading(false); return; }
      const { data: gameRows, error: gamesError } = await supabase.from("games").select("id, title, summary, created_at").eq("creator_id", user.id).eq("is_archived", false).order("created_at", { ascending: false });
      if (gamesError) { setError(gamesError.message); setLoading(false); return; }
      if (!gameRows?.length) { setGames([]); setLoading(false); return; }
      const { data: versionRows, error: versionsError } = await supabase.from("game_versions").select("game_id, version_number, game_mode").in("game_id", gameRows.map((game) => game.id)).order("version_number", { ascending: false });
      if (versionsError) { setError(versionsError.message); setLoading(false); return; }
      const latestByGame = new Map<string, Version>();
      (versionRows as Version[] ?? []).forEach((version) => { if (!latestByGame.has(version.game_id)) latestByGame.set(version.game_id, version); });
      setGames((gameRows as Game[]).flatMap((game) => {
        const version = latestByGame.get(game.id);
        return version ? [{ ...game, mode: version.game_mode, version: version.version_number }] : [];
      }));
      setLoading(false);
    }
    void loadLibrary();
  }, []);

  const shownGames = useMemo(() => filter === "all" ? games : games.filter((game) => game.mode === filter), [filter, games]);
  const multiplayerCount = games.filter((game) => game.mode === "multiplayer").length;

  return <main className="footer-demo"><section className={`footer-phone ${styles.phone}`}>
    <div className={styles.content}>
      <div className={styles.topline}><p className="small-wordmark">plizzy</p><Link href="/footer/create" className={styles.createLink}>+ Create</Link></div>
      <p className={styles.eyebrow}>YOUR COLLECTION</p><h1>Your little worlds</h1><p className={styles.intro}>Every game you make, ready for another round.</p>
      <div className={styles.summary}><span><strong>{games.length}</strong> created</span><span><strong>{multiplayerCount}</strong> to play together</span></div>
      <div className={styles.filters} aria-label="Filter games">
        <button className={filter === "all" ? styles.active : ""} onClick={() => setFilter("all")}>All <span>{games.length}</span></button>
        <button className={filter === "single_player" ? styles.active : ""} onClick={() => setFilter("single_player")}>Solo</button>
        <button className={filter === "multiplayer" ? styles.active : ""} onClick={() => setFilter("multiplayer")}>Together</button>
      </div>
      {loading && <div className={styles.loading}><i /><i /><i /></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      {!loading && !error && shownGames.length === 0 && <div className={styles.empty}><span>✦</span><h2>{games.length ? "Nothing in this view yet" : "Your library is waiting"}</h2><p>{games.length ? "Try another filter to find your game." : "Create your first game and it will live here."}</p><Link href="/footer/create">Create a game</Link></div>}
      <div className={styles.grid}>{shownGames.map((game, index) => <article className={`${styles.card} ${index % 3 === 1 ? styles.pink : index % 3 === 2 ? styles.yellow : ""}`} key={game.id}>
        <div className={styles.cardTop}><span className={game.mode === "multiplayer" ? styles.multiBadge : styles.soloBadge}>{game.mode === "multiplayer" ? "♟  Together" : "✦  Solo"}</span><span className={styles.version}>v{game.version}</span></div>
        <div className={styles.cardArt} aria-hidden="true"><span>{game.mode === "multiplayer" ? "🎲" : "✨"}</span><i /><i /><i /></div>
        <h2>{game.title}</h2><p>{game.summary || "A fresh Plizzy game, ready for its big idea."}</p>
        <footer><span>{displayDate(game.created_at)}</span><span>{game.mode === "multiplayer" ? "Invite friends →" : "Play solo →"}</span></footer>
      </article>)}</div>
    </div><FooterNav active="library" />
  </section></main>;
}
