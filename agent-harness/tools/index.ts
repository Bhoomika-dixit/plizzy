import { assetGenerationTool } from "./asset-generation-tool";
import { entityBehaviourTool } from "./entity-behaviour-tool";
import { interactionHandlerTool } from "./interaction-handler-tool";
import { renderIdentificationTool } from "./render-identification-tool";
import { requirementsTool } from "./requirements-tool";
import { rulesExecutionTool } from "./rules-execution-tool";
import { textGenerationTool } from "./text-generation-tool";
import { DesignTool, DesignToolContext } from "./types";

export const requirementDesignTools = [requirementsTool] as const;
export const implementationDesignTools = [renderIdentificationTool, interactionHandlerTool, entityBehaviourTool, rulesExecutionTool, assetGenerationTool, textGenerationTool] as const;
export const designTools = [...requirementDesignTools, ...implementationDesignTools] as const;
export const requiredDesignToolNames = implementationDesignTools.map((tool) => tool.definition.name);
const byName = new Map<string, DesignTool>(designTools.map((tool) => [tool.definition.name, tool]));

export function executeDesignTool(name: string, input: unknown, context: DesignToolContext) {
  const tool = byName.get(name);
  if (!tool) return { ok: false as const, errors: [`Unknown design tool: ${name}`] };
  return tool.execute(input, context);
}
