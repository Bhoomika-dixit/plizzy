import { behaviourCatalog, rendererCatalog } from "./catalog";
import { validateRequirementBinding, withRequirementCoverage } from "./requirement-contract";
import { renderIdentificationSkill } from "./skills/render-identification";
import { descriptionWithSkill, DesignTool, isObject, objectSchema, requirementBindingSchema, safeId } from "./types";

export const renderIdentificationTool: DesignTool = {
  skill: renderIdentificationSkill,
  definition: {
    name: "render_identification_tool",
    description: descriptionWithSkill("Select one executable renderer module from the catalogue and fill every declared placeholder. The model sees its manifest and configuration contract, while the runtime invokes the registered implementation.", renderIdentificationSkill),
    input_schema: objectSchema({
      requirement: requirementBindingSchema,
      renderer: { type: "object", description: "{id, config} using a renderer catalog id." },
      entities: { type: "array", description: "Renderable entities with id, type, label, content, optional position/grid, state, tags, and catalog behaviours.", items: { type: "object" }, minItems: 1, maxItems: 72 },
    }, ["requirement", "renderer", "entities"]),
  },
  execute(input, context) {
    const coverage = validateRequirementBinding(input, "render_identification_tool", context);
    if (!coverage.valid) return { ok: false, errors: coverage.errors };
    if (!isObject(input) || !isObject(input.renderer) || typeof input.renderer.id !== "string" || !(input.renderer.id in rendererCatalog) || !isObject(input.renderer.config) || !Array.isArray(input.entities) || !input.entities.length) return { ok: false, errors: ["Choose a catalog renderer and provide at least one entity."] };
    const errors: string[] = [];
    const ids = new Set<string>();
    input.entities.forEach((entity, index) => {
      if (!isObject(entity) || !safeId(entity.id) || ids.has(entity.id)) { errors.push(`Entity ${index} has an invalid or duplicate id.`); return; }
      ids.add(entity.id);
      if (typeof entity.label !== "string" || !isObject(entity.content) || typeof entity.content.value !== "string") errors.push(`Entity ${entity.id} needs label and content.`);
      if (!Array.isArray(entity.behaviours) || !entity.behaviours.every((item) => isObject(item) && typeof item.id === "string" && item.id in behaviourCatalog)) errors.push(`Entity ${entity.id} uses an unknown behaviour.`);
    });
    const config = input.renderer.config;
    if ((input.renderer.id === "grid.v1" || input.renderer.id === "card_grid.v1") && (!(typeof config.rows === "number") || !(typeof config.columns === "number"))) errors.push("Grid renderers require numeric rows and columns.");
    if (input.renderer.id === "lanes.v1" && typeof config.lanes !== "number") errors.push("The lanes renderer requires a lane count.");
    if (input.renderer.id === "side_scroller.v1" && !["gravity", "impulse", "obstacleSpeed", "gapSize", "obstacleWidth", "spawnIntervalSeconds", "difficultyRate"].every((key) => typeof config[key] === "number")) errors.push("The side-scroller renderer requires every numeric physics placeholder.");
    return errors.length ? { ok: false, errors } : { ok: true, value: withRequirementCoverage({ renderer: input.renderer, entities: input.entities }, coverage.binding) };
  },
};
