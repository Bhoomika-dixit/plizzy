"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppHeader from "@/app/components/app-header";
import { GameDefinitionV1, validateGameDefinition } from "@/agent-harness/game-definition";
import { createRuntime, dispatchTap, RuntimeState, tickRuntime } from "@/agent-harness/runtime";
import { GameDefinitionV2, GameEntityV2, validateGameDefinitionV2 } from "@/agent-harness/game-definition-v2";
import { createRuntimeV2, dispatchGameEventV2, entityDisplay, RuntimeStateV2, tickRuntimeV2 } from "@/agent-harness/runtime-v2";
import { SideScrollerSnapshot } from "@/catalogue/renderers/side-scroller";
import { executableRendererRegistry } from "@/catalogue/renderers/registry";
import { AssetVisual, resolveAssetVisual } from "@/catalogue/assets/runtime";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./playground.module.css";

type LoadedGame = { title: string; definition: GameDefinitionV1 | GameDefinitionV2 };
type StoredGame = { id: string; title: string; latest_version_id: string | null };
type StoredVersion = { id: string; game_mode: "single_player" | "multiplayer"; definition: unknown };

async function resolveStoredAssetUrls(definition: GameDefinitionV2, supabase: ReturnType<typeof getSupabaseClient>) {
  if (!supabase) return definition;
  const assets = await Promise.all(definition.assets.map(async (asset) => {
    const match = asset.value?.match(/^storage:\/\/([^/]+)\/(.+)$/);
    if (!match) return asset;
    const [, bucket, path] = match;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) throw new Error(`Could not load generated asset "${asset.id}".`);
    return { ...asset, value: data.signedUrl };
  }));
  return { ...definition, assets };
}

function LegacyGame({ title, definition }: { gameId: string; title: string; definition: GameDefinitionV1 }) {
  const [runtime, setRuntime] = useState<RuntimeState>(() => createRuntime(definition));
  const [actionNote, setActionNote] = useState("");
  useEffect(() => {
    if (runtime.status !== "playing" || !runtime.timerRunning) return;
    const interval = window.setInterval(() => setRuntime((current) => tickRuntime(definition, current)), 1000);
    return () => window.clearInterval(interval);
  }, [definition, runtime.status, runtime.timerRunning]);
  const score = typeof runtime.values.score === "number" ? runtime.values.score : 0;
  const phase = definition.phases.find((item) => item.id === runtime.phaseId);
  function tap(entityId: string) { const result = dispatchTap(definition, runtime, entityId); setRuntime(result.state); setActionNote(result.error ?? "Nice tap!"); window.setTimeout(() => setActionNote(""), 700); }
  return <GameFrame title={title} description={definition.metadata.description} visuals={definition.visuals} score={score} seconds={runtime.secondsRemaining} scoreLabel="Score" timerLabel={phase?.label ?? "Play"}>
    {runtime.status === "playing" ? <><div className={styles.board} role="application" aria-label={`${title} game board`}><p>Tap everything you can!</p>{definition.entities.map((entity) => { const present = runtime.entities[entity.id]; const motion = entity.motion === "bob" ? styles.bob : entity.motion === "none" ? "" : styles.float; return present?.visible ? <button key={entity.id} type="button" onClick={() => tap(entity.id)} className={`${styles.entity} ${motion}`} style={{ left: `${present.x}%`, top: `${present.y}%`, fontSize: `${entity.size}px` }} aria-label={`Tap ${entity.label}`}><span>{entity.emoji}</span></button> : null; })}{actionNote && <p className={styles.note} role="status">{actionNote}</p>}</div><p className={styles.hint}>This is a legacy V1 game.</p></> : <Result outcome="win" title={runtime.endReason || "Time is up!"} score={score} onRestart={() => setRuntime(createRuntime(definition))} />}
  </GameFrame>;
}

function matchesTarget(entity: GameEntityV2, target: { entityIds?: string[]; tags?: string[] }) {
  return Boolean(target.entityIds?.includes(entity.id) || target.tags?.some((tag) => entity.tags?.includes(tag)) || (!target.entityIds?.length && !target.tags?.length));
}

function SideScrollerGame({ title, definition }: { gameId: string; title: string; definition: GameDefinitionV2 }) {
  const SideScroller = executableRendererRegistry["side_scroller.v1"];
  const initialSeconds = definition.timer?.durationSeconds ?? 0;
  const [snapshot, setSnapshot] = useState<SideScrollerSnapshot>({ score: 0, secondsRemaining: initialSeconds, status: "playing" });
  const [runKey, setRunKey] = useState(0);
  const receiveSnapshot = useCallback((next: SideScrollerSnapshot) => setSnapshot(next), []);
  const receiveInteraction = useCallback(() => undefined, []);
  const restart = () => { setSnapshot({ score: 0, secondsRemaining: initialSeconds, status: "playing" }); setRunKey((value) => value + 1); };
  const resultKey = snapshot.resultTextKey ?? (snapshot.outcome === "lose" ? definition.outcomes.lose?.textKey ?? "result.loseTitle" : definition.outcomes.win.textKey);
  return <GameFrame title={title} description={definition.metadata.description} visuals={definition.visuals} score={snapshot.score} seconds={snapshot.secondsRemaining} scoreLabel={definition.texts["hud.scoreLabel"]} timerLabel={definition.texts["hud.timerLabel"]}>
    {snapshot.status === "playing" ? <><SideScroller key={runKey} definition={definition} onSnapshot={receiveSnapshot} onInteraction={receiveInteraction} /><p className={styles.hint}>Executable template: side_scroller.v1</p></> : <Result outcome={snapshot.outcome ?? "lose"} title={definition.texts[resultKey] ?? definition.texts["result.loseTitle"]} score={snapshot.score} onRestart={restart} />}
  </GameFrame>;
}

function GenericV2Game({ title, definition }: { gameId: string; title: string; definition: GameDefinitionV2 }) {
  const [runtime, setRuntime] = useState<RuntimeStateV2>(() => createRuntimeV2(definition));
  const [text, setText] = useState("");
  const [dragged, setDragged] = useState<string>();
  const pointerStart = useRef<{ x: number; y: number } | undefined>(undefined);
  useEffect(() => {
    if (runtime.status !== "playing" || !runtime.timerRunning) return;
    const interval = window.setInterval(() => setRuntime((current) => tickRuntimeV2(definition, current)), 1000);
    return () => window.clearInterval(interval);
  }, [definition, runtime.status, runtime.timerRunning]);
  const score = typeof runtime.values.score === "number" ? runtime.values.score : 0;
  const textInteraction = definition.interactions.find((item) => item.type === "text_input.v1");
  const directional = definition.interactions.find((item) => item.type === "swipe.v1" || item.type === "keyboard_move.v1");
  useEffect(() => {
    const keyboard = definition.interactions.find((item) => item.type === "keyboard_move.v1");
    if (!keyboard) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const directionByKey: Record<string, string> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down" };
      const direction = directionByKey[event.key];
      if (!direction) return;
      event.preventDefault();
      setRuntime((current) => dispatchGameEventV2(definition, current, { type: keyboard.event, direction }));
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [definition]);
  const boardStyle = useMemo(() => ({
    "--grid-columns": definition.renderer.config.columns ?? definition.renderer.config.lanes ?? 3,
    "--game-background-image": backgroundValue(definition),
  }) as React.CSSProperties, [definition]);

  function activate(entity: GameEntityV2) {
    const interaction = definition.interactions.find((item) => item.type !== "drag_drop.v1" && item.type !== "text_input.v1" && item.type !== "swipe.v1" && item.type !== "keyboard_move.v1" && matchesTarget(entity, item.target));
    if (interaction) setRuntime((current) => dispatchGameEventV2(definition, current, { type: interaction.event, entityId: entity.id }));
  }
  function submitText(event: FormEvent) { event.preventDefault(); if (!textInteraction || !text.trim()) return; setRuntime((current) => dispatchGameEventV2(definition, current, { type: textInteraction.event, text: text.trim() })); setText(""); }
  function direction(value: string) { if (directional) setRuntime((current) => dispatchGameEventV2(definition, current, { type: directional.event, direction: value })); }
  function finishSwipe(x: number, y: number) {
    const start = pointerStart.current; pointerStart.current = undefined;
    if (!start || directional?.type !== "swipe.v1") return;
    const dx = x - start.x; const dy = y - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    direction(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  }
  const rendererClass = styles[definition.renderer.id.split(".")[0].replace("card_grid", "cardGrid") as keyof typeof styles] ?? styles.arena;
  return <GameFrame title={title} description={definition.metadata.description} visuals={definition.visuals} score={score} seconds={runtime.secondsRemaining} scoreLabel={definition.texts["hud.scoreLabel"]} timerLabel={definition.texts["hud.timerLabel"]}>
    {runtime.status === "playing" ? <>
      <div className={`${styles.v2Board} ${rendererClass}`} style={boardStyle} role="application" aria-label={`${title} game board`} onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY }; }} onPointerUp={(event) => finishSwipe(event.clientX, event.clientY)}>
        <p className={styles.instructions}>{definition.texts["welcome.instructions"]}</p>
        <div className={styles.entityLayer}>{definition.entities.map((entity, index) => <V2Entity key={entity.id} entity={entity} runtime={runtime} index={index} total={definition.entities.length} renderer={definition.renderer.id} assetVisual={entity.content.kind === "asset" ? resolveAssetVisual(definition.assets, entity.content.value, "", entity.label) : undefined} onActivate={() => activate(entity)} onDrag={() => setDragged(entity.id)} onDrop={() => { if (dragged) setRuntime((current) => dispatchGameEventV2(definition, current, { type: "ENTITY_DROPPED", entityId: dragged, targetEntityId: entity.id })); setDragged(undefined); }} draggable={definition.interactions.some((item) => item.type === "drag_drop.v1" && matchesTarget(entity, item.target))} />)}</div>
        {textInteraction && <form className={styles.textInput} onSubmit={submitText}><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Type your answer" aria-label="Your answer" /><button type="submit">Submit</button></form>}
        {directional && <div className={styles.directions} aria-label="Movement controls">{["left", "up", "down", "right"].map((item) => <button type="button" key={item} onClick={() => direction(item)} aria-label={item}>{item === "left" ? "←" : item === "right" ? "→" : item === "up" ? "↑" : "↓"}</button>)}</div>}
      </div>
      <p className={styles.hint}>Built from {definition.renderer.id} and {definition.interactions.map((item) => item.type).join(", ")}.</p>
    </> : <Result outcome={runtime.outcome ?? "win"} title={definition.texts[runtime.resultTextKey ?? (runtime.outcome === "lose" ? definition.outcomes.lose?.textKey ?? "result.loseTitle" : definition.outcomes.win.textKey)] ?? definition.texts[runtime.outcome === "lose" ? "result.loseTitle" : "result.winTitle"]} score={score} onRestart={() => { setRuntime(createRuntimeV2(definition)); setText(""); }} />}
  </GameFrame>;
}

function V2Game(props: { gameId: string; title: string; definition: GameDefinitionV2 }) {
  return props.definition.renderer.id === "side_scroller.v1" ? <SideScrollerGame {...props} /> : <GenericV2Game {...props} />;
}

function V2Entity({ entity, runtime, index, total, renderer, assetVisual, onActivate, onDrag, onDrop, draggable }: { entity: GameEntityV2; runtime: RuntimeStateV2; index: number; total: number; renderer: string; assetVisual?: AssetVisual; onActivate(): void; onDrag(): void; onDrop(): void; draggable: boolean }) {
  const present = runtime.entities[entity.id];
  if (!present?.visible) return null;
  const angle = total ? (index / total) * Math.PI * 2 - Math.PI / 2 : 0;
  const absolute = renderer === "arena.v1" || renderer === "scene.v1" || renderer === "circles.v1";
  const x = renderer === "circles.v1" ? 50 + Math.cos(angle) * 34 : present.x;
  const y = renderer === "circles.v1" ? 52 + Math.sin(angle) * 34 : present.y;
  const behaviorClasses = entity.behaviours.map((item) => styles[item.id.split(".")[0] as keyof typeof styles] ?? "").join(" ");
  const display = entityDisplay(entity, present);
  const unchangedAsset = entity.content.kind === "asset" && display === entity.content.value;
  return <button type="button" className={`${styles.v2Entity} ${behaviorClasses} ${runtime.selectedEntityIds.includes(entity.id) ? styles.selected : ""}`} style={{ ...(absolute ? { left: `${x}%`, top: `${y}%`, position: "absolute", transform: "translate(-50%, -50%)" } : {}), ...(entity.grid ? { gridRow: entity.grid.row, gridColumn: entity.grid.column } : {}), fontSize: entity.size ? `${entity.size}px` : undefined }} onClick={onActivate} draggable={draggable} onDragStart={onDrag} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} aria-label={entity.label} aria-pressed={runtime.selectedEntityIds.includes(entity.id)}><span>{unchangedAsset && assetVisual?.kind === "image" ? <i className={styles.assetImage} style={{ backgroundImage: `url("${assetVisual.value}")` }} /> : unchangedAsset ? assetVisual?.value || "✦" : display}</span><small>{entity.label}</small></button>;
}

function backgroundValue(definition: GameDefinitionV2) {
  const id = definition.renderer.config.backgroundAssetId;
  const asset = definition.assets.find((item) => item.id === id && item.role === "background");
  if (!asset) return `linear-gradient(145deg, ${definition.visuals.backgroundColor}, ${definition.visuals.cardColor})`;
  const visual = resolveAssetVisual(definition.assets, id, "");
  return visual.kind === "image" ? `center / cover no-repeat url("${visual.value}")` : visual.value || `linear-gradient(145deg, ${definition.visuals.backgroundColor}, ${definition.visuals.cardColor})`;
}

function GameFrame({ title, description, visuals, score, seconds, scoreLabel, timerLabel, children }: { title: string; description: string; visuals: { backgroundColor: string; accentColor: string; textColor: string; cardColor: string }; score: number; seconds: number; scoreLabel: string; timerLabel: string; children: React.ReactNode }) {
  return <main className={styles.stage}><section className={styles.phone} style={{ "--game-bg": visuals.backgroundColor, "--game-accent": visuals.accentColor, "--game-text": visuals.textColor, "--game-card": visuals.cardColor } as React.CSSProperties}><AppHeader backHref="/footer/library" /><div className={styles.content}><p className={styles.eyebrow}>SOLO PLAYGROUND</p><h1>{title}</h1><p className={styles.description}>{description}</p><div className={styles.hud}><div><small>{scoreLabel}</small><strong>{score}</strong></div><div><small>{timerLabel}</small><strong>{seconds ? `${seconds}s` : "∞"}</strong></div></div>{children}</div></section></main>;
}

function Result({ outcome, title, score, onRestart }: { outcome: "win" | "lose"; title: string; score: number; onRestart(): void }) {
  return <div className={styles.result}><span>{outcome === "win" ? "✦" : "◇"}</span><p className={styles.eyebrow}>ROUND COMPLETE</p><h2>{title}</h2><strong>{score}</strong><p>points scored. This game remains saved in your library.</p><div><button type="button" onClick={onRestart}>Play again</button><Link href="/footer/library">Back to library</Link></div></div>;
}

export default function GamePlayground({ gameId }: { gameId: string }) {
  const [game, setGame] = useState<LoadedGame | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { async function loadGame() {
    const supabase = getSupabaseClient(); if (!supabase) { setError("Supabase is not connected yet."); return; }
    const { data: { user } } = await supabase.auth.getUser(); if (!user) { setError("Please sign in to play this game."); return; }
    const { data: gameRow, error: gameError } = await supabase.from("games").select("id, title, latest_version_id").eq("id", gameId).maybeSingle();
    if (gameError || !gameRow) { setError(gameError?.message ?? "This game is no longer available."); return; }
    const stored = gameRow as StoredGame; if (!stored.latest_version_id) { setError("This game does not have a playable version yet."); return; }
    const { data: versionRow, error: versionError } = await supabase.from("game_versions").select("id, game_mode, definition").eq("id", stored.latest_version_id).maybeSingle();
    if (versionError || !versionRow) { setError(versionError?.message ?? "The playable version could not be found."); return; }
    const version = versionRow as StoredVersion; if (version.game_mode !== "single_player") { setError("Multiplayer execution will be added after the single-player runtime is complete."); return; }
    const v2 = validateGameDefinitionV2(version.definition);
    if (v2.valid) setGame({ title: stored.title, definition: await resolveStoredAssetUrls(v2.value, supabase) });
    else { const v1 = validateGameDefinition(version.definition, "single_player"); if (v1.valid) setGame({ title: stored.title, definition: v1.value }); else { setError("This saved game definition is not compatible with a supported runtime."); return; } }
    await supabase.from("user_games").upsert({ user_id: user.id, game_id: stored.id, is_saved: true, last_played_at: new Date().toISOString() }, { onConflict: "user_id,game_id" });
  } void loadGame(); }, [gameId]);
  if (error) return <main className={styles.stage}><section className={styles.phone}><AppHeader backHref="/footer/library" /><div className={styles.failure}><span>✦</span><h1>Not ready to play</h1><p>{error}</p><Link href="/footer/library">Back to your library</Link></div></section></main>;
  if (!game) return <main className={styles.stage}><section className={styles.phone}><AppHeader backHref="/footer/library" /><div className={styles.status}><i /><i /><i /><p>Building your playground…</p></div></section></main>;
  return game.definition.schemaVersion === 2 ? <V2Game gameId={gameId} title={game.title} definition={game.definition} /> : <LegacyGame gameId={gameId} title={game.title} definition={game.definition} />;
}
