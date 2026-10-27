import type { GameDefinitionV2 } from "@/agent-harness/game-definition-v2";
import { createRuntimeV2, type RuntimeStateV2 } from "@/agent-harness/runtime-v2";

export function isTicTacToe(definition: GameDefinitionV2) {
  return /tic[\s_-]*tac[\s_-]*toe|noughts.*crosses/i.test(definition.metadata?.title ?? "")
    && definition.renderer.id === "grid.v1" && definition.renderer.config?.rows === 3 && definition.renderer.config?.columns === 3
    && definition.entities.filter((entity) => entity.grid).length === 9;
}

export function createTicTacToe(definition: GameDefinitionV2, playerX: string, playerO: string): RuntimeStateV2 {
  const state = createRuntimeV2(definition);
  return { ...state, status: "playing", outcome: undefined, resultTextKey: undefined, timerRunning: false, secondsRemaining: 0,
    values: { ...state.values, engine: "tic_tac_toe.v1", playerX, playerO, turn: "X", winner: null, moves: 0 },
    entities: Object.fromEntries(Object.entries(state.entities).map(([id, entity]) => [id, { ...entity, state: { ...entity.state, mark: null } }])),
  };
}

export function playTicTacToe(definition: GameDefinitionV2, state: RuntimeStateV2, userId: string, entityId?: string): RuntimeStateV2 {
  if (state.values.engine !== "tic_tac_toe.v1") throw new Error("Ask the host to start a new round to enable X/O play.");
  if (state.status !== "playing") throw new Error("This round has finished.");
  const mark = state.values.turn;
  const player = mark === "X" ? state.values.playerX : state.values.playerO;
  if (userId !== player) throw new Error("Wait for your turn. Only the assigned X/O player can move.");
  const cell = definition.entities.find((entity) => entity.id === entityId && entity.grid);
  if (!cell) throw new Error("Choose a board cell.");
  if (state.entities[cell.id].state.mark) throw new Error("That cell is already occupied.");
  const entities = { ...state.entities, [cell.id]: { ...state.entities[cell.id], state: { ...state.entities[cell.id].state, mark } } };
  const board = Array<string | null>(9).fill(null);
  for (const entity of definition.entities) if (entity.grid) board[(entity.grid.row - 1) * 3 + entity.grid.column - 1] = entities[entity.id].state.mark as string | null;
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  const win = lines.some((line) => line.every((index) => board[index] === mark));
  const draw = !win && board.every(Boolean);
  return { ...state, entities, status: win || draw ? "finished" : "playing", timerRunning: false,
    values: { ...state.values, turn: mark === "X" ? "O" : "X", winner: win ? mark : draw ? "draw" : null, moves: Number(state.values.moves) + 1 } };
}
