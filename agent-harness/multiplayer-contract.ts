export type MultiplayerContract = {
  version: 1;
  minPlayers: number;
  maxPlayers: number;
  objective: "cooperative" | "competitive";
  board: "shared" | "individual";
  turns: "simultaneous" | "round_robin";
  symbols: string[];
};

export function multiplayerContractErrors(value: unknown): string[] {
  if (!value || typeof value !== "object") return ["A multiplayer contract is required."];
  const contract = value as MultiplayerContract;
  const errors: string[] = [];
  if (contract.version !== 1) errors.push("multiplayer.version must be 1.");
  if (!Number.isInteger(contract.minPlayers) || contract.minPlayers < 2 || !Number.isInteger(contract.maxPlayers) || contract.maxPlayers < contract.minPlayers || contract.maxPlayers > 32) errors.push("Multiplayer player bounds must be integers between 2 and 32.");
  if (!["cooperative", "competitive"].includes(contract.objective)) errors.push("Choose a cooperative or competitive objective.");
  if (!["shared", "individual"].includes(contract.board)) errors.push("Choose shared or individual boards.");
  if (!["simultaneous", "round_robin"].includes(contract.turns)) errors.push("Choose simultaneous or round_robin turns.");
  if (contract.board === "individual" && contract.turns !== "simultaneous") errors.push("Individual boards use simultaneous play.");
  if (!Array.isArray(contract.symbols) || contract.symbols.length < contract.maxPlayers || new Set(contract.symbols).size !== contract.symbols.length || !contract.symbols.every(symbol => typeof symbol === "string" && symbol.length > 0 && symbol.length <= 20)) errors.push("Supply a unique short symbol for each player slot.");
  return errors;
}

export const multiplayerContractSchema = {
  type: "object", additionalProperties: false,
  properties: {
    version: { type: "integer", const: 1 }, minPlayers: { type: "integer", minimum: 2, maximum: 32 }, maxPlayers: { type: "integer", minimum: 2, maximum: 32 },
    objective: { enum: ["cooperative", "competitive"] }, board: { enum: ["shared", "individual"] }, turns: { enum: ["simultaneous", "round_robin"] },
    symbols: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 32, uniqueItems: true },
  }, required: ["version", "minPlayers", "maxPlayers", "objective", "board", "turns", "symbols"],
};
