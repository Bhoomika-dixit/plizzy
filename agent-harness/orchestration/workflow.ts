import { validateGameDefinition } from "../game-definition";
import type { BuildDecision, GamePlan, GameRequest, GeneratedArtifact, WorkflowEvent, WorkflowLimits, WorkflowResult } from "./contracts";
import { canExecute, chooseStrategy } from "./policy";

export type WorkflowDependencies = {
  plan(request: GameRequest, signal: AbortSignal): Promise<GamePlan>;
  generate(request: GameRequest, plan: GamePlan, decision: BuildDecision, signal: AbortSignal): Promise<GeneratedArtifact>;
  repair?(request: GameRequest, plan: GamePlan, artifact: GeneratedArtifact, errors: string[], signal: AbortSignal): Promise<GeneratedArtifact>;
  onEvent?(event: WorkflowEvent): void | Promise<void>;
  now?(): number;
};

const DEFAULT_LIMITS: WorkflowLimits = { maxRepairs: 1, maxSteps: 8, deadlineMs: 60_000 };

/**
 * A bounded supervisor with typed worker contracts.
 * Deliberately does not run custom code, persist data or publish games.
 * Later LangGraph nodes can wrap these same pure contracts.
 */
export async function runGenerationWorkflow(
  request: GameRequest,
  deps: WorkflowDependencies,
  overrides: Partial<WorkflowLimits> = {},
): Promise<WorkflowResult> {
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  const now = deps.now ?? Date.now;
  const deadline = now() + limits.deadlineMs;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("Generation exceeded its deadline.")), limits.deadlineMs);
  const events: WorkflowEvent[] = [];
  let steps = 0;
  const emit = async (stage: WorkflowEvent["stage"], attempt: number, detail?: string) => {
    const event = { stage, attempt, ...(detail ? { detail } : {}) };
    events.push(event);
    await deps.onEvent?.(event);
  };
  const guard = () => {
    if (now() > deadline) throw new WorkflowError("TIMEOUT", "Generation exceeded its deadline.");
    if (++steps > limits.maxSteps) throw new WorkflowError("LIMIT_EXCEEDED", "Generation exceeded its step budget.");
  };

  try {
    guard();
    await emit("planning", 0);
    const plan = await deps.plan(request, controller.signal);
    if (plan.mode !== request.mode || !Array.isArray(plan.requiredCapabilities) || !Array.isArray(plan.mechanics)) {
      throw new WorkflowError("INVALID_ARTIFACT", "Planner returned an invalid plan.");
    }
    guard();
    await emit("routing", 0);
    const decision = chooseStrategy(plan);
    if (!canExecute(decision)) {
      await emit("failed", 0, decision.reason);
      return { ok: false, code: "UNSUPPORTED_STRATEGY", message: decision.reason, events };
    }
    guard();
    await emit("generating", 0);
    let artifact = await deps.generate(request, plan, decision, controller.signal);
    for (let attempt = 0; attempt <= limits.maxRepairs; attempt++) {
      guard();
      await emit("validating", attempt);
      const validation = artifact.kind === "game-definition-v1"
        ? validateGameDefinition(artifact.definition, request.mode)
        : { valid: false as const, errors: ["Unknown artifact format."] };
      if (validation.valid) {
        await emit("completed", attempt);
        return { ok: true, plan, decision, artifact, events };
      }
      if (attempt === limits.maxRepairs || !deps.repair) {
        await emit("failed", attempt, validation.errors.join("; "));
        return { ok: false, code: "INVALID_ARTIFACT", message: validation.errors.join("; "), events };
      }
      guard();
      await emit("repairing", attempt + 1);
      artifact = await deps.repair(request, plan, artifact, validation.errors, controller.signal);
    }
    throw new WorkflowError("LIMIT_EXCEEDED", "Unexpected repair loop exit.");
  } catch (error) {
    const code = controller.signal.aborted || error instanceof WorkflowError && error.code === "TIMEOUT" ? "TIMEOUT" : error instanceof WorkflowError ? error.code : "AGENT_ERROR";
    const message = error instanceof Error ? error.message : "Generation failed.";
    await emit("failed", 0, message);
    return { ok: false, code, message, events };
  } finally { clearTimeout(timeout); }
}

class WorkflowError extends Error {
  constructor(public readonly code: "TIMEOUT" | "LIMIT_EXCEEDED" | "INVALID_ARTIFACT", message: string) {
    super(message);
  }
}
