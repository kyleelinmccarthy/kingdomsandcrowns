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

- **R-G1:** `realm_world_state (id, child_id → child cascade, object_id, state text, updated_at)`, unique on `(child_id, object_id)`, in migration 0044. Every column but `id` is `notNull`. A pure `lockedNow(object, row, today, zone)`:
  - an object with no row is locked;
  - `"open"` with no `resetAfterDays` stays open;
  - with `resetAfterDays`, it locks again once `today − dayOf(updated_at) ≥ resetAfterDays`.
- **R-G2: objects (`WORLD_OBJECTS`, pure catalog).**
  - **Chests** (`resetAfterDays: 7`) stand at fixed village and room spots from the survey. Each refill's puzzle is fresh (PC-G3). *(F13: the stale "seeded by `(objectId, cycle)`" clause is struck.)*
  - **An emptied chest keeps relocking weekly, with a fresh puzzle (owner, 2026-11-20).** Once the hero owns every reward it holds:
    - opening it gives no reward and writes no reward row;
    - its result line is exactly "You've found everything in this chest."
  - **Vault doors** (once) stand near the five authored places. Each reveals a generated place (a map fragment) and a lore page.
  - Every object's lock draws from the hero's logic skill. A chest in the library or garden draws a vocab or science sort instead, when those pools exist.
- **R-G3: opening.**
  - A `world` run of ONE lock task, started by `startWorldLockRun(childId, objectId)`: hero only; refused while the object is still open; resumes on `sourceRef = objectId`.
  - On finishing, the run's close, the state `"open"` and the rewards are written together: one `withChildLock` transaction, a plain read-check-write (RG-c, RG-n). This applies when the task resolved right, first or second try. *(F13: the stale "idempotent through the unique index" clause is struck.)*
  - A miss leaves the object locked, and the hero can try again with a fresh puzzle.
- **R-G4: rewards.** Never materials.
  - **`decor`:** an entry in a small `DECOR` catalog of boxes, drawn at its fixed spot (owner: "appear at set spots"). The spot is held clear by `world-clearance.ts`.
  - **`lore`:** an entry in a `LORE` catalog of short pages, shown in a new "Found pages" section of the Chronicle book. `getChronicle` returns `lore`.
  - **`fragment`:** a generated place id, applied with `addPlacesFound`, plus the toast "You found a map to {place}!". The client store adds it too.
- **R-G4b: Puzzle Tower runs.** `RUN_EFFECTS.tower` has every effect false. A tower run moves nothing but the tower record.
- **R-G5: the Puzzle Tower** (floors and copy: owner, 2026-11-20).
  - A fixed structure at (25.5, 23.5), 8×8, the only free plot. It is not a `BUILDINGS` entry: it has its own catalog entry and clearance test.
  - **Floors.** There is one floor per band. 3 stars on a science (lock) side quest at the hero's own band opens their floor **and every floor below it** (cumulative).
    - Floors above the hero's band are never shown: not drawn as storeys, and not listed on the `TowerBoard`.
    - With no 3-star run yet, only the hero's own floor shows, as waiting.
    - "The hero's band" is defined in PC-G18.
    - The stars are read by one query (`deed_run.kind='deed'`, `deed_id` among the lock deeds, `stars = 3`, distinct `band`).
  - **Copy.** A waiting floor's line is exactly "Earn 3 stars on a science side quest to open this floor." It never names a grade or band.
  - Each open floor offers a bonus lock, harder by one level, as a `tower` run.
  - The record is `realm_world_state` `tower:<band>` (object id `towerRef(band)`), with state = solved count.
  - The exterior grows one storey per open floor.
- **R-G6: interactables.**
  - New interact kinds: `"lock"` (chests and doors) and `"tower"`, added to the overlay chain's negative list.
  - Room chests get an optional third argument on `roomSpots`, so the existing three-spot tests keep their shape.
  - Chests and doors are non-solid (heaps precedent). A vault door's frame is drawn beside the path, not across it.
- **R-G7: the grown-up's locks switch (owner, 2026-11-20).** With "Solving logic locks" off:
  - chests and vault doors are not drawn;
  - the Tower's bonus locks are not offered;
  - `startWorldLockRun` and `startTowerRun` refuse with `WORLD_LOCKS_OFF`, mirroring `startPracticeRun`;
  - everything already found stays: decorations, lore pages, found places and tower records.

  Whether the Tower itself stays drawn is the planner's call, PC-G6.

### Controller rulings (pre-flight scan, 2026-11-20; findings in `.superpowers/sdd/2026-11-10-realm-learning-woven-in/part-g-preflight.md`)

- **RG-a (F1):** `World` takes `worldLocks?: WorldCanvas` (set up in G3); its `spots` memo depends on that one prop. G5 reads `locksOn` from it. See PC-G9.
- **RG-b (F2):** the test helpers are `yardPieces()` (the keep yard's own spots and hall boxes) and `villagePieces()` (everything else). `keep-yard.test.ts` compares the first against the second; the new spots are tested against both.
- **RG-c (F3):** `withChildLock` serialises across instances: a libsql write transaction takes the write lock at BEGIN (`realm-play.ts:119-121`). So finishing is a plain read-check-write inside the lock, with no compare-and-set. A second finish is a no-op and writes no second reward row (tested in G2).
- **RG-d (F4):** every `worldLockSkill` test case spells out the hero's full `grades`.
- **RG-e (F5):** `EMPTY_WORLD_STATE.locksOn = false`, so a failed read draws nothing. `KingdomState` gains an optional `grades?: Record<SkillArea, Grade>`. `RealmData.worldState` is optional.
- **RG-f (F6):** every chest has an `ry`, and every decor a `label` and `ry` (G1's tables). `lore.test.ts` checks:
  - ten unique ids;
  - 2–4 sentences, at most 320 characters, a title of at most 40;
  - no `/grade|kindergarten/i`;
  - no `/\b(behind|ahead)\b/i`;
  - no `<`.
- **RG-g (F7):** G5 tests `applyTowerOutcome`, every `towerFloorLine` variant, a bad band id, and that a tower `RunStart` has no `"solution"`.
- **RG-h (F8):** G6's tests move into G3 (the bundle's reads) and G5 (`EXPLAIN QUERY PLAN`), each written red-first. G6 is a stub. G7's whole-branch review counts the per-load queries.
- **RG-i (F9):** the test `DEED_RUN_DDL` includes `CREATE INDEX deed_run_child_completed_idx ON deed_run (child_id, completed_at)`.
- **RG-j (F10, F27):** practice, world locks and the Tower share:
  - one run builder (`lockRun`, in `practice-run.ts`);
  - one band derivation (`towerBands`, in `puzzle-tower.ts`, used by G3 and G5);
  - one set of copy constants (`world-lock-copy.ts`, which `interact.ts` imports);
  - one start-action skeleton (`startLockRun`, in `src/lib/services/lock-runs.ts`).

  Test DDL comes from `src/test/realm-db-ddl.ts`:
  - `DEED_RUN_DDL`, `SKILL_MASTERY_DDL` and `REALM_PLACE_FOUND_DDL` are added there;
  - `practice-db.test.ts` and `realm-places.test.ts` switch to them;
  - the six other `deed_run` copies stay. `star-backfill.test.ts` and `record-of-work.test.ts` need pre-migration shapes on purpose, and the rest (`deeds-db`, `review-db`, `improvements-db`, `deed-run-store-db`, `realm-quest-rewards-db`) are in files Part G does not otherwise edit.
- **RG-k (F11):** G7's smoke shows:
  - an emptied chest's exact line;
  - the exact waiting-floor line;
  - that no floor above the hero's band shows.
- **RG-l (F12):** the vacuous `quietSurfaces(true)` test is replaced by a `realm-game` test of `handed.props.worldLocks`. With locks off it is empty (`locks: []`, `locksOn: false`).

  **Quiet world: applied differently, flagged to the controller.** In the quiet world (0 minutes) it is the bundle's canvas, unchanged. The ruling as given says "absent or empty when the world is quiet". That would contradict the owner's quiet-world decision (`quiet.ts`, decision 8): only troubles, riding and recess rest, and learning stays on. Locks pay nothing, so they are learning.
- **RG-m (F22):** a chest or door run's finish button reads "Done" (`LOCK_FINISH`), and its leave link "Leave the lock". Tower runs keep Puzzle practice's copy ("Finish puzzles", "Leave the puzzles").
- **RG-n (F24):** the open and the run's close share one `withChildLock` transaction. If opening throws, both roll back: the run stays open and can be finished again (tested in G2). The tower's count bump takes the same path. There is no `"error"` outcome.
- **RG-o (F28):** `worldLockSkill` resolves a subject skill through the catalog, never by building an id string. It walks `nearestGrades(grade)` within the grade's own band, taking the first `skillsFor(area, g)` skill that `TASK_KINDS.lock.presents`. A grade-4 hero's library chest draws `vocab-g45` (tested).
- **Notes applied:**
  - F13 (above);
  - F14: every test command has `--maxWorkers=2`;
  - F15: the refusals live in `deed-refusals.ts`, with a `deedErrorLine` test;
  - F16: R-G1's `notNull`;
  - F17: G2's test-time guidance;
  - F18: G3 and G4's Files;
  - F19: G3 and G5's spot-overlap test;
  - F20: G1's `worldObjectById` and keeper guard;
  - F21: PC-G7, accepted;
  - F23: PC-G5;
  - F25: PC-G14;
  - F26: the file map.

### Planner calls (2026-11-20, against `dev` b4443b2; the code forced each one)

- **PC-G1: one table, namespaced ids.** `realm_world_state.object_id` holds:
  - `chest:<id>` and `door:<place>`, state `"open"`;
  - `decor:<id>`, state `"placed"`;
  - `lore:<id>`, state `"found"`;
  - `tower:<band>`, state = the solved count as text.

  *Reason:* a chest relocks weekly, but the decoration it gave must stay, so rewards need rows of their own.
- **PC-G2: finishing a lock run is one locked transaction** (RG-c, RG-n). `withChildLock(childId, tx => …)`:
  1. closes the run (`update … where completed_at is null returning`); no row back means `FINISHED`;
  2. on a right answer, reads the hero's world rows;
  3. checks `lockedNow`;
  4. upserts the object's row to `"open"` (`onConflictDoUpdate`);
  5. writes the rewards: `decor:`/`lore:` with `onConflictDoNothing`, fragments with `addPlacesFound(childId, ids, tx)`.

  `addPlacesFound` gains `exec: Exec = db`.
- **PC-G3: each lock run start is seeded with `Date.now() >>> 0`**, as every run start is. *Reason:* R-G3's fresh puzzle after a miss. A resumed run keeps one puzzle stable for 60 minutes (`findOpenRun`). The seed is chosen on the server; generators stay pure.
- **PC-G4: which skill a lock draws** (`worldLockSkill`, RG-o). `WorldObject.draws` is an area: `"logic" | "language" | "science"`.
  - **Logic:** the skill Puzzle practice would draw, `practiceSkill(grades.logic, focusSkillIds)` (now exported), so the grown-up's logic focus counts here too.
  - **Language and science:** the catalog walk of RG-o at `grades[area]`. Today a sort pool credits:
    - `science-*` at every band;
    - `vocab-*` at grades 5, 6 and 9.

    So a hero whose language grade is K–3 finds no skill in their band and gets a **logic** lock, never a vocab `choice` question. A grade-4 hero's band (4–5) reaches `vocab-g45`.
- **PC-G5: what a chest gives.** Each opening gives the first reward in the chest's `rewards` that the hero does not yet own. A vault door gives all of its rewards at once. An emptied chest still opens weekly and gives `[]`. Its own row is rewritten, but it writes no reward row (R-G2, owner; F23).
- **PC-G6: with locks off, the Tower stays drawn, at its earned storeys, with no E spot** (R-G7).
  - *Reason:* R-F7 hides the *offer* of logic locks (the Puzzle practice button), not the hero's record. Here the offer is the Tower's E spot, and its storeys are the record R-G7 keeps.
  - `worldCanvas` gives `locks: []` and `locksOn: false`, and the tower spot keys on `locksOn`.
- **PC-G7: only the hero finishes a world-object or tower run.** `completeDeedRun` refuses a grown-up with `WORLD_HERO_ONLY` before anything is written, as it does build runs.
  - **Accepted (F21):** a grown-up with edit access can still *answer* the hero's open chest run, which moves the hero's logic mastery. This is the same as Puzzle practice and side quests today.
- **PC-G8: the floor query counts science deed runs by the deed's identity** (`deed_id IN (the lock deeds)`), whether that run played as sorts or as `choice`. *Reason:* telling them apart needs a JSON scan, and the Tower is unplayable with locks off anyway.
- **PC-G9: E spots go through `World`, drawing through its siblings** (RG-a).
  - `buildSpots` runs inside the memoised `World`, so `World` takes `worldLocks?: WorldCanvas`, added to its `spots` memo's deps as `built` is. From it, `locks` gives the lock spots and `locksOn` the tower spot.
  - Siblings of `<World>` draw: `<WorldLocks>`, `<Decorations>`, `<PuzzleTower>`.
  - `SpikeScene` takes the same stable `worldLocks` prop and hands it to both.
  - The Tower's collider is static: one line in the `solids` memo.
- **PC-G10: an open chest or door keeps its E spot**, with the verb "Look in" or "Look through". Its board says it is open and starts nothing.
- **PC-G11: the component is `WorldLockBoard` (`world-lock-board.tsx`)**, because `src/lib/tasks/lock-board.ts` already exists.
- **PC-G12: the Tower.**
  - The base is always drawn; one storey is added per open visible floor (at most 5).
  - The body is 6×6 on the 8×8 plot, with one static collider as tall as five storeys.
  - A floor's lock is `logic-<band>` at `towerLevel(mastery) = min(mastery + 1, MASTERY_MAX)`.
  - No demo, no second chances.
- **PC-G13: the fragment toast reuses `DeedToast`**, with an optional `icon?: "map"`. `DeedToastBanner` skips the pips when `total === 0`. It is held until the board closes, since an open overlay hides the toast.
- **PC-G14: vault doors.** A door's id is `door:<placeId>`. Its position is `placeById(suffix)` plus an offset from a local `DOOR_OFFSETS: Record<string, {x, z}>` table in `world-objects.ts`, resolved at module load (F25).
  - The riddle-stone tests arbitrate: dry ground, more than 3 from every track and road, more than 1 from solid scenery, outside every other spot's reach.
  - The implementer may move a door at most 3 units, and records the move in the commit.
- **PC-G15: the world state is assembled after the child row is read**, from rows read in the first parallel round. The zone and grades cost no extra read (G3 pins this).
- **PC-G16: `RunKind` gains `"tower"` in G2, together with `deed_run.kind`'s TS enum.** `db:generate` emits nothing for the enum; 0044 holds only the table.
- **PC-G17: the world-lock path runs only when `run.kind === "world" && isWorldObjectId(run.sourceRef)`**, so Puzzle practice is untouched.
- **PC-G18: "the hero's band" (R-G5).** `towerBands(grades) = { ownBand: bandForGrade(grades.logic), scienceBand: bandForGrade(grades.science) }` is shared by G3 and G5 (RG-j).
  - **Which floors show:** the hero's own grade's band. Logic has no offset (R-F6), and the Tower's locks are logic locks.
  - **What opens the hero's floor:** a 3-star run at the band their science side quests draw at now. That is what `deed_run.band` stores, so the floor stays reachable whatever the grown-up's science offset.
  - **History stays:** a 3-star run at any band `b ≤ ownBand` keeps the floors up to `b` open. A science band above `ownBand` opens nothing above it.
  - **The rule** is `towerFloors(starred, bands): { band; open }[]`, the visible floors, bottom first:
    - `top` = `ownBand` if `starred.has(scienceBand)`, else the highest `b ∈ starred` with `b ≤ ownBand`, or none;
    - the open floors are every band ≤ `top`;
    - the visible floors are the open floors plus `ownBand`.
  - **The bundle** reads `grades` from the `loadKingdomOverview` call it already makes (`KingdomState.grades?`, RG-e). On a failed kingdom read, `tower` is `[]`.

### Owner questions

None open. The owner answered Q1–Q4 on 2026-11-20:
- Q1 and Q2 are now R-G5;
- Q3 is in R-G2;
- Q4 is R-G7.

## Global constraints for Part G

Part F's constraints still apply, plus:

- **Never materials, minutes or stars.** `RUN_EFFECTS.world` (4a) and `RUN_EFFECTS.tower` (every effect false) are the only effects. No path writes `realm_material` or `realm_play_ledger`, or sets `deed_run.stars` above 0.
- **Hero only, family scoped.**
  - Every lock start goes through `startLockRun`: `requireChildAccess(childId, { write: true })`, then `isChildActor`, then `CLOSED`, then the locks switch. This is `startPracticeRun`'s order.
  - A grown-up's visit reads the world state and the found pages, and opens nothing.
- **Leak rule.** Lock runs are written only by `insertRun` and resumed only by `resumedStart` (`toClientTask` views).
- **Once means once.** The close, the open and the rewards are one locked transaction (PC-G2). A second finish writes nothing.
- **The Realm rules:**
  - additive lines only in `realm-game.tsx`, `spike-scene.tsx`, `frame-hud.tsx`, `hud.tsx` and `hud-bus.ts`;
  - painters are new files;
  - no `three` under Vitest: boxes live in pure `world-lock-boxes.ts`;
  - `World` stays memoised, with `worldLocks` stable;
  - no `Math.random`;
  - browser checks press keys and never click the canvas.
- **The server's day.** `lockedNow` uses the family's zone and `realmNow`'s date, never the device's.
- **Tests:** every `npx vitest run` has `--maxWorkers=2`.
- **Copy** (`src/lib/utils/world-lock-copy.ts`; refusals in `deed-refusals.ts`):
  - **Verbs and labels:**
    - `CHEST_VERBS = { shut: "Open", open: "Look in" }`;
    - `DOOR_VERBS = { shut: "Open", open: "Look through" }`;
    - `TOWER_VERB = "Climb"`;
    - `CHEST_LABEL = "the old chest"`;
    - `DOOR_LABEL = "the vault door"`;
    - `TOWER_LABEL = "the Puzzle Tower"`.
  - **Stories:**
    - `CHEST_STORY` = "An old chest, shut with a puzzle for a lock."
    - `DOOR_STORY` = "A vault door, sealed with a puzzle."
    - `TOWER_STORY` = "A bonus puzzle, just for the joy of it."
  - **Refusals** (`deed-refusals.ts`, in `KNOWN`):
    - `WORLD_HERO_ONLY` = "Locks are for the hero to open."
    - `WORLD_OPEN` = "That's already open."
    - `WORLD_LOCKS_OFF` = "The locks are resting for now."
    - `TOWER_SHUT` = "That floor isn't open yet."
  - **Headlines** (title / line):

    | Outcome | Title | Line |
    |---|---|---|
    | a chest opens | "The chest opens!" | the reward line |
    | a door opens | "The vault door swings open!" | the reward line |
    | a miss | "The lock holds." | "Try again with a fresh lock." |
    | already open | "It was already open." | |
    | a tower solve | "Floor solved!" | |
    | a tower miss | "The puzzle holds." | "Every climb makes you sharper." |
  - **Reward lines:**
    - "Inside: {decor label}. Look for it in the village."
    - "Inside: a page for your Chronicle, “{title}”."
    - "Inside: a map and a page for your Chronicle."
    - `CHEST_EMPTY` = "You've found everything in this chest." (exact)
  - **Board lines:**
    - `CHEST_OPEN_LINE` = "You opened this chest. A new lock comes next week."
    - `DOOR_OPEN_LINE` = "The vault stands open. Its map is yours."
  - **Run words:** `LOCK_FINISH = "Done"`; leave link "Leave the lock" (RG-m). Tower runs use `PRACTICE_FINISH` and "Leave the puzzles".
  - **The toast:** "You found a map to {place}!" / "Look for it on your map."
  - **The Chronicle:** the section is "Found pages".
  - **The Tower:**
    - `TOWER_WAITING` = "Earn 3 stars on a science side quest to open this floor." (exact);
    - floors are named by position, "The first floor" … "The fifth floor".
- **No child-facing grade or band label anywhere in Part G** (R-G5, owner).

## Review Focus (Part G)

1. **A second finish.** Two runs for one chest finish one after the other, or at once. The chest opens once, with one reward row; the other summary says `already-open`. Finishing one run twice gives `FINISHED`. Pinned in G2.
2. **The weekly refill at a time-zone edge.** A chest opened at 23:30 local (06:30 UTC the next day) relocks on the seventh local day. Pinned in G1 and G2.
3. **A grown-up can't open a lock.** They are refused at start and at finish, with nothing written, and still see the state and the pages. Pinned in G2 and G4.
4. **No solution reaches the browser.** Fresh and resumed chest and tower starts carry no `"solution"`. Pinned in G2 and G5.
5. **A K–3 hero at the library chest** gets a logic lock, never a `choice` task or a throw; a grade-4 hero gets `vocab-g45`. Pinned in G2.

**Execution order:** G1, G2, G3, G4, G5, G7 (G6 folded into G3 and G5).

## File map (Part G)

| File | Responsibility |
|---|---|
| **New, pure, client-safe** | |
| `src/lib/realm/world-objects.ts`, `lore.ts`, `world-state.ts`, `puzzle-tower.ts` | catalogs, `lockedNow`, `nextRewards`, the view and its mirror, `towerFloors`, `towerBands`, the Tower's place |
| `src/lib/utils/world-lock-copy.ts` | Part G's copy |
| `src/lib/realm3d/world-lock-boxes.ts` | chest, door, decor and tower boxes |
| **New, server** | |
| `src/lib/utils/world-lock-run.ts` | `worldLockSkill` (imports the registry) |
| `src/lib/services/lock-runs.ts` | `startLockRun`, the shared start skeleton |
| `src/lib/services/realm-world-state.ts` | `worldClock`, `loadWorldRows`, `loadWorldRaw`, `openWorldObject`, `bumpTowerRecord`, `loadStarredBands`, `loadFoundPages` |
| `src/lib/actions/world-locks.ts` | `startWorldLockRun`, `startTowerRun` |
| **New, client** | |
| `src/components/realm3d/world-locks.tsx`, `decorations.tsx`, `puzzle-tower.tsx` | painters, siblings of `World` |
| `src/components/realm3d/world-lock-board.tsx`, `tower-board.tsx`, `use-world-state.ts` | the boards and the frame's hook |
| **Modified, shared** | |
| `src/lib/db/schema.ts`, `migrations/0044_realm_world_state.sql` | the table (G1); the `tower` enum (G2) |
| `src/lib/utils/deed-scoring.ts`, `deed-run-types.ts`, `deed-refusals.ts`, `practice-run.ts` | `tower` effects; `WorldOutcome`/`TowerOutcome`; refusals; `lockRun`, `practiceSkill` |
| `src/lib/actions/deeds.ts`, `practice.ts`, `realm.ts`, `realm-chronicle.ts` | the locked finish; practice on `startLockRun`; the bundle; `lore` |
| `src/lib/services/realm-places.ts` | `addPlacesFound(…, exec)` |
| `src/lib/realm/kingdom-state.ts` | `KingdomState.grades?` |
| `src/lib/realm3d/talk.ts`, `interact.ts`, `room-rules.ts`, `hud-bus.ts` | headlines, run words, toast; spots; the room chest; the union |
| `src/components/realm3d/spike-scene.tsx`, `realm-game.tsx`, `interior-scene.tsx`, `deed-board.tsx`, `guide-hud.tsx`, `chronicle-book.tsx`; `src/app/(app)/realm/page.tsx` | wiring (additive), the room chest, run words, the toast guard, found pages, page data |
| `src/test/world-clearance.ts`, `src/test/realm-db-ddl.ts` | `yardPieces`, `villagePieces`, `segmentDistance`; shared DDL |

## Tasks

### Task G1: The world state's table, catalogs and rules (pure)

**Files:**
- **Schema:** modify `src/lib/db/schema.ts` to add `realmWorldState`:
  - `id` text primary key;
  - `childId` `notNull`, references `child`, cascade;
  - `objectId` `notNull`;
  - `state` `notNull`;
  - `updatedAt` timestamp, `notNull`;
  - `uniqueIndex("realm_world_state_child_object_idx").on(childId, objectId)`.

  Run `npm run db:generate -- --name realm_world_state`, then `npm run db:migrate`.
- **Test DDL:** modify `src/test/realm-db-ddl.ts` to add `REALM_WORLD_STATE_DDL`, as 0044 writes it.
- **Clearance helpers:** modify `src/test/world-clearance.ts` (RG-b):
  - `yardPieces()`: the keep yard's spots and Chronicle Hall boxes;
  - `villagePieces()`: `VILLAGE_DECOR_SPOTS`, every improvement's boxes and plaque at level 3, every villager, `VILLAGE_POST`, `ARCH`;
  - `segmentDistance(p, a, b)`.

  `keep-yard.test.ts` uses `villagePieces()` in place of its local `villageSpots()` and plaque list. `riddle-stones.test.ts` uses `segmentDistance`.
- **New modules:** create `src/lib/realm/lore.ts`, `world-objects.ts`, `world-state.ts` and `puzzle-tower.ts`, with `lore.test.ts`, `world-objects.test.ts`, `world-state.test.ts` and `puzzle-tower.test.ts`.
- **Rooms:** modify `src/lib/realm3d/interiors.test.ts` with "the room chests".
- **Spec §2a**, "Calls settled for slice 4b":
  - the owner's answers (R-G2's emptied chest, R-G5, R-G7);
  - RG-a–RG-o;
  - R-G1–R-G7;
  - PC-G1–PC-G18;
  - one line each.

**Interfaces (produces):**
- **`lore.ts`:**
  - `type LoreId` (the ten ids below);
  - `LORE: Readonly<Record<LoreId, { title: string; text: string }>>`;
  - `LORE_IDS`.
- **`world-objects.ts`:**
  - `type DecorId`;
  - `DECOR: Readonly<Record<DecorId, { label: string; x: number; z: number; ry: number }>>`;
  - `DECOR_IDS`;
  - `type WorldReward = { kind: "decor"; id: DecorId } | { kind: "lore"; id: LoreId } | { kind: "fragment"; placeId: string }`;
  - `rewardKey(r)`, giving `"decor:<id>"`, `"lore:<id>"` or `"place:<id>"`;
  - `type WorldObject = { id: string; type: "chest" | "door"; label: string; x: number; z: number; ry: number; room?: RoomKind; resetAfterDays?: number; draws: "logic" | "language" | "science"; rewards: readonly WorldReward[] }`. Room-local `x`/`z` when `room` is set;
  - `WORLD_OBJECTS`;
  - `worldObjectById(id: string | null | undefined): WorldObject | null`, own entries only;
  - `isWorldObjectId(id: unknown): id is string`;
  - `CHEST_RESET_DAYS = 7`.
- **`world-state.ts`:**
  - `type WorldRow = { objectId: string; state: string; updatedAt: Date }`;
  - `lockedNow(object: Pick<WorldObject, "resetAfterDays">, row: Pick<WorldRow, "state" | "updatedAt"> | null, today: string, zone: string): boolean`;
  - `nextRewards(object: WorldObject, owned: ReadonlySet<string>): WorldReward[]`;
  - `type TowerFloorView = { band: ContentBand; open: boolean; solved: number }`;
  - `type WorldStateView = { locksOn: boolean; open: string[]; decor: DecorId[]; tower: TowerFloorView[] }`;
  - `EMPTY_WORLD_STATE`, which has `locksOn: false` (RG-e);
  - `worldStateView(rows: readonly WorldRow[], floors: readonly { band: ContentBand; open: boolean }[], clock: { today: string; zone: string }, locksOn: boolean): WorldStateView`. Its `tower` is exactly `floors`, each given `solved` from its `towerRef(band)` row.
- **`puzzle-tower.ts`:**
  - `PUZZLE_TOWER = { x: 25.5, z: 23.5, plot: 8, body: 6, baseH: 3.2, storeyH: 2.4, door: { x: 22.2, z: 23.5 } }`;
  - `TOWER_FLOORS = CONTENT_BANDS`;
  - `towerRef(band)`, giving `"tower:<band>"`;
  - `bandOfTowerRef(ref: string | null): ContentBand | null`;
  - `towerSkillId(band)`, giving `"logic-<band>"`;
  - `towerColliders(heightAt): Collider[]`;
  - `towerBands(grades: Pick<Record<SkillArea, Grade>, "logic" | "science">): { ownBand: ContentBand; scienceBand: ContentBand }`;
  - `towerFloors(starred: ReadonlySet<ContentBand>, bands: { ownBand: ContentBand; scienceBand: ContentBand }): { band: ContentBand; open: boolean }[]` (PC-G18).

**The catalog** (positions are the survey's starting spots; the tests arbitrate):

| object | at (x, z), ry | draws | rewards, in order |
|---|---|---|---|
| `chest:west-lane` | (−19.5, 12), π/2 | logic | decor `stone-bench`, decor `sundial`, lore `the-first-lock` |
| `chest:east-lane` | (19.5, 10), −π/2 | logic | `flower-cart`, `bird-bath`, lore `the-locksmith` |
| `chest:castle-back` | (14.25, −41), 0 | logic | `weather-vane`, `hay-bales`, lore `the-castle-cellar` |
| `chest:library` | room `library` (2.0, 3.0), `atan2(-2, -3)` | language | `story-post`, `barrel-stack`, lore `the-scribes-cipher` |
| `chest:garden` | room `garden` (0, 1.0), π | science | `herb-planter`, `scarecrow`, lore `the-glasshouse-key` |
| `door:ringstones` | place + (0, 7) | logic | fragment `summit-7`, lore `ringstones-map` |
| `door:highcairn` | place + (−6, 3) | logic | fragment `summit-6`, lore `highcairn-map` |
| `door:longwater` | place + (7, 0) | logic | fragment `cove-12`, lore `longwater-map` |
| `door:farfurrow` | place + (3, 6) | logic | fragment `deepwood-10`, lore `farfurrow-map` |
| `door:appleway` | place + (5, −3) | logic | fragment `deepwood-9`, lore `appleway-map` |

- Doors face their place: `ry = Math.atan2(-offset.x, -offset.z)`. Room chests face the room's middle.
- Decor (label, (x, z), ry):

  | decor | label | (x, z) | ry |
  |---|---|---|---|
  | `stone-bench` | "a stone bench" | (−18, 8) | π/2 |
  | `sundial` | "a sundial" | (−20.5, 16) | 0 |
  | `flower-cart` | "a flower cart" | (18.5, 6.5) | −π/2 |
  | `bird-bath` | "a bird bath" | (20.5, 13.5) | 0 |
  | `weather-vane` | "a weather vane" | (19, −5) | 0 |
  | `hay-bales` | "a stack of hay bales" | (22, 1.5) | 0 |
  | `scarecrow` | "a scarecrow" | (5, 17) | π |
  | `barrel-stack` | "a stack of barrels" | (−3.25, 26.5) | 0 |
  | `herb-planter` | "an herb planter" | (7.5, −10.25) | 0 |
  | `story-post` | "a story post" | (−15, −31) | 0 |
- **Lore:**
  - 2–4 sentences, at most 320 characters;
  - plain text, in the Realm's voice;
  - a door's page tells of the place its map leads to.

- [ ] **Step 1: Write the failing tests.**

  **`lore.test.ts`** (RG-f):
  - ten unique ids, equal to `LORE_IDS`;
  - each text has 2–4 sentences (split on `/[.!?](?:\s|$)/`) and at most 320 characters;
  - each title is at most 40 characters;
  - no title or text matches `/grade|kindergarten/i`, `/\b(behind|ahead)\b/i` or `/</`.

  **`world-state.test.ts`:**
  - "an object with no row is locked": `lockedNow({}, null, "2026-11-09", "UTC") === true`.
  - "a door once open stays open": `false` on `"2027-06-01"` for a row opened 2026-01-01.
  - "a chest relocks on the seventh day in the family's zone":
    - the row has `updatedAt = new Date("2026-11-03T06:30:00Z")`;
    - in `"America/Denver"`, `"2026-11-08"` gives `false` and `"2026-11-09"` gives `true`;
    - in `"UTC"`, `"2026-11-09"` gives `false`.
  - "a chest gives its next unowned reward": for `chest:west-lane`:
    - nothing owned gives `[decor stone-bench]`;
    - with `decor:stone-bench` owned, it gives `[decor sundial]`;
    - with all three owned, it gives `[]`.
  - "a door gives everything at once": `door:ringstones` gives `[fragment summit-7, lore ringstones-map]`.
  - "the view". The rows are:
    - `chest:west-lane` open today;
    - `chest:east-lane` opened 8 days ago;
    - `decor:sundial`;
    - `tower:g23 = "2"`;
    - `tower:k1 = "x"`;
    - an unknown `chest:nope`.

    The floors are `[{k1, true}, {g23, true}, {g45, false}]`. The view gives:
    - `open: ["chest:west-lane"]`;
    - `decor: ["sundial"]`;
    - `tower: [{k1, true, 0}, {g23, true, 2}, {g45, false, 0}]`.
  - "`EMPTY_WORLD_STATE` draws nothing": `locksOn === false`, and every list is empty.

  **`world-objects.test.ts`:**
  - ids are unique and prefixed `chest:` or `door:`;
  - chests reset after 7 days; doors never do;
  - every reward resolves, and every decor and lore id is given by exactly one object;
  - fragments are in `REALM_PLACE_IDS`, not authored, and distinct;
  - there is one door per `PLACES` id, read from the id's suffix;
  - room chests are only `library`/`language` and `garden`/`science`;
  - `worldObjectById("toString")`, `("__proto__")` and `("constructor")` each give `null`;
  - "every village chest and decor spot clears the village":
    - `clearanceFailures(what, rectAt(x, z, 1.4, 1.4), undefined, 0)` is `[]`, and so is `levelFailures`;
    - nothing within 1.0 of a `yardPieces()` or `villagePieces()` rect, or of another chest or decor;
    - nothing within 1.5 of the Tower's plot;
  - the door tests copy the riddle-stone describe:
    - dry;
    - `segmentDistance` greater than 3 from every `VILLAGE_TRACKS` and `world.roads` line;
    - more than 1 from solid `SCENERY`;
    - outside every `others` spot's reach and every riddle stone's, and the reverse.

  **`interiors.test.ts` "the room chests":**
  - each room chest is on the flood-reachable floor;
  - at least 2.5 from the fixture, door, spawn, and keeper (when `plan.keeper` is not null);
  - `!roomBuried(plan.solids, x, z, 0, 1.3)`.

  **`puzzle-tower.test.ts`:**
  - the 8×8 plot clears: `clearanceFailures(…, undefined, 1.5)` and `levelFailures` are `[]`, with nothing within 1.5 of `yardPieces()` or `villagePieces()`;
  - refs round-trip, and junk (`"tower:g7"`, `"chest:x"`, `null`) gives `null`;
  - every `towerSkillId(b)` names a logic skill;
  - one collider: `[{ x: 25.5, z: 23.5, hw: 3, hd: 3, round: false, base: -1, top: 3.2 + 5 * 2.4 }]`;
  - `towerBands({ logic: "4", science: "2", … })` equals `{ ownBand: "g45", scienceBand: "g23" }`;
  - the four `towerFloors` cases:
    - stars at the hero's band: `towerFloors(new Set(["g45"]), { ownBand: "g45", scienceBand: "g45" })` gives k1, g23 and g45, all open, and nothing above;
    - no stars: `towerFloors(new Set(), …)` gives `[{ band: "g45", open: false }]`;
    - earlier stars: `{k1}` gives `[{k1, true}, {g45, false}]`;
    - offsets: `{g23}` with `scienceBand: "g23"` opens k1–g45; `{g68}` with `scienceBand: "g68"` opens k1–g45 and shows no `g68`.
- [ ] **Step 2:** `npx vitest run src/lib/realm/lore.test.ts src/lib/realm/world-state.test.ts src/lib/realm/world-objects.test.ts src/lib/realm/puzzle-tower.test.ts src/lib/realm3d/interiors.test.ts src/lib/realm/keep-yard.test.ts src/lib/realm/riddle-stones.test.ts --maxWorkers=2`.

  Expected: FAIL. The new files fail on "Cannot find module"; the two refactored files fail on the missing helper exports.
- [ ] **Step 3: Implement.**
  - **Schema:** generate, then migrate. 0044 must hold exactly `CREATE TABLE realm_world_state` and its unique index. Commit it with its meta.
  - **`lockedNow`:**

    ```ts
    if (!row || row.state !== "open") return true;
    if (object.resetAfterDays === undefined) return false;
    return addDays(todayInZone(zone, row.updatedAt), object.resetAfterDays) <= today;
    ```
  - **Spots:** a spot that fails moves within the survey's clear ranges (chests and decor) or at most 3 units (doors). Name each move in the commit.
- [ ] **Step 4:** the same command, then `npx tsc --noEmit`. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit.** `feat(realm): the world's locks: a state table, chests, doors, decor, lore and the Tower's plot`.

### Task G2: Opening a lock on the server

**Files:**
- **Run kinds:**
  - `deed-scoring.ts`: `RunKind` gains `"tower"`, and `RUN_EFFECTS.tower` is all `false`; `deed-scoring.test.ts` gets the `tower` block (`kindsThatFeedReview` unchanged);
  - `schema.ts`: `deed_run.kind` gains `"tower"`. `db:generate` should report "No schema changes" (PC-G16).
- **Run words** (RG-m), in `talk.ts`:
  - `finishLabel(kind: RunKind, ownerId?: string)`: `LOCK_FINISH` for `world` with `isWorldObjectId(ownerId)`; `case "tower"` gives `PRACTICE_FINISH`;
  - `leaveWhat(kind: RunKind, ownerId?: string): string`: `"lock"`, `"puzzles"` (world, tower), `"review"`, `"build"`, or `SIDE_QUEST_LOWER`.

  `deed-board.tsx` replaces its `what` ternary with `leaveWhat(run.kind, run.deed.id)`, and passes `run.deed.id` to `finishLabel`.
- **Copy and refusals:** create `src/lib/utils/world-lock-copy.ts`; `deed-refusals.ts` gets the four refusals, added to `KNOWN` (F15).
- **The shared run builder** (RG-j), in `practice-run.ts`:
  - export `practiceSkill`;
  - add `lockRun(input: { skill: Skill; level: number; count: number; seed: number; enabledKinds: ReadonlySet<TaskKind>; profile: ProfileLike }): BuiltRun`;
  - `buildPracticeRun` calls `lockRun` with `count: PRACTICE_RUN.tasks`.
- **`worldLockSkill`:** create `src/lib/utils/world-lock-run.ts` with `worldLockSkill`, plus its test.
- **The shared start skeleton:** create `src/lib/services/lock-runs.ts` with `startLockRun`. `actions/practice.ts` is rewritten onto it, with `practice-db.test.ts` as the guard.
- **Places:** `realm-places.ts`: `addPlacesFound(childId, placeIds, exec: Exec = db)`.
- **New server modules:** create `src/lib/services/realm-world-state.ts` and `src/lib/actions/world-locks.ts`.
- **The finish:** `deed-run-types.ts` gets `WorldOutcome` and `RunSummary.world?`; `actions/deeds.ts` gets the locked finish.
- **Test DDL** (RG-i, RG-j), in `src/test/realm-db-ddl.ts`:
  - `DEED_RUN_DDL`, with `deed_run_child_completed_idx`;
  - `SKILL_MASTERY_DDL`;
  - `REALM_PLACE_FOUND_DDL`.

  `practice-db.test.ts` and `realm-places.test.ts` switch to them.
- **Tests:**
  - `src/lib/actions/world-locks-db.test.ts`;
  - `src/lib/utils/world-lock-run.test.ts`;
  - `deed-refusals.test.ts` (each new refusal comes through `deedErrorLine` unchanged);
  - `talk.test.ts` (run words).

**Interfaces:**
- **Consumes:**
  - G1;
  - `insertRun`, `findOpenRun`, `resumedStart`, `demoAt`, `loadMasteryRows`;
  - `loadFocusSkillIds`, `loadLearningProfileRow`, `profileFromRow`;
  - `withChildLock`, `loadHeroLevels`, `loadRealmSettings`, `enabledHandsOnKinds`;
  - `drawForSkill`, `applyProfile`, `nearestGrades`, `skillsFor`, `TASK_KINDS`.
- **Produces:**
  - `type WorldOutcome = { objectId: string; opened: boolean; reason?: "missed" | "already-open"; rewards: WorldReward[] }`, and `RunSummary.world?`.
  - `worldLockSkill(object: Pick<WorldObject, "draws">, grades: Record<SkillArea, Grade>, focusSkillIds: readonly string[]): { skill: Skill; grade: Grade } | null` (RG-o).
  - `lockRun(...)`, as above.
  - `startLockRun(childId: string, spec: LockRunSpec): Promise<RunStart>`, where:

    ```ts
    type LockRunSpec = {
      kind: "world" | "tower";
      sourceRef: string;
      refusals: { heroOnly: string; off: string };
      check?: (hero: HeroLevels) => Promise<void>;
      pick: (hero: HeroLevels, focusSkillIds: readonly string[]) => { skill: Skill; grade: Grade; boost: number } | null;
      count: number;
      header: (skill: Skill) => RunStart["deed"];
      demo: boolean;
    }
    ```

    The order is:
    1. `requireChildAccess(write)`, then `isChildActor`, else `heroOnly`;
    2. `loadHeroLevels` and `loadRealmSettings`, with `CLOSED`, then `off`;
    3. `check`;
    4. resume via `findOpenRun(child, kind, sourceRef)`, with the header from the stored skill;
    5. `pick` and the focus;
    6. the level: the mastery, capped at `MASTERY_MAX`, plus the boost, capped again;
    7. `lockRun` with seed `Date.now() >>> 0`; an empty run gives `NONE_READY`;
    8. `insertRun`, with `secondChances: RUN_EFFECTS[kind].allowsSecondChances && settings.secondChances`, and `demoAt` when `demo` is set.

    Practice's spec is `kind "world"`, `sourceRef "practice"`, `PRACTICE_*` refusals, `count: 3` and `demo: true`.
  - `worldClock(childId: string, now?: Date): Promise<{ today: string; zone: string }>`: `realmNow` gives the date, and `usableTimeZone(getTimezoneForChild)` the zone.
  - `loadWorldRows(childId: string, exec?: Exec): Promise<WorldRow[]>`.
  - `openWorldObject(tx: Tx, childId: string, object: WorldObject, outcome: QuestionOutcome, now: Date, clock): Promise<WorldOutcome>`: PC-G2's steps 2–5, inside the caller's transaction.
  - `startWorldLockRun(childId: string, objectId: string): Promise<RunStart>`:
    - an unknown id gives `NOT_IN_CHRONICLE`;
    - `startLockRun` with `kind "world"`, `sourceRef: object.id` and `WORLD_*` refusals;
    - `check` uses `worldClock` and `lockedNow`, else `WORLD_OPEN`;
    - `pick` is `worldLockSkill` with `boost: 0`;
    - `count: 1`, `demo: true`;
    - the header is `{ id: object.id, title: "The old chest" or "The vault door", story: CHEST_STORY or DOOR_STORY, area: skill.area }`.

**`completeDeedRun`:**
- After the `build` guard: `worldOwned(run) && !isChildActor(access)` gives `WORLD_HERO_ONLY`.
- For a world-object run, the generic close is replaced:

  ```ts
  const clock = await worldClock(run.childId, now);
  const world = await withChildLock(run.childId, async (tx) => {
    if ((await closeRun(tx)).length === 0) throw new Error(FINISHED);
    return openWorldObject(tx, run.childId, object, outcomes[0], now, clock);
  });
  ```

  Here `closeRun(exec)` is the existing `update … returning`, made to take an executor, so the generic path calls `closeRun(db)`.
- A throw from `openWorldObject` rolls back the close (RG-n).
- The summary adds `...(world ? { world } : {})`.

- [ ] **Step 1: Write the failing tests** (`world-locks-db.test.ts`).

  **Setup:**
  - DDL from `realm-db-ddl.ts`;
  - `vi.mock("@/lib/services/realm-clock", …)`: `realmNow` gives `"2026-11-09"`;
  - a **partial** `vi.mock("@/lib/services/family-timezone", async () => ({ ...await vi.importActual(…), getTimezoneForChild: async () => "America/Denver" }))`, so `usableTimeZone` survives (F17).
  - **Time stamps (F17):** `completeDeedRun` stamps rows with the real clock, after the mocked day. Tests that need an earlier opening set `updated_at` by SQL to an epoch before 2026-11-09 (for example `2026-11-01T12:00Z`). They never use "now minus 7 days".

  **Tests** (each spells out the full hero `grades`, RG-d):
  - "starts one lock at the hero's logic grade, a world run named by the chest". For `{math:"8", reading:"8", language:"8", science:"8", logic:"5"}`:
    - `start.kind === "world"`;
    - one task, of kind `"lock"`;
    - the row has `source_ref = 'chest:west-lane'`, `deed_id IS NULL` and `band = 'g45'`.
  - "never sends the solution, fresh or resumed": neither `JSON.stringify(start)` contains `"solution"`, and both have the same `runId`.
  - "the library chest" (Review Focus 5):
    - `{…, language: "4", logic: "4"}` gives `["vocab-g45"]` and `view.puzzle === "sort"` (RG-o);
    - `{…, language: "2", logic: "2"}` gives `["logic-g23"]`;
    - `{…, language: "2", logic: "5"}` gives `["logic-g45"]`;
    - none is ever `kind: "choice"`.
  - "the garden chest": `science: "6"` gives `["science-g68"]`; `science: "3"` gives `["science-g23"]`.
  - "refuses a grown-up, an unknown id, and `practice`, writing nothing": `WORLD_HERO_ONLY`, then `NOT_IN_CHRONICLE` twice.
  - "refuses while locks are off, keeping everything found" (R-G7): `WORLD_LOCKS_OFF`, with no run written; the existing `chest:`, `decor:`, `lore:` and `realm_place_found` rows are unchanged.
  - "the seventh local day" (Review Focus 2):
    - `updated_at = 2026-11-03T06:30Z` starts;
    - `updated_at = 2026-11-03T18:00Z` gives `WORLD_OPEN`.
  - "a right answer opens the chest and gives its first reward":
    - `world` is `{ objectId: "chest:west-lane", opened: true, rewards: [{ kind: "decor", id: "stone-bench" }] }`;
    - the rows are `"open"` and `"placed"`.
  - "a second-try right answer opens it too".
  - "a miss leaves it locked; the next start is a new run": `reason: "missed"`, no state rows, and a different `runId`.
  - "the next week's opening gives the next reward". Set `updated_at` by SQL as above.
  - "an emptied chest relocks weekly, opens with a fresh puzzle, and never writes a reward twice" (R-G2):
    - `world.rewards` is `[]`;
    - `world.opened` is `true`;
    - the `decor:`/`lore:` count is still 3, each `object_id` once, and it stays 3 after a second week.
  - "a vault door marks its place found and gives its page, and never relocks":
    - `summit-7` is in `realm_place_found`;
    - `lore:ringstones-map` is `"found"`;
    - a start on 2026-12-09 (`realmNow` re-mocked) gives `WORLD_OPEN`.
  - "a second finish is a no-op" (RG-c, Review Focus 1):
    - two right runs for one chest, finished one after the other: the second gives `reason: "already-open"`, and there is one `decor:` row;
    - the same again with `Promise.all`;
    - `completeDeedRun` twice on one run gives `FINISHED` the second time, with no second row.
  - "if opening throws, the run stays open and finishes on a retry" (RG-n):
    - `addPlacesFound` is mocked to reject once; a door's `completeDeedRun` rejects;
    - `completed_at` is still null; no `door:`, `lore:` or place rows are written;
    - a second `completeDeedRun` gives `opened: true` and writes all three.
  - "a grown-up can't finish the hero's chest run" (Review Focus 3): `WORLD_HERO_ONLY`, the run stays open, and no state rows are written.
  - "pays nothing, earns no star, writes no material": `stars === 0`, `minutesEarned === 0`, and `realm_play_ledger` and `realm_material` are empty.
  - "Puzzle practice finishes with no world outcome".

  **Other test files:**
  - **`world-lock-run.test.ts`:**
    - `worldLockSkill` follows the logic focus pick;
    - `{…, language: "K", logic: "K"}` falls back to `logic-k1`;
    - `{…, language: "6", logic: "6"}` gives `vocab-g68`;
    - `lockRun` with locks disabled gives an empty run;
    - the same seed gives the same task id.
  - **`deed-scoring.test.ts`:** `RUN_EFFECTS.tower` is all-false.
  - **`talk.test.ts`:**
    - `finishLabel("world", "chest:west-lane") === "Done"`;
    - `finishLabel("world", "practice") === "Finish puzzles"`;
    - `finishLabel("tower") === "Finish puzzles"`;
    - `leaveWhat` gives `"lock"`, `"puzzles"` and `"puzzles"` for the same three.
  - **`deed-refusals.test.ts`:** each of the four new lines comes through `deedErrorLine`.
- [ ] **Step 2:** `npx vitest run src/lib/actions/world-locks-db.test.ts src/lib/utils/world-lock-run.test.ts src/lib/utils/deed-scoring.test.ts src/lib/realm3d/talk.test.ts src/lib/utils/deed-refusals.test.ts --maxWorkers=2`.

  Expected: FAIL. `world-locks` is a missing module, and the `tower`, run-word and refusal assertions fail.
- [ ] **Step 3:** implement to the interfaces.
- [ ] **Step 4:** the same command, plus `src/lib/actions/practice-db.test.ts src/lib/actions/realm-places.test.ts src/lib/actions/deeds-db.test.ts`, then `npx tsc --noEmit`. Expected: PASS, 0 errors; practice's tests are unchanged and green.
- [ ] **Step 5: Commit.** `feat(realm): a chest or vault door opens once its lock is solved, once, for the hero alone`.

### Task G3: Chests and doors in the world and in rooms

**Files:**
- **The bundle:** modify `src/lib/actions/realm.ts`.
  - `RealmBundle.worldState?: WorldStateView`.
  - The first round adds `const worldRead = loadWorldRaw(childId).catch(() => null)`.
  - `loadKingdomState` keeps the overview's `grades` on `KingdomState.grades?` (RG-e; `src/lib/realm/kingdom-state.ts`).
  - After the child row: `worldState: raw ? worldStateView(raw.rows, kingdom.grades ? towerFloors(raw.starred, towerBands(kingdom.grades)) : [], { today, zone: usableTimeZone(child.timezone) }, settings.mechanics.lock) : EMPTY_WORLD_STATE`.
  - `loadWorldRaw(childId): Promise<{ rows: WorldRow[]; starred: ReadonlySet<ContentBand> }>`. `starred` is empty until G5.
- **Page data:** in `page.tsx` and `realm-game.tsx`, `RealmData.worldState?: WorldStateView` (optional), carried as `...(bundle.worldState ? { worldState: bundle.worldState } : {})`.
- **`world-state.ts`:**
  - `type LockSpotView = { id: string; type: "chest" | "door"; label: string; x: number; z: number; ry: number; open: boolean }`;
  - `type WorldCanvas = { locksOn: boolean; locks: readonly LockSpotView[]; decor: readonly DecorId[]; storeys: number }`;
  - `worldCanvas(view)`: world objects only, none when `!locksOn` (R-G7); `storeys` = open visible floors;
  - `roomChestFor(room, view): LockSpotView | null`, `null` when `!locksOn`;
  - `applyWorldOutcome(view, o)`, which returns the same object when `!o.opened`.
- **`hud-bus.ts`:** the union gains `"lock"`.
- **`interact.ts`:**
  - `SpotInput.locks?: readonly LockSpotView[]`;
  - `lockTarget(l)`, using `CHEST_VERBS`/`DOOR_VERBS`/labels from `world-lock-copy.ts` (RG-j);
  - chest spot hw 0.55, hd 0.4; door spot hw 1.0, hd 0.3; reach 1.4, bias 0.4, ring +0.6.
- **`room-rules.ts`:** `roomSpots(plan, keeperName, chest?: LockSpotView | null)`. The chest spot comes before the door, at floor 0.
- **Boxes and painter:**
  - create `src/lib/realm3d/world-lock-boxes.ts`: `chestBoxes(open)` and `vaultDoorBoxes(open)`;
  - create `src/components/realm3d/world-locks.tsx`: `WorldLocks({ locks, heightAt })`, which exports `ChestMesh({ open })`. It has no colliders.
- **`spike-scene.tsx`** (additive, RG-a):
  - `RealmCanvasProps.worldLocks?: WorldCanvas`;
  - `World` takes `worldLocks` and passes `locks: worldLocks?.locks` into `buildSpots`, with `worldLocks` in the `spots` deps;
  - `<WorldLocks locks={worldLocks?.locks} heightAt={world.heightAt} />`.
- **`interior-scene.tsx`:** `RoomViewProps.chest?: LockSpotView | null` reaches `RoomWorld`, which feeds `roomSpots` and draws `<ChestMesh>`.
- **The hook:** create `src/components/realm3d/use-world-state.ts`: `useWorldState(initial: WorldStateView | undefined, { addPlace, say, placeName, overlayOpen })` gives `{ view, canvas, applyWorldOutcome }`. `canvas` is memoised on a string key.
- **The board:** create `src/components/realm3d/world-lock-board.tsx`: `WorldLockBoard({ childId, object, open, viewer, numerals, profile, calm, onOutcome, onClose })`.
  - An open object shows its open line, to anyone, and starts nothing.
  - Otherwise a visitor sees `WORLD_HERO_ONLY`.
  - Otherwise it starts once (an `asked` ref) and plays in `<DeedRun>`, with `onResult={(s) => s.world && onOutcome(s.world)}`.
  - A finish that rejects shows `deedErrorLine`; "Done" can be pressed again (RG-n).
- **`realm-game.tsx`** (additive):
  - `const lockState = useWorldState(realm.worldState, …)`;
  - `worldLocks={lockState.canvas}`;
  - `chest={roomChest}`;
  - the `lock` overlay branch;
  - `!== "lock"` in the negative chain.
- **`talk.ts` `resultHeadline`:** the `world` branch with an outcome. The line comes from `worldRewardLine(o)` in `world-lock-copy.ts`; an empty `rewards` gives `CHEST_EMPTY`.
- **Tests:**
  - `realm-bundle.test.ts` gains a `loadWorldRaw` mock and turns `loadKingdomOverview` into a `vi.fn` carrying `grades` (F18);
  - `realm-game.test.tsx` gains `vi.mock("@/lib/actions/world-locks", …)`.

**Interfaces:**
- **Consumes:** G1; G2's `startWorldLockRun` and `WorldOutcome`.
- **Produces:**
  - `LockSpotView`, `WorldCanvas`;
  - `worldCanvas`, `roomChestFor`, `applyWorldOutcome`;
  - `useWorldState`;
  - `RealmCanvasProps.worldLocks`, and `World`'s `worldLocks`;
  - `loadWorldRaw`.

- [ ] **Step 1: Write the failing tests.**

  **`world-state.test.ts`:**
  - `worldCanvas` lists 3 village chests and 5 doors, with `open` from `view.open`;
  - with `locksOn: false`, it gives `locks: []` and `locksOn: false`, and keeps `decor` and `storeys`;
  - `roomChestFor("library")` gives the library chest; `"mill"` gives `null`; with locks off it gives `null`;
  - a missed outcome returns the same view object.

  **`interact.test.ts` "the world's locks":**
  - one spot per lock;
  - the verbs "Open", "Look in" and "Look through";
  - reachable from any side;
  - lets go once walked on;
  - none when none are given;
  - "no spot's reach holds another spot's centre" (F19). This runs over `buildSpots` with every lock, every riddle stone, the plans board, the lectern, and every plaque at level 3.

  **`interiors.test.ts`:**
  - with the library chest, the kinds are `["villager","fixture","lock","door"]`;
  - from the spawn, `pickRoomSpot` still picks the door;
  - the three-spot test is unchanged.

  **`world-lock-boxes.test.ts`:**
  - an open lid stands higher than a closed one;
  - a door's leaf is within the frame when shut and outside it when open;
  - every box is within its footprint.

  **`world-lock-board.test.tsx`:**
  - starts once with `("c1", "chest:west-lane")`;
  - a visitor at a locked chest sees "Locks are for the hero to open." and nothing starts;
  - an open chest shows `CHEST_OPEN_LINE` to the hero and to a visitor, and nothing starts;
  - a finished run calls `onOutcome`;
  - a rejected finish shows "That didn't work." and keeps "Done".

  **`use-world-state.test.ts`:**
  - `canvas` keeps its identity across an equal re-render;
  - an open gives a new `canvas` with that chest open;
  - `initial` undefined gives `EMPTY_WORLD_STATE`.

  **`realm-game.test.tsx`:**
  - "opens a chest's lock board when E is pressed at it, and pauses the world", with no `InteractPanel`;
  - "the canvas's locks follow the switch, not the clock" (RG-l):
    - with `worldState.locksOn: false`, `handed.props.worldLocks` has `locks: []` and `locksOn: false`;
    - with the gate quiet (0 minutes), it is the bundle's canvas, unchanged.

  **`realm-bundle.test.ts`** (RG-h, red first):
  - `worldState` comes from the raw rows;
  - `locksOn` follows the settings row;
  - a grade-4 overview with no stars gives `tower: [{ band: "g45", open: false, solved: 0 }]`;
  - a failed kingdom read gives `tower: []`;
  - a failed world read gives `EMPTY_WORLD_STATE`;
  - `loadWorldRaw` is called exactly once;
  - `loadHeroLevels` and `getTimezoneForChild` are never called. `getTimezoneForChild` is spied through a partial mock of `family-timezone`. (`loadRealmSettings` is already pinned at `realm-bundle.test.ts:253`.)

  **`talk.test.ts`:**
  - the four world headlines (chest opens, door opens, miss, already open);
  - an opened chest with `rewards: []` gives exactly "The chest opens!" / "You've found everything in this chest."
- [ ] **Step 2:** `npx vitest run src/lib/realm/world-state.test.ts src/lib/realm3d/interact.test.ts src/lib/realm3d/interiors.test.ts src/lib/realm3d/world-lock-boxes.test.ts src/components/realm3d/world-lock-board.test.tsx src/components/realm3d/use-world-state.test.ts src/components/realm3d/realm-game.test.tsx src/lib/actions/realm-bundle.test.ts src/lib/realm3d/talk.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** the same command, `npx tsc --noEmit`, and `npx eslint` on the changed files. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit.** `feat(realm): chests and vault doors stand in the village, the places and two rooms, and open on their lock`.

### Task G4: What locks give, seen in the world

**Files:**
- `world-lock-boxes.ts`: `decorBoxes(id: DecorId): YardBox[]`.
- Create `src/components/realm3d/decorations.tsx`: `Decorations({ decor, heightAt })`, a sibling of `World` (one additive line in `spike-scene.tsx`). It has no colliders.
- `realm-world-state.ts`: `loadFoundPages(childId): Promise<{ id: LoreId; title: string; text: string }[]>`. These are the `lore:` rows by `updated_at`, then `object_id`; unknown ids are skipped.
- `actions/realm-chronicle.ts`: `getChronicle` returns `{ weeks, canSeal, lore }`, with the reads in parallel.
- `chronicle-book.tsx`:
  - a "Found pages" button when `lore.length > 0`;
  - pages as text;
  - "Back to the weeks".

  Update the `getChronicle` mocks in `chronicle-book.test.tsx` and `realm-game.test.tsx`.
- `talk.ts`:
  - `DeedToast.icon?: "map"`;
  - `fragmentToast(placeName: string): DeedToast` gives `{ title: "You found a map to {place}!", line: "Look for it on your map.", done: 0, total: 0, rose: false, icon: "map", spoken }`.
- `guide-hud.tsx` `DeedToastBanner`: `name={toast.icon ?? …}`, and `<Progress>` only when `toast.total > 0`.
- `use-world-state.ts`:
  - a fragment calls `addPlace(placeId)` at once;
  - its toast is held until `overlayOpen` is false.

  `realm-game.tsx` passes `placeName = (id) => world.landmarks.find((l) => l.id === id)?.name ?? "a far place"`.
- Tests:
  - `world-lock-boxes.test.ts`;
  - `world-locks-db.test.ts` ("found pages");
  - `realm-chronicle.test.ts`;
  - `chronicle-book.test.tsx`;
  - **new** `src/components/realm3d/guide-hud.test.tsx` (F18);
  - `use-world-state.test.ts`.

- [ ] **Step 1: Write the failing tests.**
  - **`world-lock-boxes.test.ts`:** every decor has at least one box, fits a 1.4 × 1.4 footprint, and stands at most 2.6 tall.
  - **`loadFoundPages`:**
    - two pages in found order;
    - `lore:nope` is skipped;
    - the pages come back whatever the locks switch says.
  - **`realm-chronicle.test.ts`:** a hero, a view-only visitor, and a hero with locks off each get `lore`.
  - **`chronicle-book.test.tsx`:**
    - no button without pages;
    - the button shows them;
    - `"<b>x</b>"` renders as literal text;
    - an empty Chronicle with one page still has the button.
  - **`guide-hud.test.tsx`:** a toast with `total: 0` has no progress and shows the map icon.
  - **`use-world-state.test.ts`:**
    - a door outcome calls `addPlace("summit-7")` at once;
    - `say` waits for `overlayOpen: false`, then fires once with "You found a map to Thunder Head!".
- [ ] **Step 2:** `npx vitest run src/lib/realm3d/world-lock-boxes.test.ts src/lib/actions/world-locks-db.test.ts src/lib/actions/realm-chronicle.test.ts src/components/realm3d/chronicle-book.test.tsx src/components/realm3d/guide-hud.test.tsx src/components/realm3d/use-world-state.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** the same command, plus `src/components/realm3d/realm-game.test.tsx`, then `npx eslint` on the changed files. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(realm): decorations appear at their spots, found pages fill the Chronicle, and a map marks its place`.

### Task G5: The Puzzle Tower

**Files:**
- `realm-world-state.ts`:
  - `loadStarredBands(childId): Promise<ReadonlySet<ContentBand>>` runs R-G5's query: `SELECT DISTINCT band FROM deed_run WHERE child_id = ? AND kind = 'deed' AND deed_id IN (<lock deeds>) AND stars = 3`;
  - `loadWorldRaw` reads it as `starred`;
  - `bumpTowerRecord(tx: Tx, childId, band, now): Promise<number>` upserts `object_id = towerRef(band)`, state `"1"`, or `CAST(CAST(state AS INTEGER) + 1 AS TEXT)` on conflict, `returning state`.
- `puzzle-tower.ts`: `towerLevel(mastery: number): number` (PC-G12).
- `actions/world-locks.ts`: `startTowerRun(childId: string, band: string): Promise<RunStart>`:
  - a band not in `CONTENT_BANDS` gives `NOT_IN_CHRONICLE`;
  - `startLockRun` with `kind "tower"`, `sourceRef: towerRef(band)` and `WORLD_*` refusals;
  - `check`: `towerFloors(await loadStarredBands(childId), towerBands(hero.grades))` must hold `{ band, open: true }`, else `TOWER_SHUT`;
  - `pick`: `findSkill(towerSkillId(band))` with `boost: 1` (giving `towerLevel`);
  - `count: 1`, `demo: false`;
  - header `{ id: towerRef(band), title: "The Puzzle Tower", story: TOWER_STORY, area: "logic" }`.
- `deed-run-types.ts`: `type TowerOutcome = { band: ContentBand; solved: number; solvedNow: boolean }`, and `RunSummary.tower?`.
- `completeDeedRun`: a tower run takes the same locked path as the world (RG-n). Inside the transaction, `outcomes[0] === "first"` calls `bumpTowerRecord`; otherwise it reads the count.
- `world-state.ts`: `applyTowerOutcome(view, o)`; `use-world-state.ts` returns it.
- `world-lock-copy.ts`:
  - `towerFloorName(i)`;
  - `towerFloorLine(f: TowerFloorView, numerals: boolean)`:
    - "{n} solved here." (open, `solved > 0`, numerals);
    - "You've solved puzzles here." (open, `solved > 0`, no numerals);
    - "A new puzzle waits." (open, 0);
    - `TOWER_WAITING` (waiting).
- `talk.ts` `resultHeadline`: the tower branch.
- `world-lock-boxes.ts`: `towerBoxes(storeys)`, clamped 0–5.
- Create `src/components/realm3d/puzzle-tower.tsx`.
- `spike-scene.tsx` (additive):
  - `built.solids.push(...towerColliders(world.heightAt))`;
  - inside `World`, `tower: worldLocks?.locksOn ? PUZZLE_TOWER.door : null` into `buildSpots` (RG-a);
  - `<PuzzleTower storeys={worldLocks?.storeys ?? 0} heightAt={world.heightAt} />`.
- `interact.ts`: `SpotInput.tower?: { x: number; z: number } | null` and `TOWER_TARGET = { kind: "tower", id: "puzzle-tower", label: TOWER_LABEL, verb: TOWER_VERB }`. The spot is hw 0.7, hd 0.9, reach 1.4, bias 0.4.
- `hud-bus.ts`: the union gains `"tower"`.
- Create `src/components/realm3d/tower-board.tsx`: `TowerBoard({ childId, floors, viewer, numerals, profile, calm, onOutcome, onClose })`.
  - It lists `floors` top down by `towerFloorName(CONTENT_BANDS.indexOf(band))`.
  - "Climb" is for the hero on open floors.
  - It plays `startTowerRun` in `<DeedRun>`.
- `realm-game.tsx` (additive): the `tower` branch, `!== "tower"`, and `applyTowerOutcome`.

**Interfaces:**
- **Consumes:** G1's `towerFloors`, `towerBands` and `towerRef`; G2's `startLockRun` and the locked finish; G3's hook, `WorldCanvas` and `World` prop.
- **Produces:** `startTowerRun`, `TowerOutcome`, `loadStarredBands`, `bumpTowerRecord`, `applyTowerOutcome`.

- [ ] **Step 1: Write the failing tests.**

  **DB** (`world-locks-db.test.ts`, "the Puzzle Tower"):
  - **`loadStarredBands`:** a 3-star `well-water` run at `g23` gives `{"g23"}`. These give nothing:
    - 2 stars;
    - 3 stars on `well-stones`;
    - a `challenge` run;
    - a `world` run;
    - an open run.
  - **`EXPLAIN QUERY PLAN`** (RG-h): `loadStarredBands`'s SQL uses `deed_run_child_completed_idx`, and the world-rows read uses `realm_world_state_child_object_idx`.
  - **`startTowerRun`:**
    - it refuses a grown-up (`WORLD_HERO_ONLY`), and locks off (`WORLD_LOCKS_OFF`) with the `tower:` rows kept;
    - `"g7"` and `"toString"` give `NOT_IN_CHRONICLE`;
    - for a grade-4 hero (`{…, logic: "4", science: "4"}`) with 3 stars at `g45`, `"k1"`, `"g23"` and `"g45"` start, and `"g68"` gives `TOWER_SHUT`;
    - with no stars, `"g45"` gives `TOWER_SHUT`;
    - the `"g23"` run has `["logic-g23"]`, `second_chances = 0` and `source_ref = 'tower:g23'`, and resumes;
    - it has no `demo`;
    - no `"solution"` appears in `JSON.stringify(start)`, fresh or resumed (RG-g).
  - **Finishing:**
    - right gives `tower = { band: "g23", solved: 1, solvedNow: true }`, then `solved: 2`;
    - a miss gives `solvedNow: false` and an unchanged count;
    - `skill_mastery` is untouched, with no stars and no minutes.

  **`world-state.test.ts`:**
  - `applyTowerOutcome` sets that floor's `solved` and returns a new view;
  - an unknown band returns the same view.

  **`world-lock-copy` tests** (`world-lock-copy.test.ts`): the three open lines, the waiting line exactly, and `towerFloorName(2) === "The third floor"`.

  **`world-lock-boxes.test.ts`:**
  - `towerBoxes(0)`'s top is `baseH`;
  - `towerBoxes(3)`'s top is `baseH + 3 * storeyH`;
  - `towerBoxes(9)` equals `towerBoxes(5)`;
  - every box is within the 6 × 6 body.

  **`puzzle-tower.test.ts`:** `towerLevel` gives 1, 4 and 4 for 0, 3 and 4.

  **`interact.test.ts`:**
  - one `TOWER_TARGET` spot;
  - reachable from the west;
  - none when `tower` is null;
  - the F19 overlap test re-run with the tower included.

  **`tower-board.test.tsx`:**
  - a visitor gets no "Climb";
  - the waiting line is exact, and nothing matches `/grade|kindergarten/i`;
  - three floors in give three rows out, top down;
  - "Climb" starts `("c1", "g23")` once;
  - a result calls `onOutcome`.

  **`talk.test.ts`:** the tower headlines.

  **`realm-game.test.tsx`:** E at the Tower opens its board.
- [ ] **Step 2:** `npx vitest run src/lib/actions/world-locks-db.test.ts src/lib/realm/world-state.test.ts src/lib/utils/world-lock-copy.test.ts src/lib/realm3d/world-lock-boxes.test.ts src/lib/realm/puzzle-tower.test.ts src/lib/realm3d/interact.test.ts src/components/realm3d/tower-board.test.tsx src/lib/realm3d/talk.test.ts src/components/realm3d/realm-game.test.tsx --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** the same command, plus `src/lib/actions/deeds-db.test.ts`, then `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(realm): the Puzzle Tower — a floor per band, opened by three stars, a storey for each`.

### Task G6: folded into G3/G5 (RG-h)

### Task G7: Verify, review, merge (4b)

- [ ] **Full checks:**
  - `npx vitest run --maxWorkers=2` (re-run the known flakes alone if they are the only failures);
  - `npx tsc --noEmit`;
  - `npx eslint src`: 0 errors.
- [ ] **0044 on a copy of the latest production backup:** it applies, and `realm_world_state` is empty.
- [ ] **Browser smoke.** Use `NEXT_DIST_DIR=.next-agent` and keys only, never a canvas click. Look at every image.
  1. `?at=-19.5,13.5` → E → solve → the chest opens and the stone bench stands at (−18, 8). The finish button reads "Done".
  2. Empty that chest. In `local.db`, set its three reward rows and an `updated_at` 8 days back by a one-off libsql `UPDATE`. Reload, solve: the line reads exactly "You've found everything in this chest." (RG-k)
  3. `?at=-53,8.5` → E at the Ringstones vault door → solve → the toast after closing; Thunder Head is filled on the map and is a ride destination.
  4. The Chronicle → "Found pages".
  5. The library room chest at language 2 (logic) and language 4 (a vocab sort).
  6. Age `chest:west-lane` 7 days → it is shut again, with a new puzzle.
  7. The Tower board with no 3-star run: one floor, with the exact waiting line (RG-k).
  8. A grade-4 hero after a 3-star science side quest: three floors, three storeys, and nothing above (RG-k).
  9. `?viewer=parent`: the state is shown, and every board refuses.
  10. Locks off: no chests or doors, and the Tower is drawn with no prompt.
  11. Phone width.
- [ ] **Whole-branch review.** It counts the per-load queries `getRealmBundle` adds: two, `loadWorldRaw`'s rows and `loadStarredBands`, both in the first round (RG-h). Then one fix wave, and a merge into `dev` **on the owner's word**.

---

# Part H: Slice 5, reading trails (branch realm-trails)

**Written 2026-11-21** against `dev` 7e74872 (slices 1–4b merged), on branch `realm-trails`. Every name below was read in that code.

**Owner's answers (2026-11-21):**
- A wrong place on a trail works like the other puzzles.
- Trails reach the village only.
- Rune objects can be fixed any time, like chests (Part I).
- Slice 5 merges into `dev` when green, pre-authorized; slice 6 needs the owner's word.

**Owner's answers to the planner's questions (2026-11-21), with the plan approved:**
- K–2 readers' trails come from one grade up, and a Kindergarten hero always hears every clue (R-H17, R-H21).
- A reading focus that no trail can play wins: that side quest plays as multiple choice (R-H22).
- With runes off, rune objects are not drawn (R-I13).

## Rulings (record them in spec §2a, "Calls settled for slice 5", in H1's commit)

- **R-H1: a wrong place works like the other puzzles (owner, 2026-11-21).**
  - `trailKind.allowsSecondChance` is `true`.
  - The first wrong anchor resolves `open`. `feedback` is `"wrong_place"`, and `hint` is the clue's redirect line for that anchor (R-H7).
  - The second wrong anchor resolves `missed`:
    - `AttemptResult.reveal` is the answer's anchor id;
    - `answer` is "It was {label}." ("It was the mill.");
    - the trail moves on to its next clue.
  - Stars, mastery and minutes follow the run kind exactly as for any side quest (`RUN_EFFECTS.deed`).
- **R-H2: the village only (owner, 2026-11-21).**
  - Every answer is one of 14 anchors in the village. No trail sends anyone to the five named places or into a room.
  - The anchors are:
    - the eight building sites;
    - the castle gate;
    - the Puzzle Tower;
    - four new small objects (R-H4).
- **R-H3: merging (owner, 2026-11-21).** Slice 5 merges into `dev` when the full checks and the whole-branch review pass. The merge is pre-authorized.
- **R-H4: anchors are a pure catalog (`ANCHORS`, `src/lib/realm/anchors.ts`).**
  - **Ids:** `landmark:<id>` for something already in the village, and `object:<id>` for one of the four new objects. Ids are never renamed or reused.
  - **Fields:** each anchor has a `label` ("the mill"), its `names` (the words that name it, used by the validator), an `icon`, and its stake point `(x, z)`. An object also has its own `object: { x, z, ry }`.
  - **Every anchor looks the same to every child.**
    - A building site is named by what it is, who keeps it and what it is for. That holds at every build stage.
    - The castle gate and the Puzzle Tower's base are always drawn.
    - The four objects are always drawn, in every palette, and are never solid.
  - **Not anchors:**
    - the hitching post and the Ring's arch, which are drawn only while riding and recess are on (`spike-scene.tsx` builds `posts` only with `ride` and `arch` only with `recess`);
    - scenery, which `calmPalette` hides;
    - reward decorations and chests, which differ per child.
- **R-H5: the `trail` kind.**
  - The response is an anchor id.
  - The view is `{}`. The clue is the task's `prompt`, and its narration is `readAloud`.
  - The answer and everything that could point at it stay on the server: `answer`, `redirect`, `redirects`, `trail`, and `explain` until the task is resolved.
  - The task id is opaque: `<skillId>:trail:<8 hex>` (RF-h's pattern).
- **R-H6: every anchor is a candidate, everywhere.**
  - During a walk, all 14 stakes have E spots, so the right one is never the only one.
  - The picture run's map shows all 14.
  - `parseResponse` accepts any anchor id.
- **R-H7: two optional members join `TaskKindDef` (planner call).**
  - `reveal?(t): string`: the lock moves its special case in `resultFor` onto it, with unchanged output.
  - `retryLine?(t, r): string`: a kind's own second-chance line for the response given.
  - `secondChanceHint(t, firstPick)` in `registry.ts` is the one place both `resultFor`'s open branch and `resumedStart`'s `pending.hint` read the line from. A kind without `retryLine` gets `taskHint(t)`, as today.
- **R-H8: reading's trail skills (planner call).**
  - `SkillSource` gains `{ kind: "trail" }`. `read-g6` (grade 6) and `read-g9` (grade 9) are trail-only rows, labelled from the ELA map.
  - `choiceDrawable(s)` (true for `generator` and `pool`) replaces each `source.kind === "lock"` test that means "has no choice questions".
  - `runCandidates` keeps only skills the run can play. Those are the choice-drawable skills, plus skills the deed's mechanic presents when it is on.
  - With trails off (or at the gate), a grade 6–12 reading side quest is `read-g4` multiple choice, exactly as today.
- **R-H9: walking runs (planner call; R-H21 and R-H22 are the owner's parts of it).** `WALKING_KINDS = ["trail"]`; slice 6 adds `"rune"`. When the deed's mechanic is a walking kind and it is on:
  - the candidates are the skills it presents;
  - if the hero's own grade has none, the candidates are the band's skill instead (`bandSkill`, the walk RG-o uses; R-H21);
  - focus extras stay candidates when they are playable (R-H8), whether the mechanic presents them or not;
  - when the fresh draw picks a focus skill the mechanic does not present, the whole run leaves the walk (R-H22);
  - otherwise, review misses and due tasks of any other kind are left out, so the run is all clues;
  - the clues keep their drawn order (whole trails, in order), and review clues come last.
- **R-H10: a trail side quest is half the grown-up's length (planner call).**
  - The reading deeds take `questionCount: TRAIL_CLUES` (4), so `deedRunLength` gives 8 → 4, 12 → 6 and 4 → 2, only when the run draws trails. Choice keeps the whole length (RF-j's rule, unchanged).
  - *Why:* each clue is a walk across the village (20–40 s) plus a longer read. Four clues take about as long as the old eight taps. Stars on four tasks are the rule science already lives with (RF-j, accepted).
- **R-H11: a week without repeats (planner call).**
  - The drawer passes over trails met in the hero's last `TRAIL_MEMORY_RUNS = 7` reading side quests (`loadRecentTrailIds`). It uses them only after every other trail at every level is used.
  - Pools hold at least 15 trails, so 7 runs at the default length (at most 2 trails each) never repeat a trail.
  - At longer lengths, a repeat may come sooner. That is accepted.
- **R-H12: trail pools** (`src/content/trails/trail-<band>.json`, validated, blind-passed). Each band's pool credits one skill:

  | Band | Pool | Skill |
  |---|---|---|
  | k1 | `trail-k1` | `read-g1` |
  | g23 | `trail-g23` | `read-g3` |
  | g45 | `trail-g45` | `read-g4` |
  | g68 | `trail-g68` | `read-g6` |
  | g912 | `trail-g912` | `read-g9` |

  - A trail is 2–4 clues (k1: 2–3).
  - Every clue can be answered from its own text alone. The blind sheet shuffles clues across trails to prove it.
- **R-H13: comprehension by band (planner call: the spec's level, served through the credited skill's map line).**
  - **k1 (`read-g1`):** literal and decodable. The clue may name its place ("Go to the mill.").
  - **g23 (`read-g3`, main idea):** a 2–3 sentence note whose main idea is the place. It never names the place.
  - **g45 (`read-g4`, inference and what it rests on):** inference and vocabulary in context. `why` says what the answer rests on.
  - **g68 (`read-g6`, purpose and point of view):** a villager's note whose purpose, together with two or more facts, fits exactly one place (`parts`).
  - **g912 (`read-g9`, tone and word choice):** figurative or precise wording that must be read for meaning, combined with facts (`parts`).
- **R-H14: the walking run in the Realm.**
  1. The villager's board starts the run as today. A K–3 hero sees Pip's trail demo first.
  2. When every task is a clue (`isWalkingRun`), the board shows the clue and "Set off". "Set off" closes the board and hands the run to the frame's `TrailWalk` tracker.
  3. E at a stake ("Search the mill") answers the current clue. Resolution moves straight to the next clue. After the last one, the run finishes, and the villager's board opens on the result card. The building rises when that board closes, as it does today.
  4. "Leave the trail" ends the walk. The run stays open, and the villager resumes it within the hour.
  5. *Planner call:* the tracker does not survive a reload. No per-load query is added.
- **R-H15: the picture run off-world.** On the Side Quests page (and on any board without a walk), the clue is answered on an SVG village map:
  - all 14 anchors are buttons;
  - a tap selects, and "Search here" sends;
  - a ruled-out place is marked "Not here";
  - a resolved miss marks the answer "It was here.";
  - it fits 390 px.
- **R-H16: demo-first.** `DemoKey` gains `"trail"`, with one demo, "Watch Pip", shown to a K–3 hero before their first clue (R-F10's rule, unchanged).
- **R-H17: narration (owner, 2026-11-21).**
  - **A Kindergarten hero always hears every clue read aloud, whatever `profile.readAloud` says.** That covers the clue, its second-chance line and its miss line, on the board, on the page and in the tracker, and Pip's trail demo before the first clue.
  - Every other hero, grade 1 included, hears a clue unprompted only with `profile.readAloud` on. The read-aloud button is always there (`canSpeak()`).
  - The server marks the run: `RunStart.narrateClues: true` when the hero's grade in the run's strand is K and the run holds a trail task, on a fresh start and a resumed one alike.
  - The browser decides with one pure rule, `autoSpeaks(task, readAloud, narrateClues)`: `readAloud || (narrateClues && task.kind === "trail")`.
  - Every k1 clue carries `readAloud` (validator), so a K clue is always spoken in its narration form. Other bands may.
  - The tracker, the board and the page share the existing speech path.
- **R-H18: the switch.**
  - "Reading trails" (`mechanics.trail`) defaults on. Off, reading plays as multiple choice.
  - The gate is always multiple choice (R-C4).
  - Riddle stones and Quick review stay multiple choice (R-C6), so the reading drill pools stay as choice review.
- **R-H19: no migration and no per-load query.**
  - Trails keep no world state, so `realm_world_state` is untouched.
  - A reading run start with trails on costs one more query, `loadRecentTrailIds`, in its second parallel round.
- **R-H20: the reading deeds' stories are unchanged.** The walk's own words come from `trail-copy.ts`.
- **R-H21: K–2 readers' trails come from one grade up (owner, 2026-11-21).**
  - With trails on, a K hero's reading side quest draws `read-g1` trails and a grade-2 hero's draws `read-g3` trails (R-H9's band walk), and those skills' mastery moves.
  - Their sight-word skills stay in review (riddle stones, Quick review) and in a grown-up's focus (R-H22).
- **R-H22: a reading focus no trail can play wins (owner, 2026-11-21).**
  - When the fresh draw of a reading side quest (`selectSkills`) picks a grown-up's focus skill that no trail pool presents (`sight-k1`, `sight-g23`), that side quest plays as multiple choice. Other reading side quests stay trails.
  - It mirrors 4a's vocabulary-focus rule in `buildDeedRun`'s kind choice, in the other direction. `focusOffWalk = isWalkingKind(deed.mechanic) && skills.some((s) => focus.has(s.id) && !TASK_KINDS[deed.mechanic].presents(s.id))` is worked out right after `selectSkills`. When it is true, `kindOfSkill` starts from `"choice"` for every skill, and 4a's lock fallback still applies after it.
  - A non-presented focus skill that is only due, in a run that stays a trail, is left out like any due task of another kind.
  - Length: `drawsMechanic` is then false, so the run is the grown-up's whole length (RF-j's fix: half only when the run actually draws the hands-on kind).
  - A focus skill a trail does present (`read-g4` for a grade-3 hero) leaves the run a trail.

## Global constraints for Part H

Parts F and G's constraints still apply, plus:

- **The leak rule.** A trail task reaches the browser only through `toClientTask`, and its view is `{}`.
  - The answer, the redirects, `trail` and `why` never leave the server before resolution.
  - The second-chance line is the redirect for the anchor the child chose.
  - `reveal` is the answer, sent only on a resolved miss.
- **Content never names the answer where it must not.** The validator matches `ANCHORS[answer].names` as whole words, case-insensitively:
  - in every redirect line, at every band;
  - in clue text and `readAloud` from g23 up.
- **The Realm rules:**
  - additive, local lines only in `realm-game.tsx`, `spike-scene.tsx` and `hud-bus.ts` (`frame-hud.tsx` and `hud.tsx` are not touched);
  - painters and the tracker are new files;
  - no `three` under Vitest: boxes live in pure `anchor-boxes.ts`;
  - `World` stays memoised, and its new prop is a boolean;
  - no `Math.random`: the drawer takes the seeded `Rng`;
  - browser checks press keys and never click the canvas.
- **No new way to earn minutes.** A trail side quest is a `deed` run, paid by stars as every side quest is. No other path pays.
- **Tests:** every `npx vitest run` has `--maxWorkers=2`.
- **No child-facing grade or band word,** and nobody is "behind" or "ahead". The validator enforces this on the content.
- **Copy** (`src/lib/tasks/trail-copy.ts`, client-safe; exact):
  - `TRAIL_SEARCH_VERB = "Search"`, so the prompt reads "Search the mill".
  - `TRAIL_RETRY_LEAD = "Not here."` (the second-chance line is the lead, then the redirect).
  - `trailAnswerText(label)` gives "It was {label}."
  - `TRAIL_SET_OFF = "Set off"`; `TRAIL_SET_OFF_LINE = "Read the clue, then walk to the place it tells of and search there."`
  - `TRAIL_LOOKED_HERE = "You searched here already. Try somewhere else."`
  - `TRAIL_LEAVE = "Leave the trail"`; `TRAIL_FINISH = "Finish the trail"`.
  - `TRAIL_HIDE = "Hide the clue"`; `TRAIL_SHOW = "Show the clue"`.
  - `TRAIL_TRACKER_LABEL = "Reading trail"`.
  - `TRAIL_MAP_HELP = "Tap the place the clue tells of, then Search here."`; `TRAIL_MAP_SEARCH = "Search here"`; `TRAIL_MAP_REVEAL = "It was here."`; `TRAIL_MAP_RULED_OUT = "Not here"`.
  - `GENERIC_TRAIL_HINT = "Read the clue again and picture the place it tells of."` (`skill-hints.ts`).
  - `TRAIL_DEMO_COPY = "Watch Pip follow a clue. The clue says: Go to the well. Pip reads it, walks to the well, and searches there. Found it!"`
  - The settings switch: "Reading trails". Its hint is "Reading side quests become clue trails: in the Realm your hero walks to the place each clue names; on the Side Quests page they tap it on a village map. Off: reading plays as multiple choice."

## Review Focus (Part H)

1. **No answer reaches the browser.** This covers:
   - a fresh start and a resumed one;
   - an open second chance, whose line is the chosen anchor's redirect;
   - the task id;
   - `readAloud`.

   None of them carries the answer's anchor id, its label (from g23 up), `trail` or `why`. Pinned in H2 (`toClientTask`), H4 (validator) and H7 (the start JSON against the stored answers).
2. **A forged anchor is refused, with nothing written.** The forged values are `"landmark:longwater"`, `"toString"`, `"__proto__"`, `42`, `{}`, `""` and a 10 KB string. Each is refused with `PICK_SHOWN`; no response is stored and no mastery moves. Pinned in H2 and H7.
3. **Reading falls back to today's choice run, never an empty run**, when:
   - trails are off;
   - the run is at the gate;
   - a grade-6–12 reader's trail skill has no choice pool.

   Every grade from K to 12 gets a non-empty run with the pre-slice skill. Pinned in H3 and H7.
4. **A reading choice run stored before the deploy resumes and completes as before.** A stored trail task whose answer is no longer an anchor grades as wrong, never a throw. Pinned in H2 and H7.
5. **Searching the same place twice on a second chance** is refused (`TRY_DIFFERENT`), and the tracker says `TRAIL_LOOKED_HERE` without a call. E at a stake does nothing:
   - while the clue is resolved;
   - while a call is in flight;
   - while no walk is on.

   Pinned in H2 and H9.

**Execution order:** H1, H2, H3, H4, H5, then H6 and H7 side by side (H6 only reads sheets and H7 touches no content), then H8, H9, H10.

## File map (Part H)

| File | Responsibility |
|---|---|
| **New, pure, client-safe** | |
| `src/lib/realm/anchors.ts` | `ANCHORS`, ids, labels, names, stake points, `ANCHOR_SPOT`, `ANCHOR_SPOTS`, `nearAnchors` |
| `src/lib/realm/trail-map.ts` | the picture run's projection and backdrop |
| `src/lib/realm3d/anchor-boxes.ts` | stake and object boxes |
| `src/lib/tasks/trail-copy.ts` | Part H's copy |
| `src/lib/tasks/narration.ts` | `autoSpeaks`, the one rule for unprompted speech (R-H17) |
| **New, tooling** | |
| `src/lib/content/trail-anchor-facts.ts` | the always-true facts authors and blind readers work from |
| `src/lib/content/trail-pools.ts`, `trail-blind-pass.ts`, `trail-blind-pass-cli.ts` | format, validator, blind pass |
| **New, server** | |
| `src/lib/tasks/trail.ts` | `trailKind` |
| `src/lib/tasks/trails/{index,draw,trail-pool-files}.ts` | the loader, `trailPoolFor`, `drawTrailClues` |
| **New, content and docs** | |
| `src/content/trails/trail-{k1,g23,g45,g68,g912}.json`; `src/content/review/trail-*.blind.md` | the pools and their sheets |
| `docs/content/trail-skill-map.md` | the band → pool → skill map, read by its test |
| **New, client** | |
| `src/components/tasks/trail-presenter.tsx`, `trail-map.tsx`, `trail-demo.tsx`, `trail.css` | Set off, the picture run, the demo |
| `src/components/realm3d/trail-objects.tsx`, `trail-stakes.tsx` | painters, siblings of `World` |
| `src/components/realm3d/use-trail-walk.ts`, `trail-walk.tsx`, `trail-walk.css` | the walk's state and its tracker |
| **Modified** | |
| `src/lib/tasks/types.ts`, `registry.ts`, `codecs.ts`, `kinds.ts`, `draw.ts`, `demos.ts`, `lock.ts`, `client-boundary.test.ts` | the kind; `reveal`/`retryLine`; walking kinds; the run drawer; the demo key |
| `src/lib/utils/skills.ts`, `band-skill.ts` (new), `world-lock-run.ts`, `deed-engine.ts`, `review-run.ts`, `deeds.ts`, `skill-hints.ts`, `app/dev/content/sample.ts` | trail skills, candidates, walking runs, reading deeds |
| `src/lib/actions/deeds.ts`, `src/lib/services/deed-run-store.ts`, `src/lib/utils/deed-run-types.ts` | `resultFor`, the start's order, `loadRecentTrailIds`, `resumedStart`'s hint, `demoAt`, `RunStart.narrateClues` |
| `src/components/deed-player.tsx` | the page's unprompted speech through `autoSpeaks` |
| `src/lib/realm3d/talk.ts`, `interact.ts`, `hud-bus.ts` | feedback words; anchor spots; the union |
| `src/components/tasks/presenters.tsx`, `task-demo.tsx`, `src/components/realm3d/deed-board.tsx`, `spike-scene.tsx`, `realm-game.tsx`, `src/app/(app)/settings/realm-settings-panel.tsx` | wiring |
| `docs/content/ela-science-skill-map.md`, `src/lib/utils/skills.test.ts` | `read-g6`/`read-g9` status, and the unwritten-pool list |

## Tasks

### Task H1: World anchors (pure)

**Files:**
- Create `src/lib/realm/anchors.ts` + `anchors.test.ts`.
- Create `src/lib/realm/trail-map.ts` + `trail-map.test.ts`.
- Create `src/lib/realm3d/anchor-boxes.ts` + `anchor-boxes.test.ts`.
- Create `src/lib/content/trail-anchor-facts.ts` (tested in `anchors.test.ts`).
- Spec §2a: add "Calls settled for slice 5 (2026-11-21)", with the owner's answers and R-H1–R-H22, one line each. Spec §4.6: strike the `place:longwater` example and say "village only (owner, 2026-11-21)".

**Interfaces (produces):**
- `type AnchorId`: the 14 ids below.
- `type ObjectAnchorId = Extract<AnchorId, \`object:${string}\`>`.
- `type Anchor = { id: AnchorId; kind: "landmark" | "object"; label: string; names: readonly string[]; icon: GameIconName; x: number; z: number; object?: { x: number; z: number; ry: number } }`.
- `ANCHORS: Readonly<Record<AnchorId, Anchor>>` and `ANCHOR_IDS: readonly AnchorId[]`, in catalog order.
- `isAnchorId(x: unknown): x is AnchorId`, over own keys only.
- `anchorById(id: string | null | undefined): Anchor | null`; `anchorLabel(id: AnchorId): string`.
- `ANCHOR_SPOT = { radius: 0.5, reach: 1.4 } as const`.
- `ANCHOR_SPOTS: readonly { id: AnchorId; label: string; x: number; z: number }[]`, a module constant with one identity.
- `nearAnchors(id: AnchorId, within = 10): AnchorId[]`, nearest first, excluding itself.
- `TRAIL_ANCHOR_FACTS: Readonly<Record<AnchorId, readonly string[]>>`.
- `TRAIL_MAP_VIEW = { w: 360, h: number }`, with `h` fitted to the anchors' extent plus a margin.
- `TRAIL_MAP_HIT = 20`.
- `trailMapPoint(x: number, z: number): { x: number; y: number }`: north is up, and the scale is uniform.
- `trailMapBackdrop(): { road: { x1: number; y1: number; x2: number; y2: number }[]; plots: { id: string; x: number; y: number; w: number; h: number }[] }`. The plots are the 8 `BUILDING_SLOTS`, the castle and the Tower; the road runs from `SPAWN` to the castle.
- `stakeBoxes(revealed: boolean): YardBox[]`; `trailObjectBoxes(id: ObjectAnchorId): YardBox[]`.

**The catalog.** The points are starting points, and the tests arbitrate.
- A building stake starts 1.2 north of its drawn site (`drawnSite(id)`), centred: never on the front, where the villager stands.
- If a point fails, move to the nearest passing point on a 0.25 grid, any side but the front, at most 3.5 from what it names. Record each move in the commit.

| id | label | names | icon | stake (x, z) | object (x, z, ry) |
|---|---|---|---|---|---|
| `landmark:well` | the well | well | box | (−4.55, 5.6) | |
| `landmark:mill` | the mill | mill | compass | (5.05, 5.1) | |
| `landmark:bridge` | the bridge | bridge | link | (−14.55, −3.5) | |
| `landmark:chapel` | the chapel | chapel | temple | (14.05, −14.0) | |
| `landmark:market` | the market | market | gift | (−7.55, −7.0) | |
| `landmark:library` | the library | library | book | (8.55, −8.5) | |
| `landmark:watchtower` | the watchtower | watchtower, watch tower | watchtower | (−11.0, −12.7) | |
| `landmark:garden` | the garden | garden | flower | (13.55, −2.0) | |
| `landmark:castle-gate` | the castle gate | castle gate, castle | castle | (3.2, −11.4) | |
| `landmark:puzzle-tower` | the Puzzle Tower | puzzle tower | lock | (25.5, 18.8) | |
| `object:notice-board` | the notice board | notice board, board | scroll | (6.5, 16.6) | (6.5, 15.5, 0) |
| `object:water-trough` | the water trough | water trough, trough | droplet | (−3.5, 24.1) | (−3.5, 23.0, 0) |
| `object:beehives` | the beehives | beehive, beehives, hive, hives | bee | (−16.0, 20.1) | (−16.0, 19.0, 0) |
| `object:hay-cart` | the hay cart | hay cart, cart | sun | (21.0, −5.4) | (21.0, −6.5, π/2) |

**Facts.** These are 1–3 short sentences per anchor. Every fact is true for every child at every build stage.
- For a building, use its `BUILDINGS` description and its keeper, for example: "Old Bram looks after it." and "Clean water for every doorstep."
- For the gate: "The way into the castle, at the north end of the road."
- For the Tower: "A tall stone tower of bonus puzzles, at the south-east edge of the village."
- For an object, use what it is and what it is for, for example: "Villagers pin up news and notes here."

- [ ] **Step 1: Write the failing tests.**

  **`anchors.test.ts`:**
  - "fourteen anchors, prefixed, unique": `ANCHOR_IDS.length === 14`; every id matches `/^(landmark|object):[a-z-]+$/`; and `Object.keys(ANCHORS)` equals `ANCHOR_IDS`.
  - "an anchor for every building": for each `BUILDINGS` entry `b`, `ANCHORS[\`landmark:${b.id}\`]` exists, and its `icon` is `b.icon`.
  - "own keys only":
    - `isAnchorId` gives `false` for `"toString"`, `"__proto__"`, `"constructor"`, `"landmark:longwater"`, `42` and `null`;
    - `isAnchorId("landmark:mill")` is `true`;
    - `anchorById("__proto__")` is `null`.
  - "names are unambiguous":
    - every name is lower case and non-empty;
    - no anchor's name occurs as a whole word in another anchor's label;
    - each label contains one of its own names as a whole word, case-insensitively ("the mill" contains "mill").
  - "a stake stands by what it names":
    - a building's stake: `0.6 <= distToRect(drawnSite(id), p) <= 3.5`, and its z is not greater than the drawn site's `z1`, so it is not on the front;
    - the castle gate's stake is within 3.5 of `CASTLE_POSITION` plus `castlePlan(type).gate`, for every type in `CASTLE_TIER_IDS`;
    - the Tower's stake is within 3.5 of `rectAt(25.5, 23.5, 6, 6)`;
    - an object's stake is within 1.6 of its object.
  - "inside the village": every stake and object has `|x| <= 26` and `-16 <= z <= 26`.
  - "the objects clear the village", for each object at `rectAt(o.x, o.z, 1.6, 1.6)`:
    - `clearanceFailures(id, rect, undefined, 0)` and `levelFailures(id, rect)` are `[]`;
    - it is at least 1.0 from every `yardPieces()` and `villagePieces()` rect, from every `DECOR` spot, and from every village chest in `WORLD_OBJECTS` (no `room`);
    - it is at least 1.5 from the Tower's 8×8 plot;
    - it is more than 1.4 from every `VILLAGE_TRACKS` segment (`segmentDistance`).
  - "no stake stands in anything solid": each stake point lies outside every footprint grown by 0.3. The footprints are each `colliders` entry (position ± size / 2) of `buildWorldLayout({ castleType, buildings: every building complete })`, for every castle type, plus `towerColliders(() => 0)`.
  - "nearAnchors": `nearAnchors("landmark:well")` excludes the well, is sorted by distance, and every result is within 10.
  - "facts": every anchor has 1–3 facts, each at most 120 characters. None matches `/grade|kindergarten/i`, `/\b(behind|ahead)\b/i` or `/</`.

  **`trail-map.test.ts`:**
  - every anchor's point lies within `[TRAIL_MAP_HIT, w − TRAIL_MAP_HIT] × [TRAIL_MAP_HIT, h − TRAIL_MAP_HIT]`;
  - every two anchors' points are at least `2 * TRAIL_MAP_HIT` (40) apart, so the buttons never overlap at 360 wide;
  - north is up: `trailMapPoint(0, -14).y < trailMapPoint(0, 15).y`;
  - `h <= 480`;
  - the backdrop has 10 plots and one road line.

  **`anchor-boxes.test.ts`:**
  - every stake box lies inside `ANCHOR_SPOT.radius` and stands at most 1.6 tall;
  - `stakeBoxes(true)` differs from `stakeBoxes(false)` only in colour, to the gold `#e8b84a`;
  - every object has 2–8 boxes, each inside a 1.6 × 1.6 footprint, at most 2.2 tall.
- [ ] **Step 2:** `npx vitest run src/lib/realm/anchors.test.ts src/lib/realm/trail-map.test.ts src/lib/realm3d/anchor-boxes.test.ts --maxWorkers=2`. Expected: FAIL, "Cannot find module".
- [ ] **Step 3: Implement.** Move any failing point as described above. If `trail-map.test`'s spacing fails, prefer moving an object, never a building's stake.
- [ ] **Step 4:** the same command, then `npx tsc --noEmit`. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit.** `feat(realm): fourteen places in the village a clue can lead to`.

### Task H2: The `trail` kind

**Files:**
- **`src/lib/tasks/types.ts`:**
  - `TaskKind` gains `"trail"`;
  - add `TrailTask`, `TrailView` and `TrailResponse`, each `…ByKind` gaining `trail`;
  - `FeedbackCode` gains `"wrong_place"`;
  - `TaskKindDef` gains `reveal?` and `retryLine?`.
- **Create:**
  - `src/lib/tasks/trail.ts` (server) and `trail.test.ts`;
  - `src/lib/tasks/trail-copy.ts`.
- **`codecs.ts`:** the trail codec and `TRAIL_MAX_CHARS = 40`.
- **`registry.ts`:** `trail: trailKind`; `secondChanceHint`.
- **`kinds.ts`:**
  - `HANDS_ON_KINDS = ["measure", "lock", "trail"]`;
  - `WALKING_KINDS = ["trail"] as const`;
  - `isWalkingKind`, `isWalkingRun`.
- **`draw.ts`:**
  - `TASK_DRAWERS.trail`, returning `null` until H4;
  - `type RunDrawer`, `TASK_RUN_DRAWERS = {}` and `runDrawerFor`.
- **`lock.ts`:** `reveal: (t) => TASK_CODECS.lock.encode(t.solution)`.
- **`actions/deeds.ts`:**
  - `resultFor` sets `reveal` through `def.reveal` and drops `question.kind === "lock"`;
  - its open branch uses `secondChanceHint(question, firstPick)`.
- **`services/deed-run-store.ts`:** `resumedStart`'s `pending.hint` uses `secondChanceHint(questions[at], attempts[at].first)`.
- **`skill-hints.ts`:** `taskHint` gives `GENERIC_TRAIL_HINT` for a trail task.
- **`talk.ts`:** `attemptFeedback`:
  - a `wrong_place` second chance leads with `TRAIL_RETRY_LEAD`;
  - a resolved trail miss is a sentence (`result.answer` as is), like a lock's.
- **Settings:** `realm-settings-panel.tsx` `MECHANIC_LABELS.trail`. Add `trail: true` to the tests that pin the mechanics record: `grep -rln "lock: true" src --include=*.test.*` (6 files).
- **`client-boundary.test.ts`:** `SERVER_ONLY` gains `"trail"` and `"trails"`.

**Interfaces:**
- **Consumes:** H1's `AnchorId`, `isAnchorId` and `anchorLabel`.
- **Produces:**

  ```ts
  export type TrailTask = {
    kind: "trail"; id: string; skillId: string; prompt: string; readAloud?: string;
    answer: AnchorId; redirect: string; redirects?: Partial<Record<AnchorId, string>>;
    /** `<poolId>/<trailId>`: which trail it came from, for the week's memory. Server only. */
    trail: string;
    explain?: string;
  };
  export type TrailView = Record<string, never>;
  export type TrailResponse = AnchorId;
  // TaskKindDef<K> gains:
  reveal?(t: TaskByKind[K]): string;
  retryLine?(t: TaskByKind[K], r: ResponseByKind[K]): string;
  ```

  - `secondChanceHint(t: Task, firstPick: string | null | undefined): string`: the decoded first pick's `retryLine` when the kind has one and the pick decodes; otherwise `taskHint(t)`.
  - `isWalkingKind(k: TaskKind): boolean`.
  - `isWalkingRun(run: { questions: readonly { kind: TaskKind }[] }): boolean`: there is at least one task, and every task's kind is walking.
  - `type RunDrawer = (skill: Skill, level: number, count: number, rng: Rng, exclude: ReadonlySet<string>, avoid: ReadonlySet<string>) => Task[]`.
  - `runDrawerFor(kind: string): RunDrawer | undefined`, own keys only.

**`trailKind`:**
- `toView`: `() => ({})`.
- `parseResponse`: a string of at most 40 characters for which `isAnchorId` holds; otherwise `null`. It never trims.
- `isCorrect`: `r === t.answer`.
- `allowsSecondChance`: `() => true`.
- `feedback`: `"none"` when right, else `"wrong_place"`.
- `answerText`: `trailAnswerText(anchorLabel(t.answer))`. When `t.answer` is not an anchor (a stored task after a catalog change), it gives "It was somewhere else." and never throws.
- `reveal`: `(t) => t.answer`.
- `retryLine`: `(t, r) => t.redirects?.[r] ?? t.redirect`.
- `presents`: `(skillId) => trailPoolFor(skillId) !== undefined`. Until H4, an empty registry, so no run changes (RF-a's pattern).
- The codec:
  - `encode` is identity;
  - `decode` gives `isAnchorId(s) ? s : null`;
  - `sameResponse` is `===`.

- [ ] **Step 1: Write the failing tests.** They use an inline stub `TrailTask`: `answer: "landmark:mill"`, `redirect: "Read the last word again."`, `redirects: { "landmark:well": "That is where water is drawn." }`, `trail: "trail-k1/mill-walk"`.

  **`trail.test.ts`:**
  - "never shows the answer": `toClientTask(stub)` deep-equals `{ kind: "trail", id, skillId, prompt, readAloud, view: {} }`, and its JSON contains none of `"landmark:mill"`, `"mill-walk"`, the redirect texts or `explain`.
  - "refuses every forged response" (Review Focus 2): `parseResponse` is `null` for `"landmark:longwater"`, `"toString"`, `"__proto__"`, `" landmark:mill"`, `42`, `{}`, `""` and `"x".repeat(10_000)`, and is `"landmark:well"` for `"landmark:well"`.
  - "right and wrong": `isCorrect(stub, "landmark:mill")`; `feedback(stub, "landmark:well") === "wrong_place"`; `feedback(stub, "landmark:mill") === "none"`.
  - "the redirect is the chosen place's":
    - `retryLine(stub, "landmark:well") === "That is where water is drawn."`;
    - `retryLine(stub, "landmark:garden") === "Read the last word again."`.
  - "the miss says where it was": `answerText(stub) === "It was the mill."` and `reveal(stub) === "landmark:mill"`.
  - "a stored answer that is no longer an anchor grades wrong, never throws" (Review Focus 4): with `answer: "landmark:gone"`, `isTaskCorrect(t, "landmark:mill") === false` and `answerText(t) === "It was somewhere else."`.
  - "presents nothing before pools exist": `presents("read-g3") === false`.

  **`registry.test.ts`:**
  - `secondChanceHint(stub, "landmark:well")` is the well's redirect;
  - `secondChanceHint(stub, "garbage")` is `taskHint(stub)`;
  - a choice task gives `taskHint(q)`;
  - `isWalkingRun({ questions: [] }) === false`;
  - `[trail, trail]` is a walking run, and `[trail, choice]` is not.

  **`deeds-db.test.ts`** (with a stub trail run inserted by SQL):
  - "a trail's first wrong place is a second chance with that place's redirect": the result is `{ correct: false, secondChance: true, hint: "That is where water is drawn.", feedback: "wrong_place", firstPick: "landmark:well" }`, with no `answer` and no `reveal`.
  - "the same place again is refused": `retryDeedQuestion(…, "landmark:well")` rejects `TRY_DIFFERENT`, and `second_tries` is unchanged (Review Focus 5).
  - "the second wrong place reveals the answer": `{ correct: false, secondChance: false, answer: "It was the mill.", reveal: "landmark:mill" }`.
  - "a lock's reveal is unchanged": the existing lock reveal test stays green.
  - "a resumed open second chance carries the redirect": `startDeedRun` on the open run gives `pending.hint === "That is where water is drawn."`.
  - "a forged anchor writes nothing": `answerDeedQuestion(run, 0, "toString")` rejects `PICK_SHOWN`; `responses` is unchanged and there is no `skill_mastery` row.

  **`talk.test.ts`:**
  - `attemptFeedback({ correct: false, secondChance: true, feedback: "wrong_place", hint: "That is where water is drawn." }, false)` gives `{ heading: "Try again", text: "Not here. That is where water is drawn." }`;
  - a trail miss with `answer: "It was the mill."` and `explain: "Flour is ground at the mill."` gives `"It was the mill. Flour is ground at the mill."`.

  **`realm-settings-panel.test.tsx`:** the switch "Reading trails" with its hint, on by default. **`realm-settings.test.ts`:** a stored `{"measure":true,"lock":true}` reads `trail: true`.
- [ ] **Step 2:** `npx vitest run src/lib/tasks/trail.test.ts src/lib/tasks/registry.test.ts src/lib/tasks/client-boundary.test.ts src/lib/actions/deeds-db.test.ts src/lib/realm3d/talk.test.ts src/lib/utils/realm-settings.test.ts "src/app/(app)/settings/realm-settings-panel.test.tsx" --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3: Implement to the interfaces.**
  - `TASK_PRESENTERS.trail` is a stub that renders `null` until H8. It is unreachable while `presents` is empty.
  - `demoKeyOf` returns `null` for trail until H8.
- [ ] **Step 4:** the same command, plus `src/lib/tasks/lock.test.ts src/lib/actions/world-locks-db.test.ts`, then `npx tsc --noEmit`. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit.** `feat(tasks): the trail kind — a clue answered by a place, with a gentle redirect and the place shown after a miss`.

### Task H3: Reading's trail skills, and candidates a run can play

**Files:**
- **`skills.ts`:**
  - `SkillSource` gains `{ kind: "trail" }`;
  - `choiceDrawable(s: Skill): boolean`;
  - two new rows, `{ id: "read-g6", label: "Author's purpose and point of view", area: "reading", grades: ["6"], source: trail() }` and `{ id: "read-g9", label: "Tone and word choice", area: "reading", grades: ["9"], source: trail() }`.
- **Create `src/lib/utils/band-skill.ts`:** `bandSkill`. `world-lock-run.ts`'s `sortSkill` becomes a call to it, guarded by `world-lock-run.test.ts`.
- **`deed-engine.ts`:**
  - `chooseSkills(deed, grade, playable?)`;
  - `runCandidates(deed, grade, focusSkillIds?, enabledKinds?)`, whose playable filter is R-H8;
  - the choice path of `drawForSkill` returns `[]` for `!choiceDrawable(skill)`;
  - `selectSkills`' fallback stays `source.kind !== "lock"`, so a trail-only skill that is a run's one candidate is still picked (H7 relies on it);
  - `buildDeedRun` passes its `enabled` to `runCandidates`.
- **`actions/deeds.ts` `startDeedRun`:**
  - `loadRealmSettings` moves into the first `Promise.all` (no extra round trip);
  - `enabledKinds` is computed before `runCandidates`, which receives it.
- **`review-run.ts:37`:** `skill && choiceDrawable(skill)`.
- **`app/dev/content/sample.ts`:** a trail-source skill samples "trail pool (see H4)", with no throw.
- **`skill-hints.ts`:** hints for the two rows, following the hint rules.
- **Docs:**
  - `docs/content/ela-science-skill-map.md`: the `read-g6` and `read-g9` Status becomes "new — played as reading trails; no multiple-choice pool yet";
  - `skills.test.ts`: `POOLS_NOT_YET_WRITTEN` loses `"read-g6"` and `"read-g9"`; the 39-row and 12-carried counts are unchanged.

**Interfaces:**
- **Produces:**
  - `choiceDrawable(s: Skill): boolean`.
  - `bandSkill(area: SkillArea, grade: Grade, accept: (s: Skill) => boolean): { skill: Skill; grade: Grade } | null`. It walks `nearestGrades(grade)`, skips grades outside `bandForGrade(grade)`, and gives the first `skillsFor(area, g)` skill that `accept` takes.
  - `runCandidates(deed: Deed, grade: Grade, focusSkillIds: readonly string[] = [], enabledKinds?: ReadonlySet<TaskKind>): Skill[]`. When `enabledKinds` is absent, every kind is on (`buildDeedRun`'s default). `playable(s) = choiceDrawable(s) || (deed.mechanic !== "choice" && on(deed.mechanic) && TASK_KINDS[deed.mechanic].presents(s.id))`. The base is `chooseSkills(deed, grade, playable)`; focus extras must be `playable`. H7 adds the walking rules here.

- [ ] **Step 1: Write the failing tests.**

  **`skills.test.ts`:**
  - the two rows;
  - `choiceDrawable` is true for `read-g4` and `add-10`, and false for `read-g6` and `logic-g45`;
  - the map tests pass with the shorter unwritten list.

  **`band-skill.test.ts`:**
  - `bandSkill("reading", "K", (s) => s.id === "read-g1")` gives `{ read-g1, "1" }`;
  - `bandSkill("reading", "4", (s) => s.id === "read-g3")` gives `null`, because 3 is outside 4's band.

  **`world-lock-run.test.ts`:** unchanged and green (RG-o's cases).

  **`deed-engine.test.ts`:**
  - "reading stays multiple choice where trails cannot play": for every grade 6–12, `runCandidates(readingDeed, g, [], ALL_ON).map(id)` is `["read-g4"]`;
  - K gives `["sight-k1"]` and 2 gives `["sight-g23"]` (Review Focus 3);
  - "math, science and language candidates are unchanged at every grade": `runCandidates(d, g, [], ALL_ON)` equals `chooseSkills(d, g)` for one deed of each area and every grade;
  - "a choice draw of a trail skill is empty, never a throw": `drawForSkill(read-g6, 0, 4, rng, [], new Set(), new Set())` is `[]`;
  - the climb inventories: `chooseSkills` (unfiltered) now finds `read-g6` at 6–8 and `read-g9` at 9–12. Update the reading lines of the inventory with that reason.

  **`review-run.test.ts`:** a hero with a `read-g6` mastery row is never offered it as review.

  **`deeds-db.test.ts`:** "a grade-7 reading side quest is `read-g4` multiple choice, eight questions" (red before the filter: `NONE_READY`).
- [ ] **Step 2:** `npx vitest run src/lib/utils/skills.test.ts src/lib/utils/band-skill.test.ts src/lib/utils/world-lock-run.test.ts src/lib/utils/deed-engine.test.ts src/lib/utils/review-run.test.ts src/lib/actions/deeds-db.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** the same command, plus `src/lib/utils/focus.test.ts src/lib/utils/deeds.test.ts`, then `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(skills): reading at six and nine joins the catalog, played only as trails; a run draws only what it can play`.

### Task H4: Trail pools — format, validator, blind pass, drawer

**Files:**
- Create `src/lib/content/trail-pools.ts` + `trail-pools.test.ts`.
- Create `src/lib/content/trail-blind-pass.ts` + `trail-blind-pass-cli.ts` + `trail-blind-pass.test.ts`. These mirror `sort-blind-pass.ts`: the same `resolved.json` verdicts and `src/content/review/` paths. Add a "Trail pools" section to `src/content/review/README.md`.
- Create `src/lib/tasks/trails/{index,draw,trail-pool-files}.ts` + `draw.test.ts`. `trail-pool-files.ts` starts as `[]`, with the "ADDING A POOL" comment of `sort-pool-files.ts`.
- `draw.ts`: `TASK_RUN_DRAWERS.trail = drawTrailClues`; `TASK_DRAWERS.trail` gives `drawTrailClues(skill, level, 1, rng, ∅, ∅)[0] ?? null`.
- `deed-engine.ts` `drawByKind(kind, skill, level, count, rng, exclude, avoid = ∅)`: `runDrawerFor(kind)`, when present, returns its draw before the per-task loop, so the measure and sort paths are untouched. `drawForSkill` gains a trailing `avoid?: ReadonlySet<string>`.
- Create `docs/content/trail-skill-map.md`: one table under `## Reading`, with `| Grade | Skill id | Pool | Comprehension | Status |` and the five rows of R-H12/R-H13. `trail-pools.test.ts` reads it with the same row rules as `skills.test.ts`'s `mapRows` (copy the 12-line parser; do not import a test file).
- Create `src/lib/utils/trails-content.test.ts`:
  - `EXPECTED_TRAIL_POOLS = []`; H5 fills it;
  - the folder and `TRAIL_POOL_FILES` must agree;
  - every pool passes the validator;
  - every pool has a sheet.

**Interfaces:**
- **Consumes:** H1's catalog and facts; H2's `TrailTask`, `RunDrawer` and `runDrawerFor`.
- **Produces:**

  ```ts
  export type TrailLevel = 0 | 1 | 2 | 3 | 4;
  export type TrailClue = {
    text: string; answer: string; redirect: string; redirects?: Record<string, string>;
    readAloud?: string; why?: string; parts?: string[][];
  };
  export type Trail = { id: string; level: TrailLevel; clues: TrailClue[] };
  export type TrailPool = { poolId: string; skillId: string; band: ContentBand; trails: Trail[] };
  ```

  - `TRAIL_SKILLS: Readonly<Record<ContentBand, string>> = { k1: "read-g1", g23: "read-g3", g45: "read-g4", g68: "read-g6", g912: "read-g9" }`.
  - `validateTrailPool(raw: unknown): Problem[]`; `formatTrailProblems(problems): string`.
  - `opaqueClueId(poolId: string, trailId: string, index: number): string`: `hash32(\`${poolId}/${trailId}/${index}\`)` as 8 hex characters.
  - `trailKey(poolId: string, trailId: string): string`: `"<poolId>/<trailId>"`.
  - `loadTrailPools(raws: readonly unknown[], strict = NODE_ENV === "test"): TrailPool[]`: a pool that fails is skipped, and in strict mode it throws.
  - `__setTrailPoolsForTest(raws: readonly unknown[] | null): void`.
  - `trailPoolFor(skillId: string): TrailPool | undefined`.
  - `drawTrailClues(skill: Skill, level: number, count: number, rng: Rng, exclude: ReadonlySet<string>, avoid: ReadonlySet<string>): TrailTask[]`.
  - `trailTaskOf(pool: TrailPool, trail: Trail, index: number): TrailTask`. The id is `\`${pool.skillId}:trail:${opaqueClueId(…)}\``, `prompt = clue.text`, `explain = clue.why`, and `trail = trailKey(…)`.
  - `simulateTrailWeek(pool: TrailPool, level: number, seed: number, perRun: number, days = 7): string[][]`: the trail keys of each day's draw, each day avoiding every earlier day's keys. This is a test harness, exported from `draw.ts`.
  - Blind pass:
    - `extractTrailSheet(pool)`, `renderTrailSheet(sheet)`, `parseTrailSheet(md)`, `compareTrailSheet(pool, answers, resolutions)`, `formatTrailReport(r)`;
    - `runTrailPool(poolId)`, `writeTrailSheet(pool, force)`, `allTrailPoolIds()`, `trailPoolsWithSheets()`.

**The validator** (rule ids in `TRAIL_POOL_RULES`):
- **Shape and identity:**
  - `poolId === "trail-" + band`, with `band` in `CONTENT_BANDS`;
  - `skillId === TRAIL_SKILLS[band]`, and `findSkill(skillId)` exists.
  - Trail ids are unique and match `[a-z0-9-]{3,40}`. No two clue ids collide (`opaqueClueId`).
- **Size:**
  - at least 15 trails and at least 36 clues;
  - every level 0–4 has at least 3 trails;
  - a trail has 2–4 clues (k1: 2–3), and no trail sends the hero to one anchor twice.
- **Anchors:** every `answer`, every `redirects` key and every `parts` entry is an anchor id (`isAnchorId`). No `redirects` key is the answer.
- **Lengths:**

  | Band | Clue text, at most |
  |---|---|
  | k1 | 80 characters and 12 words |
  | g23 | 180 characters |
  | g45 | 240 characters |
  | g68 | 300 characters |
  | g912 | 320 characters |

  - A redirect is at most 140 characters; `why` at most 200.
  - At 12 words or more, readability is at most the band's top grade plus `READABILITY_MAX_ABOVE` (`fleschKincaidGrade`).
- **Never naming the answer.**
  - No redirect, at any band, contains a name of its clue's answer as a whole word, case-insensitively.
  - From g23 up, neither the text nor `readAloud` does.
- **By band:**
  - k1: every clue has `readAloud`;
  - g45 and up: every clue has `why`;
  - g68 and up: every clue has `parts`, at least 2 of them. Each part lists at least 2 anchors, and the intersection of the parts is exactly `[answer]`.
- **Words:** no field matches `/grade|kindergarten/i` or `/\b(behind|ahead)\b/i`, and none contains `<`, a backtick or a control character.

**The drawer:**
1. The candidates are the pool's trails with no clue id in `exclude`.
2. They are ordered in four shuffled tiers:
   - near (`|trail.level − level| ≤ 1`) and not in `avoid`;
   - far and not in `avoid`;
   - near and in `avoid`;
   - far and in `avoid`.
3. Whole trails are taken while they fit in `count`; a trail that does not fit is passed over.
4. Then the leading clues of the next untaken trail fill what is left.
5. Clues come back in trail order, never more than `count`.

**The sheet:**
- First the anchor list: id, label, the facts, and "near" from `nearAnchors`.
- Then every clue across the pool, shuffled by a fixed seed, numbered with a code (`opaqueClueId`), with its text only.
- The reader writes one anchor id per code, or `?` with a note. `compare` must reach 100% once resolutions are applied.

- [ ] **Step 1: Write the failing tests.**

  **`trail-pools.test.ts`:** each rule on a fixture, with one valid pool and one mutation per rule. These include:
  - a g23 clue "Go to the mill." fails `names-answer`, and a k1 one passes;
  - a redirect "Not the mill." fails at k1;
  - g68 parts `[["landmark:mill","landmark:well"],["landmark:mill","landmark:garden"]]` pass, and `[["landmark:mill"],…]` fails `part-too-narrow`;
  - an unknown anchor fails;
  - 14 trails fail `pool-size`;
  - a level with 2 trails fails;
  - the map file parses to the 5 rows of `TRAIL_SKILLS`.

  **`trail-blind-pass.test.ts`:**
  - the sheet round-trips;
  - it holds no answer: the rendered sheet contains no `answer` value outside the anchor list header;
  - `compare` flags a disagreement and accepts a resolution;
  - "compare passes every sheet on disk" (vacuous until H5).

  **`draw.test.ts`**, with a fixture pool through `__setTrailPoolsForTest`:
  - deterministic per seed;
  - whole trails in order (clue indices ascending, trails contiguous);
  - never more than `count`;
  - a cut trail fills exactly to `count`;
  - `exclude` drops a whole trail;
  - `avoid` is used only after the rest is exhausted;
  - ids are opaque: they contain no anchor id and no trail id;
  - `presents("read-g3")` is true only while the fixture credits it;
  - `simulateTrailWeek(fixture15, level, seed, 4)` meets no trail key twice, for levels 0–4 and 20 seeds.

  **`trail-run` in `deed-engine.test.ts`:** a stub mechanic-trail deed with the fixture pool draws 4 clues of kind `"trail"`. A recorded measure run and a recorded science sort run are unchanged (drawByKind's other paths).
- [ ] **Step 2:** `npx vitest run src/lib/content/trail-pools.test.ts src/lib/content/trail-blind-pass.test.ts src/lib/tasks/trails/draw.test.ts src/lib/utils/trails-content.test.ts src/lib/utils/deed-engine.test.ts src/lib/tasks/client-boundary.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** the same command, then `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(content): trail pools — a format, a validator, a blind pass and a drawer that walks whole trails`.

### Task H5: Trail content

**Files:**
- `src/content/trails/trail-{k1,g23,g45,g68,g912}.json`;
- `trail-pool-files.ts` (five imports);
- `trails-content.test.ts`: `EXPECTED_TRAIL_POOLS` lists the five, and "a week without repeats" runs per pool.

**Work from:**
- `TRAIL_ANCHOR_FACTS` and `nearAnchors` only. A clue may say only what those make true for every child.
- R-H13 for each band's kind of reading.
- At least 15 trails and 36 clues per band, every level 0–4 with at least 3 trails. Spread the answers over all 14 anchors: no anchor is the answer of more than 15% of a pool's clues.

**One model per band** (the author checks each against the facts):
- **k1, level 0:**
  - "Go to the mill." (readAloud the same)
  - redirect: "Not this one. Read the last word again."
- **g23:**
  - "Sister Wren rings a bell here when it is time to be still. Find the place where she works." → chapel
  - redirect: "This is not where the bell rings. Read the first sentence again."
- **g45:**
  - "Bring the empty sack back to the place where grain is ground into flour." → mill
  - why: "Grain is ground into flour at a mill."
- **g68:**
  - "Sister Wren writes: 'I need my lost thing found before evening. It makes a sound that carries far, and it hangs where people come to be quiet.'" → chapel
  - parts `[["landmark:chapel","landmark:watchtower"],["landmark:chapel","landmark:library"]]`
- **g912:**
  - "An unsigned, grumbling note: 'Every dawn the old iron tongue scolds the whole village awake from its quiet house. Go and tell it to hush.'" → chapel
  - why: "An iron tongue that scolds the village awake is a bell, and the quiet house that holds it is the chapel."

**Steps:**
- [ ] All five pools pass `validateTrailPool`.
- [ ] `simulateTrailWeek(pool, level, seed, 4)` meets no trail twice, for every pool, level 0–4 and seeds 1–20.
- [ ] "Answers are spread": in `trails-content.test.ts`, no anchor is the answer of more than 15% of a pool's clues, and every anchor is the answer of at least one clue per pool.
- [ ] `npx vitest run src/lib/utils/trails-content.test.ts src/lib/content/trail-pools.test.ts src/lib/tasks/trails/draw.test.ts --maxWorkers=2`. Expected: PASS.
- [ ] Extract the sheets: `npx tsx src/lib/content/trail-blind-pass-cli.ts extract --all`. Commit the sheets unanswered.
- [ ] **Commit.** `content(trails): reading trails through the village for every band`.

### Task H6: Trail blind pass (a different agent from H5's author, who never opens `src/content/trails/` or H5's report)

- [ ] Answer every `src/content/review/trail-*.blind.md` from the sheet alone.
- [ ] Run `compare --all`. The author (or the controller) resolves each flag in `trail-<band>.resolved.json`, or edits the clue and re-extracts that sheet with `--force`. The reader then re-answers only the changed codes.
- [ ] Gate: `npx vitest run src/lib/content/trail-blind-pass.test.ts --maxWorkers=2` is green, and `compare --all` passes all five.
- [ ] **Commit.** `content(trails): blind pass for every trail pool`.

### Task H7: Reading side quests become trails

**Files:**
- **`deeds.ts`:**
  - `well-signs`, `chapel-scroll` and `library-catalog` take `mechanic: "trail"` and `questionCount: TRAIL_CLUES`;
  - export `TRAIL_CLUES = 4` and `TRAIL_DEED_IDS`.
- **`deed-engine.ts`:**
  - `runCandidates`'s walking rules (R-H9);
  - `BuildRunInput.recentSets?: readonly string[]`, threaded as `avoid`;
  - in `buildDeedRun`:
    - `focusOffWalk` (R-H22), worked out right after `selectSkills`; when true, `kindOfSkill` starts from `"choice"`;
    - `walking = isWalkingKind(deed.mechanic) && drawsMechanic`, worked out before the review selection;
    - when `walking`, misses and due skills are kept only where `kindOfSkill(id) === deed.mechanic`;
    - the order is `[...questions, ...nonFresh]`, never shuffled.
- **`deed-run-store.ts`:** `loadRecentTrailIds`.
- **`actions/deeds.ts` `startDeedRun`:**
  - `loadRecentTrailIds` in the second round when `deed.mechanic === "trail" && enabledKinds.has("trail")`, passed as `recentSets`;
  - `narrateClues: true` on the returned start (fresh and resumed, through the same wrapper as `withDemo`) when `grade === "K"` and a question is of kind `"trail"`.
- **`deed-run-types.ts`:** `RunStart.narrateClues?: true`.
- **Re-record:**
  - the `well-signs` entries of "keeps its output as deeds name a mechanic" as trail ids, with a choice-pinned twin (`enabledKinds: CHOICE_ONLY`) holding today's ids unchanged;
  - the fewer-choices recorded loop pinned to `CHOICE_ONLY`, with its ids unchanged;
  - `deeds.test.ts`'s area/mechanic expectations.

**Interfaces:**
- **Consumes:** H2–H5.
- **Produces:**
  - `TRAIL_CLUES = 4`.
  - `TRAIL_DEED_IDS: readonly string[]`.
  - `TRAIL_MEMORY_RUNS = 7`.
  - `RunStart.narrateClues?: true`: set only for a K hero's run with a trail task (R-H17). Absent otherwise.
  - `loadRecentTrailIds(childId: string, deedIds: readonly string[]): Promise<string[]>`. One query: the hero's runs with `deed_id IN deedIds`, newest `started_at` first, `LIMIT 7`, any kind and open or not. From each run's questions, it collects the `trail` of every object task of kind `"trail"` whose `trail` is a string. A malformed row is skipped.
- **The walking rules in `runCandidates`**, when `isWalkingKind(m) && on(m)`:
  - `base = presented(base)`;
  - if that is empty, `bandSkill(deed.area, grade, presents)?.skill`, else the choice base;
  - focus extras must be playable (R-H8), presented or not. Whether a drawn one takes the run off the walk is `buildDeedRun`'s call (R-H22).

- [ ] **Step 1: Write the failing tests.**

  **`deed-engine.test.ts`:**
  - "a reader's trail skill at every grade, with trails on":
    - K and 1 give `read-g1`;
    - 2 and 3 give `read-g3`;
    - 4 and 5 give `read-g4`;
    - 6–8 give `read-g6`;
    - 9–12 give `read-g9`.

    `buildDeedRun` at grade 7 draws `read-g6` clues (the `selectSkills` fallback). Trails off gives H3's choice table (Review Focus 3).
  - "a trail run is four clues, whole trails in order": grade 3, seed 1, the default length. All 4 are kind `"trail"`; same-trail clues are contiguous and ascending; the length is 6 at length 12 and 2 at length 4.
  - "a walking run takes no other kind": a `sight-g23` choice miss and a due `read-g4` that no trail presents are both absent. A due `read-g4` with trails presenting it is present, last.
  - "trails off: eight multiple-choice questions, as before".
  - "the gate is multiple choice": `enabledKinds: ∅` gives choice.
  - "a Crown Challenge is three clues".
  - "a drawn sight-word focus makes the side quest multiple choice" (R-H22): grade 2, `focusSkillIds: ["sight-g23"]`, and a seed where `selectSkills` picks `sight-g23` (find one and record it in the test). The run is 8 tasks at the default length, none of kind `"trail"`; at length 12 it is 12.
  - "the same focus left undrawn keeps the trail": the same input with a seed where the draw picks `read-g3` gives 4 clues, all `"trail"`, and no `sight-g23` task.
  - "a focus a trail presents keeps the trail": grade 3, `focusSkillIds: ["read-g4"]`, and every recorded seed gives only `"trail"` tasks.
  - "the focus rule waits for trails": with trails off, the grade-2 `sight-g23` focus run is the same multiple-choice run with and without the rule.
  - "recentSets": with every trail of the near level in `recentSets`, the run draws far-level trails.
  - The re-recorded table and its choice twin.

  **`deeds-db.test.ts`:**
  - "a grade-3 reading side quest is four clues, and the start never carries an answer" (Review Focus 1): `JSON.stringify(start)` contains no stored task's `answer`, `trail` or `redirect` value.
  - "a K reader gets `read-g1` trails; a grade-11 reader gets `read-g9`".
  - "the next run passes over the last one's trails": complete run 1, start run 2 (seed mocked), and no trail key is shared.
  - "`loadRecentTrailIds` reads the last seven reading runs only": 8 seeded runs give 7 runs' keys; a `well-stones` run is ignored; a row with `questions = 'nope'` is skipped.
  - "a reading choice run stored before the deploy resumes and completes" (Review Focus 4): a row with `kind`-less choice questions resumes, takes answers and completes with stars.
  - "a right trail run pays by stars as any side quest": `minutesEarned` is `sideQuestPay`'s.
  - "trails off: a grade-7 reader's side quest is `read-g4` choice, eight questions".
  - "a K hero's trail start is narrated; a grade-1 hero's is not" (R-H17): a K hero's fresh start and its resumed start both have `narrateClues: true`; a grade-1 hero's has no `narrateClues`; a K hero's start with trails off (choice) has none.
  - "a grown-up's sight-word focus turns a grade-2 hero's reading side quest to choice" (R-H22): with a `learning_focus` row for `sight-g23` and `Date.now` mocked to a seed where the draw picks it, the stored questions have no `kind`, and there are 8.
- [ ] **Step 2:** `npx vitest run src/lib/utils/deed-engine.test.ts src/lib/utils/deeds.test.ts src/lib/actions/deeds-db.test.ts src/lib/services/deed-run-store-db.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** the same command, plus `src/lib/actions/practice-db.test.ts src/lib/actions/world-locks-db.test.ts src/lib/actions/review-db.test.ts`, then `npx tsc --noEmit`. Expected: PASS.
- [ ] **Step 5: Commit.** `feat(deeds): reading side quests are clue trails, four clues of whole trails, never the same trail twice in a week`.

### Task H8: The trail surfaces — Set off, the picture run, Pip's demo

**Files:**
- Create `src/components/tasks/trail-presenter.tsx`, `trail-map.tsx`, `trail-demo.tsx` and `trail.css`. Register `TASK_PRESENTERS.trail = TrailPresenter`.
- Create `src/lib/tasks/narration.ts` + `narration.test.ts` (R-H17). `DeedRun`'s read-aloud effects (the task or its demo, and the second-chance hint) and `deed-player.tsx`'s use `autoSpeaks(question, profile.readAloud, run.narrateClues === true)` in place of `profile.readAloud`. Nothing else about their speech changes.
- **`presenters.tsx`:** `PresenterProps.onWalk?: () => void`.
- **`demos.ts`:**
  - `DemoKey` gains `"trail"`;
  - `demoKeyOf` gives `"trail"` for a trail task;
  - `demoKind(key: DemoKey): HandsOnKind`.
- **`deed-run-store.ts`:**
  - `hasAnsweredDemo` uses `demoKind(key)`;
  - `demoGroup("trail") === "trail"`.
- **`task-demo.tsx`:** the `"trail"` case, and `taskDemoCopy("trail") === TRAIL_DEMO_COPY`.
- **`deed-board.tsx`:**
  - extract `RunResultCard` from `DeedRun`'s summary branch, behaviour-preserving;
  - extract `deedResultOf` from `DeedBoard`'s `handUp`;
  - `DeedRun` gains `onWalk?`;
  - `DeedBoard` gains `onWalk?` and `walked?`.

**Interfaces:**
- **Consumes:** H1's `ANCHORS`, `ANCHOR_IDS`, `trailMapPoint`, `trailMapBackdrop`, `TRAIL_MAP_VIEW` and `TRAIL_MAP_HIT`; H2's codec and copy; H7's `RunStart.narrateClues`.
- **Produces:**
  - `TrailPresenter(props: PresenterProps<"trail">)`: `variant === "board" && onWalk` shows `TrailSetOff`; otherwise `TrailMap`.
  - `TrailMap({ flow, disabled, onRespond })`: one `<button>` per anchor (`aria-label` is the label, `aria-pressed` the selection), in catalog order, inside an `<svg viewBox="0 0 360 h" width="100%">` with the backdrop.
  - `RunResultCard({ run, summary, villagerName, doneLabel, onClose }: { run: RunStart; summary: RunSummary; villagerName?: string; doneLabel?: string; onClose: () => void })`.
  - `deedResultOf(done: RunSummary, deedId: string): DeedResult | null`: `null` for a build run or no building.
  - `DeedRun` prop `onWalk?: (run: RunStart) => void`. It reaches the presenter as `() => onWalk(run)` only when `isWalkingRun(run)`.
  - `DeedBoard` props:
    - `onWalk?: (run: RunStart) => void`, passed to `DeedRun` only for `runContext === "realm"`;
    - `walked?: { run: RunStart; summary: RunSummary } | null`, which, when set, renders `<Panel>` with `RunResultCard` in place of the talk.
  - `demoKind(key: DemoKey): HandsOnKind`.
  - `autoSpeaks(task: Pick<ClientTask, "kind">, readAloud: boolean, narrateClues: boolean): boolean`: `readAloud || (narrateClues && task.kind === "trail")`.

**The map's behaviour:**
- A tap selects. "Search here" is disabled until there is a selection.
- A ruled-out anchor is disabled and shows "Not here".
- On a resolved miss, `flow.result.reveal` is marked "It was here."; on a right answer, the pick shows a check.
- Under the map, the selected label or `TRAIL_MAP_HELP`.
- Enter and Space keydowns stop propagation; Esc bubbles.
- 390 px: the SVG scales to its box; hit circles are `TRAIL_MAP_HIT` radius in viewBox units.

- [ ] **Step 1: Write the failing tests.**

  **`trail-presenter.test.tsx`:**
  - the board with `onWalk` shows "Set off" and `TRAIL_SET_OFF_LINE`; a click calls `onWalk` once;
  - the board without `onWalk`, and the page, show the map with 14 buttons named by label;
  - select "the mill", then "Search here", gives `onRespond("landmark:mill")`;
  - "Search here" is disabled with no selection;
  - with `flow.ruledOut = ["landmark:well"]`, the well is disabled and reads "Not here";
  - a resolved miss with `reveal: "landmark:mill"` shows "It was here." on the mill only;
  - the svg has `viewBox="0 0 360 …"` and `width="100%"`;
  - Enter on a button does not reach a window keydown listener.

  **`task-demo.test.tsx`:** the trail demo's copy and steps; Done calls `onDone`.

  **`narration.test.ts`:**
  - `autoSpeaks(trail, false, true)` is `true` (a K clue, read-aloud off);
  - `autoSpeaks(trail, false, false)` is `false` (a grade-1 clue, read-aloud off);
  - `autoSpeaks(choice, false, true)` is `false`;
  - `autoSpeaks(choice, true, false)` is `true`.

  **`deed-run-store-db.test.ts`:**
  - `demoAt` marks a K hero's first trail;
  - after a trail answered in another run, it gives `null`;
  - a lock answered elsewhere does not hide the trail demo.

  **`deed-board.test.tsx`:**
  - every existing result-card test passes against the extraction;
  - a two-clue trail run in the realm shows "Set off", which calls `onWalk(run)`;
  - a mixed run shows no "Set off";
  - `walked` renders the result card titled by the deed;
  - `deedResultOf` matches the old `handUp` for a deed, a challenge and a build (null);
  - "a K hero hears the clue with read-aloud off": a trail run with `narrateClues: true` and `profile.readAloud: false` calls `speak` with the clue's `readAloud`, and with the hint once a second chance opens;
  - "a grade-1 hero's clue is not spoken unless asked": the same run without `narrateClues` makes no `speak` call until the read-aloud button is pressed, which speaks the clue.

  **`deed-player.test.tsx`:**
  - a trail task on the page plays on the map and answers through `answerDeedQuestion(runId, 0, "landmark:mill")`;
  - a K run (`narrateClues: true`) speaks the clue with read-aloud off; the same run without `narrateClues` does not.
- [ ] **Step 2:** `npx vitest run src/components/tasks/trail-presenter.test.tsx src/components/tasks/task-demo.test.tsx src/lib/services/deed-run-store-db.test.ts src/components/realm3d/deed-board.test.tsx src/components/deed-player.test.tsx src/components/tasks/presenters.test.tsx src/lib/tasks/narration.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** the same command, `npx eslint` on the changed files, then `npx tsc --noEmit`. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit.** `feat(trails): a village map to answer a clue on, Set off for the Realm, and Pip's first clue`.

### Task H9: The walking run in the Realm

**Files:**
- **`hud-bus.ts`:** `InteractTarget.kind` gains `"anchor"`, with its line in the doc comment.
- **`interact.ts`:**
  - `SpotInput.anchors?: readonly { id: AnchorId; label: string; x: number; z: number }[]`;
  - `anchorTarget(a)`;
  - spots are round, `ANCHOR_SPOT.radius` and `.reach`, bias 0.4, ring radius + 0.6.
- **Create:**
  - `src/components/realm3d/trail-objects.tsx`: `TrailObjects({ heightAt })`, always drawn, merged boxes through `mergeBoxHosts`, no colliders;
  - `src/components/realm3d/trail-stakes.tsx`: `TrailStakes({ on, revealed, heightAt })`, which draws nothing when `!on`.
- **`spike-scene.tsx`** (additive):
  - `RealmCanvasProps.trailOn?: boolean; trailRevealed?: AnchorId | null`;
  - `World` takes `trailOn?: boolean` and passes `anchors: trailOn ? ANCHOR_SPOTS : undefined` to `buildSpots`, with `trailOn` added to the `spots` deps;
  - `<TrailObjects>` and `<TrailStakes>` beside `<World>`.
- **Create:**
  - `src/components/realm3d/use-trail-walk.ts`;
  - `src/components/realm3d/trail-walk.tsx` and `trail-walk.css`.
- **`realm-game.tsx`** (additive):
  - `const trail = useTrailWalk()`;
  - `openTarget`'s anchor branch, first after the overlay guard;
  - `DeedBoard`'s `onWalk` and `walked`, with `trail.clearWalked()` on its close;
  - `<TrailWalk>` mounted while `trail.walk`, with `hidden={overlay !== null}`;
  - `trailOn` and `trailRevealed` passed to the canvas.

**Interfaces:**
- **Consumes:** H1's `ANCHOR_SPOTS`, `ANCHOR_SPOT`, boxes and `isAnchorId`; H8's `deedResultOf`, `RunResultCard`, `DeedBoard`'s `onWalk`/`walked`, `autoSpeaks` and `useDeedFlow`; H7's `RunStart.narrateClues`.
- **Produces:**
  - `anchorTarget(a): InteractTarget`: `{ kind: "anchor", id: a.id, label: a.label, verb: TRAIL_SEARCH_VERB }`.
  - `useTrailWalk()`:

    ```ts
    {
      walk: { key: number; run: RunStart; villager: Villager; buildingId: string } | null;
      walked: { villagerId: string; run: RunStart; summary: RunSummary } | null;
      revealed: AnchorId | null;
      answerRef: MutableRefObject<((id: AnchorId) => void) | null>;
      begin(run: RunStart, villager: Villager, buildingId: string): void;   // key += 1, revealed = null
      finish(summary: RunSummary): void;                                     // walked = …, walk = null
      leave(): void;                                                         // walk = null, revealed = null
      reveal(id: AnchorId | null): void;
      clearWalked(): void;
    }
    ```
  - `TrailWalk({ walk, profile, calm, numerals, hidden, answerRef, onReveal, onFinished, onLeave })`. It is keyed by `walk.key` and owns `useDeedFlow(walk.run, cue)`. While mounted, it sets `answerRef.current` to its `answer`, and clears it on unmount.

**`TrailWalk`'s rules:**
- **`answer(id)`:**
  - while busy or resolved, it does nothing;
  - on a second chance with `id` in `flow.ruledOut`, it shows `TRAIL_LOOKED_HERE` and makes no call;
  - otherwise it calls `choose(id)`.
- **After a result:**
  - the line is `attemptFeedback(result, retried, villagerName, task).text`;
  - a resolved miss also calls `onReveal(result.reveal)`;
  - a resolved clue that is not the last calls `next()` at once, keeping the line on show above the new clue;
  - the last calls `completeDeedRun(runId)` once, then `onFinished(summary)`;
  - a rejected finish shows `deedErrorLine` and a `TRAIL_FINISH` button that retries.
- **The card:**
  - `role="region"`, `aria-label` `TRAIL_TRACKER_LABEL`;
  - the run's dots (with `numerals`, "Clue 2 of 4");
  - the clue in an `aria-live="polite"` paragraph;
  - the read-aloud button;
  - "Show me" on a second chance;
  - `TRAIL_HIDE`/`TRAIL_SHOW`, which collapse it to its dots;
  - `TRAIL_LEAVE`.
  - It never takes focus by itself, so the game's keys keep working. At 390 px it spans the width less the 16 px gutters.
- **Speech:** a new clue, a second-chance line and a miss line are spoken unprompted when `autoSpeaks(task, profile.readAloud, walk.run.narrateClues === true)` holds (R-H17), so always for a K hero. The read-aloud button speaks the clue on request.

**The frame:**
- `openTarget(t)`: `if (t.kind === "anchor") { if (isAnchorId(t.id)) trail.answerRef.current?.(t.id); return; }`.
- `onFinished(summary)`, in order:
  1. `const r = deedResultOf(summary, walk.run.deed.id)`;
  2. `trail.finish(summary)`;
  3. `go({ kind: "interact", target: { kind: "villager", id: walk.villager.id, label: walk.villager.name } })`;
  4. `if (r) pendingDeed.current.set(walk.buildingId, r)`.

  The building rises when that board closes, through the existing flush.

- [ ] **Step 1: Write the failing tests.**

  **`interact.test.ts` "the trail's stakes":**
  - 14 spots, verb "Search" ("Search the mill" through `interactVerb`);
  - reachable from every side;
  - lets go once walked on;
  - none when `anchors` is absent.
  - "no anchor holds another spot, and no spot holds an anchor" (F19's rule, full village). It runs `buildSpots` with:
    - `props` from `buildWorldLayout` with every building complete, and again with none;
    - the castle gate for every `CASTLE_TIER_IDS` type;
    - every lock, every riddle stone, the plans board, the lectern, every plaque at level 3, the Tower's door, and `anchors: ANCHOR_SPOTS`.

    Only pairs with at least one anchor are checked. A failing stake moves under H1's rule, and H1's tests are re-run.

  **`anchor-boxes.test.ts`:** unchanged and green after any move.

  **`use-trail-walk.test.ts`:**
  - `begin` sets the walk and bumps `key`;
  - `finish` moves the run to `walked` and clears `walk`;
  - `leave` clears `walk` and `revealed`.

  **`trail-walk.test.tsx`** (actions mocked):
  - shows clue 1 and its dots, and speaks it with `readAloud`;
  - "a K hero hears every clue with read-aloud off": a run with `narrateClues: true` and `readAloud: false` speaks clue 1, the second-chance line, the miss line and clue 2;
  - "a grade-1 hero's clue is not spoken unless asked": without `narrateClues`, no `speak` call until the read-aloud button, which speaks the clue;
  - `answerRef.current("landmark:mill")` calls `answerDeedQuestion("r1", 0, "landmark:mill")`;
  - right: the line reads "That's it! Old Bram is pleased." and clue 2 shows;
  - a first wrong place: "Not here. That is where water is drawn." and "Show me";
  - the same place again: `TRAIL_LOOKED_HERE`, with no call (Review Focus 5);
  - a second wrong place: `onReveal("landmark:mill")`, "It was the mill.", and clue 2;
  - an answer while a call is in flight makes no second call;
  - the last clue resolved: `completeDeedRun` is called once, then `onFinished(summary)`;
  - a rejected finish shows "That didn't work." and `TRAIL_FINISH` retries;
  - `TRAIL_LEAVE` calls `onLeave`;
  - `hidden` hides the card and keeps the clue index;
  - unmounting clears `answerRef`.

  **`realm-game.test.tsx`:**
  - "Set off closes the board, shows the tracker, and hands the canvas `trailOn`";
  - "E at a stake answers the clue": `bus.onInteract({ kind: "anchor", id: "landmark:mill", label: "the mill", verb: "Search" })` gives `answerDeedQuestion("r1", 0, "landmark:mill")`, and no panel opens;
  - "E at a stake with no walk does nothing";
  - "the walk survives the pause menu": open and close it, and clue 2 is still shown;
  - "a finished trail opens the villager's board on its result, and the well rises when it closes": the well's `done` in `handed.props.layout` moves only after the board closes;
  - "Leave the trail ends the walk: `trailOn` is false".
- [ ] **Step 2:** `npx vitest run src/lib/realm3d/interact.test.ts src/lib/realm3d/anchor-boxes.test.ts src/lib/realm/anchors.test.ts src/components/realm3d/use-trail-walk.test.ts src/components/realm3d/trail-walk.test.tsx src/components/realm3d/realm-game.test.tsx src/lib/realm3d/hud-bus.test.ts --maxWorkers=2`. Expected: FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** the same command, `npx eslint` on the changed files, then `npx tsc --noEmit`. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit.** `feat(realm): a reading trail is walked — a tracker shows the clue, and E at the right place answers it`.

### Task H10: Verify, review, merge (slice 5)

- [ ] **Full checks:**
  - `npx vitest run --maxWorkers=2` (re-run the known flakes alone if they are the only failures);
  - `npx tsc --noEmit`;
  - `npx eslint src`: 0 errors.
- [ ] **No migration:** `npm run db:generate` reports no schema changes.
- [ ] **Browser smoke.** Use `NEXT_DIST_DIR=.next-agent`, a throwaway env and a fresh migrated, demo-seeded `local.db` (F10's way). Press keys only, never click the canvas, and look at every image.
  1. A K hero at Old Bram's "Signs for the Well", with read-aloud OFF: Pip's trail demo, then "Set off". The tracker shows a clue, and it is read aloud anyway (R-H17). The four objects and the 14 stakes are drawn.
  2. Walk (`?at=` near the mill) and press E. Right: the next clue shows at once.
  3. A grade-3 hero:
     - a wrong place gives "Not here." and its redirect;
     - the same place again gives `TRAIL_LOOKED_HERE`;
     - a second wrong place gives "It was …", with that stake gold;
     - the trail moves on.
  4. The last clue: the villager's board shows the result; closing it raises the well.
  5. "Leave the trail", then talk to Bram again: the run resumes at its clue.
  6. Pause during a walk, then resume: the tracker keeps its clue.
  7. The Side Quests page, a grade-10 reader: the village map at 390 px. Select, then "Search here"; a ruled-out place shows "Not here"; a miss shows "It was here."
  8. The settings switch "Reading trails" off: reading is multiple choice in the Realm and on the page, and no stakes are drawn.
  9. The gate board: reading is multiple choice.
  10. `?calm=1`: the four objects still stand.
  11. A grade-1 hero with read-aloud off: the clue is not spoken until the read-aloud button is pressed.
  12. A grade-2 hero with a grown-up's sight-word focus: start reading side quests until one draws the focus. That one is eight multiple-choice questions on the board; one that does not draw it is a trail (R-H22).
- [ ] **Whole-branch review** (opus) on `7e74872..HEAD`. It checks:
  - the leak rule end to end;
  - that no path pays minutes besides the side quest's stars;
  - that the added Realm lines are additive;
  - one query per reading run start and none per load.
- [ ] **One fix wave**, then a scoped re-review.
- [ ] **Merge into `dev`** (pre-authorized when green, R-H3). Then delete the branch and its worktree as CLAUDE.md says, unless the generated `AGENTS.md` blocks removal; in that case, ask, as for slice 4.

---

# Part I: Slice 6, rune spellcraft (branch realm-runes, cut from dev after slice 5 merges)

**Written 2026-11-21 as rulings and an outline only.** The full task detail (Files, Interfaces, test-first steps, commands and commits) is written at the start of slice 6, against slice 5's merged code, as Part G was for 4b. Slice 6 reuses slice 4's world-object machinery and slice 5's walking-run machinery, so their final names decide its interfaces.

## Rulings (record them in spec §2a, "Calls settled for slice 6", in I1's commit)

- **R-I1: rune objects can be fixed any time, like chests (owner, 2026-11-21).**
  - Outside a side quest, fixing one is a `world` run of one rune task (`RUN_EFFECTS.world`: no pay, no stars, moves mastery, feeds review, second chances).
  - It is started by `startRuneObjectRun(childId, objectId)` on slice 4's shared start skeleton: hero only, refused while the object is fixed, resumed on `sourceRef = objectId`.
  - The fix, the run's close and the world row are one `withChildLock` transaction (PC-G2, RG-n).
- **R-I2: language side quests also send the hero to 2–3 rune objects (owner, 2026-11-21).**
  - A language side quest with runes on is a walking run (R-H9): the villager names the objects, and the tracker lists them.
  - E at a named object opens the rune stone for that object's task.
  - Each task is bound to its object. The object's id is part of the question, never the answer, so it rides in the task's view.
- **R-I3: objects cycle, and a fix stays per child until the object breaks again (owner, 2026-11-21).**
  - `realm_world_state` rows `rune:<id>`, state `"fixed"`.
  - A broken/fixed rule shares slice 4's cycling rule, generalised from `lockedNow` with the open state as a parameter. The lock tests stay unchanged.
  - Every rune object has `resetAfterDays: 4` (planner call: "a few days").
  - A rune task solved right inside a side quest fixes its object too, in the same locked finish.
- **R-I4: one table and one catalog pattern, generalised, not duplicated (planner call).**
  - "World locks" become "world objects": `WORLD_OBJECTS`' type gains `"rune"` (with an `effect`); `isWorldObjectId` covers `rune:`; the world-object path in `completeDeedRun` handles both.
  - Chests, doors and the Tower behave exactly as before, pinned by slice 4's tests run unchanged.
- **R-I5: the `rune` kind.**
  - The response is the sequence of tile indices placed.
  - `isCorrect` checks the spelled word against the task's accepted words for its effect and band, so any accepted word counts (R-F1's spirit).
  - The view is the effect, the object, the prompt (the definition, or at K–1 a picture plus a spoken prompt), and the tiles with distractors. It is never an accepted word.
  - `allowsSecondChance` is true. `feedback` is `"incomplete"` (no tiles) or `"wrong_word"`, a new `FeedbackCode`.
  - `reveal` is one accepted word's tiles, sent only on a resolved miss (R-H7's member).
- **R-I6: `RUNE_WORDS`, validated JSON** (`src/content/runes/rune-<band>.json`), effect × band → accepted words, tile sets, definitions.
  - **Effects:** `mend`, `light`, `water`, `open`, `grow` (spec §4.7).
  - **Tiles by band:**

    | Band | Tiles |
    |---|---|
    | k1 | letters |
    | g23 | phonograms |
    | g45 | spelling-pool words, built letter by letter |
    | g68 | morphemes |
    | g912 | Greek and Latin roots |

  - **Ship bar:**
    - every effect has accepted words for every band;
    - every tile set contains every accepted word's tiles exactly (validator);
    - every set has distractors;
    - k1 entries have `readAloud`;
    - blind pass: a reader given the definition and the tiles builds an accepted word.
- **R-I7: skills.**
  - Rune pools credit `lang-gk` (K), `spell-g1` (1, a new rune-only row, `SkillSource { kind: "rune" }`), `spell-g23` (2), `lang-g3` (3), `spell-g45` (4), `vocab-g45` (5), `vocab-g68` (6–8) and `vocab-g912` (9–12).
  - R-H9's walking rules pick the presented skill. At grade 1, `[lang-g1, spell-g1]` becomes `[spell-g1]`.
  - The spelling and vocabulary drill pools stay as choice review.
- **R-I8: a vocabulary focus inside a rune deed (planner call, the 4a conflict).**
  - R-H22's rule is written for walking kinds, so it reaches rune deeds too. A drawn language focus that no rune pool presents (today only `lang-g1`, at grades K–2) turns that side quest to its own kind: choice, or a sort by 4a's rule. The owner answered this for reading; confirm it for runes when Part I is written in full.
  - In a rune deed, the rune wins when a rune pool presents the skill.
  - The 4a focus-sort rule (`buildDeedRun`'s `kindOfSkill`: a choice-played focus skill a lock presents is sorted) still fires only when the skill would otherwise be `choice`. That covers runes off, or a vocab skill no rune pool credits.
  - Library chests keep drawing vocabulary sorts (`worldLockSkill`, unchanged).
  - This is what the code already does once language deeds name `rune`; I8's tests pin it.
- **R-I9: run length (planner call).**
  - A rune side quest asks `min(3, max(2, round(sideQuestLength × 3 / 8)))` tasks: 4 → 2, 8 → 3, 12 → 3. That is the owner's "2–3 objects".
  - The Crown Challenge stays at 3.
  - Choice keeps the whole length.
- **R-I10: rune objects in the world.**
  - At least 12 objects across the village and the five named places (spec §4.7), each a small low-poly broken/fixed pair of boxes (pure `rune-boxes.ts`).
  - The objects are held by slice 4's clearance and reach tests (`yardPieces`, `villagePieces`, the F19 overlap test, the riddle-stone rules for the places).
  - A side quest names only objects in the village (R-H2's reach). It names broken ones first, and fixed ones only when fewer than two are broken.
- **R-I11: where it is played.** In the Realm:
  - the side quest's walk uses slice 5's tracker (generalised from trails to walking runs);
  - E at a named object opens the rune stone overlay for that task;
  - the effect plays in 3D on the object's next draw.

  Off-world, the picture run shows the object's picture with the rune stone beside it. The gate stays multiple choice.
- **R-I12: the rune stone surface** is DOM/SVG, with no dragging (R-C2):
  - tap a tile to place it; tap a placed tile to take it back;
  - "Cast" sends;
  - keyboard and screen reader;
  - it fits 390 px.

  A K–3 hero sees one "Watch Pip" rune demo first (R-F10).
- **R-I13: runes off (owner, 2026-11-21).** The switch "Rune spellcraft" (`mechanics.rune`) defaults on. With it off:
  - language plays as multiple choice;
  - rune objects are not drawn, the same as chests and doors with locks off (R-G7), and `startRuneObjectRun` refuses `RUNES_OFF`;
  - fixed records stay: the `rune:` rows are kept, and when runes are turned back on each object is drawn as its row says.
- **R-I14: language deeds become `mechanic: "rune"`:** `mill-ledger`, `bridge-toll`, `market-crier` and `library-scribe`.
  - Recorded snapshots that change get choice-pinned twins.
  - A language choice run stored before the deploy still resumes.
- **R-I15: copy.** It never names a grade or band, and never says "behind" or "ahead". The exact strings are fixed in I1's commit (`rune-copy.ts`).
- **R-I16: merging (owner, 2026-11-21).** Slice 6 merges into `dev` only on the owner's word.

## Outline

- **I1: World objects, generalised.** `lockedNow` becomes a cycling rule with the state as a parameter; the catalog type gains `rune`; the shared start skeleton and the locked finish take any world object. Slice 4's tests run unchanged and green.
- **I2: The `rune` kind and `spell-g1`.** Covers the types, codec, definition (accepted words, `wrong_word`, reveal), the rune-only `SkillSource`, the skill row with its map line, and the switch label.
- **I3: Rune pools: format, validator, blind pass, drawer.** The validator enforces the ship bar: words for every effect and band, and tiles that always contain the word.
- **I4: Rune content.** Five bands × five effects.
- **I5: Rune blind pass.** By a different agent from I4's author, who never opens `src/content/runes/`.
- **I6: Rune objects in the world.** At least 12 objects, with boxes, painter, spots, the `useWorldState` mirror, and the any-time `world` run through a rune stone board.
- **I7: The rune stone surface.** The picture run and Pip's rune demo.
- **I8: Language side quests become rune walks.** The engine (length, object binding, R-I8's focus rule, twins), the walk tracker generalised to runes, and the side-quest fix in the locked finish.
- **I9: Verify, review, merge.** Full checks, the browser smoke, a whole-branch review and one fix wave, then a merge into `dev` on the owner's word.
