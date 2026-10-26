import { ToolSkill } from "../types";

export const assetGenerationSkill: ToolSkill = {
  name: "asset_specification",
  purpose: "Turn visual asset requirements into safe executable asset manifests and generation prompts.",
  instructions: [
    "Preserve explicit subject, appearance, colour, and role constraints.",
    "Give every generated asset a playable local fallback.",
    "Use only registered asset kinds and roles.",
  ],
};
