import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // Disable strict mode — it double-mounts and aborts in-flight WebSockets/fetches
};

export default nextConfig;
