import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Linked worktrees under .claude/ carry their own .next output; never lint them.
    ".claude/**",
    // Agent dev servers' build dirs (NEXT_DIST_DIR=.next-agent) and Cloudflare build output.
    ".next-*/**",
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
