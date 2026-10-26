export const ruleCatalog = {
  events: ["GAME_STARTED", "ENTITY_TAPPED", "ENTITY_SELECTED", "ENTITY_DROPPED", "TEXT_SUBMITTED", "SWIPED", "DIRECTION_PRESSED", "IMPULSE", "COLLISION_DETECTED", "OBSTACLE_PASSED", "PLAYER_OUT_OF_BOUNDS", "TIMER_TICK", "TIMER_COMPLETED", "STATE_CHANGED"] as const,
  operators: ["eq", "neq", "gt", "gte", "lt", "lte", "truthy", "falsy", "includes"] as const,
  effects: ["SET_STATE", "INCREMENT_STATE", "ADD_SCORE", "SET_ENTITY_STATE", "MOVE_ENTITY", "SHOW_ENTITY", "HIDE_ENTITY", "CLEAR_SELECTION", "APPLY_IMPULSE", "START_TIMER", "STOP_TIMER", "END_GAME"] as const,
  capabilities: {
    "collision.v1": { implementation: "aabb_gap_collision", description: "Detects player overlap with obstacle columns outside their gap." },
    "score_on_pass.v1": { implementation: "score_on_pass", description: "Scores each obstacle once after it passes the player." },
    "bounds.v1": { implementation: "vertical_bounds", description: "Ends play when the player leaves the stage." },
    "difficulty.v1": { implementation: "progressive_speed", description: "Increases scroll speed gradually from elapsed play time." },
  },
} as const;

export type RuleEvent = (typeof ruleCatalog.events)[number];
export type RuleOperator = (typeof ruleCatalog.operators)[number];
export type RuleEffectType = (typeof ruleCatalog.effects)[number];
