import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";

const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();

if (publicKey && secretKey) {
  const sdk = new NodeSDK({ spanProcessors: [new LangfuseSpanProcessor({ publicKey, secretKey, baseUrl: process.env.LANGFUSE_BASE_URL?.trim() || "https://cloud.langfuse.com", environment: process.env.LANGFUSE_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development", exportMode: "immediate" })] });
  sdk.start();
}
