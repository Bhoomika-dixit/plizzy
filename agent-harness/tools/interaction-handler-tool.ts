import { interactionCatalog } from "./catalog";
import { validateRequirementBinding, withRequirementCoverage } from "./requirement-contract";
import { interactionHandlerSkill } from "./skills/interaction-handler";
import { descriptionWithSkill, DesignTool, isObject, objectSchema, requirementBindingSchema, safeId } from "./types";

export const interactionHandlerTool: DesignTool = {
  skill: interactionHandlerSkill,
  definition: {
    name: "interaction_handler_tool",
    description: descriptionWithSkill("Select executable player-input handlers from the catalogue. Each handler emits exactly the event declared by its public manifest.", interactionHandlerSkill),
    input_schema: objectSchema({ requirement: requirementBindingSchema, interactions: { type: "array", items: { type: "object" }, minItems: 1, maxItems: 12 } }, ["requirement", "interactions"]),
  },
  execute(input, context) {
    const coverage = validateRequirementBinding(input, "interaction_handler_tool", context);
    if (!coverage.valid) return { ok: false, errors: coverage.errors };
    if (!isObject(input) || !Array.isArray(input.interactions) || !input.interactions.length) return { ok: false, errors: ["Provide at least one interaction."] };
    const errors: string[] = [];
    input.interactions.forEach((item, index) => {
      if (!isObject(item) || !safeId(item.id) || typeof item.type !== "string" || !(item.type in interactionCatalog) || !isObject(item.target)) { errors.push(`Interaction ${index} is invalid.`); return; }
      if (item.event !== interactionCatalog[item.type as keyof typeof interactionCatalog].emits) errors.push(`Interaction ${item.id} emits the wrong event.`);
    });
    return errors.length ? { ok: false, errors } : { ok: true, value: withRequirementCoverage({ interactions: input.interactions }, coverage.binding) };
  },
};
