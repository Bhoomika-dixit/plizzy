"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import FooterNav from "@/app/components/footer-nav";
import AppHeader from "@/app/components/app-header";
import styles from "./create-game.module.css";

type GameMode = "single_player" | "multiplayer";

const modes: Array<{ mode: GameMode; title: string; description: string; icon: string }> = [
  { mode: "multiplayer", title: "Play together", description: "Solve a shared board with friends in an invite-only room.", icon: "🎲" },
  { mode: "single_player", title: "Single player", description: "Make something just for you. You can play it locally whenever you like.", icon: "✦" },
];

export default function CreateGame({ roomId }: { roomId?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<GameMode | null>(roomId ? "multiplayer" : null);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  function continueToCreator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!mode) return;
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setError("Give your game a name first."); return; }
    router.push(`/create-game?mode=${mode}&title=${encodeURIComponent(trimmedTitle)}${roomId ? `&room=${encodeURIComponent(roomId)}` : ""}`);
  }

  return <main className="footer-demo"><section className={`footer-phone ${styles.phone}`}>
    <AppHeader />
    <div className={styles.content}>
      <p className={styles.overline}>CREATE A GAME</p>
      <h1>Who&apos;s playing?</h1>
      <p className={styles.intro}>{roomId ? "Create a cooperative game for this room." : "Choose a solo adventure or bring your friends along."}</p>
      <div className={styles.options} role="radiogroup" aria-label="Game type">
        {!roomId && modes.map((item) => <button key={item.mode} type="button" role="radio" aria-checked={mode === item.mode} className={`${styles.card} ${mode === item.mode ? styles.selected : ""}`} onClick={() => { setMode(item.mode); setError(""); }}>
          <span className={styles.icon} aria-hidden="true">{item.icon}</span><span><strong>{item.title}</strong><small>{item.description}</small></span><span className={styles.check} aria-hidden="true">{mode === item.mode ? "✓" : ""}</span>
        </button>)}
      </div>
      {mode && <form className={styles.form} onSubmit={continueToCreator}>
        <label>What should we call it?<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="My brilliant game" maxLength={120} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-action" type="submit">Continue to game creator</button>
      </form>}
      {!mode && <p className={styles.hint}>{roomId ? "Single-player games can still be created from the Create tab." : "Pick one to continue."}</p>}
      <Link className={styles.back} href="/">Back to home</Link>
    </div>
    <FooterNav active="create" />
  </section></main>;
}
