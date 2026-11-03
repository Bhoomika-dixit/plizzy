import type { GameDefinitionV2 } from "./game-definition-v2";
import { createRuntimeV2, dispatchGameEventV2, tickRuntimeV2, type GameEventV2, type RuntimeStateV2 } from "./runtime-v2";
import { sideScrollerConfig, spawnObstacle, stepGravity, stepHorizontalScroll, type ScrollingObstacle } from "../catalogue/entity-behaviours/runtime";
import { collidesWithObstacle, difficultySpeed, outsideVerticalBounds, scorePassedObstacles } from "../catalogue/rules/runtime";

export type PhysicsState = { y: number; velocity: number; elapsed: number; sinceSpawn: number; nextId: number; seed: number; obstacles: ScrollingObstacle[] };
export type SessionPlayer = { id: string; symbol: string; score: number; outcome?: string };
export type MultiplayerInput = GameEventV2 | { type: "IMPULSE"; samples: number[] };
// Inputs can cross a slow HTTP connection without arriving after a committed
// collision. Clients predict immediately; the server settles this window later.
export const PHYSICS_INPUT_WINDOW_MS = 4000;
export type SessionState = RuntimeStateV2 & { session: {
  version: 1; players: SessionPlayer[]; turn: number; startedAt: number; clock: number;
  boards: Record<string, RuntimeStateV2>; physics: Record<string, PhysicsState>; winners: string[];
  inputs?: Record<string, number[]>; lastInputAt?: Record<string, number>;
} };

export function isSession(state: RuntimeStateV2): state is SessionState { return Boolean((state as SessionState).session?.version === 1); }
export function playerBoard(definition: GameDefinitionV2, state: SessionState, userId: string) {
  return definition.multiplayer?.board === "individual" ? state.session.boards[userId] ?? state.session.boards[state.session.players[0].id] : state;
}

export function createSession(definition: GameDefinitionV2, ids: string[], now = Date.now()): SessionState {
  const config = definition.multiplayer;
  if (!config) throw new Error("This saved version predates multiplayer contracts. Regenerate it to preserve its intended rules.");
  if (ids.length < config.minPlayers || ids.length > config.maxPlayers || new Set(ids).size !== ids.length) throw new Error(`This game requires ${config.minPlayers}–${config.maxPlayers} distinct players.`);
  const makeBoard = () => {
    const board = createRuntimeV2(definition);
    if (definition.renderer.id === "side_scroller.v1" && definition.timer) board.timerRunning = true;
    return board;
  };
  const initial = makeBoard();
  const boards = config.board === "individual" ? Object.fromEntries(ids.map(id => [id, makeBoard()])) : {};
  const physics = definition.renderer.id === "side_scroller.v1" ? Object.fromEntries(ids.map(id => {
    const first = spawnObstacle([], 1, definition.config.seed);
    const second = spawnObstacle(first.obstacles, 2, first.seed);
    return [id, { y: 50, velocity: 0, elapsed: 0, sinceSpawn: 0, nextId: 3, seed: second.seed, obstacles: second.obstacles }];
  })) : {};
  return { ...initial, session: { version: 1, players: ids.map((id, index) => ({ id, symbol: config.symbols[index], score: 0 })), turn: 0,
    startedAt: now + 3000, clock: now + 3000, boards, physics, winners: [], inputs: {}, lastInputAt: {} } };
}

function physicsTick(definition: GameDefinitionV2, board: RuntimeStateV2, physics: PhysicsState, seconds: number) {
  const config = sideScrollerConfig(definition.renderer.config);
  let next = board;
  // Fixed-size steps prevent client frame rates from changing collisions or scores.
  for (let remaining = seconds; remaining > .00001 && next.status === "playing"; remaining -= 1 / 60) {
    const dt = Math.min(remaining, 1 / 60);
    physics.elapsed += dt; physics.sinceSpawn += dt;
    const body = stepGravity({ y: physics.y, velocityY: physics.velocity }, config.gravity ?? 58, dt);
    physics.y = body.y; physics.velocity = body.velocityY;
    physics.obstacles = stepHorizontalScroll(physics.obstacles, difficultySpeed(config.obstacleSpeed ?? 18, physics.elapsed, config.difficultyRate ?? .02), dt);
    if (physics.sinceSpawn >= Math.max(1.05, (config.spawnIntervalSeconds ?? 1.8) - physics.elapsed * .004)) {
      const spawned = spawnObstacle(physics.obstacles, physics.nextId++, physics.seed);
      physics.obstacles = spawned.obstacles; physics.seed = spawned.seed; physics.sinceSpawn = 0;
    }
    const scored = scorePassedObstacles(physics.obstacles, 23); physics.obstacles = scored.obstacles;
    for (let i = 0; i < scored.points; i++) next = dispatchGameEventV2(definition, next, { type: "OBSTACLE_PASSED" });
    if (outsideVerticalBounds(physics.y, 3.5)) next = dispatchGameEventV2(definition, next, { type: "PLAYER_OUT_OF_BOUNDS" });
    else if (collidesWithObstacle({ playerX: 23, playerY: physics.y, playerWidth: 11, playerHeight: 7, obstacleWidth: config.obstacleWidth ?? 12, gapSize: config.gapSize ?? 34 }, physics.obstacles)) next = dispatchGameEventV2(definition, next, { type: "COLLISION_DETECTED" });
    const secondsLeft = Math.max(0, (definition.timer?.durationSeconds ?? 0) - Math.floor(physics.elapsed));
    if (definition.timer && secondsLeft !== next.secondsRemaining) next = tickRuntimeV2(definition, next);
  }
  return next;
}

export function projectPhysicsBoard(definition: GameDefinitionV2, state: SessionState, userId: string, now: number, localInputs: number[] = []) {
  const physics = structuredClone(state.session.physics[userId]);
  let board = structuredClone(state.session.boards[userId]);
  let clock = state.session.clock;
  const index = state.session.players.findIndex(player => player.id === userId);
  const actor = state.session.players[index];
  const samples = [...new Set([...(state.session.inputs?.[userId] ?? []), ...localInputs])].filter(at => at > clock && at <= now).sort((a,b) => a-b);
  for (const at of samples) {
    board = physicsTick(definition, board, physics, (at - clock) / 1000);
    if (board.status !== "playing") break;
    board = dispatchGameEventV2(definition, board, { type: "IMPULSE", actorId: userId, actorIndex: index, actorSymbol: actor.symbol });
    physics.velocity = sideScrollerConfig(definition.renderer.config).impulse;
    clock = at;
  }
  board = physicsTick(definition, board, physics, Math.max(0, now - clock) / 1000);
  return { board, physics };
}

export function advanceSession(definition: GameDefinitionV2, state: SessionState, now: number): SessionState {
  const next = structuredClone(state);
  if (definition.renderer.id === "side_scroller.v1") now -= PHYSICS_INPUT_WINDOW_MS;
  if (now <= next.session.clock || state.status === "finished") return next;
  const elapsed = (now - next.session.clock) / 1000;
  const seconds = Math.floor(elapsed);
  const physicsElapsed = Math.floor(elapsed * 60) / 60;
  const individual = definition.multiplayer?.board === "individual";
  if (definition.renderer.id !== "side_scroller.v1" && !(individual ? Object.values(next.session.boards).some(board => board.timerRunning && board.status === "playing") : next.timerRunning)) return next;
  if (individual) for (const player of next.session.players) {
    let board = next.session.boards[player.id];
    if (definition.renderer.id === "side_scroller.v1") {
      const target = next.session.clock + physicsElapsed * 1000;
      const projected = projectPhysicsBoard(definition, next, player.id, target);
      board = projected.board; next.session.physics[player.id] = projected.physics;
      if (next.session.inputs) next.session.inputs[player.id] = (next.session.inputs[player.id] ?? []).filter(at => at > target);
    }
    else for (let i = 0; i < seconds && board.status === "playing" && board.timerRunning; i++) board = tickRuntimeV2(definition, board);
    next.session.boards[player.id] = board; player.score = Number(board.values.score ?? 0); player.outcome = board.outcome;
  }
  else {
    let board: RuntimeStateV2 = next;
    for (let i = 0; i < seconds && board.status === "playing" && board.timerRunning; i++) board = tickRuntimeV2(definition, board);
    Object.assign(next, board);
  }
  next.session.clock += definition.renderer.id === "side_scroller.v1" ? physicsElapsed * 1000 : seconds * 1000;
  return settle(definition, next);
}

function settle(definition: GameDefinitionV2, state: SessionState, actorId?: string): SessionState {
  if (definition.multiplayer?.board === "individual" && state.session.players.every(player => state.session.boards[player.id].status === "finished")) {
    state.status = "finished";
    const best = Math.max(...state.session.players.map(player => player.score));
    state.session.winners = definition.multiplayer?.objective === "cooperative"
      ? state.session.players.every(player => state.session.boards[player.id].outcome === "win") ? state.session.players.map(player => player.id) : []
      : state.session.players.filter(player => player.score === best).map(player => player.id);
  }
  if (definition.multiplayer?.board === "shared" && state.status === "finished") {
    const winnerSymbol = state.values.winnerSymbol;
    const best = Math.max(...state.session.players.map(player => player.score));
    state.session.winners = definition.multiplayer.objective === "cooperative"
      ? state.outcome === "win" ? state.session.players.map(player => player.id) : []
      : typeof winnerSymbol === "string" ? state.session.players.filter(player => player.symbol === winnerSymbol).map(player => player.id)
        : state.outcome === "win" ? actorId ? [actorId] : state.session.players.filter(player => player.score === best).map(player => player.id) : [];
  }
  return state;
}

function queuePhysicsInput(definition: GameDefinitionV2, state: SessionState, actorId: string, input: MultiplayerInput, now: number) {
  if (!state.session.players.some(player => player.id === actorId)) throw new Error("You are watching this round. Join the next round to play.");
  if (now < state.session.startedAt) throw new Error("The round is counting down.");
  if (state.status !== "playing" || state.session.boards[actorId].status !== "playing") throw new Error("Your board has finished.");
  if (!input || input.type !== "IMPULSE" || Object.keys(input).some(key => !["type", "samples"].includes(key)) || !definition.interactions.some(item => item.type === "impulse.v1" && item.event === "IMPULSE")) throw new Error("Invalid flying input.");
  if ("samples" in input && !Array.isArray(input.samples)) throw new Error("Invalid input batch.");
  const samples = Array.isArray(input.samples) ? input.samples : [now];
  if (!samples.length || samples.length > 16) throw new Error("Invalid input batch.");
  let previous = state.session.lastInputAt?.[actorId] ?? state.session.startedAt - 100;
  for (const at of samples) {
    if (typeof at !== "number" || !Number.isFinite(at) || at < state.session.startedAt || at > now + 100) throw new Error("Invalid flying input time.");
    if (at <= state.session.clock) throw new Error("Flying input arrived too late. Check your connection and start a new round.");
    if (at - previous < 80) throw new Error("Flying inputs must be in order and at least 80 ms apart.");
    previous = at;
  }
  state.session.inputs ??= {}; state.session.lastInputAt ??= {};
  if ((state.session.inputs[actorId]?.length ?? 0) + samples.length > 64) throw new Error("Too many pending flying inputs.");
  state.session.inputs[actorId] = [...(state.session.inputs[actorId] ?? []), ...samples];
  state.session.lastInputAt[actorId] = previous;
  return state;
}

export function moveSession(definition: GameDefinitionV2, state: SessionState, actorId: string, input: MultiplayerInput, now = Date.now()): SessionState {
  const next = advanceSession(definition, state, now);
  if (definition.renderer.id === "side_scroller.v1") return queuePhysicsInput(definition, next, actorId, input, now);
  input = input as GameEventV2;
  const index = next.session.players.findIndex(player => player.id === actorId);
  if (index < 0) throw new Error("You are watching this round. Join the next round to play.");
  if (now < next.session.startedAt) throw new Error("The round is counting down.");
  if (next.status !== "playing") throw new Error("This round has finished.");
  if (definition.multiplayer?.turns === "round_robin" && index !== next.session.turn) throw new Error("Wait for your turn.");
  const keys = ["type", "entityId", "targetEntityId", "text", "direction"];
  if (!input || Object.entries(input).some(([key, value]) => !keys.includes(key) || typeof value !== "string" || value.length > 500)) throw new Error("Invalid player action.");
  const board = playerBoard(definition, next, actorId);
  if (board.status !== "playing") throw new Error("Your board has finished. Wait for the other players.");
  const interaction = definition.interactions.find(item => item.event === input.type && (!input.entityId && !["tap.v1", "select.v1", "drag_drop.v1"].includes(item.type) || !item.target.entityIds?.length && !item.target.tags?.length || input.entityId && (item.target.entityIds?.includes(input.entityId) || item.target.tags?.some(tag => definition.entities.find(entity => entity.id === input.entityId)?.tags?.includes(tag)))));
  if (!interaction) throw new Error("Unsupported action or target.");
  if (input.entityId && !board.entities[input.entityId]?.visible || input.targetEntityId && !board.entities[input.targetEntityId]?.visible) throw new Error("Invalid target.");
  if (["tap.v1", "select.v1", "drag_drop.v1"].includes(interaction.type) && !input.entityId) throw new Error("Choose an entity.");
  if (interaction.type === "drag_drop.v1" && !input.targetEntityId) throw new Error("Choose a drop target.");
  if (interaction.type === "text_input.v1" && !input.text?.trim()) throw new Error("Enter an answer.");
  if (["swipe.v1", "keyboard_move.v1"].includes(interaction.type) && !["up", "down", "left", "right"].includes(input.direction ?? "")) throw new Error("Invalid direction.");
  const player = next.session.players[index];
  const event = { ...input, actorId, actorIndex: index, actorSymbol: player.symbol };
  let changed = dispatchGameEventV2(definition, board, event);
  if (JSON.stringify(changed) === JSON.stringify(board)) throw new Error("That move is not legal on the current board.");
  player.score += Number(changed.values.score ?? 0) - Number(board.values.score ?? 0);
  player.outcome = changed.outcome;
  if (!board.timerRunning && changed.timerRunning) next.session.clock = now;
  if (definition.multiplayer?.board === "individual") next.session.boards[actorId] = changed;
  else {
    changed = { ...changed, session: next.session } as SessionState;
    Object.assign(next, changed);
  }
  next.session.turn = (next.session.turn + 1) % next.session.players.length;
  return settle(definition, next, actorId);
}
