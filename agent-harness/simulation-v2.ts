import { GameDefinitionV2 } from "./game-definition-v2";

export function simulateGameDefinitionV2(definition: GameDefinitionV2): { playable: true; reachableEvents: string[] } | { playable: false; errors: string[]; reachableEvents: string[] } {
  const reachable = new Set<string>(["GAME_STARTED", ...definition.interactions.map((item) => item.event)]);
  if (definition.renderer.id === "side_scroller.v1") ["COLLISION_DETECTED", "OBSTACLE_PASSED", "PLAYER_OUT_OF_BOUNDS"].forEach((event) => reachable.add(event));
  if (definition.timer) { reachable.add("TIMER_TICK"); reachable.add("TIMER_COMPLETED"); }
  let changed = true;
  let endReachable = false;
  while (changed) {
    changed = false;
    for (const rule of definition.rules) {
      if (!reachable.has(rule.trigger.event)) continue;
      if (rule.effects.some((effect) => effect.type === "END_GAME")) endReachable = true;
      if (rule.effects.some((effect) => ["SET_STATE", "INCREMENT_STATE", "ADD_SCORE", "SET_ENTITY_STATE"].includes(effect.type)) && !reachable.has("STATE_CHANGED")) { reachable.add("STATE_CHANGED"); changed = true; }
    }
  }
  const errors: string[] = [];
  if (!endReachable) errors.push("No END_GAME effect is reachable from start, player input, timer, or a state change.");
  for (const interaction of definition.interactions) if (!definition.rules.some((rule) => rule.trigger.event === interaction.event)) errors.push(`${interaction.id} has no reachable rule.`);
  return errors.length ? { playable: false, errors, reachableEvents: [...reachable] } : { playable: true, reachableEvents: [...reachable] };
}
