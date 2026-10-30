import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  distDir: process.env.WATER_PREVIEW === "1" ? ".next/water-preview" : ".next",
  async redirects() {
    return [{ source: "/water", destination: "/", permanent: true }];
  },
  turbopack: {
    root: here,
  },
  outputFileTracingRoot: here,
};

export default nextConfig;
