import "server-only";
import { startObservation } from "@langfuse/tracing";

type ModelRecord = { input: string; content: string; usage: Record<string, unknown>; model: string; latencyMs: number; turn: number; phase: "requirements" | "design" | "repair"; toolsEnabled: boolean; stopReason?: string };
type FailureRecord = { model: string; latencyMs: number; detail: string; turn: number; phase: "requirements" | "design" | "repair" };
type ToolRecord = { name: string; callId: string; input: unknown; output?: unknown; errors?: string[]; latencyMs: number; turn: number; successful: boolean };
type SimulationRecord = { attempt: number; playable: boolean; reachableEvents: string[]; errors: string[]; latencyMs: number };

export type GameGenerationTrace = {
  traceId?: string;
  observationId?: string;
  recordPrompt(record: { catalogSize: number; promptCharacters: number; latencyMs: number }): void;
  recordModelSuccess(record: ModelRecord): void;
  recordModelFailure(record: FailureRecord): void;
  recordTool(record: ToolRecord): void;
  recordImageGeneration(record: { assetId: string; prompt: string; model: string; usage: Record<string, unknown>; latencyMs: number; successful: boolean; output?: Record<string, unknown>; error?: string }): void;
  recordOrchestration(record: { turn: number; decision: string; completedTools: string[]; missingTools: string[]; contentBlockTypes?: string[] }): void;
  recordValidation(record: { valid: boolean; errors: string[]; attempt: number; latencyMs?: number }): void;
  recordSimulation(record: SimulationRecord): void;
  completeAgent(output: Record<string, unknown>): void;
  recordPersistenceStage(record: { stage: string; successful: boolean; latencyMs: number; output?: Record<string, unknown>; error?: string }): void;
  recordPersistence(record: Record<string, unknown>): void;
  finish(output: Record<string, unknown>): void;
  fail(error: unknown): void;
};

const enabled = () => Boolean(process.env.LANGFUSE_PUBLIC_KEY?.trim() && process.env.LANGFUSE_SECRET_KEY?.trim());
const noOpTrace: GameGenerationTrace = { recordPrompt() {}, recordModelSuccess() {}, recordModelFailure() {}, recordTool() {}, recordImageGeneration() {}, recordOrchestration() {}, recordValidation() {}, recordSimulation() {}, completeAgent() {}, recordPersistenceStage() {}, recordPersistence() {}, finish() {}, fail() {} };
const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

function generationUsage(usage: Record<string, unknown>) {
  const cacheCreation = typeof usage.cache_creation === "object" && usage.cache_creation ? usage.cache_creation as Record<string, unknown> : {};
  const cacheCreationTotal = numeric(usage.cache_creation_input_tokens);
  const nestedCacheCreation5m = numeric(cacheCreation.ephemeral_5m_input_tokens);
  const nestedCacheCreation1h = numeric(cacheCreation.ephemeral_1h_input_tokens);
  const hasCacheBreakdown = nestedCacheCreation5m + nestedCacheCreation1h > 0;
  const cacheCreation5m = hasCacheBreakdown ? nestedCacheCreation5m : cacheCreationTotal;
  const cacheCreation1h = hasCacheBreakdown ? nestedCacheCreation1h : 0;
  const details = {
    input: numeric(usage.input_tokens),
    output: numeric(usage.output_tokens),
    cache_read_input_tokens: numeric(usage.cache_read_input_tokens),
    cache_creation_5m_input_tokens: cacheCreation5m,
    cache_creation_1h_input_tokens: cacheCreation1h,
  };
  return { ...details, total: Object.values(details).reduce((sum, value) => sum + value, 0) };
}

function generationCost(model: string, usage: ReturnType<typeof generationUsage>) {
  if (!/^claude-sonnet-5-5(?:$|-)/i.test(model)) return undefined;
  const details = {
    input: usage.input * 2 / 1_000_000,
    output: usage.output * 10 / 1_000_000,
    cache_read_input_tokens: usage.cache_read_input_tokens * .1 / 1_000_000,
    cache_creation_5m_input_tokens: usage.cache_creation_5m_input_tokens * 2.5 / 1_000_000,
    cache_creation_1h_input_tokens: usage.cache_creation_1h_input_tokens * 4 / 1_000_000,
  };
  return { ...details, total: Object.values(details).reduce((sum, value) => sum + value, 0) };
}

export function startGameGenerationTrace(input: { workflowId: string; userId: string; title: string; prompt: string; mode: string }): GameGenerationTrace {
  if (!enabled()) return noOpTrace;

  const chain = startObservation("plizzy.game_generation", {
    input: { title: input.title, prompt: input.prompt, mode: input.mode },
    metadata: { workflowId: input.workflowId, userId: input.userId, provider: "anthropic", promptVersion: "game-definition-v2-requirements", schemaVersion: 2 },
    version: "game-definition-v2-requirements",
  }, { asType: "chain" });

  const agent = chain.startObservation("plizzy.game_designer", {
    input: { title: input.title, prompt: input.prompt, mode: input.mode },
    metadata: { provider: "anthropic", promptVersion: "game-definition-v2-requirements", schemaVersion: 2 },
  }, { asType: "agent" });

  const totals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, totalCostUsd: 0 };
  const summary: Record<string, unknown> = { totalUsageAndCost: totals, modelCalls: [], imageGenerations: [], orchestration: [], validations: [], simulations: [], persistenceStages: [] };
  let agentEnded = false;
  const endAgent = (output: Record<string, unknown>, failed = false) => {
    if (agentEnded) return;
    agentEnded = true;
    agent.update({ output: { ...output, observability: summary }, ...(failed ? { level: "ERROR" as const, statusMessage: "Game design agent failed" } : {}) });
    agent.end();
  };

  return {
    traceId: chain.traceId,
    observationId: chain.id,
    recordPrompt(record) { summary.prompt = record; },
    recordModelSuccess(record) {
      const usageDetails = generationUsage(record.usage);
      const costDetails = generationCost(record.model, usageDetails);
      totals.inputTokens += usageDetails.input;
      totals.outputTokens += usageDetails.output;
      totals.cacheReadTokens += usageDetails.cache_read_input_tokens;
      totals.cacheWriteTokens += usageDetails.cache_creation_5m_input_tokens + usageDetails.cache_creation_1h_input_tokens;
      totals.totalTokens += usageDetails.total;
      totals.totalCostUsd += costDetails?.total ?? 0;
      const generation = agent.startObservation("plizzy.game_design_model", {
        input: record.input,
        output: record.content,
        model: record.model,
        modelParameters: { effort: "low", max_tokens: 6500 },
        usageDetails,
        ...(costDetails ? { costDetails } : {}),
        metadata: { provider: "anthropic", latencyMs: record.latencyMs, turn: record.turn, phase: record.phase, toolsEnabled: record.toolsEnabled, stopReason: record.stopReason },
      }, { asType: "generation" });
      generation.end();
      (summary.modelCalls as unknown[]).push({ model: record.model, usage: usageDetails, costUsd: costDetails?.total, latencyMs: record.latencyMs, turn: record.turn, phase: record.phase, toolsEnabled: record.toolsEnabled, stopReason: record.stopReason, successful: true });
    },
    recordModelFailure(record) {
      const generation = agent.startObservation("plizzy.game_design_model", { model: record.model, output: { error: record.detail }, level: "ERROR", statusMessage: "Provider request failed", metadata: { provider: "anthropic", latencyMs: record.latencyMs, turn: record.turn, phase: record.phase } }, { asType: "generation" });
      generation.end();
      (summary.modelCalls as unknown[]).push({ model: record.model, latencyMs: record.latencyMs, turn: record.turn, phase: record.phase, successful: false, error: record.detail });
    },
    recordTool(record) {
      const tool = agent.startObservation(`plizzy.tool.${record.name}`, {
        input: record.input,
        output: record.successful ? record.output : { errors: record.errors },
        level: record.successful ? "DEFAULT" : "WARNING",
        statusMessage: record.successful ? "Tool completed" : "Tool validation failed",
        metadata: { callId: record.callId, latencyMs: record.latencyMs, turn: record.turn, successful: record.successful },
      }, { asType: "tool" });
      tool.end();
    },
    recordImageGeneration(record) {
      const usageDetails = {
        input: numeric(record.usage.inputTokens),
        output: numeric(record.usage.outputTokens),
        total: numeric(record.usage.totalTokens),
      };
      totals.inputTokens += usageDetails.input;
      totals.outputTokens += usageDetails.output;
      totals.totalTokens += usageDetails.total;
      const generation = chain.startObservation("plizzy.asset_generation_model", {
        input: record.prompt,
        output: record.successful ? record.output : { error: record.error },
        model: record.model,
        usageDetails,
        level: record.successful ? "DEFAULT" : "ERROR",
        statusMessage: record.successful ? "Generated gameplay asset" : "Gameplay asset generation failed",
        metadata: { provider: "vercel-ai-gateway", assetId: record.assetId, latencyMs: record.latencyMs },
      }, { asType: "generation" });
      generation.end();
      (summary.imageGenerations as unknown[]).push({ assetId: record.assetId, model: record.model, usage: usageDetails, latencyMs: record.latencyMs, successful: record.successful, error: record.error });
    },
    recordOrchestration(record) { (summary.orchestration as unknown[]).push(record); },
    recordValidation(record) { (summary.validations as unknown[]).push(record); },
    recordSimulation(record) { (summary.simulations as unknown[]).push(record); },
    completeAgent(output) { endAgent(output); },
    recordPersistenceStage(record) { (summary.persistenceStages as unknown[]).push(record); },
    recordPersistence(record) { summary.persistence = record; },
    finish(output) {
      endAgent({ accepted: Boolean(output.accepted) });
      chain.update({ output, metadata: { workflowId: input.workflowId, userId: input.userId, provider: "anthropic", promptVersion: "game-definition-v2-requirements", schemaVersion: 2, completed: true } });
      chain.end();
    },
    fail(error) {
      const message = error instanceof Error ? error.message : "Generation failed";
      endAgent({ error: message }, true);
      chain.update({ output: { error: message }, level: "ERROR", statusMessage: "Game generation chain failed" });
      chain.end();
    },
  };
}
