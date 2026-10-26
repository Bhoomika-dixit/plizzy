export type ToolDefinition = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type ToolSkill = {
  name: string;
  purpose: string;
  instructions: readonly string[];
};

export type RequirementToolName =
  | "render_identification_tool"
  | "interaction_handler_tool"
  | "entity_behaviour_tool"
  | "rules_execution_tool"
  | "asset_generation_tool"
  | "text_generation_tool";

export type RequirementBinding = {
  requirementId: string;
  requirementVersion: number;
  requirementIds: string[];
};

export type RegisteredRequirements = {
  accepted: true;
  requirementId: string;
  requirementVersion: 1;
  hash: string;
  requirements: Record<string, unknown>;
};

export type DesignToolContext = {
  creatorPrompt: string;
  registeredRequirements?: RegisteredRequirements;
};

export type DesignTool = {
  skill: ToolSkill;
  definition: ToolDefinition;
  execute(input: unknown, context: DesignToolContext): { ok: true; value: unknown } | { ok: false; errors: string[] };
};

export const objectSchema = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

export const isObject = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
export const safeId = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(value);

export const requirementBindingSchema = {
  type: "object",
  additionalProperties: false,
  description: "Reference the immutable requirements registered by requirements_tool and list every requirement assigned to this tool.",
  properties: {
    requirementId: { type: "string" },
    requirementVersion: { type: "integer", const: 1 },
    requirementIds: { type: "array", items: { type: "string" }, uniqueItems: true },
  },
  required: ["requirementId", "requirementVersion", "requirementIds"],
};

export function descriptionWithSkill(description: string, skill: ToolSkill) {
  return `${description}\n\nSkill: ${skill.purpose}\n${skill.instructions.map((instruction) => `- ${instruction}`).join("\n")}`;
}
