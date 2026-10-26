import { ruleCatalog } from "./catalog";
import { validateRequirementBinding, withRequirementCoverage } from "./requirement-contract";
import { rulesExecutionSkill } from "./skills/rules-execution";
import { descriptionWithSkill, DesignTool, isObject, objectSchema, requirementBindingSchema, safeId } from "./types";

export const rulesExecutionTool: DesignTool = {
  skill: rulesExecutionSkill,
  definition: {
    name: "rules_execution_tool",
    description: descriptionWithSkill("Configure the executable deterministic rules engine: state, event-condition-effect transitions, timer, collision/score capabilities, and win/lose outcomes.", rulesExecutionSkill),
    input_schema: objectSchema({
      requirement: requirementBindingSchema,
      state: { type: "object", additionalProperties: { type: ["string", "number", "boolean", "null"] } },
      rules: { type: "array", items: { type: "object" }, minItems: 1, maxItems: 80 },
      timer: { anyOf: [{ type: "object" }, { type: "null" }] },
      outcomes: { type: "object" },
    }, ["requirement", "state", "rules", "timer", "outcomes"]),
  },
  execute(input, context) {
    const coverage = validateRequirementBinding(input, "rules_execution_tool", context);
    if (!coverage.valid) return { ok: false, errors: coverage.errors };
    if (!isObject(input) || !isObject(input.state) || !Array.isArray(input.rules) || !input.rules.length || !isObject(input.outcomes)) return { ok: false, errors: ["State, rules, and outcomes are required."] };
    const errors: string[] = [];
    let endGame = false;
    input.rules.forEach((rule, index) => {
      if (!isObject(rule) || !safeId(rule.id) || !isObject(rule.trigger) || !ruleCatalog.events.includes(rule.trigger.event as never) || !Array.isArray(rule.effects) || !rule.effects.length) { errors.push(`Rule ${index} is invalid.`); return; }
      rule.effects.forEach((effect) => {
        if (!isObject(effect) || !ruleCatalog.effects.includes(effect.type as never)) errors.push(`Rule ${rule.id} uses an unsupported effect.`);
        if (isObject(effect) && effect.type === "END_GAME") endGame = true;
      });
    });
    if (!endGame) errors.push("Rules require at least one END_GAME effect.");
    if (input.timer !== null && (!isObject(input.timer) || typeof input.timer.durationSeconds !== "number")) errors.push("Timer must be null or configured with durationSeconds.");
    return errors.length ? { ok: false, errors } : { ok: true, value: withRequirementCoverage({ state: input.state, rules: input.rules, timer: input.timer, outcomes: input.outcomes }, coverage.binding) };
  },
};
