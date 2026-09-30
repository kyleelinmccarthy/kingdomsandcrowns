# Rules for every Realm agent (read in full)

## Context
Kingdoms & Crowns is a Next.js homeschool quest tracker. Its three.js game, the Realm, is played by two real children, Emma (11) and Noah (8), on PCs. `/realm` is the 3D game.

The architecture:
- `src/components/realm3d/realm-game.tsx` is the composition root and never imports `three`.
- `src/components/realm3d/spike-scene.tsx` is the canvas (`RealmCanvasProps`).
- They meet only through props and `HudBus` (`src/lib/realm3d/hud-bus.ts`).
- Menus and panels are `frame-hud.tsx` and `hud.tsx`.
- Indoor rooms are `interior-scene.tsx`.
- Troubles are `troubles3d.ts`, `troubles-scene.tsx` and `troubles-hud.tsx`.

Lane reports are in `/home/kylee/projects/kingdoms-and-crowns/.superpowers/sdd/realm-3d-*-report.md`. Read the ones for whatever you touch.

The owner's standing bar: *"a real, working game that kids can play and enjoy that looks good and they will actually want to play."*

## Resource limits (BINDING — heavy load crashed the owner's WSL and disconnected VS Code)
- Only one agent works at a time. You are it. Keep the machine light.
- Vitest runs with `--maxWorkers=2`. Run only the test files you touched while working. Run the full suite with `--maxWorkers=2` once, just before your final commit.
- Do not run `npx tsc --noEmit` on the whole project more than once or twice. Run it before committing, not after every edit.
- Run one dev server at most, and only while taking screenshots. Stop it by PID the moment the screenshots are done.
- Run one headless Chromium at a time and always `browser.close()`.
- Never run `next build`. Never start the owner's dev server.
- **Never symlink `node_modules` into a worktree.** Worktrees live inside the owner's workspace, and symlinked `node_modules` multiplied what VS Code and TypeScript loaded. If you need to run tests in a worktree, run them from the main checkout against the worktree path, or ask.

## Code
- Runtime `three` only inside scene components and `await import("three")`.
  - **Nothing under Vitest may import `three`.**
  - Keep logic pure and tested.
- `World` is memoised; canvas props must stay referentially stable.
- No per-frame allocation in per-frame paths.
- Deterministic: no `Math.random()` or `Date.now()` in simulation.
- Keep edits to shared files **additive and local**:
  - put new components in new files and mount them with a line or two;
  - add new bus/prop fields, never rename them;
  - never reorganise `spike-scene.tsx`, `realm-game.tsx`, `frame-hud.tsx`, `hud.tsx` or `hud-bus.ts`.
- Before the final commit, run the full suite (`npx vitest run --maxWorkers=2`), `npx tsc --noEmit` and `npx eslint src`.
  - Baseline: all green, plus exactly one pre-existing lint error at `src/components/quest-template-list.tsx:70`, which is not yours.
- Schema changes: edit `schema.ts`, then run `npm run db:generate` and `npm run db:migrate`. Commit the generated migration.
- **If a database write or migration is refused by the environment's permission classifier, STOP and report the exact SQL.**

## Engineering principles (BINDING — the owner asked for these by name: SOLID, DRY, KISS, TDD)
- **TDD, red → green → refactor, for every behaviour change.**
  - Write the test first, run it, and see it fail for the right reason. Then write the least code that passes. Then refactor with the tests green.
  - In your report, for each item, name the test you wrote first and quote the failure line you saw before implementing. A report with no red evidence goes back.
- **DRY.**
  - Before writing anything, grep for an existing function, component, constant or copy source that already does it. Reuse or extend it; never paste a copy.
  - If code you touch duplicates something, consolidate it while you are there and say so.
- **KISS.**
  - Choose the simplest rule that meets the need.
  - When a new rule makes an old mechanism unnecessary, delete the old mechanism and its tests, and say what you removed. Deleting complexity is a goal.
  - No speculative options.
- **SOLID.**
  - One responsibility per module.
  - Logic depends on small interfaces, not on DOM or three.js objects: for example, an input source that emits look deltas, or a clock that returns "now".
  - Extend through new focused modules or optional props, not by editing unrelated code.
  - No god-components. `spike-scene.tsx`, `realm-game.tsx`, `frame-hud.tsx` and `hero-figure.tsx` are already very large, so new code goes in new files.

## Foreign uncommitted work (NEVER touch, stage, overwrite, or write to by script)
- Another session's files:
  - `src/app/(app)/tavern/page.tsx`
  - `src/components/avatar.tsx`
  - `src/components/avatar-figures.test.tsx`
  - the untracked `src/app/(app)/hud-panel-wrappers.test.ts`
- Reading and importing them is fine.
- Before any scripted edit, read the file into a variable first. Never `open(p,'w')` before reading `p`.
- Run `git diff --stat` after scripted edits.

## Git
- Run each git command on its own line. Never chain with `&&`.
- **Never** use `git stash`.
- `git add` your own files by name, after running `git status`.
- Every commit message ends with a second `-m` carrying exactly: `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`
- Check you are on the right branch before every commit.
- Do not dispatch subagents.

## Dev server (the owner runs their own; never take its lock)
- Start with `nohup env NEXT_DIST_DIR=.next-agent PORT=3177 npm run dev &` and note the PID.
- Never run a dev server without `NEXT_DIST_DIR`.
- **Never** `pkill -f "next dev"`.
- Delete `.next-agent/` when you finish. It's a 700 MB build cache inside the owner's workspace.

## Screenshots: verify by playing
- The script and the Chromium libs live in `/home/kylee/projects/kingdoms-and-crowns/.superpowers/tools/`. Read `README.md` there first.
- The page supports these query overrides:
  - `?at=x,z`
  - `?castle=1`
  - `?viewer=parent`
  - `?calm=1`
  - `?sitedone=chapel:3`
  - `?mount=`
- Dev hooks:
  - `window.__realmBus`
  - `window.__realmRaise(buildingId, {label,done,total,complete})`
  - `window.__realmEnter(site)`
  - `window.__realmTroubles`
  - `window.__realmCastAs(element, form)`
- The local session is a parent (Jordan) in DEMO_MODE, so `/realm` shows the parent's visit to Emma unless you target a child view.
- **Open and look at every image before claiming anything about it.**
