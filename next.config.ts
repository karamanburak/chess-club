import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second instance (tests, another port) build into its own folder.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  // Stop `next dev` from appending its own block to CLAUDE.md.
  agentRules: false,
};

export default nextConfig;
