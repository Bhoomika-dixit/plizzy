import { ToolSkill } from "../types";

export const textGenerationSkill: ToolSkill = {
  name: "game_copy",
  purpose: "Produce concise player-facing copy for every named runtime text slot.",
  instructions: [
    "Fill every required text slot.",
    "Make instructions accurately describe the implemented interaction and objective.",
    "Keep copy concise and consistent with the requested tone.",
  ],
};
