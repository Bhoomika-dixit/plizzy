import { startObservation } from "@langfuse/tracing";

type ModelRecord = { input: string; content: string; usage: Record<string, unknown>; model: string; latencyMs: number };
type FailureRecord = { model: string; latencyMs: number; detail: string };

export type GameGenerationTrace = {
  traceId?: string;
  recordModelSuccess(record: ModelRecord): void;
  recordModelFailure(record: FailureRecord): void;
  recordValidation(record: { valid: boolean; errors: string[]; attempt: number }): void;
  recordPersistence(record: Record<string, unknown>): void;
  finish(output: Record<string, unknown>): void;
  fail(error: unknown): void;
};

const enabled = () => Boolean(process.env.LANGFUSE_PUBLIC_KEY?.trim() && process.env.LANGFUSE_SECRET_KEY?.trim());
const asUsage = (usage: Record<string, unknown>) => Object.fromEntries(Object.entries(usage).filter(([, value]) => typeof value === "number")) as Record<string, number>;

export function startGameGenerationTrace(input: { workflowId: string; userId: string; title: string; prompt: string; mode: string }): GameGenerationTrace {
  if (!enabled()) return { recordModelSuccess() {}, recordModelFailure() {}, recordValidation() {}, recordPersistence() {}, finish() {}, fail() {} };
  const workflow = startObservation("plizzy.game_generation", { input: { title: input.title, prompt: input.prompt, mode: input.mode }, metadata: { workflowId: input.workflowId, userId: input.userId, provider: "anthropic", promptVersion: "game-definition-v1" }, version: "game-definition-v1" }, { asType: "chain" });
  return {
    traceId: workflow.traceId,
    recordModelSuccess(record) { const generation = workflow.startObservation("plizzy.game_design_model", { input: record.input, output: record.content, model: record.model, modelParameters: { effort: "low", max_tokens: 2800 }, usageDetails: asUsage(record.usage), metadata: { provider: "anthropic", latencyMs: record.latencyMs, promptVersion: "game-definition-v1" } }, { asType: "generation" }); generation.end(); },
    recordModelFailure(record) { const generation = workflow.startObservation("plizzy.game_design_model", { model: record.model, output: { error: record.detail }, level: "ERROR", statusMessage: "Provider request failed", metadata: { provider: "anthropic", latencyMs: record.latencyMs } }, { asType: "generation" }); generation.end(); },
    recordValidation(record) { const validation = workflow.startObservation("plizzy.definition_validation", { output: record, level: record.valid ? "DEFAULT" : "WARNING", metadata: { attempt: record.attempt } }); validation.end(); },
    recordPersistence(record) { const persistence = workflow.startObservation("plizzy.version_persistence", { output: record, level: record.error ? "WARNING" : "DEFAULT" }); persistence.end(); },
    finish(output) { workflow.update({ output }); workflow.end(); },
    fail(error) { workflow.update({ output: { error: error instanceof Error ? error.message : "Generation failed" }, level: "ERROR", statusMessage: "Game generation workflow failed" }); workflow.end(); },
  };
}
