/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Word resumes (with embedded fonts) are uploaded through a server action.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
