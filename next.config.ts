import type { NextConfig } from "next";

/**
 * Cadence Studio — Next.js configuration.
 *
 * Everything here is free-tier friendly:
 *  - No paid image optimization providers, no analytics, no telemetry services.
 *  - `allowedDevOrigins` lets the app run inside hosted dev previews
 *    (Arena / E2B sandboxes, Cloud IDEs, tunneled port previews).
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Allow cross-origin dev asset requests from sandbox preview hosts.
  allowedDevOrigins: [
    "*.e2b.app",
    "*.e2b.dev",
    "*.arena.ai",
    "*.vercel.app",
    "*.ngrok-free.app",
    "*.trycloudflare.com",
    "localhost",
  ],

  images: {
    // Only ever used for YouTube thumbnails; plain <img> is used for
    // transcript-friendly surfaces so the app never needs a paid optimizer.
    remotePatterns: [
      { protocol: "https", hostname: "i.ytimg.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "yt3.ggpht.com" },
    ],
  },

  // The scraper runs on the server only; keep it out of the client bundle.
  serverExternalPackages: ["youtube-transcript"],
};

export default nextConfig;
