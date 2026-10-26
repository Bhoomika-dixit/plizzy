import { ToolSkill } from "../types";

export const rulesExecutionSkill: ToolSkill = {
  name: "deterministic_game_rules",
  purpose: "Express scoring, state transitions, timing, and outcomes as deterministic event-condition-effect rules.",
  instructions: [
    "Consume the events emitted by selected interactions and runtime capabilities.",
    "Reference only declared state, entities, outcomes, and text keys.",
    "Include reachable termination appropriate to the registered requirements.",
  ],
};
