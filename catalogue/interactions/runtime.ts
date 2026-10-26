export function applyImpulse(impulse: number) { return impulse; }
export function isImpulseKey(key: string) { return key === " " || key === "Spacebar" || key === "ArrowUp"; }
export function swipeDirection(dx: number, dy: number) { return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"); }
export function entityTap(entityId: string) { return { type: "ENTITY_TAPPED" as const, entityId }; }
export function entitySelect(entityId: string, selectedEntityIds: string[]) { return { type: "ENTITY_SELECTED" as const, entityId, selectedEntityIds: selectedEntityIds.includes(entityId) ? selectedEntityIds.filter((id) => id !== entityId) : [...selectedEntityIds, entityId] }; }
export function entityDrop(entityId: string, targetEntityId: string) { return { type: "ENTITY_DROPPED" as const, entityId, targetEntityId }; }
export function textSubmit(text: string) { return { type: "TEXT_SUBMITTED" as const, text: text.trim() }; }

export const interactionImplementations = {
  "tap.v1": entityTap,
  "select.v1": entitySelect,
  "drag_drop.v1": entityDrop,
  "swipe.v1": swipeDirection,
  "text_input.v1": textSubmit,
  "keyboard_move.v1": (direction: string) => ({ type: "DIRECTION_PRESSED" as const, direction }),
  "impulse.v1": applyImpulse,
} as const;
