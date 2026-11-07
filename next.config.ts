import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Inlined at build time so /status can show when this release was built (OPS-1).
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
  // The AI prompts are read from disk at run time (src/server/ai/prompts.ts). Any API route can run the job runner
  // in after(), so every API function bundle ships the prompt files.
  outputFileTracingIncludes: {
    '/api/**/*': ['./prompts/**/*.md'],
  },
};

export default nextConfig;
