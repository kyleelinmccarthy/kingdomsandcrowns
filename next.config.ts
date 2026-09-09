import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // "Deeds" became "Side Quests" (slice 8); old links and bookmarks keep working.
  async redirects() {
    return [{ source: "/deeds", destination: "/side-quests", permanent: true }];
  },
  // Canonical host is www.kingdomsandcrowns.com (matches BETTER_AUTH_URL).
  // Vercel handles the apex -> www redirect at the domain level, so no
  // www<->apex redirect lives here (one would fight Vercel and loop).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
