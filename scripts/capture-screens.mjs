// Capture real app screenshots for the /how-it-works walkthrough.
//
// Runs against the local dev server in DEMO_MODE, switching the `demo_persona`
// cookie per shot so parent vs. hero views render, then writes optimized JPGs
// into public/marketing/screens/.
//
// Usage:
//   LD_LIBRARY_PATH=<chromium-libs>/usr/lib/x86_64-linux-gnu \
//   [ONLY=name,name] node scripts/capture-screens.mjs [baseUrl]
//
// ONLY limits the run to the named shots (e.g. just the Realm ones).
//
// Requires: a dev server running with DEMO_MODE=true (default http://localhost:3001),
// Playwright available (npx cache), and the bundled chrome-headless-shell.

import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_PATH ||
    "/home/kylee/.npm/_npx/e41f203b7505f1fb/node_modules/playwright",
);
const sharp = require("sharp");

const BASE = process.argv[2] || "http://localhost:3001";
const EXECUTABLE =
  process.env.CHROME_PATH ||
  "/home/kylee/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Keep this in sync with SCREENS_REV in src/components/marketing/screens.ts — the version is
// part of the path so re-captures always land on a fresh, un-cached URL.
const SCREENS_REV = "r3";
const OUT_DIR = path.join(__dirname, "..", "public", "marketing", "screens", SCREENS_REV);
fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORT = { width: 1280, height: 800 };
const SCALE = 2;
// Downscale the 2x capture to a sane retina width for the ~720px display slot.
const TARGET_WIDTH = 1600;
const JPEG_QUALITY = 80;

// persona: cookie value for demo_persona, or null for no cookie (public pages).
// action: optional post-load interaction before the screenshot.
// realm: the 3D Realm. It needs WebGL (software-rendered here), a "load" wait
//   (its sound Worker never lets "networkidle" settle) and time to build the
//   island. Never click a Realm canvas: it captures the mouse (pointer lock),
//   which has crashed WSL. Drive it with keys or page.evaluate only.
// keys: optional keyboard steps run after the page settles, in order:
//   { hold: "KeyW", ms: 700 } holds a key (or several: ["KeyW", "KeyA"]) for ms;
//   { hold: [...], until: "Some text" } holds them until that text shows (frame-rate
//   independent: software WebGL at 2x draws few frames, so timed walks fall short);
//   { press: "KeyE" } taps a key; { wait: ms } pauses.
const SHOTS = [
  // Parent journey
  { persona: null, url: "/signup", name: "parent-signup" },
  // The invite screen is a short centered card — capture a shorter viewport so
  // the card fills the frame instead of floating in dead space.
  { persona: "parent", url: "/invite/demo-invite-token", name: "parent-invite", viewport: { width: 1280, height: 560 } },
  { persona: "parent", url: "/settings", name: "parent-hearth" },
  { persona: "parent", url: "/scrolls", name: "parent-quest-giver" },
  { persona: "parent", url: "/scrolls", name: "parent-new-quest", action: "newQuest" },
  { persona: "parent", url: "/schedule", name: "parent-schedule" },
  { persona: "parent", url: "/tavern", name: "parent-tavern" },
  { persona: "parent", url: "/quests", name: "parent-quest-log", action: "completeAdventure" },
  { persona: "parent", url: "/loot", name: "parent-treasure-chest" },
  { persona: "parent", url: "/castle", name: "parent-castle" },
  { persona: "parent", url: "/leaderboard", name: "parent-hall-of-legends" },
  // Hero journey (Noah = demo-child-2 = higher level, more populated)
  { persona: null, url: "/login?mode=kid", name: "hero-login" },
  { persona: "lucas", url: "/tavern", name: "hero-customize", action: "customize" },
  { persona: "lucas", url: "/tavern", name: "hero-my-tavern" },
  { persona: "lucas", url: "/quests", name: "hero-my-quests" },
  { persona: "lucas", url: "/loot", name: "hero-my-trophies" },
  { persona: "lucas", url: "/castle", name: "hero-my-castle" },
  { persona: "lucas", url: "/leaderboard", name: "hero-ranks" },
  // The Realm, for the landing page's showcase (src/components/marketing/realm-showcase-data.ts).
  { persona: "lily", url: "/realm", name: "realm-village", realm: true },
  // Walk up to Old Bram at the Village Well and talk to him: his side quests.
  {
    persona: "lily",
    url: "/realm",
    name: "realm-learning",
    realm: true,
    keys: [{ hold: ["KeyW", "KeyA"], until: "Talk to Old Bram" }, { press: "KeyE" }, { wait: 2500 }],
  },
  // A grown-up visiting the child's Realm (spends none of the child's minutes).
  {
    persona: "parent",
    url: "/realm?child=demo-child-1",
    name: "realm-quest-giver",
    realm: true,
    keys: [{ hold: ["KeyW", "KeyD"], until: "Talk to Miller Tessa" }, { wait: 1500 }],
  },
];

const REALM_SETTLE_MS = 8000;
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(",").map((s) => s.trim())) : null;
const shots = ONLY ? SHOTS.filter((s) => ONLY.has(s.name)) : SHOTS;
if (ONLY && shots.length !== ONLY.size) {
  const known = new Set(SHOTS.map((s) => s.name));
  throw new Error(`ONLY names unknown shots: ${[...ONLY].filter((n) => !known.has(n)).join(", ")}`);
}

const HIDE_CSS = `
  /* hide the floating demo persona switcher */
  .fixed.bottom-4.right-4.z-50 { display: none !important; }
  /* freeze animations/transitions for deterministic captures */
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    scroll-behavior: auto !important;
  }
`;

const host = new URL(BASE).hostname;

async function run() {
  const browser = await chromium.launch({
    executablePath: EXECUTABLE,
    // Software WebGL so the 3D Realm renders in headless Chromium.
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const results = [];
  try {
    for (const shot of shots) {
      const context = await browser.newContext({
        viewport: shot.viewport || VIEWPORT,
        deviceScaleFactor: SCALE,
      });
      if (shot.persona) {
        await context.addCookies([
          {
            name: "demo_persona",
            value: shot.persona,
            domain: host,
            path: "/",
            httpOnly: false,
            sameSite: "Lax",
          },
        ]);
      }
      const page = await context.newPage();
      const target = BASE + shot.url;
      if (shot.realm) {
        await page.goto(target, { waitUntil: "load", timeout: 180000 });
      } else {
        try {
          await page.goto(target, { waitUntil: "networkidle", timeout: 45000 });
        } catch {
          // networkidle can hang on pages with long-poll; fall back to load.
          await page.goto(target, { waitUntil: "load", timeout: 45000 }).catch(() => {});
        }
      }
      await page.addStyleTag({ content: HIDE_CSS });
      // Strip dev-only overlays (Next.js dev indicator lives in a portal element).
      await page.evaluate(() => {
        document.querySelectorAll("nextjs-portal").forEach((el) => el.remove());
      });
      await page.waitForTimeout(shot.realm ? REALM_SETTLE_MS : 1200);

      // Optional interaction (e.g. open the hero customizer modal).
      if (shot.action === "customize") {
        await page.click("button.hud-hero-showcase").catch(() => {});
        await page.waitForSelector("dialog[open]", { timeout: 8000 }).catch(() => {});
        await page.waitForTimeout(800);
      }
      if (shot.action === "newQuest") {
        await page.click('button:has-text("New Quest")').catch(() => {});
        await page.waitForSelector("dialog[open]", { timeout: 8000 }).catch(() => {});
        // Turn on the repeat toggle so the frequency options are visible in the shot.
        await page.click('button[aria-label="Schedule this quest"]').catch(() => {});
        await page.waitForTimeout(500);
      }
      for (const step of shot.keys ?? []) {
        if (step.hold) {
          const held = [step.hold].flat();
          for (const k of held) await page.keyboard.down(k);
          if (step.until) {
            await page.getByText(step.until).first().waitFor({ timeout: 30000 });
          } else {
            await page.waitForTimeout(step.ms);
          }
          for (const k of held) await page.keyboard.up(k);
        } else if (step.press) {
          await page.keyboard.press(step.press);
        } else if (step.wait) {
          await page.waitForTimeout(step.wait);
        }
      }
      if (shot.action === "completeAdventure") {
        await page.click('button:has-text("Complete Adventure")').catch(() => {});
        await page.waitForTimeout(800);
      }

      const landedPath = new URL(page.url()).pathname;
      const png = await page.screenshot({ type: "png" }); // viewport clip

      const outPath = path.join(OUT_DIR, `${shot.name}.jpg`);
      await sharp(png)
        .resize({ width: TARGET_WIDTH, withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
        .toFile(outPath);

      const kb = Math.round(fs.statSync(outPath).size / 1024);
      results.push({ name: shot.name, requested: shot.url, landedPath, kb });
      console.log(
        `✓ ${shot.name.padEnd(24)} ${shot.url.padEnd(18)} -> ${landedPath.padEnd(14)} ${kb}KB`,
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log("\nSummary:");
  for (const r of results) {
    const flag = r.landedPath !== new URL(BASE + r.requested).pathname ? "  ⚠ redirected" : "";
    console.log(`  ${r.name}: ${r.kb}KB${flag}`);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
