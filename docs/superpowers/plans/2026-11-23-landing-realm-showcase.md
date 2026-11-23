# Landing Realm Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "The Realm" showcase section, with real game screenshots and the four selling points, to the marketing landing page.

**Architecture:** A static server component `RealmShowcase` renders from a typed config (`realm-showcase-data.ts`), mirroring the `walkthrough.tsx` / `walkthrough-data.ts` split. Screenshot paths and the shared photo frame style move into small shared marketing modules so the landing, the walkthrough and the showcase don't duplicate them. The Realm screenshots come from the existing `scripts/capture-screens.mjs`.

**Tech Stack:** Next.js App Router (server components), `next/image`, Tailwind, Vitest + Testing Library (jsdom), Playwright + sharp (capture script).

**Spec:** `docs/superpowers/specs/2026-11-23-landing-realm-showcase-design.md`

## Global Constraints

- Section order: Hero · Divider · How it works · **Realm showcase** · Features · Divider · Built for parents · Footer.
- Presented as available now: no "coming soon", no "new" badge.
- No client JavaScript: `realm-showcase.tsx` has no `"use client"` and no hooks.
- Copy may be tightened but must not claim more than the spec's draft copy (the four points, title "A kingdom built by learning", eyebrow "The Realm").
- Screenshots: `public/marketing/screens/r3/realm-village.jpg`, `realm-learning.jpg`, `realm-earned-time.jpg`, captured at 1280×800 (16:10) by `scripts/capture-screens.mjs`. `SCREENS_REV` stays `"r3"` (new names are fresh URLs).
- Capture never clicks the 3D canvas (pointer lock has crashed WSL here). Drive the Realm only with keys and `page.evaluate`.
- Agent dev server: `NEXT_DIST_DIR=.next-agent PORT=3177`, stopped by process group. Never run vitest/tsc/eslint while it or Chromium is up.
- Shared checkout: run `git branch --show-current` (expect `dev`) before each commit and stage only this plan's files. `parent-dashboard.tsx`, `missed-days*` and `AGENTS.md` belong to other work.

## Review Focus

1. **A shot file missing from `public/`** (the capture wasn't run or was renamed). The visitor would see a broken image. Pinned in Task 2: a test asserts every configured shot exists on disk.
2. **Phone width (375px).** Expect a single column, no horizontal page scroll, and readable point text. Checked visually in Task 3.
3. **Empty or generic alt text.** Each shot needs alt text that describes what's in it. Pinned in Task 2 (non-empty, distinct); wording is written in Task 3 after looking at each shot.
4. **Copy drifting from the verified claims.** Pinned in Task 2: the test asserts the four exact point titles.
5. **A capture showing the wrong thing** (a gate, loading screen or redirect instead of the game). Checked in Task 3: look at each JPG and confirm the script's summary shows no "⚠ redirected".

---

### Task 1: Shared marketing modules

**Files:**
- Create: `src/components/marketing/screens.ts`, `src/components/marketing/screens.test.ts`, `src/components/marketing/styles.ts`
- Modify: `src/components/marketing/walkthrough-data.ts:14,40-56` (drop local `Screenshot`, `SHOT_W/H`, `SCREENS_REV`, `shot`; import from `screens.ts`; keep `export type { Screenshot }` and `export { SCREENS_REV }` re-exports so existing imports still work)
- Modify: `src/components/marketing/landing.tsx:49-51` (import `FRAME` from `styles.ts`)

**Interfaces:**
- Produces: `screens.ts`: `export const SCREENS_REV = "r3"`; `export type Screenshot = { src: string; alt: string; width: number; height: number }`; `export function screenshot(name: string, alt: string, width = 1280, height = 800): Screenshot` returning `src: /marketing/screens/${SCREENS_REV}/${name}.jpg`. Move the explanatory comments about versioning with it.
- Produces: `styles.ts`: `export const FRAME: string` (the exact class string now in `landing.tsx`).

- [ ] **Step 1: Write the failing test** `screens.test.ts`:
  `screenshot("realm-village", "A village")` equals `{ src: "/marketing/screens/r3/realm-village.jpg", alt: "A village", width: 1280, height: 800 }`; `screenshot("x", "y", 1280, 560).height === 560`.
- [ ] **Step 2: Run** `npx vitest run src/components/marketing/screens.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `screens.ts` and `styles.ts`, then switch `walkthrough-data.ts` (`shot(...)` → `screenshot(...)`) and `landing.tsx` over to them.
- [ ] **Step 4: Run** `npx vitest run src/components/marketing && npm run typecheck`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `refactor(marketing): share screenshot paths and the photo frame style`.

### Task 2: RealmShowcase component and config

**Files:**
- Create: `src/components/marketing/realm-showcase-data.ts`, `src/components/marketing/realm-showcase.tsx`, `src/components/marketing/realm-showcase.test.tsx`
- Modify: `src/components/marketing/landing.tsx` (render `<RealmShowcase />` right after the `#how-it-works` section; add one hero-paragraph sentence pointing at the Realm, e.g. "…and the Realm, a 3D kingdom students build with what they learn, gives them a reason to come back.")

**Interfaces:**
- Consumes: `screenshot`, `Screenshot` (Task 1); `FRAME` (Task 1); `GameIcon`, `GameIconName`.
- Produces: `realm-showcase-data.ts`: `export type RealmPoint = { icon: GameIconName; title: string; body: string }`; `export const REALM_SHOWCASE: { eyebrow: string; title: string; subtitle: string; points: RealmPoint[]; shots: [Screenshot, Screenshot, Screenshot] }` (shots[0] is the large one). Shot names: `realm-village`, `realm-learning`, `realm-earned-time`. Use placeholder alt text that Task 3 rewrites. Icons: an existing `GameIconName` per point (e.g. `brain`, `castle`, `hourglass`, `shield`).
- Produces: `realm-showcase.tsx`: `export function RealmShowcase(): JSX.Element`, a `<section id="realm" aria-labelledby="realm-title">` with eyebrow, `h2#realm-title`, subtitle, one large framed image (`sizes="(min-width: 1024px) 1024px, 100vw"`), two small framed images side by side from `sm`, then the points in a 2-column grid from `sm`. Styling follows the landing's existing patterns (FRAME, gold icon, `page-title`). Top and bottom borders follow the "How it works" band treatment so the two bands read as separate sections.

- [ ] **Step 1: Write the failing tests** in `realm-showcase.test.tsx` (mock `next/image` to a plain `<img>`):
  - `renders the eyebrow, title and subtitle`: heading named "A kingdom built by learning"; the text "The Realm".
  - `renders the four points`: headings exactly "Learning is the game", "Schoolwork builds a kingdom", "Play time is earned", "Parents stay in control".
  - `every shot has distinct, non-empty alt text`: 3 `img`s; each `alt.trim().length > 0`; `new Set(alts).size === 3`.
  - `every configured shot exists in public/`: for each `REALM_SHOWCASE.shots`, `fs.existsSync(path.join(process.cwd(), "public", shot.src))` is true. (This test stays red until Task 3; mark it `it.todo` here and switch it to `it` in Task 3, so Task 2 ends green.)
  - `the landing renders the Realm section between How it works and the features`: render `<Landing />`; `#how-it-works` precedes `#realm` (`compareDocumentPosition`), and `#realm` precedes the heading "Everything your homeschool needs".
- [ ] **Step 2: Run** `npx vitest run src/components/marketing/realm-showcase.test.tsx`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the data file (spec draft copy), the component and the landing changes.
- [ ] **Step 4: Run** `npx vitest run src/components/marketing && npm run lint && npm run typecheck`. Expected: PASS (one todo).
- [ ] **Step 5: Commit** `feat(marketing): the landing page shows the Realm` (include the spec and this plan).

### Task 3: Capture the Realm screenshots and check the page

**Files:**
- Modify: `scripts/capture-screens.mjs`
- Create: `public/marketing/screens/r3/realm-village.jpg`, `realm-learning.jpg`, `realm-earned-time.jpg`
- Modify: `src/components/marketing/realm-showcase-data.ts` (final alt text), `src/components/marketing/realm-showcase.test.tsx` (`it.todo` → `it`)

**Interfaces:**
- Consumes: shot names from Task 2.
- Produces: in the capture script, a per-shot `realm: true` flag. For those shots, launch with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`, use `waitUntil: "load"` (the Realm's sound Worker never lets `networkidle` settle), and wait about 8000 ms for the island to build. Also add an `ONLY` env filter (a comma list of shot names) so the Realm shots can be captured without recapturing the walkthrough. Never click a `canvas`; optional `keys` steps go through `page.keyboard` only.

- [ ] **Step 1: Add the three Realm shots to `SHOTS`**, starting from these, and change them if a shot doesn't show its subject well:
  - `realm-village`: persona `parent`, `/realm?child=demo-child-1` (a parent visitor is never gated), the village with the HUD.
  - `realm-learning`: persona `lucas`, `/side-quests`, the side-quest picker for grade-matched learning.
  - `realm-earned-time`: persona `lily`, `/realm`, the child's view with the minutes HUD. If Lily is gated, grant today's minutes first with `.superpowers/tools/db.mjs` (a `realm_play_ledger` row for today).
- [ ] **Step 2: Start the agent dev server**: `nohup env NEXT_DIST_DIR=.next-agent PORT=3177 npm run dev &` (record the PGID).
- [ ] **Step 3: Capture**: `ONLY=realm-village,realm-learning,realm-earned-time LD_LIBRARY_PATH=$PWD/.superpowers/tools/chromelibs/usr/lib/x86_64-linux-gnu CHROME_PATH=<installed chrome-headless-shell> node scripts/capture-screens.mjs http://localhost:3177`. Expected: three `✓` lines with no "⚠ redirected".
- [ ] **Step 4: Look at each JPG** (Read tool). Each must show its subject, not a gate or loading screen. Write the final alt text in `realm-showcase-data.ts` from what's actually visible.
- [ ] **Step 5: Look at the landing**: use `.superpowers/tools/look.mjs` with `URL='/?preview'`, scroll to `#realm`, and capture at W=1280 and W=375. Expected at 375: one column, `document.documentElement.scrollWidth <= 375`.
- [ ] **Step 6: Stop the server** (`kill -- -<pgid>`; `ss -ltnp | grep 3177` is empty).
- [ ] **Step 7: Switch the existence test** to `it` and run `npm run lint && npm run typecheck && npx vitest run src/components/marketing`. Expected: all PASS.
- [ ] **Step 8: Commit** `feat(marketing): real Realm screenshots on the landing page`.
