import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable TypeScript errors during build
  typescript: {
    ignoreBuildErrors: true,
  },
  // Disable ESLint checks during build
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Keep existing image config if you still need unsplash
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "source.unsplash.com",
      },
    ],
  },
  /* other config options here */
};

export default nextConfig;
