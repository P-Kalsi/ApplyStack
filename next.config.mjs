import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin the workspace root to this folder so a stray lockfile in a parent
  // directory doesn't make Next.js guess the wrong root.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  experimental: {
    // Word resumes (with embedded fonts) are uploaded through a server action.
    serverActions: { bodySizeLimit: "10mb" },
    // Keep pages you've visited (e.g. Discover page 1 -> 2 -> back) in the
    // browser's router cache for 3 minutes, so going back doesn't refetch.
    staleTimes: { dynamic: 180, static: 300 },
  },
};

export default nextConfig;
