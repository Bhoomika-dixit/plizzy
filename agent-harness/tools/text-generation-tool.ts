import { requiredTextSlots } from "./catalog";
import { validateRequirementBinding, withRequirementCoverage } from "./requirement-contract";
import { textGenerationSkill } from "./skills/text-generation";
import { descriptionWithSkill, DesignTool, isObject, objectSchema, requirementBindingSchema } from "./types";

export const textGenerationTool: DesignTool = {
  skill: textGenerationSkill,
  definition: {
    name: "text_generation_tool",
    description: descriptionWithSkill("Fill the named placeholders consumed by the executable text resolver so copy can be placed, interpolated, validated, and localized.", textGenerationSkill),
    input_schema: objectSchema({ requirement: requirementBindingSchema, tone: { type: "string" }, texts: { type: "object", additionalProperties: { type: "string" } } }, ["requirement", "tone", "texts"]),
  },
  execute(input, context) {
    const coverage = validateRequirementBinding(input, "text_generation_tool", context);
    if (!coverage.valid) return { ok: false, errors: coverage.errors };
    if (!isObject(input) || typeof input.tone !== "string" || !isObject(input.texts)) return { ok: false, errors: ["Tone and named text slots are required."] };
    const texts = input.texts;
    const errors = requiredTextSlots.filter((slot) => typeof texts[slot] !== "string" || !String(texts[slot]).trim()).map((slot) => `Missing required text slot ${slot}.`);
    return errors.length ? { ok: false, errors } : { ok: true, value: withRequirementCoverage({ tone: input.tone, texts }, coverage.binding) };
  },
};
