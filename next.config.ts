import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is session-driven on every screen. The scaffold's cache-component
  // mode fights per-request authentication, so pages stay dynamic.
  cacheComponents: false,
  experimental: {
    proxyClientMaxBodySize: "25mb",
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
