import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // "standalone" keeps the Docker image small. `next start` warns about it locally;
  // set NEXT_NO_STANDALONE=1 for local runs (e2e does) to silence that.
  output: process.env.NEXT_NO_STANDALONE ? undefined : "standalone",
  reactStrictMode: true,
  transpilePackages: ["@arayeshgar/core", "@arayeshgar/db"],
  serverExternalPackages: ["@libsql/client", "libsql", "pino"],
  images: { remotePatterns: [] },
};

export default nextConfig;
