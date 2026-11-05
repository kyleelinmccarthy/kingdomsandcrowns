# Realm Playability Round Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make side quests play like a game that teaches: second chances with hints and explanations, stars kept from the best attempt, a live streak and skill meter, spaced review, parent-set length, gilded buildings and a post-build goal, and an optional Crown Challenge.

**Architecture:** Every rule is a small pure module under `src/lib/utils/` with its own tests (`deed-scoring.ts`, `deed-attempts.ts`, `skill-hints.ts`, `review-schedule.ts`, `deed-run-flow.ts`, plus additions to `mastery.ts`). `src/lib/actions/deeds.ts` stays a thin authorize → load → apply rule → write layer. Both deed UIs (`realm3d/deed-board.tsx` and the page's `deed-player.tsx`) drive the same pure run-flow reducer. Schema changes are additive columns with defaults in one migration.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching routing or server-action conventions — AGENTS.md), React, Drizzle ORM on Postgres 18, Vitest + jsdom (`node` environment for real-DB tests), three.js via @react-three/fiber for the one scene component.

**Spec:** `docs/superpowers/specs/2026-11-04-realm-playability-design.md` — read it in full before any task; section numbers below (§) refer to it.

## Global Constraints

- **Binding agent rules:** `.superpowers/realm-rules.md`, in full. In particular: one agent at a time; `npx vitest run --maxWorkers=2 <files>` for touched files only, the full suite once before the task's commit; `npx tsc --noEmit` at most twice per task; never `next build`; never import `three` from anything Vitest loads; no `Math.random()`/`Date.now()` in simulation code; new code in new files, shared big files (`spike-scene.tsx`, `realm-game.tsx`, `frame-hud.tsx`, `hud.tsx`, `hud-bus.ts`) get additive one- or two-line edits only.
- **TDD:** red → green → refactor for every behaviour. Each task report quotes the first failing line seen.
- **Foreign files — never touch, stage or write:** `src/app/(app)/tavern/page.tsx`, `src/components/avatar.tsx`, `src/components/avatar-figures.test.tsx`, `src/app/(app)/hud-panel-wrappers.test.ts`, `tsconfig.json`, `AGENTS.md`.
- **Branch:** `realm-playability`. Run `git branch --show-current` before every commit. Never `git stash`. `git add` by name. Each git command on its own line.
- **Commit trailer:** every commit message ends with a second `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- **Child-facing copy never** says "behind", "ahead", "level", "grade", "rung", "review", or "failed".
- **Never rename or reuse a skill id** (`skill_mastery` is keyed by it).
- **Existing guards stay green and unedited in meaning:** `drill-surface-tells.test.ts`, `drill-verify.test.ts`, `drill-generators.test.ts`, `src/lib/db/migrations-journal.test.ts` (if present).
- **The answer, the explanation and the hint never leave the server inside a `ClientQuestion` or `RunStart.questions`.**
- **Numbers pinned by the spec:** first try 2 points, second try 1 point; star thresholds `[0.35, 0.65, 0.9]` of max points; `starsToBuild = 1`; review `maxDue = 2`, `maxTotal = 3`, `intervalDays = [Infinity, 2, 4, 7, 14]` (index = mastery level); challenge 3 questions at `min(level + 1, MASTERY_MAX)`; side-quest length 4–12, default 8; second chances default on; meter `needed = 7` over the last 8 first tries; hint ≤ 160 characters.
- **Schema:** after editing `src/lib/db/schema.ts` run `npm run db:generate` then `npm run db:migrate` (drizzle-kit, `DATABASE_URL` from `.env.local`), commit the generated SQL in `src/lib/db/migrations/`. If a migration or DB write is refused by the environment, STOP and report the exact SQL.

## Review Focus

1. **A resumed run with a second chance open** (child closed the board after a wrong first answer, reopened within the hour): it must reopen on that question with their pick crossed and the hint shown, not on the next question and not with the pick re-enabled. → test in Task 5 (`startDeedRun resumes an open second chance`) and Task 6 (`initialFlow restores pending`).
2. **A run started before this round** (old row: `second_tries` = `'[]'`, `second_chances` = false, `kind` = 'deed', `stars` backfilled): answering, completing and the overview must all work, with no second chances offered. → test in Task 5 (`an old run completes with stars from its first answers only`).
3. **Double submit / out-of-order calls:** a retry sent twice, a retry for a question answered right, a give-up then a retry, a retry with the same choice as the first, a retry with a string not among the choices, `completeDeedRun` with a second chance still open. Each refused with a child-safe message and nothing written. → tests in Task 3 (pure) and Task 5 (action).
4. **`fewerChoices` (2 choices) child:** no second chance ever offered; the wrong answer resolves immediately with the answer and explanation. → tests in Task 3 and Task 6.
5. **A grown-up visiting** (`viewer === "parent"`): sees stars and crowns on the board, can begin nothing, and the challenge button is not rendered. The server refuses a challenge from a non-child actor. → tests in Task 8 and Task 13.

---

### Task 1: Scoring rules

**Files:**
- Create: `src/lib/utils/deed-scoring.ts`
- Test: `src/lib/utils/deed-scoring.test.ts`

**Interfaces:**
- Produces:
  - `type Stars = 0 | 1 | 2 | 3`
  - `type QuestionOutcome = "first" | "second" | "miss"`
  - `type RunKind = "deed" | "challenge"`
  - `const SCORING = { firstTryPoints: 2, secondTryPoints: 1, starThresholds: [0.35, 0.65, 0.9], starsToBuild: 1 } as const`
  - `const CHALLENGE = { questions: 3, levelBoost: 1 } as const`
  - `type RunEffects = { raisesBuilding: boolean; earnsStars: boolean; movesMastery: boolean; countsForSchool: boolean; feedsReview: boolean; allowsSecondChances: boolean }`
  - `const RUN_EFFECTS: Record<RunKind, RunEffects>` — values exactly as the spec §4.6 table (`challenge`: all false).
  - `runPoints(outcomes: readonly QuestionOutcome[]): { points: number; max: number }`
  - `starsFor(points: number, max: number): Stars` — `max <= 0` → 0; uses `>=` against each threshold.
  - `countsTowardBuilding(stars: number): boolean`
  - `isGilded(b: { stars: number; maxStars: number }): boolean` — `maxStars > 0 && stars >= maxStars`.
  - `isRunKind(v: unknown): v is RunKind`

- [ ] **Step 1: Write the failing tests** — `deed-scoring.test.ts`:
  - `runPoints(["first","second","miss"])` → `{ points: 3, max: 6 }`.
  - `starsFor` boundaries for max 16: points 5 → 0, 6 → 1 (0.375), 11 → 2 (0.6875), 14 → 2 (0.875), 15 → 3 (0.9375), 16 → 3; `starsFor(0, 0)` → 0.
  - All-first run of any length 4–12 → 3 stars; all-second run of length 8 → 1 star (spec §4.2).
  - `countsTowardBuilding(0)` false, `(1)` true.
  - `isGilded({stars:9,maxStars:9})` true, `({stars:8,maxStars:9})` false, `({stars:0,maxStars:0})` false.
  - `RUN_EFFECTS.challenge` has every flag false; `RUN_EFFECTS.deed` has every flag true.
- [ ] **Step 2: Run** `npx vitest run --maxWorkers=2 src/lib/utils/deed-scoring.test.ts` — expect FAIL (module not found).
- [ ] **Step 3: Implement** the module.
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Commit** `feat(deeds): scoring rules — points, stars, run kinds`.

### Task 2: Schema, settings fields, and the star backfill

**Files:**
- Modify: `src/lib/db/schema.ts` (`deedRun` ~1098, `realmSettings` ~804)
- Modify: `src/lib/utils/realm-settings.ts`, Test: `src/lib/utils/realm-settings.test.ts`
- Create (generated): `src/lib/db/migrations/0002_*.sql` + meta, then hand-append the backfill.
- Create: `src/lib/db/star-backfill.test.ts`

**Interfaces:**
- Consumes: `SCORING`, `starsFor` (Task 1).
- Produces:
  - `deed_run`: `second_tries text not null default '[]'`, `stars integer not null default 0`, `kind text not null default 'deed'` (drizzle enum `["deed","challenge"]`), `second_chances boolean not null default false`. Drizzle names: `secondTries`, `stars`, `kind`, `secondChances`.
  - `realm_settings`: `side_quest_length integer not null default 8`, `second_chances boolean not null default true`. Drizzle names: `sideQuestLength`, `secondChances`.
  - `RealmSettings` gains `sideQuestLength: number; secondChances: boolean`; `DEFAULT_REALM_SETTINGS` gains `sideQuestLength: 8, secondChances: true`; `export const SIDE_QUEST_LENGTH_RANGE = { min: 4, max: 12 } as const`.
  - `export const STAR_BACKFILL_SQL: string` in `src/lib/db/star-backfill.ts` — the exact statement appended to the migration (so a test can compare it to the file and run it).

- [ ] **Step 1: Write failing settings tests** in `realm-settings.test.ts`: `settingsFromRow({ sideQuestLength: 13 }).sideQuestLength === 8`; `settingsFromRow({ sideQuestLength: 6 }).sideQuestLength === 6`; `settingsFromRow({ secondChances: "yes" }).secondChances === true`; `validateRealmSettingsPatch({ sideQuestLength: 3 })` throws `"Side quests must be 4–12 questions."`; `validateRealmSettingsPatch({ secondChances: false })` → `{ secondChances: false }`; `validateRealmSettingsPatch({ secondChances: 1 })` throws.
- [ ] **Step 2: Run** them — expect FAIL.
- [ ] **Step 3: Implement** the two fields in `realm-settings.ts` following the existing `inRange` / switch convention (reject on write, default on read).
- [ ] **Step 4: Edit `schema.ts`**, run `npm run db:generate` — expect a new `0002_*.sql` adding six columns.
- [ ] **Step 5: Write `src/lib/db/star-backfill.ts`** exporting `STAR_BACKFILL_SQL`:

```sql
UPDATE deed_run SET stars = CASE
  WHEN correct_count * 1.0 / NULLIF(json_array_length(questions::json), 0) >= 0.9 THEN 3
  WHEN correct_count * 1.0 / NULLIF(json_array_length(questions::json), 0) >= 0.65 THEN 2
  WHEN correct_count * 1.0 / NULLIF(json_array_length(questions::json), 0) >= 0.35 THEN 1
  ELSE 0 END
WHERE completed_at IS NOT NULL AND kind = 'deed' AND stars = 0;
```
  (Old runs have no second tries, so points/max = correct/total.) Append it, after a `--> statement-breakpoint` line, to the generated migration file.
- [ ] **Step 6: Write failing `star-backfill.test.ts`** (`// @vitest-environment node`, real Postgres in its own schema `test_star_backfill`, pattern of `src/lib/actions/realm-play-bounty-db.test.ts`): (a) the generated migration file's text contains `STAR_BACKFILL_SQL` verbatim; (b) the thresholds written in `STAR_BACKFILL_SQL` equal `SCORING.starThresholds` (parse the three numbers); (c) against a `deed_run` table created with the new columns, rows with correct/total 8/8, 6/8, 3/8, 2/8, and one incomplete 8/8 come out 3, 2, 1, 0, 0, and a second run of the statement changes nothing. Run it, see it fail before Step 5's file exists, then pass.
- [ ] **Step 7: Run** `npm run db:migrate` — expect success; confirm `\d deed_run` shows the columns (via `.superpowers/tools/db.mjs` or `psql "$DATABASE_URL"`).
- [ ] **Step 8: Commit** `feat(db): deed runs keep stars, second tries and kind; Realm settings for side-quest length and second chances; existing runs get their stars`.

### Task 3: Attempt rules (pure)

**Files:**
- Create: `src/lib/utils/deed-attempts.ts`
- Test: `src/lib/utils/deed-attempts.test.ts`

**Interfaces:**
- Consumes: `QuestionOutcome` (Task 1), `Question` from `drill-generators.ts`, `gradeAnswer` from `deed-engine.ts`.
- Produces:
  - `type AttemptRecord = { first: string | null; second: string | null }` — `second`: `null` none, `""` gave up, otherwise the retry.
  - `type QuestionStatus = "unanswered" | "right-first" | "open" | "right-second" | "missed"`
  - `secondChanceAllowed(q: Pick<Question, "choices">, runAllows: boolean): boolean` — `runAllows && q.choices.length >= 3`.
  - `statusOf(q: Pick<Question, "answer" | "choices">, rec: AttemptRecord, runAllows: boolean): QuestionStatus`
  - `outcomeOf(status: QuestionStatus): QuestionOutcome | null` — unanswered/open → null.
  - `records(responses: (string | null)[], secondTries: (string | null)[]): AttemptRecord[]` — a short or empty `secondTries` (old rows) reads as `null`s.
  - `refuseRetry(q, rec, runAllows, answer: string): string | null` and `refuseGiveUp(q, rec, runAllows): string | null` — return the child-safe refusal message or null when allowed.
  - `resumeIndex(statuses: QuestionStatus[]): number` — first `unanswered` or `open`; if none, last index.

- [ ] **Step 1: Write the failing tests:** `statusOf` for every status; 2-choice question with `runAllows` true and a wrong first → `"missed"` (Review Focus 4); `records(["a"], [])` → `[{first:"a",second:null}]`; `refuseRetry` returns a message for: first unanswered, first right, second already taken, gave up already, `runAllows` false, same answer as first, answer not in choices; returns null for a valid retry. `refuseGiveUp` returns null only when status is `"open"`. `resumeIndex(["right-first","open","unanswered"])` → 1; all resolved → last index.
- [ ] **Step 2: Run** — expect FAIL.
- [ ] **Step 3: Implement.** Refusal messages are plain sentences using `SIDE_QUEST_LOWER` where a noun is needed (e.g. `"That question has already been answered."`, `"Pick one of the answers shown."`).
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(deeds): attempt rules — second chances, give-ups and resume, as pure functions`.

### Task 4: Skill hints

**Files:**
- Create: `src/lib/utils/skill-hints.ts`
- Test: `src/lib/utils/skill-hints.test.ts`

**Interfaces:**
- Produces: `SKILL_HINTS: Readonly<Record<string, string>>`; `GENERIC_HINT: string`; `hintFor(skillId: string): string`.

- [ ] **Step 1: Write the failing test:** for every skill `s` in `SKILLS` that `skillsFor(s.area, g)` returns for at least one `g` in `GRADES`, `SKILL_HINTS[s.id]` exists, is not `GENERIC_HINT`, is ≤ 160 characters, and contains none of the words in the Global Constraints' banned list; `hintFor("no-such-skill") === GENERIC_HINT`.
- [ ] **Step 2: Run** — expect FAIL listing the missing ids.
- [ ] **Step 3: Author one strategy hint per servable skill** (one or two sentences, second person, no specific numbers from any question, e.g. `"mul-facts": "Break the bigger number apart: 7 × 8 is 7 × 4, doubled."` is NOT allowed because it names a fact — prefer `"Break one number into two easier parts, multiply each, then add."`). Read the generator or pool for each skill so the hint fits what is actually asked.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(deeds): a strategy hint for every skill a side quest can serve`.

### Task 5: Server contract — second chances, stars, run kinds

**Files:**
- Modify: `src/lib/actions/deeds.ts`
- Modify: `src/lib/actions/subjects.ts:144-153` (`getSchoolCounts`: add `eq(schema.deedRun.kind, "deed")`)
- Modify: `src/lib/utils/deed-engine.ts` (`BuildRunInput` gains `questionCount?: number`; `toClientQuestion` unchanged — add a test that it drops `explain`)
- Modify: `src/lib/utils/drill-generators.ts:60-67` (`Question` gains `explain?: string`)
- Create: `src/lib/actions/deeds-db.test.ts` (real Postgres, own schema `test_deeds_db`)

**Interfaces:**
- Consumes: Tasks 1–4; `settingsFromRow` fields from Task 2 via `loadRealmSettings` (`src/lib/services/realm-play.ts`).
- Produces (all exported from `actions/deeds.ts`):
  - `type AttemptResult = { correct: boolean; secondChance: boolean; answer?: string; explain?: string; hint?: string; meter?: SkillMeter | null; rungChange?: string | null }` — `answer`/`explain` present only when resolved; `hint` present when `secondChance` is true, and also on a resolved miss with no `explain`. (`meter`/`rungChange` are filled by Task 9; this task declares `export type SkillMeter = { skillLabel: string; filled: number; needed: number }` in `src/lib/utils/mastery.ts` so the field can be typed now.)
  - `answerDeedQuestion(runId: string, index: number, answer: string): Promise<AttemptResult>` (replaces `AnswerResult`; keep `export type AnswerResult = AttemptResult` alias only if something else imports it — grep first, delete if not).
  - `retryDeedQuestion(runId: string, index: number, answer: string): Promise<AttemptResult>`
  - `resolveDeedQuestion(runId: string, index: number): Promise<AttemptResult>`
  - `RunStart` gains `kind: RunKind; pending: { index: number; ruledOut: string; hint: string } | null`.
  - `RunSummary` gains `stars: Stars; previousBest: Stars; counted: boolean; kind: RunKind`; `RunSummary.building` gains `stars: number; maxStars: number` (filled by Task 8; until then `0`/`0`).
  - `startDeedRun(childId, deedId, context = "page", options?: { challenge?: boolean })` — this task ignores `options` except to type it (Task 13 implements it). Snapshots `secondChances: RUN_EFFECTS[kind].allowsSecondChances && settings.secondChances` onto the row and passes `questionCount: settings.sideQuestLength` to `buildDeedRun`. The open-run resume query also filters `kind`.

- [ ] **Step 1: Write failing pure tests** in `deed-engine.test.ts`: `buildDeedRun` honours `questionCount` (4 and 12) over `deed.questionCount`; `toClientQuestion({...q, explain: "x"})` has no `explain` key.
- [ ] **Step 2: Write failing composed tests** in `deeds-db.test.ts` (mock `@/lib/auth/access` as a child actor, `next/cache`, and `@/lib/services/realm-play`'s `loadRealmSettings`; create `deed_run`, `skill_mastery`, `kingdom_progress` tables with the migration's columns; seed one `deed_run` row directly with 4 known 4-choice questions and `second_chances = true`):
  - `answerDeedQuestion` wrong first → result has `secondChance: true`, a `hint`, and **no `answer` and no `explain` key** (`expect("answer" in r).toBe(false)`).
  - `retryDeedQuestion` right → `{ correct: true, secondChance: false, answer }`; `skill_mastery.recent_results` for that skill ends in `false` (mastery read the first try).
  - Each Review Focus 3 case refused with the Task 3 message and the row's `responses`/`second_tries` unchanged.
  - `completeDeedRun` with a second chance open throws.
  - After `resolveDeedQuestion` on an open question → result has `answer`; completing a run of outcomes `[first, second, miss, first]` stores `stars = starsFor(5, 8) = 2` and returns `counted: true`, `previousBest: 0`.
  - A run whose outcomes give 0 stars leaves `kingdom_progress.deeds_done` unchanged and returns `counted: false`.
  - **Review Focus 2:** a row with `second_tries = '[]'`, `second_chances = false` → a wrong answer resolves at once with `answer`, completion works.
  - **Review Focus 1:** `startDeedRun` resuming a run whose question 1 is open returns `pending: { index: 1, ruledOut: <first answer>, hint }`. (Mock `loadHeroLevels` to return an enabled hero; the resume path returns before the engine runs.)
- [ ] **Step 3: Run** `npx vitest run --maxWorkers=2 src/lib/actions/deeds-db.test.ts src/lib/utils/deed-engine.test.ts` — expect FAIL.
- [ ] **Step 4: Implement.** `answerDeedQuestion` / `retryDeedQuestion` / `resolveDeedQuestion` share one private `loadAttemptState(runId)` and one `resultFor(question, status)`; mastery is updated only in `answerDeedQuestion` and only when `RUN_EFFECTS[kind].movesMastery`. `completeDeedRun` computes outcomes via `statusOf`/`outcomeOf`, refuses any `null`, computes `stars` with `runPoints`/`starsFor`, reads `previousBest` with one `max(stars)` query on completed `deed` runs of that deed, writes `stars`, and increments the building only when `RUN_EFFECTS[kind].raisesBuilding && countsTowardBuilding(stars)`. `loadRecentMisses` filters `kind = 'deed'` and reads first answers only.
- [ ] **Step 5: Run** — expect PASS. Then run `src/lib/actions/*.test.ts src/lib/utils/*.test.ts` touched by this task.
- [ ] **Step 6: Commit** `feat(deeds): second chances on the server — the answer stays hidden until the tries are spent; stars on every finished run; a starless run teaches but does not build`.

### Task 6: One run flow for both boards, with the second-chance UI

**Files:**
- Create: `src/lib/utils/deed-run-flow.ts`, Test: `src/lib/utils/deed-run-flow.test.ts`
- Modify: `src/components/realm3d/deed-board.tsx` (`DeedRun` only), Test: `src/components/realm3d/deed-board.test.tsx`
- Modify: `src/components/deed-player.tsx`, Test: `src/components/deed-player.test.tsx`
- Modify: `src/components/deed-results.tsx` (show `summary.stars` as three star icons and "New best!" when `stars > previousBest`; when `!counted && kind === "deed"`: "{villager or 'The village'} will help you try again." — never "failed")
- Modify: the Realm result card in `deed-board.tsx` the same way (share the copy through `talk.ts`: `resultStarsLine(summary): string`).

**Interfaces:**
- Consumes: `RunStart`, `AttemptResult`, `RunSummary` (Task 5).
- Produces:
  - `type FlowPhase = "asking" | "second-chance" | "resolved"`
  - `type FlowState = { index: number; phase: FlowPhase; ruledOut: string[]; picked: string | null; result: AttemptResult | null; streak: number }`
  - `type FlowEvent = { type: "answered"; choice: string; result: AttemptResult } | { type: "next" }`
  - `initialFlow(run: Pick<RunStart, "questions" | "responses" | "pending">): FlowState`
  - `flowReducer(state: FlowState, event: FlowEvent): FlowState` — `answered` with `secondChance` → `second-chance` with the choice added to `ruledOut`; otherwise → `resolved`; `next` → next index, `asking`, cleared. `streak`: +1 on a first-try right, reset to 0 on any first-try miss, unchanged by a retry.
  - `choiceTone(state: FlowState, choice: string): "plain" | "ruled-out" | "answer" | "picked-wrong" | "faded"`.

- [ ] **Step 1: Write failing reducer tests:** each transition; `initialFlow` with `pending` → `{ index: pending.index, phase: "second-chance", ruledOut: [pending.ruledOut] }` (Review Focus 1); streak sequence first-right, first-right, first-wrong→retry-right, first-right → 1, 2, 0, 1; `choiceTone` for each case.
- [ ] **Step 2: Run** — FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5: Write failing component tests** (`deed-board.test.tsx`, `deed-player.test.tsx`, mocking `@/lib/actions/deeds` as those files already do): a wrong first answer shows the hint text and a "Try again" state with the picked choice disabled and marked `aria-disabled`/`data-tone="ruled-out"`, and **no** "The answer was" text; a right retry shows "You got there!"; a "Show me" button calls `resolveDeedQuestion` and then shows the answer and the explanation when present; with 2 choices a wrong answer shows the answer at once (Review Focus 4); number keys 1–4 still answer, and pressing the ruled-out number does nothing.
- [ ] **Step 6: Implement** both components on `flowReducer` (`useReducer`). Copy: first-try right `"That's it! {villager} is pleased."` (Realm) / `"That's it!"` (page); second chance `"Not quite. {hint}"` with a `"Try again"` heading and a `"Show me"` link-button; right retry `"You got there!"`; resolved miss `"The answer was {answer}."` followed by `explain` or the hint.
- [ ] **Step 7: Run** the three test files — PASS.
- [ ] **Step 8: Commit** `feat(deeds): try again with a hint, or show me — both boards run one flow`.

### Task 7: Worked explanations for the grade-3 and grade-6 generators

**Files:**
- Modify: the generator functions behind skill ids `mul-facts`, `div-facts`, `frac-unit`, `area-perimeter`, `round-nearest`, `add-1000`, `sub-1000`, `integer-ops`, `percent-of`, `ratio-rate`, `frac-div`, `eval-expr` (resolve each id to its generator via `SKILLS[].source.generatorId` and `GENERATORS` in `drill-generators.ts`; they live in `src/lib/utils/generators/*.ts` or `drill-generators.ts`).
- Create: `src/lib/utils/drill-explain.test.ts`

**Interfaces:**
- Consumes: `Question.explain` (Task 5).
- Produces: those generators set `explain` on every question they return.

- [ ] **Step 0:** Query the local DB's `learning_profile` for the demo children's math offsets (`node .superpowers/tools/db.mjs "select child_id, math_offset from learning_profile"` or `psql`). If either is non-zero, say so in the report; do not re-target.
- [ ] **Step 1: Capture the baseline before any edit:** a throwaway script (scratchpad, not committed) writes `src/lib/utils/__fixtures__/drill-explain-baseline.json` — for each of the 12 skill ids, seeds 1..50, levels 0..4: `{ id, prompt, choices, answer }`. Commit this fixture with the task.
- [ ] **Step 2: Write the failing test** `drill-explain.test.ts`: (a) for each of the 12 skill ids, seeds 1..200, levels 0..4, `explain` is non-empty, ≤ 200 characters, and contains `answer` verbatim; (b) the generated `{ id, prompt, choices, answer }` for the baseline's seeds and levels equal the fixture exactly (explanations must not shift the seeded sequence or change a question). Run — (a) FAILS, (b) passes.
- [ ] **Step 3: Implement** each explanation from the generator's own parameters, one short worked line, e.g. multiplication `"7 × 8: 7 × 4 = 28, and doubling gives 56."`, percent `"25% of 80 = 80 ÷ 4 = 20."`. Never draw a new random number for the explanation (that would shift the seeded sequence and break the baseline).
- [ ] **Step 4: Run** `drill-explain.test.ts`, `drill-verify.test.ts`, `drill-surface-tells.test.ts`, `drill-generators.test.ts` — all PASS.
- [ ] **Step 5: Commit** `feat(drills): worked explanations for the grade-3 and grade-6 math skills`.

### Task 8: Stars on the board, the overview, and the village's words

**Files:**
- Modify: `src/lib/services/deeds.ts` (`BuildingOverview`, `buildKingdomOverview`, `loadKingdomOverview`), Test: `src/lib/services/deeds.test.ts`
- Modify: `src/lib/actions/deeds.ts` (`completeDeedRun` fills `building.stars`/`maxStars`)
- Modify: `src/lib/realm/kingdom-state.ts` (`applyDeedResult` copies `stars`, `maxStars`, and the deed's new `bestStars`), Test: `kingdom-state.test.ts`
- Modify: `src/lib/realm3d/talk.ts` (finished-building `need` line; `deedToast` for an uncounted run), Test: `talk.test.ts`
- Modify: `src/components/realm3d/deed-board.tsx` (stars per deed in the list), Test: `deed-board.test.tsx`

**Interfaces:**
- Consumes: Task 5's summary fields.
- Produces:
  - `type DeedBest = { deedId: string; bestStars: Stars; crowned: boolean }`
  - `loadDeedBest(childId: string): Promise<DeedBest[]>` in `services/deeds.ts` — one grouped query: `max(stars) filter (where kind='deed' and completed_at is not null)`, `bool_or(kind='challenge' and flawless and completed_at is not null)`, grouped by `deed_id`.
  - `buildKingdomOverview(progress, tone, best: readonly DeedBest[] = [])` — deeds gain `bestStars`, `crowned`; building gains `stars` (sum) and `maxStars` (3 × deed count).
  - `applyDeedResult(state, buildingId, result: BuildingProgress & { stars?: number; maxStars?: number }, deed?: { id: string; bestStars: Stars })`.
  - `RunSummary.building.stars/maxStars` and `RunSummary.deedBest: Stars` (best after this run).
  - `talk.ts`: `starsLeftLine(site: { stars: number; maxStars: number }): string` — `"{n} more stars to earn here."` / `"Every star here is yours."`.

- [ ] **Step 1: Write failing tests:** `buildKingdomOverview` with best rows → well (3 deeds) `maxStars: 9`, `stars` = sum, a deed with no runs `bestStars: 0`; `applyDeedResult` copies stars and the deed's best; `talkCopy` for a complete site with stars 7/9 says `"2 more stars to earn here."` and no longer contains `"for practice"`; `deedToast` when the run did not count: title `"{villager} will help you try again."`-style, `rose: false`, no "rising" text; the board renders three star icons per deed with `aria-label="2 of 3 stars"`; a parent viewer sees the stars and no Begin (Review Focus 5).
- [ ] **Step 2: Run** — FAIL. **Step 3:** implement. **Step 4:** PASS (plus `realm-game.test.tsx` and `deed-picker.test.tsx`, which consume `BuildingOverview`).
- [ ] **Step 5: Commit** `feat(realm): stars on every side quest — best kept, shown on the board, and a finished building says what is left to earn`.

### Task 9: Streak and skill meter

**Files:**
- Modify: `src/lib/utils/mastery.ts`, Test: `mastery.test.ts`
- Modify: `src/lib/actions/deeds.ts` (`answerDeedQuestion` fills `meter`, `rungChange`)
- Modify: `src/components/realm3d/deed-board.tsx`, `src/components/deed-player.tsx` and their tests
- Create: `src/components/deed-meter.tsx` (shared pips + streak flame; plain DOM, CSS class names `deed-meter*`), Test: `deed-meter.test.tsx`

**Interfaces:**
- Produces:
  - `progressToNextRung(state: MasteryState): { filled: number; needed: number } | null` — `null` at `MASTERY_MAX`; `needed` and the window come from the same constants `recordResult` uses (extract `UP_WINDOW = 8`, `UP_NEED = 7`, `DOWN_WINDOW = 6`, `DOWN_NEED = 3` as module constants and use them in both).
  - `SkillMeter` (declared in Task 5 in `mastery.ts`).
  - `<DeedMeter meter={SkillMeter | null} streak={number} calm={boolean} />`

- [ ] **Step 1: Write failing tests:** `progressToNextRung({level:1,recentResults:[true,false,true]})` → `{filled:2,needed:7}`; at level 4 → null; `recordResult` behaviour unchanged (existing tests stay green); `DeedMeter` renders `needed` pips with `filled` lit, the skill label, no digits for level, the flame only when `streak >= 2`, and no animation class when `calm`; `answerDeedQuestion` (db test) returns `meter` for a deed run and `rungChange: "Multiplication facts: getting stronger!"` on a promotion.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(deeds): a streak and a meter that fills toward the next step, during the run`.

### Task 10: Keep-it-sharp review

**Files:**
- Create: `src/lib/utils/review-schedule.ts`, Test: `review-schedule.test.ts`
- Modify: `src/lib/utils/deed-engine.ts` (`BuildRunInput.dueSkillIds?: string[]`; `MAX_REVIEW` replaced by `REVIEW.maxTotal` budget), Test: `deed-engine.test.ts`
- Modify: `src/lib/actions/deeds.ts` (compute `dueSkillIds` from rows already loaded)

**Interfaces:**
- Produces:
  - `const REVIEW = { maxDue: 2, maxTotal: 3, intervalDays: [Infinity, 2, 4, 7, 14] } as const`
  - `dueSkills(rows: readonly { skillId: string; level: number; lastPracticedAt: number | null }[], candidateIds: readonly string[], excludeIds: readonly string[], now: number): string[]` — candidates only, not excluded, level ≥ 1, `now - lastPracticedAt >= intervalDays[level] days`; most overdue (ratio of elapsed to interval) first; capped at `REVIEW.maxDue`.
- [ ] **Step 1: Write failing tests:** `dueSkills` cases (level 0 never due; level 2 at 3 days not due, at 4 days due; excluded skipped; ordering by overdue ratio; cap 2; `lastPracticedAt: null` never due). `buildDeedRun` with `dueSkillIds: ["div-facts"]` on a mul deed run at grade 3 → exactly `questionCount` questions, at least one with `skillId === "div-facts"`, `skillIds` includes `"div-facts"`; with 2 recent misses and 2 due skills → at most 3 non-fresh questions total; a challenge-shaped input (`dueSkillIds: []`, `recentMisses: []`) has none.
- [ ] **Step 2–4:** FAIL → implement (due questions drawn by the existing `drawGenerated`/`drawPool` at the skill's own level; `chooseSkills(deed, grade)` gives the candidate list; selected skills are excluded) → PASS, including `drill-surface-tells.test.ts` and `drill-verify.test.ts`.
- [ ] **Step 5: Commit** `feat(deeds): skills a child has learned come back on a widening schedule`.

### Task 11: Parent settings panel

**Files:**
- Modify: `src/app/(app)/settings/realm-settings-panel.tsx`, Test: `realm-settings-panel.test.tsx`

**Interfaces:**
- Consumes: `sideQuestLength`, `secondChances`, `SIDE_QUEST_LENGTH_RANGE` (Task 2); `updateRealmSettings` (unchanged, already grown-up only).
- [ ] **Step 1: Write failing tests:** the panel shows "Questions in a side quest" (number input or select 4–12, current value) and "Second chances" (switch, with help text "A wrong first answer gets a hint and one more try."); changing each calls `updateRealmSettings` with exactly `{ sideQuestLength: n }` / `{ secondChances: b }`.
- [ ] **Step 2–4:** FAIL → implement following the panel's existing controls → PASS.
- [ ] **Step 5: Commit** `feat(settings): grown-ups choose side-quest length and second chances`.

### Task 12: Gilded buildings and the post-build goal

**Files:**
- Modify: `src/lib/realm/objective.ts` (`ObjectiveState` gains `{ kind: "stars"; objectives: Objective[] }`; `hasObjectives(state)`; `objectiveState` returns `stars` when all complete and any building has `stars < maxStars`; `riseToast`, `objectiveSpeech` handle it), Test: `objective.test.ts`
- Modify: `src/lib/realm/layout.ts` (`SiteProgress` and `VillagerPlacement` gain optional `stars?: number; maxStars?: number`)
- Modify: `src/lib/realm3d/plate-anchors.ts` (a built villager's anchor gains `stars: { have: number; max: number }` when `maxStars > 0`) and the plate DOM component that renders `progress` (find it via `grep -rn "progress" src/components/realm3d/*plate*` / `hud-driver.tsx`), Tests beside them.
- Modify: `src/components/realm3d/frame-hud.tsx:156-163` and `realm-game.tsx:253` — additive: use `hasObjectives`, tab text `"Earn stars"` for `kind === "stars"`.
- Create: `src/components/realm3d/gilded-pennants.tsx` (scene component: given `layout` and `gilded: readonly string[]`, draws a gold pennant on a pole above each matching `layout.props` entry with `kind === "building"`; one shared geometry and material, created once).
- Modify: `spike-scene.tsx` (one prop `gilded` on `RealmCanvasProps`, one mount line), `realm-game.tsx` (compute `gilded` with `useMemo` keyed on the joined ids so the prop is referentially stable; `__realmRaise` result type gains optional `stars`, `maxStars`), `src/lib/realm3d/overrides.ts` (`gildedFor(ids: string[], q: Query, dev: boolean): string[]` — `?gilded=well,mill` adds ids in dev only), Test: `overrides.test.ts`.
- Update the existing test that asserts every `World`/canvas prop is referentially stable to include `gilded`.

**Interfaces:**
- Consumes: `isGilded` (Task 1), overview `stars`/`maxStars` (Task 8).
- Produces: `hasObjectives(s: ObjectiveState): s is Extract<ObjectiveState, { objectives: Objective[] }>`.

- [ ] **Step 1: Write failing tests:** all complete with one building at 7/9 → `{kind:"stars", objectives:[that building]}` with `done: 7, total: 9`; all at max → `"complete"`; buildings without `maxStars` (old callers) → `"complete"` as before; `objectiveSpeech` for stars → `"Every building stands. There are stars to earn at the Mill. Miller Tessa is waiting."` (exact copy pinned here); `riseToast` when next is stars → `"The Mill stands. Every building is built — there are stars to earn at the Well."`; `gildedFor` in prod ignores the query; plate anchor for a built 9/9 villager carries `stars: {have:9,max:9}`; frame-hud renders "Earn stars" for the stars kind; canvas-prop stability test includes `gilded`.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Browser check (keys only, never click the canvas):** agent dev server per the rules, `look.mjs` with `?gilded=well&at=<well x,z>`; open the screenshot and confirm a pennant is visible; stop the server by process group.
- [ ] **Step 6: Commit** `feat(realm): a building whose stars are all earned flies a gold pennant, and a built village points at stars still to earn`.

### Task 13: The Crown Challenge

**Files:**
- Modify: `src/lib/actions/deeds.ts` (`startDeedRun` `options.challenge`), `deeds-db.test.ts`
- Modify: `src/lib/utils/deed-engine.ts` (`BuildRunInput.levelBoost?: number`, applied as `min(level + boost, MASTERY_MAX)` in draws), `deed-engine.test.ts`
- Modify: `src/components/realm3d/deed-board.tsx` (a "Crown Challenge" button on a deed with `bestStars === 3`, only for a child viewer; a crown seal when `crowned`), `deed-board.test.tsx`
- Modify: `src/lib/realm3d/talk.ts` (challenge result headline: `"Crowned!"` when flawless, else `"So close — try the challenge again any time."`)

**Interfaces:**
- Consumes: `CHALLENGE`, `RUN_EFFECTS` (Task 1), `loadDeedBest` (Task 8).
- [ ] **Step 1: Write failing tests:** a challenge start when best stars < 3 throws `"Earn three stars on this side quest first."` and inserts nothing; from a grown-up actor throws `HERO_ONLY` (Review Focus 5); a challenge run has `CHALLENGE.questions` questions, `kind: "challenge"`, `second_chances: false`; answering in it leaves `skill_mastery` untouched; completing it leaves `kingdom_progress` and `stars` untouched and returns `kind: "challenge"`; `getSchoolCounts` does not count it; `loadRecentMisses` does not return its misses; `buildDeedRun` with `levelBoost: 1` draws at level+1 (capped at 4); the board shows the button only at 3 stars and only to a child; `crowned` shows the seal.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(realm): the Crown Challenge — three harder questions for a side quest with every star`.

### Task 14: Whole-branch verification

- [ ] **Step 1:** `ps aux | grep -E "vitest|next dev" | grep -v grep` — nothing of yours running.
- [ ] **Step 2:** `npx vitest run --maxWorkers=2` — all green. `npx tsc --noEmit` — clean. `npx eslint src` — only the known pre-existing error at `src/components/quest-template-list.tsx:70` (if it still exists).
- [ ] **Step 3: Browser pass** (agent dev server, `PERSONA=lily`, keys and `page.evaluate` only, never click the canvas): open a villager's board, begin a side quest, answer one wrong (find a wrong choice via `window.__realmBus` or by reading the DOM after a right one), confirm the hint and crossed pick, retry, finish; screenshot the result card's stars, the board's stars, and a gilded building. Open and look at each image.
- [ ] **Step 4:** Stop the dev server by process group; `rm -rf .next-agent`.
- [ ] **Step 5:** Request the whole-branch review (superpowers:requesting-code-review) and fix what it finds, one commit per fix.
