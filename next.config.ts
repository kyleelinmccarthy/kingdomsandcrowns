import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
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
