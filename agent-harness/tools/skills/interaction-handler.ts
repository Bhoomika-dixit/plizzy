import { ToolSkill } from "../types";

export const interactionHandlerSkill: ToolSkill = {
  name: "input_mapping",
  purpose: "Convert player action requirements into registered input handlers and emitted events.",
  instructions: [
    "Use only interaction IDs and events declared by the catalogue.",
    "Target known entities or tags.",
    "Do not invent behaviours or rule effects inside the interaction layer.",
  ],
};
