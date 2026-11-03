"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Icon from "@/app/components/ui-icon";
import PlayArt from "@/app/components/play-art";

import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./game-library.module.css";

type GameMode = "single_player" | "multiplayer";
type Game = { id: string; title: string; summary: string | null; created_at: string };
type Version = { id: string; game_id: string; version_number: number; game_mode: GameMode };
type LibraryGame = Game & { mode: GameMode; version: number; versionId: string; roomId?: string };

function displayDate(value: string) { return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value)); }

export default function GameLibrary() {
  const [query,setQuery]=useState(""); const [sort,setSort]=useState("newest");
  const [games, setGames] = useState<LibraryGame[]>([]); const [filter, setFilter] = useState<"all" | GameMode>("all"); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  useEffect(() => { async function loadLibrary() {
    const supabase = getSupabaseClient();
    if (!supabase) { setError("Supabase is not connected yet."); setLoading(false); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sign in to see the games you create."); setLoading(false); return; }
    const { data: gameRows, error: gamesError } = await supabase.from("games").select("id, title, summary, created_at").eq("creator_id", user.id).eq("is_archived", false).order("created_at", { ascending: false });
    if (gamesError) { setError(gamesError.message); setLoading(false); return; }
    if (!gameRows?.length) { setGames([]); setLoading(false); return; }
    const { data: versionRows, error: versionsError } = await supabase.from("game_versions").select("id, game_id, version_number, game_mode").in("game_id", gameRows.map((game) => game.id)).order("version_number", { ascending: false });
    if (versionsError) { setError(versionsError.message); setLoading(false); return; }
    const latestByGame = new Map<string, Version>();
    (versionRows as Version[] ?? []).forEach((version) => { if (!latestByGame.has(version.game_id)) latestByGame.set(version.game_id, version); });
    const multiplayerVersions = [...latestByGame.values()].filter((version) => version.game_mode === "multiplayer").map((version) => version.id);
    const roomByVersion = new Map<string, string>();
    if (multiplayerVersions.length) {
      const { data: roomGames, error: roomsError } = await supabase.from("room_games").select("room_id, game_version_id").in("game_version_id", multiplayerVersions);
      if (roomsError) { setError(roomsError.message); setLoading(false); return; }
      for (const entry of roomGames ?? []) roomByVersion.set(entry.game_version_id, entry.room_id);
    }
    setGames((gameRows as Game[]).flatMap((game) => { const version = latestByGame.get(game.id); return version ? [{ ...game, mode: version.game_mode, version: version.version_number, versionId: version.id, roomId: roomByVersion.get(version.id) }] : []; })); setLoading(false);
  } void loadLibrary(); }, []);
  const shownGames = useMemo(() => games.filter(game=>(filter==="all"||game.mode===filter)&&game.title.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==="title"?a.title.localeCompare(b.title):new Date(b.created_at).getTime()-new Date(a.created_at).getTime()), [filter,games,query,sort]); const multiplayerCount = games.filter((game) => game.mode === "multiplayer").length;
  return <div><div className="page-heading"><div><p className="eyebrow">YOUR COLLECTION OF LITTLE WORLDS</p><h1>The good ones live here.</h1><p>Made by you. Ready whenever you are.</p></div><Link href="/footer/create" className="button button-small"><Icon name="plus" size={16}/>New game</Link></div><div className={styles.collectionBar}><span><Icon name="library" size={18}/><strong>{loading?"—":games.length}</strong> creations</span><span><Icon name="people" size={18}/><strong>{loading?"—":multiplayerCount}</strong> to play together</span><span className={styles.collectionNote}>A little more you with every idea.</span></div><div className={styles.toolbar}><div className={styles.filters} aria-label="Filter games">{([{value:"all",label:"All games"},{value:"single_player",label:"Just me"},{value:"multiplayer",label:"With friends"}] as const).map(item=><button key={item.value} aria-pressed={filter===item.value} className={filter===item.value?styles.active:""} onClick={()=>setFilter(item.value)}>{item.label}</button>)}</div><div className={styles.searchAndSort}><label className="search-field"><Icon name="search" size={17}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Find a little world…" aria-label="Search your games"/></label><select value={sort} onChange={event=>setSort(event.target.value)} aria-label="Sort games"><option value="newest">Newest first</option><option value="title">A to Z</option></select></div></div>{loading&&<div className={styles.grid} role="status" aria-label="Loading your games">{[0,1,2].map(item=><div className="skeleton" key={item}/>)}</div>}{error&&<p className="form-error" role="alert">{error}</p>}{!loading&&!error&&shownGames.length===0&&<div className="empty-state"><PlayArt kind="cards"/><h2>{games.length?"No little worlds found":"Your next favourite game starts here."}</h2><p>{games.length?"Try a different name or filter. Your creations haven’t gone anywhere.":"Create your first game. We’ll keep it right here, ready for another round."}</p>{games.length?<button type="button" className="button button-secondary" onClick={()=>{setFilter("all");setQuery("");}}>Show all games</button>:<Link href="/footer/create" className="button">Create a game <Icon name="plus" size={16}/></Link>}</div>}<div className={styles.grid} aria-live="polite">{shownGames.map((game,index)=><article className={styles.card} key={game.id}><div className={styles.cardArt+" "+styles["tone"+index%3]}><PlayArt kind={game.mode==="multiplayer"?"cards":index%2?"planet":"puzzle"}/><span className="badge"><Icon name={game.mode==="multiplayer"?"people":"play"} size={11}/>{game.mode==="multiplayer"?"With friends":"Just me"}</span></div><div className={styles.cardCopy}><h2>{game.title}</h2><p>{game.summary||"Your imagination, now playable."}</p><footer><span>{displayDate(game.created_at)}</span><Link href={game.mode==="multiplayer"?(game.roomId?"/footer/rooms/"+game.roomId:"/create-game?mode=multiplayer&title="+encodeURIComponent(game.title)+"&resumeGame="+game.id+"&resumeVersion="+game.versionId):"/play/"+game.id}>{game.mode==="multiplayer"?(game.roomId?"Open room":"Finish room setup"):"Let’s play"}<Icon name="arrow" size={16}/></Link></footer></div></article>)}</div></div>;
}
