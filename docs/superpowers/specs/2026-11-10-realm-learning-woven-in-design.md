# The Realm, woven into the schoolwork

**Date:** 2026-11-10 · **Base:** `dev` at 9cf44b3 (Turso; earning-time and playability rounds merged)
**Owner's request:** "make the interaction between normal Kingdoms & Crowns assignments and the Realm more tied together so kids want to go play the Realm, and make the learning more baked into the game like Legends of Learning and Beast Academy rather than feeling separate from the game." Principles: SOLID, DRY, KISS, configurability, dynamicness, scalability, security, sturdy long-term architecture.

This is a **programme of six slices** on one shared framework. Each slice gets its own implementation plan and TDD cycle, in the order in §8.

---

## 1. Why

### What the code does today (mapped 2026-11-10)

- **Real schoolwork reaches the Realm only indirectly.** Finishing a quest writes one `earned` row of play minutes (`grantEarnedMinutesForCompletion`, `services/realm-play.ts`). Subjects feed spell schools, and XP feeds castle tier and mounts. **No building, place or villager reflects a real subject or assignment.** A quest's free-text subject maps to nothing in the world.
- **Learning in the Realm is a quiz laid over the game.** Every side quest is a 2D multiple-choice card (`DeedBoard`, `DeedPlayer`; `Question` assumes `choices[]`). The 3D world shows the result (a building stage goes up), but nothing in 3D *is* the skill. This is what research calls *extrinsic integration* ("chocolate-covered broccoli"), the pattern of Prodigy and Legends of Learning's Awakening.
- **The only reward the Realm shows for schoolwork is a number of minutes**, and minutes appear nowhere outside the Realm.
- Unbuilt pieces of the September programme this touches: slice 13 "record of the work" (`2026-09-10-realm-record-of-the-work-design.md`), and the playability round's §9 "Later" list (answers that drive spells, typed numeric answers, riddle stones, a puzzle tower).

### What the research says (full report in this session; key sources below)

1. **The skill should be the mechanic.** In Habgood & Ainsworth (2011), children given free choice played the version where dividing *was* the combat about 7× longer than the version with quizzes between levels, and it taught at least as well. DragonBox and Slice Fractions show the same thing, with one warning: transfer to paper needs an explicit **bridge to standard notation** ("you just did ½ + ¼ = ¾").
2. **Expected rewards for finishing a task undermine children's own interest** (Deci, Koestner & Ryan 1999: 128 experiments; worse for children than adults). Rewards that tell a child they're competent (seeing what they made, being noticed) don't. Screen time used as a reward goes with more screen time (Tang et al. 2018).
3. **Games teach best when they back up what's being taught** and are played over several sessions (Wouters et al. 2013; Clark et al. 2016, g ≈ 0.33). Simple visuals did as well as complex ones.
4. **Beast Academy's recipe:** hard problems that feel earned; fallible characters who model mistakes; stars that mean mastery (1 star = proficient); a bonus problem behind 3 stars; full worked solutions; the parent chooses the lock scheme.
5. **For ages 6–9, show a worked example before a hard problem** (Sinha & Kapur 2021, age moderator). Productive struggle comes first only for older children and for bonus problems.
6. **Kids game the system** (rapid guessing, hint abuse; Baker et al.). The answer is a gentle character nudge plus an easier scaffold, not a penalty.
7. Interleaved and spaced practice is strong (Rohrer et al. 2020, d = 0.83). Multiple choice remains a good fit for **fact fluency and review**.

---

## 2. What the owner decided (2026-11-10)

| # | Question | Decision |
|---|---|---|
| 1 | Focus | **Both, linked.** Real quests produce subject materials, and building with them *is* a hands-on use of the skill. |
| 2 | Minutes | **Keep, but quieter.** Minutes work exactly as today (all parent settings unchanged). The headline reward for a quest becomes materials and celebration in the world; minutes move to the background. |
| 3 | Show what you learned | **Optional; a parent can require it per quest.** The child "tells the Scribe" what they learned, and it is kept in an in-world Chronicle. |
| 4 | Ages | **K through 12.** Every mechanic scales by grade. |
| 5 | Mechanics | All four: **building by measuring** (math), **reading clue trails** (reading), **rune spellcraft** (spelling and vocabulary), **logic locks** (all subjects). |
| 6 | What materials are for | **Wings, upgrades and decoration.** Core buildings still rise from side quests, so no child is ever stuck; real-quest materials add the wings, upgrades and decor that make the kingdom show this year's actual schoolwork. |
| 7 | Focus topics | **A grown-up picks focus skills from the skill catalog**; side quests and puzzles lean toward them. No authoring needed. |
| 8 | Multiple choice | **Kept for quick review.** Hands-on puzzles become the main way buildings rise. Multiple choice stays for fact fluency and spaced review (the gate board, riddle stones, the Side Quests page's review). |
| 9 | What the Scribe takes | **A typed note and/or a drawing.** No photos or voice, so no file storage service and nothing off-site. |
| 10 | Which mechanic first | **Building by measuring.** |
| 11 | Quests finished before launch | **The last 4 weeks count.** A one-time "welcome delivery" mints materials for quests finished in the 28 days before slice 3 ships (§4.4). |

## 2a. Calls the designer made (for the owner to check)

- **Notes earn no extra material.** A Scribe note or drawing earns a Chronicle page and a villager who mentions it, not a bigger payout. Paying for notes would be the expected-reward pattern the research warns against, and would invite one-word notes.
- **Materials come only from real quests.** Chests, locks and troubles never give materials, so "this wing was built from your reading" stays true.
- **A grown-up completing a quest for the child still mints its materials.** The work was done, which matches how earned minutes behave today.
- **Materials stay earned.** Undoing a completion doesn't remove them, and redoing it doesn't mint twice (once per assignment, as with minutes).
- **The Chronicle lives in the Keep's great hall** (the castle interior exists from the start), so it's never locked behind an unbuilt building.
- **Hands-on puzzles are DOM/SVG work surfaces dressed as the in-world object** (the carpenter's bench, the rune stone, the lock's face). The *world* reacts in 3D: the beam goes up on the site, the door opens, the rune lights. Dragging pieces in 3D on a tablet is costly and fragile, and research found simple visuals do as well. The same surfaces run in the Realm's boards and on the Side Quests page, so one implementation serves every place (DRY). The gate board stays multiple choice.
- **Reading trails are answered by going somewhere.** The answer to a clue is a place or object in the world, chosen by walking to it and interacting.
- **Rune words *are* the spells' effects.** A broken cart wants a word that means *mend*; the word expected scales by grade (fix → mend → repair → restore). The existing parts-based spellbook is unchanged; rune spellcraft is a separate verb with its own objects.
- **Science deeds use sorting locks** ("sort these into living / non-living"), since no science-specific mechanic was chosen.

### Calls settled after the builder check

- **Trails and runes are "walking runs" in the world, and picture runs off it** (§4.10). In the Realm, the villager's board closes and the run stays open while the child walks. Off-world (the Side Quests page), the same task is answered on a picture: tap the place on a village map, or build the word beside a picture of the object. The gate board stays multiple choice only.
- **Only side quests and challenges pay minutes, as today.** Build runs, riddle stones, quick review, world locks and the Puzzle Tower pay no minutes (§4.10), so the earning-time rules are untouched.
- **Stateful world objects cycle.** A mended cart breaks again after a few days and wants a fresh word; a chest refills with a new lock each week. Doors and map fragments open once. Rune and lock deeds therefore always have something to act on (§4.5, §4.7).
- **Skill selection stays about the child, not the mechanic.** A run mixes kinds. A measure deed presents each chosen skill on the bench when it can, and as `choice` when it can't. Slice 2 ships when at least two skills per grade K–12 have bench generators (§4.3).
- **New content credits real skill ids.** New `SKILLS` rows are added where the content needs them (`read-g6`, `read-g9`, `spell-g1`, and the `logic` rows); nothing is mapped onto an id whose content differs. **History is not added as an area** in this programme, so sort pools cover science and vocabulary only (§4.5).
- **Slice 3 builds the record-of-the-work core rules** (slice 13's D13.1–D13.5: distinct-deed progress, per-deed done marks, "Raised by" on core buildings), since plaques and the Chronicle are the same feature. The original §4.3 claim that D13 "applies unchanged" was wrong: it is unbuilt.
- **A measure deed at a finished building builds a repair**: a short-lived scaffold where a beam is replaced. The child still sees each solved task place a piece, and the run counts as practice (D13.2).
- **`logic` is a new `SkillArea`** with spell school `none`. It uses the child's grade with no per-strand offset column. A grown-up can pick it as a focus skill, and it appears on the Side Quests page and in parent reports like the other areas.
- **The Puzzle Tower has one floor per band.** A floor opens when the child earns 3 stars on any lock deed at that band.

---

## 3. Goals, non-goals, anti-goals

**Goals**
- A child who finishes a real quest sees, right then, what it adds to their kingdom, and wants to go put it there.
- The Realm visibly records the year's real schoolwork: wings, plaques and a Chronicle that name the quests that built them.
- In the Realm, using a skill *is* the action: measuring builds, reading navigates, spelling casts, reasoning unlocks.
- Every mechanic works from K to 12 by drawing on the existing skill catalog and mastery levels.
- A new mechanic, material, improvement or content pool is a catalog entry plus its pure rules, never a fork of the run flow.

**Non-goals**
- Changing how minutes are earned, spent, capped or carried (the earning-time round stands).
- Photos, voice, file uploads or any new storage service.
- Parent-authored questions or unit story arcs (a later round; focus skills come first).
- Multiplayer or sibling co-op (still async, single-player).
- New monetisation of any kind.

**Anti-goals**
- **School as a toll:** nothing new is locked behind materials; the core kingdom always rises from side quests.
- **Paying for volume:** no reward for re-playing mastered items, and no bonus for longer notes.
- **Streak loss:** no streaks or meters that decay or punish a missed day.
- **Dark patterns:** no locked cosmetics dangled as bait, no countdown pressure, no guilt copy. A child is never told they are "behind".
- **Client-trusted outcomes:** a forged request must never mint materials, build an improvement, or mark a puzzle solved.
- **A mechanic where the fun survives without the skill** (the Habgood test). If the math can be removed and the game still works, the math is bolted on.

---

## 4. The design

### 4.1 The shared framework: tasks of any kind (slice 1)

Today a run (`deed_run`) holds `Question[]`, which only supports multiple choice. It becomes a list of **tasks**, each with a kind.

```ts
type TaskKind = "choice" | "measure" | "trail" | "rune" | "lock";   // closed union, one registry entry each

type Task<K extends TaskKind = TaskKind> = {
  id: string; skillId: string; kind: K;
  view: TaskView[K];          // what the browser may see
  secret: TaskSecret[K];      // the solution: server only, never serialized to the client
  readAloud?: string;
  explain?: string;           // worked solution / notation bridge; released once the task is resolved
};

interface TaskKindDef<K extends TaskKind> {
  kind: K;
  /** Skills this kind can present, with the generator for each (grade comes from the skill). */
  generators: Partial<Record<SkillId, TaskGenerator<K>>>;
  /** Strict validation of an untrusted response (shape, sizes, ranges). Rejects, never coerces. */
  parseResponse(raw: unknown, task: Task<K>): Response[K] | null;
  /** Pure, server-side. Never reveals the solution in `feedback`. */
  check(task: Task<K>, response: Response[K]): { correct: boolean; feedback?: FeedbackCode };
}
```

- **`choice` is today's `Question`, unchanged.** A stored run without `kind` reads as `choice` (lenient read), so open runs and history keep working with no data migration.
- **Scoring, stars, second chances, mastery and review stay kind-agnostic.** They consume "right first time / right on the second try / missed" per task, exactly as now (`deed-scoring.ts`, `mastery.ts`, `review-schedule.ts`). One flow (`deed-run-flow.ts`, `use-deed-flow.ts`) drives every kind. Kind-specific code lives only in the registry entry and its presenter.
- **Presenters:** `TASK_PRESENTERS: Record<TaskKind, Component>` (client). Each is a DOM/SVG work surface that takes `view` and emits a response. The run player picks the presenter by kind, so `DeedBoard`, `GateQuestBoard` and `DeedPlayer` gain every new kind for free.
- **Typed answers:** one shared `parseAnswer` utility (integers, decimals, fractions, mixed numbers, simple expressions; equivalent forms compare equal; tolerance per task) used by every kind that takes a typed value.
- **Feedback codes, not strings,** from `check` (e.g. `too_long`, `too_short`, `wrong_piece`, `rule_broken`), turned into copy on the client. Second-chance hints stay conceptual and never give the answer.
- **Run kinds:** `RUN_EFFECTS` (`deed-scoring.ts`) gains `build`, `review`, `world` and `tower`, which are covered in §4.10. Each run kind states `raisesBuilding / earnsStars / movesMastery / countsForSchool / feedsReview / allowsSecondChances / paysMinutes`.
- **Run ownership:** `deed_run.deed_id` becomes nullable. The run's type is the existing `deed_run.kind` (`deed`, `challenge`, `review`; later `build`, `world`, `tower`), and a nullable text column `source_ref` says what owns it: a place id, an improvement id plus level, or an object id.
  - Existing rows are unchanged: `kind` stays what it was and `source_ref` is null.
- **Deeds name a mechanic:** `Deed.mechanic: TaskKind`. Runs may mix kinds: each chosen skill is presented with the deed's mechanic if that mechanic can present it, otherwise as `choice`. A run is never empty.
- **Worked example first for young players:** each kind declares `demo(view)`. For grades K–3, the first task of a kind a child has never seen opens with a short "watch Aldo do one" demo. Older children start straight in, with the worked solution after a miss.
- **Pace guard (anti-gaming):** a pure rule spots fast wrong-answer bursts (for example, 3 misses in under 10 s). The response is a gentle line from the squire and a hint shown up front. No penalty, and it is never logged against the child.
- **Mechanic toggles:** a grown-up can turn any hands-on kind off per child (a dyslexic child might start without runes, for example). A turned-off kind falls back to `choice`.

### 4.2 Focus skills (slice 1)

- Table `learning_focus (id, child_id, skill_id, created_at)`, unique `(child_id, skill_id)`, **at most 3 per child** (enforced on write).
- Set in the learning profile panel from the skill catalog, filtered to the child's grades for that area plus or minus one. Grown-ups only.
- `selectSkills` (`deed-engine.ts`) gives focus skills a configurable weight boost (`FOCUS_WEIGHT`). Mastery and review still apply, so a mastered focus skill isn't drilled forever.
- Mechanics that can present a focus skill are preferred when the objective beacon suggests the next thing to do.
- Unknown or retired skill ids are ignored on read (lenient) and rejected on write (strict).

### 4.3 Building by measuring (slice 2, the first mechanic)

**The idea:** a construction site's stages (`site-stages.ts`: footing → sills and posts → plates and braces → roof frame) are placed *by* measuring. Carpenter Aldo's bench is the work surface. Solve it, and that piece goes up on the site in 3D.

- **Two interactions,** both on an SVG bench:
  - **Assemble:** pick pieces whose lengths combine to a marked target (counting, addition, fractions with like and unlike denominators).
  - **Cut:** enter or choose the length to cut (a typed value via `parseAnswer`, or a cut mark dragged on a ruler).
- **Grade scaling through the existing skills** (a generator per skill id; level 0–4 from mastery sets the number sizes):

| Grades | Skills used (existing ids) | On the bench |
|---|---|---|
| K–1 | `count-seq`, `compare-num`, `add-10`, `add-20` | unit blocks; pick planks that reach the mark; which beam is longer |
| 2 | `add-100`, `sub-100`, `skip-count` | lengths in feet; combine and trim to the mark |
| 3 | `area-perimeter`, `frac-unit`, `mul-facts` | stones round the footing (perimeter); cut a beam into quarters; rows × columns of flagstones |
| 4 | `frac-equiv`, `mul-multi`, `factors` | equivalent cuts (2/4 = 1/2); arrange N stones in a rectangle |
| 5 | `frac-addsub`, `frac-mul`, `volume-prism`, `dec-ops` | ½ + ¼ planks; stone blocks for a volume; decimal lengths |
| 6–7 | `ratio-rate`, `percent-of`, `proportion`, `circle-measure`, `two-step-eq` | mortar mix ratios; scale a plan to the site; the well's ring |
| 8 | `pythagorean`, `slope`, `linear-eq` | the brace length; roof pitch |
| 9–12 | `similar-tri`, `trig-ratios`, `solid-measure`, `systems-eq`, `quad-formula` | the tower's height from its shadow; rafter angle; two plank sizes to fill a span |

  A skill without a bench generator presents as `choice` inside the same run, as today. Some skills can never be measured on a bench, such as `time-clock` and `money-coins`. Coverage grows by adding generators, with no other change.
- **Selection is unchanged:** `selectSkills` still chooses by grade, mastery, focus and review, never by what the bench supports.
  - **Ship bar for slice 2:** at least two bench skills per grade from K to 12.
  - **Goal:** every math skill that has a length, area, volume, ratio or equation reading.
- **The notation bridge:** every solved task ends with its sum written out ("You joined ½ + ¼ = ¾ of a beam"), from the task's own numbers. The worked solution after a miss uses the same text.
- **Math deeds become measure deeds** (`Deed.mechanic = "measure"`). A counted run advances the building as today; slice 3 changes that rule to distinct deeds. Within a run, each solved bench task visibly places a piece.
- **At a finished building**, the bench works on a short-lived repair scaffold (a beam being replaced). Pieces still go up, and the run is practice.
- Aldo's bench is also used to build improvements (§4.4).

### 4.4 Real work in the world: materials, improvements, the Chronicle (slice 3)

**Materials**
- Catalog `MATERIALS` (code, ids never reused): `stone` (math), `ink` (reading, language, writing), `herbs` (science), `thread` (history, social studies, geography), `dye` (art, music), `timber` (anything else: PE, life skills, a language, piano). Each entry has a label, icon, colour and a 3D stockpile model.
- `subject.material` column, defaulted from the subject's name the way `spellSchool` is (`defaultMaterialForSubject`), and changeable by a grown-up in the same subject settings row.
- Ledger table `realm_material (id, child_id, material_id, amount, kind: "earned" | "spent", source_assignment_id, improvement_id, created_at)`.
  - Partial unique index on `source_assignment_id` where `kind = 'earned'`, so each assignment mints once.
  - The balance per material is `sum(earned) − sum(spent)` through a pure `materialBalance(rows)`.
- **Minting:** `completeAssignment` calls `grantMaterialsForCompletion` right beside `grantEarnedMinutesForCompletion`. It is the same pattern: server-side, once per assignment, under the child's write transaction, amount = `materialsPerQuest` setting (default 1; 0 turns materials off).
- **The welcome delivery (one time):** materials are minted for quests completed in the 28 days before launch.
  - It goes through the same `grantMaterialsForCompletion` rule, so amounts and the unique index match a live completion.
  - It runs as an idempotent script (`npm run db:welcome-materials`) on production after the slice-3 migration. Assignments that already have an `earned` row are skipped, so running it twice is a no-op.
  - The child's first Realm visit afterwards shows it as one delivery card ("The carts arrived with four weeks of your work").
- **The pull:**
  - The quest card's completion moment says what the quest made and where it can go: "+1 Ink · the Library's Reading Wing needs 3 more", with a "Take it to the Realm" link.
  - The Tavern (home) shows the kingdom's current plan and its progress.

**Improvements**
- Catalog `IMPROVEMENTS` (code, ids never reused): `{ id, label, attachesTo: buildingId | "village" | "keep", levels: [{ cost: Partial<Record<MaterialId, number>>, pieces: PieceSpec }] }`.
  - Up to 3 levels each, so an improvement keeps growing through the year.
  - `pieces` is pure box data in the host's frame, like `site-stages.ts`, and tested the same way.
  - First catalog: one wing or upgrade per building, a Chronicle hall level for the Keep, and four village decorations (banners, lamps, a fountain, a statue).
  - Costs are tuned so a typical week of quests (about 20) completes one to two levels. Adding more is catalog work only.
- **The child chooses what to build** (autonomy): a "Kingdom plans" board in the Keep (and on the Tavern) lists what's affordable and what's close. One plan can be pinned, and the objective beacon points to it.
- **Building one** is a short `build` run (3 measure tasks) at Aldo's bench.
  - On completion the server checks the balance and the cost from the catalog, then writes the `spent` rows and the improvement level, all in one locked write transaction.
  - It is idempotent: unique `(child_id, improvement_id, level)`.
  - Build runs move mastery and earn stars, but never pay minutes and never raise core buildings (`RUN_EFFECTS.build`).
- Table `realm_improvement (id, child_id, improvement_id, level, season_id, sources, built_at)`. `sources` is a JSON snapshot of the quests whose materials were spent (title, subject, date; oldest earned first), capped at 12 entries.
- **The plaque:** every improvement carries one, e.g. "Reading Wing · built by Nasrin · 2026–27 · from: *Charlotte's Web ch. 3*, *Library book report*, …".
- **Slice 3 also builds slice 13's core rules for core buildings** (`2026-09-10-realm-record-of-the-work-design.md` D13.1–D13.5):
  - explicit `deedsToBuild` per building;
  - progress counts distinct completed deeds;
  - `deeds_done` becomes a lifetime counter;
  - once raised, always raised;
  - per-deed done marks;
  - "Raised by {name} · {season}" on the finished building.
  - Renaming and retiring a hero follow slice 13's stated rules.
- **The stockpile:** unspent materials stand by the Keep as heaps of stone, ink barrels, herb baskets and so on, sized by balance (a few discrete sizes). Even unspent work is visible.
- **The delivery:** on entering the Realm after quests were finished, a short arrival card names what came in and from which quest ("2 Stone from *Fractions p.12* and *Times tables*"). Shown once per batch; skippable.

**The Chronicle (Scribe's Notes, grown)**
- Builds on what exists: `quest_assignment.notes` (Scribe's Notes) and `quest.requireNotes` ("parent can require" is already the per-quest switch). New: `quest_assignment.drawing`, a small JSON stroke document.
  - Strict schema: at most 40 strokes and 2,000 points in total; integer coordinates in a fixed 320×240 box; colours from a fixed 8-swatch palette; widths from a fixed set; under 32 KB.
  - Rendered only by our own SVG and canvas code. No client-supplied SVG or HTML is ever stored or injected.
- The drawing pad sits beside the notes field on the quest card. It is touch-first and works for K–1 children who can't type yet.
- **The Chronicle hall** is in the Keep. It is a book of entries by week (quest title, subject and material colour, note, drawing), with drawings also hung as framed pictures on the hall's walls (rasterized to a canvas texture). A grown-up can press a **seal** on an entry (one of 6 short praise phrases or a 60-character note). That is informational, relatedness feedback, and it shows in the Chronicle.
- **Villagers notice:** each villager gains data-driven `mentions` lines keyed by material (the librarian by ink, the gardener by herbs, …), filled from the last 7 days of finished quests: "I hear you finished *Volcanoes, part 2*. Tell me what you learned sometime!" A pure picker chooses at most one mention per visit, never repeats the same quest twice in a day, and falls back to the normal greeting.

**Minutes, quieter**
- The Realm HUD's clock becomes a small secondary chip; the primary HUD area shows the satchel (materials) and the pinned plan.
- Gate and pause copy keep the earning lines (`earningLines`) but lead with the kingdom ("Your quests bring materials to build with"). The quests page continues to show no minutes, unless a grown-up turns on `showMinutesOnQuests` (default off).
- No change to how minutes are earned, spent, banked or capped.

### 4.5 Logic locks (slice 4)

- **Locks sit on chests, doors and gates** placed by catalog in the world and in rooms. A lock's face is the work surface; solving it opens the object in 3D.
- **Puzzle kinds (pure, seeded generators; checked against constraints, not a stored answer, so every valid solution counts):**
  - K–1: pattern completion (AB AB ?), sort by one attribute.
  - Grades 2–4: 3×3 shape grids, balance scales, sort by two attributes.
  - Grades 5–8: 4×4 KenKen-style cages, small logic-grid deductions.
  - Grades 9–12: 5×5 cages, small nonograms, constraint puzzles.
  - The size is set by grade and mastery of the child's `logic` skill.
  - `logic` is a new `SkillArea` with one `SKILLS` row per band (`logic-k1` … `logic-g912`), so mastery and review work unchanged.
  - **Its reach:** spell school `none`; the child's grade with no per-strand offset (offsets become a `Partial` record); pickable as a focus skill; shown on the Side Quests page and in parent reports like the other areas.
- **Sorting locks carry subject content:** science (living / non-living, conductors / insulators) and vocabulary (synonyms / antonyms).
  - Each sort pool credits an existing skill id (`science-*`, `vocab-*`).
  - Content goes in new validated pools `src/content/sorts/*.json` by band, using the existing pool validator and blind-pass process.
- **Objects cycle:**
  - A chest refills with a new lock each week (`resetAfterDays` in the object catalog).
  - Doors and map fragments open once.
  - `realm_world_state` records the state and when it was last changed. A pure rule reads "is it locked again yet?" from that and the catalog.
- **Science deeds become sorting-lock deeds** (`Deed.mechanic = "lock"`).
- **What locks open:** decorations to place, lore pages for the Chronicle, map fragments that reveal places (`realm_place_found`), and rooms. **Never materials** (§2a).
- **The Puzzle Tower** (from playability §9): a building of hard, unscored bonus locks (Beast Academy's trophy problem).
  - It has one floor per band; a floor opens after 3 stars on any lock deed at that band.
  - It pays nothing and moves nothing but the child's own tower record. It's for the joy of it.

### 4.6 Reading clue trails (slice 5)

- **A trail** is 2–4 short clue texts at the child's reading level, found on signboards, letters from villagers and notes in rooms. Each clue's answer is **a place or object in the world**, chosen by walking to it and interacting. Reading *is* the navigation.
- **Content:** validated JSON pools `src/content/trails/*.json` per band (k1, g23, g45, g68, g912).
  - Each clue references world anchors by id (`landmark:mill`, `place:longwater`, `object:three-marked-stone`), never raw coordinates, so trails survive layout changes. A test asserts that every referenced anchor exists.
  - Comprehension is built into the clue: literal at k1–g23, inference and vocabulary-in-context at g45 and up, and multi-clue synthesis at g68 and up. A wrong choice leads somewhere with a gentle redirect line, not a red X.
- **Narration** (`readAloud`, the existing speech path) for k1 and on request at any band.
- `trail` is a task kind. A trail run is an ordinary deed run whose tasks are clues; the response is an anchor id, checked server-side. Reading deeds become trail deeds (`Deed.mechanic = "trail"`). In the world it is a walking run, and off-world a picture run (§4.10).
- **Skill ids:** trail pools credit the existing reading ids for k1–g45 (`read-g1`, `read-g3`, `read-g4`) and two new rows, `read-g6` and `read-g9`, for the bands reading lacks today.
- The existing reading pools (`read-g1`, `read-g3`, `read-g4`, sight words) stay as `choice` review.

### 4.7 Rune spellcraft (slice 6)

- **Rune objects in the world** each want an effect: a broken cart (mend), a dark lamp (light), a dry bed (water), a stuck gate (open), a wilted tree (grow).
- **The child builds the word from rune tiles at the rune stone,** then casts it at the object. A correct word *is* the effect (cart mended, lamp lit). Each fixed object stays fixed and is recorded per child.
- **Grade scaling** (catalog `RUNE_WORDS`: effect × band → accepted words, tile sets, definitions):
  - K–1: letter tiles, picture plus spoken prompt (fix, lit, dig).
  - Grades 2–3: phonogram tiles (m-e-n-d, l-igh-t).
  - Grades 4–5: spelling-pool words (repair, water).
  - Grades 6–8: morphemes, i.e. prefix + root + suffix from a definition (re-store, il-lumin-ate).
  - Grades 9–12: Greek and Latin roots from a definition (re-habilit-ate, ir-rig-ate).
  - Tiles include distractors. Content is validated JSON (`src/content/runes/*.json`) with the pool validator.
- `rune` is a task kind. Language deeds become rune deeds (`Deed.mechanic = "rune"`). Spelling and vocabulary pools stay as `choice` review.
- **In the world it is a walking run:** the villager names two or three rune objects nearby, and interacting with each one opens the rune stone surface for its word. Off-world, the object is shown as a picture (§4.10).
- **Objects cycle:** a fixed object breaks again after a few days (`resetAfterDays` in the catalog, recorded in `realm_world_state`) and then wants a fresh word, so a rune deed always has something to mend. The launch catalog has at least 12 rune objects across the village and the named places.
- **Skill ids:** rune words credit existing language ids by band (`lang-gk`, `spell-g23`, `lang-g3`, `spell-g45`, `vocab-g45`, `vocab-g68`, `vocab-g912`) plus one new row, `spell-g1`, because `lang-g1` ("Sentences and word kinds") is not spelling.
- This is separate from the parts-based spellbook (element / form / modifier), which is unchanged.

### 4.8 Multiple choice's new home (slices 1 and 4)

- **The gate board** (quiet world) stays multiple choice, short and fast.
- **Riddle stones** (playability §9) at the 5 named places: a 3-task interleaved review set from skills due for review (`review-schedule.ts`), mixing areas on purpose.
  - They are `review` runs: they move mastery and feed review, and pay no minutes and no deed stars.
  - The stone glows when something is due.
- **The Side Quests page** keeps its picker. Each deed runs with its mechanic's presenter (the same DOM surfaces), plus a "Quick review" button that starts a `choice` review run.

### 4.9 Settings (all lenient-read / strict-write, `realm-settings.ts` pattern)

| Setting | Where | Default | Range |
|---|---|---|---|
| `materialsPerQuest` | realm settings | 1 | 0–3 (0 = materials off) |
| `showMinutesOnQuests` | realm settings | false | bool |
| `mechanics` | realm settings (JSON) | all on | one bool per hands-on `TaskKind`; keys come from the registry, so a new kind gets a toggle automatically |
| `subject.material` | subject row | from name | `MATERIALS` ids |
| focus skills | `learning_focus` | none | up to 3 skill ids |
| `quest.requireNotes` | quest (exists) | false | bool; label becomes "Ask for Scribe's Notes or a drawing" |

### 4.10 Runs: where they're played and what they earn

**Where each task kind is played**

| Task kind | In the Realm | Off-world (Side Quests page) | Gate board |
|---|---|---|---|
| `choice` | villager board (overlay) | page player | yes (its only kind) |
| `measure` | Aldo's bench overlay; pieces go up on the 3D site | same bench surface | no |
| `lock` | the lock's face overlay on a chest, door or gate; it opens in 3D | same lock surface | no |
| `trail` | **walking run:** the board closes, a small HUD tracker shows the current clue, and the child walks to the answer and interacts with it | **picture run:** tap the answer on a village map image showing the same anchors | no |
| `rune` | **walking run:** interact with each named rune object to open the rune stone for its word; the effect plays in 3D | **picture run:** build the word beside a picture of the object | no |

- **A walking run is an ordinary open run.** It has no new lifetime rules: the existing 1-hour resume window applies, a run can be resumed from the villager or the tracker, and it ends like any run.
- **Play time is charged while the child walks**, as for any play. In the quiet world nothing is charged.
- **Interacting with an anchor or object** sends `{ runId, taskIndex, anchorId }` to the same answer action as every other kind. The presenter registry has an in-world and an off-world entry for these two kinds, both producing the same response type, so the server never knows or cares which one was used.

**What each run earns**

| Run (`source.type`) | Deed stars | Minutes | Mastery | Review | Raises building | Notes |
|---|---|---|---|---|---|---|
| `deed` (side quest, any mechanic) | yes | yes, by stars, as today | yes | yes | yes | unchanged rules |
| `deed` + `challenge` | no | no | no | no | no | unchanged (Crown Challenge) |
| `build` (improvement) | no (stars shown on the plaque) | **no** | yes | yes | no | completes the improvement level |
| `review` (riddle stone, quick review) | no | **no** | yes | yes | no | interleaved, due skills |
| `world` (chest or door lock, rune object outside a deed) | no | **no** | yes | yes | no | opens or fixes the object |
| `tower` (Puzzle Tower) | no | **no** | no | no | no | tower record only |

Minutes are still earned only by side quests (as today), real quests, the daily allowance and the trouble bounty. **No new way to earn minutes is added.**

---

## 5. Data and security

- **New tables:** `learning_focus`, `realm_material`, `realm_improvement`, plus per-child records for fixed rune objects and opened locks (`realm_world_state (child_id, object_id, state, updated_at)`, unique `(child_id, object_id)`, one generic table for every stateful world object instead of a table per mechanic).
- **New columns:** `subject.material`, `quest_assignment.drawing`, `realm_settings.materials_per_quest`, `realm_settings.show_minutes_on_quests`, `realm_settings.mechanics`, `deed_run.source_ref` (nullable text). `deed_run.deed_id` becomes nullable (drizzle generates an `ALTER COLUMN`), and the migration is tested on the production backup copy like every migration.
- **Migrations:** one per slice via `db:generate` / `db:migrate`, tested on a copy of the latest production backup before merging to `main` (as done for 0037).
- **Every write is authorized with `requireChildAccess(childId, { write })`.**
  - Children act only for themselves.
  - Minting happens only inside `completeAssignment`.
  - Improvement builds, world-object state and focus skills each have one narrow action. Focus skills are grown-up only. Builds and world state are child-only (`isChildActor`), as with Realm runs today.
- **Solutions never leave the server** before a task is resolved, as with `Question.answer` today. `explain` is released after resolution.
- **Every response passes the kind's `parseResponse`** (shape, size and range) before `check`. Typed answers are capped in length, and drawings are validated as in §4.4.
- **Ledger writes that read-then-write** (spending materials, build completion) run in `withChildLock`. Unique indexes stand behind once-per-assignment minting, once-per-level builds and once-per-object state.
- **The server's day** (`realmNow`) dates everything, as in the earning-time round.
- **Text a child types is rendered as text,** never as HTML. Quest titles in plaques and villager lines come from the family's own data.

## 6. Architecture rules this follows

- **Pure rules** in `src/lib/utils/*`, `src/lib/realm/*`, `src/lib/realm3d/*`, with tests written first. Generators are seeded (no `Math.random` or `Date.now`).
- **Services** are database access with no auth. **Actions** are thin: authorize → load → pure rule → write.
- **Registries are typed `Record`s keyed by closed unions:** `TASK_KINDS`, `TASK_PRESENTERS`, `MATERIALS`, `IMPROVEMENTS`, `RUNE_WORDS`, `RUN_EFFECTS`. A new entry makes the compiler point at every place that must handle it (open/closed). Content is JSON with validators and blind-pass checks.
- **The `.superpowers/realm-rules.md` binding rules apply:** edits to `realm-game.tsx`, `spike-scene.tsx`, `frame-hud.tsx`, `hud.tsx` and `hud-bus.ts` are additive only, with new UI in new files; per-frame values go through `HudBus`.
- **Real-database tests** (`*-db.test.ts`, `src/test/libsql-test-db.ts`) for once-only minting under two concurrent completions, spending under concurrent builds, and focus-skill limits.

## 7. Success looks like

- After finishing a quest, a child sees what it made and where it goes, and opens the Realm to put it there.
- Over a month, the kingdom shows wings, plaques and Chronicle pages a parent can point at and say "that's from your reading".
- In the Realm, the child measures to build, reads to find, spells to cast and reasons to unlock. The Habgood test passes for each mechanic.
- Every mechanic serves K and grade 12 from the same code, with difficulty from the skill catalog and mastery.
- Adding a sixth mechanic, a new material or ten new improvements touches catalogs and one presenter, not the run flow.

## 8. Slices and order

| # | Slice | Contains | Depends on |
|---|---|---|---|
| 1 | **Task framework and focus skills** | `TaskKind` registry with `choice` as the first kind; presenter registry; `parseAnswer`; feedback codes; demo-first and pace-guard rules; `Deed.mechanic`; mechanic toggles; `learning_focus` and engine weighting; riddle stones and quick review. No change in what a child sees except focus and riddle stones. | — |
| 2 | **Building by measuring** | `measure` kind with bench generators per skill, the bench presenter, site pieces placed per solved task, notation bridge, math deeds → measure. | 1 |
| 3 | **Real work in the world** | Materials (catalog, subject mapping, ledger, minting), quest-card and Tavern pull, improvements and build runs, plaques, stockpile, delivery card, Chronicle hall with drawings and seals, villager mentions, minutes quieter. | 1, 2 |
| 4 | **Logic locks** | `lock` kind (pattern, grid, cage, sort), `logic` skills, sort pools, locks on chests/doors/gates, `realm_world_state`, science deeds → lock, Puzzle Tower. | 1 |
| 5 | **Reading clue trails** | `trail` kind, world anchors, trail pools per band, narration, reading deeds → trail. | 1, 4 (`realm_world_state`) |
| 6 | **Rune spellcraft** | `rune` kind, rune stone presenter, rune objects, `RUNE_WORDS` pools, language deeds → rune. | 1, 4 |

Each slice ships on its own branch, merges into `dev` when green, and leaves the app fully working. A slice whose mechanic is turned off falls back to `choice`.

## 9. Left to the builder

- Exact copy, colours, icons and 3D piece geometry for materials, improvements, stockpiles, locks and rune objects (keep to the low-poly box style).
- Exact cost numbers and focus weight (start from §4.4's "about a week of quests per one or two levels", and expose them as constants).
- The pace-guard thresholds, demo scripts and feedback-code copy.
- How many trail, rune and sort items to author per band for launch (at least enough for a week of daily play per band without repeats).
- Splitting `src/lib/actions/deeds.ts` (a playability §11 follow-up) when slice 1 touches it.
