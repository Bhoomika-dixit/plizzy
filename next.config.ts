import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Separate browser storage for the second local multiplayer test account.
  allowedDevOrigins: ["127.0.0.1"],
  outputFileTracingIncludes: {
    "/api/generate-game": ["./agent-harness/prompt.md"],
  },
  env: {
    PUBLIC_SUPABASE_URL: process.env.PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  },
};

export default nextConfig;
