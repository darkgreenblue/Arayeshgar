import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  transpilePackages: ["@arayeshgar/core", "@arayeshgar/db"],
  serverExternalPackages: ["postgres", "pino"],
  images: { remotePatterns: [] },
};

export default nextConfig;
