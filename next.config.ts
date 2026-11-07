import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Inlined at build time so /status can show when this release was built (OPS-1).
  env: {
    BUILD_TIME: new Date().toISOString(),
  },
};

export default nextConfig;
