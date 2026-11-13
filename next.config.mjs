/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Word resumes (with embedded fonts) are uploaded through a server action.
    serverActions: { bodySizeLimit: "10mb" },
    // Keep pages you've visited (e.g. Discover page 1 -> 2 -> back) in the
    // browser's router cache for 3 minutes, so going back doesn't refetch.
    staleTimes: { dynamic: 180, static: 300 },
  },
};

export default nextConfig;
