export type PhysicsBody = { y: number; velocityY: number };
export type ScrollingObstacle = { id: number; x: number; gapY: number; passed: boolean };

export function sideScrollerConfig(config: Record<string, unknown>) {
  const number = (key: string, fallback: number, min: number, max: number) => typeof config[key] === "number" && Number.isFinite(config[key]) ? Math.min(max, Math.max(min, config[key] as number)) : fallback;
  return { gravity: number("gravity", 68, 35, 120), impulse: number("impulse", -31, -60, -15), obstacleSpeed: number("obstacleSpeed", 20, 12, 40), gapSize: number("gapSize", 34, 22, 48), obstacleWidth: number("obstacleWidth", 12, 8, 18), spawnIntervalSeconds: number("spawnIntervalSeconds", 2.15, 1.1, 3), difficultyRate: number("difficultyRate", .025, 0, .15) };
}

export function stepGravity(body: PhysicsBody, gravity: number, deltaSeconds: number): PhysicsBody {
  const velocityY = body.velocityY + gravity * deltaSeconds;
  return { y: body.y + velocityY * deltaSeconds, velocityY };
}

export function stepHorizontalScroll(obstacles: ScrollingObstacle[], speed: number, deltaSeconds: number) {
  return obstacles.map((obstacle) => ({ ...obstacle, x: obstacle.x - speed * deltaSeconds })).filter((obstacle) => obstacle.x > -24);
}

export function seededUnit(seed: number) {
  const nextSeed = (seed * 1664525 + 1013904223) >>> 0;
  return { seed: nextSeed, unit: nextSeed / 4294967296 };
}

export function spawnObstacle(obstacles: ScrollingObstacle[], id: number, seed: number) {
  const random = seededUnit(seed);
  const rightmost = obstacles.reduce((maximum, obstacle) => Math.max(maximum, obstacle.x), -Infinity);
  const x = Number.isFinite(rightmost) ? Math.max(112, rightmost + 48) : 112;
  return { obstacles: [...obstacles, { id, x, gapY: 30 + random.unit * 40, passed: false }], seed: random.seed };
}

export const behaviourImplementations = {
  "static.v1": { kind: "presentation", execute: <T>(value: T) => value },
  "fall.v1": { kind: "presentation", cssClass: "fall" },
  "move.v1": { kind: "state", execute: <T>(value: T) => value },
  "flip.v1": { kind: "state", stateKey: "faceUp" },
  "float.v1": { kind: "presentation", cssClass: "float" },
  "bounce.v1": { kind: "presentation", cssClass: "bounce" },
  "spawn.v1": { kind: "state", stateKey: "visible" },
  "reveal.v1": { kind: "state", stateKey: "revealed" },
  "gravity.v1": { kind: "physics", execute: stepGravity },
  "horizontal_scroll.v1": { kind: "physics", execute: stepHorizontalScroll },
  "obstacle_spawner.v1": { kind: "physics", execute: spawnObstacle },
} as const;
