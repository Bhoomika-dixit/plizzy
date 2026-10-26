import "server-only";

import { generateImage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GameAssetV2, GameDefinitionV2 } from "./game-definition-v2";
import type { GameGenerationTrace } from "./observability";

const GENERATED_ASSET_BUCKET = "generated-game-assets";
const DEFAULT_IMAGE_MODEL = "openai/gpt-image-2";
const MAX_GENERATED_ASSETS = 8;

type GeneratedAssetRecord = {
  assetId: string;
  bucket: string;
  path: string;
  storageReference: string;
  mediaType: string;
  model: string;
};

function extensionFor(mediaType: string) {
  if (mediaType === "image/jpeg") return "jpg";
  if (mediaType === "image/webp") return "webp";
  return "png";
}

function generationPrompt(asset: GameAssetV2) {
  return [
    asset.prompt?.trim(),
    "Create a polished game-ready visual asset that preserves the exact requested subject, identity, and colors.",
    asset.role === "character"
      ? "Show one complete character or vehicle in side view, centered, with no cropping, no words, no labels, and a transparent background."
      : "Do not add words, labels, interface controls, borders, or watermarks.",
  ].filter(Boolean).join(" ");
}

async function ensurePrivateBucket(admin: SupabaseClient) {
  const { data: existing, error: lookupError } = await admin.storage.getBucket(GENERATED_ASSET_BUCKET);
  if (lookupError && !/not found/i.test(lookupError.message)) throw lookupError;
  if (existing) {
    if (existing.public) throw new Error(`${GENERATED_ASSET_BUCKET} exists but is public. Apply migration 0007_generated_game_assets.sql before generating games.`);
    return;
  }
  const { error } = await admin.storage.createBucket(GENERATED_ASSET_BUCKET, {
    public: false,
    fileSizeLimit: "10MB",
    allowedMimeTypes: ["image/png", "image/jpeg", "image/webp"],
  });
  if (error && !/already exists|duplicate/i.test(error.message)) throw error;
}

export async function materializeGeneratedAssets(input: {
  admin: SupabaseClient;
  gameId: string;
  versionId: string;
  definition: GameDefinitionV2;
  trace?: GameGenerationTrace;
}) {
  const requested = input.definition.assets.filter((asset) => asset.kind === "generated_image");
  if (!requested.length) return { definition: input.definition, records: [] as GeneratedAssetRecord[] };
  if (requested.length > MAX_GENERATED_ASSETS) throw new Error(`A game can generate at most ${MAX_GENERATED_ASSETS} image assets.`);
  if (!process.env.AI_GATEWAY_API_KEY?.trim() && !process.env.VERCEL_OIDC_TOKEN?.trim()) {
    throw new Error("Generated image assets require AI_GATEWAY_API_KEY locally or VERCEL_OIDC_TOKEN on Vercel.");
  }

  await ensurePrivateBucket(input.admin);
  const model = process.env.AI_GATEWAY_IMAGE_MODEL?.trim() || DEFAULT_IMAGE_MODEL;
  const materialized = new Map<string, GeneratedAssetRecord>();

  for (const asset of requested) {
    const prompt = generationPrompt(asset);
    const startedAt = Date.now();
    try {
      const result = await generateImage({ model, prompt, n: 1, maxRetries: 2 });
      const image = result.image;
      if (!image?.uint8Array?.byteLength) throw new Error("The image model returned no image bytes.");
      const mediaType = image.mediaType || "image/png";
      if (!["image/png", "image/jpeg", "image/webp"].includes(mediaType)) throw new Error(`Unsupported generated image type: ${mediaType}`);
      const path = `games/${input.gameId}/versions/${input.versionId}/${asset.id}.${extensionFor(mediaType)}`;
      const { error: uploadError } = await input.admin.storage.from(GENERATED_ASSET_BUCKET).upload(path, Buffer.from(image.uint8Array), {
        contentType: mediaType,
        cacheControl: "31536000",
        upsert: true,
      });
      if (uploadError) throw uploadError;
      const record = { assetId: asset.id, bucket: GENERATED_ASSET_BUCKET, path, storageReference: `storage://${GENERATED_ASSET_BUCKET}/${path}`, mediaType, model };
      materialized.set(asset.id, record);
      input.trace?.recordImageGeneration({ assetId: asset.id, prompt, model, usage: result.usage, latencyMs: Date.now() - startedAt, successful: true, output: { mediaType, bucket: GENERATED_ASSET_BUCKET, path } });
    } catch (error) {
      input.trace?.recordImageGeneration({ assetId: asset.id, prompt, model, usage: {}, latencyMs: Date.now() - startedAt, successful: false, error: error instanceof Error ? error.message : "Image generation failed." });
      throw new Error(`Could not generate asset "${asset.id}": ${error instanceof Error ? error.message : "Image generation failed."}`);
    }
  }

  return {
    definition: {
      ...input.definition,
      assets: input.definition.assets.map((asset) => {
        const generated = materialized.get(asset.id);
        return generated ? { ...asset, value: generated.storageReference } : asset;
      }),
    },
    records: [...materialized.values()],
  };
}

export async function saveGeneratedAssetRecords(admin: SupabaseClient, versionId: string, definition: GameDefinitionV2, records: GeneratedAssetRecord[]) {
  if (!records.length) return;
  const assetsById = new Map(definition.assets.map((asset) => [asset.id, asset]));
  const { error } = await admin.from("game_assets").insert(records.map((record) => {
    const asset = assetsById.get(record.assetId);
    return {
      game_version_id: versionId,
      storage_bucket: record.bucket,
      storage_path: record.path,
      asset_type: asset?.role === "background" ? "background" : asset?.role === "character" ? "illustration" : "other",
      alt_text: asset?.prompt ?? asset?.fallback ?? record.assetId,
      metadata: { generator: "vercel-ai-gateway", model: record.model, asset_id: record.assetId, media_type: record.mediaType },
    };
  }));
  if (error) throw error;
}
