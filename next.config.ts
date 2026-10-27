import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // A second dev server in this checkout (an agent's, for screenshots) takes its own build
  // directory, so it never holds the lock the owner's `npm run dev` needs.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // pg loads pg-cloudflare's Workers socket only under the `workerd` export condition, so Next's
  // tracer (which follows Node's resolution) never sees that file and the Cloudflare bundle
  // can't resolve it. Ship the whole package.
  outputFileTracingIncludes: {
    "/**/*": ["./node_modules/pg-cloudflare/**/*"],
  },
  // "Deeds" became "Side Quests" (slice 8); old links and bookmarks keep working.
  //
  // Canonical host is www.kingdomsandcrowns.com (matches BETTER_AUTH_URL). Vercel handled the
  // apex -> www redirect at the domain level; on Cloudflare both hostnames route to the Worker,
  // so it's done here with an explicit host match — apex only, so it can never loop against www.
  async redirects() {
    return [
      { source: "/deeds", destination: "/side-quests", permanent: true },
      {
        source: "/:path*",
        has: [{ type: "host", value: "kingdomsandcrowns.com" }],
        destination: "https://www.kingdomsandcrowns.com/:path*",
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
