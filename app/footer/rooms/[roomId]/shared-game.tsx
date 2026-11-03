"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameDefinitionV2 } from "@/agent-harness/game-definition-v2";
import type { RuntimeStateV2 } from "@/agent-harness/runtime-v2";
import SideScroller, { type SimulationState } from "@/catalogue/renderers/side-scroller";
import Link from "next/link";
import Icon from "@/app/components/ui-icon";
import PlayArt from "@/app/components/play-art";
import { GenericV2Game } from "@/app/play/[gameId]/playground";
import { multiplayerRequest, MultiplayerRequestError } from "@/lib/multiplayer/client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isSession, playerBoard, projectPhysicsBoard, PHYSICS_INPUT_WINDOW_MS, type MultiplayerInput, type SessionState } from "@/agent-harness/multiplayer-runtime";
import styles from "../rooms.module.css";

type Snapshot = { round: { room_id: string; revision: number; game_version_id: string; state: RuntimeStateV2 } | null; definition?: GameDefinitionV2; host: boolean; userId: string; serverNow?: number; clockOffset?: number };

export default function SharedGame({ roomId, versionId, title, members = [] }: { roomId: string; versionId?: string; title: string; members?: { id: string; name: string }[] }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const live = useRef(false);
  const queue = useRef(Promise.resolve());
  const syncing = useRef<Promise<void> | null>(null);
  const physicsWrites = useRef(0);
  const current = useRef<Snapshot | null>(null);
  const request = useCallback((action: string, event?: MultiplayerInput) => {
    const run = async () => {
      const physicsInput = action === "event" && event?.type === "IMPULSE" && Array.isArray(event.samples);
      if (physicsInput) physicsWrites.current++;
      if (action !== "sync") setBusy(true);
      try {
        const previous = current.current;
        let next: Snapshot;
        try { next = await multiplayerRequest({ action, roomId, versionId, revision: previous?.round?.revision, event }) as Snapshot; }
        catch (cause) {
          if (!(cause instanceof MultiplayerRequestError) || cause.status !== 409) throw cause;
          const fresh = await multiplayerRequest({ action: "sync", roomId }) as Snapshot;
          if (action === "event" && previous?.round && fresh.round && (previous.round.game_version_id !== fresh.round.game_version_id || isSession(previous.round.state) && isSession(fresh.round.state) && previous.round.state.session.startedAt !== fresh.round.state.session.startedAt)) throw new Error("A new round started. Choose your move again.");
          // A conflict guarantees the first write did not commit. Revalidate once
          // against the latest board; never retry an ambiguous network failure.
          next = action === "sync" ? fresh : await multiplayerRequest({ action, roomId, versionId, revision: fresh.round?.revision, event }) as Snapshot;
        }
        if (!current.current?.round || !next.round || next.round.revision >= current.current.round.revision) {
          next.clockOffset = next.serverNow ? next.serverNow - Date.now() : current.current?.clockOffset;
          current.current = next; setSnapshot(next);
        }
        setError("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Connection interrupted. Reconnecting…");
        if (action !== "sync") {
          try {
            const next = await multiplayerRequest({ action: "sync", roomId }) as Snapshot;
            if (!current.current?.round || !next.round || next.round.revision >= current.current.round.revision) {
              current.current = next; setSnapshot(next);
            }
          } catch { /* The subscription and recovery sync will retry after reconnect. */ }
        }
      }
      finally { if (physicsInput) physicsWrites.current--; setBusy(false); }
    };
    // A recovery read must not sit ahead of latency-sensitive input batches.
    // Concurrent server writes still use compare-and-set and revalidation.
    if (action === "sync") {
      if (!syncing.current) syncing.current = run().finally(() => { syncing.current = null; });
      return syncing.current;
    }
    if (action === "event" && event?.type === "IMPULSE" && Array.isArray(event.samples)) return run();
    queue.current = queue.current.then(run);
    return queue.current;
  }, [roomId, versionId]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (!physicsWrites.current) await request("sync");
      const playing = current.current?.round?.state.status === "playing";
      if (!cancelled) timer = setTimeout(poll, playing && current.current?.definition?.renderer.id === "side_scroller.v1" ? 200 : playing ? 1000 : live.current ? 30000 : 5000);
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [request, snapshot?.round?.state.status, snapshot?.definition?.renderer.id]);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    const channel = supabase.channel(`room-round:${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "multiplayer_rounds", filter: `room_id=eq.${roomId}` }, (payload) => {
        const round = payload.new as NonNullable<Snapshot["round"]>;
        const previous = current.current;
        if (!previous?.round || previous.round.game_version_id !== round.game_version_id) { void request("sync"); return; }
        if (round.revision <= previous.round.revision) return;
        const next = { ...previous, round };
        current.current = next; setSnapshot(next);
      }).subscribe((status) => {
        live.current = status === "SUBSCRIBED";
        setConnected(live.current);
        if (live.current) void request("sync");
      });
    const resume = () => { if (document.visibilityState === "visible") void request("sync"); };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => { live.current = false; document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume); void supabase.removeChannel(channel); };
  }, [roomId, request]);
  const dispatch = useCallback((event: MultiplayerInput) => request("event", event), [request]);
  const restart = useCallback(() => { void request("start"); }, [request]);
  const round = snapshot?.round;
  return <section className={styles.shared} aria-label="Shared game">
    <div className={styles.sharedHeading}><div><p className="eyebrow">A LITTLE FRIENDLY PLAY</p><h2>{round ? "On the playground" : "Ready, set, together."}</h2></div><span className={styles.liveBadge} role="status"><i className={connected ? styles.connected : ""} />{connected ? "Room is live" : "Connecting…"}</span></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {!snapshot && <p role="status">Connecting to your room…</p>}
    {snapshot && !round && <div className={styles.lobby}><PlayArt /><h3>Your next good time starts here.</h3><p>{snapshot.host ? "Choose a game from the shelf. When your people are here, start the first round." : "Make yourself comfortable. Your host will start the game when everyone is here."}</p><span>{title}</span></div>}
    {snapshot?.host && versionId && <button className="button" disabled={busy} onClick={restart}><Icon name="play" size={16} />{round ? "Start a new round" : "Start round"}</button>}
    {round && snapshot?.definition && (isSession(round.state)
      ? <SessionGame definition={snapshot.definition} state={round.state} userId={snapshot.userId} members={members} busy={busy} clockOffset={snapshot.clockOffset ?? 0} title={title} dispatch={dispatch} restart={snapshot.host ? restart : () => setError("Only the host can restart.")} />
      : <div className={styles.lobby}><PlayArt kind="cards" /><h3>This little world needs a fresh start.</h3><p>This older game needs to be recreated for the updated multiplayer experience.</p>{snapshot.host && <Link href={`/footer/create?room=${roomId}`} className="button button-secondary">Create a new game <Icon name="plus" size={16} /></Link>}</div>)}
  </section>;
}

function SessionGame({ definition, state, userId, members, busy, clockOffset, title, dispatch, restart }: { definition: GameDefinitionV2; state: SessionState; userId: string; members: { id: string; name: string }[]; busy: boolean; clockOffset: number; title: string; dispatch(event: MultiplayerInput): Promise<void>; restart(): void }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 250); return () => window.clearInterval(timer); }, []);
  const index = state.session.players.findIndex(player => player.id === userId);
  const remaining = Math.max(0, Math.ceil((state.session.startedAt - now - clockOffset) / 1000));
  const disabled = busy || remaining > 0 || index < 0 || state.status !== "playing" || definition.multiplayer?.turns === "round_robin" && index !== state.session.turn;
  const board = playerBoard(definition, state, userId);
  const winners = state.session.players.filter(player => state.session.winners.includes(player.id)).map(player => player.symbol).join(", ");
  const result = state.session.winners.length > 1 && definition.multiplayer?.objective === "competitive" ? `Round tied · ${winners}` : winners ? `Round complete · ${winners} won` : "Round complete · no winner";
  return <div>
    <p className={styles.turnStatus} role="status">{remaining ? `A little countdown… ${remaining}` : state.status === "finished" ? result : index < 0 ? "You’re watching this round" : definition.multiplayer?.turns === "round_robin" ? `${index === state.session.turn ? "Your turn" : `${state.session.players[state.session.turn].symbol}'s turn`} · You are ${state.session.players[index].symbol}` : `Playing as ${state.session.players[index].symbol}`}</p>
    <ol className={styles.scoreboard} aria-label="Player scores">{state.session.players.map(player => <li className={state.session.winners.includes(player.id) ? styles.winningScore : ""} key={player.id}><span className={styles.playerSymbol}>{player.symbol}</span><span><strong>{members.find(member => member.id === player.id)?.name ?? player.symbol}{player.id === userId ? " (you)" : ""}</strong><small>{player.outcome ? "Round complete" : "In the game"}</small></span><b>{player.score}</b></li>)}</ol>
    {state.status === "finished" ? <div className={styles.roundResult}><span><Icon name="spark" size={32} /></span><h3>{state.session.winners.length ? "A little round. A big good time." : "Every round is a new adventure."}</h3><p>The host can start another round whenever you&apos;re ready.</p></div> : definition.multiplayer?.board === "individual" && board.status === "finished" ? <p className={styles.turnStatus}>Your board is complete. Cheering on the rest of the bunch…</p> : definition.renderer.id === "side_scroller.v1"
      ? <PhysicsBoard key={`${state.session.startedAt}:${userId}`} definition={definition} state={state} userId={index < 0 ? state.session.players[0].id : userId} clockOffset={clockOffset} disabled={remaining > 0 || index < 0 || board.status !== "playing"} dispatch={dispatch} />
      : <fieldset disabled={disabled} className={styles.sharedBoard}><GenericV2Game key={state.session.startedAt} gameId="session" title={definition.metadata.title || title} definition={definition} shared={{ state: board, dispatch, restart, disabled }} /></fieldset>}
  </div>;
}

function PhysicsBoard({ definition, state, userId, disabled, clockOffset, dispatch }: { definition: GameDefinitionV2; state: SessionState; userId: string; disabled: boolean; clockOffset: number; dispatch(event: MultiplayerInput): Promise<void> }) {
  const [controlled, setControlled] = useState<SimulationState>();
  const localInputs = useRef<number[]>([]);
  const unsent = useRef<number[]>([]);
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const flush = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      while (mounted.current && unsent.current.length) {
        const samples = unsent.current.splice(0, 16);
        await dispatch({ type: "IMPULSE", samples });
      }
    } finally { sending.current = false; }
  }, [dispatch]);
  useEffect(() => {
    let frame = 0;
    const render = () => {
      localInputs.current = localInputs.current.filter(at => at > state.session.clock);
      const target = Math.max(state.session.clock, Math.min(Date.now() + clockOffset, state.session.clock + PHYSICS_INPUT_WINDOW_MS + 1000));
      const { physics, board } = projectPhysicsBoard(definition, state, userId, target, localInputs.current);
      setControlled({ playerY: physics.y, velocityY: physics.velocity, obstacles: physics.obstacles, seed: physics.seed, nextObstacleId: physics.nextId, elapsed: physics.elapsed, sinceSpawn: physics.sinceSpawn, score: Number(board.values.score ?? 0), secondsRemaining: board.secondsRemaining, status: board.status, outcome: board.outcome, resultTextKey: board.resultTextKey });
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [definition, state, userId, clockOffset]);
  if (!controlled) return <p>Waiting for the server simulation…</p>;
  return <><p>Score: {controlled.score}{definition.timer ? ` · ${controlled.secondsRemaining}s` : ""}</p><SideScroller definition={definition} onInteraction={() => undefined} onSnapshot={() => undefined}
    controlled={controlled}
    onImpulse={() => {
      const at = Math.round(Date.now() + clockOffset);
      if (disabled || at - (localInputs.current.at(-1) ?? state.session.lastInputAt?.[userId] ?? 0) < 100 || unsent.current.length >= 16) return false;
      localInputs.current.push(at); unsent.current.push(at); void flush(); return true;
    }} /></>;
}
