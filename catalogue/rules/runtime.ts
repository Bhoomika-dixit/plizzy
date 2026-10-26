import { ScrollingObstacle } from "../entity-behaviours/runtime";

export type CollisionInput = { playerX: number; playerY: number; playerWidth: number; playerHeight: number; obstacleWidth: number; gapSize: number };

export function collidesWithObstacle(input: CollisionInput, obstacles: ScrollingObstacle[]) {
  const playerLeft = input.playerX - input.playerWidth / 2;
  const playerRight = input.playerX + input.playerWidth / 2;
  const playerTop = input.playerY - input.playerHeight / 2;
  const playerBottom = input.playerY + input.playerHeight / 2;
  return obstacles.some((obstacle) => {
    const overlapsX = playerRight > obstacle.x - input.obstacleWidth / 2 && playerLeft < obstacle.x + input.obstacleWidth / 2;
    if (!overlapsX) return false;
    const gapTop = obstacle.gapY - input.gapSize / 2;
    const gapBottom = obstacle.gapY + input.gapSize / 2;
    return playerTop < gapTop || playerBottom > gapBottom;
  });
}

export function outsideVerticalBounds(playerY: number, halfHeight: number) { return playerY - halfHeight <= 0 || playerY + halfHeight >= 100; }

export function scorePassedObstacles(obstacles: ScrollingObstacle[], playerX: number) {
  let points = 0;
  const next = obstacles.map((obstacle) => {
    if (!obstacle.passed && obstacle.x < playerX) { points += 1; return { ...obstacle, passed: true }; }
    return obstacle;
  });
  return { obstacles: next, points };
}

export function difficultySpeed(baseSpeed: number, elapsedSeconds: number, rate: number) { return baseSpeed * (1 + Math.min(1.25, elapsedSeconds * rate)); }

export const ruleImplementations = {
  "collision.v1": collidesWithObstacle,
  "score_on_pass.v1": scorePassedObstacles,
  "bounds.v1": outsideVerticalBounds,
  "difficulty.v1": difficultySpeed,
} as const;
