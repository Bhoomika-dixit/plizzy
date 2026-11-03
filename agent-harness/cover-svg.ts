import type { GameDefinitionV2 } from "./game-definition-v2";

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] ?? character);
}

export function coverSvg(title: string, definition: GameDefinitionV2) {
  // Truncate before escaping so the title never ends with a partial XML entity
  // or half of a Unicode character. Treat generated content as untrusted text.
  const safeTitle = escapeXml(Array.from(title).slice(0, 28).join(""));
  const entities = definition.entities.slice(0, 4).map((entity, index) => `<text x="${90 + index * 105}" y="205" font-size="64">${escapeXml(entity.content.kind === "asset" ? "✦" : entity.content.value)}</text>`).join("");
  const background = escapeXml(definition.visuals.backgroundColor);
  const accent = escapeXml(definition.visuals.accentColor);
  const text = escapeXml(definition.visuals.textColor);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${background}"/><stop offset="1" stop-color="${accent}"/></linearGradient></defs><rect width="720" height="420" rx="42" fill="url(#bg)"/><circle cx="635" cy="72" r="120" fill="#fff" opacity=".18"/><text x="56" y="84" fill="${text}" font-family="Arial, sans-serif" font-size="23" font-weight="700">PLIZZY ORIGINAL</text><text x="56" y="145" fill="${text}" font-family="Arial, sans-serif" font-size="44" font-weight="800">${safeTitle}</text>${entities}</svg>`;
}
