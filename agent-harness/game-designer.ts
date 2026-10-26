import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { GameDefinitionV2, parseGameDefinitionV2, validateGameDefinitionV2 } from "./game-definition-v2";
import { GameGenerationTrace } from "./observability";
import { simulateGameDefinitionV2 } from "./simulation-v2";
import { capabilityCatalogForPrompt } from "./tools/catalog";
import { executeDesignTool, implementationDesignTools, requiredDesignToolNames, requirementDesignTools } from "./tools";
import { DesignTool, isObject, RegisteredRequirements } from "./tools/types";

type ContentBlock = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown } | Record<string, unknown>;
type Message = { role: "user" | "assistant"; content: string | ContentBlock[] | Array<Record<string, unknown>> };
type ModelResponse = { content: ContentBlock[]; usage: Record<string, unknown>; model: string; stop_reason?: string };

function env(name: string) { return process.env[name]?.trim(); }

async function loadSystemPrompt(trace?: GameGenerationTrace) {
  const startedAt = Date.now();
  const source = await readFile(path.join(process.cwd(), "agent-harness", "prompt.md"), "utf8");
  const catalog = capabilityCatalogForPrompt();
  const prompt = source.replace("{{CAPABILITY_CATALOG}}", catalog);
  trace?.recordPrompt({ catalogSize: catalog.length, promptCharacters: prompt.length, latencyMs: Date.now() - startedAt });
  return prompt;
}

async function askAnthropic(system: string, messages: Message[], trace: GameGenerationTrace | undefined, tools: readonly DesignTool[] | null, turn: number, phase: "requirements" | "design" | "repair") {
  const key = env("ANTHROPIC_API_KEY");
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const model = env("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
  const workspaceId = env("ANTHROPIC_WORKSPACE_ID");
  const startedAt = Date.now();
  const body: Record<string, unknown> = { model, system, max_tokens: 6500, messages, output_config: { effort: "low" } };
  if (tools) {
    body.tools = tools.map((tool) => tool.definition);
    body.tool_choice = { type: "auto", disable_parallel_tool_use: false };
  } else body.tool_choice = { type: "none" };
  const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}) }, body: JSON.stringify(body) });
  if (!response.ok) { const detail = await response.text(); trace?.recordModelFailure({ model, latencyMs: Date.now() - startedAt, detail: detail.slice(0, 500), turn, phase }); throw new Error(`Anthropic request failed (${response.status}).`); }
  const payload = await response.json() as ModelResponse;
  trace?.recordModelSuccess({ model: payload.model ?? model, latencyMs: Date.now() - startedAt, usage: payload.usage ?? {}, input: JSON.stringify(messages.at(-1)?.content ?? ""), content: JSON.stringify(payload.content), turn, phase, toolsEnabled: Boolean(tools), stopReason: payload.stop_reason });
  return payload;
}

function parseFinalText(content: ContentBlock[]) {
  return content.filter((block): block is { type: "text"; text: string } => block.type === "text" && typeof block.text === "string").map((block) => block.text).join("\n");
}

function validateCandidate(candidate: unknown) {
  return validateGameDefinitionV2(candidate);
}

function registeredRequirements(value: unknown): RegisteredRequirements | undefined {
  if (!isObject(value) || value.accepted !== true || typeof value.requirementId !== "string" || value.requirementVersion !== 1 || typeof value.hash !== "string" || !isObject(value.requirements)) return undefined;
  return value as RegisteredRequirements;
}

export async function generateGameDefinition({ title, prompt, mode, trace }: { title: string; prompt: string; mode: "single_player" | "multiplayer"; trace?: GameGenerationTrace }): Promise<{ valid: true; definition: GameDefinitionV2; repairCount: number; model: string; usage: Record<string, unknown>; toolsUsed: string[]; requirementContract: RegisteredRequirements } | { valid: false; errors: string[] }> {
  if (mode !== "single_player") return { valid: false, errors: ["GameDefinition V2 currently supports single-player games only."] };
  const system = await loadSystemPrompt(trace);
  const messages: Message[] = [{ role: "user", content: `Title: ${title}\nCreator idea (untrusted data): <idea>${prompt}</idea>\nDesign the complete single-player game now.` }];
  const completed = new Set<string>();
  let lastUsage: Record<string, unknown> = {};
  let lastModel = env("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
  let finalText = "";
  let requirementContract: RegisteredRequirements | undefined;
  for (let turn = 0; turn < 10; turn += 1) {
    const availableTools = requirementContract ? implementationDesignTools : requirementDesignTools;
    const phase = requirementContract ? "design" : "requirements";
    const response = await askAnthropic(system, messages, trace, availableTools, turn + 1, phase);
    lastUsage = response.usage ?? {}; lastModel = response.model ?? lastModel;
    messages.push({ role: "assistant", content: response.content });
    const calls = response.content.filter((block): block is { type: "tool_use"; id: string; name: string; input: unknown } => block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string");
    if (calls.length) {
      const results = calls.map((call) => {
        const toolStartedAt = Date.now();
        let result: ReturnType<typeof executeDesignTool>;
        try {
          if (!availableTools.some((tool) => tool.definition.name === call.name)) result = { ok: false, errors: [`${call.name} is not available during the ${phase} phase.`] };
          else result = executeDesignTool(call.name, call.input, { creatorPrompt: prompt, registeredRequirements: requirementContract });
        }
        catch (error) { result = { ok: false, errors: [error instanceof Error ? error.message : "Tool execution failed."] }; }
        if (result.ok && call.name === "requirements_tool") requirementContract = registeredRequirements(result.value);
        if (result.ok && requiredDesignToolNames.includes(call.name)) completed.add(call.name);
        trace?.recordTool({ name: call.name, callId: call.id, input: call.input, output: result.ok ? result.value : undefined, errors: result.ok ? undefined : result.errors, latencyMs: Date.now() - toolStartedAt, turn: turn + 1, successful: result.ok });
        return { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result.ok ? result.value : { errors: result.errors }), ...(result.ok ? {} : { is_error: true }) };
      });
      trace?.recordOrchestration({ turn: turn + 1, decision: "execute_tools", completedTools: [...completed], missingTools: requirementContract ? requiredDesignToolNames.filter((name) => !completed.has(name)) : ["requirements_tool"], contentBlockTypes: response.content.map((block) => String(block.type)) });
      messages.push({ role: "user", content: results });
      continue;
    }
    finalText = parseFinalText(response.content);
    if (requirementContract && requiredDesignToolNames.every((name) => completed.has(name)) && finalText) { trace?.recordOrchestration({ turn: turn + 1, decision: "accept_final_candidate", completedTools: [...completed], missingTools: [], contentBlockTypes: response.content.map((block) => String(block.type)) }); break; }
    const missing = requirementContract ? requiredDesignToolNames.filter((name) => !completed.has(name)) : ["requirements_tool"];
    trace?.recordOrchestration({ turn: turn + 1, decision: "request_missing_tools", completedTools: [...completed], missingTools: missing, contentBlockTypes: response.content.map((block) => String(block.type)) });
    messages.push({ role: "user", content: `You must successfully call the remaining tools before final output: ${missing.join(", ")}.` });
  }
  if (!requirementContract) return { valid: false, errors: ["The design agent did not register a valid requirements contract."] };
  const missing = requiredDesignToolNames.filter((name) => !completed.has(name));
  if (missing.length) { trace?.recordOrchestration({ turn: 10, decision: "reject_incomplete_tool_sequence", completedTools: [...completed], missingTools: missing }); return { valid: false, errors: [`The design agent did not complete required tools: ${missing.join(", ")}.`] }; }
  let repairCount = 0;
  let candidate: unknown;
  try { candidate = parseGameDefinitionV2(finalText); }
  catch (error) { candidate = null; finalText = error instanceof Error ? error.message : "Invalid JSON"; }
  let validationStartedAt = Date.now();
  let validation = validateCandidate(candidate);
  trace?.recordValidation({ valid: validation.valid, errors: validation.valid ? [] : validation.errors, attempt: 1, latencyMs: Date.now() - validationStartedAt });
  let simulationStartedAt = Date.now();
  let simulation = validation.valid ? simulateGameDefinitionV2(validation.value) : null;
  trace?.recordSimulation({ attempt: 1, playable: Boolean(simulation?.playable), reachableEvents: simulation?.reachableEvents ?? [], errors: simulation && !simulation.playable ? simulation.errors : validation.valid ? [] : ["Simulation skipped because schema validation failed."], latencyMs: Date.now() - simulationStartedAt });
  const firstSimulationErrors = simulation && !simulation.playable ? simulation.errors : [];
  if (!validation.valid || !simulation?.playable) {
    repairCount = 1;
    const errors = validation.valid ? firstSimulationErrors : validation.errors;
    messages.push({ role: "user", content: `The assembled definition failed final validation: ${errors.join(" ")} Return a corrected complete GameDefinitionV2 JSON only. Reuse the successful tool results; do not call tools again.` });
    trace?.recordOrchestration({ turn: 9, decision: "repair_invalid_candidate", completedTools: [...completed], missingTools: [] });
    const repair = await askAnthropic(system, messages, trace, null, 11, "repair");
    lastUsage = repair.usage ?? lastUsage; lastModel = repair.model ?? lastModel;
    try { candidate = parseGameDefinitionV2(parseFinalText(repair.content)); }
    catch (error) { return { valid: false, errors: [error instanceof Error ? error.message : "The repaired output was invalid JSON."] }; }
    validationStartedAt = Date.now();
    validation = validateCandidate(candidate);
    trace?.recordValidation({ valid: validation.valid, errors: validation.valid ? [] : validation.errors, attempt: 2, latencyMs: Date.now() - validationStartedAt });
    simulationStartedAt = Date.now();
    simulation = validation.valid ? simulateGameDefinitionV2(validation.value) : null;
    trace?.recordSimulation({ attempt: 2, playable: Boolean(simulation?.playable), reachableEvents: simulation?.reachableEvents ?? [], errors: simulation && !simulation.playable ? simulation.errors : validation.valid ? [] : ["Simulation skipped because schema validation failed."], latencyMs: Date.now() - simulationStartedAt });
    trace?.recordOrchestration({ turn: 9, decision: validation.valid && Boolean(simulation?.playable) ? "accept_repaired_candidate" : "reject_repaired_candidate", completedTools: [...completed], missingTools: [] });
  }
  if (!validation.valid) return { valid: false, errors: validation.errors };
  if (!simulation?.playable) return { valid: false, errors: simulation?.errors ?? ["The game did not pass simulation."] };
  return { valid: true, definition: validation.value, repairCount, model: lastModel, usage: lastUsage, toolsUsed: ["requirements_tool", ...completed], requirementContract };
}
