# The Realm, woven into the schoolwork: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tie real quests to the Realm (subject materials that build wings, plaques and a Chronicle) and make the Realm's learning hands-on (measuring, logic locks, reading trails, rune spellcraft), on one task framework that scales K–12.

**Architecture:**
- A run's questions become **tasks** with a `kind`.
- A typed registry (`TASK_KINDS`, pure) owns each kind's view, response parsing, checking and second-chance rule. A presenter registry (`TASK_PRESENTERS`, client) owns each kind's work surface.
- Scoring, stars, mastery and review stay kind-agnostic.
- Six slices ship in order. Each one leaves the app working and merges into `dev` on its own branch.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, TypeScript, Drizzle on Turso/libSQL, Vitest + Testing Library, React Three Fiber (scene components only).

**Spec:** `docs/superpowers/specs/2026-11-10-realm-learning-woven-in-design.md`. Read it first; this plan argues from it.

**How this plan is laid out:**
- **Part A** is the programme: all six slices, what each ships and its ship bar.
- **Part B** is slice 1 in full task detail.
- Slices 2–6 get their detailed task lists appended (Part C onward) at the start of each slice, written against the code the previous slice actually left. Writing them now would guess at interfaces slice 1 is about to create.

## Global Constraints

- A child is never told they are "behind" or "ahead" (`2026-09-14-grade-appropriate-content`).
- **Additive and local edits only** to `realm-game.tsx`, `spike-scene.tsx`, `frame-hud.tsx`, `hud.tsx` and `hud-bus.ts`. New UI goes in new files; add bus and prop fields, never rename them (`.superpowers/realm-rules.md`).
- Nothing under Vitest imports `three`. No `Math.random()` or `Date.now()` in simulation or generators: seeded `Rng` only.
- Vitest runs with `--maxWorkers=2`. Run only the touched test files while working, and the full suite once before the slice's final commit. Never run `next build`.
- Schema changes: edit `schema.ts`, then `npm run db:generate` and `npm run db:migrate`, and commit the generated migration. Test every new migration on a copy of the latest weekly production backup before merging to `main` (as done for `0037`).
- **Catalog ids** (skills, deeds, kinds, materials, improvements, places) are never reused or renamed.
- **Settings:** lenient read (an out-of-range stored value reads as the default) and strict write (bad input is rejected).
- **Authorization:** every action authorizes with `requireChildAccess(childId, { write })`. Realm runs are the hero's alone (`isChildActor`). Settings and focus skills are grown-up only.
- **The server decides "today"** (`realmNow`); client dates are never trusted.
- **A task's solution never reaches the browser** before the task is resolved.
- **No new way to earn minutes** (spec §4.10). Only side quests (by stars), real quests, the daily allowance and the trouble bounty pay.
- Lint baseline: exactly one pre-existing error in `src/components/quest-template-list.tsx`, which is not ours.

## Review Focus

1. **A run started before the deploy and resumed after it** (stored questions have no `kind`) must resume, take answers and complete exactly as before. Pinned in Task 3.
2. **A malformed or oversized answer** (an object, a number, a 10,000-character string) sent to the answer or retry action must be refused, with nothing written and no mastery moved. Pinned in Task 3.
3. **A brand-new child with no mastery history:** riddle stones don't glow, and "Quick review" says there is nothing to review yet instead of erroring. Pinned in Task 10.
4. **A focus skill that later falls outside the child's grade window, or a stored id that isn't in the catalog,** is ignored when reading, and runs still build. Pinned in Task 14.
5. **Two tabs finishing the same review run** complete it once, with one summary and no double mastery. Pinned in Task 10.

---

# Part A: The programme

| Slice | Branch | Ships | Ship bar |
|---|---|---|---|
| 1 | `realm-tasks-framework` | Task and presenter registries, with `choice` as the first kind; `parseAnswer`; pace guard; `Deed.mechanic`; run ownership (`review` runs, nullable `deed_id`); riddle stones at the 5 named places; Quick review on the Side Quests page; focus skills (table, panel, engine weight, beacon preference). | All existing deed, gate and page flows behave as before. Riddle stones and Quick review work end to end. Focus skills change what's drawn. |
| 2 | `realm-measure` | `measure` kind (assemble and cut), bench generators per math skill, Aldo's bench presenter, site pieces placed per solved task, notation bridge, repair scaffold at finished buildings, math deeds become `measure`, demo-first for grades K–3, mechanic toggles (`realm_settings.mechanics` and the panel). | At least two bench skills per grade from K to 12; existing math deeds stay playable when the toggle is off. |
| 3 | `realm-real-work` | Materials (catalog, `subject.material`, ledger, minting in `completeAssignment`, the welcome-delivery script), quest-card and Tavern pull, improvements and `build` runs, plaques, stockpile, delivery card, Chronicle hall with drawings and seals, villager mentions, quieter minutes, and slice 13's D13.1–D13.5 for core buildings. | Concurrent completions mint once; concurrent builds never overspend; the migration and welcome delivery are tested on a production backup copy. |
| 4 | `realm-locks` | `lock` kind (pattern, grid, cage, sort), `logic` area and skills, sort pools, `realm_world_state`, chests/doors/gates with cycling, science deeds become `lock`, the Puzzle Tower. | Every lock generator's output is solvable (checked by a constraint solver in tests); sort pools pass the validator and blind pass. |
| 5 | `realm-trails` | `trail` kind, world anchors, trail pools for k1–g912, walking-run tracker, picture runs off-world, narration, reading deeds become `trail`, `read-g6`/`read-g9` skills. | Every anchor id a pool references exists in the layout (test); a week of daily play per band without repeats. |
| 6 | `realm-runes` | `rune` kind, rune stone presenter, at least 12 cycling rune objects, `RUNE_WORDS` pools by band, walking and picture runs, language deeds become `rune`, `spell-g1` skill. | Every effect has accepted words for every band; tiles always contain the word. |

**Spec adjustment made by this plan (slice 1):** run ownership uses the existing `deed_run.kind` for the run's type (`deed`, `challenge`, `review`; later `build`, `world`, `tower`) plus a nullable text column `source_ref` for what owns it (a place id, an improvement id plus level, an object id). That replaces the spec's JSON `source` column with two plain columns that say the same thing. Update spec §4.1 and §5 in Task 8's commit.

**Moved from slice 1 to slice 2 (YAGNI):** the demo-first rule and the per-mechanic toggles. Both do nothing until a hands-on kind exists, so they land with `measure`, which is the first kind to use them. Slice 2's row above already lists them.

---

# Part B: Slice 1, the task framework and focus skills

**Branch:** `realm-tasks-framework`, cut from `dev`.

## File map

| File | Responsibility |
|---|---|
| `src/lib/tasks/types.ts` (new) | `TaskKind`, the `TaskByKind`/`ViewByKind`/`ResponseByKind` maps, `Task`, `ClientTask`, `FeedbackCode`, `TaskKindDef` |
| `src/lib/tasks/choice.ts` (new) | the `choice` kind's definition (today's multiple choice) |
| `src/lib/tasks/registry.ts` (new) | `TASK_KINDS`, `kindOf`, `taskDef`, `toClientTask`, `isTaskCorrect`, `kindForSkill` |
| `src/lib/tasks/parse-answer.ts` (new) | typed numeric answers → exact rationals; equality with tolerance |
| `src/lib/tasks/pace-guard.ts` (new) | the rapid-guess nudge rule |
| `src/components/tasks/choice-presenter.tsx` (new) | the choice work surface, extracted from `deed-board.tsx` and `deed-player.tsx` |
| `src/components/tasks/presenters.tsx` (new) | `TASK_PRESENTERS` and `TaskPresenter` |
| `src/lib/utils/deed-attempts.ts` | attempt rules over any task (via the registry) |
| `src/lib/utils/deed-engine.ts` | `Deed.mechanic` pass-through; export `drawForSkill`; focus weighting |
| `src/lib/utils/deeds.ts` | `Deed.mechanic` on every deed |
| `src/lib/utils/deed-scoring.ts` | `RunKind` gains `review`; `RUN_EFFECTS.review` |
| `src/lib/utils/deed-run-types.ts` | `ClientTask[]`; nullable area; optional building on the summary |
| `src/lib/utils/review-run.ts` (new) | `buildReviewRun`, the pure riddle-stone and Quick review builder |
| `src/lib/actions/deeds.ts` | answer and retry take raw responses; `completeDeedRun` handles `review` |
| `src/lib/actions/review.ts` (new) | `startReviewRun`, `getReviewDue` |
| `src/lib/realm/riddle-stones.ts` (new) | `RIDDLE_STONES` (one per place), positions and copy |
| `src/lib/realm3d/interact.ts`, `src/lib/realm3d/hud-bus.ts` | the `riddle` interact target (additive) |
| `src/components/realm3d/riddle-stones.tsx` (new) | the stones in the scene, glowing when due |
| `src/components/realm3d/riddle-stone-board.tsx` (new) | the board a stone opens (plays a review run) |
| `src/lib/db/schema.ts` | `deed_run.deed_id` nullable, `deed_run.source_ref`, the `learning_focus` table |
| `src/lib/services/learning-focus.ts` (new) | read the focus skills (lenient) |
| `src/lib/actions/learning-focus.ts` (new) | `setFocusSkills` (grown-up, strict) |
| `src/lib/utils/focus.ts` (new) | `FOCUS_MAX`, `FOCUS_WEIGHT`, `focusWindow`, `validFocus` |
| `src/app/(app)/settings/focus-skills-panel.tsx` (new) | the picker |
| `src/lib/realm/objective.ts` | beacon preference for focus areas |

### Task 1: The task kind registry, with `choice`

**Files:**
- Create: `src/lib/tasks/types.ts`, `src/lib/tasks/choice.ts`, `src/lib/tasks/registry.ts`
- Test: `src/lib/tasks/registry.test.ts`

**Interfaces:**
- Produces:
  - `type TaskKind = "choice"`. Later slices widen the union by adding a key to each `…ByKind` map.
  - The maps:
    - `TaskByKind = { choice: ChoiceTask }`, with `ChoiceTask = Question & { kind?: "choice" }`. Stored runs have no `kind`.
    - `ViewByKind = { choice: { prompt: string; choices: string[] } }`
    - `ResponseByKind = { choice: string }`
  - `Task = TaskByKind[TaskKind]`.
  - `ClientTask = { [K in TaskKind]: { kind: K; id: string; skillId: string; readAloud?: string; view: ViewByKind[K] } }[TaskKind]`.
  - `type FeedbackCode = "none"`, widened by later kinds.
  - `interface TaskKindDef<K extends TaskKind>` with these members:
    - `toView(t: TaskByKind[K]): ViewByKind[K]`
    - `parseResponse(raw: unknown, t: TaskByKind[K]): ResponseByKind[K] | null`
    - `encode(r: ResponseByKind[K]): string`
    - `decode(s: string): ResponseByKind[K] | null`
    - `isCorrect(t: TaskByKind[K], r: ResponseByKind[K]): boolean`
    - `allowsSecondChance(t: TaskByKind[K]): boolean`
    - `sameResponse(a: ResponseByKind[K], b: ResponseByKind[K]): boolean`
    - `answerText(t: TaskByKind[K]): string`
    - `feedback(t: TaskByKind[K], r: ResponseByKind[K]): FeedbackCode`
    - `presents(skillId: string): boolean`
  - `TASK_KINDS: { [K in TaskKind]: TaskKindDef<K> }`.
  - `kindOf(t: Task): TaskKind` (absent → `"choice"`).
  - `toClientTask(t: Task): ClientTask`.
  - `isTaskCorrect(t: Task, stored: string): boolean`, which decodes and then checks.
  - `kindForSkill(mechanic: TaskKind, skillId: string, enabled: ReadonlySet<TaskKind>): TaskKind`.

- [ ] **Step 1: Write the failing tests** in `registry.test.ts`:
  - `kindOf({ ...q })` is `"choice"` for a `Question` with no `kind`.
  - `toClientTask(q)` deep-equals `{ kind: "choice", id, skillId, readAloud, view: { prompt, choices } }` and has no `answer` or `explain` anywhere (`JSON.stringify` contains neither the answer key nor the explain text).
  - Choice `parseResponse`:
    - `"6"` → `"6"`
    - `" 6 "` → `"6"`
    - `"7"` when `"7"` is not among the choices → `null`
    - `42` → `null`; `{}` → `null`; a 10,001-character string → `null`
  - `isTaskCorrect(q, " 6")` is true when the answer is `"6"`.
  - `allowsSecondChance`: false with 2 choices, true with 4.
  - `kindForSkill("choice", "add-10", new Set())` is `"choice"`.

- [ ] **Step 2: Run** `npx vitest run src/lib/tasks/registry.test.ts --maxWorkers=2`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the three files. Choice's `isCorrect` and `encode` must match today's `gradeAnswer` (trimmed equality), so stored responses keep grading the same. `parseResponse` caps strings at `MAX_RESPONSE_CHARS = 200`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(tasks): a task-kind registry with multiple choice as its first kind`.

### Task 2: Attempt rules over any task

**Files:**
- Modify: `src/lib/utils/deed-attempts.ts` (`secondChanceAllowed`, `statusOf`, `refuseRetry`, `refuseGiveUp`)
- Test: `src/lib/utils/deed-attempts.test.ts` (existing, must pass unchanged) plus new cases

**Interfaces:**
- Consumes: `taskDef`, `isTaskCorrect` and `kindOf` (Task 1).
- Produces: the same exported names, now typed over `Task`:
  - `secondChanceAllowed(t: Task, runAllows: boolean)`
  - `statusOf(t: Task, rec: AttemptRecord, runAllows: boolean)`
  - `refuseRetry(t: Task, rec: AttemptRecord, runAllows: boolean, raw: unknown): string | null`
  - `refuseGiveUp(t, rec, runAllows)`

- [ ] **Step 1: Add failing cases:**
  - `refuseRetry(choiceTask, rec, true, 5)` → `PICK_SHOWN` (a non-string response is never a pick).
  - `refuseRetry(...)` with a retry equal to the first pick after trimming → `TRY_DIFFERENT` (`sameResponse`).
- [ ] **Step 2: Run** `npx vitest run src/lib/utils/deed-attempts.test.ts --maxWorkers=2`. Expected: the new cases FAIL; the old ones PASS.
- [ ] **Step 3: Implement.** Route correctness through `isTaskCorrect`, the second-chance rule through `allowsSecondChance`, and "is this a valid pick" through `parseResponse(raw) !== null`. Keep the refusal copy constants as they are.
- [ ] **Step 4: Run** the file. Expected: all PASS.
- [ ] **Step 5: Commit**: `refactor(deeds): attempt rules ask the task's kind, not the choice list`.

### Task 3: Actions take raw responses; the browser gets `ClientTask`s

**Files:**
- Modify: `src/lib/actions/deeds.ts` (`parseRun`, `resultFor`, `answerDeedQuestion`, `retryDeedQuestion`, `startDeedRun`)
- Modify: `src/lib/utils/deed-run-types.ts`
- Modify: `src/lib/utils/deed-run-flow.ts` (`RunStart` type only)
- Test: `src/lib/actions/deeds-db.test.ts` (existing must pass) plus new cases

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `answerDeedQuestion(runId: string, index: number, response: unknown): Promise<AttemptResult>`
  - `retryDeedQuestion(runId: string, index: number, response: unknown): Promise<AttemptResult>`
  - `RunStart.questions: ClientTask[]`
  - `AttemptResult` gains `feedback?: FeedbackCode`. `answer` stays the display string, from `answerText`.

- [ ] **Step 1: Write the failing DB tests** in `deeds-db.test.ts`:
  - `"a run stored before tasks had kinds resumes, answers and completes"`: seed `deed_run.questions` with today's `Question` JSON, no `kind`. `startDeedRun` resumes it; `answerDeedQuestion(run, 0, "6")` grades it; `completeDeedRun` returns stars as before.
  - `"a malformed answer is refused and writes nothing"`: for each of `{}`, `42`, `"x".repeat(10_001)`, `answerDeedQuestion` rejects. Afterwards `stored().responses` is unchanged and `skill_mastery.attempt_total` is unchanged.
  - `"the browser never sees an answer before resolution"`: `JSON.stringify(start.questions)` contains no `"answer"` key.
- [ ] **Step 2: Run** `npx vitest run src/lib/actions/deeds-db.test.ts --maxWorkers=2`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - `parseRun` reads `Task[]`.
  - Answer and retry run `parseResponse` first and throw `PICK_SHOWN` on `null`, before any write.
  - Responses are stored with `encode`. `correctCount` uses `isTaskCorrect`.
  - `resultFor` uses `answerText`.
  - `startDeedRun` returns `built.questions.map(toClientTask)`.
- [ ] **Step 4: Run** the DB file, `deed-board.test.tsx` and `gate-quest-board.test.tsx`. Expected: PASS once Task 4's presenters exist. Until then, keep the `deed-board`/`deed-player` compile by reading `task.view.choices`.
- [ ] **Step 5: Commit**: `feat(deeds): answers are parsed by their task kind; the browser gets views, never solutions`.

### Task 4: The presenter registry, with the choice surface extracted

**Files:**
- Create: `src/components/tasks/choice-presenter.tsx`, `src/components/tasks/presenters.tsx`
- Modify: `src/components/realm3d/deed-board.tsx` (the choice list around lines 256–420), `src/components/deed-player.tsx` (around lines 60–140)
- Test: `src/components/tasks/presenters.test.tsx`; the existing `deed-board.test.tsx`, `gate-quest-board.test.tsx` and `deed-player` tests must pass

**Interfaces:**
- Consumes: `ClientTask`, `FlowState` and `choiceTone` (from `deed-run-flow.ts`, unchanged).
- Produces:
  - `type PresenterProps<K extends TaskKind> = { task: Extract<ClientTask, { kind: K }>; flow: FlowState; variant: "board" | "page"; numerals: boolean; disabled: boolean; onRespond(response: ResponseByKind[K]): void }`
  - `TASK_PRESENTERS: { [K in TaskKind]: ComponentType<PresenterProps<K>> }`
  - `TaskPresenter(props: PresenterProps<TaskKind>)`, which dispatches on `task.kind`.

- [ ] **Step 1: Write the failing test** in `presenters.test.tsx`:
  - `TaskPresenter` with a choice task renders one button per choice, labelled by the choice text.
  - Clicking calls `onRespond("6")`.
  - With `flow.ruledOut = ["5"]`, the "5" button is disabled.
  - Number keys 1–4 still pick in the `board` variant, which is today's behavior at `deed-board.tsx:312`.
- [ ] **Step 2: Run** the test. Expected: FAIL.
- [ ] **Step 3: Implement.** Move the choice rendering and key handling from both players into `ChoicePresenter`. The `variant` prop keeps each player's existing class names, so the CSS is unchanged. Both players render `<TaskPresenter …/>`.
- [ ] **Step 4: Run** the new test plus `deed-board.test.tsx`, `gate-quest-board.test.tsx` and `realm-game.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit**: `refactor(deeds): one choice surface behind a presenter registry, used by the board and the page`.

### Task 5: Typed numeric answers (`parseAnswer`)

**Files:**
- Create: `src/lib/tasks/parse-answer.ts`
- Test: `src/lib/tasks/parse-answer.test.ts`

**Interfaces:**
- Produces:
  - `type Rational = { n: bigint; d: bigint }` (normalised, `d > 0`)
  - `parseAnswer(text: string): Rational | null`
  - `sameValue(a: Rational, b: Rational, tolerance?: Rational): boolean`
  - `formatRational(r: Rational, as: "fraction" | "mixed" | "decimal"): string`

- [ ] **Step 1: Write the failing table test.** These all parse equal to 3/4: `"3/4"`, `"0.75"`, `".75"`, `" 6/8 "`. Further cases:
  - `"1 1/2"` = 3/2; `"-2"` = -2/1; `"1,000"` = 1000.
  - `"1/0"`, `"abc"`, `"1//2"`, `""` and a 51-character string → `null`.
  - `sameValue(parse("0.333"), {n:1n,d:3n}, {n:1n,d:100n})` → true.
  - `formatRational({n:3n,d:2n},"mixed")` → `"1 1/2"`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Use `bigint` arithmetic and a gcd reduction. The input cap is 50 characters. Parse integers, decimals, `a/b` and `w a/b` only; no expressions in slice 1.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(tasks): parseAnswer reads typed numbers, fractions and mixed numbers exactly`.

### Task 6: The pace guard

**Files:**
- Create: `src/lib/tasks/pace-guard.ts`
- Modify: `src/components/use-deed-flow.ts` (record each first answer's time and correctness; expose `nudge: boolean`)
- Modify: `src/components/tasks/presenters.tsx`, which shows the nudge line and the skill hint above the surface when `nudge`
- Test: `src/lib/tasks/pace-guard.test.ts`, `src/components/use-deed-flow.test.ts` (new case)

**Interfaces:**
- Produces:
  - `PACE = { misses: 3, windowMs: 10_000 } as const`
  - `shouldNudge(history: readonly { at: number; correct: boolean }[]): boolean`
  - `NUDGE_LINE = "Slow down, friend. Read it once more. Here's a clue."`
  - The squire's copy (exact text): "Slow down, friend. Read it once more. Here's a clue."

- [ ] **Step 1: Failing tests:**
  - Three misses at t = 0, 3 s, 6 s → true.
  - Three misses at t = 0, 6 s, 12 s → false.
  - Two misses and a right answer within 5 s → false.
  - The flow hook sets `nudge` after the third fast miss, and clears it on the next correct answer.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Timestamps come from the browser's clock inside the hook (this is UI-only and never sent to the server). The hint comes from `hintFor(skillId)` (`src/lib/utils/skill-hints.ts`).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(deeds): a gentle nudge and a clue after fast wrong answers`.

### Task 7: `Deed.mechanic` and `kindForSkill` in the engine

**Files:**
- Modify: `src/lib/utils/deeds.ts` (the `Deed` type, plus `mechanic: "choice"` on all 20 deeds)
- Modify: `src/lib/utils/deed-engine.ts` (`buildDeedRun` tags each built task with `kindForSkill(deed.mechanic, skillId, enabled)`; slice 1 always yields `choice`). Export `drawForSkill(skill: Skill, level: number, count: number, rng: Rng, poolItems: PoolItem[], excludeIds: Set<string>, excludePrompts: Set<string>): Question[]`, which wraps today's internal `drawGenerated`/`drawPool`.
- Test: `src/lib/utils/deeds.test.ts` and `src/lib/utils/deed-engine.test.ts`

**Interfaces:**
- Produces:
  - `Deed.mechanic: TaskKind`
  - `BuildRunInput.enabledKinds?: ReadonlySet<TaskKind>` (default: every kind)
  - `drawForSkill` (above)

- [ ] **Step 1: Failing tests:**
  - Every `DEEDS` entry has a `mechanic` that is a key of `TASK_KINDS`.
  - `buildDeedRun` output equals the pre-change output for a fixed seed (snapshot the ids of three seeds before editing).
  - `drawForSkill` returns `count` distinct questions for a generator skill.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `deeds.test.ts` and `deed-engine.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(deeds): every deed names its mechanic; runs present each skill with it or as a choice`.

### Task 8: Run ownership and the `review` run kind

**Files:**
- Modify: `src/lib/db/schema.ts`: `deedRun.deedId` drops `.notNull()`; add `sourceRef: text("source_ref")`; `kind` enum gains `"review"`.
- Generated: `src/lib/db/migrations/0038_*.sql` plus meta (SQLite table rebuild; drizzle generates it)
- Modify: `src/lib/utils/deed-scoring.ts` (`RunKind`, `RUN_EFFECTS.review`)
- Modify: `src/lib/utils/deed-run-types.ts`:
  - `RunStart.deed.area: SkillArea | null`
  - `RunSummary.building: … | null`
  - `RunSummary.kind: RunKind`
- Modify: the spec's §4.1 and §5 lines on `source` (see Part A's adjustment)
- Test: `src/lib/utils/deed-scoring.test.ts`, `src/lib/db/migrate.test.ts` (existing), `src/lib/db/migrations-journal.test.ts` (existing)

**Interfaces:**
- Produces:
  - `RunKind = "deed" | "challenge" | "review"`
  - `RUN_EFFECTS.review = { raisesBuilding: false, earnsStars: false, movesMastery: true, countsForSchool: false, feedsReview: true, allowsSecondChances: true }`

- [ ] **Step 1: Failing test:** `RUN_EFFECTS.review` equals the object above, and `countsTowardBuilding` is never consulted for it (see Task 10).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the schema and scoring changes. Run `npm run db:generate -- --name review_runs` and `npm run db:migrate`.
- [ ] **Step 4: Verify the migration on production data.**
  - Restore the latest backup (`/mnt/c/Users/kylee/Documents/KingdomsAndCrowns-backups/kingdoms-turso-*.sql.gz`, newest) into a scratch SQLite file.
  - Run `TURSO_DATABASE_URL=file:<scratch> node src/lib/db/migrate.mjs` twice.
  - Expected: the first run applies `0038`; the second says "No migrations to apply"; `select count(*) from deed_run` is unchanged; `pragma table_info(deed_run)` shows `deed_id` nullable and `source_ref` present.
  - Delete the scratch copy.
- [ ] **Step 5: Run** `deed-scoring.test.ts`, `migrate.test.ts` and `migrations-journal.test.ts`. Expected: PASS.
- [ ] **Step 6: Commit**: `feat(db): runs can be owned by something other than a deed; the review run kind`.

### Task 9: The pure review-run builder

**Files:**
- Create: `src/lib/utils/review-run.ts`
- Test: `src/lib/utils/review-run.test.ts`

**Interfaces:**
- Consumes: `drawForSkill` (Task 7), `overdueSkills` and `REVIEW` (`review-schedule.ts`), `findSkill`.
- Produces:
  - `REVIEW_RUN = { tasks: 3 } as const`
  - `buildReviewRun(input: { mastery: readonly MasteryTiming[]; recentMisses: Question[]; poolItems: PoolItem[]; now: number; seed: number }): { skillIds: string[]; questions: Question[] }`
  - `reviewDue(mastery: readonly MasteryTiming[], now: number): boolean`

- [ ] **Step 1: Failing tests:**
  - **Order of picks:** misses first (at most 2), then overdue skills, then the least-recently-practised skills with `level ≥ 1`.
  - **Interleaving:** with due skills from two areas, the three tasks are not all one area.
  - **Nothing learned yet:** an empty mastery list gives `questions.length === 0` and `reviewDue(...) === false`.
  - **Determinism:** the same seed gives the same ids.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Candidates are every skill the child has a mastery row for. Draw one task per skill, each at that skill's own level.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(review): a three-task interleaved review set from what a child has learned`.

### Task 10: Review actions, and completing a review run

**Files:**
- Create: `src/lib/actions/review.ts`
- Modify: `src/lib/actions/deeds.ts`:
  - `completeDeedRun` branches on `RUN_EFFECTS[kind]`. For review runs it skips stars, pay, building and best, and returns `building: null`.
  - `loadRun` and `parseRun` accept a null `deedId`.
- Test: `src/lib/actions/review-db.test.ts` (new; same harness as `deeds-db.test.ts`)

**Interfaces:**
- Consumes: Tasks 8 and 9.
- Produces:
  - `type ReviewOrigin = { kind: "stone"; placeId: string } | { kind: "page" }`. A `placeId` that `placeById` (`src/lib/realm/layout.ts`) doesn't know is refused with `NOT_IN_CHRONICLE`
  - `startReviewRun(childId: string, origin: ReviewOrigin): Promise<RunStart | { empty: true }>`. A stone origin is the hero's alone (`isChildActor`); the page origin follows today's page rules.
  - `getReviewDue(childId: string): Promise<boolean>`
  - The run header for a stone: `{ id: "review:<placeId>", title: "<Place name> riddle stone", story: <stone line>, area: null }`. For the page: title "Quick review".
  - Resume: an open review run for `(childId, kind "review", sourceRef)` within `RESUME_WINDOW_MS` is resumed.

- [ ] **Step 1: Failing DB tests:**
  - A child with mastery rows (`level ≥ 1`) starts a stone review and gets 3 tasks. Answering moves `skill_mastery`. Completing writes **no** `realm_play_ledger` row, **no** `kingdom_progress` change, and `deed_run.stars = 0`.
  - `"a brand-new child has nothing to review"`: `startReviewRun` returns `{ empty: true }` and `getReviewDue` is false.
  - `"two tabs finishing one review complete it once"`: `Promise.allSettled([complete, complete])` gives exactly one fulfilled result, and mastery `attempt_total` is unchanged by completion.
  - A grown-up starting a stone review is refused with `HERO_ONLY`.
- [ ] **Step 2: Run** `npx vitest run src/lib/actions/review-db.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** this file and `deeds-db.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit**: `feat(review): riddle-stone and Quick review runs that teach and pay nothing`.

### Task 11: Quick review on the Side Quests page

**Files:**
- Modify: the Side Quests page picker (`src/components/deed-picker.tsx`) to add a "Quick review" button that calls `startReviewRun(childId, { kind: "page" })`
- Modify: `src/components/deed-player.tsx`: no area chip when `area` is null; a summary with `building: null` shows stars-free copy ("Reviewed 3 · {n} right")
- Test: `src/components/deed-picker.test.tsx` (new case), `src/components/deed-player.test.tsx` (new case)

**Interfaces:**
- Consumes: `startReviewRun` (Task 10).
- **Copy:** button "Quick review". Empty state: "Nothing to review yet. Finish a side quest first and it will come back here."

- [ ] **Step 1: Failing tests:**
  - The button calls `startReviewRun` with `{ kind: "page" }`.
  - An `{ empty: true }` reply shows the empty-state copy.
  - A review summary renders without a building line.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(side-quests): Quick review`.

### Task 12: Riddle stones in the world

**Files:**
- Create: `src/lib/realm/riddle-stones.ts`, `src/components/realm3d/riddle-stones.tsx`, `src/components/realm3d/riddle-stone-board.tsx`
- Modify (additive):
  - `src/lib/realm3d/hud-bus.ts`: `InteractTarget` gains `{ kind: "riddle"; placeId: string }`.
  - `src/lib/realm3d/interact.ts`: `SpotInput.stones?: readonly { placeId: string; x: number; z: number }[]`; `buildSpots` adds one round spot per stone with verb `"Read"`.
  - `spike-scene.tsx`: mount `<RiddleStones due={…} />`.
  - `realm-game.tsx`: mount `<RiddleStoneBoard …/>` when `overlay.target.kind === "riddle"`; pass `reviewDue`.
  - `src/lib/actions/realm.ts`: `getRealmBundle` adds `reviewDue: boolean`.
  - `src/components/realm3d/deed-board.tsx`: export its `DeedRun` component so the stone board reuses it.
- Test: `src/lib/realm/riddle-stones.test.ts`, `src/lib/realm3d/interact.test.ts` (new case), `src/components/realm3d/riddle-stone-board.test.tsx`

**Interfaces:**
- Produces:
  - `RIDDLE_STONES: readonly { placeId: string; offset: { x: number; z: number }; line: string }[]`, one per `PLACES` entry
  - `riddleStonePosition(placeId: string): { x: number; z: number }`
  - `RIDDLE_VERB = "Read"`
  - The board copy when nothing is due: "The stone is quiet today. Come back after a side quest or two."

- [ ] **Step 1: Failing tests:**
  - **Stones:** every `PLACES` id has exactly one stone, and every stone stands outside every other spot's footprint (collision with `buildSpots` output).
  - **Interaction:** `buildSpots({ …, stones })` includes a `riddle` target per stone.
  - **Board:** it starts `startReviewRun(childId, { kind: "stone", placeId })`, plays it through `DeedRun`, and shows the quiet copy on `{ empty: true }`.
  - **Quiet world:** the stone board is available while the world is quiet (not in `quiet.ts`'s off list).
- [ ] **Step 2: Run** the three test files. Expected: FAIL.
- [ ] **Step 3: Implement.** The stone is a low-poly standing stone; its emissive glow toggles on `due`, with no per-frame allocation. It goes in a new scene component file; `three` is imported only there.
- [ ] **Step 4: Run** the three files plus `realm-game.test.tsx` and `interact.test.ts`. Expected: PASS.
- [ ] **Step 5: Smoke check in the browser** (follow `reference_local_screenshot_setup`):
  - Dev server on `NEXT_DIST_DIR=.next-agent PORT=3178`; never capture the mouse.
  - Walk to Longwater with the keys, press E at the stone, and answer 3 tasks.
  - The summary shows no building line, and the HUD minutes don't change.
  - Stop the server by process group.
- [ ] **Step 6: Commit**: `feat(realm): riddle stones at the five named places glow when something is due`.

### Task 13: Focus skills: table, service, action

**Files:**
- Modify: `src/lib/db/schema.ts` (`learningFocus` table: `id`, `childId` (FK cascade), `skillId`, `createdAt`; unique `(childId, skillId)`)
- Generated: migration `0039_*`
- Create: `src/lib/utils/focus.ts`, `src/lib/services/learning-focus.ts`, `src/lib/actions/learning-focus.ts`
- Test: `src/lib/utils/focus.test.ts`, `src/lib/actions/learning-focus-db.test.ts`

**Interfaces:**
- Produces:
  - `FOCUS_MAX = 3`
  - `FOCUS_WEIGHT = 3`
  - `focusWindow(grades: Record<SkillArea, Grade>): Skill[]`: skills whose grade is within ±1 of the child's grade for that area.
  - `validFocus(ids: readonly string[], window: readonly Skill[]): string[]`: lenient. It keeps only known in-window ids, de-duplicates, and caps at `FOCUS_MAX`.
  - `loadFocusSkillIds(childId: string): Promise<string[]>`: cached per request, returns `validFocus` output.
  - `setFocusSkills(childId: string, skillIds: string[]): Promise<void>`: grown-up only. It rejects more than 3 ids, unknown ids and out-of-window ids, then replaces the set atomically in one batch.

- [ ] **Step 1: Failing tests:**
  - **`validFocus`:** drops an unknown id and an id two grades away; caps at 3.
  - **DB:** a grown-up sets two skills and reads them back.
  - **DB:** a child calling `setFocusSkills` is refused.
  - **DB:** four ids are rejected and nothing changes.
  - **DB:** a stored id that is no longer in the window is ignored on read.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Run `npm run db:generate -- --name learning_focus` and `npm run db:migrate`, and repeat Task 8's production-copy check for `0039`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(learning): up to three focus skills per hero, chosen by a grown-up`.

### Task 14: Focus weighting in runs and the beacon

**Files:**
- Modify: `src/lib/utils/deed-engine.ts`:
  - `selectSkills(…, focusIds: ReadonlySet<string> = new Set())` multiplies a focus skill's weight by `FOCUS_WEIGHT`.
  - `BuildRunInput.focusSkillIds?: string[]`.
- Modify: `src/lib/actions/deeds.ts`: `startDeedRun` loads `loadFocusSkillIds` alongside its other parallel reads.
- Modify: `src/lib/realm/objective.ts`: `rankBuildings` breaks ties in favour of a building with a deed in an area that holds a focus skill (new optional parameter `focusAreas: ReadonlySet<SkillArea>`).
- Test: `src/lib/utils/deed-engine.test.ts`, `src/lib/realm/objective.test.ts`, `src/lib/actions/deeds-db.test.ts`

- [ ] **Step 1: Failing tests:**
  - **Weighting:** over 1,000 seeds with two equally-weighted candidates, the focus skill is chosen at least 2.5 times as often.
  - **No focus:** `selectSkills` output with an empty focus set is identical to today's.
  - **Beacon:** a tie between two buildings goes to the one with a focus area.
  - **DB:** a stored focus id outside the child's window is ignored, and `startDeedRun` still returns tasks.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(learning): focus skills come up more often and the beacon leans toward them`.

### Task 15: The focus skills panel

**Files:**
- Create: `src/app/(app)/settings/focus-skills-panel.tsx`
- Modify: the settings page section that renders `LearningProfilePanel`, to render the new panel beneath it
- Test: `src/app/(app)/settings/focus-skills-panel.test.tsx`

**Interfaces:**
- Consumes: `focusWindow`, `FOCUS_MAX`, `setFocusSkills` and `loadFocusSkillIds` (Task 13).
- **Copy:**
  - Heading: "Focus this month".
  - Help line: "Pick up to three skills you're teaching now. Side quests and riddle stones will bring them up more often."
  - When three are picked, the other boxes are disabled with the note "Three is the most."

- [ ] **Step 1: Failing test:** skills are grouped by area label; picking a fourth is impossible; saving calls `setFocusSkills` with the chosen ids; a server error shows the returned message.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit**: `feat(settings): a grown-up picks this month's focus skills`.

### Task 16: Slice 1 verification and merge

- [ ] **Step 1:** Full checks, one at a time:
  - `npx vitest run --maxWorkers=2`. Expected: all green.
  - `npx tsc --noEmit`. Expected: clean.
  - `npx eslint src`. Expected: only the baseline error.
- [ ] **Step 2:** Run the browser smoke from Task 12 Step 5 once more, plus:
  - one side quest at a villager (unchanged behavior);
  - one on the Side Quests page;
  - one Quick review.
- [ ] **Step 3:** Request a whole-branch review (superpowers:requesting-code-review) against Part B and the spec's §4.1, §4.2, §4.8 and §4.10. Fix any findings.
- [ ] **Step 4:** Merge `realm-tasks-framework` into `dev` (`git merge --no-ff`). Check the branch before committing; the checkout is shared.
- [ ] **Step 5:** Append **Part C: Slice 2** to this plan, written against the merged code, before starting slice 2.

---

# Slice 1 outcome, and what slice 2 must do first

Slice 1 merged with its whole-branch review's findings fixed. The final review also named friction points that stop `measure` from being "one key per map + one presenter + generators". They become **the first tasks of Part C**, before any bench work:

1. **A draw that knows the kind.** `TaskKindDef` gains a `generate` hook (spec §4.1's `generators`). `buildDeedRun`/`buildReviewRun` draw through it instead of relabelling a drawn `Question` (`withKind`). `BuiltRun.questions` becomes `Task[]`. Dedupe (`questionText`/`prompt`) and `applyProfile`/`trimChoices` become per-kind or choice-only.
2. **Misses through the registry.** `loadRecentMisses` (`src/lib/services/deed-run-store.ts`) grades with `isTaskCorrect`, not `gradeAnswer`. Today a task without `answer` would throw and silently drop a run's misses. Builders take `recentMisses: Task[]` and only re-ask a miss through a kind the run can present.
3. **Prompt out of the players.** `deed-player.tsx` and `deed-board.tsx` read `question.view.prompt` and read-aloud outside the presenter. Move the prompt into `ClientTask` (every kind has one) or into the presenter.
4. **Flow state that isn't string-shaped.** `use-deed-flow.ts` (`choose(choice: string)`, `FlowState.ruledOut: string[]`), `RunStart.pending.ruledOut` and `AttemptResult.firstPick` assume strings. Encode responses on the client with the kind's pure `encode` and keep the stored-string contract.
5. **`toClientTask` and the generic accessor.** Add the single per-kind cast, and a comment that `taskDef(kindOf(t))` relies on method bivariance.
6. **`RunEffects.paysMinutes`.** Add the spec's explicit flag instead of deriving pay from `earnsStars` (slice 3's `build` row shows stars but never pays).

**Deploy notes for slice 1 (when `dev` reaches `main`):**
- Migrations 0038 (`deed_run.deed_id` nullable, `source_ref`) and 0039 (`learning_focus`) run in Vercel's production build before the new code serves. Take `npm run db:backup` first.
- Both migrations were tested on a copy of the 2026-11-09 production backup.

---

# Part C: Slice 2, building by measuring

**Branch:** `realm-measure`, cut from `dev` (bb1873e or later). Written 2026-11-10 against the merged slice-1 code. The interface map behind it was a read-only survey; the file:line references below are from that survey.

## Rulings that shape this slice (spec adjustments; update the spec in C1's commit)

- **R-C1: per-task pieces are shown on the bench, not live in 3D.**
  - The villager's board covers the screen during a run, so a 3D piece placed mid-run can't be seen.
  - The bench surface carries its own small SVG elevation of the site, and each solved bench task drops the next piece into it.
  - The 3D site advances when the board closes, through the existing hand-up/`raise` path (a counted run raises a stage, as today).
  - No new canvas prop, and no partial-stage geometry in `site-stages.ts`.
  - Cost if wrong: the child sees pieces on the bench rather than in the world mid-run.
- **R-C2: no dragging.**
  - Assemble = tap pieces to toggle them.
  - Cut = a typed length with − / + stepper buttons and a ruler drawing that shows the typed length.
  - Touch-, keyboard- and screen-reader-friendly.
- **R-C3: bench skills, two per grade (the ship bar).** The spec's table gave grade 9 and grade 11 one skill each and grade 12 none, so these are named here:

| Grade | Skills |
|---|---|
| K | `add-10`, `sub-10` |
| 1 | `add-20`, `sub-20` |
| 2 | `add-100`, `sub-100` |
| 3 | `area-perimeter`, `frac-unit` |
| 4 | `frac-equiv`, `mul-multi` |
| 5 | `frac-addsub`, `dec-ops` |
| 6 | `ratio-rate`, `percent-of` |
| 7 | `proportion`, `circle-measure` |
| 8 | `pythagorean`, `linear-eq` |
| 9 | `one-step-eq`, `systems-eq` |
| 10 | `similar-tri`, `trig-ratios` |
| 11 | `quad-formula`, `poly-ops` |
| 12 | `sequences`, `unit-circle` |

  Any other math skill stays `choice` inside the same run.
- **R-C4: the gate stays multiple choice.**
  - `startDeedRun` gains context `"gate"`: hero-only like `"realm"`, but `enabledKinds` is empty.
  - The gate board passes it through a new optional `DeedBoard` prop.
- **R-C5: a client-safe codec per kind, separate from server-only drawing.**
  - `src/lib/tasks/codecs.ts` (`TASK_CODECS`: `encode`, `decode`, `sameResponse`) is importable by client components.
  - `TASK_KINDS` and the bench generators stay server-only.
  - Presenters encode a response, so `choose(encoded: string)` and the stored-string contract are unchanged.
- **R-C6: misses respect the kind.**
  - A miss is re-asked only if `kindOf(miss) === kindForSkill(deed.mechanic, miss.skillId, enabled)`; otherwise it's dropped, and its skill can still be drawn fresh.
  - Review runs re-ask only `choice` misses.
- **R-C7: rollback safety.** `loadRecentMisses` skips a stored task whose kind isn't registered. `parseRun` throws a clear error for one (deploys are forward-only).
- **R-C8: the notation bridge is sent on success.**
  - `AttemptResult.bridge?: string` is set when a task resolves right, for kinds whose def defines `bridge(t)`. Choice has no bridge, so choice runs read exactly as today.
  - `attemptFeedback` (src/lib/realm3d/talk.ts:215) appends it after "That's it!".
- **R-C9: demo-first is decided by run history.**
  - `RunStart.demo` is true when the hero's grade for the deed's area is K–3, the run's first task is `measure`, and none of the hero's completed runs has a `measure` task (`questions LIKE '%"kind":"measure"%'`, on the existing child index).
  - The demo is one fixed worked example per mode, shown before the first task, with a "Got it" button.
- **R-C10: the bench ignores `numerals`** (it can't work without numbers). It is titled "The bench", and Aldo appears only in the demo, so all 8 math deeds read naturally.

## Global constraints for Part C

Everything in this plan's Global Constraints still applies, plus:
- Choice-run output must not change. Every recorded-ids snapshot for a deed whose skills aren't benched must stay byte-identical; add a choice-pinned regression (`enabledKinds: new Set()`) beside any snapshot that legitimately changes.
- Bench generators are seeded and pure, store values as decimal or fraction **strings** (`Rational` is bigint and won't JSON-serialise), and never use `Math.random`.
- A measure task's solution never reaches the browser: `toView` omits `answer` and `solution`, and the `bridge` is released only on a correct resolution.
- **Copy:**
  - feedback `too_long` → "A little long. Trim it."
  - feedback `too_short` → "A little short. Add to it."
  - bench title "The bench"
  - demo button "Got it"

## Review Focus (Part C)

1. A run stored before the deploy (choice only) resumes and completes unchanged. Pinned in C4.
2. A measure response that is malformed (piece index out of range, duplicate indices, a 60-character "length", `"1/0"`) is refused before any write. Pinned in C5.
3. Equivalent answers count as right: "3/4", "0.75" and "6/8" for a cut, and any subset of pieces whose sum hits the mark for assemble. Pinned in C5.
4. Turning the measure toggle off mid-week: new math runs are `choice`, and an open measure run still resumes and completes (runs are snapshots). Pinned in C12.
5. A typed length in the bench never moves the hero or triggers a game key, because `typingInto` is honoured. Pinned in C10.

## File map (Part C)

| File | Responsibility |
|---|---|
| `src/lib/tasks/types.ts` | `TaskKind` gains `"measure"`; `ClientTask.prompt`; `FeedbackCode` gains `too_long`, `too_short` |
| `src/lib/tasks/codecs.ts` (new) | client-safe `TASK_CODECS` |
| `src/lib/tasks/kinds.ts` (new) | client-safe `HANDS_ON_KINDS = ["measure"] as const`, `HandsOnKind` |
| `src/lib/tasks/measure.ts` (new) | `measureKind: TaskKindDef<"measure">` (server) |
| `src/lib/tasks/draw.ts` (new) | `TASK_DRAWERS` (server): kind → `(skill, level, rng) => Task \| null` |
| `src/lib/tasks/bench/*.ts` (new) | bench generators per band (`k2.ts`, `g35.ts`, `g68.ts`, `g912.ts`), plus `index.ts` → `BENCH: Record<string, BenchGenerator>` |
| `src/lib/utils/deed-engine.ts` | kind-aware draw; per-kind dedupe; `applyProfile` choice-only; `BuiltRun.questions: Task[]`; `recentMisses: Task[]` |
| `src/lib/utils/review-run.ts` | `Task`-typed misses, choice-only |
| `src/lib/services/deed-run-store.ts` | misses through `isTaskCorrect`; unknown-kind skip |
| `src/lib/utils/deed-scoring.ts` | `RunEffects.paysMinutes` |
| `src/lib/actions/deeds.ts` | `paysMinutes`; `"gate"` context; `enabledKinds` from settings; `bridge`; `RunStart.demo`, `RunStart.site` |
| `src/components/tasks/bench-presenter.tsx` + `bench.css` (new) | the bench surface and elevation |
| `src/components/tasks/bench-demo.tsx` (new) | the demo panel |
| `src/lib/realm3d/bench-pieces.ts` (new, pure) | the elevation's piece sequence per stage, and the repair scaffold |
| `src/lib/utils/realm-settings.ts`, schema, migration 0040, `src/test/realm-db-ddl.ts`, `src/lib/actions/realm-settings.ts`, `realm-settings-panel.tsx` | `mechanics` |
| `src/lib/utils/deeds.ts` | 8 math deeds become `"measure"` |

### Task C1: `paysMinutes`, a single accessor, unknown kinds

**Files:**
- Modify: `src/lib/utils/deed-scoring.ts` (`RunEffects.paysMinutes`)
- Modify: `src/lib/actions/deeds.ts:360` (pay reads `effects.paysMinutes && stars > 0 && isChildActor(access)`)
- Modify: `src/lib/tasks/registry.ts` (`taskDefOf`, `isRegisteredKind`)
- Modify: `src/lib/services/deed-run-store.ts` (`parseRun` guard)
- Modify: the spec (R-C1…R-C10 summary in §2a)
- Test: `deed-scoring.test.ts`, `registry.test.ts`, `deeds-db.test.ts`

**Interfaces:**
- `RUN_EFFECTS.deed.paysMinutes = true`; `challenge` and `review` false.
- `taskDefOf(t: Task): TaskKindDef<TaskKind>`: the one documented cast (method bivariance). Use it at every `taskDef(kindOf(t))` site: `isTaskCorrect`, `resultFor`, `feedbackOf`, answer, retry, `deed-attempts.ts`.
- `isRegisteredKind(k: unknown): k is TaskKind`.
- `parseRun` throws `"This side quest was saved by a newer version. Start it again."` for an unregistered kind.

- [ ] **Tests:**
  - `paysMinutes` per kind.
  - A deed run with stars still pays and a review never pays (existing DB tests stay green).
  - `isRegisteredKind("measure")` is false until C5 lands, then true.
  - `parseRun` on `[{ kind: "nope", … }]` throws the copy above.
- [ ] Implement, run the touched files, then commit: `refactor(deeds): pay reads paysMinutes; one task-def accessor; unknown kinds refused clearly`.

### Task C2: Misses through the registry, by kind

**Files:**
- Modify: `src/lib/services/deed-run-store.ts:32-56` (`loadRecentMisses(): Promise<Task[]>` uses `isTaskCorrect`; skips unregistered kinds per R-C7; drops the `try/catch` around grading)
- Modify: `deed-engine.ts` (`BuildRunInput.recentMisses: Task[]`; miss filter per R-C6)
- Modify: `review-run.ts` (`recentMisses: Task[]`; choice misses only)
- Test: `deeds-db.test.ts`, `review-db.test.ts`, `deed-engine.test.ts`, `review-run.test.ts`

- [ ] **Tests:**
  - A completed run holding a hand-seeded `{ kind: "measure", … }` task plus a missed choice task returns the choice miss. Before this task, the TypeError dropped both.
  - A measure miss is not re-asked when the deed's mechanic is `choice`, or when `measure` isn't in `enabledKinds`.
  - A review run never contains a measure miss.
  - Recorded choice snapshots are unchanged.
- [ ] Implement, run, commit: `fix(deeds): misses are graded by their kind and only re-asked where that kind is played`.

### Task C3: Prompt on the client task; client-safe codecs

**Files:**
- Modify: `src/lib/tasks/types.ts` (`ClientTask.prompt: string`; choice view becomes `{ choices }`)
- Modify: `registry.ts` `toClientTask` (sets `prompt`)
- Create: `src/lib/tasks/codecs.ts` (`TASK_CODECS: { [K in TaskKind]: { encode(r: ResponseByKind[K]): string; decode(s: string): ResponseByKind[K] | null; sameResponse(a, b): boolean } }`). Choice reuses choice's functions; the choice def delegates to its codec, so there's no duplication.
- Modify: `deed-player.tsx:45,109,111`, `deed-board.tsx:272,375,377` (read `question.prompt`)
- Modify: `presenters.tsx` (`onRespond(encoded: string)`; each presenter encodes with its codec)
- Fixtures: `presenters.test.tsx:9`, `deed-board.test.tsx`, `deed-player.test.tsx`, `gate-quest-board.test.tsx`, `riddle-stone-board.test.tsx`, `use-deed-flow.test.ts`, `deed-run-flow.test.ts`

- [ ] **Tests:**
  - `toClientTask` puts `prompt` on top and the choice view has no `prompt`.
  - Every player still renders and speaks the prompt (existing tests, updated fixtures).
  - A test asserts no `"use client"` module imports `@/lib/tasks/registry` or `@/lib/tasks/bench`: a static scan over `src/components/**` with `fs` + a regex on import lines.
- [ ] Implement, run the touched files plus the full suite once, commit: `refactor(tasks): the prompt rides on the client task; responses are encoded by a client-safe codec`.

### Task C4: A draw that knows the kind

**Files:**
- Create: `src/lib/tasks/draw.ts` (`TASK_DRAWERS: { [K in Exclude<TaskKind, "choice">]: (skill: Skill, level: number, rng: Rng) => Task | null }`)
- Modify: `deed-engine.ts`
  - `drawForSkill(..., kind: TaskKind = "choice")`: choice → today's path; else the drawer with dedupe by id only, up to `count * 20` attempts.
  - `buildDeedRun` computes each skill's kind once (`kindForSkill`) and draws through it. This replaces `withKind`.
  - `applyProfile` touches only `kindOf(t) === "choice"` tasks.
  - `BuiltRun.questions: Task[]`.
  - The `IDENTITY_CASE`/`questionText` filters apply to choice only.
- Test: `deed-engine.test.ts`

- [ ] **Tests:**
  - Every recorded snapshot at :720-741 and :876-894 is byte-identical. No kind except choice draws yet.
  - With a stub drawer registered in the test (via a `TASK_DRAWERS` override seam, `__setDrawerForTest`, test-only), a skill presented by that kind draws through it and isn't relabelled.
  - Review Focus 1: a pre-deploy choice run resumes and completes (DB).
- [ ] Implement, run, commit: `refactor(deeds): runs draw each skill through its kind`.

### Task C5: The `measure` kind

**Files:**
- Modify: `types.ts` (`TaskKind = "choice" | "measure"`, the `…ByKind` keys, `FeedbackCode` adds `"too_long" | "too_short"`)
- Create: `src/lib/tasks/measure.ts`
- Create: `src/lib/tasks/kinds.ts`
- Modify: `codecs.ts`, `registry.ts` (register)
- Modify: `draw.ts` (measure drawer = `BENCH[skill.id]?.(level, rng, skill.id) ?? null`; `BENCH` starts empty here)
- Modify: `deed-run-types.ts` (`AttemptResult.bridge?: string`), `actions/deeds.ts` `resultFor` (bridge on a correct resolution)
- Test: `src/lib/tasks/measure.test.ts`, `registry.test.ts`, `deeds-db.test.ts`

**Interfaces (verbatim shapes):**
```ts
type MeasurePiece = { label: string; value: string };          // value: decimal or "a/b" string
type MeasureTask = {
  kind: "measure"; id: string; skillId: string; prompt: string; readAloud?: string;
  mode: "assemble" | "cut"; unit: string;                       // "" when unitless
  pieces?: MeasurePiece[]; target?: MeasurePiece;               // assemble: offered pieces and the mark
  answer?: string; tolerance?: string;                          // cut: solution value; tolerance default "0"
  step?: string; maxLength?: string;                            // cut: the stepper's increment and the ruler's length (view-safe)
  solution?: number[];                                          // assemble: one valid subset, for answerText/bridge only
  bridge: string;                                               // e.g. "1/2 + 1/4 = 3/4"
  explain?: string;
};
// view: { mode, unit, pieces?: string[] (labels), target?: string (label), step?: string, maxLength?: string }   (never answer/solution/bridge)
// response: assemble → number[] (unique, sorted, in range); cut → string (raw typed, ≤ 20 chars, parseAnswer-able)
// encode: assemble "a:0,2,3"; cut "c:<formatRational(parsed,'fraction')>"; never ""
```
- `isCorrect`:
  - assemble: the sum of the chosen pieces' values `sameValue` the target.
  - cut: `sameValue(parse(r), parse(answer), parse(tolerance ?? "0"))`.
- `feedback`: `too_long` or `too_short` by comparing the sum (or the cut) with the target; `none` when right or not comparable.
- `allowsSecondChance` true. `answerText(t)` = `t.bridge`. `presents(id)` = `id in BENCH`.

- [ ] **Tests (Review Focus 2 and 3):**
  - **Malformed responses refused before any write:** an index out of range, duplicate indices, a non-array, a 60-character string, `"1/0"` (DB test asserts no write).
  - **Equivalent cut answers are right:** "3/4", "0.75" and "6/8".
  - **Any valid assemble subset is right**, not only `solution`.
  - `toView` and `JSON.stringify(toClientTask(t))` contain neither `answer`, `solution` nor `bridge`.
  - `bridge` arrives only on a correct resolution.
  - `encode` never returns `""`; `sameResponse("a:0,1", "a:1,0")` is true.
- [ ] Implement, run, commit: `feat(tasks): the measure kind — assemble pieces to a mark or cut to a length`.

### Tasks C6–C9: Bench generators, by band

One task per band; each has the same shape.

**Files:**
- Create: `src/lib/tasks/bench/{k2,g35,g68,g912}.ts`, registered in `src/lib/tasks/bench/index.ts`
- Test: `src/lib/tasks/bench/<band>.test.ts`, plus one catalog harness `src/lib/tasks/bench/bench.test.ts` (created in C6, extended by each later task)

**Assignments:**
- C6: K–2 skills from R-C3
- C7: grades 3–5
- C8: grades 6–8
- C9: grades 9–12

**Interface:** `type BenchGenerator = (level: number, rng: Rng, skillId: string) => MeasureTask`. Level 0–4 sets the number sizes; reuse the range tables in `drill-generators.ts` / `generators/*.ts` where they fit. The id is `${skillId}:${params}`, stable per parameters.

**Catalog harness (every registered generator, levels 0–4, 200 seeds each):**
- The task is solvable: for assemble some subset hits the target, and `solution` is one; for cut, `answer` parses.
- Same seed gives the same task.
- At least 8 distinct ids per level for levels ≥ 1, and at least 5 at level 0.
- `bridge` is built from the task's own numbers (it contains the target or answer as rendered).
- `prompt` is ≤ 160 characters.
- K–1 skills carry `readAloud`.
- No piece value or answer is negative unless the skill is about integers.
- Every cut answer is reachable with the stepper: answer ≤ `maxLength`.

**Per skill:** a short test of the readings, e.g.:
- `frac-unit`: cut a 1-unit beam into quarters, then the answer is "1/4".
- `pythagorean`: a brace for a wall of 3 by 4, then 5.
- `trig-ratios`: answers to 2 dp, with tolerance "0.01".

- [ ] Each task: tests (red), the generators, green, commit: `feat(bench): <band> bench generators`.

### Task C10: The bench surface

**Files:**
- Create: `src/components/tasks/bench-presenter.tsx`, `src/components/tasks/bench.css`
- Create: `src/lib/realm3d/bench-pieces.ts` (pure: `benchPieces(stage: number, complete: boolean): { kind: PieceKind; label: string }[]`, the order pieces are added for the run's stage; repair sequence when complete)
- Modify: `presenters.tsx` (register `measure`)
- Modify: `actions/deeds.ts` (`RunStart.site?: { stage: number; complete: boolean }` for deed runs, from `kingdom_progress` + `siteStage`)
- Modify: `talk.ts` (`attemptFeedback` shows `bridge` on success and maps `feedback` codes to the copy in Global constraints)
- Test: `bench-presenter.test.tsx`, `bench-pieces.test.ts`, `talk.test.ts`

**Behavior:**
- **Assemble:** piece buttons that toggle (`aria-pressed`), a target marker, a running "so far" total, and an "Fit it" button that sends `encode(selected)`.
- **Cut:**
  - A labelled number input ("Length in {unit}"), − / + buttons stepping by the task's natural step (1, 1/4, 0.1 etc., carried in the view as `step`), and a "Cut it" button.
  - The input calls `e.stopPropagation()` on keydown, and the board's number-key handler isn't mounted for this kind.
  - Review Focus 5: a test sends `w`, `1` and `Escape` while typing; no game handler fires and the run doesn't close.
- **Second chance:** decode `flow.ruledOut[0]` with the codec and show "Your first try: …".
- **Elevation:** an SVG of the site. Each right answer in this run reveals the next `benchPieces` entry. A miss reveals nothing. Pieces appear at stage + 1 only when the run counts.
- **Sizing:** the surface fits the board's `wide` panel at 1280×800, and phone width on the page variant.

- [ ] Tests, implement, run, commit: `feat(bench): the bench surface — fit pieces or cut to length, with the site going up beside it`.

### Task C11: Demo first, for K–3

**Files:**
- Create: `src/components/tasks/bench-demo.tsx`
- Modify: `actions/deeds.ts` (`RunStart.demo?: boolean` per R-C9)
- Modify: `deed-player.tsx`, `deed-board.tsx` (show `<BenchDemo mode=… onDone=…/>` before the first task when `run.demo`, with a one-line mount each)
- Test: `bench-demo.test.tsx`, `deeds-db.test.ts`

**Demo copy:**
- Assemble: "Aldo needs a beam 5 feet long. He fits a 2-foot piece and a 3-foot piece: 2 + 3 = 5. Now you try!"
- Cut: "Aldo needs a board 3/4 of a foot long. He measures 3 quarters and cuts there. Now you try!"

- [ ] **Tests:**
  - `demo` is true for a grade-2 hero with no prior measure run, and false after one completed measure run.
  - `demo` is false for a grade-5 hero.
  - "Got it" reveals the first task; the demo is shown once per run.
- [ ] Implement, run, commit: `feat(bench): young heroes watch Aldo do one first`.

### Task C12: The mechanics setting, wiring, and the gate

**Files:**
- Modify: `schema.ts` (`realmSettings.mechanics: text("mechanics")`); migration `0040_*` (prod-copy check as in Task 8)
- Modify: `src/test/realm-db-ddl.ts` (column)
- Modify: `realm-settings.ts` (`RealmSettings.mechanics: Record<HandsOnKind, boolean>`, all true by default; lenient parse of the JSON text, where a missing key reads as on; strict validate: an object with only known keys and boolean values)
- Modify: `actions/realm-settings.ts` (merge with stored, `JSON.stringify` into the column)
- Modify: `realm-settings-panel.tsx` ("Side quests" fieldset: one switch row per hands-on kind from `MECHANIC_LABELS: Record<HandsOnKind, { label; hint }>`; measure = "Building by measuring" / "Math side quests are played at the bench.")
- Modify: `actions/deeds.ts` (`enabledKinds` from `settings.mechanics`; context `"gate"` → empty set)
- Modify: `deed-board.tsx` (optional `runContext?: "realm" | "gate"`), `gate-quest-board.tsx` (passes `"gate"`)
- Test: `realm-settings.test.ts`, `realm-settings-panel.test.tsx`, `deeds-db.test.ts`, `gate-quest-board.test.tsx`

- [ ] **Tests:**
  - Lenient and strict parsing.
  - A patch toggling `measure` leaves other keys alone.
  - Review Focus 4: toggle off → a new math run has no measure task, while an open measure run resumes and completes.
  - A gate run is all choice.
- [ ] Implement, migrate, verify on the prod copy, commit: `feat(realm): a grown-up can turn building by measuring off; the gate stays multiple choice`.

### Task C13: Math deeds become `measure`

**Files:**
- Modify: `src/lib/utils/deeds.ts` (the 8 math deeds: `mechanic: "measure"`)
- Modify: `deed-engine.test.ts` (re-record the snapshots that change; add choice-pinned twins with `enabledKinds: new Set()`)
- Test: `deeds-db.test.ts`

- [ ] **Tests:**
  - A grade-3 math run holds measure tasks for `area-perimeter` or `frac-unit` and choice tasks for any other skill.
  - It answers, retries and completes through the real actions with stars and pay as before.
  - Reading deeds' snapshots are byte-identical.
- [ ] Implement, run the full suite, commit: `feat(deeds): math side quests are played at the bench`.

### Task C14: Verify, review, merge

- [ ] **Full checks:** suite, `tsc`, `eslint src` (baseline only).
- [ ] **Browser smoke**, following the screenshot notes; the dev server in a worktree needs `--webpack`. Cover:
  - a grade-2 hero's first math side quest: demo, then assemble;
  - a grade-5 hero cutting a fraction length;
  - a wrong cut, then "A little long. Trim it.", then a right second try showing its bridge;
  - the elevation growing;
  - the board closing and the 3D site advancing;
  - the toggle off giving choice;
  - a gate run all choice.
- [ ] **Whole-branch review** (most capable model), one fix wave, then merge into `dev` on the owner's word.
