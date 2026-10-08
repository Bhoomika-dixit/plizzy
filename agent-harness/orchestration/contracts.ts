import type { GameDefinitionV1, GameMode } from "../game-definition";

export type BuildStrategy = "declarative" | "hybrid" | "custom";
export type WorkflowStage = "planning" | "routing" | "generating" | "validating" | "repairing" | "completed" | "failed";
export type GameRequest = { title: string; prompt: string; mode: GameMode };
export type GamePlan = {
  genre: string;
  mechanics: string[];
  requiredCapabilities: string[];
  mode: GameMode;
  clarification?: string;
};
export type BuildDecision = { strategy: BuildStrategy; reason: string; capabilities: string[] };
export type WorkflowLimits = { maxRepairs: number; maxSteps: number; deadlineMs: number };
export type WorkflowEvent = { stage: WorkflowStage; attempt: number; detail?: string };
export type GeneratedArtifact = { kind: "game-definition-v1"; definition: GameDefinitionV1 };
export type WorkflowResult =
  | { ok: true; plan: GamePlan; decision: BuildDecision; artifact: GeneratedArtifact; events: WorkflowEvent[] }
  | { ok: false; code: "UNSUPPORTED_STRATEGY" | "INVALID_ARTIFACT" | "TIMEOUT" | "LIMIT_EXCEEDED" | "AGENT_ERROR"; message: string; events: WorkflowEvent[] };
