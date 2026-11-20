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
| 3 | `realm-real-work`, then `realm-chronicle` (Part D) | Materials (catalog, `subject.material`, ledger, minting in `completeAssignment`, the welcome-delivery script), quest-card and Tavern pull, improvements and `build` runs, plaques, stockpile, delivery card, Chronicle hall with drawings and seals, villager mentions, quieter minutes, and slice 13's D13.1–D13.5 for core buildings. | Concurrent completions mint once; concurrent builds never overspend; the migration and welcome delivery are tested on a production backup copy. |
| 4 | `realm-locks`, then `realm-world-locks` (Parts F, G) | `lock` kind (pattern, grid, cage, sort), `logic` area and skills, sort pools, `realm_world_state`, chests/doors/gates with cycling, science deeds become `lock`, the Puzzle Tower. | Every lock generator's output is solvable (checked by a constraint solver in tests); sort pools pass the validator and blind pass. |
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

---

# Part D: Slice 3, real work in the world (two branches)

**Written 2026-11-18** against `dev` a0b318f (slices 1 and 2 merged). It is based on three read-only surveys of that code: completion and subjects, runs and D13, and the 3D Realm. File:line references come from those surveys.

**Slice 3 ships as two branches**, each merged into `dev` on the owner's word:
- **3a `realm-real-work`** (Tasks D1–D16):
  - materials, minting and the welcome delivery;
  - improvements, build runs and plaques;
  - the record-of-the-work core rules (D13);
  - the keep yard, with the plans board and stockpile;
  - the delivery card, the satchel, quieter minutes, and the quest-card and Tavern pull.
- **3b `realm-chronicle`** (Tasks E1–E7): drawings, the Chronicle book and its framed drawings, seals, and villager mentions.

3b needs only 3a's material catalog and keep yard. Splitting keeps each whole-branch review to a size one reviewer can hold.

## Rulings that shape this slice (spec adjustments; update spec §2a "Calls settled for slice 3" in D2's commit)

- **R-D1: there is no Keep at the start, so slice 3 builds a keep yard.**
  - The spec put the plans board and the Chronicle in "the Keep's great hall (the castle interior exists from the start)". In code, the great hall is `RoomKind "castle"`, and it is reachable only when `castleUnlocked` (level 50 or a castle row).
  - Instead, the **keep yard** is open ground beside `CASTLE_POSITION`. `CastleGrounds` is drawn there even while the castle is locked.
  - It holds the plans board, the stockpile, the Chronicle Hall improvement and (in 3b) the Scribe's lectern. Everything is reachable from day one.
  - The great hall is untouched.
  - Cost if wrong: the hall is the "proper" home for level-50 heroes; that is an additive move later.
- **R-D2: minting is guarded by the database and never fails a quest.**
  - `completeAssignment` has no transaction and no lock, and its minutes grant is its last line (`quest-assignments.ts:483`).
  - `grantMaterialsForCompletion` runs **before** the minutes grant, inside `try/catch` (it logs and never throws to the child).
  - It inserts inside `withChildLock` with `onConflictDoNothing`, against a partial unique index on `realm_material(source_assignment_id) WHERE kind = 'earned'`.
  - It mints whenever `materialsPerQuest > 0`, whatever `enabled` or `accessMode` say: materials record work; they are not play time.
  - The welcome script (D5) re-runs safely, so it doubles as the repair tool.
- **R-D3: `subject.material` is nullable, and null means "from the name".**
  - `resolveMaterial({ name, material })` returns the stored id when it is valid, else `defaultMaterialForSubject(name)`.
  - No backfill is needed, and a renamed subject follows its new name until a grown-up picks a material.
- **R-D4: timber is the wildcard.**
  - Catalog costs use stone, ink, herbs, thread and dye only.
  - When spending, any shortfall in a material is paid from timber. PE, life skills, music lessons and the like still build the kingdom.
  - `allocateSpend` owns this rule.
- **R-D5: an improvement on a building is offered once its host is raised.**
  - Village and keep-yard improvements are always offered.
  - Levels go in order: level n+1 is offered once level n is built.
- **R-D6: a build run is 3 tasks on the bench, started from the plans board.**
  - Skills are the hero's two bench skills for their math grade, drawn 2 + 1.
  - The measure toggle is respected: off means the same skills as `choice`.
  - The level is built on completion whatever the stars. The stars are recorded on the plaque.
  - `RUN_EFFECTS.build`: `{ raisesBuilding: false, earnsStars: true, movesMastery: true, countsForSchool: false, feedsReview: true, allowsSecondChances: true, paysMinutes: false }`.
  - K–3 heroes get Aldo's demo on a build run under the same rule as deed runs.
  - The bench elevation draws the improvement's own boxes, through `RunStart.plan`.
- **R-D7: spending is one locked transaction, idempotent by a unique index.**
  - On completing a build run, `finishBuild` runs in `withChildLock`:
    1. read the ledger;
    2. `allocateSpend`;
    3. if short, nothing is written, and the summary says so;
    4. insert `realm_improvement` with `onConflictDoNothing` on `(child_id, improvement_id, level)`;
    5. only when that insert wins, write the `spent` rows.
  - `sources` is the FIFO list of quests whose earned materials paid for it, oldest first, capped at 12.
- **R-D8: the record-of-the-work core rules (D13), as slice 3 needs them.**
  - **Rules in scope:** D13.1–D13.5, D13.6 (announced in the world, not on the page), D13.7–D13.9 ("Raised by" snapshot, no name backfill) and D13.15 (a parent's preview writes nothing).
  - **Rules out of scope:** D13.10–D13.14 and D13.16 (ceremony, session summary, clock reframing, figure marks).
  - **Settled points:**
    - `deeds_done` counts every completed `deed` run at the site, any stars (lifetime, display only).
    - "Distinct completed" means a deed of the building's **current** list with best stars ≥ 1 on a `deed` run.
    - The retro-completion data migration filters on `kind = 'deed' AND stars >= 1`, fixing the spec SQL that omitted this.
    - The completion write becomes a conditional `UPDATE … WHERE completed_at IS NULL`.
    - `child.banishedAt` exists (the spec says there is no retired flag); rule D13.8 still holds unchanged.
- **R-D9: the delivery card shows earned rows created after `realm_settings.delivery_seen_at`.**
  - A null value means everything.
  - Rows the welcome script minted get the welcome copy.
  - Dismissing it sends the newest `created_at` shown; the server clamps it to `now`.
  - Order on entry: welcome (first visit ever), then delivery, then the season ceremony.
- **R-D10: the beacon points to the plans board only while the pinned plan is affordable.** Otherwise it leads to the core objective, as today. Its goal id is `plan:<improvementId>`, so it can never equal a villager id.
- **R-D11: building happens in the Realm.** The Tavern card shows plans, progress and a pin, and links to the Realm. This is the pull the owner asked for.
- **R-D12 (3b): drawings are required "or".** With `requireNotes` on, a quest completes with meaningful notes **or** a valid drawing. The quest form's label becomes "Ask for Scribe's Notes or a drawing".

## Global constraints for Part D

Everything in this plan's Global Constraints still applies, plus:
- **Never trust the client:**
  - A forged request must never mint, spend, build, pin or mark anything seen.
  - Minting happens only inside `completeAssignment`'s grant.
  - Building, pinning and marking happen only in hero-only actions (`isChildActor`).
  - A grown-up's preview writes nothing.
- **Untouched rules:** materials are never removed by undoing a quest, never minted twice, and never come from anything but real quests. Minutes rules are untouched; a build run never pays minutes.
- **Real-database tests** (`*-db.test.ts`) for: two concurrent completions minting once, two concurrent builds never overspending, and two tabs building a level once. New tables get shared DDL in `src/test/realm-db-ddl.ts`.
- **Copy (exact):**
  - Quest card: "+{n} {Material}" then " · {hint}"; link "Take it to the Realm".
  - Kingdom lead line: "Your quests bring materials to build with."
  - Delivery title: "The carts are in!"; welcome title: "The carts arrived with four weeks of your work".
  - Plan states: "Ready to build", "Needs {n} more {Material}" (joined with " and "), "Raise the {host} first".
  - Build results: "The {label} is built!" at level 1, "The {label} grows!" above.
  - Raised by: "Raised by {name} · {Season Year}" (calendar season, e.g. "Spring 2026").
  - Retro rise: "Your side quests already finished the {label}. It stands now!"
- **Realm rules (`.superpowers/realm-rules.md`):**
  - World and room additions are siblings of the memoised `World`, never new `buildWorldLayout` inputs.
  - Canvas props stay referentially stable.
  - New interact kinds follow the riddle-stone precedent.
  - New HUD blocks go in new files, each with its own CSS, and are added to the `data-larger-text` list.

## Review Focus (Part D)

1. **A quest completed twice at once (two tabs, or the timer and the card)** mints its materials once. Pinned in D4.
2. **Two build runs finishing for the last affordable plan at once** (a tablet and a laptop) spend once. The other run reports "not enough", and the balance never goes negative. Pinned in D8.
3. **A hero whose subjects all map to one material, or who has only timber,** still gets offered plans and can build them. Pinned in D1 (`allocateSpend`) and D6 (`planState`).
4. **A building the retro rule completes** rises with its "why" line on the next visit, exactly once, even if a grown-up previewed first. Pinned in D10.
5. **A parent opening the Realm in preview** sees the hero's satchel and plaques but never consumes the delivery card or a rise, and cannot build or pin. Pinned in D11 and D12.

## File map (Part D, 3a)

| File | Responsibility |
|---|---|
| `src/lib/realm/materials.ts` (new, pure, client-safe) | `MATERIALS`, `MaterialId`, `defaultMaterialForSubject`, `resolveMaterial`, `materialBalance`, `allocateSpend`, `heapSize`, `materialPhrase` |
| `src/lib/realm/improvements.ts` (new, pure, client-safe) | `IMPROVEMENTS`, `ImprovementId`, boxes and costs, `planState`, `planHint`, `planElevation` |
| `src/lib/realm/keep-yard.ts` (new, pure) | the yard's spots (plans board, stockpile heaps, Chronicle Hall, lectern) and the village-decor improvement spots |
| `src/lib/realm/season-phrase.ts` (new, pure) | `seasonPhrase(date, timeZone)`, `hemisphereForTimezone` |
| `src/lib/db/schema.ts`, migrations 0041 (schema) and 0042 (custom data SQL) | tables and columns below |
| `src/lib/services/realm-materials.ts` (new) | `grantMaterialsForCompletion`, `loadMaterialLedger`, `loadWorks` (balance, built levels, pin, delivery) |
| `src/lib/services/improvements.ts` (new) | `finishBuild` (locked spend and level write) |
| `src/lib/utils/build-run.ts` (new, pure) | `buildBuildRun` |
| `src/lib/actions/improvements.ts` (new, "use server") | `startBuildRun`, `pinPlan`, `markDeliverySeen`, `markBuildingsAnnounced` |
| `src/lib/db/welcome-materials.ts` (new script) + `package.json` | `db:welcome-materials` |
| `src/lib/utils/kingdom.ts`, `services/deeds.ts`, `actions/deeds.ts` | D13 rules, raised-by, build hook |
| `src/components/realm3d/keep-yard.tsx`, `improvements.tsx`, `plans-board.tsx`, `plaque-panel.tsx`, `satchel-hud.tsx` (+ css), `delivery-card.tsx` (new) | the world and HUD pieces |
| `src/components/tasks/plan-elevation.tsx` (new) | the bench drawing for a build run |
| `src/components/kingdom-plan-card.tsx` (new) | the Tavern card |

**Schema (migration 0041, generated):**
- `subject.material` (text, nullable).
- `realm_material`:
  - Columns: `id`, `child_id` (FK cascade), `material_id`, `amount` (int > 0), `kind` (`earned`|`spent`), `origin` (`quest`|`welcome`, default `quest`), `source_assignment_id` (nullable, **no FK**), `improvement_id` (nullable), `level` (nullable), `created_at`.
  - Indexes: `(child_id, created_at)`, and the partial unique on `source_assignment_id` where `kind = 'earned'`.
- `realm_improvement`:
  - Columns: `id`, `child_id` (FK cascade), `improvement_id`, `level`, `stars`, `season_id` (nullable, no FK), `built_by_name`, `sources` (JSON text), `built_at`.
  - Index: unique `(child_id, improvement_id, level)`.
- `realm_settings`: `materials_per_quest` (int, default 1), `show_minutes_on_quests` (bool, default false), `pinned_plan` (text, nullable), `delivery_seen_at` (timestamp, nullable), `regraded_at` (timestamp, nullable).
- `kingdom_progress`: `announced_at` (timestamp, nullable), `raised_by_name` (text, nullable), `raised_season_id` (text, nullable).
- `deed_run.kind` enum gains `"build"`. This is a TypeScript-only change; confirm `db:generate` emits no SQL for it.

### Task D1: Materials, pure rules

**Files:** Create `src/lib/realm/materials.ts`, `materials.test.ts`.

**Interfaces (produces):**
- `type MaterialId = "stone" | "ink" | "herbs" | "thread" | "dye" | "timber"`
- `MATERIALS: Record<MaterialId, { label: string; plural: string; color: string; icon: GameIconName }>`. Check that each icon exists in `GameIconName`.
- `isMaterialId(v: unknown): v is MaterialId`
- `defaultMaterialForSubject(name: string): MaterialId`. Whole-word match like `defaultSchoolForSubject`; first match wins; else `timber`.
  - stone: math, mathematics, arithmetic, algebra, geometry, calculus
  - ink: reading, writing, ela, english, language, spelling, grammar, literature, phonics, handwriting
  - herbs: science, biology, chemistry, physics, nature
  - thread: history, social, studies, geography, civics
  - dye: art, music, drawing, painting
- `resolveMaterial(subject: { name: string; material: string | null }): MaterialId`
- `type MaterialRow = { materialId: string; amount: number; kind: "earned" | "spent"; sourceAssignmentId: string | null; createdAt: number }`
- `materialBalance(rows: readonly MaterialRow[]): Record<MaterialId, number>`. Unknown ids are ignored; never negative.
- `allocateSpend(cost: Partial<Record<MaterialId, number>>, rows: readonly MaterialRow[]): { ok: true; spend: Partial<Record<MaterialId, number>>; sources: string[] } | { ok: false; short: Partial<Record<MaterialId, number>> }`. Timber covers shortfalls (R-D4). `sources` is the assignment ids of the earned rows consumed, FIFO by `createdAt` after earlier spends are taken out, de-duplicated, at most 12.
- `heapSize(n: number): 0 | 1 | 2 | 3`: 0, then 1–3, 4–9, 10+.

- [ ] **Tests:**
  - "Math 2" → stone; "Spanish" → timber; "Social Studies" → thread.
  - The balance after earned 5 and spent 3 is 2.
  - A cost of ink 4 with ink 1 and timber 5 is ok, spending ink 1 and timber 3.
  - A short result names the missing amounts.
  - FIFO sources skip rows already spent and stop at 12.
  - Heap boundaries.
- [ ] Implement, run, commit: `feat(realm): materials — what each subject's work brings, and how it is spent`.

### Task D2: Schema, migration 0041, settings

**Files:**
- Modify: `schema.ts` (the Schema block above).
- `npm run db:generate -- --name real_work`, then `npm run db:migrate`.
- Modify: `src/test/realm-db-ddl.ts`:
  - add `REALM_MATERIAL_DDL`, `REALM_IMPROVEMENT_DDL` and `KINGDOM_PROGRESS_DDL`, copied from the migration with its indexes;
  - update `REALM_SETTINGS_DDL`;
  - replace the hand-written `kingdom_progress` DDL in `deeds-db.test.ts:75` and `review-db.test.ts:64` with the shared one.
- Modify: `utils/realm-settings.ts`:
  - `materialsPerQuest` (`MATERIALS_PER_QUEST_RANGE = {min:0,max:3}`) and `showMinutesOnQuests`, both lenient read and strict write;
  - `pinned_plan`, `delivery_seen_at` and `regraded_at` are **not** settings; the patch validator rejects them as unknown.
- Modify: `realm-settings-panel.tsx`: a "Real work" fieldset with `NumberSetting` "Materials per quest" (hint "0 turns this off.") and a switch "Show Realm minutes on quests".
- Modify: the spec (§2a, "Calls settled for slice 3", R-D1 to R-D12).

- [ ] **Tests:**
  - Settings defaults are 1 and false; an out-of-range read gives the default; a strict write rejects 4 and `pinnedPlan`.
  - The panel saves both fields (bump the panel test's field counts).
  - `realm-settings-db.test.ts` round-trips both.
  - `migrations-journal.test.ts` passes.
- [ ] Commit: `feat(realm): the tables for real work, and the grown-up's two dials`.

### Task D3: A subject's material

**Files:** `actions/subjects.ts`, `settings/child-list.tsx` (and its test).

- `createSubject` and `updateSubject` accept `material?: MaterialId | null`.
- Changing it is grown-up only ("Only a grown-up can choose what a subject's work brings.").
- An invalid value is refused ("Choose a material from the list.").
- `null` means "from the name".
- In the subject row's edit mode, a `<Select aria-label="Material">` sits beside the school select. Its first option is "From the name ({Material})". View mode shows the resolved material label.

- [ ] **Tests:** a hero is refused; a grown-up sets ink, then clears it to null; the row shows "Ink".
- [ ] Commit: `feat(subjects): a grown-up can choose what each subject's work brings`.

### Task D4: Minting on completion

**Files:**
- Create `services/realm-materials.ts`.
- Modify `actions/quest-assignments.ts:481`.
- Test `services/realm-materials-db.test.ts`.

**Interfaces:**
- `grantMaterialsForCompletion(childId: string, assignmentId: string): Promise<{ materialId: MaterialId; amount: number } | null>`:
  - load the assignment's quest → subject (left join) and the settings;
  - return null when `materialsPerQuest` is 0;
  - inside `withChildLock`, insert the earned row (`origin: "quest"`) with `onConflictDoNothing`;
  - return what was minted, or the existing row on a repeat.
- `loadMaterialLedger(childId: string, exec?: Exec): Promise<MaterialRow[]>`.
- In `completeAssignment`, before the minutes grant: `try { await grantMaterialsForCompletion(...) } catch (e) { console.error(...) }`. The return type stays `{ activityId }`, since the card reads from the server (D15).

- [ ] **Tests (real DB, `isolate()` pattern from `realm-lock-db.test.ts`):**
  - Two concurrent grants for one assignment → one row.
  - A redo (same id) → no new row.
  - A grown-up completing → minted.
  - `materialsPerQuest` 0 → none.
  - Realm `enabled: false` → still minted.
  - A subject with material null named "Science" → herbs.
  - A grant that throws doesn't fail `completeAssignment` (unit, mocked).
- [ ] Commit: `feat(realm): finishing a quest brings its subject's material, once`.

### Task D5: The welcome delivery script

**Files:**
- Create `src/lib/db/welcome-materials.ts` (pattern: `backfill-spell-schools.ts`: own client, relative imports, `--dry-run`, `--days N` default 28).
- Add the `package.json` script `db:welcome-materials`.
- Add a test.
- Add a runbook line in `docs/deploy/vercel.md`.

**Behaviour:**
- For each child, take completed assignments with `completed_at` within N days of now that have no earned row.
- Mint `materialsPerQuest` of `resolveMaterial(subject)` with `origin: "welcome"`, `created_at` = run time.
- Print per-child counts. A second run mints nothing.

- [ ] **Tests:** run the script's exported `welcomeMaterials(db, { now, days, dryRun })` against a test DB:
  - minted once;
  - an old completion is skipped;
  - dry run writes nothing;
  - a second run is a no-op.
- [ ] Commit: `feat(realm): the welcome delivery — four weeks of quests reach the kingdom`.

### Task D6: Improvements catalog

**Files:** Create `src/lib/realm/improvements.ts`, `improvements.test.ts`, `src/lib/realm/keep-yard.ts`, `keep-yard.test.ts`.

**Interfaces:**
- `type ImprovementId` is a closed union of 13 ids:
  - one per building, each hosted by its building:
    - `well-house`, `mill-granary`, `bridge-arches`, `chapel-windows`
    - `market-stalls`, `library-reading-wing`, `watchtower-beacon`, `garden-herb-house`
  - `chronicle-hall` (host `keep`)
  - `village-banners`, `village-lamps`, `village-fountain`, `village-statue` (host `village`)
- `IMPROVEMENT_COLORS: Record<ImprovementColor, string>` (a small closed hex palette: stone, timber, plaster, roof, cloth, glass, gold, water) and `type ImprovementBox = { x; y; z; sx; sy; sz; color: ImprovementColor }`, in the host's frame. For a building host, the origin is the building centre on the ground and +z is the door side. For keep and village hosts, it is the spot centre.
- `IMPROVEMENTS: Record<ImprovementId, { label: string; host: BuildingId | "keep" | "village"; primary: MaterialId; secondary: MaterialId; levels: { cost: Partial<Record<MaterialId, number>>; boxes: ImprovementBox[] }[] }>`:
  - 3 levels each;
  - costs L1 `{primary:4, secondary:2}`, L2 `{6,3}`, L3 `{8,4}`;
  - never timber;
  - primary materials: well-house stone, mill-granary herbs, bridge-arches stone, chapel-windows dye, market-stalls thread, library-reading-wing ink, watchtower-beacon stone, garden-herb-house herbs, chronicle-hall ink, banners dye, lamps thread, fountain stone, statue stone;
  - secondaries are the implementer's choice, different from the primary.
- `KEEP_YARD` and `VILLAGE_DECOR_SPOTS: Record<"village-banners" | …, {x,z}>` in `keep-yard.ts`. Coordinates are the implementer's, pinned by the tests below. The yard's spots are `plansBoard`, `stockpile` (6 heap spots), `chronicleHall` and `lectern`.
- `type PlanStatus = { id; level: number; state: "ready" | "short" | "host" | "done"; short?: Partial<Record<MaterialId, number>> }`
- `planState(input: { built: Record<string, number>; raised: ReadonlySet<string>; balance: Record<MaterialId, number> }): PlanStatus[]`:
  - sorted ready first, then by fewest missing, then catalog order;
  - "host" means the host is not raised;
  - "short" uses `allocateSpend`, so timber counts.
- `planLine(s: PlanStatus): string`, using the copy in Global constraints.
- `planHint(made: MaterialId, plans: PlanStatus[], pinned: string | null): string | null`: the pinned plan first, else the nearest "short" plan that needs `made`. Produces e.g. "the Library's Reading Wing needs 3 more".
- `planElevation(id, level): { base: Rect[]; added: Rect[] }`: a front projection (x, y, sx, sy) of earlier levels' boxes and this level's boxes, for the bench.

- [ ] **Tests:**
  - 13 ids, all with 3 levels.
  - Costs follow the rule and never use timber.
  - Each level's boxes rest on the ground or on a lower box (the site-stages rule).
  - Building wings stay out of the host's 4.5 × 4.5 footprint and its door lane.
  - Every yard and decor spot is clear of `DECOR_SPOTS`, sites (padded 2), the road corridor, the lap ring and the ceremony plaza (reuse the `layout.test.ts` helpers).
  - `planState` with only timber 30 offers ready plans; a wing with an unraised host is "host".
  - `planHint` prefers the pin.
- [ ] Commit: `feat(realm): the kingdom's plans — wings, upgrades and decorations, and what each costs`.

### Task D7: Build runs

**Files:**
- `utils/deed-scoring.ts`: `RunKind` gains `"build"`, with the R-D6 row; update `deed-scoring.test.ts:75-97`.
- Create `utils/build-run.ts`: `buildBuildRun(input: { grade: Grade; masteryBySkill; seed: number; enabledKinds: ReadonlySet<TaskKind>; profile: ProfileLike }): BuiltRun`:
  - candidates are `skillsFor("math", grade)` filtered by `benchFor`;
  - 3 tasks, drawn 2 + 1 from the two skills;
  - the kind comes from `kindForSkill("measure", …)`.
- Create `actions/improvements.ts` with `startBuildRun(childId: string, improvementId: string): Promise<RunStart>`:
  1. `requireChildAccess(write)`, then `isChildActor`, else `HERO_ONLY`;
  2. hero enabled; a catalog id;
  3. the next level, which must be "ready" from `planState`, else the error "That plan isn't ready yet.";
  4. resume the open `build` run with `sourceRef = "${id}:${level}"`;
  5. otherwise insert it.
  - The `RunStart.plan?: { improvementId; level }`.
- `deed-run-store.ts:168`: `benchDemoAt` also accepts `kind === "build"`.
- `use-deed-flow.ts`, `bench-presenter.tsx`: when `run.plan` is set, render `PlanElevation` (create `components/tasks/plan-elevation.tsx` from `planElevation`, laying `piecesLaid(solved, benchTasks, added.length)` of the added boxes).
- Kind branches for "build": `deed-results.tsx:13,21,35`, `deed-board.tsx:147,151,264,318,321`, `talk.ts:170,196`:
  - the headline uses the build-result copy;
  - the stars row is shown;
  - no "New best!" line;
  - no building hand-up.

- [ ] **Tests:**
  - `buildBuildRun` gives grade 3 → 3 measure tasks over area-perimeter and frac-unit; with toggle off, 3 choice tasks over the same skills; deterministic by seed.
  - `startBuildRun`: a grown-up is refused; a plan that's not ready is refused; a second start resumes.
  - `PlanElevation` lays boxes as answers come right.
  - The build headline copy appears.
- [ ] Commit: `feat(realm): building a plan is three tasks at the bench`.

### Task D8: Finishing a build

**Files:**
- Create `services/improvements.ts`.
- Modify `actions/deeds.ts`, `completeDeedRun`: after the complete-once update, `if (run.kind === "build") improvement = await finishBuild(...)` in `try/catch`, which reports `{ built: false, reason: "error" }`.
- Modify `utils/deed-run-types.ts`: `RunSummary.improvement?: { id; label; level; built: boolean; reason?: "short" | "error"; balance: Record<MaterialId, number> }`.
- Test `services/improvements-db.test.ts`.

**Interfaces:**
- `finishBuild(childId: string, ref: { improvementId; level }, stars: number, now: Date): Promise<NonNullable<RunSummary["improvement"]>>`, following R-D7.
- `season_id` is the open season, or null.
- `built_by_name` is `child.displayName` at that moment.
- `sources` are quest titles with subject and date (join on `source_assignment_id`; a deleted assignment reads "A quest").

- [ ] **Tests (real DB):**
  - Two `finishBuild`s for one level at once → one improvement row and one set of spent rows.
  - Two different plans racing for the last materials → one built, the other `short`, and the balance is never negative.
  - Short at completion → nothing written.
  - Sources are FIFO and capped at 12.
  - Timber covers a shortfall.
  - A build run pays no minutes and never touches `kingdom_progress`.
- [ ] Commit: `feat(realm): a finished build spends its materials once and stands with its plaque`.

### Task D9: The record-of-the-work core rules

**Files:**
- `utils/kingdom.ts`:
  - `deedsToBuild`: well 3, mill 3, bridge 2, chapel 3, market 2, library 3, watchtower 2, garden 2;
  - `type SiteTally = { distinctDone: number; runsDone: number; raised: boolean }`;
  - `buildingProgress(tally: SiteTally, building): { done; total; complete }` with `complete = raised || distinctDone >= total`.
- `services/deeds.ts`:
  - `loadSiteState` (`:165`) and `loadKingdomOverview` (`:175`) build the tally from `loadDeedBest` and the row's `completedAt` and `deedsDone`;
  - `BuildingOverview` gains `raisedBy: string | null` (snapshot, else the live name) and `raisedAt: number | null`.
- `actions/deeds.ts` `buildingAfter` (`:330`):
  - `deeds_done + 1` on every completed `deed` run;
  - the completion write is conditional on `completed_at IS NULL`, setting `completed_at`, `raised_by_name` and `raised_season_id` (lookups in `try/catch` leave them null).
- `RunSummary.building.practice: boolean`: true when the building was already complete before this run.
- Create `src/lib/realm/season-phrase.ts`: `seasonPhrase(epochSeconds, timeZone): string`, e.g. "Spring 2026". The southern hemisphere covers `Australia/*`, `Pacific/Auckland`, `America/Argentina/*`, `America/Santiago`, `America/Sao_Paulo` and `Africa/Johannesburg`.
- **Per-deed done marks:**
  - `deed-picker.tsx` shows a check beside a deed with best ≥ 1 ("Done");
  - a complete building's list says "Practise again".
- Migration 0042: `npm run db:generate -- --custom --name record_of_the_work`. Its SQL is exported as `RECORD_OF_WORK_SQL` from `src/lib/db/record-of-work.ts` (the `star-backfill.ts` precedent). It does three things:
  1. marks already-complete rows `announced_at = completed_at`;
  2. completes rows whose distinct deeds (`kind='deed' AND stars>=1`, the building's deed ids listed in the SQL) reach the new totals, leaving those rows unannounced;
  3. sets `realm_settings.regraded_at` for heroes who got such a row.

- [ ] **Tests:**
  - A guard: `deedsToBuild === deedsForBuilding(id).length` for all 8.
  - Replaying one story 5 times does not raise a 3-story building; 3 distinct stories do.
  - A raised building stays complete when `deedsToBuild` is raised.
  - A 0-star run counts in `runsDone` only.
  - Two different deeds completing a building at once write one name.
  - Seasons: "Spring 2026" in Denver, "Autumn 2026" in Sydney for the same April date.
  - `RECORD_OF_WORK_SQL` against a test DB: a hero with 2 distinct well deeds at 1+ stars gets the well completed and unannounced; one with a 0-star replay does not; already-complete rows are announced. The migration file contains the SQL.
  - Update the fixtures that hard-code 5 (survey list: `deeds-db.test.ts:457`, `services/deeds.test.ts:11`, `site-stages.test.ts:16` and others).
- [ ] Commit: `feat(realm): each story counts once, a raised building stays raised, and it remembers who raised it`.

### Task D10: Rises announced in the world

**Files:**
- `actions/realm.ts` (`getRealmBundle`): `unannounced: string[]` and `regraded: boolean`.
- `realm-game.tsx`: additive, via a new `use-rises.ts` hook.
- `actions/improvements.ts`: `markBuildingsAnnounced(childId: string, ids: string[]): Promise<void>`. Hero only, ids validated against `BUILDINGS`; it sets `announced_at` where it is null.

**Behaviour:**
- On entry, in the child view only, after the overlays: each unannounced complete building plays the existing rise toast, one after another. The line is the retro copy when `regraded`, else `riseToast`. Then the ids are marked.
- A board hand-up that rose marks its building at once.
- The Side Quests page never marks.

- [ ] **Tests:**
  - The hook plays two rises in order and marks both.
  - The parent view plays nothing and calls nothing.
  - The action refuses a grown-up and an unknown id.
  - A building completed through the page action is still unannounced afterwards (DB test).
- [ ] Commit: `feat(realm): a building finished away from the Realm rises when the hero comes back`.

### Task D11: The Realm's works data

**Files:**
- `services/realm-materials.ts`: `loadWorks(childId): Promise<Works>`, where `type Works = { balance: Record<MaterialId, number>; built: Record<string, number>; plaques: Plaque[]; pinned: string | null; delivery: Delivery | null }`, `type Plaque = { improvementId; level; label; builtBy: string; season: string | null; sources: string[]; stars: number }` (`season` is `seasonLabel` of the stored season, null when it is gone), and `type Delivery = { rows: { materialId: MaterialId; amount: number; title: string; origin: "quest" | "welcome" }[]; through: number }`.
- `getRealmBundle` (`.catch` → empty works).
- `RealmData.works?`.
- `page.tsx`: a mapping line.
- `actions/improvements.ts`:
  - `pinPlan(childId, improvementId | null)`: hero only, catalog id or null;
  - `markDeliverySeen(childId, through: number)`: hero only, clamped to now.
- Create `src/lib/realm/works-state.ts` (pure): `applyBuild(works, summary.improvement): Works` and `deliveryLines(delivery): { title; lines: string[] }`. The lines read e.g. "2 Stone from *Fractions p.12* and *Times tables*" (at most 6), with the welcome title when every row is `welcome`.

- [ ] **Tests:**
  - `loadWorks` on a test DB with rows after `delivery_seen_at`.
  - `pinPlan` refuses a grown-up and a bad id.
  - `markDeliverySeen` clamps a future time.
  - `deliveryLines` copy for both titles.
  - `applyBuild` updates the balance and the built level.
- [ ] Commit: `feat(realm): the Realm knows the hero's satchel, plans and deliveries`.

### Task D12: The keep yard in the world

**Files:**
- Create `components/realm3d/keep-yard.tsx`:
  - a plans board prop and 6 heap spots (`heapSize` → 0–3 box heaps per material, coloured from `MATERIALS`, non-solid);
  - a sibling of `<World>` with props `works` and `heightAt`.
- `interact.ts`: `SpotInput.plans`, `InteractTarget.kind` gains `"plans"` (`hud-bus.ts:49`, additive).
- Create `components/realm3d/plans-board.tsx`:
  - a `Panel` listing `planState` rows with `planLine`, a "Pin" toggle, and "Build" on ready rows;
  - "Build" calls `startBuildRun`, then plays `<DeedRun>` (from `deed-board.tsx:235`) with the plan elevation;
  - on the result, `applyBuild`.
- `realm-game.tsx`: an overlay branch beside the riddle stone (`:1163`), plus the beacon composition: `planGoal(works, raised)` from a new pure `src/lib/realm3d/plan-goal.ts`, used when the pinned plan is "ready" (R-D10).
- In the parent view, the board lists plans read-only.

- [ ] **Tests:**
  - `plan-goal.test.ts`: on only when the pin is ready; its id is never a villager id.
  - `plans-board.test.tsx`: lists states; Pin calls `pinPlan`; Build starts the run; read-only for a parent.
  - `interact.test.ts`: the plans spot is reachable.
- [ ] Commit: `feat(realm): the keep yard — the plans board and the stockpile of the hero's work`.

### Task D13: Improvements and plaques in the world

**Files:**
- Create `components/realm3d/improvements.tsx`: a sibling of `<World>` that merges every built level's boxes at its host. Building hosts use `prop.position` and `SITE_PLAN`, like `pennantSpots`; keep and village hosts use their spots.
- Create `src/lib/realm3d/improvement-spots.ts` (pure).
- `interact.ts`: `"plaque"` targets, one per built improvement at its host.
- Create `plaque-panel.tsx`: "{label} · built by {name} · {2026–27} · from: {titles}" plus the stars.
- `talk.ts` `talkCopy`: a complete building's `says` adds "Raised by {name} · {season}".

- [ ] **Tests:**
  - `improvement-spots.test.ts`: positions are deterministic and a wing sits beside its host.
  - `plaque-panel.test.tsx`: the copy, and a missing season omits its part.
  - `talk.test.ts`: the raised-by line; it falls back to the live name when the snapshot is null.
- [ ] Commit: `feat(realm): built plans stand in the kingdom, each with a plaque naming the work behind it`.

### Task D14: Satchel, delivery card, quieter minutes

**Files:**
- Create `satchel-hud.tsx` + `satchel.css`: a top-left block under the objective card. It shows material counts (icon and number; pips when `numerals` is off) and the pinned plan's `planLine`. Mount it in the `r3-frame` sibling list, and add the class to the `data-larger-text` list.
- Create `delivery-card.tsx`: an `Overlay` kind `"delivery"` in `frame.ts`. The initial overlay chain in `realm-game.tsx:344` and `go()` becomes welcome → delivery → ceremony. Closing it calls `markDeliverySeen` in the child view only.
- `frame-hud.tsx` `ClockCorner`: an additive `quiet?: boolean` prop renders the `.r3-chip` size. The child view passes `quiet`.
- `bounty.ts` `earningLines`: takes `materialsPerQuest`, and leads with "Your quests bring materials to build with." when it is above 0. Update `bounty.test.ts`.

- [ ] **Tests:**
  - The satchel renders counts and the pin.
  - The delivery card shows its lines and marks seen once, and never in the parent view.
  - The chain order.
  - The quiet clock has the chip class.
  - `earningLines` gets the lead line.
- [ ] Commit: `feat(realm): the satchel leads the HUD, the carts announce new work, and the clock steps back`.

### Task D15: The quest card and the Tavern

**Files:**
- `services/realm-materials.ts`: `loadMadeLines(childId, assignmentIds: string[]): Promise<Record<string, string>>` (earned rows joined with `planState` and `planHint`).
- `quest-assignment-card.tsx`: an optional `made?: string` on the data. On a completed card it shows the line plus the "Take it to the Realm" link (`/realm`, child view only, Realm enabled). With `showMinutesOnQuests` on, it also shows "+{n} min in the Realm" from the ledger.
- The pages that render cards attach `made`: `quests/page.tsx`, `tavern/page.tsx`, `today-schedule.tsx`, `makeup-quests.tsx`, with their hand-declared types.
- Create `components/kingdom-plan-card.tsx`: on the hero Tavern, the pinned plan (or the nearest), with its cost progress, the satchel counts, a "Pin" control for the hero, and a link to the Realm.

- [ ] **Tests:**
  - The card shows "+1 Ink · the Library's Reading Wing needs 3 more" and the link for a hero; a grown-up's view has no link.
  - The minutes line appears only with the setting on.
  - The plan card shows progress and pins.
  - `loadMadeLines` on a test DB.
- [ ] Commit: `feat(quests): a finished quest shows what it made and where it can go`.

### Task D16: Verify, review, merge (3a)

- [ ] **Full checks:** suite, `tsc`, `eslint src` (baseline only).
- [ ] **Production copy:**
  - Apply 0041–0042 to a copy of the latest weekly production backup; check the integrity check is ok and the re-run is a no-op.
  - Count the retro-completed rows per hero.
  - Run `db:welcome-materials --dry-run` on the copy and record the counts.
- [ ] **Browser smoke** (screenshot notes):
  - complete a quest, then see the made line and the link;
  - enter the Realm: the delivery card, the satchel and the quiet clock;
  - pin a ready plan, then the beacon, then the plans board → build run → plan elevation → plaque in the world;
  - a retro rise with its line;
  - a parent preview writes nothing;
  - phone width.
- [ ] **Whole-branch review** (most capable model), one fix wave, then merge into `dev` on the owner's word.
- [ ] **Owner runbook (production, after deploy):** back up, deploy (the migrations run), then `npm run db:welcome-materials` once.

---

# Part E: Slice 3b, the Chronicle (branch `realm-chronicle`, cut from `dev` after 3a merges)

**Global constraints:** Part D's, plus:
- **A drawing is a strict stroke document:**
  - `{ v: 1, strokes: { c: 0–7, w: 0–2, p: [x, y, …] }[] }`;
  - at most 40 strokes and 2,000 points in total;
  - integer coordinates in 0–320 × 0–240;
  - the serialized form under 32 KB.
- It is rendered only by our own SVG or canvas code. No client SVG or HTML is ever stored.

## Review Focus (Part E)

1. A forged drawing (41 strokes, a float coordinate, colour 9, a 40 KB string, an extra key) is refused before any write. Pinned in E1.
2. A K–1 hero with `requireNotes` finishes with only a drawing. Pinned in E1 and E2.
3. A seal is grown-up only, and a hero can't forge one. Pinned in E3.
4. Mentions never repeat a quest twice in a day across villagers, and fall back to the greeting with no recent quests. Pinned in E6.
5. A deleted quest or subject still renders its Chronicle entry (left joins). Pinned in E3.

### Task E1: Drawings, stored and required "or"

**Files:**
- Create `src/lib/utils/drawing.ts`:
  - `parseDrawing(raw: unknown): Drawing | null` (strict);
  - `DRAWING_PALETTE` (8 hex), `DRAWING_WIDTHS` ([2, 5, 10]);
  - `hasDrawing(d)`.
- Schema: `quest_assignment.drawing` and `quest_assignment.seal` (both text, nullable; the seal is used in E3); migration 0043.
- `completeAssignment` and `updateAssignmentNotes` accept `drawing?: unknown`, store `parseDrawing` output, and refuse a non-null invalid value ("That drawing couldn't be saved.").
- `requireNotes` passes with notes **or** a drawing (R-D12).
- The quest form label becomes "Ask for Scribe's Notes or a drawing".

- [ ] **Tests:** the validator's edges (Review Focus 1); the "or" rule; storage round-trip.
- [ ] Commit: `feat(quests): a quest can be told with a drawing`.

### Task E2: The drawing pad

**Files:**
- Create `components/drawing-pad.tsx` + css:
  - pointer events;
  - an 8-swatch palette and 3 widths, plus Undo and Clear;
  - 320×240 logical size, scaled to fit;
  - it emits a `Drawing`, and its points are rounded and clamped.
- Mount it beside the notes field in the card's quick-complete form and the edit-notes panel. The timer popup and the quest form keep notes only.

- [ ] **Tests:** a stroke from pointer events; Undo and Clear; the 40-stroke cap stops input; it submits with the card.
- [ ] Commit: `feat(quests): a drawing pad beside the Scribe's Notes`.

### Task E3: Chronicle entries and seals

**Files:**
- The seal (column added in E1) is JSON `{ phrase?: 0–5; note?: string ≤ 60; by: string; at: number }`.
- Create `src/lib/utils/seals.ts`: `SEAL_PHRASES` (6 short praise phrases) and `parseSeal`.
- `actions/chronicle-seals.ts`: `sealEntry(assignmentId, seal)` (grown-up only) and `unsealEntry`.
- `services/realm-chronicle.ts`: `loadChronicle(childId, { weeks = 8 })` → entries by ISO week: title, subject, material colour, notes, drawing, seal. Left joins, newest first.
- A seal control on a grown-up's view of a completed quest card.

- [ ] **Tests:** a hero is refused a seal; a 61-character note is refused; week grouping; a deleted subject renders as "A quest".
- [ ] Commit: `feat(realm): the Chronicle's pages, and a grown-up's seal of praise`.

### Task E4: The Chronicle book in the Realm

**Files:**
- `keep-yard.tsx` gains the Scribe's lectern; interact kind `"chronicle"`.
- Create `chronicle-book.tsx`: a `Panel` paging by week, with entries rendered as text (never HTML) and drawings by an SVG renderer `drawing-view.tsx`, plus seals.
- `getRealmBundle`: `chronicle` (`.catch` → empty).

- [ ] **Tests:** the book pages; drawings render from strokes; empty-book copy; the parent view reads it.
- [ ] Commit: `feat(realm): the Scribe's lectern holds the hero's Chronicle`.

### Task E5: Framed drawings in the Chronicle Hall

**Files:**
- `improvements.ts`: the Chronicle Hall levels carry `frames: {x, y, z, ry}[]` (2 per level).
- Create `src/lib/utils/draw-strokes.ts` (pure): `drawStrokes(ctx: Pick<CanvasRenderingContext2D, …>, d: Drawing, w, h)`.
- Create `chronicle-frames.tsx`: a sibling of `<World>`. It shows the newest drawings, one `CanvasTexture` each, on `MeshBasicMaterial` planes, disposed on cleanup.

- [ ] **Tests:** `drawStrokes` against a recording fake context; frame counts follow the built level.
- [ ] Commit: `feat(realm): the Chronicle Hall hangs the hero's drawings`.

### Task E6: Villagers mention real quests

**Files:**
- `villagers.ts`: `mentions: Partial<Record<MaterialId, string[]>>` per villager, using a `{quest}` token. For example, Hesper's ink line is "I hear you finished *{quest}*. Tell me what you learned sometime!"
- Create `src/lib/realm/mentions.ts`: `pickMention({ villagerId, recent: {assignmentId, title, material}[], said: ReadonlySet<string>, date })`, deterministic by date. It returns `{ line, assignmentId } | null`.
- `getRealmBundle`: `recentQuests` (7 days).
- `talk.ts`: `says` uses the mention when there is one.
- `said` is kept per day in `sessionStorage` (try/catch), keyed by the server's date.
- Extract a shared `hashId` into `src/lib/utils/hash.ts` (DRY with `troubles.ts` and `troubles3d.ts`).

- [ ] **Tests:** at most one mention per visit; never the same quest twice in a day; the fallback; text is never HTML.
- [ ] Commit: `feat(realm): villagers have heard about the hero's real quests`.

### Task E7: Verify, review, merge (3b)

- [ ] Full checks; migration 0043 on the production copy.
- [ ] **Browser smoke:**
  - draw on a quest card (phone width) → the Chronicle book → a frame in the hall;
  - a grown-up seals, and the hero sees it;
  - a villager mention.
- [ ] Whole-branch review, one fix wave, then merge on the owner's word.

---

# Part F: Slice 4a, the lock puzzles (branch `realm-locks`)

**Written 2026-11-20** against `dev` 122d23d (slices 1–3 merged). It draws on two read-only surveys: the task framework and skills, and the world.

**Owner's answers (2026-11-20):**
- Logic is practised on world locks, the Puzzle Tower, and a "Puzzle practice" button. It gets no new side quests.
- Decorations from chests appear at set spots.
- This slice has chests, vault doors and the Tower. Gates and locked rooms wait.
- Slice 4 ships as two branches. 4a merges on passing; 4b needs the owner's word.

**Slice 4 ships as two branches:**
- **4a `realm-locks` (F1–F10):** the `lock` task kind and its puzzle generators, the surface, the `logic` area, sort pools for science and vocabulary, science deeds becoming locks, and Puzzle practice.
- **4b `realm-world-locks` (G1–G7):** `realm_world_state`, chests and vault doors in the world and in rooms, what they open (decorations, lore pages, map fragments), and the Puzzle Tower.

## Rulings that shape slice 4 (record them in spec §2a, "Calls settled for slice 4", in F1's commit)

- **R-F1: a lock is checked against its rules, never against a stored answer.**
  - `isCorrect(t, r)` checks the response against the puzzle's constraints, so every valid solution counts.
  - Each task also stores one `solution` (server-only), used for the miss reveal.
- **R-F2: the reveal after a miss is the solved board.**
  - `AttemptResult` gains `reveal?: string`: the stored solution encoded with the kind's codec. It is sent only once the task is resolved and missed.
  - The presenter decodes it and draws the solved board.
  - `answerText` stays a short sentence ("Here is one way it fits.") for read-aloud and the text line.
- **R-F3: rule highlighting happens on the client, from the visible puzzle.**
  - A lock's rules (cages, clues, row and column counts) are part of its view by nature, so the surface can highlight a broken rule without the server revealing anything.
  - `FeedbackCode` gains `rule_broken` and `incomplete`, with lines "Something doesn't fit yet. Look at the marked rule." and "There are empty spaces left."
- **R-F4: puzzle kinds by band**, with size and difficulty set by the hero's grade and mastery of their `logic` skill:
  - K–1: `pattern` (AB AB ?), `sort1` (sort shapes by one attribute)
  - 2–4: `shapes3` (3×3 shape grid, each shape once per row and column), `balance` (pick weights that balance), `sort2` (a 2×2 grid by two attributes)
  - 5–8: `cage4` (4×4 KenKen-style), `logic3` (3×3 logic-grid deduction)
  - 9–12: `cage5` (5×5), `nono5` (5×5 nonogram), `logic4` (4×4 logic grid)
  - Ship bar: every generated puzzle is checked by a brute-force solver in tests. Cages, nonograms and logic grids must have exactly one solution. Patterns and sorts may accept any rule-valid answer.
- **R-F5: subject sorts.**
  - `sort` tasks carry science content (living/non-living, conductors/insulators, …) and vocabulary content (synonyms/antonyms, …).
  - They are drawn from new JSON pools `src/content/sorts/<poolId>.json`. Each pool credits an existing skill id (`skillId` field) and holds one or more category sets.
  - They have their own validator and blind-pass sheet. The drill tooling is four-choice only.
  - A skill with no sort pool keeps playing as `choice`, through `presents()`.
- **R-F6: `logic` is a new `SkillArea`, with one row per band at the band's lowest grade** (the existing science-pool convention):
  - rows: `logic-k1` (K), `logic-g23` (2), `logic-g45` (4), `logic-g68` (6), `logic-g912` (9);
  - other grades resolve by `nearestGrades`;
  - spell school `none` (`AREA_SCHOOL` widens, and `getSchoolCounts` skips `none`);
  - the hero's own grade applies, with no offset (`SubjectOffsets` stays the four strands, `SubjectArea = Exclude<SkillArea, "logic">`, `gradesFor` adds `logic: ownGrade`);
  - pickable as a focus skill;
  - shown in the mastery panel and the focus panel.
- **R-F7: logic skills have a new `SkillSource` kind, `{ kind: "lock" }`.** They are never drawn as `choice`. With locks switched off, a logic skill draws nothing, and Puzzle practice is hidden.
- **R-F8: logic has no side quests** (owner). The "every area has ≥2 deeds" tests exempt `logic` by name, with the reason. Logic is practised through:
  - **Puzzle practice**, a button on the Side Quests page that starts a `world` run of 3 logic locks at the hero's grade, with `sourceRef "practice"`;
  - world locks and the Tower (4b).
- **R-F9: `RUN_EFFECTS.world = { raisesBuilding: false, earnsStars: false, movesMastery: true, countsForSchool: false, feedsReview: true, allowsSecondChances: true, paysMinutes: false }`.** `tower` comes in 4b.
- **R-F10: demo-first is generalised.**
  - `benchDemoAt` becomes `demoAt`: the first task of a hands-on kind the hero has never answered, for K–3.
  - The demo copy is per kind and mode: the bench demos stay, and the lock demos are `pattern` and `sort1`.
  - `hasAnsweredBench` becomes `hasAnsweredKind(childId, kind, runId)`.
- **R-F11: science deeds become `mechanic: "lock"`.**
  - The five deeds are well-water, mill-wheel, chapel-stars, watchtower-signals and garden-bees.
  - Recorded snapshots that change get choice-pinned twins (slice 2's discipline).
  - Vocabulary stays inside `language` deeds as `choice`. Vocab sorts are reached when a grown-up picks a vocab focus skill, and by world locks in 4b.

## Global constraints for Part F

Everything in this plan's Global Constraints still applies, plus:
- **No dragging** (R-C2): tap to select, then tap to place; tap a cell to cycle it. Every surface works with touch, keyboard and a screen reader, and fits a phone at 390 px.
- **A lock's solution never reaches the browser before resolution.** `toView` builds the view field by field. `reveal` and `answerText` are sent only once the task is resolved.
- **Generators are pure, seeded and solver-checked.** No `Math.random`. Each task id encodes its parameters, so the same id means the same puzzle.
- **Copy:**
  - Feedback lines are as in R-F3.
  - Miss line: "Here is one way it fits."
  - Practice button: "Puzzle practice".
  - Mechanics switch: "Solving logic locks", with hint "Science sorts and logic puzzles on a lock's face. Off: science plays as multiple choice."

## Review Focus (Part F)

1. **A forged lock response** must be refused before any write:
   - a grid of the wrong size;
   - a cell value out of range;
   - a sort that assigns an item twice or to an unknown bin;
   - a 10 KB string.
   
   Pinned in F1.
2. **A second valid solution must count as right.** A pattern or sort that obeys every rule but differs from the stored `solution` is right. Pinned in F1 and F2.
3. **Every generated puzzle is checked across 500 seeds × every level**:
   - unique-solution kinds have exactly one solution;
   - none are trivially pre-solved.
   
   Pinned in F2 and F3.
4. **Locks turned off.** Science deeds play as `choice`, Puzzle practice is hidden, and a logic skill never throws in a choice draw. Pinned in F5 and F9.
5. **A run stored before the deploy still resumes**, including science choice runs. Pinned in F9.

**Execution order:** F1, F5, F2, F3, F4, F6, F7, F8, F9, F10. The logic skill rows (F5) exist before the generators keyed by them.

## File map (Part F)

| File | Responsibility |
|---|---|
| `src/lib/tasks/types.ts`, `registry.ts`, `codecs.ts`, `kinds.ts`, `draw.ts` | the `lock` kind (types, def, codec, hands-on list, drawer) |
| `src/lib/tasks/lock.ts` (new, server) | `lockKind: TaskKindDef<"lock">` |
| `src/lib/tasks/lock-rules.ts` (new, client-safe, pure) | per-puzzle rule checks, shared by the server's `isCorrect` and the surface's highlighting |
| `src/lib/tasks/locks/` (new, server) | generators by band, `LOCKS` registry, sort-pool drawer, test solver (`solver.ts`, test-only) |
| `src/lib/content/sort-pools.ts` + `sort-blind-pass.ts` (new) | sort pool validator and blind-pass sheets |
| `src/content/sorts/*.json` (new) | 8 pools: science-k1, -g23, -g45, -g68, -g912; vocab-g45, -g68, -g912 |
| `src/components/tasks/lock-presenter.tsx` + `lock.css` + `lock-demo.tsx` (new) | the lock surfaces |
| `src/lib/utils/skills.ts`, `skill-hints.ts`, `grade-levels.ts`, `learning-profile.ts`, `services/deeds.ts` | the `logic` area |
| `docs/content/logic-skill-map.md` (new) | the logic map, read by its own test |
| `src/lib/actions/practice.ts` (new) | `startPracticeRun` |

### Task F1: The `lock` kind

**Files:**
- Modify: `types.ts`, adding `LockTask`, `LockView` and `LockResponse` (discriminated by `puzzle: LockPuzzle`); adding `"lock"` to every `…ByKind`; adding `rule_broken` and `incomplete` to `FeedbackCode`.
- Create: `lock.ts`, `lock-rules.ts`.
- Modify: `registry.ts`, `codecs.ts` (the lock codec), `kinds.ts` (`HANDS_ON_KINDS = ["measure", "lock"]`), `draw.ts` (`lock: (skill, level, rng) => lockFor(skill.id)?.(level, rng, skill.id) ?? null`).
- Modify: `client-boundary.test.ts`, adding `lock` and `locks` to `SERVER_ONLY`.
- Modify: `deed-run-types.ts` (`AttemptResult.reveal?`) and `actions/deeds.ts` `resultFor`: a resolved miss sends `reveal = codec.encode(t.solution)` (R-F2).
- Modify: `talk.ts` `attemptFeedback`. The lock branch uses the R-F3 lines on a second chance, and "Here is one way it fits." on a miss. Narrow `cutFeedbackLine` to the measure codes by kind.
- Modify: `realm-settings-panel.tsx` `MECHANIC_LABELS.lock`, and update the ~12 tests that pin `{ measure: true }` (survey list).
- Spec §2a: add the slice-4 calls (R-F1–R-F11).

**Interfaces (produces):**
- `type LockPuzzle = "pattern" | "sort1" | "sort2" | "shapes3" | "balance" | "cage4" | "cage5" | "logic3" | "logic4" | "nono5" | "sort"`. Here `sort` is the subject sort from pools; `sort1`/`sort2` are abstract shapes.
- Each `LockTask` has `{ kind: "lock"; id; skillId; prompt; readAloud?; puzzle; …puzzle data…; solution: LockResponse; explain? }`.
- `LockView` is the puzzle data minus `solution`.
- `checkLock(view: LockView, r: LockResponse): { ok: boolean; broken: string[]; empty: number }` lives in `lock-rules.ts` and is pure. `broken` names rule ids the surface can highlight.
- The response format per puzzle is the implementer's, documented in `lock-rules.ts` (for example, a grid is a flat `number[]` and a sort is `number[]` of bin indexes). It is bounded: at most 25 cells, values within the puzzle's range, and the encoded form at most 200 chars.

- [ ] **Tests:**
  - `parseResponse` refuses every Review Focus 1 shape.
  - `isCorrect` accepts a second valid solution (Review Focus 2) and refuses a rule break.
  - `feedback` gives `incomplete` versus `rule_broken`.
  - `toView` never carries `solution`.
  - `reveal` is sent only on a resolved miss.
  - The `attemptFeedback` lock lines.
  - The settings panel shows the new switch.
  - Use a stub `pattern` task built inline; generators come in F2.
- [ ] Commit: `feat(tasks): the lock kind — puzzles checked against their rules, never a stored answer`.

### Task F2: Generators, K–4

**Files:**
- Create: `src/lib/tasks/locks/{index,k4,shapes,solver}.ts` + tests.
- `LOCKS: Record<string, LockGenerator>` is keyed by logic skill id. `lockFor(skillId)` covers both the logic generators and (from F6) the sort-pool drawer.

**Generators:**
- `pattern`: K uses AB/ABB/ABC repeats of 4–6 shapes with one blank; 1st grade has two blanks. The answer is the missing shape(s) from a 3–4 option tray.
- `sort1`: 6–8 shapes, sorted into 2 bins by colour or shape (the rule is stated).
- `sort2`: 2×2 bins by two attributes.
- `shapes3`: a 3×3 grid of 3 shapes, each once per row and column, with 3–5 givens by level.
- `balance`: pick a set of weights from 4–6 to balance a given weight. Any subset that works is right.
- **Level mapping:** levels 0–4 set the size and givens. `logic-k1` gives pattern and sort1. `logic-g23` gives shapes3, balance and sort2, with level steering the mix.

- [ ] **Tests (solver harness over 500 seeds × levels 0–4 per skill):**
  - every puzzle is solvable;
  - none is pre-solved;
  - ids are deterministic and vary (≥5 distinct at each level);
  - `shapes3` has a unique solution;
  - `balance` and the sorts accept every valid answer the solver finds.
- [ ] Commit: `feat(locks): pattern, sort, shape-grid and balance locks for the youngest heroes`.

### Task F3: Generators, 5–12

**Files:** `locks/{g58,g912}.ts` + tests (the same harness).

**Generators:**
- **`cage4`/`cage5`:** a Latin square plus cages (sizes 1–3, operations `+ − × ÷` with ÷/− only on 2-cell cages). Generated from a random Latin square, then cages are merged until the solver finds a unique solution. Bounded attempts, so a seed that can't converge retries deterministically.
- **`logic3`/`logic4`:** n people × n items with short clues ("Ana does not have the lute", "The baker has the red cloak"), pruned to a minimal set that leaves exactly one solution. The response is a permutation.
- **`nono5`:** a 5×5 picture with row and column clues, and a unique solution.
- **Skill mapping:** `logic-g45` → cage4 at the small levels, plus logic3. `logic-g68` → cage4 and logic3. `logic-g912` → cage5, nono5 and logic4.

- [ ] **Tests:**
  - uniqueness for all of these kinds;
  - generation time is bounded: 500 seeds complete inside the test timeout;
  - clue text has no answer leaks (no clue names the full solution).
- [ ] Commit: `feat(locks): cages, logic grids and nonograms for older heroes`.

### Task F4: The lock surface

**Files:**
- Create `components/tasks/lock-presenter.tsx`, `lock.css` and `lock-demo.tsx`.
- Register `lock` in `presenters.tsx`.
- Generalise the demo per R-F10: `deed-run-store.ts` gets `demoAt`/`hasAnsweredKind`, and the bench demo plus the new lock demo are chosen by kind.

**Behaviour (per puzzle):**
- Grids: tap a cell to cycle its value; givens are fixed.
- Sorts and bins: tap an item, then tap a bin.
- Pattern: tap the tray choice into the blank.
- Balance: tap weights on and off the pan.
- Nonogram: tap to fill, mark or clear.
- A "Check the lock" button sends the response.
- Live rule highlighting comes from `checkLock`, as a light outline, shown only after the first check so it isn't a free solver.
- On a second chance, it opens on the first try with the broken rules marked.
- On a miss, it draws `reveal` as the solved board.
- Keyboard: arrows move, number keys set values. Every cell has an aria-label (row, column, value).
- It stops propagation so the Realm's keys don't fire. It fits the board's wide panel and 390 px.
- **Demos (K–3):** pattern ("Pip fits the next shape: red, blue, red, blue, … red!") and sort ("Pip puts each shape where it belongs.").

- [ ] **Tests:**
  - each puzzle's surface builds and encodes the response;
  - highlighting appears only after a check;
  - the second chance and the reveal;
  - keyboard entry;
  - typing doesn't reach game keys;
  - the demo shows once for K–3 on the first lock and not after an answered lock;
  - the bench demo is unchanged.
- [ ] Commit: `feat(locks): the lock's face — tap to solve, with the rules marked after a check`.

### Task F5: The `logic` area

**Files:**
- `skills.ts`: area, labels (`logic: { label: "Logic", color: "#0ea5e9" }`), `AREA_SCHOOL` widened, `SkillSource` gains `{ kind: "lock" }`, plus the 5 rows.
- `spell-schools.ts` / `actions/subjects.ts`: skip `none`.
- `grade-levels.ts` / `learning-profile.ts` (`SubjectArea`), `services/deeds.ts` `gradesFor` (`logic: ownGrade`).
- `skill-hints.ts`: 5 hints, following the hint rules.
- `focus.ts` window: logic is present.
- Mastery and focus panels: add logic to `AREA_ORDER`.
- `deed-engine.ts` `selectSkills` and `drawForSkill`: a `lock` source never draws as choice, giving `[]`.
- `app/dev/content/sample.ts`: handle the new source.
- `docs/content/logic-skill-map.md`, plus a test reading it.
- The exemptions in `deeds.test.ts` and `deed-engine.test.ts` per R-F8, each with its reason.

- [ ] **Tests:**
  - the logic rows;
  - `nearestGrades` gives grade 3 → `logic-g23`;
  - a choice draw of a logic skill gives no task and doesn't throw (Review Focus 4);
  - school counts ignore logic;
  - offsets refuse "logic";
  - the focus window offers logic at the hero's own grade;
  - the panels list it.
- [ ] Commit: `feat(skills): logic joins the skill catalog, practised on locks`.

### Task F6: Sort pools — format, validator, blind pass, drawer

**Files:**
- Create `src/lib/content/sort-pools.ts`. It defines the pool type `{ poolId; skillId; grade; sets: { id; categories: [string, string]; items: { id; label; category: 0 | 1; level: 0–4; readAloud? }[] }[] }` and `validateSortPool(pool): Problem[]`. The rules:
  - each set has at least 16 items, balanced 40–60% per category;
  - the pool has at least 40 items in all, and every level 0–4 is present;
  - no duplicate labels;
  - labels are readable for the grade (reuse the Flesch–Kincaid check);
  - no label contains its category's word;
  - the grade equals the credited skill's grade.
- Create `sort-blind-pass.ts` + its CLI: a key-free sheet listing each set's categories and items in shuffled order; the reviewer writes 0 or 1 per item; the comparison must reach 100% once resolutions are applied. Mirror `blind-pass.ts` with sort-specific paths.
- The sort drawer (`locks/sort.ts`) builds a `sort` lock of 6–10 items from one set, by level, and is registered for skills that have a pool.
- Add a sibling of `drills-content.test.ts` for `sorts/`.

- [ ] **Tests:**
  - the validator's rules, on fixtures;
  - the sheet round-trips;
  - the drawer is deterministic and only uses one set;
  - `presents("science-g23")` is true only when its pool exists.
- [ ] Commit: `feat(content): sort pools — a format, a validator and a blind pass of their own`.

### Task F7: Sort content

**Files:** `src/content/sorts/{science-k1,science-g23,science-g45,science-g68,science-g912,vocab-g45,vocab-g68,vocab-g912}.json`.

**Suggested category sets** (the author may add more):
- living / non-living
- plants / animals
- conductors / insulators
- solids / liquids
- renewable / non-renewable
- prokaryote / eukaryote (g912)
- synonym / antonym of a stated word, one set per word group
- noun / verb (vocab-g45)

Every fact must be uncontroversial at its grade.

- [ ] All eight pass the validator.
- [ ] Commit: `content(sorts): science and vocabulary sorts for every band`.

### Task F8: Sort blind pass (a different agent from F7's author)

- [ ] Extract the sheets, answer them without opening the pools, compare, and resolve disagreements in `<poolId>.resolved.json`, as the drills README describes. The gate test requires a PASS for all eight.
- [ ] Commit: `content(sorts): blind pass for every sort pool`.

### Task F9: Science deeds become locks, and Puzzle practice

**Files:**
- `deeds.ts`: the five science deeds become `mechanic: "lock"`.
- Re-record only the snapshots that change, adding choice-pinned twins.
- `RUN_EFFECTS.world` (R-F9), its schema enum entry (TS-only; confirm `db:generate` emits nothing), and the UI kind branches for `world` (headline "Puzzles solved!", no stars row, no building).
- Create `actions/practice.ts`: `startPracticeRun(childId)`.
  - hero only;
  - refused when locks are off;
  - 3 tasks from the hero's logic skill at their grade, via `kindForSkill("lock", …)`;
  - resumes `sourceRef "practice"`.
- A Side Quests page button "Puzzle practice", shown when locks are on, playing in the page player.

- [ ] **Tests:**
  - a grade-2 science run with sorts plays and completes with stars and pay;
  - locks off gives all choice, and the practice button is hidden;
  - a stored pre-deploy science choice run still resumes (Review Focus 5);
  - practice pays nothing, moves mastery, and refuses a grown-up.
- [ ] Commit: `feat(deeds): science side quests sort on a lock's face; logic gets Puzzle practice`.

### Task F10: Verify, review, merge (4a)

- [ ] Full checks.
- [ ] Browser smoke:
  - a K hero's first lock demo, then a pattern;
  - a grade-3 science sort with a wrong bin, then the marked rule, then a right retry;
  - a grade-6 cage with a miss, then the solved board revealed;
  - a grade-10 nonogram;
  - Puzzle practice;
  - locks off gives choice;
  - phone width.
- [ ] Whole-branch review, one fix wave, then merge into `dev` (pre-authorized when green).

---

# Part G: Slice 4b, the world's locks (branch `realm-world-locks`, cut from `dev` after 4a merges)

## Rulings

- **R-G1:** `realm_world_state (id, child_id → child cascade, object_id, state text, updated_at)`, unique on `(child_id, object_id)`, in migration 0044. A pure `lockedNow(object, row, today, zone)`:
  - an object with no row is locked;
  - `"open"` with no `resetAfterDays` stays open;
  - with `resetAfterDays`, it locks again once `today − dayOf(updated_at) ≥ resetAfterDays`.
- **R-G2: objects (`WORLD_OBJECTS`, pure catalog).**
  - **Chests** (`resetAfterDays: 7`) stand at fixed village and room spots from the survey. Each refill's puzzle is seeded by `(objectId, cycle)`.
  - **Vault doors** (once) stand near the five authored places. Each reveals a generated place (a map fragment) and a lore page.
  - Every object's lock draws from the hero's logic skill. A chest in the library or garden draws a vocab or science sort instead, when those pools exist.
- **R-G3: opening.**
  - A `world` run of ONE lock task, started by `startWorldLockRun(childId, objectId)`: hero only; refused while the object is still open; resumes on `sourceRef = objectId`.
  - In the completion hook, when the task resolved right (first or second try), upsert the state `"open"` and apply the reward, both idempotent through the unique index.
  - A miss leaves the object locked, and the hero can try again with a fresh puzzle.
- **R-G4: rewards.** Never materials.
  - **`decor`:** an entry in a small `DECOR` catalog of boxes, drawn at its fixed spot (owner: "appear at set spots"). The spot is held clear by `world-clearance.ts`.
  - **`lore`:** an entry in a `LORE` catalog of short pages, shown in a new "Found pages" section of the Chronicle book. `getChronicle` returns `lore`.
  - **`fragment`:** a generated place id, applied with `addPlacesFound`, plus the toast "You found a map to {place}!". The client store adds it too.
- **R-G4b: Puzzle Tower runs.** `RUN_EFFECTS.tower` has every effect false. A tower run moves nothing but the tower record.
- **R-G5: the Puzzle Tower.**
  - A fixed structure at (25.5, 23.5), 8×8, the only free plot. It is not a `BUILDINGS` entry: it has its own catalog entry and clearance test.
  - It has one floor per band. A floor opens after 3 stars on any lock deed at that band (`deed_run.kind='deed'`, `deed_id` among lock deeds, `band`, `stars = 3`), checked by one query.
  - Each open floor offers a bonus lock, harder by one level, as a `tower` run.
  - The record is `realm_world_state` `tower:<band>`, with state = solved count.
  - The exterior grows one storey per open floor.
- **R-G6: interactables.**
  - New interact kinds: `"lock"` (chests and doors) and `"tower"`, added to the overlay chain's negative list.
  - Room chests get an optional third argument on `roomSpots`, so the existing three-spot tests keep their shape.
  - Chests and doors are non-solid (heaps precedent). A vault door's frame is drawn beside the path, not across it.

### Planner calls (2026-11-20, against `dev` b4443b2; the code forced each one)

- **PC-G1: one table, namespaced ids.** `realm_world_state.object_id` holds `chest:<id>` and `door:<id>` (state `"open"`), `decor:<id>` (state `"placed"`), `lore:<id>` (state `"found"`) and `tower:<band>` (state = the solved count as text). *Reason:* a chest relocks weekly, but the decoration it gave must stay. So rewards need rows of their own, and R-G1's one generic table holds them.
- **PC-G2: an open is a compare-and-set, with its rewards in the same transaction.** It runs inside `withChildLock(childId, tx => …)`:
  - read the hero's rows, then check `lockedNow`;
  - no row: insert, `onConflictDoNothing`, `returning`;
  - a row: `update … where id = row.id and updated_at = <the value read>`, `returning`;
  - only a call that gets a row back writes the rewards.

  `addPlacesFound` gains an optional `exec: Exec = db` (as `loadRealmSettings` has), so a fragment is written in the same transaction.

  *Reason:* `withChildLock` queues within one process only (`realm-play.ts`), and a relocked chest already has a row. Without the compare-and-set, two isolates would both see "locked" and both pay the reward. The unique index alone can't stop that.
- **PC-G3: each world-lock start is seeded with `Date.now() >>> 0`, as every run start is** (`startPracticeRun`, `startBuildRun`). *Reason:* R-G2 seeds by `(objectId, cycle)`, but R-G3 wants a fresh puzzle after a miss, and the two conflict. A resumed run already keeps one puzzle stable for 60 minutes (`findOpenRun`). Generators stay pure; the seed is chosen on the server.
- **PC-G4: which skill a lock draws** (`worldLockSkill`, pure):
  - `draws: "logic"`: the skill Puzzle practice would draw. That is `practiceSkill(grades.logic, focusSkillIds)` (now exported from `practice-run.ts`), so the grown-up's logic focus counts here too.
  - `draws: "vocab" | "science"`: the skill `${prefix}-${bandForGrade(grades[area])}` (area `language` or `science`), when `TASK_KINDS.lock.presents` it. Otherwise it is logic, as above.
  - Today: `science-*` has a pool at every band; `vocab-*` only at `g45`/`g68`/`g912` (grades 5, 6 and 9).
  - So a hero whose language grade is K–3 gets a **logic** lock at the library chest, never a vocab `choice` question.
- **PC-G5: what a chest gives.** Each opening gives the first reward in the chest's `rewards` the hero does not yet own (one per opening). A vault door gives all of its rewards at once (it opens once). A chest whose rewards are all owned still opens, and gives nothing new (owner question Q3).
- **PC-G6: with locks switched off**, follow R-F7 ("Puzzle practice is hidden"):
  - chests and vault doors are neither drawn nor offered to E;
  - `startWorldLockRun` and `startTowerRun` refuse with `WORLD_LOCKS_OFF`;
  - the Tower is still drawn, with no E spot;
  - decorations already won stay.

  Owner question Q4 can change this; it is one pure function, `worldCanvas`.
- **PC-G7: only the hero finishes a world-object or tower run.** `completeDeedRun` refuses a grown-up with `WORLD_HERO_ONLY` before anything is written, as it does build runs. A grown-up with edit access could otherwise finish the hero's open chest run. Puzzle practice (`sourceRef "practice"`) keeps 4a's behaviour.
- **PC-G8: the floor query counts science deed runs by the deed's identity.** It counts `deed_id IN (the lock deeds)` whether that run played as sorts or, with locks off, as `choice`. *Reason:* this is R-G5's literal query. `deed_run.band` is set at start from `bandForGrade(gradeForDeed(hero, deed))`, so it is the hero's **science** band, offset included. Telling a sorts run from a choice run would need a JSON scan, and the Tower is unplayable with locks off anyway.
- **PC-G9: E spots go through `World`, drawing through its siblings.** `buildSpots` runs inside the memoised `World` (`spike-scene.tsx`, the `spots` memo). So lock and tower spots need one new optional `World` prop, `locks`, added to that memo's deps, as `built` is. The chests, doors, decorations and Tower are drawn by siblings of `<World>` (`<WorldLocks>`, `<Decorations>`, `<PuzzleTower>`).

  `SpikeScene` takes one new stable prop, `worldLocks?: WorldCanvas`. The Tower's collider is static: one line in the `solids` memo, as `riddleStoneColliders` is.
- **PC-G10: an open chest or door keeps its E spot.** Its verb becomes "Look in" or "Look through". Its board then says it is open and starts nothing. *Reason:* otherwise a child who walks back to the chest gets no answer at all.
- **PC-G11: the component is `WorldLockBoard` (`world-lock-board.tsx`).** *Reason:* `src/lib/tasks/lock-board.ts` already exists (4a's board geometry).
- **PC-G12: the Tower.**
  - The base is always drawn; one storey is added per open floor (at most 5).
  - The body is 6×6 on the 8×8 plot. Its one static collider is as tall as all five storeys.
  - A floor's lock is `logic-<band>`, at `min(mastery + 1, MASTERY_MAX)`.
  - No demo (`DEMO_RUN_KINDS` stays `deed`/`build`/`world`), no second chances (`RUN_EFFECTS.tower`).
- **PC-G13: the fragment toast reuses `DeedToast`.** It gains an optional `icon?: "map"`, and `DeedToastBanner` skips the pips when `total === 0` (one guard in `guide-hud.tsx`). The toast is held until the board closes: an open overlay pauses the HUD (`{!paused && <DeedToastBanner/>}`), so a toast set mid-board would time out unseen.
- **PC-G14: vault doors are offsets from their place**, on the riddle-stone precedent (`riddleStonePosition`). The riddle-stone tests (dry ground, more than 3 from every track and road, more than 1 from solid scenery, outside every other spot's reach) are the arbiter. G1 gives starting offsets; the implementer may move a door at most 3 units if a test fails, and records the move in the commit.
- **PC-G15: the world state is assembled after the child row is read**, from rows read in the first parallel round. The child row is already read for `today`, so the zone costs no extra round trip (G6 pins the read budget).
- **PC-G16: `RunKind` gains `"tower"` in G2, together with `deed_run.kind`'s TS enum.** `insertRun` returns `values.kind` as a `RunKind`, so the two must change together. `db:generate` emits nothing for the enum (as with `world` in F9); 0044 holds only the table (G1).
- **PC-G17: the world-lock hook runs only when `run.kind === "world" && isWorldObjectId(run.sourceRef)`.** So Puzzle practice gets no `world` outcome.

### Owner questions (each answer changes one named function or constant; until answered, build the ruling as written)

- **Q1, which floors a hero can open** (`towerFloorsOpen`, G5). A hero plays science side quests at one band only: their science grade's, offset included. Under R-G5 as written, every other floor waits for ever. The options:
  - (a) as written;
  - (b) 3 stars at band *b* opens every floor up to *b*;
  - (c) the board shows only the hero's own science band's floor and floors already open.
- **Q2, the waiting floor's copy** (`TOWER_WAITING`, G5). R-G5's "{band}" names a grade range ("Kindergarten – Grade 1") to a child. The options:
  - (a) as written;
  - (b) "Earn 3 stars on a science side quest to open this floor.", with no band;
  - (c) floors named by their puzzles ("the Floor of Shapes"), with (b)'s line.
- **Q3, what an emptied chest gives** (`nextRewards` and `CHEST_EMPTY`, G1/G3). The options:
  - (a) it opens and gives nothing new, with a kind line;
  - (b) it stops relocking once emptied and stays open;
  - (c) more rewards are authored, so no chest empties within a school year.
- **Q4, what locks-off does to the world** (`worldCanvas`, G3; PC-G6). The options:
  - (a) chests and doors vanish, and the Tower has no prompt;
  - (b) they stay and still play logic and sorts: the switch governs side quests only, and its hint text changes to say so;
  - (c) they stay drawn, sealed, with "The locks are resting for now."

## Global constraints for Part G

Part F's constraints still apply, plus:

- **Never materials, minutes or stars.**
  - `RUN_EFFECTS.world` (4a) and `RUN_EFFECTS.tower` (every effect false) are the only effects these runs have.
  - No path writes `realm_material` or `realm_play_ledger`, or sets `deed_run.stars` above 0.
- **Hero only, family scoped.**
  - Every new action starts `requireChildAccess(childId, { write: true })`, then `isChildActor` (else `WORLD_HERO_ONLY`), then the locks switch (else `WORLD_LOCKS_OFF`). This is `startPracticeRun`'s order.
  - A grown-up's visit reads the world state (the bundle) and the found pages (`getChronicle`), and opens nothing.
- **Leak rule.** A world or tower run is written only by `insertRun` and resumed only by `resumedStart`, so the browser sees `toClientTask` views. No new path serialises a `Task`.
- **Once means once.** Rewards are written only by the call whose compare-and-set or insert returned a row (PC-G2). The tower count moves only in the run-closing call (`completeDeedRun`'s atomic close).
- **The Realm rules** (`.superpowers/realm-rules.md`):
  - edits to `realm-game.tsx`, `spike-scene.tsx`, `frame-hud.tsx`, `hud.tsx` and `hud-bus.ts` are additive lines only;
  - painters are new files;
  - no `three` under Vitest: box geometry lives in pure `src/lib/realm3d/world-lock-boxes.ts`;
  - `World` stays memoised, and `worldLocks` is referentially stable;
  - no `Math.random`;
  - browser checks press keys and never click the canvas.
- **The server's day.** `lockedNow` reads the family's zone (`usableTimeZone(getTimezoneForChild)`) and the server's date. The device clock is never used.
- **Copy** (constants in `src/lib/utils/world-lock-copy.ts`):

  **Verbs:**
  - chest: "Open" / "Look in";
  - door: "Open" / "Look through";
  - Tower: "Climb".

  **Labels:**
  - "the old chest";
  - "the vault door";
  - "the Puzzle Tower".

  **Run headers' stories:**
  - `CHEST_STORY` = "An old chest, shut with a puzzle for a lock."
  - `DOOR_STORY` = "A vault door, sealed with a puzzle."
  - `TOWER_STORY` = "A bonus puzzle, just for the joy of it."

  **Refusals** (added to `KNOWN` in `deed-refusals.ts`):
  - `WORLD_HERO_ONLY` = "Locks are for the hero to open."
  - `WORLD_OPEN` = "That's already open."
  - `WORLD_LOCKS_OFF` = "The locks are resting for now."
  - `TOWER_SHUT` = "That floor isn't open yet."

  **Result headlines** (`resultHeadline`):

  | Outcome | Title | Line |
  |---|---|---|
  | a chest opens | "The chest opens!" | |
  | a door opens | "The vault door swings open!" | |
  | a miss | "The lock holds." | "Try again with a fresh lock." |
  | already open | "It was already open." | |
  | an error | "The lock stuck." | "Try it again." |
  | a tower solve | "Floor solved!" | |
  | a tower miss | "The puzzle holds." | "Every climb makes you sharper." |

  **Reward lines:**
  - "Inside: {decor label}. Look for it in the village."
  - "Inside: a page for your Chronicle, “{title}”."
  - "Inside: a map and a page for your Chronicle."
  - `CHEST_EMPTY` = "You've found everything this chest holds. Its lock is still yours to solve." (Q3)

  **Board lines:**
  - `CHEST_OPEN_LINE` = "You opened this chest. A new lock comes next week."
  - `DOOR_OPEN_LINE` = "The vault stands open. Its map is yours."

  **Toasts and finish labels:**
  - Toast: "You found a map to {place}!" / "Look for it on your map."
  - `TOWER_FINISH` = "Finish the climb".
  - The Chronicle's section: "Found pages".
- **No child-facing grade or band label** outside the owner's answer to Q2.

## Review Focus (Part G)

1. **Two tabs, two runs, one chest.** Both runs resolve right and finish at once in two isolates. The chest opens once, one reward row is written, and one summary says `already-open`. Pinned in G2.
2. **The weekly refill at a time-zone edge.** A chest opened at 23:30 local (06:30 UTC the next day) relocks on the seventh local day, not the eighth. Pinned in G1 (`lockedNow`) and G2 (start, real DB).
3. **A grown-up can't open a lock.** A grown-up is refused at start, and refused at finish on the hero's open run, with nothing written. They still see the state and the pages. Pinned in G2 and G4.
4. **No solution reaches the browser.** The `RunStart` of a fresh and of a resumed chest run, serialised, has no `"solution"`. Pinned in G2.
5. **A K–3 hero at the library chest** gets a logic lock: no vocab pool at their band, so never a `choice` task or a throw. Pinned in G2.

**Execution order:** G1, G2, G3, G4, G5, G6, G7. G3 needs G2's outcome type; G5 reuses G2's start shape and G3's board and hook.

## File map (Part G)

| File | Responsibility |
|---|---|
| `src/lib/db/schema.ts`, `migrations/0044_realm_world_state.sql` | `realmWorldState`; `deed_run.kind` enum gains `tower` (G2) |
| `src/lib/realm/world-objects.ts`, `lore.ts`, `world-state.ts`, `puzzle-tower.ts` (new, pure, client-safe) | catalogs, `lockedNow`, `nextRewards`, the view and its mirror, the Tower's place and rules |
| `src/lib/utils/world-lock-run.ts` (new, server: imports the registry) | `worldLockSkill`, `buildWorldLockRun` |
| `src/lib/utils/world-lock-copy.ts` (new) | the copy above |
| `src/lib/services/realm-world-state.ts` (new) | reads, `openWorldObject`, `bumpTowerRecord`, `loadTowerFloorsOpen`, `loadFoundPages`, `worldClock` |
| `src/lib/actions/world-locks.ts` (new) | `startWorldLockRun`, `startTowerRun` |
| `src/lib/realm3d/world-lock-boxes.ts` (new, pure) | chest, door, decor and tower boxes |
| `src/components/realm3d/world-locks.tsx`, `decorations.tsx`, `puzzle-tower.tsx` (new) | painters, siblings of `World` |
| `src/components/realm3d/world-lock-board.tsx`, `tower-board.tsx`, `use-world-state.ts` (new) | boards and the frame's hook |
| `src/test/world-clearance.ts`, `src/test/realm-db-ddl.ts` | `villagePieces`, `segmentDistance`; `REALM_WORLD_STATE_DDL`, `REALM_PLACE_FOUND_DDL`, `DEED_RUN_DDL` |

## Tasks

### Task G1: The world state's table, catalogs and rules (pure)

**Files:**
- Modify `src/lib/db/schema.ts`: add `realmWorldState`, keyed by `id`:
  - `child_id`, references `child`, cascade;
  - `object_id` text;
  - `state` text;
  - `updated_at` timestamp;
  - `uniqueIndex("realm_world_state_child_object_idx").on(childId, objectId)`.

  Generate: `npm run db:generate -- --name realm_world_state` (→ `0044_realm_world_state.sql`), then `npm run db:migrate`.
- Modify `src/test/realm-db-ddl.ts`: `REALM_WORLD_STATE_DDL` (the table plus its unique index, as 0044 writes them).
- Modify `src/test/world-clearance.ts`. Export:
  - `villagePieces(): { what: string; rect: R }[]`: the keep yard's spots and hall boxes, `VILLAGE_DECOR_SPOTS`, every improvement's boxes and plaque at level 3, every villager, `VILLAGE_POST` and `ARCH`;
  - `segmentDistance(p, a, b)`, moved from `riddle-stones.test.ts`.

  `keep-yard.test.ts` and `riddle-stones.test.ts` import them; their local copies go (DRY).
- Create `src/lib/realm/lore.ts`, `world-objects.ts`, `world-state.ts`, `puzzle-tower.ts`, each with a test.
- Modify `src/lib/realm3d/interiors.test.ts`: a describe for the room chests.
- Spec §2a: add "Calls settled for slice 4b": R-G1–R-G6 and PC-G1–PC-G17, one line each.

**Interfaces (produces):**
- `lore.ts`:
  - `type LoreId` is the union of the ten ids below;
  - `LORE: Readonly<Record<LoreId, { title: string; text: string }>>`;
  - `LORE_IDS`.
- `world-objects.ts`:
  - `type DecorId`;
  - `DECOR: Readonly<Record<DecorId, { label: string; x: number; z: number; ry: number }>>`;
  - `DECOR_IDS`;
  - `type WorldReward = { kind: "decor"; id: DecorId } | { kind: "lore"; id: LoreId } | { kind: "fragment"; placeId: string }`;
  - `rewardKey(r): string`, giving `"decor:<id>"`, `"lore:<id>"` or `"place:<id>"`;
  - `type WorldObject = { id: string; type: "chest" | "door"; label: string; x: number; z: number; ry: number; room?: RoomKind; resetAfterDays?: number; draws: "logic" | "vocab" | "science"; rewards: readonly WorldReward[] }`. `x`/`z` are room-local when `room` is set; a door's position is resolved from `placeById(placeId)` plus its offset;
  - `WORLD_OBJECTS: readonly WorldObject[]`;
  - `worldObjectById(id: string | null | undefined): WorldObject | null`, own entries only;
  - `isWorldObjectId(id: unknown): id is string`;
  - `CHEST_RESET_DAYS = 7`.
- `world-state.ts`:
  - `type WorldRow = { objectId: string; state: string; updatedAt: Date }`;
  - `lockedNow(object: Pick<WorldObject, "resetAfterDays">, row: Pick<WorldRow, "state" | "updatedAt"> | null, today: string, zone: string): boolean`;
  - `nextRewards(object: WorldObject, owned: ReadonlySet<string>): WorldReward[]`. `owned` holds `decor:`/`lore:` object ids;
  - `type TowerFloorView = { band: ContentBand; open: boolean; solved: number }`;
  - `type WorldStateView = { locksOn: boolean; open: string[]; decor: DecorId[]; tower: TowerFloorView[] }`;
  - `EMPTY_WORLD_STATE`;
  - `worldStateView(rows: readonly WorldRow[], floorsOpen: ReadonlySet<ContentBand>, clock: { today: string; zone: string }, locksOn: boolean): WorldStateView`.
- `puzzle-tower.ts`:
  - `PUZZLE_TOWER = { x: 25.5, z: 23.5, plot: 8, body: 6, baseH: 3.2, storeyH: 2.4, door: { x: 22.2, z: 23.5 } }`;
  - `TOWER_FLOORS = CONTENT_BANDS`;
  - `towerRef(band) → "tower:<band>"`;
  - `bandOfTowerRef(ref: string | null): ContentBand | null`;
  - `towerSkillId(band) → "logic-<band>"`;
  - `towerColliders(heightAt): Collider[]`.

**The catalog** (positions are starting spots from the survey; the tests arbitrate):

| object | at | draws | rewards, in order |
|---|---|---|---|
| `chest:west-lane` | (-19.5, 12), ry π/2 | logic | decor `stone-bench`, decor `sundial`, lore `the-first-lock` |
| `chest:east-lane` | (19.5, 10), ry −π/2 | logic | `flower-cart`, `bird-bath`, lore `the-locksmith` |
| `chest:castle-back` | (14.25, −41) | logic | `weather-vane`, `hay-bales`, lore `the-castle-cellar` |
| `chest:library` | room `library` (2.0, 3.0) | vocab | `story-post`, `barrel-stack`, lore `the-scribes-cipher` |
| `chest:garden` | room `garden` (0, 1.0) | science | `herb-planter`, `scarecrow`, lore `the-glasshouse-key` |
| `door:ringstones` | place + (0, 7) | logic | fragment `summit-7`, lore `ringstones-map` |
| `door:highcairn` | place + (−6, 3) | logic | fragment `summit-6`, lore `highcairn-map` |
| `door:longwater` | place + (7, 0) | logic | fragment `cove-12`, lore `longwater-map` |
| `door:farfurrow` | place + (3, 6) | logic | fragment `deepwood-10`, lore `farfurrow-map` |
| `door:appleway` | place + (5, −3) | logic | fragment `deepwood-9`, lore `appleway-map` |

- Doors face their place's centre: `ry = Math.atan2(-offset.x, -offset.z)`.
- Decor spots:

  | decor | (x, z) |
  |---|---|
  | `stone-bench` | (−18, 8) |
  | `sundial` | (−20.5, 16) |
  | `flower-cart` | (18.5, 6.5) |
  | `bird-bath` | (20.5, 13.5) |
  | `weather-vane` | (19, −5) |
  | `hay-bales` | (22, 1.5) |
  | `scarecrow` | (5, 17) |
  | `barrel-stack` | (−3.25, 26.5) |
  | `herb-planter` | (7.5, −10.25) |
  | `story-post` | (−15, −31) |
- **Lore:**
  - each page is 2–4 sentences, at most 320 characters;
  - plain text;
  - the Realm's voice;
  - no grades;
  - a door's page tells of the place its map leads to.

- [ ] **Step 1: Write the failing tests.**

  **`world-state.test.ts`:**
  - "an object with no row is locked": `lockedNow({}, null, "2026-11-09", "UTC") === true`.
  - "a door once open stays open": a row `{state:"open", updatedAt: 2026-01-01}` with no reset gives `false` on `"2027-06-01"`.
  - "a chest relocks on the seventh day in the family's zone". The row is `updatedAt = new Date("2026-11-03T06:30:00Z")`, which is the 2nd in America/Denver.
    - In `"America/Denver"`: `"2026-11-08"` gives `false`; `"2026-11-09"` gives `true`.
    - In `"UTC"`: `"2026-11-09"` gives `false` (Review Focus 2).
  - "a chest gives its next unowned reward, one at a time". For `chest:west-lane` with owned `{}`, `nextRewards` gives `[decor stone-bench]`. With `{"decor:stone-bench"}` it gives `[decor sundial]`. With all three owned it gives `[]`.
  - "a door gives everything at once": `door:ringstones` gives `[fragment summit-7, lore ringstones-map]`.
  - "the view". Rows: `chest:west-lane` open today, `chest:east-lane` opened 8 days ago, `decor:sundial`, `tower:g23 = "2"`, `tower:k1 = "x"`; `floorsOpen = {g23}`. The view gives:
    - `open: ["chest:west-lane"]`;
    - `decor: ["sundial"]`;
    - `tower`: `g23` is `{open:true, solved:2}`; `k1` is `{open:false, solved:0}`;
    - five floors in `CONTENT_BANDS` order;
    - unknown object ids are skipped.

  **`world-objects.test.ts`:**
  - "ids are unique and prefixed `chest:`/`door:`".
  - "chests reset after 7 days; doors never".
  - "every reward resolves; every decor and lore id is given by exactly one object".
  - "fragments are generated places": each fragment is in `REALM_PLACE_IDS`, not among the `PLACES` ids, and distinct.
  - "one door per authored place".
  - "room chests are the library's (vocab) and the garden's (science) only".
  - "every village chest and decor spot clears the village":
    - `clearanceFailures(what, rectAt(x, z, 1.4, 1.4), undefined, 0)` is `[]`;
    - `levelFailures(...)` is `[]`;
    - nothing within 1.0 of a `villagePieces()` rect or of another chest or decor;
    - nothing within 1.5 of the Tower's 8×8 plot.
  - The door tests copy the riddle-stone describe:
    - dry;
    - `segmentDistance` greater than 3 from every `VILLAGE_TRACKS` line and `world.roads` line;
    - more than 1 from solid `SCENERY`;
    - outside every `others` spot's reach, and every riddle stone's;
    - each riddle stone outside the door's reach (1.4).

  **`interiors.test.ts` "the room chests":** each room chest stands on the flood-reachable floor (`reachable`), at least 2.5 from the fixture, keeper, door and spawn, with `!roomBuried(plan.solids, x, z, 0, 1.3)`.

  **`puzzle-tower.test.ts`:**
  - "the plot clears the village": `clearanceFailures("tower", rectAt(25.5, 23.5, 8, 8), undefined, 1.5)` is `[]`, `levelFailures` is `[]`, and nothing within 1.5 of `villagePieces()`.
  - "refs round-trip": `bandOfTowerRef(towerRef("g68")) === "g68"`; `bandOfTowerRef("tower:g7")`, `("chest:x")` and `(null)` all give `null`.
  - "every floor names a logic skill": `findSkill(towerSkillId(b))?.area === "logic"` for every band.
  - "one collider": `towerColliders(() => 0)` equals `[{ x: 25.5, z: 23.5, hw: 3, hd: 3, round: false, base: -1, top: 3.2 + 5 * 2.4 }]`.

- [ ] **Step 2:** `npx vitest run src/lib/realm/world-state.test.ts src/lib/realm/world-objects.test.ts src/lib/realm/puzzle-tower.test.ts src/lib/realm3d/interiors.test.ts src/lib/realm/keep-yard.test.ts src/lib/realm/riddle-stones.test.ts --maxWorkers=2`. Expected: FAIL. The new files fail with "Cannot find module"; the two refactored files fail on the missing `villagePieces` and `segmentDistance` exports.
- [ ] **Step 3: Implement.**
  - **Schema:** generate, then migrate. Expected: `0044_realm_world_state.sql` holds exactly `CREATE TABLE realm_world_state` plus `CREATE UNIQUE INDEX realm_world_state_child_object_idx`. Commit the migration and its meta.
  - **Modules:** write the four modules to the interfaces above. `lockedNow` is:

    ```ts
    if (!row || row.state !== "open") return true;
    if (object.resetAfterDays === undefined) return false;
    return addDays(todayInZone(zone, row.updatedAt), object.resetAfterDays) <= today; // ISO strings compare as dates
    ```
  - **Spot fixes:** if a spot test fails, move the spot within the survey's clear ranges (decor and chests) or by at most 3 units (doors, PC-G14). Name the move in the commit.
- [ ] **Step 4:** the same command, then `npx tsc --noEmit`. Expected: all PASS, 0 type errors.
- [ ] **Step 5: Commit** the schema, migration and meta, the DDL, the four modules and their tests, the clearance helper and its two users, and the spec. Message: `feat(realm): the world's locks: a state table, chests, doors, decor, lore and the Tower's plot`.

### Task G2: Opening a lock on the server

**Files:**
- Modify `src/lib/utils/deed-scoring.ts`: `RunKind` gains `"tower"`; `RUN_EFFECTS.tower` has every effect `false` (R-G4b).
- Modify `deed-scoring.test.ts`: the `tower` block. `kindsThatFeedReview().sort()` stays `["build","deed","review","world"]`.
- Modify `schema.ts`: `deed_run.kind` gains `"tower"`. Run `db:generate`; expected: "No schema changes" (PC-G16).
- Modify `talk.ts`: `finishLabel` gets `case "tower": return TOWER_FINISH`.
- Create `src/lib/utils/world-lock-copy.ts`.
- Modify `deed-refusals.ts`: the four refusals, added to `KNOWN`.
- Modify `practice-run.ts`: `export function practiceSkill`.
- Create `src/lib/utils/world-lock-run.ts` + test.
- Modify `src/lib/services/realm-places.ts`: `addPlacesFound(childId, placeIds, exec: Exec = db)`.
- Create `src/lib/services/realm-world-state.ts`.
- Create `src/lib/actions/world-locks.ts`.
- Modify `deed-run-types.ts` (`WorldOutcome`, `RunSummary.world?`) and `actions/deeds.ts` (`completeDeedRun`).
- Modify `src/test/realm-db-ddl.ts`: `REALM_PLACE_FOUND_DDL` (copied from `realm-places.test.ts`, which then imports it) and `DEED_RUN_DDL` (new tests use it; existing copies stay).
- Test: `src/lib/actions/world-locks-db.test.ts` (real libsql, set up as `practice-db.test.ts` is, plus `vi.mock("@/lib/services/family-timezone", …)` giving `getTimezoneForChild` → `"America/Denver"`).

**Interfaces:**
- **Consumes** G1's catalog and rules, plus `insertRun`, `findOpenRun`, `resumedStart`, `demoAt`, `loadMasteryRows`, `withChildLock`, `loadHeroLevels`, `loadRealmSettings`, `enabledHandsOnKinds`, `drawForSkill` and `applyProfile`.
- **Produces:**
  - `type WorldOutcome = { objectId: string; opened: boolean; reason?: "missed" | "already-open" | "error"; rewards: WorldReward[] }`; `RunSummary.world?: WorldOutcome`.
  - `worldLockSkill(object: Pick<WorldObject, "draws">, grades: Record<SkillArea, Grade>, focusSkillIds: readonly string[]): { skill: Skill; grade: Grade } | null` (PC-G4).
  - `buildWorldLockRun(input: { skill: Skill; level: number; seed: number; enabledKinds: ReadonlySet<TaskKind>; profile: ProfileLike }): BuiltRun`. It is exactly one task, `kindForSkill("lock", …)`; it is empty when that is not `"lock"`.
  - `worldClock(childId: string, now?: Date): Promise<{ today: string; zone: string }>` = `{ today: (await realmNow(childId, now)).date, zone: usableTimeZone(await getTimezoneForChild(childId)) }`. Tests mock both, as `practice-db.test.ts` mocks `realmNow`.
  - `loadWorldRows(childId: string, exec?: Exec): Promise<WorldRow[]>`.
  - `openWorldObject(childId: string, object: WorldObject, now: Date, clock: { today: string; zone: string }): Promise<WorldOutcome>`, the PC-G2 algorithm.
  - `startWorldLockRun(childId: string, objectId: string): Promise<RunStart>`.

**`startWorldLockRun`, in order:**
1. Access and hero (`WORLD_HERO_ONLY`).
2. `worldObjectById`, else `NOT_IN_CHRONICLE`.
3. Hero levels and settings in parallel: `CLOSED`, then `WORLD_LOCKS_OFF`.
4. `worldClock` plus this object's row: `lockedNow` false gives `WORLD_OPEN`.
5. `findOpenRun(childId, kind "world", sourceRef = object.id)`: resume, with `demoAt` at the drawn grade.
6. `worldLockSkill`, the hero's mastery of that skill (capped at `MASTERY_MAX`), and `buildWorldLockRun`; an empty run gives `NONE_READY`.
7. `insertRun({ …, deedId: null, sourceRef: object.id, band: bandForGrade(grade), kind: "world", secondChances: RUN_EFFECTS.world.allowsSecondChances && settings.secondChances })`, with header `{ id: object.id, title: <object.label capitalised: "The old chest">, story: CHEST_STORY or DOOR_STORY, area: skill.area }`.

**`completeDeedRun`:**
- After the `build` guard: `if (worldOwned(run) && !isChildActor(access)) throw new Error(WORLD_HERO_ONLY)`, where `worldOwned = run.kind === "tower" || (run.kind === "world" && isWorldObjectId(run.sourceRef))` (PC-G7).
- After `improvement`: `const world = run.kind === "world" && isWorldObjectId(run.sourceRef) ? await finishWorldLockRun(run.childId, run.sourceRef, outcomes[0], now) : undefined`.
- Add `...(world ? { world } : {})`.
- `finishWorldLockRun` is a best-effort wrapper like `finishBuildRun`:
  - a `"miss"` gives `{ opened: false, reason: "missed", rewards: [] }` and writes nothing;
  - a throw gives `reason: "error"`.

- [ ] **Step 1: Write the failing tests** (`world-locks-db.test.ts`; hero `grades` as practice's `HERO`; mocked `realmNow` date `"2026-11-09"`):
  - "starts one lock at the hero's logic grade, a world run named by the chest". `start.kind === "world"`, `start.questions.length === 1`, `start.questions[0].kind === "lock"`. The row has `source_ref = 'chest:west-lane'`, `deed_id IS NULL`, `band = 'g45'` (logic `"5"`).
  - "never sends the solution, fresh or resumed": `JSON.stringify(start)` does not contain `"solution"`; a second start returns the same `runId`, also without it (Review Focus 4).
  - "the library chest draws a vocab sort at band g45 (language 5), and a logic lock at language 2" (Review Focus 5):
    - language 5 gives skill ids `["vocab-g45"]`, `view.puzzle === "sort"`;
    - language 2 gives `["logic-g23"]`;
    - neither is ever `kind: "choice"`.
  - "the garden chest draws a science sort": science `"6"` gives `["science-g68"]`.
  - "refuses a grown-up, an unknown id, and `practice`, writing nothing": `WORLD_HERO_ONLY`, `NOT_IN_CHRONICLE`, `NOT_IN_CHRONICLE`; `deed_run` stays empty.
  - "refuses while locks are off": `WORLD_LOCKS_OFF`.
  - "refuses an open chest; it starts again on the seventh local day" (Review Focus 2):
    - a state row with `updated_at = 2026-11-03T06:30Z` (Denver: the 2nd) **starts** on 2026-11-09;
    - a row with `updated_at = 2026-11-03T18:00Z` gives `WORLD_OPEN`.
  - "a right answer opens the chest and gives its first reward". `summary.world` is `{ objectId: "chest:west-lane", opened: true, rewards: [{ kind: "decor", id: "stone-bench" }] }`; the rows are `chest:west-lane="open"` and `decor:stone-bench="placed"`.
  - "a second-try right answer opens it too".
  - "a miss leaves it locked, and the next start is a new run": `reason: "missed"`; no state rows; the new `runId` differs.
  - "the next week's opening gives the next reward; with all three owned it opens and gives `[]`".
  - "a vault door marks its place found and gives its page, and never relocks":
    - `realm_place_found` has `summit-7`;
    - `lore:ringstones-map="found"`;
    - a start 30 days later gives `WORLD_OPEN`.
  - "two runs for one chest finished at once open it once" (Review Focus 1). Insert two open runs, each with a right response; complete them through two `isolate()`s with `Promise.all`. Exactly one `world.opened === true`; the other is `reason: "already-open"`; there is one `decor:` row.
  - "a grown-up can't finish the hero's chest run" (Review Focus 3): `WORLD_HERO_ONLY`; `completed_at` is still null; no state rows.
  - "pays nothing, earns no star, writes no material": `stars === 0`, `minutesEarned === 0`, `realm_play_ledger` and `realm_material` empty.
  - "Puzzle practice finishes with no world outcome": `summary.world === undefined`.

  **`world-lock-run.test.ts`:**
  - `worldLockSkill` for logic follows the logic focus pick in window;
  - a vocab object at language `"K"` falls back to logic;
  - `buildWorldLockRun` with locks disabled gives `{ skillIds: [], questions: [] }`;
  - the same seed gives the same task id.

  **`deed-scoring.test.ts`:** `RUN_EFFECTS.tower` equals the all-false record.
- [ ] **Step 2:** `npx vitest run src/lib/actions/world-locks-db.test.ts src/lib/utils/world-lock-run.test.ts src/lib/utils/deed-scoring.test.ts --maxWorkers=2`. Expected: FAIL with "Cannot find module './world-locks'" and the `tower` assertion.
- [ ] **Step 3:** implement to the interfaces. `openWorldObject` is PC-G2:
  - `withChildLock`;
  - `loadWorldRows(childId, tx)`;
  - `lockedNow`; if false, return `already-open`;
  - compare-and-set; no row back gives `already-open`;
  - the rewards from `nextRewards(object, owned)`: `decor:`/`lore:` rows via `insert … onConflictDoNothing`, fragments via `addPlacesFound(childId, [placeId], tx)`;
  - return `{ opened: true, rewards }`.
- [ ] **Step 4:** the same command, plus `src/lib/actions/practice-db.test.ts src/lib/actions/realm-places.test.ts`, then `npx tsc --noEmit`. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit.** `feat(realm): a chest or vault door opens once its lock is solved, once, for the hero alone`.

### Task G3: Chests and doors in the world and in rooms

**Files:**
- **Bundle:** modify `src/lib/actions/realm.ts`.
  - `RealmBundle.worldState?: WorldStateView`.
  - The first parallel round: `const worldRead = loadWorldRaw(childId).catch(…→ null)`.
  - After the child row (PC-G15): `worldState: raw ? worldStateView(raw.rows, raw.floorsOpen, { today, zone: usableTimeZone(child.timezone) }, settings.mechanics.lock) : EMPTY_WORLD_STATE`.
  - `loadWorldRaw(childId): Promise<{ rows: WorldRow[]; floorsOpen: ReadonlySet<ContentBand> }>` goes in `realm-world-state.ts`. Until G5, `floorsOpen` is an empty set.
- Modify `src/app/(app)/realm/page.tsx` and `RealmData` in `realm-game.tsx`: `worldState: bundle.worldState ?? EMPTY_WORLD_STATE`.
- Modify `world-state.ts`:
  - `type LockSpotView = { id; type; label; x; z; ry; open: boolean }`;
  - `type WorldCanvas = { locksOn: boolean; locks: readonly LockSpotView[]; decor: readonly DecorId[]; storeys: number }`;
  - `worldCanvas(view): WorldCanvas`: world objects only, none when `!locksOn` (PC-G6), `storeys` = open floors;
  - `roomChestFor(room: RoomKind, view): LockSpotView | null`;
  - `applyWorldOutcome(view, o: WorldOutcome): WorldStateView`: the same object when `!o.opened`.
- Modify `hud-bus.ts`: the `InteractTarget.kind` union gains `"lock"`, with a doc line.
- Modify `interact.ts`:
  - `SpotInput.locks?: readonly LockSpotView[]`;
  - `lockTarget(l: LockSpotView): InteractTarget`;
  - the spots: a chest is hw 0.55 / hd 0.4; a door is hw 1.0 / hd 0.3; reach 1.4, bias 0.4, ring +0.6.
- Modify `room-rules.ts`: `roomSpots(plan, keeperName, chest?: LockSpotView | null)`. The chest spot comes before the door, on floor 0.
- Create `src/lib/realm3d/world-lock-boxes.ts`: `chestBoxes(open)` and `vaultDoorBoxes(open)`, returning `YardBox[]` in local space.
- Create `src/components/realm3d/world-locks.tsx`:
  - `WorldLocks({ locks, heightAt })`;
  - exports `ChestMesh({ open })` for rooms;
  - merged, painted, no colliders.
- Modify `spike-scene.tsx` (additive):
  - `RealmCanvasProps.worldLocks?: WorldCanvas`;
  - the `World` prop `locks`, passed into `buildSpots` and added to the `spots` deps;
  - `<WorldLocks locks={worldLocks?.locks} heightAt={world.heightAt} />` beside `<ChronicleFrames>`.
- Modify `interior-scene.tsx`: `RoomViewProps.chest?: LockSpotView | null`, which reaches `RoomWorld`. It feeds `roomSpots`'s third argument and draws `<ChestMesh>` at the chest.
- Create `src/components/realm3d/use-world-state.ts`: `useWorldState(initial, { addPlace, say, placeName, overlayOpen })` gives `{ view, canvas, applyWorldOutcome }`. `canvas` is memoised on a string key, as `useWorks` keys `built`.
- Create `src/components/realm3d/world-lock-board.tsx`: `WorldLockBoard({ childId, object, open, viewer, numerals, profile, calm, onOutcome, onClose })`. Its states are `open | starting | run | error`:
  - it starts once (an `asked` ref, as `RiddleStoneBoard` does);
  - a visitor sees `WORLD_HERO_ONLY`;
  - an open object shows `CHEST_OPEN_LINE` or `DOOR_OPEN_LINE` and starts nothing (PC-G10);
  - the run plays in `<DeedRun>`, with `onResult={(s) => s.world && onOutcome(s.world)}`.
- Modify `realm-game.tsx` (additive lines):
  - the hook;
  - `const lockState = useWorldState(realm.worldState, …)` (not `world`: that name is the island);
  - `worldLocks={lockState.canvas}` on `RealmCanvas`;
  - `chest={roomChest}` on `RoomCanvas`;
  - the `lock` overlay branch;
  - `&& overlay.target.kind !== "lock"` in the negative chain.
- Modify `talk.ts` `resultHeadline`: the `world` branch with an `outcome`. Its copy is per the Global constraints; the reward line comes from `worldRewardLine(o: WorldOutcome): string` in `world-lock-copy.ts`.

**Interfaces:**
- **Consumes:** G1's view and catalog; G2's `startWorldLockRun` and `WorldOutcome`.
- **Produces:** `LockSpotView`, `WorldCanvas`, `worldCanvas`, `roomChestFor`, `applyWorldOutcome`, `useWorldState`, and `RealmCanvasProps.worldLocks`.

- [ ] **Step 1: Write the failing tests.**

  **`world-state.test.ts`:**
  - `worldCanvas` lists the 3 village chests and 5 doors, with `open` set from `view.open`;
  - with `locksOn: false`, `locks` is `[]` and `decor` is kept;
  - `roomChestFor("library", view)?.id === "chest:library"`; `roomChestFor("mill", view) === null`;
  - `applyWorldOutcome` adds the id and the decor; a missed outcome returns the same view object;
  - the locks stay awake in the quiet world: `Object.keys(quietSurfaces(true)).sort()` is still `["recess","riding","troubles"]`.

  **`interact.test.ts` "the world's locks"** (the describe shape of "the plaques"):
  - one spot per lock;
  - verbs "Open" and "Look in" for a chest, "Look through" for an open door;
  - reachable from any side;
  - lets go once walked on;
  - none when none are given.

  **`interiors.test.ts`:**
  - with the library chest, `roomSpots(plan, "Hesper", chest).spots.map(kind)` equals `["villager","fixture","lock","door"]`;
  - standing at the spawn, `pickRoomSpot` still picks the door;
  - the existing three-spot test is unchanged.

  **`world-lock-boxes.test.ts`:**
  - an open chest's highest box is higher than a closed one's;
  - a door's leaf lies inside the frame's width when shut, and outside it when open;
  - every box lies within its footprint.

  **`world-lock-board.test.tsx`** (mocks `@/lib/actions/world-locks`):
  - starts once with `("c1", "chest:west-lane")`;
  - a visitor sees "Locks are for the hero to open." and nothing is started;
  - an open chest shows `CHEST_OPEN_LINE` and nothing is started;
  - a finished run calls `onOutcome` with `summary.world`;
  - a refusal shows `deedErrorLine`.

  **`use-world-state.test.ts`:**
  - `canvas` is the same object across a re-render with equal data, and a new one after an open;
  - an opened outcome adds the chest to `canvas.locks[i].open`.

  **`realm-game.test.tsx`** (adds `vi.mock("@/lib/actions/world-locks", …)`):
  - "opens a chest's lock board when E is pressed at it, and pauses the world" (the shape of the plans board test);
  - `InteractPanel` is not rendered.

  **`realm-bundle.test.ts`:**
  - `worldState` comes from the mocked raw rows;
  - `locksOn` follows the settings row's `mechanics`;
  - a failed read gives `EMPTY_WORLD_STATE`.

  **`talk.test.ts`:** the world headlines, all five outcomes.
- [ ] **Step 2:** run those files. Expected: FAIL (missing exports and modules).
- [ ] **Step 3:** implement to the interfaces.
- [ ] **Step 4:** run them again, then `npx tsc --noEmit` and `npx eslint` on the changed files. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit.** `feat(realm): chests and vault doors stand in the village, the places and two rooms, and open on their lock`.

### Task G4: What locks give, seen in the world

**Files:**
- Modify `world-lock-boxes.ts`: `decorBoxes(id: DecorId): YardBox[]`.
- Create `src/components/realm3d/decorations.tsx`: `Decorations({ decor, heightAt })`, a sibling of `World` (one additive line in `spike-scene.tsx`). It has no colliders, as the heaps have none.
- Modify `realm-world-state.ts`: `loadFoundPages(childId): Promise<{ id: LoreId; title: string; text: string }[]>`. These are the `lore:` rows by `updated_at`, with unknown ids skipped.
- Modify `actions/realm-chronicle.ts`: `getChronicle` returns `{ weeks, canSeal, lore }`, with the two reads in parallel.
- Modify `chronicle-book.tsx`:
  - a "Found pages" button appears when `lore.length > 0`;
  - that view lists title and text as text;
  - "Back to the weeks" returns;
  - an empty Chronicle with found pages still offers the button.

  Update the `getChronicle` mocks in `chronicle-book.test.tsx` and `realm-game.test.tsx` to carry `lore`.
- Modify `talk.ts`:
  - `DeedToast.icon?: "map"`;
  - `fragmentToast(placeName: string): DeedToast` gives `{ title: "You found a map to {place}!", line: "Look for it on your map.", done: 0, total: 0, rose: false, icon: "map", spoken }`.
- Modify `guide-hud.tsx` `DeedToastBanner`: `name={toast.icon ?? …}`, and `<Progress>` only when `toast.total > 0` (PC-G13).
- Modify `use-world-state.ts`:
  - an opened outcome's fragment calls `addPlace(placeId)` at once (the places store queues the hero's own write, a no-op on the server);
  - it holds `fragmentToast(placeName(id))` until `overlayOpen` turns false, then `say`s it.

  `realm-game.tsx` passes `placeName = (id) => world.landmarks.find((l) => l.id === id)?.name ?? "a far place"`.

- [ ] **Step 1: Write the failing tests.**
  - **`world-lock-boxes.test.ts`:** every `DECOR_IDS` entry has ≥1 box, sits within a 1.4 × 1.4 footprint, and stands at most 2.6 tall.
  - **`realm-world-state` DB tests** (a `describe` in `world-locks-db.test.ts`): `loadFoundPages` gives two pages in found order, and skips `lore:nope`.
  - **`realm-chronicle.test.ts`:** a hero and a view-only visitor both get `lore`.
  - **`chronicle-book.test.tsx`:**
    - no button without pages;
    - the button shows the pages;
    - a title of `"<b>x</b>"` renders as literal text;
    - an empty Chronicle with one page still shows the button.
  - **`guide-hud.test.tsx`:** a toast with `total: 0` renders no progress and the map icon.
  - **`use-world-state.test.ts`:**
    - a door outcome calls `addPlace("summit-7")` at once;
    - with `overlayOpen` true, `say` is not called; after a re-render with `overlayOpen` false, it is called once with `title === "You found a map to Thunder Head!"`.
- [ ] **Step 2:** run them. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run them again, plus `src/lib/actions/realm-chronicle.test.ts src/components/realm3d/realm-game.test.tsx`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(realm): decorations appear at their spots, found pages fill the Chronicle, and a map marks its place`.

### Task G5: The Puzzle Tower

**Files:**
- Modify `realm-world-state.ts`:
  - `loadTowerFloorsOpen(childId): Promise<ReadonlySet<ContentBand>>`. This is the floor query: `SELECT DISTINCT band FROM deed_run WHERE child_id = ? AND kind = 'deed' AND deed_id IN (<DEEDS with mechanic "lock">) AND stars = 3` (PC-G8).
  - `loadWorldRaw` reads it in parallel with the rows.
  - `bumpTowerRecord(childId, band, now): Promise<number>`: `insert … values(state "1") onConflictDoUpdate({ set: { state: sql\`CAST(CAST(state AS INTEGER) + 1 AS TEXT)\`, updatedAt: now } }) returning state`.
- Add to `puzzle-tower.ts`, pure:
  - `towerLevel(mastery: number): number` = `Math.min(mastery + 1, MASTERY_MAX)` (PC-G12);
  - `towerFloorsOpen(starredBands: ReadonlySet<ContentBand>): ReadonlySet<ContentBand>`. Under R-G5 it is the identity; Q1's answer changes only this.
- Modify `actions/world-locks.ts`: `startTowerRun(childId: string, band: ContentBand): Promise<RunStart>`. The order:
  1. access, hero, `CLOSED`, `WORLD_LOCKS_OFF`;
  2. the band is validated against `CONTENT_BANDS`, else `NOT_IN_CHRONICLE`;
  3. the floor is open, else `TOWER_SHUT`;
  4. resume on `sourceRef = towerRef(band)`, kind `"tower"`;
  5. the skill `towerSkillId(band)` at `towerLevel(mastery)`, through `buildWorldLockRun`, with header `{ id: towerRef(band), title: "The Puzzle Tower", story: TOWER_STORY, area: "logic" }`;
  6. `secondChances: false`; no demo.
- Modify `deed-run-types.ts`: `type TowerOutcome = { band: ContentBand; solved: number; counted: boolean }`; `RunSummary.tower?`.
- Modify `completeDeedRun`: `tower = run.kind === "tower" ? await finishTowerRun(...)`. On `outcomes[0] === "first"` it calls `bumpTowerRecord`; otherwise it reads the count. It is best-effort, like the world hook.
- Modify `world-state.ts`: `applyTowerOutcome(view, o: TowerOutcome)`. `use-world-state.ts` returns it too.
- `loadWorldRaw` and `startTowerRun` both pass `loadTowerFloorsOpen`'s set through `towerFloorsOpen`.
- Modify `world-lock-copy.ts`:
  - `towerFloorName(i)`: "The first floor" … "The fifth floor";
  - `towerFloorLine(f: TowerFloorView, numerals)`:
    - open with `solved > 0` and numerals: "{n} solved here.";
    - open with `solved > 0`, no numerals: "You've solved puzzles here.";
    - open with 0: "A new puzzle waits.";
    - waiting: `TOWER_WAITING(band)` = "Earn 3 stars on a lock side quest for {BAND_LABELS[band]} to open this floor." (R-G5, pending Q2).
- Modify `talk.ts` `resultHeadline`: the tower branch.
- Modify `deed-board.tsx`: `what` gives `"climb"` for `tower`.
- Modify `world-lock-boxes.ts`: `towerBoxes(storeys: number): YardBox[]` (clamped 0–5).
- Create `src/components/realm3d/puzzle-tower.tsx`: `PuzzleTower({ storeys, heightAt })`.
- Modify `spike-scene.tsx` (additive):
  - `built.solids.push(...towerColliders(world.heightAt))`;
  - `tower: worldLocks?.locksOn ? PUZZLE_TOWER.door : null`, passed into `buildSpots` (PC-G6: no spot with locks off);
  - `<PuzzleTower storeys={worldLocks?.storeys ?? 0} …/>`.
- Modify `interact.ts`: `SpotInput.tower?: { x; z } | null` and `TOWER_TARGET = { kind: "tower", id: "puzzle-tower", label: "the Puzzle Tower", verb: "Climb" }`. The spot is hw 0.7, hd 0.9, reach 1.4, bias 0.4.
- Modify `hud-bus.ts`: the union gains `"tower"`.
- Create `src/components/realm3d/tower-board.tsx`: `TowerBoard({ childId, floors, viewer, numerals, profile, calm, onOutcome, onClose })`.
  - It lists floors from the top down.
  - An open floor has a "Climb" button, for the hero only.
  - Climbing plays `startTowerRun` in `<DeedRun>`; `onResult` passes `s.tower` to `onOutcome`.
- Modify `realm-game.tsx` (additive): the `tower` overlay branch, `!== "tower"` in the negative chain, and the hook's `applyTowerOutcome`.

**Interfaces:**
- **Consumes:** G2's start pattern and `buildWorldLockRun`; G3's hook, `WorldCanvas` and spot plumbing.
- **Produces:** `startTowerRun`, `TowerOutcome`, `loadTowerFloorsOpen`, `towerFloorsOpen`, `bumpTowerRecord`.

- [ ] **Step 1: Write the failing tests.**

  **DB tests** (`world-locks-db.test.ts`, "the Puzzle Tower"):
  - `loadTowerFloorsOpen` gives `{"g23"}` for a 3-star `well-water` run at `g23`. These give the empty set:
    - 2 stars on a science deed;
    - 3 stars on `well-stones` (math);
    - a `challenge` run;
    - a `world` run;
    - an open run.
  - `startTowerRun`:
    - refuses `"g45"` with `TOWER_SHUT`, and a grown-up with `WORLD_HERO_ONLY`;
    - opens `"g23"` with skill ids `["logic-g23"]`;
    - `second_chances = 0`, `source_ref = 'tower:g23'`; resumes;
    - has no `demo` for a grade-2 hero.
  - Finishing:
    - right gives `summary.tower` `{ band: "g23", solved: 1, counted: true }`, then `solved: 2` on a second run;
    - a miss gives `counted: false` and the count is unchanged;
    - `skill_mastery` is untouched; `stars === 0`; `minutesEarned === 0`.

  **`puzzle-tower.test.ts`:**
  - `towerBoxes(0)`'s top equals `PUZZLE_TOWER.baseH`;
  - `towerBoxes(3)`'s top equals `baseH + 3 * storeyH`;
  - `towerBoxes(9)` equals `towerBoxes(5)`;
  - every box lies within the 6 × 6 body;
  - `towerLevel(0) === 1`, `towerLevel(3) === 4`, `towerLevel(4) === 4`.

  **`interact.test.ts` "the Puzzle Tower":**
  - one spot with `TOWER_TARGET`;
  - reachable from the west;
  - outside the Chronicle Hall plaque's reach;
  - none when `tower` is null.

  **`tower-board.test.tsx`:**
  - a visitor sees floors and no "Climb";
  - a waiting floor shows `TOWER_WAITING`;
  - Climb starts `("c1", "g23")` once;
  - a result calls `onOutcome`.

  **`talk.test.ts`:** the tower headlines; `finishLabel("tower") === "Finish the climb"`.

  **`realm-game.test.tsx`:** E at the Tower opens its board.
- [ ] **Step 2:** run them. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** run them again, plus `src/lib/actions/deeds-db.test.ts`; then `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(realm): the Puzzle Tower — a floor per band, opened by three stars, a storey for each`.

### Task G6: The bundle's read budget

**Files:**
- Tests only, plus any fold they force: `src/lib/actions/realm-bundle.test.ts` and `src/lib/actions/world-locks-db.test.ts`.

- [ ] **Step 1: Write the tests.**
  - **`realm-bundle.test.ts`:**
    - `loadWorldRaw` is called exactly once per bundle;
    - `loadRealmSettings` and `getTimezoneForChild` (spied through a partial mock of `@/lib/services/family-timezone`) are never called by it: the settings row and the child row serve (PC-G15).
  - **`world-locks-db.test.ts`:**
    - `EXPLAIN QUERY PLAN` of `loadTowerFloorsOpen`'s SQL contains `USING INDEX deed_run_child_completed_idx`;
    - the world rows read contains `USING INDEX realm_world_state_child_object_idx`.
- [ ] **Step 2:** run them. Expected: PASS if G3 and G5 followed PC-G15. A failure names the extra read; fold it into the round it belongs to, then re-run.
- [ ] **Step 3: Commit.** `test(realm): the world's locks add two reads to the Realm's load, both indexed`.

### Task G7: Verify, review, merge (4b)

- [ ] **Full checks:**
  - `npx vitest run --maxWorkers=2` (re-run the known flakes alone if they are the only failures);
  - `npx tsc --noEmit`;
  - `npx eslint src`: 0 errors.
- [ ] **0044 on a copy of the latest production backup**, as 0043 was: the migration applies, and `realm_world_state` is empty.
- [ ] **Browser smoke**, per the screenshot rules: `NEXT_DIST_DIR=.next-agent`, keys only, never a canvas click. Look at every image.
  1. `?at=-19.5,13.5` → E → solve → the chest opens and the stone bench appears at (−18, 8).
  2. `?at=-53,8.5` → E at the Ringstones vault door → solve → the toast after closing; Thunder Head is filled on the map and is a ride destination.
  3. The Chronicle book → "Found pages".
  4. The library room chest at language grade 2 (logic) and grade 5 (a vocab sort).
  5. Age a chest row with a one-off libsql `UPDATE realm_world_state SET updated_at = updated_at - 7*86400 WHERE object_id = 'chest:west-lane'` on the worktree's `local.db` → reload → it is shut again, and a new puzzle comes.
  6. A tower floor after a 3-star science side quest; the storey count grows.
  7. `?viewer=parent`: the state is shown, and every board refuses.
  8. Locks off: no chests or doors, and the Tower has no prompt.
  9. Phone width.
- [ ] **Whole-branch review**, one fix wave, then merge into `dev` **on the owner's word** (with Q1–Q4 answered or explicitly deferred).
