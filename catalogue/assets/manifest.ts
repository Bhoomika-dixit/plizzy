export const assetCatalog = {
  emoji: { implementation: "emoji_asset", description: "A Unicode character rendered locally.", required: ["value"] },
  gradient: { implementation: "gradient_asset", description: "A CSS linear gradient rendered locally.", required: ["value"] },
  generated_image: { implementation: "generated_asset_with_fallback", description: "Image-generation request with mandatory playable local fallback.", required: ["prompt", "fallback"] },
  stored_image: { implementation: "stored_image_asset", description: "Stored image URL or storage reference with fallback.", required: ["value", "fallback"] },
} as const;

export type AssetKind = keyof typeof assetCatalog;
