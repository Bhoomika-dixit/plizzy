import { ToolSkill } from "../types";

export const entityBehaviourSkill: ToolSkill = {
  name: "entity_dynamics",
  purpose: "Assign executable motion, physics, spawning, and stateful behaviours to game entities.",
  instructions: [
    "Use only registered behaviour modules.",
    "Attach every behaviour to a known entity.",
    "Keep input handling and win/lose policy outside this tool.",
  ],
};
