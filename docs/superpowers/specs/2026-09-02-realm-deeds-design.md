# Realm Drill Bank and Deeds — Design

**Date:** 2026-09-02
**Slice:** 3 of 7 in the Realm program (see `2026-09-02-realm-program-overview.md`; builds on slices 1 and 2)
**Status:** Approved in brainstorming; awaiting written-spec review

## Goal

Give the Realm its education: a bank of practice questions organized by skill, a mastery ladder per
hero per skill, and "deeds" that wrap a handful of questions in a short story about helping the
people of the kingdom. When this slice ships a hero can open the Deeds page, pick a deed, answer its
questions in an accessible 2D flow that honors their learning profile, raise a kingdom building, and
push their school-of-magic totals toward new spell parts. No AI, no external service, no tokens.

## Non-goals

Typed answers, parent-authored questions, the 3D presentation (slices 4–5), spending play minutes
(slice 6), and a large curated content bank (a later content pass; this slice ships starter pools
and generators with a schema and seed pipeline that scale).

## A. Skills, bands, and question sources

### Content bands

```ts
export type ContentBand = "k1" | "g23" | "g45" | "g68" | "g912";
```

`bandForHero(grade: string | null, ageMode: "elementary" | "middle" | "high"): ContentBand` in
`src/lib/utils/content-bands.ts`: K, 1 → `k1`; 2, 3 → `g23`; 4, 5 → `g45`; 6–8 → `g68`; 9–12 →
`g912`. With no grade: elementary → `g23`, middle → `g68`, high → `g912`. `BAND_LABELS` gives
"Kindergarten – Grade 1", "Grades 2–3", "Grades 4–5", "Grades 6–8", "Grades 9–12".

### Questions

```ts
export type Question = {
  id: string;             // stable: generator questions encode their parameters, pool items use the item id
  skillId: string;
  prompt: string;
  choices: string[];      // 4 in normal mode; 2 after fewerChoices trimming
  answer: string;         // always one of choices
  readAloud?: string;     // text to speak; defaults to prompt
};
```

Multiple choice only in this slice.

### Skills (code: `src/lib/utils/skills.ts`)

```ts
export type SkillArea = "math" | "reading" | "language" | "science";
export type Skill = {
  id: string;
  label: string;
  area: SkillArea;
  band: ContentBand;
  source: { kind: "generator"; generatorId: string } | { kind: "pool"; poolId: string };
};
export const AREA_SCHOOL: Record<SkillArea, SpellSchool> = { reading: "element", language: "element", math: "form", science: "modifier" };
export function skillsFor(area: SkillArea, band: ContentBand): Skill[];
export function findSkill(id: string): Skill | null;
```

Starter skill catalog (id → label, area, band, source):

| id | label | area | band | source |
|---|---|---|---|---|
| add-10 | Addition within 10 | math | k1 | generator `add` |
| sub-10 | Subtraction within 10 | math | k1 | generator `sub` |
| add-20 | Addition within 20 | math | g23 | generator `add` |
| sub-20 | Subtraction within 20 | math | g23 | generator `sub` |
| add-100 | Addition within 100 | math | g23 | generator `add` |
| mul-facts | Multiplication facts | math | g45 | generator `mul` |
| div-facts | Division facts | math | g45 | generator `div` |
| place-value | Place value | math | g45 | generator `place-value` |
| fractions-compare | Comparing fractions | math | g68 | generator `fractions-compare` |
| integer-ops | Integer operations | math | g68 | generator `integer-ops` |
| percent-of | Percent of a number | math | g912 | generator `percent-of` |
| one-step-eq | One-step equations | math | g912 | generator `one-step-eq` |
| sight-k1 | Sight words | reading | k1 | pool `sight-words-k1` |
| sight-g23 | Sight words | reading | g23 | pool `sight-words-g23` |
| spell-g23 | Spelling | language | g23 | pool `spelling-g23` |
| spell-g45 | Spelling | language | g45 | pool `spelling-g45` |
| vocab-g45 | Vocabulary | language | g45 | pool `vocab-g45` |
| vocab-g68 | Vocabulary | language | g68 | pool `vocab-g68` |
| vocab-g912 | Vocabulary | language | g912 | pool `vocab-g912` |
| science-k1 | Science facts | science | k1 | pool `science-k1` |
| science-g23 | Science facts | science | g23 | pool `science-g23` |
| science-g45 | Science facts | science | g45 | pool `science-g45` |
| science-g68 | Science facts | science | g68 | pool `science-g68` |
| science-g912 | Science facts | science | g912 | pool `science-g912` |

Every band has at least one skill per area except: `k1` has no `language` skill (sight words cover
reading), and `g68`/`g912` have no `reading` skill (vocabulary covers language). `skillsFor` returns
`[]` in those cases and the deed engine falls back to the nearest band below, then above.

### Generators (code: `src/lib/utils/drill-generators.ts`)

```ts
export type Rng = () => number;                 // [0, 1)
export function seededRng(seed: number): Rng;   // mulberry32; deterministic for tests
export type Generator = (level: number, rng: Rng, skillId: string) => Question;
export const GENERATORS: Record<string, Generator>;
```

Each generator takes the mastery level 0–4 and widens its ranges with it. Distractors are numeric
near-misses (±1, ±10, swapped digits, off-by-one operation) that are never equal to the answer or to
each other; choices are shuffled with the rng. Question ids encode the parameters
(`add-20:7+9`) so a missed item can be re-asked verbatim.

| generatorId | level 0 → level 4 |
|---|---|
| add | sums to 5 → sums to 20 (k1) / to 100 with carrying (g23, chosen by the skill's band) |
| sub | within 5 → within 20 / within 100 with borrowing |
| mul | ×0–2 → ×0–12 |
| div | ÷1–2 → ÷1–12, whole results only |
| place-value | "What digit is in the tens place of 47?" 2-digit → 6-digit, tens → hundred-thousands |
| fractions-compare | same denominators → unlike denominators up to 12; ask which is larger |
| integer-ops | add/sub within ±10 → add/sub/mul within ±50 |
| percent-of | 10%/50% of multiples of 10 → any percent of numbers to 500 with whole answers |
| one-step-eq | x + a = b with small positives → ax = b and x − a = b with negatives |

The generator reads its skill's band to pick the k1 vs g23 range where a generator serves two skills.

### Pools (data: `src/content/drills/<poolId>.json`, table `drill_item`)

File format:
```json
{
  "poolId": "sight-words-g23",
  "band": "g23",
  "items": [
    { "id": "sight-g23-because", "prompt": "Which word is \"because\"?", "answer": "because", "distractors": ["become", "beside", "before"], "readAloud": "because", "level": 1 }
  ]
}
```
`level` is 0–4 and optional (default 2). `distractors` has exactly three entries. Starter content:
roughly 40–60 items per pool, authored in the plan. Pool conventions:
- sight words: prompt "Which word is “X”?", read-aloud "X", distractors are visually similar words.
- spelling: prompt "Which is spelled correctly?", answer is the correct spelling, distractors are misspellings.
- vocabulary: prompt is a definition, answer is the word.
- science: prompt is a question, answer a short phrase.

A colocated test loads every file and checks: unique item ids across all pools, `poolId` matches the
filename, `band` is valid, exactly three distractors, no distractor equals the answer, no duplicate
choices, `level` in range.

Seed script `src/lib/db/seed-drills.ts` (npm `db:seed-drills`): upserts every item by id
(`onConflictDoUpdate` on `id`) so edits to the JSON propagate; never deletes.

## B. Mastery and the deed engine

### `skill_mastery` table

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | |
| `childId` | text FK child, cascade | |
| `skillId` | text | catalog id |
| `level` | integer | 0–4, default 0 |
| `recentResults` | text | JSON array of the last 10 booleans, newest last |
| `correctTotal`, `attemptTotal` | integer | default 0 |
| `lastPracticedAt` | timestamp, nullable | |
| `createdAt`, `updatedAt` | timestamp | |

Unique on `(childId, skillId)`.

### Rules (`src/lib/utils/mastery.ts`)

```ts
export const MASTERY_MAX = 4;
export type MasteryState = { level: number; recentResults: boolean[] };
export function recordResult(state: MasteryState, correct: boolean): MasteryState;
export function masteryLabel(level: number): string;  // "Just starting", "Warming up", "Getting stronger", "Nearly there", "Mastered"
export function masteryChangeCopy(before: number, after: number, skillLabel: string): string | null;
```

`recordResult` appends (keeping 10), then: if the last 8 hold ≥ 7 correct and level < 4, level + 1
and the history clears (a fresh ladder rung); if the last 6 hold ≥ 3 wrong and level > 0, level − 1
and the history clears. Otherwise unchanged. `masteryChangeCopy` returns "{label}: getting stronger"
on a step up, "{label}: we'll practice this more" on a step down, null otherwise.

### Deed engine (`src/lib/utils/deed-engine.ts`)

```ts
export type ProfileLike = { fewerChoices: boolean; predictableRoutine: boolean; untimed: boolean; readAloud: boolean };
export type PoolItem = { id: string; skillId: string; prompt: string; answer: string; distractors: string[]; readAloud: string | null; level: number };
export type BuildRunInput = {
  deed: Deed;
  band: ContentBand;
  masteryBySkill: Record<string, number>;        // level per skill id, missing = 0
  profile: ProfileLike;
  seed: number;
  poolItems: PoolItem[];                          // items for the candidate pool skills, loaded by the action
  recentMisses: Question[];                       // up to 5, newest first, from the hero's last runs
};
export type BuiltRun = { skillIds: string[]; questions: Question[] };
export function chooseSkills(deed: Deed, band: ContentBand): Skill[];   // area + band, with the nearest-band fallback
export function buildDeedRun(input: BuildRunInput): BuiltRun;
export function gradeAnswer(question: Question, answer: string): boolean;
```

`buildDeedRun`:
1. `chooseSkills` picks up to two skills for the deed's area and the hero's band (one generator and
   one pool where both exist; otherwise whatever exists).
2. Target count = `deed.questionCount` (8). Reserve `min(2, recentMisses.length)` slots for review
   (misses whose skill is among the chosen skills; else fewer).
3. Fill the rest alternating between chosen skills. Generator skills call their generator at the
   hero's mastery level. Pool skills draw items whose `level` is within ±1 of the mastery level
   (widening to any level if fewer than needed), without repeats, choices = answer + 3 distractors
   shuffled.
4. `predictableRoutine`: questions grouped by skill in catalog order, review items last. Otherwise
   interleaved by the rng, review items spread.
5. `fewerChoices`: every question's `choices` trimmed to the answer plus one distractor (the first
   remaining after shuffle), order shuffled.
6. Returns the skill ids used and the question list. Never throws; if a pool has zero items the
   run uses only the other skill, and if no skill exists at all the action reports "No deeds are
   ready for this hero yet."

`gradeAnswer` is an exact string comparison after trimming.

### Read-aloud and timing

The player speaks `question.readAloud ?? question.prompt` through `window.speechSynthesis` when
`profile.readAloud` is on and whenever the speaker button is pressed. There is no time limit in any
mode. When `untimed` is off, the player shows a soft elapsed-time chip per deed; when on, nothing.

## C. Deeds, kingdom buildings, and records

### Buildings (code: `src/lib/utils/kingdom.ts`)

```ts
export type Building = { id: string; label: string; description: string; deedsToBuild: number; icon: GameIconName };
export const BUILDINGS: Building[];   // well, mill, bridge, chapel, market, library, watchtower, garden — deedsToBuild 5 each
export function buildingProgress(deedsDone: number, building: Building): { done: number; total: number; complete: boolean };
```

### Deeds (code: `src/lib/utils/deeds.ts`)

```ts
export type Deed = {
  id: string;
  title: string;
  story: string;             // gentle default, two sentences
  monsterStory?: string;     // optional variant when toneMode is "monsters"
  buildingId: string;
  area: SkillArea;
  questionCount: number;     // 8
};
export const DEEDS: Deed[];  // 20: at least two per building, areas spread so every area advances at least two buildings
export function deedsForBuilding(buildingId: string): Deed[];
export function deedStory(deed: Deed, tone: "gentle" | "monsters"): string;
```

Story voice: a villager needs help; the deed names them and the building ("Old Bram's bucket keeps
coming up dry. Count the stones the well-diggers need."). Monster variants only where the story
mentions an opponent ("Shadow blobs have clogged the well…").

### Tables

`drill_item`: `id` text PK (the JSON item id), `poolId`, `skillId`, `band`, `prompt`, `answer`,
`distractors` (JSON text), `readAloud` nullable, `level` integer, `updatedAt`. Index on `poolId`.

`deed_run`: `id`, `childId` FK cascade, `deedId`, `skillIds` (JSON), `band`, `questions` (JSON:
the full `Question[]` including answers, server-side only), `responses` (JSON: `string | null` per
question), `correctCount`, `flawless` boolean, `startedAt`, `completedAt` nullable, `createdAt`,
`updatedAt`. Index on `(childId, completedAt)`.

`kingdom_progress`: `id`, `childId` FK cascade, `buildingId`, `deedsDone` integer default 0,
`completedAt` nullable, timestamps. Unique on `(childId, buildingId)`.

One migration for the four tables (`drill_item`, `skill_mastery`, `deed_run`, `kingdom_progress`).

### Counting toward spell unlocks

`getSchoolCounts(childId)` (subjects action) becomes activity rows per school **plus** completed
deed runs per school, where a run's school is the school of its first skill's area
(`AREA_SCHOOL`). The catalog's hint copy changes to "{n} more {subjects} quests or deeds to go."
(`spellUnlockHint` in `spell-catalog.ts`, with its test updated).

### Records stay separate

Deed runs never write `activity_log`, `currentXp`, `bonusXp`, streaks, or the learning log. The
Mastery panel says so.

### Access

- Deeds page and actions require `realmSettings.enabled` for the hero (loaded through
  `loadRealmSettings`); otherwise the page shows "The Realm is closed for this hero. A grown-up can
  open it in the Chronicle." Not gated by play minutes.
- All deed actions: `requireChildAccess(childId)` for reads and `{ write: true }` for run
  mutations; a hero may play their own deeds; a parent may play for a hero (same as avatars and
  spells).

### Actions (`src/lib/actions/deeds.ts`)

- `getDeedsOverview(childId)` → `{ enabled: boolean; band: ContentBand; buildings: { building, done, total, complete, deeds: Deed[] }[]; mastery: { skillId, label, level, lastPracticedAt }[]; tone }`.
- `startDeedRun(childId, deedId)` → `{ runId, questions: ClientQuestion[] }` where `ClientQuestion` omits `answer`. Loads band, mastery, profile, pool items for the candidate skills, recent misses (from the hero's last 5 completed runs: questions answered wrong), builds the run with `seed = Date.now()`, stores the row. Throws "No deeds are ready for this hero yet." when the engine returns zero questions. An unfinished run for the same hero and deed from the last hour is resumed instead of restarted.
- `answerDeedQuestion(runId, index, answer)` → `{ correct: boolean; answer: string }`. Grades against the stored question, records the response (ignores a repeat answer to the same index), updates `skill_mastery` for that question's skill through `recordResult`.
- `completeDeedRun(runId)` → `{ correctCount, total, flawless, masteryChanges: string[], building: { label, done, total, complete } }`. Requires every index answered; sets `completedAt`, increments `kingdom_progress.deedsDone` (marking `completedAt` when it reaches `deedsToBuild`), revalidates `/deeds`, `/spellbook`, `/loot`.
- `getMasteryOverview(childId)` for the Chronicle panel.

`getSchoolCounts` lives in `subjects.ts` and is extended there.

## D. Page, mastery panel, and tests

### Route `/deeds`

`src/app/(app)/deeds/page.tsx`: shaped like the Spellbook page (actor, active child, empty states,
child selector). Header "My Deeds" / "{name}'s Deeds" with the hero's band label. Renders
`<DeedPicker>`; the player is a client flow inside it.

`src/components/deed-picker.tsx` (client): buildings as cards with a progress bar (`done/total`),
in-progress buildings first, complete ones last with a "Built" badge; under each building its deeds
with story (tone-aware) and a "Begin" button. Begin calls `startDeedRun` and mounts `<DeedPlayer>`.

`src/components/deed-player.tsx` (client): props `{ childId, runId, questions: ClientQuestion[], profile: ProfileLike, deed: Deed, onFinished }`. One question at a time: prompt (large), a speaker button (`aria-label="Read aloud"`), choice buttons (`aria-label` = choice text), progress dots (`aria-label="Question N of M"`). On tap, calls `answerDeedQuestion`, shows feedback for a beat ("That's it!" / "Not quite. The answer was {answer}."), then a Next button (auto-advance is never used, so a hero who needs a moment gets it). After the last question, calls `completeDeedRun` and renders `<DeedResults>` with the summary, mastery copy, and building progress. No animation beyond opacity when `reducedMotion` or `lowStimulus` is set; otherwise a small sparkle on correct answers that CSS `prefers-reduced-motion` also disables.

Nav: `{ href: "/deeds", label: "Deeds", icon: "map", description: "Help the folk of your kingdom — each deed raises a building and strengthens your magic." }`. The nav list is alphabetical after Tavern, so Deeds goes immediately before Loot.

### Chronicle

`src/app/(app)/settings/mastery-panel.tsx`, parent-only, read-only: the hero's skills grouped by
area with `masteryLabel`, last practiced date, and the note "Deeds are practice inside the Realm.
They never appear in the learning log or count as school time."

### Access control summary

| Action | Parent | Child (own id) |
|---|---|---|
| getDeedsOverview, getMasteryOverview | yes | yes |
| startDeedRun, answerDeedQuestion, completeDeedRun | yes | yes |

### Error handling

- Actions throw player-facing errors: "The Realm is closed for this hero. A grown-up can open it in the Chronicle.", "No deeds are ready for this hero yet.", "That deed has already been finished.", "Answer every question before finishing the deed."
- `buildDeedRun` never throws; the action turns an empty result into the "No deeds" error.
- The player shows action errors in place and offers "Try again".
- Speech synthesis is optional: if `window.speechSynthesis` is missing, the speaker button is hidden.

### Testing (tests first)

- `content-bands.test.ts`: grade and age-band mapping.
- `drill-generators.test.ts`: seeded rng determinism; for each generator at each level: answer in choices, four distinct choices, answer correct by recomputation, ranges honored; ids encode parameters.
- `drills-content.test.ts`: loads every pool JSON and validates the rules in A.
- `skills.test.ts`: every skill's source resolves (generator exists or a pool file exists); `skillsFor` and fallback behavior.
- `mastery.test.ts`: step up at 7/8, step down at 3/6, clamps at 0 and 4, history clears on a step, copy.
- `deed-engine.test.ts`: question count, review injection cap, `fewerChoices` trims to two including the answer, `predictableRoutine` ordering, interleaving otherwise, pool draws near level with widening, no repeats, zero-item pool fallback, `gradeAnswer` trimming.
- `kingdom.test.ts` and `deeds.test.ts`: catalog integrity (unique ids, every deed's building exists, ≥ 2 deeds per building, every area used), `deedStory` tone selection.
- Component tests: `deed-player.test.tsx` (answers call the action with index and choice, feedback text, Next advances, last question completes and shows results, two-choice mode renders two buttons, speaker hidden without speechSynthesis); `deed-picker.test.tsx` (in-progress first, Begin calls start).
- Actions and the seed script stay thin and untested. `npm run typecheck`, `npm run lint` (no new errors), `npm test`.

### Migration and seeding

One migration adding `drill_item`, `skill_mastery`, `deed_run`, `kingdom_progress`. Run
`npm run db:seed-drills` after migrating (idempotent).

## File map

```
src/lib/utils/content-bands.ts (+test)
src/lib/utils/skills.ts (+test)
src/lib/utils/drill-generators.ts (+test)
src/content/drills/*.json (12 pools) + src/lib/utils/drills-content.test.ts
src/lib/db/seed-drills.ts, package.json script
src/lib/utils/mastery.ts (+test)
src/lib/utils/deed-engine.ts (+test)
src/lib/utils/kingdom.ts (+test), src/lib/utils/deeds.ts (+test)
src/lib/db/schema.ts, migrations/0023_*.sql
src/lib/actions/deeds.ts
src/lib/actions/subjects.ts (getSchoolCounts adds completed deed runs)
src/lib/utils/spell-catalog.ts (+test: hint copy "quests or deeds")
src/components/deed-picker.tsx (+test), src/components/deed-player.tsx (+test), src/components/deed-results.tsx
src/app/(app)/deeds/page.tsx, src/components/nav-items.ts
src/app/(app)/settings/mastery-panel.tsx, settings/page.tsx, settings/child-list.tsx
```
