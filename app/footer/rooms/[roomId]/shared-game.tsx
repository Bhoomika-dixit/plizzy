"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GameDefinitionV2 } from "@/agent-harness/game-definition-v2";
import type { GameEventV2, RuntimeStateV2 } from "@/agent-harness/runtime-v2";
import { GenericV2Game } from "@/app/play/[gameId]/playground";
import { multiplayerRequest } from "@/lib/multiplayer/client";
import { getSupabaseClient } from "@/lib/supabase/client";
import { isTicTacToe } from "@/lib/multiplayer/tic-tac-toe";
import styles from "../rooms.module.css";

type Snapshot = { round: { room_id: string; revision: number; game_version_id: string; state: RuntimeStateV2 } | null; definition?: GameDefinitionV2; host: boolean; userId: string };

export default function SharedGame({ roomId, versionId, title }: { roomId: string; versionId?: string; title: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const live = useRef(false);
  const queue = useRef(Promise.resolve());
  const current = useRef<Snapshot | null>(null);
  const request = useCallback((action: string, event?: GameEventV2) => {
    queue.current = queue.current.then(async () => {
      if (action !== "sync") setBusy(true);
      try {
        const previous = current.current;
        const atomicMove = action === "event" && previous?.round?.state.values.engine === "tic_tac_toe.v1";
        const result = await multiplayerRequest(atomicMove
          ? { action: "tic_move", roomId, revision: previous.round?.revision, entityId: event?.entityId }
          : { action, roomId, versionId, revision: previous?.round?.revision, event });
        const next = atomicMove && previous ? { ...previous, round: result.round } : result as Snapshot;
        if (!current.current?.round || !next.round || next.round.revision >= current.current.round.revision) {
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
      finally { setBusy(false); }
    });
    return queue.current;
  }, [roomId, versionId]);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await request("sync");
      if (!cancelled) timer = setTimeout(poll, current.current?.round?.state.timerRunning ? 1000 : live.current ? 30000 : 5000);
    }
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [request]);
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
  const dispatch = useCallback((event: GameEventV2) => { void request("event", event); }, [request]);
  const restart = useCallback(() => { void request("start"); }, [request]);
  const round = snapshot?.round;
  return <section className={styles.shared} aria-label="Shared game">
    <h2>Play together</h2><p role="status">{connected ? "Live · Supabase Realtime connected" : "Connecting live updates…"}</p>
    {error && <p role="alert">{error}</p>}
    {!snapshot && <p role="status">Connecting to your room…</p>}
    {snapshot?.host && versionId && <button disabled={busy} onClick={restart}>{round ? "Start a new round" : "Start round"}</button>}
    {snapshot && !round && !snapshot.host && <p role="status">Waiting for the host to start…</p>}
    {round && snapshot?.definition && (isTicTacToe(snapshot.definition)
      ? <TicTacToe definition={snapshot.definition} state={round.state} userId={snapshot.userId} busy={busy} onMove={(entityId) => dispatch({ type: "ENTITY_TAPPED", entityId })} />
      : <fieldset disabled={busy} className={styles.sharedBoard}><GenericV2Game key={round.game_version_id} gameId={round.game_version_id} title={snapshot.definition.metadata.title || title} definition={snapshot.definition} shared={{ state: round.state, dispatch, restart: snapshot.host ? restart : () => setError("Only the host can start a new round.") }} /></fieldset>)}
  </section>;
}

function TicTacToe({ definition, state, userId, busy, onMove }: { definition: GameDefinitionV2; state: RuntimeStateV2; userId: string; busy: boolean; onMove(id: string): void }) {
  if (state.values.engine !== "tic_tac_toe.v1") return <p>Ask the host to start a new round to play the updated X/O game.</p>;
  const mark = state.values.playerX === userId ? "X" : state.values.playerO === userId ? "O" : null;
  const myTurn = mark === state.values.turn && state.status === "playing";
  const winner = state.values.winner;
  const cells = definition.entities.filter((entity) => entity.grid).sort((a, b) => (a.grid!.row - b.grid!.row) * 3 + a.grid!.column - b.grid!.column);
  return <div className={styles.ticGame}>
    <h3>Tic-tac-toe</h3><p>{mark ? `You are ${mark}` : "You are watching this round"} · Host is X, first joined friend is O</p>
    <p role="status">{winner === "draw" ? "It's a draw!" : winner ? `${winner} wins!` : busy ? "Sending move…" : myTurn ? `Your turn — place ${mark}` : `${state.values.turn}'s turn`}</p>
    <div className={styles.ticBoard} role="group" aria-label="Tic-tac-toe board">{cells.map((cell, index) => {
      const value = state.entities[cell.id]?.state.mark;
      return <button key={cell.id} type="button" disabled={busy || !myTurn || Boolean(value)} aria-label={`Row ${Math.floor(index / 3) + 1}, column ${index % 3 + 1}: ${value || "empty"}`} onClick={() => onMove(cell.id)}>{value || ""}</button>;
    })}</div>
  </div>;
}
