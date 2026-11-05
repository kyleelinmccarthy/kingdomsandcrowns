# Realm playability round: deeds that teach, stars worth chasing, a reason to come back

**Date:** 2026-11-04 · **Branch:** `realm-playability` (from `dev` at 690dc03)
**Owner's request:** "the realm needs improved so that it has better playability. review educational games like beast academy and legends of learning to pull inspiration from and make improvements to this repo's educational game." Keep SOLID, DRY, KISS, configurability, dynamicness, scalability, security, and sturdy long-term architecture in mind. The owner chose to skip the clarifying questions, so every product call below that is marked **(my call)** is the designer's, not the owner's.

## 1. Why

The Realm looks and moves like a game now (rounds 1–8). The learning loop inside it does not play like one. Mapped from the code on 2026-11-04:

1. **A wrong answer teaches nothing.** The child sees "Not quite. The answer was X." Their own pick is not marked, there is no hint, no second try, no explanation (`deed-board.tsx:362-385`). The `Question` type has no field for any of it (`drill-generators.ts:60-67`).
2. **Doing well and doing badly earn the same thing.** Any finished run adds +1 to the building, even 0 of 8 right (`actions/deeds.ts:234-253`). "Flawless" is a badge on the result card and is then forgotten.
3. **The game ends.** 8 buildings × 5 deeds = 40 runs, then "Every building is built. Nothing is waiting." (`objective.ts:99`). Finished buildings offer "practice" with no reward (`talk.ts:60-62`).
4. **No feel of progress inside a run.** Eight flat questions, no streak, no sign that a skill is close to moving up (mastery needs 7 of the last 8 right and is shown only as one line at the end).
5. **No spaced review.** A run re-asks at most two recent misses of its own skills (`deed-engine.ts:40`). Skills a child has mastered are only revisited by chance.

## 2. What the reference games do that fits

From research on 2026-11-04 (Beast Academy help centre, AoPS blog, Legends of Learning help centre, Habgood & Ainsworth 2011, Khan Academy mastery docs, Fairplay's Prodigy report):

| Pattern | Source | Used here as |
|---|---|---|
| Two tries: wrong → hint → try again → worked solution | Beast Academy lessons | §4.1 Second chances |
| Up to 3 stars per lesson, best attempt kept, replays draw new problems | Beast Academy | §4.2 Stars |
| A harder optional "trophy problem" revealed at 3 stars | Beast Academy | §4.6 The Crown Challenge |
| A visible meter toward proficiency | Legends of Learning Awakening, Khan | §4.3 Streak and skill meter |
| Spaced mixed review of already-mastered skills | Khan Mastery Challenges | §4.4 Keep-it-sharp questions |
| Rewards you can *see* in the world, never a premium currency | Beast Academy Beast Builder / LoL houses (minus LoL's loot boxes and paywalls) | §4.5 Gilded buildings |
| Short sessions, assigned by time not count | Beast Academy advice, LoL 5–15 min games | §4.7 Parent-set side-quest length |
| Track questions per minute of play; never let play crowd out learning | Prodigy critique | §6 guard rails |

Deliberately **not** taken: Prodigy/LoL premium currencies, loot boxes, level caps, timed merchants; Beast Academy's 24-hour test lockout (wrong for a family game played in short windows); a solution-free puzzle lab (later, see §9).

## 3. Goals, non-goals, anti-goals

**Goals**
- A miss becomes a moment of learning (hint, second try, explanation), and mastery stays honest.
- How well a child did matters and is remembered (stars), and there is always something worth doing after the village is built.
- A run feels alive: streaks, a meter that fills, a clear "almost there".
- Mastered skills come back on a schedule.
- A parent can set how long a side quest is and whether second chances are on.

**Non-goals (this round)**
- Answers that drive spell effects directly (true intrinsic integration). Big, risky, and it touches the combat code. Listed for later (§9).
- Typed (free-response) answers. Needs a normaliser per answer shape across 68 skills. Later.
- New cosmetics. `src/components/avatar.tsx` holds another session's uncommitted work and must not be touched.
- Changing the trouble bounty. It has batching, beacons and reload recovery; this round does not touch it.

**Anti-goals (it fails even if it works)**
- A child is ever told they are "behind", "ahead", or at a level (binding rule from the grade-content program, §5.5).
- A child who struggles is walled off from building. Every star rule must leave a reachable path.
- The answer reaches the browser before the child has used up their tries.
- A second try that can be won by elimination (2-choice guess) is scored as if it were knowledge.
- Mastery is inflated by second tries.
- Any existing child's history is reset, re-keyed or relocked (skill ids, mastery rows, spell unlocks).

## 4. The design

### 4.1 Second chances (Beast Academy's two tries)

**Flow for one question**
1. The child answers. Right first time: as today ("That's it!"), full points.
2. Wrong first time, and second chances are on, and the question has **3 or more choices**:
   - their pick is marked (crossed, stays visible) and disabled;
   - the villager gives the **skill's hint** ("Try this: …", from §4.1.2) in their speech style;
   - the child tries once more among the remaining choices.
3. Second try right: "You got there!" — half points.
4. Second try wrong, or no second chance was available: the right answer is shown, the child's picks stay marked, and the **explanation** is shown if the question has one (§4.1.3), else the skill hint. Then Next.

With `fewerChoices` (2 choices) there is no second try: the remaining choice would be a free answer. **(my call)**

**Mastery reads the first try only.** `recordResult` is called with the first answer's correctness, exactly as now. The second try changes points and stars, never mastery. This keeps the mastery ladder, the surface-tell guard and the per-skill difficulty ceilings valid without change.

#### 4.1.1 Server contract
- `answerDeedQuestion(runId, index, answer)` keeps its signature and meaning for the first try. Its result grows: `{ correct, answer?: string, secondChance: boolean, hint?: string, explain?: string }`.
  - `answer` and `explain` are returned **only when the question is resolved** (right, or no tries left). While a second chance is open they are absent. Today it always returns `answer`; that changes.
  - `secondChance: true` means the server will accept one `retryDeedQuestion` for this index.
- New `retryDeedQuestion(runId, index, answer)`: allowed only when the first response at `index` is wrong, second chances were on **when the run started** (snapshot on the run row), the question has ≥3 choices, the second try is unused, the answer differs from the first and is one of the choices. Returns `{ correct, answer, explain? }` — always resolved.
- New `resolveDeedQuestion(runId, index)` ("Show me"): allowed only while a second chance is open at `index`; closes it as a miss and returns `{ answer, explain? }`. **(my call — a child must be able to give up on a question; returning the answer is safe because the try is spent.)**
- `completeDeedRun` requires every question resolved: right first time, wrong with no second chance available, retried, or given up. An open second chance blocks finishing, exactly as an unanswered question does today.
- Every action keeps `requireChildAccess(childId, { write: true })` via `loadRun`, refuses a completed run, and validates `index` as an integer in range.

#### 4.1.2 Hints are per skill
- New pure module `src/lib/utils/skill-hints.ts`: `SKILL_HINTS: Record<string, string>` — one or two sentences of *strategy* per skill id ("Split the bigger number into tens and ones, then add the tens first."), never containing a specific answer.
- `hintFor(skillId)` returns the hint or a gentle generic fallback.
- **Test (scales with content):** every skill that `skillsFor` can serve at any grade has a hint; no hint is the generic fallback; no hint exceeds 160 characters. Adding a skill without a hint fails the suite.
- Hints are sent to the client only inside `answerDeedQuestion`'s second-chance or resolved result, not with the question.

#### 4.1.3 Explanations are per question, opt-in
- `Question` gains an optional `explain?: string`, written by the generator from the same parameters it used to build the prompt — e.g. `"7 × 8: 7 × 4 = 28, doubled is 56."`
- `toClientQuestion` never sends it. It leaves the server only in a resolved answer result.
- This round adds `explain` to the generators behind the two children's own grades: **grade 3** (`mul-facts`, `div-facts`, `frac-unit`, `area-perimeter`, `round-nearest`, `add-1000`, `sub-1000`) and **grade 6** (`integer-ops`, `percent-of`, `ratio-rate`, `frac-div`, `eval-expr`). Others fall back to the hint. **(my call: the children are grade 3 and grade 6. If a parent has set a math offset for either, these are not the skills they see; the builder checks the local demo data's `learning_profile` offsets and, if one is set, says so in the report rather than silently re-targeting.)** Ids here are skill ids; the builder resolves each to its generator.
- **Test:** for every generator that writes `explain`, across seeds and all mastery levels, the explanation contains the answer string, and the explanation does not change the question's `id`, `prompt`, `choices` or `answer` (so the verifier, the surface-tell guard and stored runs are unaffected).
- Pool items (reading, language, science) gain no explanation this round; their JSON can carry an optional `explain` later without a contract change.

### 4.2 Stars (best attempt kept)

New pure module `src/lib/utils/deed-scoring.ts`, the single owner of scoring:

```ts
export const SCORING = {
  firstTryPoints: 2,
  secondTryPoints: 1,
  starThresholds: [0.35, 0.65, 0.9] as const, // share of the run's maximum points for 1, 2, 3 stars
  starsToBuild: 1,                            // a run must earn this many stars to raise its building
} as const;
export function runPoints(outcomes: QuestionOutcome[]): { points: number; max: number }
export function starsFor(points: number, max: number): 0 | 1 | 2 | 3
export function countsTowardBuilding(stars: number): boolean
```

`QuestionOutcome` is `"first" | "second" | "miss"`, derived from the stored responses by one pure function (`outcomesOf(questions, responses, secondTries)`), used by both `completeDeedRun` and the tests.

- A flawless run (all first try) is always 3 stars. 8 questions all right on the second try is 50% → 1 star: a child who needed help on everything still builds.
- **A run with 0 stars does not raise the building** (today it does). It still moves mastery and still counts toward the spell school (unchanged), and the result card says the villager will help them try again, never "failed". The engine's own demotion rule (3 of the last 6 wrong steps a skill down) makes the next run easier, which is the reachable path the anti-goal demands. **(my call; it is the single biggest behaviour change and the owner should know it.)**
- **Storage:** `deed_run.stars integer not null default 0`, set by `completeDeedRun`. Best stars per deed are `max(stars)` over the child's completed runs of that deed — no new table, nothing to keep in sync.
- **Backfill (my call):** the migration sets `stars` on every already-completed `kind = 'deed'` run from its stored score. Old runs had no second chances, so points = 2 × `correct_count` out of 2 × the run's question count, and `starsFor` gives an exact answer. The SQL is hand-added to the generated migration, its thresholds are pinned by a test against `SCORING.starThresholds` (so the two cannot drift), and the migration is idempotent (`where completed_at is not null and stars = 0`). Without it, every building Emma and Noah have already built would look starless and the first replay would claim a "New best!" for old work. If the environment refuses the data migration, stop and report the SQL.
- `BuildingOverview.deeds[]` gains `bestStars: 0–3` and `crowned: boolean` (§4.6); `BuildingOverview` gains `stars` (sum of best stars) and `maxStars` (3 × that building's deeds — buildings have 2 or 3 deeds, so 6 or 9; note `deedsToBuild = 5` counts *runs*, not deeds). One grouped query (`deedId, max(stars)`) joins the existing overview load.
- The deed board shows each deed's best stars; the result card shows this run's stars and "New best!" when it beats the old best.
- **Replays after a building stands** say what they are for: the villager's finished-building line changes from "still here, for practice" to a line that names the stars still to earn ("Two more stars to earn here."), via `talk.ts`.

### 4.3 Inside a run: streak and skill meter

- **Streak:** consecutive first-try rights in this run, shown as a small flame with a count from 2 up; a streak of 3 and 5 plays the existing `deed-right` cue brighter (new cue ids only if the sound store already supports variants; otherwise reuse). Calm mode (`calm`) shows the count without the flame animation. Pure: `streakAfter(prev, outcome)`.
- **Skill meter:** for the question's skill, how close it is to its next rung, from the mastery rule itself. `answerDeedQuestion` returns `meter: { skillLabel, filled, needed }` where `needed = 7` and `filled` is first-try rights among the last 8 (`recordResult`'s own window). Shown as pips under the question after each answer. On a rung change: "Multiplication facts: getting stronger!" in the moment, not only at the end. The meter never shows a rung number or a grade.
- The rule lives once: `mastery.ts` exports `progressToNextRung(state)` beside `recordResult`, and both use the same constants. No copy of 7/8/3/6 anywhere else.

### 4.4 Keep-it-sharp questions (spaced review)

- Each deed run may include up to `SCORING`'s sibling `REVIEW.maxDue = 2` questions from **due** skills. **Candidates are only the skills the deed can already serve at the child's strand grade** (`chooseSkills(deed, grade)`) that were not selected for this run (my call: it keeps the engine's grade rules intact and needs no extra query, since pool rows for every candidate are already loaded at `actions/deeds.ts:130-137`; skills from earlier grades coming back is listed under §9). A candidate is due when its mastery level ≥ 1 and `lastPracticedAt` older than the interval for its level — `REVIEW.intervalDays = [_, 2, 4, 7, 14]` (index = level). Most overdue first.
- Due review replaces fresh questions, never adds to the count. It shares the existing `MAX_REVIEW` (recent misses) budget: misses first, then due skills, total ≤ `REVIEW.maxTotal = 3`. **(my call)**
- Questions are drawn at the skill's own mastery level by the existing generator / pool draw. A due skill's answer moves its own mastery as any answer does, so a forgotten skill drops a rung — Khan's decay, with no new mechanism.
- Pure: `dueSkills(masteryRows, area, grade-range, now)` in a new `src/lib/utils/review-schedule.ts`. `buildDeedRun` receives the due list (computed in the action from rows it already loads — no extra query). `skillIds` stored on the run includes due skills so the summary can report their changes.
- Not shown as "review" to the child; the result card may say "You kept Division facts sharp." when a due question was right. **(my call)**

### 4.5 Gilded buildings (stars you can see)

- A building whose deeds all have 3 best stars is **gilded**: a gold pennant flies over it. Its villager's plate shows the building's stars ("★ 7 of 9") once the building stands (today `plate-anchors.ts` shows pips only for unbuilt sites).
- Pure rule `isGilded({ stars, maxStars })` in `deed-scoring.ts`.
- **Data path (the scene only gets props):** `RunSummary.building` grows `stars` and `maxStars`; `applyDeedResult` (`realm/kingdom-state.ts`) copies them; the client kingdom state therefore always knows each building's stars, before and after a run. The village layout's building records (`realm/layout.ts`) carry `gilded`.
- Rendering is a new scene component `gilded-pennants.tsx` that takes the gilded buildings' positions and draws one pennant each; `spike-scene.tsx` mounts it with one line and one stable prop. The five built-building figures are not edited.
- **Dev override for screenshots:** `__realmRaise(buildingId, {…, stars, maxStars})` accepts the two new optional fields (and a `?gilded=well` query override in the same place the existing overrides are read).
- The objective rule gains a post-build stage: when every building stands, the objective becomes the building with the most stars still to earn ("Earn stars at the Mill — Miller Tessa has more to ask."), and `objectiveSpeech`'s "Nothing is waiting" is used only when every deed has 3 stars. `ObjectiveState` gains a `kind: "stars"` variant carrying `objectives` like `"next"`; every reader must handle it — known readers are `frame-hud.tsx:156-163` (assumes non-`complete` has `objectives`) and `realm-game.tsx:253` (keys the minimap goal on `"next"` only). Both get a small additive change; prefer a helper `hasObjectives(state)` in `objective.ts` over two hand-written checks.

### 4.6 The Crown Challenge (Beast Academy's trophy problem)

- A deed with 3 best stars shows **Crown Challenge** on the board: 3 questions from the deed's chosen skills at the skill's next rung up (`min(level + 1, MASTERY_MAX)`), **no second chances**, no review mixed in.
- All 3 right earns the deed's crown seal (shown beside its stars). A miss costs nothing; it can be tried again at once with new questions. **(my call: no cooldown — Beast Academy's lockout is for tests, and a challenge here is optional.)**
- Server: `startDeedRun(childId, deedId, "realm", { challenge: true })` → refuses unless the child's best stars on that deed are 3. The run row stores `kind: "challenge"`.
- **What a run kind does is one table** (`RUN_EFFECTS` in `deed-scoring.ts`), read by every consumer instead of scattered `if`s:

| Effect | `deed` | `challenge` |
|---|---|---|
| raises the building (if ≥ `starsToBuild`) | yes | no |
| earns stars | yes | no |
| moves mastery | yes (first try) | **no** (my call: its questions sit a rung above the child, and repeated optional attempts must never demote a skill they just proved) |
| counts toward the spell school | yes | no — `getSchoolCounts` (`actions/subjects.ts:144-153`) gains a `kind = 'deed'` filter |
| its misses come back as review | yes | no — `loadRecentMisses` (`actions/deeds.ts:57-81`) gains a `kind = 'deed'` filter |
| second chances | per the run's snapshot | never |
- Best crown: `bool_or(kind = 'challenge' and flawless)` per deed in the same grouped overview query.

### 4.7 Parent configuration

Two new `realm_settings` columns, grown-up only through the existing `updateRealmSettings` (which already refuses a child actor), shown in the existing Realm settings panel:

| Column | Default | Range | Meaning |
|---|---|---|---|
| `side_quest_length` | 8 | 4–12 | Questions in a side quest. |
| `second_chances` | true | — | A wrong first answer gets a hint and one more try. |

- Validation lives in `utils/realm-settings.ts` beside the existing defaults and follows its convention: an out-of-range write is **rejected** (`:84-127`), an out-of-range stored value **reads as the default** (`:66-81`). The range is written there once.
- Both are **snapshotted onto the run** when it starts (`deed_run.question_count` is implicit in `questions.length`; add `deed_run.second_chances boolean not null default false`), so changing a setting mid-run never changes the rules of a run in progress, and old rows mean "no second chances", which is what they were.
- `Deed.questionCount` stays as the catalog default; `buildDeedRun` takes the count as an input.

## 5. Architecture

- **Pure first.** All rules are pure modules with their own tests: `deed-scoring.ts`, `review-schedule.ts`, `skill-hints.ts`, `mastery.ts` (meter), a run-flow reducer `src/lib/utils/deed-run-flow.ts` (states: asking → second-chance → resolved → summary) used by **both** the Realm's `DeedRun` and the page's `DeedPlayer` so the two UIs cannot drift (today they are hand-ported copies).
- **Server actions stay thin.** `actions/deeds.ts` parses, authorizes (`requireChildAccess`, `isChildActor` for Realm runs), loads, calls pure rules, writes. Response-shape changes are additive.
- **Schema (one migration, `npm run db:generate` then `db:migrate`):** `deed_run.second_tries text not null default '[]'` (JSON `(string|null)[]`: `null` = no second try taken, a choice = the retry, the empty string `""` = gave up; an empty array on an old row reads as all `null`), `deed_run.stars integer not null default 0`, `deed_run.kind text not null default 'deed'` (enum `deed|challenge`), `deed_run.second_chances boolean not null default false`; `realm_settings.side_quest_length integer not null default 8`, `realm_settings.second_chances boolean not null default true`. All additive with defaults, so existing rows stay valid and resumed old runs behave as before.
- **Overlays and bus:** nothing new on `HudBus`. The deed board is already an overlay; the pennant reads the bundle's buildings.
- **No `three` under Vitest.** The pennant component is a scene component; its rule is pure.

## 6. Security and guard rails

- The answer and explanation never reach the client before the question is resolved (test: `answerDeedQuestion`'s result for a wrong first answer with a second chance open has no `answer`/`explain` key).
- Every retry/resolve rule is enforced on the server from the stored run, never trusted from the client: order, single use, choice membership, run ownership, run not completed, `second_chances` snapshot.
- Challenge eligibility (3 best stars) is checked on the server.
- Settings writes stay grown-up only; out-of-range values are rejected server-side.
- **Learning density guard (Prodigy lesson):** this round adds no non-learning time inside a run (no cutscenes, no forced animations longer than the existing ones; calm mode keeps them off).

## 7. Testing and verification

- TDD per `.superpowers/realm-rules.md`: red → green → refactor for every behaviour, with the red line quoted in each task report.
- Pure modules get unit tests; actions get `vi.mock`-of-db tests in the existing style (`actions/realm-play-bounty.test.ts`); the run-flow reducer gets exhaustive transition tests; `deed-board.test.tsx` covers second chance, give-up, stars and challenge UI.
- Existing guards must stay green and unmodified in meaning: `drill-surface-tells.test.ts`, `drill-verify.test.ts`, `drill-generators.test.ts`, the migrations journal test.
- One test through the composed path (lesson from round 3): a run started with second chances on, a wrong first answer, a right retry, completion → stars on the row → `bestStars` on the overview.
- Browser check at the end with the agent dev server (`NEXT_DIST_DIR=.next-agent`, keys only, never capture the mouse): a deed with a miss and a retry, the result card's stars, the board's stars, a gilded building via the dev override.

## 8. Order of work

1. Scoring + schema + server contract for second chances (no UI change yet beyond what the existing UI tolerates).
2. Shared run-flow reducer; Realm `DeedRun` and page `DeedPlayer` adopt it; second-chance UI; hints.
3. Explanations for the grade-3 and grade-6 generators.
4. Stars on board/result, best-stars overview, building needs a star, replay copy.
5. Streak and skill meter.
6. Keep-it-sharp review.
7. Parent settings.
8. Gilded buildings and the post-build objective.
9. Crown Challenge.
10. Whole-branch review, browser verification.

Each step is shippable on its own; 8 and 9 can be cut without leaving anything half-built.

## 9. Later (recorded, not built)

- Answers that drive spells (Zombie Division-style intrinsic integration), with scaffolds that fade as mastery grows.
- Typed answers for numeric skills.
- Explanations for every generator and for pool items.
- Spaced review that reaches skills from earlier grades (needs its own pool query and a ruling on serving below the strand grade).
- Riddle stones at the five named places as daily mixed review in the world.
- A puzzle tower for deliberately hard, unscored problems (Beast Academy's Puzzle Lab), with solutions in the parent view only.
- Sibling co-op deeds.

## 10. Calls made by the designer (for the owner to check)

1. A 0-star run no longer raises its building (it still teaches and still counts toward spells).
2. Mastery reads only the first try; second tries change points and stars only.
3. No second try when only 2 choices remain.
4. A child can give up on a second chance ("Show me") and see the answer.
5. Explanations this round only for grade-3 and grade-6 math; everything else gets the skill hint.
6. Review questions replace fresh ones (count unchanged), max 3 review per run, never labelled "review" to the child.
7. Crown Challenge has no cooldown, does not move mastery, does not count toward spell schools, and its misses are not re-asked.
8. Two parent settings only: side-quest length (4–12, default 8) and second chances (on).
9. Existing finished runs are given stars from their stored score when the migration runs.
10. Keep-it-sharp review draws only from skills the deed can serve at the child's current grade.

## 11. After the build (2026-11-05)

Built on `realm-playability` (32 commits from dev 690dc03): 13 tasks, each reviewed, plus a whole-branch review and one fix wave. Full suite 272 files / 5276 tests, tsc clean, eslint at the known baseline. Verified in the browser as Emma: second chance with hint, retry, Show me with worked explanation, streak, result stars, board stars, Crown Challenge, pennants, plates, simple depth, the Settings "Side quests" group.

Calls made during the build (beyond §10): recent misses keep their old cap of 2 inside the review budget of 3; the streak shows the flame without a digit at simple depth; in production any deed error reads as one friendly line ("That didn't work.") because Next hides server-action messages.

**Before the Turso → Neon cutover:** the importer now skips missing source columns and runs the star backfill at the end (`migrate-data-from-turso.ts`). Run it once against a scratch database first.

**Known follow-ups (judged safe to wait):**
- Flat-Realm `deed-panel.tsx` and page `deed-picker.tsx` still show raw start errors; grown-up panels still say "The enchantment failed."
- Science and vocabulary hints are close to generic; `lang-gk` is a mixed pool one hint cannot fully fit.
- The page player and the Realm board still repeat some view wiring (focus, read-aloud, timer); a `useDeedRunView` hook would remove it.
- `actions/deeds.ts` is ~480 lines; split the attempt actions into their own module next time it is touched.
- The 420 KB explanation baseline fixture could become per-generator digests.
- Local data: `npm run db:seed-drills` is needed locally for the grade-3/4 reading pools (a reading side quest 500s without them).
- Dev only: one fresh dev build gave two server actions the same client id ("call is not a function"); a clean `.next-agent` fixed it.
