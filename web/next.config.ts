import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to web/ (the repo also has a root package-lock.json).
  turbopack: { root: import.meta.dirname },
  // better-sqlite3 is a native module — keep it external to the server bundle.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
