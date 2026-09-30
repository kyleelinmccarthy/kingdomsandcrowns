// .superpowers/tools/look.mjs — one headless Chromium visit to the agent dev server (port 3177).
//
//   PW=$(ls -d ~/.npm/_npx/*/node_modules/playwright | head -1) \
//   LD_LIBRARY_PATH=$PWD/.superpowers/tools/chromelibs/usr/lib/x86_64-linux-gnu \
//   URL='/realm?child=demo-child-1' OUT=.superpowers/shots/x.png node .superpowers/tools/look.mjs
//
// env:
//   URL      path on http://localhost:3177 (default "/tavern")
//   PERSONA  demo_persona cookie: unset = the demo parent; "lily" = Emma (demo-child-1)
//   W, H     viewport (default 1280 x 800)
//   WAIT     ms after load before the steps (default 6000: the Realm builds its island)
//   EXE      optional Chromium executablePath, if the cached revision does not match PW
//   STEPS    JSON array run in order:
//              {"click": "css"} {"clickAt": [x, y]} {"key": "KeyW", "ms": 800} {"press": "Escape"}
//              {"rdrag": [dx, dy]} {"wait": 500} {"eval": "js expression"} {"shot": "path.png"}
//   OUT      final screenshot path (optional)
import { existsSync } from "node:fs";

const pw = process.env.PW;
if (!pw || !existsSync(`${pw}/index.mjs`)) throw new Error("Set PW to a playwright package dir (see header).");
const { chromium } = await import(`${pw}/index.mjs`);
const base = "http://localhost:3177";
const browser = await chromium.launch({
  ...(process.env.EXE ? { executablePath: process.env.EXE } : {}),
  args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const context = await browser.newContext({ viewport: { width: Number(process.env.W ?? 1280), height: Number(process.env.H ?? 800) } });
  if (process.env.PERSONA) await context.addCookies([{ name: "demo_persona", value: process.env.PERSONA, url: base }]);
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text()); });
  page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
  // "load", not "networkidle": /realm mounts a module Worker (the sound synth) that Turbopack
  // serves through a blob: URL, and Chromium never reports that request finished to Playwright,
  // so "networkidle" hangs to its 180s timeout on every /realm visit (confirmed: one permanently
  // pending blob: request, on both chrome-headless-shell and full chromium). /tavern has no such
  // worker and was unaffected either way. WAIT below still covers the island settling after load.
  await page.goto(base + (process.env.URL ?? "/tavern"), { waitUntil: "load", timeout: 180_000 });
  await page.waitForTimeout(Number(process.env.WAIT ?? 6000));
  for (const s of JSON.parse(process.env.STEPS ?? "[]")) {
    if (s.click) await page.click(s.click);
    else if (s.clickAt) await page.mouse.click(s.clickAt[0], s.clickAt[1]);
    else if (s.key) { await page.keyboard.down(s.key); await page.waitForTimeout(s.ms ?? 500); await page.keyboard.up(s.key); }
    else if (s.press) await page.keyboard.press(s.press);
    else if (s.rdrag) {
      const vp = page.viewportSize();
      const x = vp.width / 2, y = vp.height / 2;
      await page.mouse.move(x, y);
      await page.mouse.down({ button: "right" });
      await page.mouse.move(x + s.rdrag[0], y + s.rdrag[1], { steps: 12 });
      await page.mouse.up({ button: "right" });
    }
    else if (s.wait) await page.waitForTimeout(s.wait);
    else if (s.eval) console.log("EVAL", JSON.stringify(await page.evaluate(s.eval)));
    else if (s.shot) await page.screenshot({ path: s.shot });
  }
  if (process.env.OUT) await page.screenshot({ path: process.env.OUT });
} finally {
  await browser.close();
}
