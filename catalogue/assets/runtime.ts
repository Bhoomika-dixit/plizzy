import { GameAssetV2 } from "@/agent-harness/game-definition-v2";

export type AssetVisual = { kind: "image" | "text" | "color"; value: string };

const imageSource = /^(?:data:image\/|https?:\/\/|\/)/i;
const colorSource = /^(?:#[0-9a-f]{3,8}|(?:rgb|hsl)a?\(|(?:linear|radial)-gradient\()/i;

function classify(value: string): AssetVisual {
  if (imageSource.test(value)) return { kind: "image", value };
  if (colorSource.test(value)) return { kind: "color", value };
  return { kind: "text", value };
}

export function resolveAssetVisual(assets: GameAssetV2[], assetId: string | undefined, fallback = "", label?: string): AssetVisual {
  const asset = assetId ? assets.find((item) => item.id === assetId) : undefined;
  if (!asset) return classify(fallback);
  if (asset.kind === "generated_image") return classify(asset.value || asset.fallback || fallback || label || "");
  return classify(asset.value || asset.fallback || fallback);
}

export function resolveBackground(assets: GameAssetV2[], assetId: string | undefined, fallback: string) {
  const visual = resolveAssetVisual(assets, assetId, fallback);
  return visual.kind === "image" ? `center / cover no-repeat url("${visual.value}")` : visual.value;
}
