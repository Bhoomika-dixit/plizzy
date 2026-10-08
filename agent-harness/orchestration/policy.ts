import type { BuildDecision, BuildStrategy, GamePlan } from "./contracts";

/**
 * Policy is intentionally independent from model reasoning.
 * Only declarative V1 has a production executor today.
 */
const availableCapabilities = new Set(["tap_entity", "score", "timer", "move_entity", "random_choice", "phase"]);
const executableStrategies = new Set<BuildStrategy>(["declarative"]);

export function chooseStrategy(plan: GamePlan): BuildDecision {
  const missing = plan.requiredCapabilities.filter((capability) => !availableCapabilities.has(capability));
  if (missing.length) {
    return { strategy: "custom", reason: `Requires capabilities not present in V1: ${missing.join(", ")}`, capabilities: plan.requiredCapabilities };
  }
  return { strategy: "declarative", reason: "All requested capabilities are supported by the V1 runtime.", capabilities: plan.requiredCapabilities };
}

export function canExecute(decision: BuildDecision): boolean {
  return executableStrategies.has(decision.strategy);
}
