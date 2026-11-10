/**
 * Runs before every Cloudflare build (see package.json `preview` / `upload` / `deploy`).
 *
 * `opennextjs-cloudflare build` compiles the project's .env files into the Worker bundle and
 * uses them as fallbacks for any variable the Worker itself doesn't define. Building from a
 * laptop would therefore ship .env.local to production — and .env.local is where DEMO_MODE=true
 * lives, which bypasses auth entirely. This refuses that build, and names every other key that
 * would be baked in so a stray dev value can't go out unnoticed.
 *
 * Mirrors the file order in @opennextjs/cloudflare's extract-project-env-vars (production mode).
 * `.env.prod` is not one of them, so it is never read here or by the adapter.
 */
import { existsSync, readFileSync } from "node:fs";

const FILES = [".env", ".env.production", ".env.local", ".env.production.local"];

const baked = {};
for (const file of FILES) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) baked[m[1]] = { file, value: m[2].replace(/^["']|["']$/g, "") };
  }
}

if (baked.DEMO_MODE?.value === "true") {
  console.error(
    `\n✖ DEMO_MODE=true is set in ${baked.DEMO_MODE.file}, and the Cloudflare build would bake it into the\n` +
      `  Worker — demo mode bypasses sign-in. Comment it out (or deploy from CI, where .env files don't exist).\n`
  );
  process.exit(1);
}

const keys = Object.keys(baked);
if (keys.length > 0) {
  console.warn(
    `\n⚠ These keys from local .env files will be baked into the Worker as fallbacks for any value\n` +
      `  not set in the Cloudflare dashboard: ${keys.join(", ")}\n` +
      `  Make sure each one is also set on the Worker, or that the local value is safe for production.\n`
  );
}

// `npm run deploy` migrates before deploying. The migrator falls back to the local file database,
// so without an explicit TURSO_DATABASE_URL a laptop deploy would migrate the wrong database and
// ship code to an unmigrated production one. Require the real one, from the shell.
if (process.argv.includes("--deploy")) {
  const url = process.env.TURSO_DATABASE_URL ?? "";
  if (!url || url.startsWith("file:")) {
    console.error(
      "\n✖ Set production's Turso credentials before deploying, e.g.\n" +
        "  TURSO_DATABASE_URL='libsql://…' TURSO_AUTH_TOKEN='…' npm run deploy\n"
    );
    process.exit(1);
  }
}
