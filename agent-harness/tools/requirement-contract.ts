import { createHash } from "crypto";
import { DesignToolContext, isObject, RequirementBinding, RequirementToolName, safeId } from "./types";

export const requirementToolNames = [
  "render_identification_tool",
  "interaction_handler_tool",
  "entity_behaviour_tool",
  "rules_execution_tool",
  "asset_generation_tool",
  "text_generation_tool",
] as const satisfies readonly RequirementToolName[];

export type RequirementClause = {
  id: string;
  statement: string;
  source: "explicit_user_request" | "inferred_from_reference" | "inferred_for_playability";
  evidence: string;
  priority: "required" | "preferred";
  confidence: number;
};

export type GameRequirements = {
  schemaVersion: 1;
  concept: {
    titleHint: string;
    genre: string;
    objective: string;
    playerCount: 1;
    referenceGames: string[];
  };
  entities: Array<{ id: string; role: string; description: string }>;
  requirements: Record<RequirementToolName, RequirementClause[]>;
  acceptanceCriteria: Array<{ id: string; statement: string; requirementIds: string[] }>;
  ambiguities: string[];
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function normalizedExcerpt(value: string) {
  return value.toLocaleLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

export function validateGameRequirements(value: unknown, creatorPrompt: string): { valid: true; value: GameRequirements } | { valid: false; errors: string[] } {
  if (!isObject(value)) return { valid: false, errors: ["requirements must be an object."] };
  const errors: string[] = [];
  if (value.schemaVersion !== 1) errors.push("requirements.schemaVersion must be 1.");

  const concept = isObject(value.concept) ? value.concept : {};
  if (![concept.titleHint, concept.genre, concept.objective].every((item) => typeof item === "string" && item.trim().length > 0)) errors.push("requirements.concept needs titleHint, genre, and objective.");
  if (concept.playerCount !== 1) errors.push("requirements.concept.playerCount must be 1 for the current single-player system.");
  if (!Array.isArray(concept.referenceGames) || !concept.referenceGames.every((item) => typeof item === "string")) errors.push("requirements.concept.referenceGames must be a string array.");

  const entities = Array.isArray(value.entities) ? value.entities : [];
  const entityIds = new Set<string>();
  if (!entities.length) errors.push("requirements.entities must describe at least one entity.");
  entities.forEach((entity, index) => {
    if (!isObject(entity) || !safeId(entity.id) || entityIds.has(entity.id) || typeof entity.role !== "string" || !entity.role.trim() || typeof entity.description !== "string" || !entity.description.trim()) {
      errors.push(`requirements.entities[${index}] is invalid or duplicated.`);
      return;
    }
    entityIds.add(entity.id);
  });

  const groups = isObject(value.requirements) ? value.requirements : {};
  const groupKeys = Object.keys(groups);
  for (const name of requirementToolNames) if (!Array.isArray(groups[name])) errors.push(`requirements.requirements.${name} must be an array.`);
  for (const name of groupKeys) if (!requirementToolNames.includes(name as RequirementToolName)) errors.push(`requirements.requirements contains unknown tool section ${name}.`);

  const requirementIds = new Set<string>();
  for (const name of requirementToolNames) {
    const clauses = Array.isArray(groups[name]) ? groups[name] : [];
    clauses.forEach((clause, index) => {
      if (!isObject(clause) || !safeId(clause.id) || requirementIds.has(clause.id)) {
        errors.push(`${name}[${index}] has an invalid or duplicate requirement id.`);
        return;
      }
      requirementIds.add(clause.id);
      if (typeof clause.statement !== "string" || !clause.statement.trim()) errors.push(`${clause.id}.statement is required.`);
      if (!['explicit_user_request', 'inferred_from_reference', 'inferred_for_playability'].includes(String(clause.source))) errors.push(`${clause.id}.source is invalid.`);
      if (typeof clause.evidence !== "string" || !clause.evidence.trim()) errors.push(`${clause.id}.evidence is required.`);
      if (!['required', 'preferred'].includes(String(clause.priority))) errors.push(`${clause.id}.priority is invalid.`);
      if (typeof clause.confidence !== "number" || !Number.isFinite(clause.confidence) || clause.confidence < 0 || clause.confidence > 1) errors.push(`${clause.id}.confidence must be between 0 and 1.`);
      if (clause.source === "explicit_user_request" && typeof clause.evidence === "string" && !normalizedExcerpt(creatorPrompt).includes(normalizedExcerpt(clause.evidence))) errors.push(`${clause.id}.evidence must quote the creator prompt when source is explicit_user_request.`);
    });
  }

  for (const requiredSection of ["render_identification_tool", "interaction_handler_tool", "rules_execution_tool", "text_generation_tool"] as const) {
    if (Array.isArray(groups[requiredSection]) && groups[requiredSection].length === 0) errors.push(`${requiredSection} needs at least one requirement for a playable game.`);
  }

  const acceptanceCriteria = Array.isArray(value.acceptanceCriteria) ? value.acceptanceCriteria : [];
  const criterionIds = new Set<string>();
  if (!acceptanceCriteria.length) errors.push("requirements.acceptanceCriteria must not be empty.");
  acceptanceCriteria.forEach((criterion, index) => {
    if (!isObject(criterion) || !safeId(criterion.id) || criterionIds.has(criterion.id) || typeof criterion.statement !== "string" || !criterion.statement.trim() || !Array.isArray(criterion.requirementIds) || !criterion.requirementIds.length || !criterion.requirementIds.every((id) => typeof id === "string" && requirementIds.has(id))) {
      errors.push(`requirements.acceptanceCriteria[${index}] is invalid or references unknown requirements.`);
      return;
    }
    criterionIds.add(criterion.id);
  });
  if (!Array.isArray(value.ambiguities) || !value.ambiguities.every((item) => typeof item === "string" && item.trim())) errors.push("requirements.ambiguities must be a string array.");

  return errors.length ? { valid: false, errors } : { valid: true, value: value as unknown as GameRequirements };
}

export function registerGameRequirements(value: GameRequirements) {
  const canonical = JSON.stringify(canonicalize(value));
  const hash = createHash("sha256").update(canonical).digest("hex");
  return {
    accepted: true as const,
    requirementId: `req_${hash.slice(0, 16)}`,
    requirementVersion: 1 as const,
    hash,
    requirements: value,
  };
}

export function validateRequirementBinding(input: unknown, toolName: RequirementToolName, context: DesignToolContext): { valid: true; binding: RequirementBinding } | { valid: false; errors: string[] } {
  if (!isObject(input) || !isObject(input.requirement)) return { valid: false, errors: ["A requirement binding from requirements_tool is required."] };
  const registered = context.registeredRequirements;
  if (!registered) return { valid: false, errors: ["requirements_tool must succeed before implementation tools can run."] };
  const binding = input.requirement;
  const errors: string[] = [];
  if (binding.requirementId !== registered.requirementId) errors.push("requirement.requirementId does not match the registered contract.");
  if (binding.requirementVersion !== registered.requirementVersion) errors.push("requirement.requirementVersion does not match the registered contract.");
  if (!Array.isArray(binding.requirementIds) || !binding.requirementIds.every((id) => typeof id === "string")) errors.push("requirement.requirementIds must be an array of requirement IDs.");
  const requirements = registered.requirements as unknown as GameRequirements;
  const expected = requirements.requirements[toolName].map((item) => item.id).sort();
  const supplied = Array.isArray(binding.requirementIds) ? [...new Set(binding.requirementIds.filter((id): id is string => typeof id === "string"))].sort() : [];
  const missing = expected.filter((id) => !supplied.includes(id));
  const unexpected = supplied.filter((id) => !expected.includes(id));
  if (missing.length) errors.push(`Missing assigned requirements: ${missing.join(", ")}.`);
  if (unexpected.length) errors.push(`Requirements are not assigned to ${toolName}: ${unexpected.join(", ")}.`);
  return errors.length ? { valid: false, errors } : { valid: true, binding: binding as unknown as RequirementBinding };
}

export function withRequirementCoverage(value: Record<string, unknown>, binding: RequirementBinding) {
  return { ...value, requirementCoverage: { requirementId: binding.requirementId, requirementVersion: binding.requirementVersion, addressedRequirementIds: binding.requirementIds } };
}
