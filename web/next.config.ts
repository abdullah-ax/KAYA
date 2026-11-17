import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mockup only: lint runs separately, not as a build gate.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
