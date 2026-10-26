export const interactionCatalog = {
  "tap.v1": { label: "Tap", implementation: "entity_tap_handler", emits: "ENTITY_TAPPED", payload: ["entityId"] },
  "select.v1": { label: "Select", implementation: "entity_selection_handler", emits: "ENTITY_SELECTED", payload: ["entityId", "selectedEntityIds"] },
  "drag_drop.v1": { label: "Drag and drop", implementation: "drag_drop_handler", emits: "ENTITY_DROPPED", payload: ["entityId", "targetEntityId"] },
  "swipe.v1": { label: "Swipe", implementation: "swipe_handler", emits: "SWIPED", payload: ["direction"] },
  "text_input.v1": { label: "Text input", implementation: "text_submit_handler", emits: "TEXT_SUBMITTED", payload: ["text"] },
  "keyboard_move.v1": { label: "Keyboard move", implementation: "direction_handler", emits: "DIRECTION_PRESSED", payload: ["direction"] },
  "impulse.v1": { label: "Impulse", implementation: "impulse_handler", emits: "IMPULSE", payload: [], supports: ["pointer", "touch", "Space", "ArrowUp"] },
} as const;

export type InteractionId = keyof typeof interactionCatalog;
