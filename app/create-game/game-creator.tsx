"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icon from "@/app/components/ui-icon";
import PlayArt from "@/app/components/play-art";
import PenguinLoader from "@/app/components/penguin-loader";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./game-creator.module.css";

type GameMode = "single_player" | "multiplayer";
type GeneratedGame = { gameId: string; versionId: string; repairCount?: number };
const examples = ["A 4×4 memory card game with ocean animals", "A timed space trivia game with four choices", "A detective game where I inspect clues and name the culprit"];

export default function GameCreator({ mode, title, roomId, savedGame, initialIdea = "" }: { mode: GameMode; title: string; roomId?: string; savedGame?: GeneratedGame; initialIdea?: string }) {
  const router = useRouter();
  const [idea, setIdea] = useState(initialIdea); const [error, setError] = useState(""); const [success, setSuccess] = useState(""); const [isSubmitting, setIsSubmitting] = useState(false);
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
  const suggestions = mode==="multiplayer"?["A space trivia race for 3 players. Everyone gets their own board. Highest score wins.","A cooperative memory game for 4 friends with ocean animal cards on a shared board.","A turn-based strategy game for 2 people on a small grid."]:examples;
  return <div className={styles.creator}><Link href={"/footer/create?mode="+mode+"&title="+encodeURIComponent(title)+"&idea="+encodeURIComponent(idea)+(roomId?"&room="+encodeURIComponent(roomId):"")} className="text-link"><Icon name="back" size={16}/>Back to the scene</Link><div className={styles.layout}><section className={styles.panel}><div className="step-label"><span className="done"><Icon name="check" size={13}/></span>Set the scene<i/><span className="current">2</span>Dream it up</div><span className="badge"><Icon name={mode==="multiplayer"?"people":"play"} size={12}/>{roomId?"For your room":mode==="multiplayer"?"With friends":"Just for you"}</span><h1>What if we played…</h1><p className={styles.subtitle}>Tell us the idea. We&apos;ll turn it into something you can play.</p><div className={styles.gameName}><Icon name="spark" size={18}/><span>{title}</span></div>{pendingGame&&<p className="form-success" role="status">Your game is saved. Retry room setup to finish bringing everyone together.</p>}<form onSubmit={createGame}><label className="field">Your little big idea<textarea value={idea} onChange={event=>setIdea(event.target.value)} maxLength={500} disabled={Boolean(pendingGame)||isSubmitting} placeholder={mode==="multiplayer"?"A space quiz for 3 friends, where everyone races to answer…":"A memory game in a tiny ocean, with matching sea creatures…"} aria-label="Describe your game idea" rows={5}/></label><div className={styles.promptFoot}><span>Tell us the rules, the mood, and who&apos;s playing.</span><span>{idea.length}/500</span></div><button type="button" className={styles.surprise} disabled={Boolean(pendingGame)||isSubmitting} onClick={()=>setIdea(mode==="multiplayer"?suggestions[Math.floor(Math.random()*suggestions.length)]:examples[Math.floor(Math.random()*examples.length)])}><Icon name="spark" size={15}/>Give me a little spark</button>{isSubmitting&&<PenguinLoader label={pendingGame?"Getting your room ready…":undefined}/ >}{error&&<p className="form-error" role="alert">{error}</p>}{success&&<p className="form-success" role="status">{success}</p>}<button className="button" type="submit" disabled={isSubmitting}>{isSubmitting?pendingGame?"Opening your room…":"Bringing your idea to life…":pendingGame?"Retry room setup":"Make my game"}{!isSubmitting&&<Icon name="arrow" size={18}/>}</button></form><p className={styles.saveNote}><Icon name="check" size={13}/>Made for you. Saved to your library.</p></section><aside className={styles.aside}><div className={styles.art}><PlayArt kind="planet"/><span>There&apos;s a world in there.</span></div><div className={styles.inspiration}><p className="eyebrow">NOT SURE WHERE TO START?</p><h2>Borrow a little inspiration.</h2>{suggestions.map((example,index)=><button key={example} type="button" disabled={Boolean(pendingGame)||isSubmitting} onClick={()=>setIdea(example)}><span>0{index+1}</span><span>{example}</span><Icon name="plus" size={16}/></button>)}<small>Tap an idea, then make it wonderfully yours.</small></div></aside></div></div>;
}
