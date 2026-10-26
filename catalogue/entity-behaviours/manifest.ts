export const behaviourCatalog = {
  "static.v1": { label: "Static", implementation: "static_behaviour", description: "No autonomous motion." },
  "fall.v1": { label: "Fall", implementation: "css_fall_behaviour", description: "Looping presentation-only fall." },
  "move.v1": { label: "Move", implementation: "position_move_behaviour", description: "Moves between configured positions." },
  "flip.v1": { label: "Flip", implementation: "card_flip_behaviour", description: "Shows front or back from entity state.faceUp." },
  "float.v1": { label: "Float", implementation: "css_float_behaviour", description: "Gentle looping motion." },
  "bounce.v1": { label: "Bounce", implementation: "css_bounce_behaviour", description: "Repeating scale and position motion." },
  "spawn.v1": { label: "Spawn", implementation: "visibility_behaviour", description: "Appears from entity state.visible." },
  "reveal.v1": { label: "Reveal", implementation: "reveal_behaviour", description: "Reveals content from entity state.revealed." },
  "gravity.v1": { label: "Gravity", implementation: "gravity_physics", description: "Integrates vertical velocity and position using elapsed time." },
  "horizontal_scroll.v1": { label: "Horizontal scroll", implementation: "horizontal_scroll_physics", description: "Moves world objects left using elapsed time." },
  "obstacle_spawner.v1": { label: "Obstacle spawner", implementation: "obstacle_pair_spawner", description: "Creates obstacle pairs with seeded gap positions." },
} as const;

export type BehaviourId = keyof typeof behaviourCatalog;
