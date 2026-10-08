import { generateGameDefinition } from "../game-designer";
import type { GameGenerationTrace } from "../observability";
import { planGame } from "./agents";
import { runGenerationWorkflow } from "./workflow";
import type { GameRequest } from "./contracts";

/**
 * Production opt-in adapter. Existing validated game generator remains the
 * declarative worker. Unsupported mechanics fail explicitly, never degrade.
 */
export async function executeV2(request: GameRequest, trace?: GameGenerationTrace) {
  let repairCount = 0;
  let model = "";
  let usage: Record<string, unknown> = {};
  const result = await runGenerationWorkflow(request, {
    plan: (input) => planGame(input),
    generate: async (input) => {
      const generated = await generateGameDefinition({ ...input, trace });
      if (!generated.valid) throw new Error(generated.errors.join("; "));
      repairCount = generated.repairCount;
      model = generated.model;
      usage = generated.usage;
      return { kind: "game-definition-v1" as const, definition: generated.definition };
    },
    onEvent: (event) => {
      trace?.recordValidation({ valid: event.stage !== "failed", errors: event.stage === "failed" ? [event.detail ?? "failed"] : [], attempt: event.attempt });
    },
  }, { maxRepairs: 0, deadlineMs: 120_000 });
  if (!result.ok) return { valid: false as const, errors: [result.message], workflowCode: result.code };
  return { valid: true as const, definition: result.artifact.definition, repairCount, model, usage, strategy: result.decision.strategy, plan: result.plan };
}
