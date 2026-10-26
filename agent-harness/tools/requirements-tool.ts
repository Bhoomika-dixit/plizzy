import { descriptionWithSkill, DesignTool, isObject, objectSchema } from "./types";
import { registerGameRequirements, requirementToolNames, validateGameRequirements } from "./requirement-contract";
import { requirementsSkill } from "./skills/requirements";

const clauseSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", pattern: "^[a-z][a-z0-9_]{0,63}$" },
    statement: { type: "string" },
    source: { type: "string", enum: ["explicit_user_request", "inferred_from_reference", "inferred_for_playability"] },
    evidence: { type: "string", description: "For explicit requirements, quote the exact relevant words from the creator prompt." },
    priority: { type: "string", enum: ["required", "preferred"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["id", "statement", "source", "evidence", "priority", "confidence"],
};

const requirementGroups = Object.fromEntries(requirementToolNames.map((name) => [name, { type: "array", items: clauseSchema }]));

export const requirementsTool: DesignTool = {
  skill: requirementsSkill,
  definition: {
    name: "requirements_tool",
    description: descriptionWithSkill("Register the creator's prompt as a versioned requirements contract. This must be the first successful tool call. The returned requirement ID and exact assigned requirement IDs are required by every implementation tool.", requirementsSkill),
    input_schema: objectSchema({
      requirements: {
        type: "object",
        additionalProperties: false,
        properties: {
          schemaVersion: { type: "integer", const: 1 },
          concept: {
            type: "object",
            additionalProperties: false,
            properties: {
              titleHint: { type: "string" },
              genre: { type: "string" },
              objective: { type: "string" },
              playerCount: { type: "integer", const: 1 },
              referenceGames: { type: "array", items: { type: "string" } },
            },
            required: ["titleHint", "genre", "objective", "playerCount", "referenceGames"],
          },
          entities: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              properties: { id: { type: "string" }, role: { type: "string" }, description: { type: "string" } },
              required: ["id", "role", "description"],
            },
          },
          requirements: { type: "object", additionalProperties: false, properties: requirementGroups, required: [...requirementToolNames] },
          acceptanceCriteria: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              additionalProperties: false,
              properties: { id: { type: "string" }, statement: { type: "string" }, requirementIds: { type: "array", items: { type: "string" }, minItems: 1, uniqueItems: true } },
              required: ["id", "statement", "requirementIds"],
            },
          },
          ambiguities: { type: "array", items: { type: "string" } },
        },
        required: ["schemaVersion", "concept", "entities", "requirements", "acceptanceCriteria", "ambiguities"],
      },
    }, ["requirements"]),
  },
  execute(input, context) {
    if (!isObject(input)) return { ok: false, errors: ["requirements_tool expects a requirements object."] };
    const validation = validateGameRequirements(input.requirements, context.creatorPrompt);
    if (!validation.valid) return { ok: false, errors: validation.errors };
    return { ok: true, value: registerGameRequirements(validation.value) };
  },
};
