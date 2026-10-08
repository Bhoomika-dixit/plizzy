import { parseModelJson } from "../game-definition";
export type ModelReply = { text: string; model: string; provider: "anthropic" | "openrouter"; usage: Record<string, unknown> };
export async function callModel(system: string, user: string, signal?: AbortSignal): Promise<ModelReply> {
  const provider = process.env.PLIZZY_MODEL_PROVIDER === "openrouter" ? "openrouter" : "anthropic";
  const model = provider === "anthropic" ? (process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5") : (process.env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.5");
  const key = provider === "anthropic" ? process.env.ANTHROPIC_API_KEY : process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error(`Missing ${provider} API key.`);
  const workspaceId = provider === "anthropic" ? process.env.ANTHROPIC_WORKSPACE_ID?.trim() : undefined;
  const url = provider === "anthropic" ? "https://api.anthropic.com/v1/messages" : "https://openrouter.ai/api/v1/chat/completions";
  const payload = provider === "anthropic"
    ? { model, max_tokens: 3500, system, messages: [{ role: "user", content: user }] }
    : { model, max_tokens: 3500, messages: [{ role: "system", content: system }, { role: "user", content: user }] };
  const response = await fetch(url, { method: "POST", signal, headers: provider === "anthropic"
    ? { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json", ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}) }
    : { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`Model request failed (${response.status}): ${response.status === 429 ? "rate limited" : "provider error"}`);
  const data = await response.json() as { content?: {type:string;text?:string}[]; choices?: {message?:{content?:string}}[]; usage?: Record<string,unknown> };
  const text = provider === "anthropic" ? data.content?.find(x=>x.type==="text")?.text : data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Model returned empty output.");
  return { text, model, provider, usage: data.usage ?? {} };
}
export function parseObject(text: string): Record<string, unknown> {
  const value = parseModelJson(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected JSON object.");
  return value as Record<string, unknown>;
}
