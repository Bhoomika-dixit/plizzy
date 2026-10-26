export const rendererCatalog = {
  "arena.v1": { label: "Arena", description: "Executable free-positioned entity stage.", implementation: "generic_entity_renderer", slots: ["background", "hud", "entity", "overlay"], interactions: ["tap.v1", "select.v1", "drag_drop.v1", "swipe.v1", "keyboard_move.v1"], config: { width: "320-1200", height: "320-900" } },
  "grid.v1": { label: "Grid", description: "Executable row and column puzzle board.", implementation: "generic_entity_renderer", slots: ["background", "hud", "cell", "overlay"], interactions: ["tap.v1", "select.v1", "drag_drop.v1", "keyboard_move.v1"], config: { rows: "2-12", columns: "2-12" } },
  "card_grid.v1": { label: "Card grid", description: "Executable flippable and selectable card board.", implementation: "generic_entity_renderer", slots: ["background", "hud", "cardFront", "cardBack", "overlay"], interactions: ["tap.v1", "select.v1", "drag_drop.v1"], config: { rows: "2-6", columns: "2-6" } },
  "circles.v1": { label: "Circles", description: "Executable radial entity layout.", implementation: "generic_entity_renderer", slots: ["background", "hud", "center", "orbitItem", "overlay"], interactions: ["tap.v1", "select.v1", "swipe.v1"], config: { rings: "1-3" } },
  "lanes.v1": { label: "Lanes", description: "Executable parallel lane layout for sorting and movement.", implementation: "generic_entity_renderer", slots: ["background", "hud", "lane", "entity", "overlay"], interactions: ["tap.v1", "select.v1", "drag_drop.v1", "swipe.v1", "keyboard_move.v1"], config: { lanes: "2-6" } },
  "scene.v1": { label: "Scene", description: "Executable narrative or object-search scene.", implementation: "generic_entity_renderer", slots: ["background", "hud", "entity", "dialogue", "overlay"], interactions: ["tap.v1", "select.v1", "text_input.v1"], config: {} },
  "list.v1": { label: "List", description: "Executable choice, question, and sortable list.", implementation: "generic_entity_renderer", slots: ["background", "hud", "listItem", "input", "overlay"], interactions: ["tap.v1", "select.v1", "drag_drop.v1", "text_input.v1"], config: {} },
  "side_scroller.v1": {
    label: "Side scroller",
    description: "Executable one-button gravity game with scrolling obstacle pairs, collision detection, score-on-pass, bounds checks, and progressive difficulty.",
    implementation: "side_scroller_renderer",
    slots: ["background", "player", "obstacleTop", "obstacleBottom", "hud", "overlay"],
    interactions: ["impulse.v1"],
    requiredBehaviours: ["gravity.v1", "horizontal_scroll.v1", "obstacle_spawner.v1"],
    requiredRuleCapabilities: ["collision.v1", "score_on_pass.v1", "bounds.v1", "difficulty.v1"],
    config: { gravity: "35-120", impulse: "-60--15", obstacleSpeed: "12-40", gapSize: "22-48", obstacleWidth: "8-18", spawnIntervalSeconds: "1.1-3", difficultyRate: "0-0.15", playerAssetId: "asset_reference", obstacleAssetId: "asset_reference", backgroundAssetId: "asset_reference" },
  },
} as const;

export type RendererId = keyof typeof rendererCatalog;
