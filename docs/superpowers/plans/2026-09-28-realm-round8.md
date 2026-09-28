# Realm Round 8 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every remaining item of the owner's 2026-09-28 list: nav drop-downs, themed cursors and a reticle, NPC faces and hands, WASD/strafe/mouse-look controls, a camera that never zooms itself (see-through instead), pause and auto-pause, an in-game wardrobe, and day/night by the family's timezone.

**Architecture:** Three half-built lanes sit uncommitted in worktrees. They are brought onto `realm-foundations` by cherry-picking a WIP commit with `-n`, then finished and wired. New behaviour goes into pure, `three`-free modules under `src/lib/realm3d/`, tested first. The scene gets small new components in new files (`mouse-look.tsx`, `chase-camera.tsx`, `see-through-group.tsx`, `day-light.tsx`, `wardrobe.tsx`, `look-reticle.tsx`), mounted with a line or two. Old mechanisms are deleted, not patched: the camera boom, the occluder lists and the per-canvas drag handlers.

**Tech Stack:** Next.js 16, React 19, TypeScript, @react-three/fiber 9, three 0.185, Tailwind 4, Vitest 4 + Testing Library (jsdom), Drizzle + libSQL (local `local.db`), Playwright from the npx cache for browser passes.

**Spec:** `docs/superpowers/specs/2026-09-28-realm-round8-design.md` (commit `2fde0ca`). Read it with this plan.

## Global Constraints

- Branch `realm-foundations`, in the main checkout `/home/kylee/projects/kingdoms-and-crowns`. Run `git branch --show-current` before every commit. Several sessions share this checkout.
- Put each git command on its own line; never chain git with `&&`. Never use `git stash`. `git add` your own files by name, after `git status`.
- Every commit message ends with a second `-m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"`.
- Never stage or edit another piece of work's files: `src/app/(app)/tavern/page.tsx`, `src/components/avatar.tsx`, `src/components/avatar-figures.test.tsx`, `src/app/(app)/hud-panel-wrappers.test.ts`. `tsconfig.json` and `.vscode/settings.json` stay uncommitted.
- Before any scripted edit of a shared file, `cp` it to the scratchpad. Read into a variable before opening for write. Run `git diff --stat` after.
- **Resource limits (binding — heavy load crashed WSL):** one agent at a time. Run `npx vitest run --maxWorkers=2 <touched files>` while working, and the full `npx vitest run --maxWorkers=2` once before each commit. Run `npx tsc --noEmit` and `npx eslint src` before each commit; the baseline is exactly one lint error, at `src/components/quest-template-list.tsx:70`. Never run `next build`. Run one dev server and one headless Chromium at most, stopping each when done. Never `pkill -f "next dev"`. Never symlink `node_modules` into a worktree.
- **Dev server:** `nohup env NEXT_DIST_DIR=.next-agent PORT=3177 npm run dev > .superpowers/shots/dev.log 2>&1 &` and note the PID. Stop it with `kill <PID>`. Never start a server without `NEXT_DIST_DIR`.
- **Three.js:** nothing under Vitest imports `three`. Runtime `three` only in scene components. `World`'s props stay referentially stable. No per-frame allocation. No `Math.random()` or `Date.now()` in simulation.
- **TDD, red → green → refactor.** For each task, the report names the test written first and quotes the failure line seen before implementing.
- **DRY / KISS / SOLID:** grep for an existing helper before writing one. Delete what a new rule makes unnecessary, and name what was deleted. New code goes in new files; never reorganise `spike-scene.tsx`, `realm-game.tsx`, `frame-hud.tsx`, `hud.tsx` or `hud-bus.ts`.
- **Database:** if a write is refused by the permission classifier, stop and report the exact SQL.
- Child-facing copy is exactly as written in this plan.

## Review Focus

1. **A browser without Pointer Lock, or one that refuses it:** WASD and right-drag still work, and nothing throws. The test goes in Task 5.
2. **A family timezone that is not a real zone** (a typo, `""`): the island uses the browser's clock and does not crash. The test goes in Task 13.
3. **A wardrobe save the server refuses** (a locked item, the network): the customizer shows the error, the hero keeps the old look, and the game stays paused. The test goes in Task 12.
4. **The tab hidden or the window left while indoors:** the game pauses (the clock runs indoors), and Resume goes back indoors. The test goes in Task 11.
5. **A page under a group's destination** (`/quests/abc`): the Quests medallion is lit, and `/questsmith` does not light it. The test goes in Task 2.

---

## Deviations from the spec (decided while planning; tell the owner in the final report)

- **No spell-aiming crosshair.** The spec's "aiming a spell keeps its crosshair" referred to `.realm-root--aiming`, which belongs to the unrendered 2D Realm; the 3D game has no aiming cursor. Only the arrow, the gauntlet and the reticle are made.
- **No `initialTab` on the customizer** (YAGNI). The wardrobe opens on the first tab, and the Pet tab is one click away.
- **The in-game wardrobe leaves out the Mount tab.** The riding bus is built once per visit with the opening mount (`riding-hud.tsx`), so a mount changed mid-visit would not show until the next visit. Mounts stay a Tavern choice.

---

### Task 1: Browser tooling and a dev draw-call counter

**Files:**
- Create: `.superpowers/tools/setup-chromium.sh`, `.superpowers/tools/look.mjs`, `.superpowers/tools/db.mjs` (untracked tooling, not committed)
- Create: `src/components/realm3d/dev-draws.tsx`
- Modify: `src/components/realm3d/spike-scene.tsx` (one import, one mounted line inside `World`)

**Interfaces:**
- Produces: `window.__realmDraws` (number, development only): draw calls of the island's previous frame. Every later browser pass uses `look.mjs` and `db.mjs` as written here.

- [ ] **Step 1: Write the Chromium library fetcher**

```bash
# .superpowers/tools/setup-chromium.sh
#!/usr/bin/env bash
# Chromium's four missing libraries, fetched without sudo (memory: reference_local_screenshot_setup).
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p debs chromelibs
cd debs
apt-get download libnspr4 libnss3 libasound2t64
for d in *.deb; do dpkg-deb -x "$d" ../chromelibs; done
echo "LD_LIBRARY_PATH=$(cd ../chromelibs && pwd)/usr/lib/x86_64-linux-gnu"
```

Run: `bash .superpowers/tools/setup-chromium.sh`
Expected: the last line prints an `LD_LIBRARY_PATH=` value.

- [ ] **Step 2: Write the browser script**

```js
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
  await page.goto(base + (process.env.URL ?? "/tavern"), { waitUntil: "networkidle", timeout: 180_000 });
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
```

- [ ] **Step 3: Write the one-statement database script**

```js
// .superpowers/tools/db.mjs — run ONE SQL statement against local.db, from the repo root.
// Usage: node .superpowers/tools/db.mjs "SELECT 1"
import { createClient } from "@libsql/client";

const db = createClient({ url: "file:./local.db" });
const r = await db.execute(process.argv[2]);
console.log(JSON.stringify(r.rows, null, 1));
```

- [ ] **Step 4: Add the dev draw counter**

```tsx
// src/components/realm3d/dev-draws.tsx
"use client";

/**
 * Development only: how many draw calls the island's previous frame took, on `window.__realmDraws`,
 * for the browser checks that hold a change to "no worse than before". Read in `useFrame`, before
 * this frame renders, so it is the last frame's whole count (three resets it as each render starts).
 */

import { useFrame } from "@react-three/fiber";

declare global {
  interface Window {
    __realmDraws?: number;
  }
}

export function DevDraws() {
  useFrame(({ gl }) => {
    window.__realmDraws = gl.info.render.calls;
  });
  return null;
}
```

In `spike-scene.tsx`, add `import { DevDraws } from "./dev-draws";` beside the other `./` imports. Inside `World`'s JSX, immediately before `<HudDriver`, add:

```tsx
      {process.env.NODE_ENV !== "production" && <DevDraws />}
```

There's no unit test: this is one line that reads three's own counter, it is development-only instrumentation, and nothing under Vitest may import the scene. Step 6 verifies it in the browser.

- [ ] **Step 5: Give the demo child minutes, so the child's Realm opens**

Run:
```bash
mkdir -p .superpowers/shots
node .superpowers/tools/db.mjs "INSERT OR REPLACE INTO realm_play_ledger (id, child_id, date, kind, minutes, created_at) VALUES ('agent-round8-grant', 'demo-child-1', date('now','localtime'), 'granted', 600, strftime('%s','now'))"
```
Expected: `[]`. If the classifier refuses the write, stop and report the SQL above.

- [ ] **Step 6: Record the baseline draw count at spawn**

Start the dev server (Global Constraints) and wait until `curl -s -o /dev/null -w '%{http_code}' localhost:3177/tavern` prints `200`. Then run:
```bash
PW=$(ls -d ~/.npm/_npx/*/node_modules/playwright | head -1) LD_LIBRARY_PATH=$PWD/.superpowers/tools/chromelibs/usr/lib/x86_64-linux-gnu \
URL='/realm?child=demo-child-1' STEPS='[{"wait":4000},{"eval":"window.__realmDraws"}]' OUT=.superpowers/shots/t1-spawn.png node .superpowers/tools/look.mjs
```
Expected: `EVAL <number>`, and a screenshot of the island. Append `- Round 8 baseline: draws at spawn (parent visitor) = <number>` to `.superpowers/sdd/realm-3d-round2-ledger.md`. Stop the dev server.

- [ ] **Step 7: Commit**

```bash
git branch --show-current
git add src/components/realm3d/dev-draws.tsx src/components/realm3d/spike-scene.tsx
git commit -m "chore(realm3d): a development-only draw-call count on window.__realmDraws, for browser checks" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Nav drop-downs — finish and commit

The work is already written, uncommitted, in the main checkout (38 tests green): `nav-items.ts`, `nav-group-menu.tsx`, `game-nav.tsx`, `quest-helper.tsx`, their tests, `side-quest-copy.test.tsx`, and the `.medallion-chevron` / `.nav-menu*` rules in `globals.css`.

**Files:**
- Modify: `src/components/nav-items.test.ts` (Review Focus 5)
- Commit: `src/components/nav-items.ts`, `src/components/nav-items.test.ts`, `src/components/nav-group-menu.tsx`, `src/components/game-nav.tsx`, `src/components/game-nav.test.tsx`, `src/components/quest-helper.tsx`, `src/components/quest-helper.test.tsx`, `src/lib/utils/side-quest-copy.test.tsx`, `src/app/globals.css`

**Interfaces:**
- Produces: `NavLink`, `NavGroup`, `NavEntry`, `isNavGroup`, `visibleNav(entries, isChildView)`, `navItemsFor(isChildView)`, `navLinks(entries)` and `isNavActive(pathname, entry)` from `@/components/nav-items`.

- [ ] **Step 1: Confirm `globals.css` holds only nav changes**

Run: `git diff src/app/globals.css | grep '^[+-]' | grep -v '^+++\|^---' | grep -v 'medallion\|nav-menu\|^+ *$\|^+  \|^+}\|^+/\*\|^+ \*'`
Expected: no output (every added line belongs to the nav rules). If anything else appears, stop and report it.

- [ ] **Step 2: Write the failing test for a page under a group**

Add inside the file's top-level `describe` for active state (or a new `describe("isNavActive")`) in `src/components/nav-items.test.ts`:

```ts
it("lights a group for a page under one of its destinations, and not for a lookalike path", () => {
  const quests = MAIN_NAV.find((e) => isNavGroup(e) && e.label === "Quests")!;
  expect(isNavActive("/quests/abc", quests)).toBe(true);
  expect(isNavActive("/side-quests", quests)).toBe(true);
  expect(isNavActive("/questsmith", quests)).toBe(false);
});
```

Import `MAIN_NAV`, `isNavGroup` and `isNavActive` if the file does not already.

- [ ] **Step 3: Run it**

Run: `npx vitest run --maxWorkers=2 src/components/nav-items.test.ts`
Expected: PASS if `isNavActive` already handles it. The handoff's implementation does, via `pathname.startsWith(`${href}/`)`. If it passes on first run, record that it pinned existing behaviour, and don't count it as TDD red evidence. If it fails, fix `isNavActive`.

- [ ] **Step 4: Browser pass — parent and child, desktop and phone**

Start the dev server. For each of `PERSONA` unset (parent) and `lily` (child), and each width `W=1280 H=800` and `W=390 H=844`, run:
```bash
PW=$(ls -d ~/.npm/_npx/*/node_modules/playwright | head -1) LD_LIBRARY_PATH=$PWD/.superpowers/tools/chromelibs/usr/lib/x86_64-linux-gnu \
URL='/tavern' WAIT=2500 STEPS='[{"shot":".superpowers/shots/t2-<who>-<w>-bar.png"},{"click":"button[aria-label^=\"Quests\"]"},{"wait":400},{"shot":".superpowers/shots/t2-<who>-<w>-quests.png"},{"press":"Escape"},{"click":"button[aria-label^=\"Rewards\"]"},{"wait":400},{"shot":".superpowers/shots/t2-<who>-<w>-rewards.png"}]' node .superpowers/tools/look.mjs
```
Expected, by reading the screenshots: the bar shows Tavern · Quests ▾ · Spellbook · Realm · Rewards ▾ · Schedule. Quests opens upward, with Quest Giver, Quest Log and Side Quests for the parent, and Quest Log and Side Quests for Emma. Rewards shows Loot and Ranks. Nothing overflows at 390 px. There are no `PAGEERROR` lines. Then run once with `URL='/quests'` and check that the Quests medallion is lit. Stop the dev server.

- [ ] **Step 5: Full verification, then commit**

Run: `npx vitest run --maxWorkers=2`, `npx tsc --noEmit`, `npx eslint src`
Expected: all green, and exactly the one baseline lint error.

```bash
git branch --show-current
git status
git add src/components/nav-items.ts src/components/nav-items.test.ts src/components/nav-group-menu.tsx src/components/game-nav.tsx src/components/game-nav.test.tsx src/components/quest-helper.tsx src/components/quest-helper.test.tsx src/lib/utils/side-quest-copy.test.tsx src/app/globals.css
git commit -m "feat(nav): fewer medallions — Quests (Quest Giver, Quest Log, Side Quests) and Rewards (Loot, Ranks) open menus upward out of the bar; a hero's Quests has no Quest Giver, a group of one is a plain link, and a group lights for any page under its destinations" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Themed cursors and the look reticle

**Files:**
- Create: `public/cursors/arrow.svg`, `public/cursors/gauntlet.svg`
- Create: `src/app/cursors.test.ts`
- Modify: `src/app/globals.css` (a cursor block at the end; each `cursor: pointer` → `cursor: var(--cursor-hand)`)
- Modify: `src/components/realm3d/realm-frame.css`, `src/components/realm3d/riding.css`, `src/components/realm3d/realm-sound.css` (each `cursor: pointer` → `cursor: var(--cursor-hand)`)
- Create: `src/components/realm3d/look-reticle.tsx`, `src/components/realm3d/look-reticle.test.tsx`
- Modify: `src/components/realm3d/realm-game.tsx` (one import, one mounted line)
- Modify: `src/components/realm3d/realm-frame.css` (the `.r3-reticle` rule)

**Interfaces:**
- Produces: CSS tokens `--cursor-arrow` and `--cursor-hand`; `LookReticle({ paused, doc? })` and `type LockDoc`.

- [ ] **Step 1: Write the failing stylesheet test**

```ts
// src/app/cursors.test.ts
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The site's cursors: a gilded arrow everywhere, a gold gauntlet over anything that can be pressed.
 * jsdom never loads a stylesheet, so this reads the stylesheets' text, as `hud-panel-wrappers.test.ts` does.
 */
const SRC = join(process.cwd(), "src");
const PUBLIC = join(process.cwd(), "public");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return p.endsWith(".css") ? [p] : [];
  });
}

describe("the site's cursors", () => {
  const globals = strip(readFileSync(join(SRC, "app/globals.css"), "utf8"));

  it("draws every themed cursor from a file that exists, with a hotspot and a keyword to fall back on", () => {
    const uses = [...globals.matchAll(/url\(["']?(\/cursors\/[^"')]+)["']?\)\s*(\d+)\s+(\d+)\s*,\s*([a-z-]+)/g)];
    expect(uses.map((u) => u[1]).sort()).toEqual(["/cursors/arrow.svg", "/cursors/gauntlet.svg"]);
    for (const [, path, , , fallback] of uses) {
      expect(existsSync(join(PUBLIC, path)), path).toBe(true);
      expect(["auto", "default", "pointer"]).toContain(fallback);
    }
  });

  it("gives the gauntlet to links, enabled buttons and Tailwind's cursor-pointer, and the caret to text fields", () => {
    expect(globals).toMatch(/a\[href\][^{]*\{\s*cursor:\s*var\(--cursor-hand\)/);
    expect(globals).toMatch(/button:not\(:disabled\)[^{]*\{\s*cursor:\s*var\(--cursor-hand\)/);
    expect(globals).toMatch(/\.cursor-pointer\s*\{\s*cursor:\s*var\(--cursor-hand\)/);
    expect(globals).toMatch(/textarea[^{]*\{\s*cursor:\s*text/);
  });

  it("leaves no bare `cursor: pointer` in any stylesheet, so no corner of the site falls back to the system hand", () => {
    for (const file of cssFiles(SRC)) {
      expect(strip(readFileSync(file, "utf8")), file).not.toMatch(/cursor:\s*pointer\s*[;}]/);
    }
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run --maxWorkers=2 src/app/cursors.test.ts`
Expected: FAIL. The first test gets `[]` instead of the two files; the third fails on `globals.css` with a bare `cursor: pointer`. Quote the first failure line in the report.

- [ ] **Step 3: Draw the two cursors**

```svg
<!-- public/cursors/arrow.svg — hotspot (3, 2) -->
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff1b8"/>
      <stop offset="0.45" stop-color="#e2b54a"/>
      <stop offset="1" stop-color="#9a6a1c"/>
    </linearGradient>
  </defs>
  <path d="M3 2 L3 24 L9 18.5 L13 27 L17 25.2 L13 16.8 L21 16.8 Z" fill="url(#gold)" stroke="#1a1408" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M5 6 L5 19 L8.6 15.6" fill="none" stroke="#fffbe6" stroke-width="1" stroke-linecap="round" opacity="0.7"/>
</svg>
```

```svg
<!-- public/cursors/gauntlet.svg — a pointing gold gauntlet; the fingertip is the hotspot (12, 2) -->
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff1b8"/>
      <stop offset="0.5" stop-color="#e2b54a"/>
      <stop offset="1" stop-color="#9a6a1c"/>
    </linearGradient>
    <linearGradient id="cuff" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#c9953a"/>
      <stop offset="1" stop-color="#7a5217"/>
    </linearGradient>
  </defs>
  <g stroke="#1a1408" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
    <rect x="9.5" y="1.5" width="5" height="13" rx="2.5" fill="url(#gold)"/>
    <path d="M7.2 13.2 Q7.2 11.6 9.3 11.6 H22.2 Q25 11.6 25 14.4 V20.6 Q25 24.6 21 24.6 H10.4 Q7.6 24.6 7 21.8 L6 16.4 Q5.8 13.9 7.2 13.2 Z" fill="url(#gold)"/>
    <path d="M17.2 11.8 V16.4 M20.9 11.8 V16.4" fill="none"/>
    <path d="M9.6 17.2 Q7.4 17.6 6.4 19.4" fill="none"/>
    <path d="M8.6 24.6 H23.2 L25.2 30.4 H6.6 Z" fill="url(#cuff)"/>
  </g>
  <circle cx="15.9" cy="27.6" r="1.1" fill="#fff1b8"/>
  <path d="M10.6 3.4 V12.6" stroke="#fffbe6" stroke-width="0.9" stroke-linecap="round" opacity="0.7"/>
</svg>
```

- [ ] **Step 4: Add the cursor block and replace every bare `cursor: pointer`**

Append to the very end of `src/app/globals.css`, outside any `@layer`. Unlayered rules beat Tailwind's `@layer utilities`, which is how `.cursor-pointer` is overridden:

```css
/* ──────────────────────────────────────────────────────────
   Cursors — a gilded arrow everywhere, a gold gauntlet over anything that can be pressed.
   One pair of tokens: stylesheets say var(--cursor-hand), never `pointer`
   (src/app/cursors.test.ts holds that line). Unlayered on purpose, so it beats Tailwind's
   `cursor-pointer` utility, which lives in @layer utilities.
   ────────────────────────────────────────────────────────── */
:root {
  --cursor-arrow: url("/cursors/arrow.svg") 3 2, auto;
  --cursor-hand: url("/cursors/gauntlet.svg") 12 2, pointer;
}
html { cursor: var(--cursor-arrow); }
a[href], button:not(:disabled), summary, label[for], select:not(:disabled),
[role="button"]:not([aria-disabled="true"]), [role="menuitem"], [role="tab"], [role="option"], [role="switch"],
input[type="checkbox"]:not(:disabled), input[type="radio"]:not(:disabled), input[type="range"]:not(:disabled) { cursor: var(--cursor-hand); }
.cursor-pointer { cursor: var(--cursor-hand); }
input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]),
textarea, [contenteditable="true"] { cursor: text; }
```

Then replace the declarations. Back each file up first:
```bash
for f in src/app/globals.css src/components/realm3d/realm-frame.css src/components/realm3d/riding.css src/components/realm3d/realm-sound.css; do cp "$f" "$SCRATCH/$(basename "$f").bak"; done
sed -i 's/cursor: pointer;/cursor: var(--cursor-hand);/g; s/cursor: pointer }/cursor: var(--cursor-hand) }/g' src/app/globals.css src/components/realm3d/realm-frame.css src/components/realm3d/riding.css src/components/realm3d/realm-sound.css
git diff --stat
```
(`$SCRATCH` is your session scratchpad.) Then run `grep -rn "cursor: pointer" src --include=*.css` and expect no output. Also run `grep -rn "cursor: \"pointer\"" src --include=*.tsx` and expect no output; if an inline style shows up, change it to `"var(--cursor-hand)"`.

- [ ] **Step 5: Run the stylesheet test**

Run: `npx vitest run --maxWorkers=2 src/app/cursors.test.ts src/app/\(app\)/hud-panel-wrappers.test.ts`
Expected: PASS. (`hud-panel-wrappers.test.ts` belongs to other work but also reads `globals.css`; it must stay green. Only run it, never edit it.)

- [ ] **Step 6: Write the failing reticle test**

```tsx
// src/components/realm3d/look-reticle.test.tsx
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LookReticle, type LockDoc } from "./look-reticle";

afterEach(cleanup);

function fakeDoc() {
  const fns = new Set<() => void>();
  const doc: LockDoc & { lock(el: unknown): void } = {
    pointerLockElement: null,
    addEventListener: (_type, fn) => void fns.add(fn),
    removeEventListener: (_type, fn) => void fns.delete(fn),
    lock(el) {
      doc.pointerLockElement = el;
      for (const fn of fns) fn();
    },
  };
  return doc;
}

describe("the look reticle", () => {
  it("shows while the mouse is captured, and goes the moment it is let go", () => {
    const doc = fakeDoc();
    render(<LookReticle paused={false} doc={doc} />);
    expect(screen.queryByTestId("look-reticle")).toBeNull();
    act(() => doc.lock({}));
    expect(screen.getByTestId("look-reticle")).toBeInTheDocument();
    act(() => doc.lock(null));
    expect(screen.queryByTestId("look-reticle")).toBeNull();
  });

  it("hides under a panel, even while the mouse is still captured", () => {
    const doc = fakeDoc();
    doc.pointerLockElement = {};
    render(<LookReticle paused doc={doc} />);
    expect(screen.queryByTestId("look-reticle")).toBeNull();
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/components/realm3d/look-reticle.test.tsx`
Expected: FAIL with `Failed to resolve import "./look-reticle"`.

- [ ] **Step 7: Write the reticle**

```tsx
// src/components/realm3d/look-reticle.tsx
"use client";

/**
 * The small gold mark at the middle of the view while the mouse is captured (`look-input.ts`).
 * The browser hides the cursor for as long as it holds the mouse, so without this a child has
 * nothing to tell them the mouse is the camera now. Gone the moment the mouse is let go or a
 * panel opens.
 */

import { useCallback, useSyncExternalStore } from "react";

/** The part of a document this reads, so the rule is tested with a fake. */
export type LockDoc = {
  pointerLockElement: unknown;
  addEventListener(type: "pointerlockchange", fn: () => void): void;
  removeEventListener(type: "pointerlockchange", fn: () => void): void;
};

export function LookReticle({ paused, doc }: { paused: boolean; doc?: LockDoc }) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const d = doc ?? document;
      d.addEventListener("pointerlockchange", onChange);
      return () => d.removeEventListener("pointerlockchange", onChange);
    },
    [doc],
  );
  const captured = useSyncExternalStore(
    subscribe,
    () => (doc ?? document).pointerLockElement != null,
    () => false,
  );
  if (!captured || paused) return null;
  return (
    <svg className="r3-reticle" viewBox="0 0 24 24" aria-hidden="true" data-testid="look-reticle">
      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
    </svg>
  );
}
```

Append to `src/components/realm3d/realm-frame.css`:
```css
/* The mouse is the camera (look-reticle.tsx): a small gold mark at the middle of the view. */
.r3-reticle { position: absolute; left: 50%; top: 50%; z-index: 22; width: 22px; height: 22px; transform: translate(-50%, -50%); color: var(--r3-gold); filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8)); pointer-events: none; }
```

In `realm-game.tsx`, import `{ LookReticle } from "./look-reticle"` and add `<LookReticle paused={paused} />` on the line after `<TroublePlates tbus={troubleBus} />`.

- [ ] **Step 8: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/components/realm3d/look-reticle.test.tsx src/components/realm3d/realm-game.test.tsx`
Expected: PASS.

- [ ] **Step 9: Browser check of the site cursors**

Headless screenshots don't draw the cursor, so read the computed style instead. Start the dev server (if a stale stylesheet is served, `rm -rf .next-agent/dev/cache/turbopack` and restart), then run:
```bash
PW=$(ls -d ~/.npm/_npx/*/node_modules/playwright | head -1) LD_LIBRARY_PATH=$PWD/.superpowers/tools/chromelibs/usr/lib/x86_64-linux-gnu \
URL='/tavern' WAIT=2500 STEPS='[{"eval":"getComputedStyle(document.body).cursor"},{"eval":"getComputedStyle(document.querySelector(\"a[href]\")).cursor"},{"eval":"getComputedStyle(document.querySelector(\"button:not(:disabled)\")).cursor"},{"eval":"fetch(\"/cursors/gauntlet.svg\").then(r => r.status)"}]' node .superpowers/tools/look.mjs
```
Expected: the body's cursor contains `arrow.svg`; the link and button cursors contain `gauntlet.svg`; the fetch prints `200`. Then open `/cursors/arrow.svg` and `/cursors/gauntlet.svg` as `URL`, `W=64 H=64`, with `OUT` screenshots, and look at the art. Stop the dev server. The reticle is seen in the browser in Task 7, once the mouse can be captured.

- [ ] **Step 10: Full verification, then commit**

Run the full suite, `tsc` and `eslint` as in Global Constraints.
```bash
git branch --show-current
git add public/cursors/arrow.svg public/cursors/gauntlet.svg src/app/cursors.test.ts src/app/globals.css src/components/realm3d/realm-frame.css src/components/realm3d/riding.css src/components/realm3d/realm-sound.css src/components/realm3d/look-reticle.tsx src/components/realm3d/look-reticle.test.tsx src/components/realm3d/realm-game.tsx
git commit -m "feat(ui): a gilded arrow and a gold gauntlet for the site and the game's menus, and a gold reticle at the middle of the Realm while the mouse is the camera" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: NPC faces and hands — bring the lane over

The lane is in `.claude/worktrees/agent-a21e189f5a1874721` (branch `worktree-agent-a21e189f5a1874721`, based on `959b017`). It has new `villagers.tsx`, `figure-bake.tsx`, `villager-look.ts`, `attention.ts` and `bake-surface.ts` with tests, and edits to `spike-scene.tsx`, `interior-scene.tsx` and `src/lib/realm/villagers.ts`.

**Files:** as listed above, plus `.superpowers/sdd/realm-3d-round2-ledger.md`.

**Interfaces:**
- Produces: `villagerLook(id): HeroLook | null` (`@/lib/realm3d/villager-look`); `noticeFacing(x, z, rest, hx, hz): number` and `NOTICE_REACH` (`@/lib/realm3d/attention`); `Villagers({ villagers, heroRef })`; `Baked`, `useBakeMaterials`.

- [ ] **Step 1: Freeze the lane in a WIP commit on its own branch**

```bash
git -C .claude/worktrees/agent-a21e189f5a1874721 branch --show-current
git -C .claude/worktrees/agent-a21e189f5a1874721 add -A
git -C .claude/worktrees/agent-a21e189f5a1874721 commit -q -m "wip: NPC lane, to be finished on realm-foundations"
git -C .claude/worktrees/agent-a21e189f5a1874721 log --oneline -1
```
Note the SHA.

- [ ] **Step 2: Bring it over uncommitted**

```bash
git branch --show-current
git cherry-pick -n <SHA>
git status --short
```
Expected: the lane's files are staged, with no conflicts. If there is a conflict, resolve it by hand in favour of both sides, then `git add` the file.

- [ ] **Step 3: Run the lane's tests and the scenes' neighbours**

Run: `npx vitest run --maxWorkers=2 src/lib/realm3d/attention.test.ts src/lib/realm3d/bake-surface.test.ts src/lib/realm3d/villager-look.test.ts src/components/realm3d/realm-rooms.test.tsx src/lib/realm/villagers.test.ts`
Expected: PASS. (Skip `villagers.test.ts` if the path does not exist.) Fix anything red, test-first, then rerun. The lane's own red evidence was lost with its report, so recreate one for the report: temporarily rename `attention.ts` (`mv`, never `git stash`), watch `attention.test.ts` fail with `Failed to resolve import`, rename it back, and quote that line.

- [ ] **Step 4: Type-check and lint**

Run: `npx tsc --noEmit` then `npx eslint src`
Expected: clean, apart from the baseline error.

- [ ] **Step 5: Browser pass — faces, hands and the draw count**

Start the dev server. Find Old Bram's spot with `grep -n "bram\|well" src/lib/realm/layout.ts | head`. Then run:
```bash
PW=$(ls -d ~/.npm/_npx/*/node_modules/playwright | head -1) LD_LIBRARY_PATH=$PWD/.superpowers/tools/chromelibs/usr/lib/x86_64-linux-gnu \
URL='/realm?child=demo-child-1' STEPS='[{"wait":4000},{"eval":"window.__realmDraws"},{"shot":".superpowers/shots/t4-spawn.png"}]' node .superpowers/tools/look.mjs
PW=... URL='/realm?child=demo-child-1&close&at=<bram x>,<bram z + 3>' STEPS='[{"wait":4000},{"shot":".superpowers/shots/t4-bram-close.png"}]' node .superpowers/tools/look.mjs
```
Expected: the villagers on the green are people with faces, hands, hair and clothes, and Bram's hair is silver. `EVAL` is at or below the Task 1 baseline (the old faceless villagers were seven shadow-casting meshes each; a baked one is a few). If it's above, investigate before going on. Then enter the chapel with `STEPS='[{"wait":4000},{"eval":"window.__realmEnter(\"chapel\")"},{"wait":2500},{"shot":".superpowers/shots/t4-keeper.png"}]'` and check that Sister Wren has a face and turns toward the hero. Record the numbers in the ledger. Stop the dev server.

- [ ] **Step 6: Full verification, commit, and remove the worktree**

Run the full suite, `tsc` and `eslint`.
```bash
git branch --show-current
git status
git add src/components/realm3d/villagers.tsx src/components/realm3d/figure-bake.tsx src/lib/realm3d/villager-look.ts src/lib/realm3d/villager-look.test.ts src/lib/realm3d/attention.ts src/lib/realm3d/attention.test.ts src/lib/realm3d/bake-surface.ts src/lib/realm3d/bake-surface.test.ts src/components/realm3d/spike-scene.tsx src/components/realm3d/interior-scene.tsx src/lib/realm/villagers.ts
git commit -m "feat(realm3d): the villagers are people — each is the hero's own figure in the look their portrait is drawn from (face, hands, hair, clothes), turning to a child who comes near, as the keeper does indoors; baked into a few merged meshes each, so the green costs fewer draws than the faceless dolls did" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git worktree remove --force .claude/worktrees/agent-a21e189f5a1874721
git branch -D worktree-agent-a21e189f5a1874721
```

---

### Task 5: Controls — bring the pure modules over, and finish them

The lane is in `.claude/worktrees/agent-a109ca79e88f9d194`: `look-input.ts`, `locomotion.ts`, a reworked `controls.ts` (`lookBy`, `zoomBy`, `LookLimits`, `ISLAND_LOOK`, `LookState`, `looking`, `LOOK_SETTLE`, `chaseLens`, `bodyFacing`, plus deprecated `orbitDrag`/`orbitZoom`/`swingAllowed`/`ASSIST_GRACE` kept only so the scenes still compile), the exact-arc `jump.ts`, and tests. It's library-only; nothing is wired yet.

**Files:**
- Bring over: `src/lib/realm3d/{controls,locomotion,look-input,jump}.ts`, `src/lib/realm3d/{controls,locomotion,look-input,collision}.test.ts`
- Modify: `src/lib/realm3d/locomotion.ts`, `src/lib/realm3d/locomotion.test.ts` (`hipTurn`)
- Modify: `src/lib/realm3d/room-rules.ts`, `src/lib/realm3d/room-rules.test.ts` (`ROOM_LOOK`)
- Modify: `src/lib/realm3d/look-input.test.ts` (Review Focus 1)
- Modify: `src/components/realm3d/hero-figure.tsx` (`Gait.hip`, the hips group)

**Interfaces:**
- Consumes: `LookSettings` from `hud-bus.ts` (committed in `959b017`).
- Produces:
  - `mouseLook(el: LookEl, doc: LookDoc, o: MouseLookOptions): MouseLook` with `captured`, `dragging`, `request()`, `tick(paused)`, `dispose()`.
  - `lookBy(o: Orbit, dx, dy, s: LookSettings, lim?: LookLimits): Orbit` and `zoomBy(o, deltaY, lim?)`.
  - `type LookState = { pitch: number; dist: number; held: boolean; lastLookAt: number }`, `looking(s, now)`.
  - `chaseLens(out, hx, anchorY, hz, yaw, pitch, dist, groundAt | null, clear)`.
  - `bodyFacing(travel, heading, looking, steered, aim): number` (NaN = hold).
  - `makeMotion()`, `stepMotion(m, out, wantX, wantZ, top, grounded, dt)`, `keepMotion(m, wantDx, wantDz, gotDx, gotDz)`.
  - `makeStride()`, `readStride(out, v, facing, top)`, `strideRate(s, grounded)`, and new `hipTurn(s: Stride): number` and `HIP_TURN`.
  - `ROOM_LOOK: LookLimits` from `room-rules.ts`.
  - `Gait` gains an optional `hip?: number`.

- [ ] **Step 1: Freeze and bring the lane over**

```bash
git -C .claude/worktrees/agent-a109ca79e88f9d194 branch --show-current
git -C .claude/worktrees/agent-a109ca79e88f9d194 add -A
git -C .claude/worktrees/agent-a109ca79e88f9d194 commit -q -m "wip: controls lane, to be finished on realm-foundations"
git -C .claude/worktrees/agent-a109ca79e88f9d194 log --oneline -1
git branch --show-current
git cherry-pick -n <SHA>
git status --short
```

- [ ] **Step 2: Run the lane's tests**

Run: `npx vitest run --maxWorkers=2 src/lib/realm3d/controls.test.ts src/lib/realm3d/locomotion.test.ts src/lib/realm3d/look-input.test.ts src/lib/realm3d/collision.test.ts`
Expected: PASS. For red evidence, as in Task 4: rename `locomotion.ts` away, quote the `Failed to resolve import` failure, and rename it back.

- [ ] **Step 3: Write the failing test for a browser with no Pointer Lock (Review Focus 1)**

Add to `src/lib/realm3d/look-input.test.ts`, inside `describe("when the browser says no", …)`. The file's `rig()` builds a fake canvas with `canvas(refuse)`; this test removes `requestPointerLock` from it, as a browser without the API would have it:

```ts
it("plays on without Pointer Lock at all: a click asks nothing and throws nothing, and the right button still looks", () => {
  const { el, doc, looks } = rig();
  delete (el as { requestPointerLock?: unknown }).requestPointerLock;
  expect(() => el.fire("pointerdown", { button: 0, pointerId: 1, clientX: 0, clientY: 0 })).not.toThrow();
  expect(doc.pointerLockElement).toBeNull();
  el.fire("pointerdown", { button: 2, pointerId: 2, clientX: 100, clientY: 100 });
  el.fire("pointermove", { pointerId: 2, clientX: 130, clientY: 100 });
  expect(looks).toEqual([[30, 0]]);
});
```

Run: `npx vitest run --maxWorkers=2 src/lib/realm3d/look-input.test.ts`
Expected: PASS at once. `ask()` calls `el.requestPointerLock?.()` inside a `try`, so this pins existing behaviour. Record that, and don't count it as TDD red evidence. If it fails, make `mouseLook` pass it.

- [ ] **Step 4: Write the failing tests for the hips**

Add to `src/lib/realm3d/locomotion.test.ts`:

```ts
describe("the hips", () => {
  const top = 11;
  /** Where the legs actually carry the body: along the hips' forward, backwards when backpedalling. */
  const legsGo = (facing: number, turn: number, back: boolean) => {
    const k = back ? -1 : 1;
    return { x: k * Math.sin(facing + turn), z: k * Math.cos(facing + turn) };
  };

  it("turn into a sidestep, so the stride runs the way the body goes", () => {
    const s = readStride(makeStride(), { vx: -top, vz: 0 }, 0, top); // facing +z; its right is -x
    const turn = hipTurn(s);
    expect(Math.abs(turn)).toBeCloseTo(HIP_TURN, 5);
    const go = legsGo(0, turn, s.back);
    expect(go.x * -1 + go.z * 0).toBeGreaterThan(0.7);
  });

  it("turn the other way backing up to one side, because the stride runs backwards", () => {
    const d = Math.SQRT1_2 * top;
    const s = readStride(makeStride(), { vx: -d, vz: -d }, 0, top); // back and to the right
    expect(s.back).toBe(true);
    const go = legsGo(0, hipTurn(s), true);
    expect(go.x * -Math.SQRT1_2 + go.z * -Math.SQRT1_2).toBeGreaterThan(0.9);
  });

  it("stay square walking straight, and standing", () => {
    expect(hipTurn(readStride(makeStride(), { vx: 0, vz: top }, 0, top))).toBeCloseTo(0, 6);
    expect(hipTurn(readStride(makeStride(), { vx: 0, vz: 0 }, 0, top))).toBe(0);
  });
});
```

Import `hipTurn` and `HIP_TURN`. Run the file; expected FAIL: `hipTurn is not a function` (or not exported).

- [ ] **Step 5: Write `hipTurn`**

Append to `src/lib/realm3d/locomotion.ts`:

```ts
/** How far the hips turn into a full sidestep: enough that the legs are seen to step sideways. */
export const HIP_TURN = 0.9;

/**
 * The hips' turn off the body's facing, radians, in three.js's +y sense (positive swings the legs
 * toward the body's left), so the stride runs the way the body is actually going: a strafe to the
 * right swings the legs to the right; backing up to the right swings them the other way, because
 * the stride itself runs backwards then (`strideRate`). Square walking straight, and standing.
 */
export function hipTurn(s: Stride): number {
  if (s.speed < 0.05) return 0;
  return -(s.back ? -1 : 1) * s.lateral * HIP_TURN;
}
```

Run the file; expected PASS.

- [ ] **Step 6: Write the failing room-limits test**

Add to `src/lib/realm3d/room-rules.test.ts`:

```ts
import { lookBy, zoomBy } from "./controls";
import { ROOM_LOOK, ROOM_DIST_MAX, ROOM_DIST_MIN, ROOM_PITCH_MAX, ROOM_PITCH_MIN } from "./room-rules";

describe("looking round a room", () => {
  const still = { sensitivity: 1, invertY: false };
  it("tilts and zooms within the room's own limits, not the island's", () => {
    const o = { yaw: 0, pitch: 0.72, dist: 12 };
    expect(lookBy({ ...o }, 0, 100_000, still, ROOM_LOOK).pitch).toBe(ROOM_PITCH_MAX);
    expect(lookBy({ ...o }, 0, -100_000, still, ROOM_LOOK).pitch).toBe(ROOM_PITCH_MIN);
    expect(zoomBy({ ...o }, 100_000, ROOM_LOOK).dist).toBe(ROOM_DIST_MAX);
    expect(zoomBy({ ...o }, -100_000, ROOM_LOOK).dist).toBe(ROOM_DIST_MIN);
  });
});
```

Merge the imports with the file's existing ones. Run it; expected FAIL: `ROOM_LOOK` is undefined.

- [ ] **Step 7: Add `ROOM_LOOK`**

In `src/lib/realm3d/room-rules.ts`, under the existing `ROOM_*` constants:

```ts
import type { LookLimits } from "./controls";

/** The room's look limits, for the one mouse input the island and the rooms share (`lookBy`, `zoomBy`). */
export const ROOM_LOOK: LookLimits = { pitchMin: ROOM_PITCH_MIN, pitchMax: ROOM_PITCH_MAX, distMin: ROOM_DIST_MIN, distMax: ROOM_DIST_MAX };
```

Put the import with the file's other imports. Run it; expected PASS. (`clampRoomPitch` and `clampRoomDist` are deleted in Task 9, once `RoomPointer` is gone.)

- [ ] **Step 8: Give the figure hips**

In `src/components/realm3d/hero-figure.tsx`:

```ts
/** Written by the mover each frame: how fast (0..1 of top speed), where in the walk cycle, and how far the hips turn into a sidestep (`hipTurn`; absent is square). */
export type Gait = { speed: number; phase: number; hip?: number };
```

In `HeroFigure`, add `const hips = useRef<THREE.Group>(null);` beside `bob`. At the end of its `useFrame`:

```ts
    const hp = hips.current;
    if (hp) hp.rotation.y = THREE.MathUtils.damp(hp.rotation.y, g.hip ?? 0, 10, dt);
```

In its JSX, wrap the two `<Leg …/>` lines and the `{skirt && …}` block in `<group ref={hips}> … </group>`. Nothing else moves.

- [ ] **Step 9: Verify and commit**

Run `npx vitest run --maxWorkers=2 src/lib/realm3d src/components/realm3d`, then the full suite, `tsc` and `eslint`.
```bash
git branch --show-current
git status
git add src/lib/realm3d/controls.ts src/lib/realm3d/controls.test.ts src/lib/realm3d/locomotion.ts src/lib/realm3d/locomotion.test.ts src/lib/realm3d/look-input.ts src/lib/realm3d/look-input.test.ts src/lib/realm3d/jump.ts src/lib/realm3d/collision.test.ts src/lib/realm3d/room-rules.ts src/lib/realm3d/room-rules.test.ts src/components/realm3d/hero-figure.tsx
git commit -m "feat(realm3d): the arithmetic of Minecraft and WoW controls — the mouse captured by a click (or a right-drag while free) through one look door at the child's own settings, a body with weight that is the same at any frame rate, a jump that is the same height at any frame rate, a camera that only ever rises over ground, hips that turn into a sidestep, and a room's own look limits; not yet wired" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git worktree remove --force .claude/worktrees/agent-a109ca79e88f9d194
git branch -D worktree-agent-a109ca79e88f9d194
```

---

### Task 6: See-through — what hides the child thins to a screen door

This task makes the hook alone. It is harmless beside the old camera, and it must be in place before Task 7 takes the camera's own dodging away.

**Files:**
- Create: `src/lib/realm3d/see-through.ts`, `src/lib/realm3d/see-through.test.ts`
- Modify: `src/components/realm3d/geo-kit.ts` (`nearCutout` becomes `seeThrough`; add `patchSeeThrough`)
- Create: `src/components/realm3d/see-through-group.tsx`
- Modify: `src/components/realm3d/spike-scene.tsx` (Scenery's material; wrap `RealmLandmarks` and `Village`)
- Modify: `src/components/realm3d/world-props.tsx` (its materials)

**Interfaces:**
- Produces: `seeThroughKeep(px,py,pz, cx,cy,cz, hx,hy,hz): number` and the constants `AIM_Y`, `HERO_R`, `NEAR_HERO`, `SOFT` (`@/lib/realm3d/see-through`); `seeThrough(mat, cut = CAMERA_CUT)` and `patchSeeThrough(root)` (`./geo-kit`); `SeeThroughGroup({ children })`.

- [ ] **Step 1: Write the failing rule tests**

```ts
// src/lib/realm3d/see-through.test.ts
import { describe, expect, it } from "vitest";
import { HERO_R, NEAR_HERO, SOFT, AIM_Y, seeThroughKeep } from "./see-through";

// A lens 20 back and 12 up from a child standing at the origin; the line aims at their chest.
const C = { x: 0, y: 12 + AIM_Y, z: 20 };
const H = { x: 0, y: 0, z: 0 };
const keep = (x: number, y: number, z: number) => seeThroughKeep(x, y, z, C.x, C.y, C.z, H.x, H.y, H.z);
const len = Math.hypot(20, 12);
/** A point `t` along the line from the lens toward the chest, pushed `r` sideways (along x). */
const at = (t: number, r = 0) => keep(r, C.y - (12 * t) / len, C.z - (20 * t) / len);

describe("what stands between the camera and the child", () => {
  it("is thinned right away on the line to them", () => {
    expect(at(len / 2)).toBe(0);
    expect(at(len / 4)).toBe(0);
  });

  it("is drawn whole beside the line, past the cone", () => {
    expect(at(len / 2, HERO_R * 0.5 * 1.05)).toBe(1);
  });

  it("thickens back to solid across the cone's soft edge", () => {
    const r = HERO_R * 0.5 * ((SOFT + 1) / 2);
    const k = at(len / 2, r);
    expect(k).toBeGreaterThan(0);
    expect(k).toBeLessThan(1);
  });

  it("makes the same hole on screen near the lens as near the child: the cone narrows to the lens", () => {
    for (const t of [len / 4, (3 * len) / 4]) {
      const R = (HERO_R * t) / len;
      expect(at(t, R * 0.99)).toBeLessThan(1);
      expect(at(t, R * 1.01)).toBe(1);
    }
  });

  it("never thins the child's own last stretch, anything behind them, or anything behind the lens", () => {
    expect(at(len - NEAR_HERO * 0.5)).toBe(1);
    expect(keep(0, 0, -5)).toBe(1);
    expect(at(-2)).toBe(1);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/lib/realm3d/see-through.test.ts`
Expected: FAIL with `Failed to resolve import "./see-through"`.

- [ ] **Step 2: Write the rule**

```ts
// src/lib/realm3d/see-through.ts
/**
 * WHAT STANDS BETWEEN THE CAMERA AND THE CHILD, AND SO IS SEEN THROUGH.
 *
 * The owner: "it still zooms in when going into objects like trees and it shouldnt do that". So the
 * camera never moves itself to find the child (`chaseLens` in `controls.ts`); whatever is in the way
 * thins to a screen door instead — a tree, a roof, a wall, the castle. This is the rule, point by
 * point, in plain numbers, tested with no WebGL; `seeThrough` in `components/realm3d/geo-kit.ts` is
 * the same rule in GLSL, line for line, and takes these constants from here.
 *
 * The shape is the cone from the lens to the child's chest: `HERO_R` across at the child (the whole
 * figure, head to knee, with a margin), narrowing to nothing at the lens, so the hole is the same
 * size on screen however far back the camera is — what the figure covers, and a little more. Only
 * what is NEARER the lens than the child is thinned: the child's own last stretch, the ground they
 * stand on, and everything behind them stay whole.
 */

/** How far above the feet the cone aims: the chest, so head and knees are both inside it. */
export const AIM_Y = 1.2;
/** The cone's radius at the child, world units. The figure is 2.3 tall; this frames it with a margin. */
export const HERO_R = 1.7;
/** The stretch just before the child that is never thinned, so their feet and the ground at them stay solid. */
export const NEAR_HERO = 0.9;
/** Inside this share of the radius the cone is fully open; out to the radius it thickens back to solid. */
export const SOFT = 0.65;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/**
 * How much of a surface at (px, py, pz) is drawn: 0 gone, 1 whole. The lens is at (cx, cy, cz),
 * the child's feet at (hx, hy, hz).
 */
export function seeThroughKeep(px: number, py: number, pz: number, cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): number {
  const ax = hx - cx;
  const ay = hy + AIM_Y - cy;
  const az = hz - cz;
  const len = Math.hypot(ax, ay, az);
  if (len < 1e-6) return 1;
  const ux = ax / len;
  const uy = ay / len;
  const uz = az / len;
  const vx = px - cx;
  const vy = py - cy;
  const vz = pz - cz;
  // How far along the line toward the child the point is.
  const t = vx * ux + vy * uy + vz * uz;
  if (t <= 0 || t >= len - NEAR_HERO) return 1;
  const r = Math.hypot(vx - ux * t, vy - uy * t, vz - uz * t);
  const rad = (HERO_R * t) / len;
  return smoothstep(rad * SOFT, rad, r);
}
```

Run the test; expected PASS.

- [ ] **Step 3: Turn `nearCutout` into `seeThrough` in `geo-kit.ts`**

Replace the whole `nearCutout` function with the following. Its vertex half is unchanged; the fragment half adds the cone. Keep the doc comment above it, and add one paragraph: "…and, since the owner asked that the camera never zoom in: everything between the lens and the child, inside the cone `lib/realm3d/see-through.ts` describes."

```ts
import { AIM_Y, HERO_R, NEAR_HERO, SOFT } from "@/lib/realm3d/see-through";

const glsl = (n: number) => n.toFixed(3);
/** Materials already given the hook, so a material shared by two places, or seen twice by `patchSeeThrough`, is wrapped once. */
const PATCHED = new WeakSet<THREE.Material>();

export function seeThrough(mat: THREE.Material, cut: number = CAMERA_CUT): THREE.Material {
  if (PATCHED.has(mat)) return mat;
  PATCHED.add(mat);
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    shader.uniforms.cutNear = { value: cut };
    shader.uniforms.cutHero = LENS_HERO;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vCutPos;\nvarying float vFore;\nuniform vec3 cutHero;")
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>
         vFore = 0.0;
         #ifdef USE_INSTANCING
           vCutPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
           vec3 foreRoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
           float foreD = length(foreRoot.xz - cameraPosition.xz);
           float heroD = length(cutHero.xz - cameraPosition.xz);
           float lensUp = cameraPosition.y - foreRoot.y;
           vFore = (1.0 - smoothstep(${FOREGROUND_NEAR.toFixed(1)}, ${FOREGROUND_FAR.toFixed(1)}, foreD)) * step(foreD + 4.0, heroD) * (1.0 - smoothstep(6.0, 10.0, lensUp));
         #else
           vCutPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
         #endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float cutNear;\nuniform vec3 cutHero;\nvarying vec3 vCutPos;\nvarying float vFore;")
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
         // Near the lens, and a whole tree in front of a lowered lens (above).
         float keep = min(smoothstep(cutNear * 0.45, cutNear, distance(vCutPos, cameraPosition)), 1.0 - vFore);
         // Between the lens and the child: seeThroughKeep in lib/realm3d/see-through.ts, line for line.
         vec3 stA = cutHero + vec3(0.0, ${glsl(AIM_Y)}, 0.0) - cameraPosition;
         float stLen = length(stA);
         if (stLen > 0.001) {
           vec3 stU = stA / stLen;
           vec3 stV = vCutPos - cameraPosition;
           float stT = dot(stV, stU);
           if (stT > 0.0 && stT < stLen - ${glsl(NEAR_HERO)}) {
             float stRad = ${glsl(HERO_R)} * stT / stLen;
             keep = min(keep, smoothstep(stRad * ${glsl(SOFT)}, stRad, length(stV - stU * stT)));
           }
         }
         if (keep < 1.0) {
           // A 4x4 ordered dither: the less of a surface is kept, the more of the pattern is gone.
           vec2 cell = mod(floor(gl_FragCoord.xy), 4.0);
           float bayer = mod(cell.x * 4.0 + cell.y * 7.0 + cell.x * cell.y * 5.0, 16.0) / 16.0;
           if (bayer >= keep) discard;
         }`,
      );
  };
  mat.customProgramCacheKey = () => `${prevKey()}|see${cut}`;
  return mat;
}

/**
 * Every mesh material under `root` given `seeThrough`, once each (`SeeThroughGroup`). Sprites,
 * points and lines are left alone: their shaders never compute the world position the rule needs.
 */
export function patchSeeThrough(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list) {
      if (!m || PATCHED.has(m) || !m.type.startsWith("Mesh")) continue;
      seeThrough(m);
      m.needsUpdate = true;
    }
  });
}
```

Put the `see-through` import at the top with the other imports. `CAMERA_CUT` and `FOREGROUND_*` must be declared above `seeThrough`; they already are, at lines ~209–221.

- [ ] **Step 4: Point the two scatter materials at it**

`spike-scene.tsx` `Scenery`: `const mat = useMemo(() => seeThrough(litMaterial()), []);`, and swap `nearCutout, CAMERA_CUT` for `seeThrough` in the `./geo-kit` import (keep `CAMERA_CUT` if anything else in the file uses it — check with grep).
`world-props.tsx`: `out[layer] = seeThrough(fadeWithDistance(litMaterial(), HORIZON[layer].near, HORIZON[layer].far));`, with the same import swap.
Run: `grep -rn "nearCutout" src`. Expected: only comments; update them to say `seeThrough`.

- [ ] **Step 5: Write the group**

```tsx
// src/components/realm3d/see-through-group.tsx
"use client";

/**
 * Everything in this group that stands between the camera and the child thins to a screen door
 * (`seeThrough` in geo-kit; the rule is `lib/realm3d/see-through.ts`). The village's houses and the
 * landmarks are drawn with dozens of small inline materials; rather than thread a hook through every
 * one, this walks its own subtree after each render and gives every material it has not seen the
 * hook, and looks again every second for anything that appeared on its own (a building going up).
 * The walk is the only cost here; the rule itself runs on the GPU.
 */

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import type * as THREE from "three";
import { patchSeeThrough } from "./geo-kit";

/** Frames between the second look. */
const RESCAN_EVERY = 60;

export function SeeThroughGroup({ children }: { children: ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const frames = useRef(0);
  useLayoutEffect(() => {
    if (group.current) patchSeeThrough(group.current);
  });
  useFrame(() => {
    frames.current += 1;
    if (frames.current % RESCAN_EVERY === 0 && group.current) patchSeeThrough(group.current);
  });
  return <group ref={group}>{children}</group>;
}
```

In `spike-scene.tsx` `World`, import it and wrap the two lines:

```tsx
      <SeeThroughGroup>
        <RealmLandmarks world={world} />
        <Village props={layout.props} villagers={layout.villagers} castleType={layout.castleType} castleUnlocked={castleUnlocked} />
      </SeeThroughGroup>
```

`<Scenery>` sits between those two lines today. Move it to just above the group: the three are independent siblings, and its material already has the hook. Check that the castle is drawn inside `Village` with `grep -n "<Castle" src/components/realm3d/spike-scene.tsx`. If it isn't, wrap its mount too.

- [ ] **Step 6: Tests, types, and a browser look**

Run: `npx vitest run --maxWorkers=2 src/lib/realm3d/see-through.test.ts`, then `npx tsc --noEmit` and `npx eslint src`.
Start the dev server. Pick a house from `BUILDING_SLOTS` in `src/lib/realm/layout.ts` (x, z, and depth `d`). Stand the hero 2 units behind it, north: `z_hero = z - (d * 1.5) / 2 - 2`. The default camera looks from the south, so the house stands between them. Run:
```bash
PW=... URL='/realm?child=demo-child-1&at=<x>,<z_hero>' STEPS='[{"wait":5000},{"shot":".superpowers/shots/t6-behind-house.png"},{"eval":"window.__realmDraws"}]' node .superpowers/tools/look.mjs
PW=... URL='/realm?child=demo-child-1&at=-50,0' STEPS='[{"wait":5000},{"shot":".superpowers/shots/t6-old-wood.png"}]' node .superpowers/tools/look.mjs
```
Expected: the wizard (a parent visitor) is visible through a dithered circle in the house wall and roof, and through the canopy in the Old Wood. Nothing beside or behind them is thinned. The draw count is unchanged from Task 4. Stop the dev server.

- [ ] **Step 7: Full verification, then commit**

```bash
git branch --show-current
git add src/lib/realm3d/see-through.ts src/lib/realm3d/see-through.test.ts src/components/realm3d/geo-kit.ts src/components/realm3d/see-through-group.tsx src/components/realm3d/spike-scene.tsx src/components/realm3d/world-props.tsx
git commit -m "feat(realm3d): what stands between the camera and the child thins to a screen door — a cone from the lens to their chest, the same size on screen at any distance, over trees, houses, landmarks and the castle; nearCutout grows into seeThrough, one hook" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The island — mouse look, weighted movement, and a camera that never moves itself

**Files:**
- Create: `src/components/realm3d/mouse-look.tsx`, `src/components/realm3d/chase-camera.tsx`, `src/components/realm3d/camera-rules.test.ts`
- Modify: `src/components/realm3d/spike-scene.tsx` (Hero, World; delete `Rig`, `CameraInput`, `Pointer`)
- Modify: `src/components/realm3d/doorstep.tsx` (`view` in place of `pointer`; no `pickBoom`, no `occluders`)
- Delete: `src/lib/realm3d/camera-boom.ts`, `src/lib/realm3d/camera-boom.test.ts`
- Modify: `src/lib/realm3d/controls.ts`, `src/lib/realm3d/controls.test.ts` (delete the deprecated exports, and `boomOffset` if unused)

**Interfaces:**
- Consumes: everything Task 5 produces; `seeThrough` from Task 6.
- Produces: `MouseLook({ bus, yawRef, view, limits?, paused })` and `ChaseCamera({ heroRef, yawRef, view, bus, close, solids, world, ride })`. `bus.onLookFreed` now fires for real, and `bus.requestLook` is installed by whichever canvas is playing.

- [ ] **Step 1: Write the failing structure test**

```ts
// src/components/realm3d/camera-rules.test.ts
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The owner: "it still zooms in when going into objects like trees and it shouldnt do that". The
 * camera sits where the child put it; what is in the way is seen through (`see-through.ts`). The
 * scenes import `three`, which nothing under Vitest may load, so this holds the line on their source.
 */
const R3 = join(process.cwd(), "src/components/realm3d");
const read = (f: string) => readFileSync(join(R3, f), "utf8");

describe("the camera never moves itself", () => {
  it("has no boom that swings, ducks, lifts or pulls in", () => {
    expect(existsSync(join(process.cwd(), "src/lib/realm3d/camera-boom.ts"))).toBe(false);
    for (const f of ["spike-scene.tsx", "doorstep.tsx", "chase-camera.tsx"]) {
      expect(read(f), f).not.toMatch(/\b(aimBoom|lensFrac|insideWall|swingStep|pickBoom|swingAllowed|orbitDrag)\b/);
    }
  });

  it("takes the island's mouse through the one look door", () => {
    const scene = read("spike-scene.tsx");
    expect(scene).toMatch(/<MouseLook\b/);
    expect(scene).toMatch(/<ChaseCamera\b/);
    expect(scene).not.toMatch(/addEventListener\("pointerdown"/);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/components/realm3d/camera-rules.test.ts`
Expected: FAIL (`camera-boom.ts` exists). Quote the line.

- [ ] **Step 2: Write `MouseLook`**

```tsx
// src/components/realm3d/mouse-look.tsx
"use client";

/**
 * The mouse on a canvas, the island's or a room's alike: `mouseLook` (`lib/realm3d/look-input.ts`)
 * bound to this canvas and the page, its looks turned into the camera's yaw and pitch by `lookBy`
 * (`controls.ts`) at the child's own settings (`bus.look`), the wheel into `zoomBy`, and the browser
 * freeing a captured mouse reported on the bus (`onLookFreed`) so the frame can pause.
 *
 * Whichever canvas is drawing installs its own capture as the bus's `requestLook`, every frame: the
 * island stops drawing while a room is open, so Resume always asks the canvas the child is in.
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { mouseLook, type MouseLook as Look } from "@/lib/realm3d/look-input";
import { lookBy, zoomBy, type LookLimits, type LookState, type Orbit } from "@/lib/realm3d/controls";
import type { HudBus } from "@/lib/realm3d/hud-bus";

const noop = () => {};

export function MouseLook({
  bus,
  yawRef,
  view,
  limits,
  paused,
}: {
  bus: HudBus;
  yawRef: React.RefObject<number>;
  view: React.RefObject<LookState>;
  /** A room's limits (`ROOM_LOOK`); the island's by default. */
  limits?: LookLimits;
  /** Whether a panel has the child's attention. Stable: made once by the parent. */
  paused: () => boolean;
}) {
  const gl = useThree((s) => s.gl);
  const look = useRef<Look | null>(null);
  const request = useRef<() => void>(noop);

  useEffect(() => {
    const orbit: Orbit = { yaw: 0, pitch: 0, dist: 0 };
    const hold = () => {
      const v = view.current;
      orbit.yaw = yawRef.current;
      orbit.pitch = v.pitch;
      orbit.dist = v.dist;
      return v;
    };
    const l = mouseLook(gl.domElement, document, {
      sink: (dx, dy) => {
        const v = hold();
        lookBy(orbit, dx, dy, bus.look, limits);
        yawRef.current = orbit.yaw;
        v.pitch = orbit.pitch;
        v.lastLookAt = performance.now() / 1000;
      },
      zoom: (deltaY) => {
        const v = hold();
        zoomBy(orbit, deltaY, limits);
        v.dist = orbit.dist;
      },
      paused,
      freed: () => bus.onLookFreed(),
    });
    look.current = l;
    request.current = () => l.request();
    return () => {
      l.dispose();
      look.current = null;
      request.current = noop;
    };
  }, [gl, bus, yawRef, view, limits, paused]);

  useFrame(() => {
    const l = look.current;
    if (!l) return;
    l.tick(paused());
    view.current.held = l.captured || l.dragging;
    bus.setLookRequester(request.current);
  });
  return null;
}
```

If the React compiler lint objects to writing `view.current.held` in `useFrame`, move the write into a free function (`function markHeld(v: LookState, on: boolean) { v.held = on; }`), as `spike-scene.tsx` does for `placeHero`.

- [ ] **Step 3: Write `ChaseCamera`**

```tsx
// src/components/realm3d/chase-camera.tsx
"use client";

/**
 * THE CAMERA, where the child put it and nowhere else.
 *
 * On the child's own boom — their yaw, their pitch, their distance (`chaseLens`, `controls.ts`) — off
 * the ground under them, not their head, so a jump is them rising in frame. It never swings round a
 * roof, ducks under a canopy, lifts over a tower or comes in along a blocked line: whatever stands
 * between it and the child is seen through (`see-through.ts`). The one thing it does on its own is
 * stay above the ground under the lens, and that only ever raises it. Riding raises and pulls it
 * back so the mount is in the shot (`camOffsets`).
 */

import { useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { supportHeight, type Collider } from "@/lib/realm3d/collision";
import { chaseLens, DEFAULT_PITCH, PITCH_MIN, terrainClearance, type LookState } from "@/lib/realm3d/controls";
import { camOffsets, type RideBus } from "@/lib/realm3d/riding";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import type { RealmWorld } from "@/lib/realm3d/worldgen";

/** How much of a jump the camera follows. 0 and the child leaves the frame; 1 and the jump is invisible. */
const CAM_LIFT = 0.3;
/** How high over the ground under it the lens stays, on top of the pitch's own clearance. */
const OVER_GROUND = 0.6;
/** How fast the lens settles to a new height while the mouse is not on it: a hill is a rise, not a jolt. */
const SETTLE = 12;

export function ChaseCamera({
  heroRef,
  yawRef,
  view,
  bus,
  close,
  solids,
  world,
  ride = null,
}: {
  heroRef: React.RefObject<THREE.Vector3>;
  yawRef: React.RefObject<number>;
  view: React.RefObject<LookState>;
  bus: HudBus;
  close: boolean;
  solids: Collider[];
  world: RealmWorld;
  ride?: RideBus | null;
}) {
  const { camera } = useThree();
  const lens = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const off = useMemo(() => new THREE.Vector3(), []);
  const rideCam = useMemo(() => ({ lift: 0, pull: 0, tilt: 0 }), []);

  useFrame((_, rawDt) => {
    if (bus.paused) return;
    const dt = Math.min(0.05, rawDt);
    const p = heroRef.current;
    const v = view.current;
    const floorY = supportHeight(p.x, p.z, world.heightAt(p.x, p.z), solids);
    camOffsets(ride ? ride.cam : 0, rideCam);
    const anchorY = floorY + (p.y - floorY) * CAM_LIFT + rideCam.lift;

    // `?close` drops the camera to the hero's shoulder: a way to look at the figure, not a mode.
    if (close) {
      off.set(0, 2.4, 4.2).applyAxisAngle(up, yawRef.current);
      const cx = p.x + off.x;
      const cz = p.z + off.z;
      lens.set(cx, Math.max(anchorY + off.y, world.heightAt(cx, cz) + 0.6), cz);
      camera.position.lerp(lens, 1 - Math.exp(-dt * 6));
      look.set(p.x, anchorY + 1.7, p.z);
      camera.lookAt(look);
      return;
    }

    const pitch = Math.max(PITCH_MIN, v.pitch - rideCam.tilt);
    const dist = v.dist * (1 + rideCam.pull);
    chaseLens(lens, p.x, anchorY, p.z, yawRef.current, pitch, dist, world.heightAt, terrainClearance(v.pitch) + OVER_GROUND);
    // Rigid on the ground plane, so a turn of the mouse is a turn of the view and never a drift.
    // The height settles while the mouse is off it, so walking over a hill is not a jolt.
    camera.position.x = lens.x;
    camera.position.z = lens.z;
    camera.position.y = v.held ? lens.y : camera.position.y + (lens.y - camera.position.y) * (1 - Math.exp(-dt * SETTLE));
    look.set(p.x, anchorY + 1.2 + 2.2 * Math.min(1, v.pitch / DEFAULT_PITCH), p.z);
    camera.lookAt(look);
  });
  return null;
}
```

Check that `PITCH_MIN`, `DEFAULT_PITCH` and `terrainClearance` are still exported by `controls.ts` (they are after Task 5). `world.heightAt` is `(x, z) => number`, which is `chaseLens`'s `groundAt`.

- [ ] **Step 4: Rewire the island in `spike-scene.tsx`**

Back the file up to the scratchpad first. Then:

1. **Imports.** Delete the `@/lib/realm3d/camera-boom` import line. From the `@/lib/realm3d/controls` import, drop `ASSIST_GRACE`, `boomOffset`, `orbitDrag`, `orbitZoom`, `swingAllowed`, `terrainClearance`, `PITCH_MIN`, `type Orbit`, and add `bodyFacing`, `looking`, `type LookState`. Add:
   ```ts
   import { hipTurn, keepMotion, makeMotion, makeStride as makeLegs, readStride, stepMotion, strideRate, type Motion } from "@/lib/realm3d/locomotion";
   import { ChaseCamera } from "./chase-camera";
   import { MouseLook } from "./mouse-look";
   ```
   Add `useCallback` to the `react` import.
2. **Delete** the `Pointer` type, the whole `Rig` function with the constants and comments above it (from the comment starting "Fading an occluder was the alternative…" through the end of `Rig`), and the whole `CameraInput` function with its comment.
3. **Hero.** Replace the prop `pointer: React.RefObject<Pointer>` with `view: React.RefObject<LookState>` (in the destructuring too). Add these refs beside `intent`:
   ```ts
   const motion = useMemo<Motion>(() => makeMotion(), []);
   const move = useMemo<Pt>(() => ({ x: 0, z: 0 }), []);
   const legs = useMemo(() => makeLegs(), []);
   ```
   Replace the body of its `useFrame` from `moveIntent(intent, yawRef.current, k);` down to (not including) `// Edge-triggered: the keydown handler…` with:
   ```ts
    moveIntent(intent, yawRef.current, k);
    // Getting on or off a mount, or a fast-travel ride: the hands are not steering.
    const held = ride?.hold ?? false;
    const p = heroRef.current;
    const ground = world.heightAt(p.x, p.z);
    // The body has weight (`locomotion.ts`): the keys say what speed it wants — its full speed on
    // flat dry ground sets the grip — and the wade, the air and a backpedal take their share.
    const top = pace(ride, HERO_SPEED, 0, false, wadeSpeed);
    const wanted = intent.moving && !held ? pace(ride, HERO_SPEED, Math.max(0, world.waterLevelAt(p.x, p.z) - ground), !vert.grounded, wadeSpeed) * (intent.back ? BACKPEDAL : 1) : 0;
    stepMotion(motion, move, intent.x * wanted, intent.z * wanted, top, vert.grounded, dt);
    if (move.x !== 0 || move.z !== 0) {
      const tx = THREE.MathUtils.clamp(p.x + move.x, -WALK_HALF, WALK_HALF);
      const tz = THREE.MathUtils.clamp(p.z + move.z, -WALK_HALF, WALK_HALF);
      // Two refusals, axis by axis: the water will not let you off the shelf, and the village will
      // not let you through a wall. Head-on you stop; at an angle you slide along it.
      shoreMove(wet, p.x, p.z, tx, tz, world.heightAt, levelAt, wadeLimit(ride));
      slideBody(step, p.x, p.z, wet.x, wet.z, facingRef.current, solids, rideRadius(ride, HERO_RADIUS), bodyFor(ride), vert.y);
      // What the world refused takes the speed that ran into it: a wall is slid along, not leant on.
      keepMotion(motion, move.x, move.z, step.x - p.x, step.z - p.z);
      p.x = step.x;
      p.z = step.z;
    }
    readStride(legs, motion, facingRef.current, top);
    const moving = legs.speed > 0.05;
    // Which way the body turns (`bodyFacing`): where it travels, where the mouse looks, or where a
    // cast or a ride asks. NaN holds it.
    const travel = intent.moving && !held ? rideFace(ride, intent) : Number.NaN;
    const face = bodyFacing(travel, cameraFacing(yawRef.current), looking(view.current, nowS()), held, aimRef.current);
    if (face === face) facing.current = face;
    aimRef.current = Number.NaN;
    // The stride runs the way the body goes: backwards for a backpedal, slower in the air.
    bob.current += dt * strideRate(legs, vert.grounded);
   ```
   Lower down, replace `g2.speed = THREE.MathUtils.damp(g2.speed, moving ? 1 : 0, 8, dt);` with:
   ```ts
    g2.speed = legs.speed;
    // Riding, the legs straddle the saddle: no sidestep there.
    g2.hip = ride && ride.phase !== "off" ? 0 : hipTurn(legs);
   ```
   Every later use of `moving` (the bob height, the lean, `strideTick`) is kept, and now reads the stride.
4. **World.** Replace the `pointer` ref with:
   ```ts
  const view = useRef<LookState>({ pitch: DEFAULT_PITCH, dist: DEFAULT_DIST, held: false, lastLookAt: -1e9 });
  const lookPaused = useCallback(() => bus.paused, [bus]);
   ```
   In the JSX: `<Hero … view={view} …>` instead of `pointer={pointer}`. Replace `<Rig … />` with `<ChaseCamera heroRef={heroRef} yawRef={yawRef} view={view} bus={bus} close={close} solids={solids} world={world} ride={ride} />`. Replace `<CameraInput … />` with `<MouseLook bus={bus} yawRef={yawRef} view={view} paused={lookPaused} />`. On `<Doorstep`, replace `pointer={pointer}` with `view={view}` and delete `occluders={occluders}`.
5. Fix the `HudDriver` comment that says "the boom swings round a roof" so it says "the camera moves".

- [ ] **Step 5: The doorstep puts the camera behind the child, and nothing more**

In `doorstep.tsx`: drop `pickBoom` and `type Boom` from the collision import (keep `HERO_RADIUS`, `type Collider`, `type Pt`). Add `import { chaseLens, terrainClearance, wrapAngle, type LookState } from "@/lib/realm3d/controls";` (merge it with the existing controls import). Replace the props `pointer` and `occluders` with:
```ts
  /** The child's own camera — its pitch and length — to frame them as they come out. Read, never written. */
  view: React.RefObject<LookState>;
```
Delete the `boom` memo. Replace the lines from `const ptr = pointer.current;` to `camera.lookAt(p.x, p.y + 1.6, p.z);` with:
```ts
        // Behind them, looking out, so W walks away from the door. The house behind the lens is the
        // see-through's to thin, not the camera's to dodge.
        yawRef.current = wrapAngle(spot.face + Math.PI);
        const v = view.current;
        chaseLens(camera.position, p.x, p.y, p.z, yawRef.current, v.pitch, v.dist, world.heightAt, terrainClearance(v.pitch) + 0.6);
        camera.lookAt(p.x, p.y + 1.6, p.z);
```
Update its header comment's line about "round to the nearest angle past its corner" so it says the camera goes straight behind them.

- [ ] **Step 6: Delete the old boom and the deprecated controls**

```bash
git rm -q src/lib/realm3d/camera-boom.ts src/lib/realm3d/camera-boom.test.ts
```
In `controls.ts`, delete the whole "going with the next commit" section (`orbitDrag`, `orbitZoom`, `ASSIST_GRACE`, `swingAllowed`). Then run `grep -rn "boomOffset" src`. If only `controls.ts` and `controls.test.ts` mention it, delete `boomOffset` and its test (`"gives back the approved shot at the default orbit"`). `chaseLens` does its arithmetic, and `"sits on the child's own boom"` covers the shot. Run `grep -rn "orbitDrag\|orbitZoom\|swingAllowed\|ASSIST_GRACE\|camera-boom" src`: only `interior-scene.tsx` may still use the raw `YAW_PER_PX`, `PITCH_PER_PX` and `ZOOM_PER_PX` (Task 9), and nothing may mention the deleted names.

- [ ] **Step 7: Run the tests, types and lint**

Run: `npx vitest run --maxWorkers=2 src/components/realm3d/camera-rules.test.ts src/lib/realm3d src/components/realm3d`, then `npx tsc --noEmit` and `npx eslint src`.
Expected: `camera-rules.test.ts` passes, and so does everything else. `tsc` will name any leftover import of `gatherNear`, `Aim` and the like in `spike-scene.tsx`; remove each unused import. (`occluders` is still built and passed to `RealmProps`, and is deleted in Task 10.)

- [ ] **Step 8: Browser pass — walk, strafe, look, a house, a wood, a door**

Start the dev server. As the parent visitor (no gate):
```bash
PW=... URL='/realm?child=demo-child-1' STEPS='[{"wait":5000},{"shot":".superpowers/shots/t7-0.png"},{"key":"KeyD","ms":900},{"shot":".superpowers/shots/t7-strafe.png"},{"key":"KeyW","ms":1500},{"rdrag":[260,0]},{"shot":".superpowers/shots/t7-rdrag.png"},{"key":"KeyS","ms":700},{"shot":".superpowers/shots/t7-backpedal.png"},{"clickAt":[640,420]},{"wait":300},{"eval":"document.pointerLockElement ? \"captured\" : \"free\""},{"eval":"window.__realmDraws"}]' node .superpowers/tools/look.mjs
```
Expected: after D the figure has moved sideways facing north, with its legs stepping sideways. The right-drag turns the view about 90°. S backs up with the body still facing the camera's heading. There are no `PAGEERROR` lines. Headless Chromium may refuse Pointer Lock ("free" is acceptable here; note it). The draw count matches Task 6. Then, as Emma (`PERSONA=lily`, `URL='/realm'`; press Escape if the welcome card shows), repeat the Task 6 house and Old Wood `?at=` shots: the child is always visible through the dithered cone, and the camera stays at its distance with no zoom-in. Finally, walk into a building's door: find a built building in the demo kingdom with `node .superpowers/tools/db.mjs "SELECT * FROM realm_building WHERE child_id='demo-child-1' LIMIT 5"` (if that table name is wrong, `grep -n "sqliteTable(\"realm" src/lib/db/schema.ts`), or use `window.__realmEnter("chapel")` followed by a leave. Check that the camera comes back behind the child, looking out, with no swing through the house. Stop the dev server.

- [ ] **Step 9: Full verification, then commit**

```bash
git branch --show-current
git status
git add src/components/realm3d/mouse-look.tsx src/components/realm3d/chase-camera.tsx src/components/realm3d/camera-rules.test.ts src/components/realm3d/spike-scene.tsx src/components/realm3d/doorstep.tsx src/lib/realm3d/controls.ts src/lib/realm3d/controls.test.ts
git commit -m "feat(realm3d): Minecraft and WoW controls on the island — click the world and the mouse is the camera (Esc lets it go), or right-drag while it is free; WASD with true strafes and a backpedal, a body with weight and hips that turn into a sidestep; the camera sits where the child put it and never swings, ducks, lifts or pulls in (camera-boom.ts, Rig and CameraInput deleted, 513 + 330 lines); coming out of a door puts it straight behind them" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
(`git rm` already staged the deletions.)

---

### Task 8: The words for the new controls, and the look lesson

**Files:**
- Modify: `src/lib/realm3d/frame.ts`, `src/lib/realm3d/frame.test.ts` (`controlRows`, `keyHints`)
- Modify: `src/components/realm3d/hud.test.tsx` (the key strip)
- Modify: `src/lib/realm3d/tutorial.ts`, `src/lib/realm3d/tutorial.test.ts` (`countsAsLook`, the look lesson's keys and words)
- Modify: `src/components/realm3d/realm-game.tsx` (the lesson's `onMove`)

**Interfaces:**
- Produces: `countsAsLook(buttons: number, captured: boolean): boolean` (`@/lib/realm3d/tutorial`).

- [ ] **Step 1: Write the failing tests**

In `frame.test.ts`, replace the body of `"names the fixed scheme…"` with:
```ts
  it("names the scheme the scene binds: a click catches the mouse, a right-drag looks, P and Esc pause, and Q is gone", () => {
    const rows = controlRows(4);
    const keys = rows.flatMap((r) => r.keys);
    expect(keys).toEqual(expect.arrayContaining(["W", "A", "S", "D", "Space", "E", "Click", "Right drag", "Wheel", "P", "Esc", "1–4"]));
    expect(keys).not.toContain("Left drag");
    expect(keys).not.toContain("Q");
    expect(rows.find((r) => r.keys.includes("Click"))!.what).toBe("Look around with the mouse. Esc lets the mouse go.");
    expect(rows.find((r) => r.keys.includes("E"))!.what).toMatch(/talk/i);
  });
```
Replace `"puts E and Esc on the strip…"` with:
```ts
  it("puts the look, E and P on the strip", () => {
    const hints = keyHints(4);
    expect(hints.find((h) => h.key === "Click")!.what).toBe("look");
    expect(hints.find((h) => h.key === "E")!.what).toBe("talk");
    expect(hints.find((h) => h.key === "P")!.what).toBe("pause");
    expect(hints.map((h) => h.key)).not.toContain("Q");
  });
```
In `hud.test.tsx`, change `expect(strip).toHaveTextContent("Esc menu");` to `expect(strip).toHaveTextContent("P pause");`, and rename the test to "…E talks, P pauses, Q is gone".
In `tutorial.test.ts`, add:
```ts
describe("what counts as looking round", () => {
  it("counts the captured mouse moving and a right-drag, and not a free mouse passing over", () => {
    expect(countsAsLook(0, true)).toBe(true);
    expect(countsAsLook(2, false)).toBe(true);
    expect(countsAsLook(0, false)).toBe(false);
    expect(countsAsLook(1, false)).toBe(false);
  });

  it("teaches the click, not a drag", () => {
    expect(LESSONS.find((l) => l.id === "look")!.keys).toEqual(["Click"]);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/lib/realm3d/frame.test.ts src/lib/realm3d/tutorial.test.ts src/components/realm3d/hud.test.tsx`
Expected: FAIL (`Click` is not among the keys; `countsAsLook is not a function`).

- [ ] **Step 2: The rows, the strip and the lesson**

In `frame.ts` `controlRows`, the header comment becomes "…WASD relative to the camera, A and D strafe, S backs up, a click catches the mouse as the camera (Esc lets it go), a right-drag looks while it is free, the wheel zooms, Space jumps, E interacts, 1–N casts, P or Esc pauses." The list becomes:
```ts
  const rows: ControlRow[] = [
    { keys: ["W", "A", "S", "D"], what: "Walk. A and D step sideways, S backs up." },
    { keys: ["Space"], what: "Jump." },
    { keys: ["Click"], what: "Look around with the mouse. Esc lets the mouse go." },
    { keys: ["Right drag"], what: "Look around without catching the mouse." },
    { keys: ["Wheel"], what: "Zoom in and out." },
    { keys: ["E"], what: "Talk to someone, or look at something, when you are close." },
    { keys: [n > 1 ? `1–${n}` : "1"], what: "Cast a spell. You can click a spell too." },
    { keys: ["P", "Esc"], what: "Pause, with Controls and Leave." },
  ];
```
`keyHints`:
```ts
  const hints = [
    { key: "WASD", what: "walk" },
    { key: "Click", what: "look" },
    { key: "Space", what: "jump" },
    { key: "E", what: "talk" },
    { key: n > 1 ? `1–${n}` : "1", what: "cast" },
    { key: "P", what: "pause" },
  ];
```
In `tutorial.ts`: the header says "a click to look with the mouse"; the `looked` signal comment says "Pixels the mouse moved as the camera: captured, or right-dragged"; the look lesson is `{ id: "look", signal: "looked", keys: ["Click"] }`; the lesson copy is `return say("Look around.", "Click the world, then move the mouse. Esc lets the mouse go. Roll the wheel to zoom.");`. Add:
```ts
/** A mouse move that turns the camera: the mouse is captured, or the right button is held. */
export function countsAsLook(buttons: number, captured: boolean): boolean {
  return captured || (buttons & 2) !== 0;
}
```
In `realm-game.tsx`, import `countsAsLook` with the other tutorial imports, and change the first line of `onMove` to:
```ts
      if (bus.paused || !(e.target instanceof HTMLCanvasElement) || !countsAsLook(e.buttons, document.pointerLockElement != null)) return;
```

- [ ] **Step 3: Run the tests, and mend any test that looked by left-dragging**

Run: `npx vitest run --maxWorkers=2 src/lib/realm3d src/components/realm3d`
Expected: PASS. If a `realm-game` or tutorial test fires `pointermove` with `buttons: 1` to finish the look lesson, change it to `buttons: 2`: a right-drag is the free-mouse look now.

- [ ] **Step 4: Full verification, then commit**

```bash
git branch --show-current
git add src/lib/realm3d/frame.ts src/lib/realm3d/frame.test.ts src/components/realm3d/hud.test.tsx src/lib/realm3d/tutorial.ts src/lib/realm3d/tutorial.test.ts src/components/realm3d/realm-game.tsx
git commit -m "feat(realm3d): the help, the key strip and the look lesson say the new controls — Click to look (Esc lets go), Right drag while free, P to pause — and the lesson counts a captured mouse or a right-drag" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Add every other test file the Step 3 fix touched to the `git add` line.)

---

### Task 9: Rooms — the same look door, the same weighted walk

**Files:**
- Modify: `src/components/realm3d/interior-scene.tsx` (RoomWorld, RoomHero, RoomCamera; delete `RoomPointer`, `Pointer`)
- Modify: `src/lib/realm3d/room-rules.ts`, `src/lib/realm3d/room-rules.test.ts` (delete `clampRoomPitch`/`clampRoomDist` if now unused)
- Modify: `src/components/realm3d/camera-rules.test.ts`

**Interfaces:**
- Consumes: `MouseLook` (Task 7), `ROOM_LOOK`, locomotion, and `hipTurn` (Task 5).

- [ ] **Step 1: Extend the structure test so it fails**

Add to `camera-rules.test.ts`:
```ts
  it("takes a room's mouse through the same door, with the room's own limits", () => {
    const room = read("interior-scene.tsx");
    expect(room).toMatch(/<MouseLook\b[^>]*limits=\{ROOM_LOOK\}/);
    expect(room).not.toMatch(/addEventListener\("pointerdown"/);
  });
```
Run it; expected FAIL.

- [ ] **Step 2: Rewire the room**

Back up `interior-scene.tsx`. Then:
1. Imports: add `useCallback` to the `react` import; add `import { MouseLook } from "./mouse-look";`, `import { ROOM_LOOK } from "@/lib/realm3d/room-rules";` (merge with the existing room-rules import), `import { hipTurn, keepMotion, makeMotion, makeStride as makeLegs, readStride, stepMotion, strideRate, type Motion } from "@/lib/realm3d/locomotion";`, and `bodyFacing`, `looking`, `type LookState` from controls. Drop `YAW_PER_PX`, `PITCH_PER_PX`, `ZOOM_PER_PX`, `clampRoomPitch` and `clampRoomDist` once unused.
2. Delete `type Pointer` and the whole `RoomPointer` function.
3. `RoomWorld`: replace the `pointer` ref with
   ```ts
  const yawRef = useRef(0);
  const view = useRef<LookState>({ pitch: plan.view.pitch, dist: plan.view.dist, held: false, lastLookAt: -1e9 });
  const lookPaused = useCallback(() => live.current.paused, [live]);
   ```
   In the JSX, pass `yawRef={yawRef} view={view}` to `RoomHero` and `RoomCamera` instead of `pointer={pointer}`, and replace `<RoomPointer … />` with `<MouseLook bus={bus} yawRef={yawRef} view={view} limits={ROOM_LOOK} paused={lookPaused} />`.
4. `RoomHero`: props `yawRef: React.RefObject<number>; view: React.RefObject<LookState>;` in place of `pointer`. Add `const motion = useMemo<Motion>(() => makeMotion(), []); const move = useMemo<Pt>(() => ({ x: 0, z: 0 }), []); const legs = useMemo(() => makeLegs(), []);`. Replace from `moveIntent(intent, pointer.current.yaw, k);` to just before `if (eat(k, "jump")…` with:
   ```ts
    moveIntent(intent, yawRef.current, k);
    const wanted = intent.moving ? HERO_SPEED * (intent.back ? BACKPEDAL : 1) : 0;
    stepMotion(motion, move, intent.x * wanted, intent.z * wanted, HERO_SPEED, vert.grounded, dt);
    if (move.x !== 0 || move.z !== 0) {
      const x0 = L.x;
      const z0 = L.z;
      // In steps no longer than a stair's tread: the solver drops a blocked step whole, and a slow
      // frame's half-unit stride would reach two treads at once and stop dead at the foot of the
      // stair. Each small step climbs whatever it has just stepped onto.
      const n = Math.max(1, Math.ceil(Math.hypot(move.x, move.z) / SUBSTEP));
      const sx = move.x / n;
      const sz = move.z / n;
      for (let i = 0; i < n; i++) {
        roomSlide(out, L.x, L.z, L.x + sx, L.z + sz, plan.solids, HERO_RADIUS, vert.y);
        putLocal(L, out.x, out.z, L.y);
        const under = supportHeight(L.x, L.z, 0, plan.solids, HERO_RADIUS, vert.y);
        if (vert.grounded && under > vert.y) liftTo(vert, under);
      }
      keepMotion(motion, move.x, move.z, L.x - x0, L.z - z0);
    }
    readStride(legs, motion, facingRef.current, HERO_SPEED);
    const moving = legs.speed > 0.05;
    const travel = intent.moving ? intent.face : Number.NaN;
    const face = bodyFacing(travel, cameraFacing(yawRef.current), looking(view.current, performance.now() / 1000), false, Number.NaN);
    if (face === face) facing.current = face;
    bob.current += dt * strideRate(legs, vert.grounded);
   ```
   Change the leaving check to `if (intent.moving && leavingRoom(plan, L.x, L.z, intent.z, L.y))`. Replace `gg.speed = THREE.MathUtils.damp(gg.speed, moving ? 1 : 0, 8, dt);` with `gg.speed = legs.speed; gg.hip = hipTurn(legs);`.
5. `RoomCamera`: props `yawRef` and `view` in place of `pointer`. Read `const v = view.current;` and use `v.dist`, `v.pitch`, `yawRef.current` where it read `ptr.dist`, `ptr.pitch`, `ptr.yaw`, and `v.held ? 20 : 8` for the lerp rate.

- [ ] **Step 3: Delete the room clamps if unused**

Run: `grep -rn "clampRoomPitch\|clampRoomDist" src`. If only `room-rules.ts` and its test mention them, delete both functions and their tests. `ROOM_LOOK` with `lookBy`/`zoomBy` covers the clamp, tested in Task 5.

- [ ] **Step 4: Tests, types, lint**

Run: `npx vitest run --maxWorkers=2 src/components/realm3d src/lib/realm3d`, `npx tsc --noEmit`, `npx eslint src`.
Expected: all green.

- [ ] **Step 5: Browser pass — inside, and back out**

Start the dev server. As the parent visitor:
```bash
PW=... URL='/realm?child=demo-child-1' STEPS='[{"wait":5000},{"eval":"window.__realmEnter(\"chapel\")"},{"wait":2500},{"key":"KeyD","ms":700},{"rdrag":[200,0]},{"shot":".superpowers/shots/t9-room.png"},{"key":"KeyS","ms":2500},{"wait":1500},{"shot":".superpowers/shots/t9-out.png"}]' node .superpowers/tools/look.mjs
```
Expected: inside, the strafe and the right-drag work, and the walls cut away as before. Walking back out through the door returns to the island with the camera behind the child. There are no `PAGEERROR` lines. Stop the dev server.

- [ ] **Step 6: Full verification, then commit**

```bash
git branch --show-current
git add src/components/realm3d/interior-scene.tsx src/components/realm3d/camera-rules.test.ts src/lib/realm3d/room-rules.ts src/lib/realm3d/room-rules.test.ts
git commit -m "feat(realm3d): rooms take the mouse through the same look door, with their own limits, and the child walks with the same weight and sidestep indoors; RoomPointer and the room clamps deleted" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Delete the occluder lists

Nothing reads `occluders` any more. The camera no longer steps round anything. This task deletes the lists and everything that builds them.

**Files:**
- Modify: `src/lib/realm3d/collision.ts`, `src/lib/realm3d/collision.test.ts`
- Modify: `src/lib/realm3d/castle-plan.ts`, `src/lib/realm3d/castle-plan.test.ts`
- Modify: `src/lib/realm3d/doorways.test.ts`
- Modify: `src/components/realm3d/landmarks.tsx`, `src/components/realm3d/world-props.tsx`, `src/components/realm3d/spike-scene.tsx`

- [ ] **Step 1: Confirm the only readers are gone**

Run: `grep -rn "occluders\|pickBoom\|clearFraction\|segmentEntry\|gatherNear" src --include=*.ts --include=*.tsx | grep -v "\.test\."`
Expected: only the builders (`collision.ts` `buildColliders`, `castle-plan.ts`, `landmarks.tsx`, `world-props.tsx` refill, `spike-scene.tsx` memo and props) and the helpers' own definitions. If anything else reads them (a trouble's line of sight, say), keep what it needs and delete the rest.

- [ ] **Step 2: Make the tests describe the smaller world first (red)**

- In `collision.test.ts`: delete the `pickBoom` tests (the two starting around line 123), any `clearFraction` or `segmentEntry` tests, the occluder-count test (`occluders.length` below 1700), and the tests that inspect occluders for an oak and the mill. Change `const { solids, occluders } = buildColliders(…)` to `const { solids } = buildColliders(…)`, and add:
  ```ts
  it("builds only what stops the hero: nothing is kept for a camera to steer round", () => {
    expect(Object.keys(buildColliders(LAYOUT.props, LAYOUT.scenery, PLAN))).toEqual(["solids"]);
  });
  ```
- In `castle-plan.test.ts`: delete the `tallestOcc` assertion, and add `expect("occluders" in castlePlan("citadel")).toBe(false);`.
- In `doorways.test.ts`: delete the test that builds occluders and checks `clearFraction` at each door (around lines 190–210). The camera no longer needs a clear line.

Run: `npx vitest run --maxWorkers=2 src/lib/realm3d/collision.test.ts src/lib/realm3d/castle-plan.test.ts src/lib/realm3d/doorways.test.ts`
Expected: FAIL on the two new assertions.

- [ ] **Step 3: Delete the builders**

- `collision.ts`: remove `occluders` from `WorldColliders` (it becomes `{ solids: Collider[] }`) and every `occluders.push(…)` in `buildColliders`. Delete `segmentEntry`, `clearFraction`, `gatherNear`, `Boom` and `pickBoom` if Step 1 showed no other readers. Delete comments that only explained occluders.
- `castle-plan.ts`: delete the `occluders` field, the array and each `block(occluders, …)` line. Update the file header's sentence about the camera's occluders.
- `landmarks.tsx`: `landmarkColliders` returns `{ solids }` only.
- `world-props.tsx`: delete the `occluders` and `villageOccluders` props, `truncate(occluders, …)`, the `CANOPY`/`OCCLUDER_REACH` block that pushes canopies and trunks, and the constants if nothing else uses them (`grep` them; `CANOPY` may also feed the scatter's own geometry, so keep it if so).
- `spike-scene.tsx` `World`: the colliders memo returns `{ solids, fixedSolids }`; delete the castle's `plan.occluders` loop and `marks.occluders`; `<RealmProps>` loses `occluders` and `villageOccluders`. Rewrite the comment above it ("What stops the hero, and what can hide him from the camera. Two lists…") to describe one list.

- [ ] **Step 4: Green, types, lint**

Run: `npx vitest run --maxWorkers=2 src/lib/realm3d src/components/realm3d`, `npx tsc --noEmit`, `npx eslint src`.
Expected: all green.

- [ ] **Step 5: Browser smoke**

Start the dev server. Run the Task 7 island steps once. Expected: identical behaviour, with no `PAGEERROR`, and a draw count the same or lower. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git branch --show-current
git add src/lib/realm3d/collision.ts src/lib/realm3d/collision.test.ts src/lib/realm3d/castle-plan.ts src/lib/realm3d/castle-plan.test.ts src/lib/realm3d/doorways.test.ts src/components/realm3d/landmarks.tsx src/components/realm3d/world-props.tsx src/components/realm3d/spike-scene.tsx
git commit -m "refactor(realm3d): no more occluder lists — the camera steers round nothing, so the village's, the castle's, the landmarks' and the wilderness's lists, pickBoom, clearFraction, segmentEntry and gatherNear are deleted with their tests" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

(Adjust the message to name exactly what Step 3 deleted.)

---

### Task 11: Pause and the mouse settings — bring the lane over

The lane is in `.claude/worktrees/agent-a1c840e04096e9d05`: `pause.ts`, `use-pause.ts`, `look-settings.ts`, `look-controls.tsx`, `device-storage.ts` with tests, and edits to `frame-hud.tsx` (Pause button, `why`, the `look` slot), `realm-game.tsx`, `realm-sound.tsx` (`Slider` exported), `use-places-found.ts` (shares `deviceStorage`), `frame.ts` (`Overlay.pause.why`) and `game-icon.tsx` (`pause`).

**Files:** as above, plus `src/components/realm3d/realm-pause.test.tsx` (Review Focus 4).

**Interfaces:**
- Produces: `autoPause`, `pauseCopy`, `IDLE_MS`, `type PauseWhy`; `usePause({ bus, overlayRef, paused, go, clock, enabled }): { resume }`; `useLook(bus)`, `LookControls`; `deviceStorage()`; `Overlay` `{ kind: "pause"; why?: PauseWhy }`.

- [ ] **Step 1: Freeze and bring it over**

```bash
git -C .claude/worktrees/agent-a1c840e04096e9d05 branch --show-current
git -C .claude/worktrees/agent-a1c840e04096e9d05 add -A
git -C .claude/worktrees/agent-a1c840e04096e9d05 commit -q -m "wip: pause lane, to be finished on realm-foundations"
git -C .claude/worktrees/agent-a1c840e04096e9d05 log --oneline -1
git branch --show-current
git cherry-pick -n <SHA>
git status --short
```
Expected: `frame-hud.tsx`, `game-icon.tsx` and `realm-game.tsx` merge cleanly: the branch's changes since `959b017` touch other lines (the Spellbook icon, the reticle line and the lesson's `onMove`). Resolve any conflict by keeping both sides.

- [ ] **Step 2: Run the lane's tests**

Run: `npx vitest run --maxWorkers=2 src/lib/realm3d/pause.test.ts src/lib/realm3d/look-settings.test.ts src/lib/utils/device-storage.test.ts src/components/realm3d/look-controls.test.tsx src/components/realm3d/realm-pause.test.tsx src/components/realm3d/frame-hud.test.tsx src/components/realm3d/realm-game.test.tsx src/components/realm3d/realm-rooms.test.tsx`
Expected: PASS. Red evidence: rename `pause.ts` away, quote the failure, and rename it back.

- [ ] **Step 3: Write the failing test for pausing indoors (Review Focus 4)**

Add to `realm-pause.test.tsx`, inside `describe("every way the game pauses by itself…")`:
```ts
  it("indoors too: the tab hidden pauses (the clock runs in a room), and Resume is back in the room", () => {
    const bus = mountChild();
    act(() => window.__realmEnter!("chapel"));
    expect(document.querySelector(".r3-game--indoors")).not.toBeNull();
    setVisibility("hidden");
    expect(screen.getByRole("dialog", { name: "Paused" })).toHaveTextContent("Paused while you were away — your minutes stopped too.");
    setVisibility("visible");
    fireEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(document.querySelector(".r3-game--indoors")).not.toBeNull();
    expect(bus.paused).toBe(true); // the island stays paused: the child's hands are the room's
  });
```
Run it. If it passes at once, the lane already handles it: record that it pins existing behaviour. If `__realmEnter` is not defined, the frame's dev hook needs `NODE_ENV !== "production"`, which Vitest sets. Check that the hook's `useEffect` ran; wrap `mountChild()` in `act` if needed.

- [ ] **Step 4: Types, lint, then the browser**

Run `npx tsc --noEmit` and `npx eslint src`. Start the dev server. As Emma (`PERSONA=lily`, `URL='/realm'`):
```bash
PW=... PERSONA=lily URL='/realm' STEPS='[{"wait":6000},{"press":"Escape"},{"wait":400},{"press":"Escape"},{"shot":".superpowers/shots/t11-playing.png"},{"press":"KeyP"},{"wait":400},{"shot":".superpowers/shots/t11-paused.png"},{"press":"KeyP"},{"eval":"document.dispatchEvent(new Event(\"visibilitychange\"))"},{"eval":"window.dispatchEvent(new FocusEvent(\"blur\"))"},{"wait":400},{"shot":".superpowers/shots/t11-away.png"}]' node .superpowers/tools/look.mjs
```
Expected: the clock corner shows the Pause button with the pause glyph and "P". P pauses and resumes. After the blur, the board says "Paused while you were away — your minutes stopped too.", and the clock line ends "· paused". The pause menu shows the Mouse section (Look speed, Invert up/down) beside Sound. Stop the dev server.

- [ ] **Step 5: Full verification, commit, and remove the worktree**

```bash
git branch --show-current
git status
git add src/lib/realm3d/pause.ts src/lib/realm3d/pause.test.ts src/components/realm3d/use-pause.ts src/lib/realm3d/look-settings.ts src/lib/realm3d/look-settings.test.ts src/components/realm3d/look-controls.tsx src/components/realm3d/look-controls.test.tsx src/lib/utils/device-storage.ts src/lib/utils/device-storage.test.ts src/components/realm3d/realm-pause.test.tsx src/components/realm3d/frame-hud.tsx src/components/realm3d/frame-hud.test.tsx src/components/realm3d/realm-game.tsx src/components/realm3d/realm-sound.tsx src/components/realm3d/use-places-found.ts src/lib/realm3d/frame.ts src/components/game-icon.tsx
git commit -m "feat(realm3d): pausing that protects a child's minutes — a Pause button with its key (P), and the game pauses itself when the tab is hidden, the window is left, the captured mouse is let go, or nothing moves for two minutes ('Still there?'), never over an open panel and never for a visiting grown-up; Resume catches the mouse again if it was caught; look speed and invert up/down in the pause menu, kept on this computer" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git worktree remove --force .claude/worktrees/agent-a1c840e04096e9d05
git branch -D worktree-agent-a1c840e04096e9d05
```

---

### Task 12: The wardrobe, inside the game

**Files:**
- Modify: `src/lib/actions/avatar.ts` (`getWardrobe`; a shared private `unlockFacts`)
- Create: `src/lib/actions/avatar.test.ts`
- Modify: `src/components/avatar-customizer.tsx`, `src/components/avatar-customizer.test.tsx` (`onSaved`, `omitTabs`)
- Create: `src/components/realm3d/wardrobe.tsx`
- Modify: `src/lib/realm3d/frame.ts`, `src/lib/realm3d/frame.test.ts` (`Overlay` wardrobe, `escapeFrom`)
- Modify: `src/components/realm3d/frame-hud.tsx`, `src/components/realm3d/frame-hud.test.tsx` (`PauseMenu` `onWardrobe`)
- Modify: `src/components/realm3d/realm-game.tsx`, `src/components/realm3d/realm-game.test.tsx`

**Interfaces:**
- Produces:
  - `getWardrobe(childId): Promise<{ level: number; earnedBadgeIds: string[]; questUnlockedItems: string[]; crowns: CrownChoice[] }>`.
  - `AvatarCustomizer` optional props `onSaved?: (config: AvatarConfig) => void` and `omitTabs?: readonly Tab[]`.
  - `RealmWardrobe({ childId, heroName, worn, onSaved, onClose })`.
  - `Overlay` `{ kind: "wardrobe" }`.

- [ ] **Step 1: Write the failing action test**

```ts
// src/lib/actions/avatar.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";
import { levelFromXp } from "@/lib/utils/level";

/** What the in-game wardrobe is told it may offer: the same facts a save is checked against. */
const requireChildAccess = vi.fn(async () => ({ familyId: "f1", access: { userId: "child:c1", permission: "edit" } }));
vi.mock("@/lib/auth/access", () => ({ requireChildAccess: (...a: unknown[]) => (requireChildAccess as (...x: unknown[]) => unknown)(...a) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const seasons = [
  { id: "s1", completedAt: new Date("2026-06-01"), crownId: "crown-copper" },
  { id: "s2", completedAt: null, crownId: null },
];
vi.mock("@/lib/services/crowns", () => ({ loadSeasons: vi.fn(async () => seasons) }));
const copper = { id: "crown-copper", label: "Copper Circlet", color: "#b87333", seasonLabel: "2025–26" };
const crownChoices = vi.fn(() => [copper]);
vi.mock("@/lib/utils/seasons", async (orig) => ({ ...(await orig<typeof import("@/lib/utils/seasons")>()), crownChoices: (s: unknown) => crownChoices(s as never) }));

/** Each `db.select()` answers the next queued rows, whether awaited directly or through `.limit()`. */
const queued: unknown[][] = [];
vi.mock("@/lib/db", () => {
  const query = () => {
    const rows = queued.shift() ?? [];
    const q = {
      from: () => q,
      where: () => q,
      limit: async () => rows,
      then: (ok: (r: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(rows).then(ok, bad),
    };
    return q;
  };
  return { db: { select: () => query() } };
});

import { getWardrobe } from "./avatar";

beforeEach(() => {
  queued.length = 0;
  crownChoices.mockClear();
});

describe("getWardrobe", () => {
  it("hands the wardrobe the hero's level, badges, quest unlocks and finished seasons' crowns, reading only", async () => {
    queued.push([{ id: "c1", familyId: "f1", currentXp: 450 }], [{ badgeId: "b-first-quest" }], [{ itemId: "cape-royal" }]);
    const w = await getWardrobe("c1");
    expect(w).toEqual({ level: levelFromXp(450), earnedBadgeIds: ["b-first-quest"], questUnlockedItems: ["cape-royal"], crowns: [copper] });
    expect(requireChildAccess).toHaveBeenCalledWith("c1");
    expect(crownChoices).toHaveBeenCalledWith([seasons[0]]);
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/lib/actions/avatar.test.ts`
Expected: FAIL with `getWardrobe is not a function`.

- [ ] **Step 2: Write `getWardrobe`, sharing the unlock reads with the save**

In `src/lib/actions/avatar.ts`, add `import { crownChoices, wearableCrownIds } from "@/lib/utils/seasons";` (merge with the existing `wearableCrownIds` import). Add a private helper and the action, and make `updateAvatarConfig` use the helper instead of its own three reads:

```ts
/** What decides which avatar items are unlocked for a hero: their level, their badges and their quest unlocks. */
async function unlockFacts(childId: string, familyId: string) {
  const [childRows, badges, unlocks] = await Promise.all([
    db.select().from(schema.child).where(and(eq(schema.child.id, childId), eq(schema.child.familyId, familyId))).limit(1),
    db.select({ badgeId: schema.childBadge.badgeId }).from(schema.childBadge).where(eq(schema.childBadge.childId, childId)),
    db.select({ itemId: schema.childAvatarUnlock.itemId }).from(schema.childAvatarUnlock).where(eq(schema.childAvatarUnlock.childId, childId)),
  ]);
  const child = childRows[0];
  if (!child) throw new Error("Child not found.");
  return {
    level: levelFromXp(child.currentXp),
    earnedBadgeIds: badges.map((b) => b.badgeId),
    questUnlockedItems: unlocks.map((u) => u.itemId),
  };
}

/**
 * What the Realm's wardrobe may offer (`components/realm3d/wardrobe.tsx`): the same facts a save
 * is checked against, and the crowns of the hero's finished seasons. Read only — no season is
 * opened here, as the Tavern's `getSeasons` does.
 */
export async function getWardrobe(childId: string) {
  const { familyId } = await requireChildAccess(childId);
  const [facts, seasons] = await Promise.all([unlockFacts(childId, familyId), loadSeasons(childId)]);
  return { ...facts, crowns: crownChoices(seasons.filter((s) => s.completedAt !== null)) };
}
```

In `updateAvatarConfig`, replace the block from `// Fetch child to check level and badges…` through `const questUnlockedItems = new Set(…)` with:
```ts
  const facts = await unlockFacts(childId, familyId);
  const { level, earnedBadgeIds } = facts;
  const questUnlockedItems = new Set(facts.questUnlockedItems);
```
Everything after it is unchanged. Don't export a type from this `"use server"` file. Callers use `Awaited<ReturnType<typeof getWardrobe>>`.

Run the test; expected PASS.

- [ ] **Step 3: Write the failing customizer tests**

In `avatar-customizer.test.tsx`, change the router mock so `refresh` can be checked, and extend the actions mock:
```ts
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/actions/avatar", () => ({ updateAvatarConfig: vi.fn().mockResolvedValue(undefined) }));
```
Add `waitFor` to the Testing Library import, and:
```tsx
describe("AvatarCustomizer inside the Realm", () => {
  it("hands a saved look to onSaved, and neither refreshes the page nor closes itself", async () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(<AvatarCustomizer childId="c1" childName="Lily" currentConfig={DEFAULT_AVATAR} level={1} earnedBadgeIds={[]} questUnlockedItems={[]} open onClose={onClose} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Hair" }));
    fireEvent.click(screen.getByRole("button", { name: /^Long/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Hero Look" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ hairStyle: "long" })));
    expect(refresh).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves out the tabs it is told to", () => {
    render(<AvatarCustomizer childId="c1" childName="Lily" currentConfig={DEFAULT_AVATAR} level={1} earnedBadgeIds={[]} questUnlockedItems={[]} open onClose={() => {}} omitTabs={["mount"]} />);
    expect(screen.queryByRole("button", { name: "Mount" })).toBeNull();
    expect(screen.getByRole("button", { name: "Pet" })).toBeInTheDocument();
  });
});
```
Run: `npx vitest run --maxWorkers=2 src/components/avatar-customizer.test.tsx`
Expected: FAIL (`refresh` is called; the Mount tab is present).

- [ ] **Step 4: Give the customizer the two props**

In `avatar-customizer.tsx`, add to `AvatarCustomizerProps`:
```ts
  /**
   * The Realm's wardrobe: called with the saved look instead of refreshing the page, and the
   * dialog does not close itself — the game puts the look on and decides what comes next.
   */
  onSaved?: (config: AvatarConfig) => void;
  /** Tabs to leave out (the Realm leaves out Mount: a visit's mount is fixed once it opens). */
  omitTabs?: readonly Tab[];
```
Destructure both. Add `const tabs = omitTabs ? TABS.filter((t) => !omitTabs.includes(t.id)) : TABS;` and render `tabs.map` instead of `TABS.map`. In `save()`:
```ts
        await updateAvatarConfig(childId, config);
        if (onSaved) onSaved(config);
        else {
          router.refresh();
          onClose();
        }
```
Run the customizer tests; expected PASS.

- [ ] **Step 5: Write the failing frame tests**

In `frame.test.ts`, next to the other `escapeFrom` expectations:
```ts
    expect(escapeFrom({ kind: "wardrobe" })).toEqual({ kind: "pause" });
```
In `frame-hud.test.tsx`'s pause menu `describe`, using that file's existing `noSettings`:
```tsx
  it("offers the Wardrobe when given one, and nothing of it otherwise", () => {
    const onWardrobe = vi.fn();
    render(<PauseMenu heroName="Emma" viewer="child" onResume={() => {}} onControls={() => {}} leaveHref="/tavern" settings={noSettings} onWardrobe={onWardrobe} />);
    fireEvent.click(screen.getByRole("button", { name: /Wardrobe/ }));
    expect(onWardrobe).toHaveBeenCalledOnce();
    cleanup();
    render(<PauseMenu heroName="Emma" viewer="parent" onResume={() => {}} onControls={() => {}} leaveHref="/tavern" settings={noSettings} />);
    expect(screen.queryByRole("button", { name: /Wardrobe/ })).toBeNull();
  });
```
In `realm-game.test.tsx`, add these mocks with the others:
```ts
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/actions/avatar", () => ({
  getWardrobe: vi.fn(async () => ({ level: 5, earnedBadgeIds: [], questUnlockedItems: [], crowns: [] })),
  updateAvatarConfig: vi.fn(async () => {}),
}));
```
import `updateAvatarConfig` from `@/lib/actions/avatar`, `DEFAULT_AVATAR` and `type AvatarConfig` from `@/lib/utils/avatar-catalog`, and `waitFor` from Testing Library. Then add:
```tsx
describe("the wardrobe", () => {
  const openWardrobe = async () => {
    esc();
    fireEvent.click(screen.getByRole("button", { name: /Wardrobe/ }));
    await screen.findByText("Customize Your Hero");
  };

  it("dresses the hero from the pause menu, in the world, without a reload", async () => {
    mount({ avatar: { ...DEFAULT_AVATAR, hairStyle: "short" } });
    await openWardrobe();
    expect(screen.queryByRole("button", { name: "Mount" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hair" }));
    fireEvent.click(screen.getByRole("button", { name: /^Long/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Hero Look" }));
    await waitFor(() => expect((handed.props!.avatar as AvatarConfig).hairStyle).toBe("long"));
    expect(updateAvatarConfig).toHaveBeenCalledWith("demo-child-1", expect.objectContaining({ hairStyle: "long" }));
    expect(screen.queryByText("Customize Your Hero")).toBeNull();
    expect(handed.bus!.paused).toBe(false);
  });

  it("keeps the old look, says why, and stays paused when the save is refused", async () => {
    vi.mocked(updateAvatarConfig).mockRejectedValueOnce(new Error('Item "Long" is locked.'));
    mount({ avatar: { ...DEFAULT_AVATAR, hairStyle: "short" } });
    await openWardrobe();
    fireEvent.click(screen.getByRole("button", { name: "Hair" }));
    fireEvent.click(screen.getByRole("button", { name: /^Long/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save Hero Look" }));
    expect(await screen.findByText('Item "Long" is locked.')).toBeInTheDocument();
    expect((handed.props!.avatar as AvatarConfig).hairStyle).toBe("short");
    expect(handed.bus!.paused).toBe(true);
  });

  it("is not offered to a visiting grown-up", () => {
    mount({ viewer: "parent", realm: { ...realm, isChildView: false } });
    esc();
    expect(screen.queryByRole("button", { name: /Wardrobe/ })).toBeNull();
  });
});
```
Run: `npx vitest run --maxWorkers=2 src/lib/realm3d/frame.test.ts src/components/realm3d/frame-hud.test.tsx src/components/realm3d/realm-game.test.tsx`
Expected: FAIL (there's no wardrobe overlay and no Wardrobe button).

- [ ] **Step 6: The overlay, the menu item, the wardrobe and the wiring**

`frame.ts`: add `/** The wardrobe (`wardrobe.tsx`), from the pause menu; Esc goes back there. */ | { kind: "wardrobe" }` to `Overlay`, and to `escapeFrom`, before `return null;`: `if (overlay.kind === "wardrobe") return { kind: "pause" };`.

`frame-hud.tsx` `PauseMenu`: add the prop `/** The child's own Realm only: the wardrobe (`wardrobe.tsx`). */ onWardrobe?: () => void;`, and, after the Controls button:
```tsx
        {onWardrobe && (
          <button type="button" className="r3-menu-item" onClick={onWardrobe}>
            <GameIcon name="person" className="r3-menu-icon" /> Wardrobe
          </button>
        )}
```

Create the wardrobe:
```tsx
// src/components/realm3d/wardrobe.tsx
"use client";

/**
 * THE WARDROBE: the Tavern's own avatar customizer, opened inside the Realm from the pause menu, so a
 * child can change how they and their companion look without leaving. What it may offer (level,
 * badges, quest unlocks, crowns) is asked for as it opens (`getWardrobe`), not carried on every
 * visit. A save hands the new look straight to the game (`onSaved`), which puts it on the hero and
 * the pet at once; the page is never refreshed. The Mount tab is left out: the ridden mount is fixed
 * for a visit (`riding-hud.tsx` builds its bus once), so a new one would not show until the next —
 * the Tavern is where a mount is chosen.
 */

import { useEffect, useState } from "react";
import { AvatarCustomizer } from "@/components/avatar-customizer";
import { GameIcon } from "@/components/game-icon";
import { getWardrobe } from "@/lib/actions/avatar";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { Panel } from "./frame-hud";

type Facts = Awaited<ReturnType<typeof getWardrobe>>;

const OMIT = ["mount"] as const;

export function RealmWardrobe({
  childId,
  heroName,
  worn,
  onSaved,
  onClose,
}: {
  childId: string;
  heroName: string;
  worn: AvatarConfig;
  onSaved: (config: AvatarConfig) => void;
  onClose: () => void;
}) {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    getWardrobe(childId)
      .then((f) => {
        if (live) setFacts(f);
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [childId, attempt]);

  if (!facts) {
    return (
      <Panel title="Wardrobe" label="Wardrobe" icon={<GameIcon name="person" className="r3-board-icon" />} onClose={onClose}>
        {failed ? (
          <>
            <p className="r3-board-sub">The wardrobe is stuck shut. Try again in a moment.</p>
            <div className="r3-menu">
              <button
                type="button"
                className="r3-menu-item r3-menu-item--go"
                onClick={() => {
                  setFailed(false);
                  setAttempt((n) => n + 1);
                }}
              >
                Try again
              </button>
            </div>
          </>
        ) : (
          <p className="r3-board-sub" role="status">
            Opening your wardrobe…
          </p>
        )}
      </Panel>
    );
  }
  return (
    <AvatarCustomizer
      open
      childId={childId}
      childName={heroName}
      currentConfig={worn}
      level={facts.level}
      earnedBadgeIds={facts.earnedBadgeIds}
      questUnlockedItems={facts.questUnlockedItems}
      crowns={facts.crowns}
      omitTabs={OMIT}
      onSaved={onSaved}
      onClose={onClose}
    />
  );
}
```

`realm-game.tsx`:
- Replace `const hero = avatar ?? DEFAULT_AVATAR;` with:
  ```ts
  // What the hero is wearing: the page's look, until the wardrobe saves a new one.
  const [worn, setWorn] = useState<AvatarConfig>(() => avatar ?? DEFAULT_AVATAR);
  const hero = worn;
  ```
- Import `{ RealmWardrobe } from "./wardrobe"`.
- On `<PauseMenu`, add `onWardrobe={isChild && viewer === "child" ? () => go({ kind: "wardrobe" }) : undefined}`.
- After the pause menu block, add:
  ```tsx
          {overlay?.kind === "wardrobe" && childId && (
            <RealmWardrobe
              childId={childId}
              heroName={heroName}
              worn={hero}
              onSaved={(look) => {
                setWorn(look);
                go(null);
              }}
              onClose={() => go({ kind: "pause" })}
            />
          )}
  ```
Changing `hero` hands the memoised `World` one new `avatar` per save. That's the one legitimate new identity; every other prop stays stable.

- [ ] **Step 7: Run the tests**

Run: `npx vitest run --maxWorkers=2 src/lib/actions/avatar.test.ts src/components/avatar-customizer.test.tsx src/lib/realm3d/frame.test.ts src/components/realm3d/frame-hud.test.tsx src/components/realm3d/realm-game.test.tsx src/components/realm3d/realm-pause.test.tsx`
Expected: PASS.

- [ ] **Step 8: Browser pass, and put Emma's look back**

Save the look first: `node .superpowers/tools/db.mjs "SELECT avatar_config FROM child WHERE id='demo-child-1'"`, and keep the JSON in the scratchpad. Start the dev server. Run:
```bash
PW=... PERSONA=lily URL='/realm?close' STEPS='[{"wait":6000},{"press":"Escape"},{"wait":300},{"press":"Escape"},{"wait":300},{"shot":".superpowers/shots/t12-before.png"},{"press":"KeyP"},{"click":"text=Wardrobe"},{"wait":2000},{"shot":".superpowers/shots/t12-wardrobe.png"},{"click":"text=Hair"},{"click":"button:has-text(\"Spiky\")"},{"click":"text=Save Hero Look"},{"wait":1500},{"shot":".superpowers/shots/t12-after.png"}]' node .superpowers/tools/look.mjs
```
Expected: the wardrobe opens over the paused game with no Mount tab. After the save the game is playing again, and the close-up shows spiky hair on the hero with no page reload. Then restore Emma's look: `node .superpowers/tools/db.mjs "UPDATE child SET avatar_config = '<saved JSON with single quotes doubled>' WHERE id='demo-child-1'"`. If the classifier refuses it, stop and report the SQL. Stop the dev server.

- [ ] **Step 9: Full verification, then commit**

```bash
git branch --show-current
git add src/lib/actions/avatar.ts src/lib/actions/avatar.test.ts src/components/avatar-customizer.tsx src/components/avatar-customizer.test.tsx src/components/realm3d/wardrobe.tsx src/lib/realm3d/frame.ts src/lib/realm3d/frame.test.ts src/components/realm3d/frame-hud.tsx src/components/realm3d/frame-hud.test.tsx src/components/realm3d/realm-game.tsx src/components/realm3d/realm-game.test.tsx
git commit -m "feat(realm3d): the wardrobe in the pause menu — the Tavern's customizer, for the hero and their pet, inside the game; a save puts the new look on at once without a reload (onSaved), a refused save keeps the old one and says why, the Mount tab stays in the Tavern, and a visiting grown-up has none; the unlock reads are shared with the save (unlockFacts)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Day and night by the family's timezone

**Files:**
- Create: `src/lib/realm3d/day-cycle.ts`, `src/lib/realm3d/day-cycle.test.ts`
- Modify: `src/lib/actions/realm.ts`, `src/lib/actions/realm-bundle.test.ts` (`timezone` on the bundle)
- Modify: `src/app/(app)/realm/page.tsx` (pass it on)
- Modify: `src/components/realm3d/realm-game.tsx`, `src/components/realm3d/realm-game.test.tsx` (`RealmData.timezone`, `timeZone` to the canvas)
- Create: `src/components/realm3d/day-light.tsx`
- Modify: `src/components/realm3d/spike-scene.tsx` (`RealmCanvasProps.timeZone`; `Sun`, `SkyDome`, `LanternGlow`, `Window` read the day; delete the fixed sky constants)

**Interfaces:**
- Produces:
  - `localHour(now: Date, timeZone: string | null | undefined): number` and `hourFrom(query: string | null): number | null`.
  - `lightAt(hour, out: DayLight): DayLight`, `makeDayLight()`, `brightness(l)`, `NIGHT_FLOOR`, `MOMENTS`, `type DayLight`, `type Rgb`.
  - `RealmBundle.timezone: string | null`; `RealmData.timezone?: string | null`; `RealmCanvasProps.timeZone?: string | null`.
  - `useDayLight(timeZone)`, `LIT_WINDOW`, `paint(color, rgb)`.

- [ ] **Step 1: Write the failing day-cycle tests**

```ts
// src/lib/realm3d/day-cycle.test.ts
import { describe, expect, it } from "vitest";
import { brightness, hourFrom, lightAt, localHour, makeDayLight, NIGHT_FLOOR } from "./day-cycle";

const hex = (h: string) => ({ r: parseInt(h.slice(1, 3), 16) / 255, g: parseInt(h.slice(3, 5), 16) / 255, b: parseInt(h.slice(5, 7), 16) / 255 });
const light = (hour: number) => lightAt(hour, makeDayLight());
const close = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => {
  expect(a.r).toBeCloseTo(b.r, 5);
  expect(a.g).toBeCloseTo(b.g, 5);
  expect(a.b).toBeCloseTo(b.b, 5);
};

describe("the hour where the family lives", () => {
  const at = new Date("2026-09-28T18:30:00Z");
  it("reads the family's zone, half-hour zones included", () => {
    expect(localHour(at, "America/Denver")).toBeCloseTo(12.5, 6);
    expect(localHour(at, "Asia/Tokyo")).toBeCloseTo(3.5, 6);
    expect(localHour(at, "Australia/Adelaide")).toBeCloseTo(4, 6);
  });

  it("falls back to this computer's own clock for no zone, an empty one, or one that is not a zone", () => {
    const own = localHour(at, null);
    expect(localHour(at, "")).toBe(own);
    expect(localHour(at, "Mars/Olympus_Mons")).toBe(own);
    expect(localHour(at, undefined)).toBe(own);
  });

  it("takes a forced hour for a screenshot only when it is a real hour", () => {
    expect(hourFrom("21")).toBe(21);
    expect(hourFrom("6.5")).toBe(6.5);
    expect(hourFrom("0")).toBe(0);
    for (const bad of ["24", "-1", "noon", "", null]) expect(hourFrom(bad)).toBeNull();
  });
});

describe("the light at each hour", () => {
  it("is the approved noon shot at noon", () => {
    const l = light(12);
    expect(l.sunI).toBeCloseTo(3.1, 6);
    close(l.sun, hex("#fff3d2"));
    close(l.skyTop, hex("#2c6fb8"));
    close(l.fog, hex("#bcdcec"));
    const n = Math.hypot(0.58, 0.44, -0.52);
    expect(l.sunDir.x).toBeCloseTo(0.58 / n, 5);
    expect(l.sunDir.y).toBeCloseTo(0.44 / n, 5);
    expect(l.lamp).toBe(1);
  });

  it("is moonlit at midnight, with the lamps up", () => {
    const l = light(0);
    close(l.sun, hex("#9fb8ff"));
    close(l.skyTop, hex("#0b1633"));
    expect(l.lamp).toBeCloseTo(2.4, 6);
  });

  it("reddens at dawn and at dusk", () => {
    close(light(6.25).sun, hex("#ffb27a"));
    close(light(18.75).sun, hex("#ff9a5c"));
  });

  it("never jumps: a minute changes little, and midnight joins itself", () => {
    let prev = light(0);
    for (let m = 1; m <= 24 * 60; m++) {
      const next = light(m / 60);
      expect(Math.abs(next.sunI - prev.sunI)).toBeLessThan(0.05);
      expect(Math.abs(next.skyTop.b - prev.skyTop.b)).toBeLessThan(0.02);
      prev = next;
    }
    expect(light(23.9999).sunI).toBeCloseTo(light(0).sunI, 3);
  });

  it("keeps the night playable: never darker than the floor's share of noon", () => {
    const noon = brightness(light(12));
    for (let h = 0; h < 24; h += 0.25) expect(brightness(light(h)) / noon).toBeGreaterThanOrEqual(NIGHT_FLOOR);
  });

  it("keeps the sun's direction a unit vector at every hour", () => {
    for (let h = 0; h < 24; h += 0.5) {
      const d = light(h).sunDir;
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
    }
  });
});
```

Run: `npx vitest run --maxWorkers=2 src/lib/realm3d/day-cycle.test.ts`
Expected: FAIL with `Failed to resolve import "./day-cycle"`.

- [ ] **Step 2: Write the day cycle**

```ts
// src/lib/realm3d/day-cycle.ts
/**
 * DAY AND NIGHT — the hour where the family lives, and the light the island gets at that hour.
 *
 * The owner: "make sure its aware of day/night cycles based on the players timezone". The family's
 * saved timezone (`family.timezone`) says where they live; this computer's own is the fallback, and
 * a zone that is not one is no zone. The light is a small table of moments — night, dawn, day, dusk
 * — blended between, so an evening visit reddens as the clock runs rather than switching. Night is
 * moonlit and stays playable: a child must always see themselves and a villager (`NIGHT_FLOOR`).
 *
 * Pure and `three`-free; the scene paints it (`components/realm3d/day-light.tsx`). Colours are
 * sRGB, 0..1. Nothing here allocates once the module has loaded.
 */

export type Rgb = { r: number; g: number; b: number };
export type Vec3 = { x: number; y: number; z: number };

export type DayLight = {
  /** Toward the sun (or the moon), unit length: the key light and its shadows come from here. */
  sunDir: Vec3;
  sun: Rgb;
  sunI: number;
  hemiSky: Rgb;
  hemiGround: Rgb;
  hemiI: number;
  ambientI: number;
  skyTop: Rgb;
  skyLow: Rgb;
  fog: Rgb;
  /** Lamps and lit windows: 1 by day, brighter after dark. */
  lamp: number;
};

type Moment = {
  at: number;
  dir: readonly [number, number, number];
  sun: string;
  sunI: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  ambientI: number;
  skyTop: string;
  skyLow: string;
  fog: string;
  lamp: number;
};

/**
 * Noon is the approved shot, unchanged: the spike's sun, low on purpose and raking from behind, so
 * the shadows stay long enough to read the hills; its colours and strengths are the ones it shipped.
 */
const DAY = { dir: [0.58, 0.44, -0.52], sun: "#fff3d2", sunI: 3.1, hemiSky: "#cfe4ff", hemiGround: "#3f5c1c", hemiI: 0.62, ambientI: 0.1, skyTop: "#2c6fb8", skyLow: "#d8e9ec", fog: "#bcdcec", lamp: 1 } as const;
/** A clear moonlit night: blue, soft, and bright enough to play in. */
const NIGHT = { dir: [-0.42, 0.62, -0.5], sun: "#9fb8ff", sunI: 0.9, hemiSky: "#6f86c8", hemiGround: "#1e2a33", hemiI: 0.55, ambientI: 0.22, skyTop: "#0b1633", skyLow: "#2a3d6b", fog: "#22314f", lamp: 2.4 } as const;

/** The day, hour by hour: in order, and round midnight the last blends into the first. */
export const MOMENTS: readonly Moment[] = [
  { at: 5, ...NIGHT },
  { at: 6.25, dir: [0.9, 0.2, -0.3], sun: "#ffb27a", sunI: 1.7, hemiSky: "#f3c6a8", hemiGround: "#3a3f2a", hemiI: 0.52, ambientI: 0.14, skyTop: "#5a6fa8", skyLow: "#f5b98a", fog: "#e0b9a0", lamp: 1.6 },
  { at: 8, ...DAY },
  { at: 17, ...DAY },
  { at: 18.75, dir: [-0.9, 0.2, -0.3], sun: "#ff9a5c", sunI: 1.6, hemiSky: "#e8a88f", hemiGround: "#3a3526", hemiI: 0.5, ambientI: 0.14, skyTop: "#4a4f8f", skyLow: "#f39a6b", fog: "#d9a38c", lamp: 1.8 },
  { at: 20.5, ...NIGHT },
];

/** Night is never darker than this share of noon (`brightness`): the floor that keeps it playable. */
export const NIGHT_FLOOR = 0.35;

type Parsed = Omit<Moment, "dir" | "sun" | "hemiSky" | "hemiGround" | "skyTop" | "skyLow" | "fog"> & {
  dir: Vec3;
  sun: Rgb;
  hemiSky: Rgb;
  hemiGround: Rgb;
  skyTop: Rgb;
  skyLow: Rgb;
  fog: Rgb;
};

const rgb = (hex: string): Rgb => ({ r: parseInt(hex.slice(1, 3), 16) / 255, g: parseInt(hex.slice(3, 5), 16) / 255, b: parseInt(hex.slice(5, 7), 16) / 255 });

const PARSED: readonly Parsed[] = MOMENTS.map((m) => ({
  ...m,
  dir: { x: m.dir[0], y: m.dir[1], z: m.dir[2] },
  sun: rgb(m.sun),
  hemiSky: rgb(m.hemiSky),
  hemiGround: rgb(m.hemiGround),
  skyTop: rgb(m.skyTop),
  skyLow: rgb(m.skyLow),
  fog: rgb(m.fog),
}));

const black = (): Rgb => ({ r: 0, g: 0, b: 0 });

export function makeDayLight(): DayLight {
  return { sunDir: { x: 0, y: 1, z: 0 }, sun: black(), sunI: 0, hemiSky: black(), hemiGround: black(), hemiI: 0, ambientI: 0, skyTop: black(), skyLow: black(), fog: black(), lamp: 1 };
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

function mixRgb(out: Rgb, a: Rgb, b: Rgb, t: number): void {
  out.r = mix(a.r, b.r, t);
  out.g = mix(a.g, b.g, t);
  out.b = mix(a.b, b.b, t);
}

/** The light at `hour` (0..24, any real number wraps), written into `out`. */
export function lightAt(hour: number, out: DayLight): DayLight {
  const h = ((hour % 24) + 24) % 24;
  let i = PARSED.length - 1;
  for (let k = 0; k < PARSED.length; k++) if (PARSED[k].at <= h) i = k;
  const a = PARSED[i];
  const b = PARSED[(i + 1) % PARSED.length];
  const span = (b.at - a.at + 24) % 24 || 24;
  const u = ((h - a.at + 24) % 24) / span;
  // Eased, so no moment is a corner.
  const t = u * u * (3 - 2 * u);
  const x = mix(a.dir.x, b.dir.x, t);
  const y = mix(a.dir.y, b.dir.y, t);
  const z = mix(a.dir.z, b.dir.z, t);
  const len = Math.hypot(x, y, z) || 1;
  out.sunDir.x = x / len;
  out.sunDir.y = y / len;
  out.sunDir.z = z / len;
  mixRgb(out.sun, a.sun, b.sun, t);
  out.sunI = mix(a.sunI, b.sunI, t);
  mixRgb(out.hemiSky, a.hemiSky, b.hemiSky, t);
  mixRgb(out.hemiGround, a.hemiGround, b.hemiGround, t);
  out.hemiI = mix(a.hemiI, b.hemiI, t);
  out.ambientI = mix(a.ambientI, b.ambientI, t);
  mixRgb(out.skyTop, a.skyTop, b.skyTop, t);
  mixRgb(out.skyLow, a.skyLow, b.skyLow, t);
  mixRgb(out.fog, a.fog, b.fog, t);
  out.lamp = mix(a.lamp, b.lamp, t);
  return out;
}

/** How much light there is to see by, as one number: the key light, the sky's and the fill. */
export function brightness(l: DayLight): number {
  return l.sunI + l.hemiI + l.ambientI;
}

function hourIn(now: Date, zone: string | undefined): number | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now);
    let h = 0;
    let m = 0;
    for (const p of parts) {
      if (p.type === "hour") h = Number(p.value);
      else if (p.type === "minute") m = Number(p.value);
    }
    return (h % 24) + m / 60;
  } catch {
    return null;
  }
}

/** The hour, with minutes as a fraction, in `timeZone`; this computer's own when there is none or it is not a zone. */
export function localHour(now: Date, timeZone: string | null | undefined): number {
  return (timeZone ? hourIn(now, timeZone) : null) ?? hourIn(now, undefined) ?? 12;
}

/** `?hour=21` for a screenshot: a real hour, 0 up to (not including) 24, or null. */
export function hourFrom(query: string | null): number | null {
  if (query === null || query.trim() === "") return null;
  const h = Number(query);
  return Number.isFinite(h) && h >= 0 && h < 24 ? h : null;
}
```

Run the test; expected PASS.

- [ ] **Step 3: Write the failing bundle and composed-path tests**

In `realm-bundle.test.ts`, change the db mock so the child query can join the family and carries a zone:
```ts
vi.mock("@/lib/db", () => {
  const rows = [[{ displayName: "Emma", avatarConfig: null, timezone: "America/Chicago" }], []];
  let n = 0;
  const chain = { from: () => chain, leftJoin: () => chain, where: () => chain, limit: async () => rows[n++ % 2] };
  return { db: { select: () => chain } };
});
```
Add:
```ts
describe("getRealmBundle — the family's clock", () => {
  it("carries the family's timezone, for the island's day and night", async () => {
    requireChildAccess.mockResolvedValue(as("child:c1", "edit"));
    expect((await getRealmBundle("c1")).timezone).toBe("America/Chicago");
  });
});
```
In `realm-game.test.tsx`:
```tsx
describe("day and night", () => {
  it("hands the scene the family's timezone", () => {
    mount({ realm: { ...realm, timezone: "Asia/Tokyo" } });
    expect(handed.props!.timeZone).toBe("Asia/Tokyo");
  });
});
```
Run: `npx vitest run --maxWorkers=2 src/lib/actions/realm-bundle.test.ts src/components/realm3d/realm-game.test.tsx`
Expected: FAIL (`timezone` and `timeZone` are undefined).

- [ ] **Step 4: Carry the zone from the database to the canvas**

`src/lib/actions/realm.ts`: add to `RealmBundle`: `/** The family's saved timezone, for the island's day and night; null when the hero's family has none. */ timezone: string | null;`. The child query in the `Promise.all` becomes:
```ts
    db
      .select({ displayName: schema.child.displayName, avatarConfig: schema.child.avatarConfig, timezone: schema.family.timezone })
      .from(schema.child)
      .leftJoin(schema.family, eq(schema.family.id, schema.child.familyId))
      .where(eq(schema.child.id, childId))
      .limit(1),
```
Add `timezone: child.timezone ?? null,` to the returned object.
`page.tsx`: add `timezone: bundle.timezone,` to the `realm` object.
`realm-game.tsx`: `RealmData` gains `/** The family's timezone, for day and night (`day-cycle.ts`). */ timezone?: string | null;`, and `<RealmCanvas` gains `timeZone={realm.timezone ?? null}`.
`spike-scene.tsx`: `RealmCanvasProps` gains `/** The family's timezone: the island's day and night follow its clock (`day-cycle.ts`). */ timeZone?: string | null;`. `SpikeScene` destructures it and passes `timeZone={timeZone ?? null}` to `World`, which declares `timeZone: string | null`.
Run the two tests; expected PASS.

- [ ] **Step 5: Paint the day onto the island**

Create:
```tsx
// src/components/realm3d/day-light.tsx
"use client";

/**
 * The island's light by the hour (`lib/realm3d/day-cycle.ts`), for the sun, the sky, the fog, the
 * lanterns and the windows to paint from. The hour is read as the scene opens and once a minute
 * after, so a visit that runs into the evening watches the sun go down; painting it is a handful of
 * assignments a frame and allocates nothing. Rooms keep their own lamplight.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { hourFrom, lightAt, localHour, makeDayLight, type DayLight, type Rgb } from "@/lib/realm3d/day-cycle";

/** Every lit window in the village shares this material, so the night lights them all at once. */
export const LIT_WINDOW = new THREE.MeshStandardMaterial({ color: "#ffe9a8", emissive: "#e8bd4a", emissiveIntensity: 0.55, flatShading: true });
/** The windows' glow by day; `lamp` scales it after dark. */
const WINDOW_GLOW = 0.55;
const EVERY_MS = 60_000;

/** A colour from the table (sRGB) onto a three.js colour, which works in linear. */
export function paint(c: THREE.Color, v: Rgb): void {
  c.setRGB(v.r, v.g, v.b, THREE.SRGBColorSpace);
}

function hourNow(timeZone: string | null): number {
  // `?hour=21`, in development only: the night, for a screenshot, without waiting for it.
  const forced = process.env.NODE_ENV !== "production" ? hourFrom(new URLSearchParams(window.location.search).get("hour")) : null;
  return forced ?? localHour(new Date(), timeZone);
}

function lightWindows(l: DayLight): void {
  LIT_WINDOW.emissiveIntensity = WINDOW_GLOW * l.lamp;
}

/** The light now: one object, mutated in place once a minute, stable for the life of the scene. */
export function useDayLight(timeZone: string | null): DayLight {
  const light = useMemo(() => lightAt(hourNow(timeZone), makeDayLight()), [timeZone]);
  useEffect(() => {
    lightWindows(light);
    const id = window.setInterval(() => {
      lightAt(hourNow(timeZone), light);
      lightWindows(light);
    }, EVERY_MS);
    return () => window.clearInterval(id);
  }, [light, timeZone]);
  return light;
}
```

In `spike-scene.tsx`:
1. Import `{ LIT_WINDOW, paint, useDayLight }` from `./day-light` and `type DayLight` from `@/lib/realm3d/day-cycle`.
2. Delete the constants `SKY_TOP`, `SKY_LOW`, `FOG`, `SUN_COLOR` and `SUN_DIR`, and the long comment above `SUN_DIR`. Its gist ("low on purpose…") now lives on `DAY` in `day-cycle.ts`. `grep` each name to confirm nothing else reads them.
3. `Window`: replace its `<meshStandardMaterial …/>` with `<primitive object={LIT_WINDOW} attach="material" />`.
4. `Sun({ heroRef, day })`: add `const hemi = useRef<THREE.HemisphereLight>(null); const fill = useRef<THREE.AmbientLight>(null); const scene = useThree((s) => s.scene);`. In its `useFrame`, use `const d = day.sunDir;` and `d.x * 90` (etc.) where it read `SUN_DIR`, then add:
   ```ts
    paint(l.color, day.sun);
    l.intensity = day.sunI;
    const h = hemi.current;
    if (h) {
      paint(h.color, day.hemiSky);
      paint(h.groundColor, day.hemiGround);
      h.intensity = day.hemiI;
    }
    if (fill.current) fill.current.intensity = day.ambientI;
    if (scene.fog) paint(scene.fog.color, day.fog);
   ```
   In the JSX, drop `color={SUN_COLOR}` and `intensity={3.1}` from the directional light (the frame paints them), and change the two fill lights to `<hemisphereLight ref={hemi} />` and `<ambientLight ref={fill} />`.
5. `SkyDome({ day })`: create the uniforms with `new THREE.Color()`, and add `useFrame(() => { paint(mat.uniforms.top.value, day.skyTop); paint(mat.uniforms.low.value, day.skyLow); });`.
6. `LanternGlow({ scenery, tex, day })`: one shared material,
   ```ts
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: tex, color: "#ffd38a", transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [tex]);
  useEffect(() => () => mat.dispose(), [mat]);
  // By day a lamp is a glint on the lamp; after dark it glows.
  useFrame(() => {
    mat.opacity = Math.min(1, 0.45 + 0.25 * day.lamp);
  });
   ```
   and each `<sprite … material={mat}>` loses its inline `<spriteMaterial>`. If the React compiler lint rejects the `mat.opacity` write, move it into a free function `setOpacity(m, o)`, as `interior-scene.tsx` already does.
7. `World`: `const day = useDayLight(timeZone);` Pass `day={day}` to `<Sun>`, `<SkyDome>` and `<LanternGlow>`. The fog becomes `<fog attach="fog" args={["#000000", 140, 520]} />`, with a comment that `Sun` paints its colour from the hour before the first frame draws.

- [ ] **Step 6: Tests, types, lint**

Run: `npx vitest run --maxWorkers=2 src/lib/realm3d src/components/realm3d src/lib/actions src/app/\(app\)/realm`, then `npx tsc --noEmit` and `npx eslint src`.
Expected: all green.

- [ ] **Step 7: Browser pass — dawn, noon, dusk, night**

Start the dev server. For each hour in `6.5 12 19 23`:
```bash
PW=... URL='/realm?child=demo-child-1&hour=<h>' STEPS='[{"wait":5000},{"shot":".superpowers/shots/t13-<h>.png"},{"eval":"window.__realmDraws"}]' node .superpowers/tools/look.mjs
```
Expected: dawn is warm and low; noon matches the Task 1 shot; dusk is red-orange; night is blue and moonlit, with the lanterns and windows glowing, and the hero and the villagers still clearly visible. The draw count is unchanged. Then `URL='/realm?child=demo-child-1'` with no `hour`: the light matches the family's local time (the demo family's zone; check it with `node .superpowers/tools/db.mjs "SELECT timezone FROM family WHERE id='demo-family'"`). Stop the dev server.

- [ ] **Step 8: Full verification, then commit**

```bash
git branch --show-current
git add src/lib/realm3d/day-cycle.ts src/lib/realm3d/day-cycle.test.ts src/lib/actions/realm.ts src/lib/actions/realm-bundle.test.ts "src/app/(app)/realm/page.tsx" src/components/realm3d/realm-game.tsx src/components/realm3d/realm-game.test.tsx src/components/realm3d/day-light.tsx src/components/realm3d/spike-scene.tsx
git commit -m "feat(realm3d): day and night by the family's own clock — the island's sun, sky, fog, lanterns and windows follow the hour in the family's timezone (this computer's if it has none, or none that is real), from a warm dawn through the approved noon to a red dusk and a moonlit night that stays bright enough to play; the light moves on a minute at a time during a visit; ?hour= forces one for screenshots" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Review the whole round, fix what it finds, and hand back

**Files:** whatever the review finds; `.superpowers/sdd/realm-3d-round2-ledger.md`; the memory file `/home/kylee/.claude/projects/-home-kylee-projects-kingdoms-and-crowns/memory/project_realm_program.md`.

- [ ] **Step 1: One principles-and-correctness review of the range**

Dispatch one reviewer subagent on the most capable model, with no other agent running. Hand it the spec, this plan, `.superpowers/realm-rules.md`, and the range `2fde0ca..HEAD` (`git log --oneline 2fde0ca..HEAD`). Ask it for:
- (a) correctness bugs with a concrete failing input;
- (b) SOLID, DRY, KISS and TDD violations: duplicated logic, dead code left behind (`grep` for the deleted names), speculative options, a module with two jobs, a behaviour with no test;
- (c) the resource rules: nothing under Vitest imports `three`, no per-frame allocation in the new frame hooks, `World`'s props stable;
- (d) the five Review Focus inputs, each checked against its test.

It must verify each finding before reporting it.

- [ ] **Step 2: Fix wave, test-first**

For each verified finding, write the failing test, fix, and rerun. Commit per finding, or per closely related group, with a message naming the finding.

- [ ] **Step 3: Last full verification**

Run the full suite, `npx tsc --noEmit` and `npx eslint src`. Then one combined browser pass as Emma at `?hour=21`: walk, strafe, right-drag, stand behind a house, open the wardrobe, pause with P, and let the tab blur. Read every screenshot. Stop the dev server, and confirm with `ps` that no agent server or Chromium is left running.

- [ ] **Step 4: Ledger and memory**

Append a "Round 8 — done" section to the ledger with the commits, the draw counts, the Review Focus tests, the deviations (no aiming crosshair; no `initialTab`; no Mount tab in the Realm), and anything still open. Update `project_realm_program.md` with a one-paragraph Round 8 summary and its head commit. Check that `MEMORY.md`'s pointer line for it still describes it.

- [ ] **Step 5: Hand back to the owner**

Report what changed per item of their list, the deviations and why, what was seen in the browser (with the screenshot paths), and what was not verified (for example, Pointer Lock in headless Chromium, and how the sound and the cursors feel to a real hand). Nothing is merged to `main`: the owner decides integration.
