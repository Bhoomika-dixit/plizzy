import { ToolSkill } from "../types";

export const requirementsSkill: ToolSkill = {
  name: "requirements_analysis",
  purpose: "Translate the creator's prompt into a traceable, implementation-neutral contract for the six design tools.",
  instructions: [
    "Preserve explicit user constraints verbatim in evidence fields.",
    "Label every item as explicit or inferred and assign realistic confidence.",
    "Assign each atomic requirement to exactly one of the six tool sections.",
    "Record ambiguity instead of inventing a material product decision.",
    "Describe needed capabilities; do not select catalogue module IDs.",
  ],
};
