import { assetCatalog } from "./catalog";
import { validateRequirementBinding, withRequirementCoverage } from "./requirement-contract";
import { assetGenerationSkill } from "./skills/asset-generation";
import { descriptionWithSkill, DesignTool, isObject, objectSchema, requirementBindingSchema, safeId } from "./types";

export const assetGenerationTool: DesignTool = {
  skill: assetGenerationSkill,
  definition: {
    name: "asset_generation_tool",
    description: descriptionWithSkill("Configure executable asset resolvers for characters, objects, UI, and backgrounds. Roles are exactly character, background, object, or ui. Generated-image requests always include a playable local fallback.", assetGenerationSkill),
    input_schema: objectSchema({
      requirement: requirementBindingSchema,
      style: { type: "string" },
      assets: {
        type: "array",
        maxItems: 36,
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            kind: { type: "string", enum: ["emoji", "gradient", "generated_image", "stored_image"] },
            role: { type: "string", enum: ["character", "background", "object", "ui"] },
            value: { type: "string" },
            prompt: { type: "string" },
            fallback: { type: "string" },
            aspectRatio: { type: "string" },
          },
          required: ["id", "kind", "role", "fallback"],
          additionalProperties: false,
        },
      },
    }, ["requirement", "style", "assets"]),
  },
  execute(input, context) {
    const coverage = validateRequirementBinding(input, "asset_generation_tool", context);
    if (!coverage.valid) return { ok: false, errors: coverage.errors };
    if (!isObject(input) || typeof input.style !== "string" || !Array.isArray(input.assets)) return { ok: false, errors: ["An asset style and asset manifest are required."] };
    const errors: string[] = [];
    input.assets.forEach((asset, index) => {
      if (!isObject(asset) || !safeId(asset.id) || typeof asset.kind !== "string" || !(asset.kind in assetCatalog) || !["character", "background", "object", "ui"].includes(String(asset.role)) || typeof asset.fallback !== "string") errors.push(`Asset ${index} is invalid or lacks a fallback.`);
      if (isObject(asset) && asset.kind === "generated_image" && typeof asset.prompt !== "string") errors.push(`Generated asset ${asset.id} needs a prompt.`);
    });
    return errors.length ? { ok: false, errors } : { ok: true, value: withRequirementCoverage({ style: input.style, assets: input.assets }, coverage.binding) };
  },
};
