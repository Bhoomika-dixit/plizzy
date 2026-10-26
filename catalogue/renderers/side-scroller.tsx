"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GameDefinitionV2 } from "@/agent-harness/game-definition-v2";
import { resolveAssetVisual, resolveBackground } from "../assets/runtime";
import { spawnObstacle, stepGravity, stepHorizontalScroll, ScrollingObstacle } from "../entity-behaviours/runtime";
import { applyImpulse, isImpulseKey } from "../interactions/runtime";
import { collidesWithObstacle, difficultySpeed, outsideVerticalBounds, scorePassedObstacles } from "../rules/runtime";
import { resolveText } from "../text/runtime";
import styles from "./side-scroller.module.css";

export type SideScrollerSnapshot = { score: number; secondsRemaining: number; status: "playing" | "finished"; outcome?: "win" | "lose"; resultTextKey?: string };
type SimulationState = SideScrollerSnapshot & { playerY: number; velocityY: number; obstacles: ScrollingObstacle[]; seed: number; nextObstacleId: number; elapsed: number; sinceSpawn: number };

export type SideScrollerProps = {
  definition: GameDefinitionV2;
  onSnapshot(snapshot: SideScrollerSnapshot): void;
  onInteraction(event: { eventType: "IMPULSE"; score: number; secondsRemaining: number }): void;
};

const numberConfig = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

function initialState(definition: GameDefinitionV2): SimulationState {
  const first = spawnObstacle([], 1, definition.config.seed);
  const second = spawnObstacle(first.obstacles, 2, first.seed);
  return { playerY: 50, velocityY: 0, obstacles: second.obstacles, seed: second.seed, nextObstacleId: 3, elapsed: 0, sinceSpawn: 0, score: 0, secondsRemaining: definition.timer?.durationSeconds ?? 0, status: "playing" };
}

export default function SideScroller({ definition, onSnapshot, onInteraction }: SideScrollerProps) {
  const config = definition.renderer.config;
  const gravity = numberConfig(config.gravity, 68, 35, 120);
  const impulse = numberConfig(config.impulse, -31, -60, -15);
  const obstacleSpeed = numberConfig(config.obstacleSpeed, 20, 12, 40);
  const gapSize = numberConfig(config.gapSize, 34, 22, 48);
  const obstacleWidth = numberConfig(config.obstacleWidth, 12, 8, 18);
  const spawnInterval = numberConfig(config.spawnIntervalSeconds, 2.15, 1.1, 3);
  const difficultyRate = numberConfig(config.difficultyRate, .025, 0, .15);
  const playerX = 23;
  const playerWidth = 11;
  const playerHeight = 7;
  const [view, setView] = useState<SimulationState>(() => initialState(definition));
  const stateRef = useRef<SimulationState>(view);
  const player = definition.entities.find((entity) => entity.tags?.includes("player")) ?? definition.entities[0];
  const obstacle = definition.entities.find((entity) => entity.tags?.includes("obstacle"));
  const playerAssetId = typeof config.playerAssetId === "string" ? config.playerAssetId : player?.content.kind === "asset" ? player.content.value : undefined;
  const obstacleAssetId = typeof config.obstacleAssetId === "string" ? config.obstacleAssetId : obstacle?.content.kind === "asset" ? obstacle.content.value : undefined;
  const playerVisual = resolveAssetVisual(definition.assets, playerAssetId, player?.content.value ?? "🚗", player?.label);
  const obstacleVisual = resolveAssetVisual(definition.assets, obstacleAssetId, obstacle?.content.value ?? "", obstacle?.label);
  const obstacleSurface = obstacleVisual.kind === "color" ? { background: obstacleVisual.value } : undefined;
  const background = useMemo(() => resolveBackground(definition.assets, config.backgroundAssetId, `linear-gradient(#82d9ff 0%, #dff7ff 68%, #ffffff 69%)`), [config.backgroundAssetId, definition.assets]);

  const finish = useCallback((state: SimulationState, outcome: "win" | "lose", resultTextKey: string) => ({ ...state, status: "finished" as const, outcome, resultTextKey, velocityY: 0 }), []);
  const doImpulse = useCallback(() => {
    const current = stateRef.current;
    if (current.status !== "playing") return;
    stateRef.current = { ...current, velocityY: applyImpulse(impulse) };
    onInteraction({ eventType: "IMPULSE", score: current.score, secondsRemaining: current.secondsRemaining });
  }, [impulse, onInteraction]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (isImpulseKey(event.key)) { event.preventDefault(); doImpulse(); } };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doImpulse]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      const current = stateRef.current;
      if (current.status !== "playing") return;
      const delta = Math.min(.034, Math.max(.001, (now - last) / 1000)); last = now;
      const elapsed = current.elapsed + delta;
      const body = stepGravity({ y: current.playerY, velocityY: current.velocityY }, gravity, delta);
      const speed = difficultySpeed(obstacleSpeed, elapsed, difficultyRate);
      let obstacles = stepHorizontalScroll(current.obstacles, speed, delta);
      let seed = current.seed; let nextObstacleId = current.nextObstacleId; let sinceSpawn = current.sinceSpawn + delta;
      if (sinceSpawn >= Math.max(1.05, spawnInterval - elapsed * .004)) { const spawned = spawnObstacle(obstacles, nextObstacleId, seed); obstacles = spawned.obstacles; seed = spawned.seed; nextObstacleId += 1; sinceSpawn = 0; }
      const scored = scorePassedObstacles(obstacles, playerX); obstacles = scored.obstacles;
      const duration = definition.timer?.durationSeconds ?? 0;
      const secondsRemaining = duration ? Math.max(0, Math.ceil(duration - elapsed)) : 0;
      let next: SimulationState = { ...current, playerY: body.y, velocityY: body.velocityY, obstacles, seed, nextObstacleId, sinceSpawn, elapsed, score: current.score + scored.points, secondsRemaining };
      if (outsideVerticalBounds(body.y, playerHeight / 2) || collidesWithObstacle({ playerX, playerY: body.y, playerWidth, playerHeight, obstacleWidth, gapSize }, obstacles)) next = finish(next, "lose", "result.loseTitle");
      else if (duration && elapsed >= duration) next = finish(next, "win", "result.winTitle");
      stateRef.current = next; setView(next);
      if (next.status === "playing") frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [definition.timer?.durationSeconds, difficultyRate, finish, gapSize, gravity, obstacleSpeed, obstacleWidth, playerHeight, playerWidth, spawnInterval]);

  useEffect(() => { onSnapshot({ score: view.score, secondsRemaining: view.secondsRemaining, status: view.status, outcome: view.outcome, resultTextKey: view.resultTextKey }); }, [onSnapshot, view.outcome, view.resultTextKey, view.score, view.secondsRemaining, view.status]);

  return <div className={styles.stage} style={{ background }} role="application" aria-label={definition.metadata.title} tabIndex={0} onPointerDown={(event) => { event.preventDefault(); doImpulse(); }}>
    <p className={styles.hint}>{resolveText(definition.texts, "sideScroller.tapHint", "Tap, click, Space, or ↑ to fly")}</p>
    <div className={styles.player} style={{ left: `${playerX}%`, top: `${view.playerY}%`, rotate: `${Math.max(-22, Math.min(35, view.velocityY * .8))}deg` }} aria-label={player?.label ?? "Player"}>{playerVisual.kind === "image" ? <Image src={playerVisual.value} alt="" width={240} height={96} unoptimized /> : <span>{playerVisual.value}</span>}</div>
    {view.obstacles.map((item) => { const gapTop = item.gapY - gapSize / 2; const gapBottom = item.gapY + gapSize / 2; return <div key={item.id} className={styles.obstaclePair} style={{ left: `${item.x}%`, width: `${obstacleWidth}%` }} aria-hidden="true"><div className={`${styles.obstacle} ${styles.top}`} style={{ height: `${gapTop}%`, ...obstacleSurface }}>{obstacleVisual.kind === "image" ? <Image src={obstacleVisual.value} alt="" width={160} height={160} unoptimized /> : obstacleVisual.kind === "text" && obstacleVisual.value ? <span>{obstacleVisual.value}</span> : null}</div><div className={`${styles.obstacle} ${styles.bottom}`} style={{ top: `${gapBottom}%`, ...obstacleSurface }}>{obstacleVisual.kind === "image" ? <Image src={obstacleVisual.value} alt="" width={160} height={160} unoptimized /> : obstacleVisual.kind === "text" && obstacleVisual.value ? <span>{obstacleVisual.value}</span> : null}</div></div>; })}
    <div className={styles.ground} />
  </div>;
}
