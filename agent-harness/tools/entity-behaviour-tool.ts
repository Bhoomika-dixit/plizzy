import { behaviourCatalog } from "./catalog";
import { validateRequirementBinding, withRequirementCoverage } from "./requirement-contract";
import { entityBehaviourSkill } from "./skills/entity-behaviour";
import { descriptionWithSkill, DesignTool, isObject, objectSchema, requirementBindingSchema } from "./types";

export const entityBehaviourTool: DesignTool = {
  skill: entityBehaviourSkill,
  definition: {
    name: "entity_behaviour_tool",
    description: descriptionWithSkill("Assign registered executable behaviour modules to entities using only their public configuration manifests.", entityBehaviourSkill),
    input_schema: objectSchema({ requirement: requirementBindingSchema, assignments: { type: "array", items: { type: "object", properties: { entityId: { type: "string" }, behaviours: { type: "array", items: { type: "object" } } }, required: ["entityId", "behaviours"] }, minItems: 1 } }, ["requirement", "assignments"]),
  },
  execute(input, context) {
    const coverage = validateRequirementBinding(input, "entity_behaviour_tool", context);
    if (!coverage.valid) return { ok: false, errors: coverage.errors };
    if (!isObject(input) || !Array.isArray(input.assignments) || !input.assignments.length) return { ok: false, errors: ["Provide behavior assignments."] };
    const errors: string[] = [];
    input.assignments.forEach((assignment, index) => {
      if (!isObject(assignment) || typeof assignment.entityId !== "string" || !Array.isArray(assignment.behaviours) || !assignment.behaviours.every((item) => isObject(item) && typeof item.id === "string" && item.id in behaviourCatalog)) errors.push(`Behavior assignment ${index} is invalid.`);
    });
    return errors.length ? { ok: false, errors } : { ok: true, value: withRequirementCoverage({ assignments: input.assignments }, coverage.binding) };
  },
};
