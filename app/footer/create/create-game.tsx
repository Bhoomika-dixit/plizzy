"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import FooterNav from "@/app/components/footer-nav";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./create-game.module.css";

type GameMode = "single_player" | "multiplayer";

const modes: Array<{ mode: GameMode; title: string; description: string; icon: string }> = [
  { mode: "single_player", title: "Single player", description: "Make something just for you. You can play it locally whenever you like.", icon: "✦" },
  { mode: "multiplayer", title: "Multiplayer", description: "Make a game night. We’ll create a room for your friends to join.", icon: "♟" },
];

function makeInviteCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => characters[byte % characters.length]).join("");
}

function draftDefinition(mode: GameMode) {
  return {
    schemaVersion: 1,
    metadata: { status: "draft", launchMode: mode },
    config: { mode },
    state: {}, players: {}, entities: [], scenes: [], actions: [], rules: [], phases: [], winConditions: [], visuals: {},
  };
}

export default function CreateGame() {
  const [mode, setMode] = useState<GameMode | null>(null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function createDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode) return;
    const supabase = getSupabaseClient();
    if (!supabase) { setError("Supabase is not connected yet. Add the public project URL and key to .env.local."); return; }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Please sign in before creating a game."); return; }

    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setError("Give your game a name first."); return; }

    setError(""); setSuccess(""); setIsSubmitting(true);
    const { data: game, error: gameError } = await supabase
      .from("games")
      .insert({ creator_id: user.id, title: trimmedTitle, summary: null, visibility: "private" })
      .select("id")
      .single();
    if (gameError || !game) { setError(gameError?.message ?? "We couldn’t create that game."); setIsSubmitting(false); return; }

    const { data: version, error: versionError } = await supabase
      .from("game_versions")
      .insert({
        game_id: game.id,
        version_number: 1,
        prompt: `Draft ${mode === "single_player" ? "single-player" : "multiplayer"} game: ${trimmedTitle}`,
        rules_markdown: "# Draft\n\nAdd the game rules in the creator next.",
        min_players: mode === "single_player" ? 1 : 2,
        max_players: mode === "single_player" ? 1 : 8,
        game_mode: mode,
        definition: draftDefinition(mode),
      })
      .select("id")
      .single();
    if (versionError || !version) { setError(versionError?.message ?? "The game was created, but its first version could not be saved."); setIsSubmitting(false); return; }

    const { error: latestVersionError } = await supabase.from("games").update({ latest_version_id: version.id }).eq("id", game.id);
    if (latestVersionError) { setError(latestVersionError.message); setIsSubmitting(false); return; }

    if (mode === "multiplayer") {
      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .insert({ host_id: user.id, name: `${trimmedTitle} room`, invite_code: makeInviteCode(), visibility: "invite_only" })
        .select("id, invite_code")
        .single();
      if (roomError || !room) { setError(roomError?.message ?? "Your game is ready, but we couldn’t create its room."); setIsSubmitting(false); return; }

      const [{ error: membershipError }, { error: roomGameError }] = await Promise.all([
        supabase.from("room_members").insert({ room_id: room.id, user_id: user.id, role: "host" }),
        supabase.from("room_games").insert({ room_id: room.id, game_version_id: version.id, added_by: user.id, position: 0 }),
      ]);
      if (membershipError || roomGameError) { setError(membershipError?.message ?? roomGameError?.message ?? "Your room could not be fully prepared."); setIsSubmitting(false); return; }
      setSuccess(`Your multiplayer draft is ready. Invite code: ${room.invite_code}`);
    } else {
      setSuccess("Your single-player draft is ready. Next, add its rules and visuals.");
    }
    setIsSubmitting(false);
  }

  return <main className="footer-demo"><section className={`footer-phone ${styles.phone}`}>
    <div className={styles.content}>
      <p className={styles.wordmark}>plizzy</p>
      <p className={styles.overline}>CREATE A GAME</p>
      <h1>Who&apos;s playing?</h1>
      <p className={styles.intro}>Start with a game type. You can shape all the wonderfully silly details next.</p>
      <div className={styles.options} role="radiogroup" aria-label="Game type">
        {modes.map((item) => <button key={item.mode} type="button" role="radio" aria-checked={mode === item.mode} className={`${styles.card} ${mode === item.mode ? styles.selected : ""}`} onClick={() => { setMode(item.mode); setError(""); setSuccess(""); }}>
          <span className={styles.icon} aria-hidden="true">{item.icon}</span><span><strong>{item.title}</strong><small>{item.description}</small></span><span className={styles.check} aria-hidden="true">{mode === item.mode ? "✓" : ""}</span>
        </button>)}
      </div>
      {mode && <form className={styles.form} onSubmit={createDraft}>
        <label>What should we call it?<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="My brilliant game" maxLength={120} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {success && <p className={styles.success} role="status">{success}</p>}
        <button className="primary-action" type="submit" disabled={isSubmitting}>{isSubmitting ? "Setting it up…" : mode === "multiplayer" ? "Create game room" : "Create game"}</button>
      </form>}
      {!mode && <p className={styles.hint}>Pick one to continue.</p>}
      <Link className={styles.back} href="/">Back to home</Link>
    </div>
    <FooterNav active="create" />
  </section></main>;
}
