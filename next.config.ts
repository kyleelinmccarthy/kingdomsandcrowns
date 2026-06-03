import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Canonicalize on the apex domain (matches BETTER_AUTH_URL). Redirect all
  // www traffic to the bare domain so auth origins, cookies, and OAuth
  // callbacks all live on a single host.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.kingdomsandcrowns.com" }],
        destination: "https://kingdomsandcrowns.com/:path*",
        permanent: true,
      },
    ];
  },
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
