import { ToolSkill } from "../types";

export const renderIdentificationSkill: ToolSkill = {
  name: "renderer_composition",
  purpose: "Match spatial, camera, layout, and game-loop requirements to one executable renderer manifest.",
  instructions: [
    "Use only registered renderer IDs and declared placeholders.",
    "Reject a renderer that lacks an assigned required capability.",
    "Keep entities and renderer asset references consistent.",
  ],
};
