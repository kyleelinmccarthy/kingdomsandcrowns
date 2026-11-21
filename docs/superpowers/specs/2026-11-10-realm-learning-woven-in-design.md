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
- **The Chronicle lives in the keep yard** (open ground beside the castle, reachable from day one), so it's never locked behind an unbuilt building. The great hall is reachable only once the castle is unlocked (level 50 or a castle row), so it can't be the early home for the plans board or the Chronicle (R-D1).
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

### Calls settled for slice 2 (2026-11-10)

- **R-C1: pieces show on the bench, not live in 3D.** The bench carries its own small SVG elevation and each solved task drops the next piece in; the 3D site advances when the board closes, through the existing hand-up/`raise` path.
- **R-C2: no dragging.** Assemble is tapping pieces to toggle them; cut is a typed length with − / + steppers and a ruler drawing.
- **R-C3: two bench skills per grade K–12** (named in the plan's Part C); any other math skill stays `choice` inside the same run.
- **R-C4: the gate stays multiple choice.** `startDeedRun` gains a `"gate"` context with no enabled kinds, passed in by the gate board.
- **R-C5: a client-safe codec per kind** (`TASK_CODECS`), separate from the server-only drawing; presenters encode a response, so the stored-string contract is unchanged.
- **R-C6: misses respect the kind.** A miss is re-asked only if its kind is still the one its skill would be played with; review runs re-ask only `choice` misses.
- **R-C7: rollback safety.** `loadRecentMisses` skips a stored task of an unregistered kind, and `parseRun` refuses one clearly (deploys are forward-only).
- **R-C8: the notation bridge is sent on success.** A right answer carries the kind's `bridge(t)` when it defines one; choice has none, so choice runs read as today.
- **R-C9: demo-first is decided by run history.** K–3 heroes see one worked example per mode before their first measure task, until a measure task appears in one of their completed runs.
- **R-C10: the bench ignores `numerals`** and is titled "The bench"; Aldo appears only in the demo, so all eight math deeds read naturally.

### Calls settled for slice 3 (2026-11-19)

- **R-D1: there is no Keep at the start, so slice 3 builds a keep yard.** The great hall is `RoomKind "castle"`, reachable only once the castle is unlocked. The yard is open ground beside `CASTLE_POSITION`, drawn even while the castle is locked. It holds the plans board, the stockpile, the Chronicle Hall improvement and (in 3b) the Scribe's lectern, all reachable from day one. The great hall is untouched.
- **R-D2: minting is guarded by the database and never fails a quest.** `grantMaterialsForCompletion` runs before the minutes grant, inside `try/catch`, and inserts under `withChildLock` with `onConflictDoNothing` against a partial unique index on `realm_material(source_assignment_id) WHERE kind = 'earned'`. It mints whenever `materialsPerQuest > 0`, whatever `enabled` or `accessMode` say: materials record work; they are not play time. The welcome script re-runs safely, so it doubles as the repair tool.
- **R-D3: `subject.material` is nullable, and null means "from the name".** `resolveMaterial` returns the stored id when valid, else `defaultMaterialForSubject(name)`. No backfill, and a renamed subject follows its new name until a grown-up picks a material.
- **R-D4: timber is the wildcard.** Catalog costs use stone, ink, herbs, thread and dye only; a shortfall in any material is paid from timber when spending (`allocateSpend`). PE, life skills and music lessons still build the kingdom.
- **R-D5: an improvement on a building is offered once its host is raised.** Village and keep-yard improvements are always offered. Levels go in order: level n+1 is offered once level n is built.
- **R-D6: a build run is 3 tasks on the bench, started from the plans board.** Skills are the hero's two bench skills for their math grade, drawn 2 + 1; the measure toggle off means the same skills as `choice`. The level is built on completion whatever the stars, and the stars go on the plaque. A build run never raises a building or pays minutes; it earns stars, moves mastery, feeds review and allows second chances. K–3 heroes get Aldo's demo under the same rule as deed runs, and the bench draws the improvement's own boxes through `RunStart.plan`.
- **R-D7: spending is one locked transaction, idempotent by a unique index.** `finishBuild` runs in `withChildLock`: read the ledger, `allocateSpend`, write nothing if short, insert `realm_improvement` with `onConflictDoNothing` on `(child_id, improvement_id, level)`, and only when that insert wins write the `spent` rows. `sources` is the FIFO list of quests whose earned materials paid for it, oldest first, capped at 12.
- **R-D8: slice 3 builds the record-of-the-work rules it needs.** In scope: D13.1–D13.5, D13.6 (announced in the world, not on the page), D13.7–D13.9 ("Raised by" snapshot, no name backfill) and D13.15 (a parent's preview writes nothing). Out of scope: D13.10–D13.14 and D13.16. `deeds_done` counts every completed `deed` run at the site, any stars; "distinct completed" means a deed of the building's current list with best stars of at least 1 on a `deed` run. The retro-completion data migration filters on `kind = 'deed' AND stars >= 1`, which fixes the spec SQL that omitted it, and the completion write becomes a conditional `UPDATE … WHERE completed_at IS NULL`. `child.banishedAt` exists (this spec said there is no retired flag); rule D13.8 holds unchanged.
- **R-D9: the delivery card shows earned rows created after `realm_settings.delivery_seen_at`.** Null means everything. Rows the welcome script minted get the welcome copy. Dismissing it sends the newest `created_at` shown, and the server clamps it to now. Order on entry: welcome (first visit ever), then delivery, then the season ceremony.
- **R-D10: the beacon points to the plans board only while the pinned plan is affordable.** Otherwise it leads to the core objective, as today. Its goal id is `plan:<improvementId>`, so it can never equal a villager id.
- **R-D11: building happens in the Realm.** The Tavern card shows plans, progress and a pin, and links to the Realm. This is the pull the owner asked for.
- **R-D12 (slice 3b): drawings are required "or".** With `requireNotes` on, a quest completes with meaningful notes or a valid drawing. The quest form's label becomes "Ask for Scribe's Notes or a drawing".

### Calls settled for slice 4 (2026-11-20)

The owner's answers:
- **Logic is practised on world locks, the Puzzle Tower and a "Puzzle practice" button.** It gets no new side quests.
- **Decorations from chests appear at set spots.**
- **This slice has chests, vault doors and the Tower.** Gates and locked rooms wait.
- **Slice 4 ships as two branches.** 4a (`realm-locks`: the lock kind, its puzzles, sort pools, science deeds as locks, Puzzle practice) merges on passing; 4b (`realm-world-locks`: world state, chests, vault doors, the Tower) needs the owner's word.

The builder's calls:
- **R-F1: a lock is checked against its rules, never against a stored answer.** `isCorrect` checks the response against the puzzle's constraints, so every valid solution counts. Each task also stores one `solution`, server-only, for the reveal after a miss.
- **R-F2: the reveal after a miss is the solved board.** `AttemptResult.reveal` carries the stored solution in the lock codec's form, sent only once the task is resolved and missed; the presenter draws it. `answerText` stays one short sentence, "Here is one way it fits.", for read-aloud and the text line.
- **R-F3: rule highlighting happens on the client, from the visible puzzle.** Cages, clues and run counts are part of the view by nature, so the surface marks a broken rule without the server revealing anything. A sort's bins are its answer, so only the server can fault a sorted item. `FeedbackCode` gains `rule_broken` ("Something doesn't fit yet. Look at the marked rule.") and `incomplete` ("There are empty spaces left.").
- **R-F4: puzzles by band**, sized by grade and `logic` mastery: K–1 `pattern` and `sort1`; 2–4 `shapes3`, `balance` and `sort2`; 5–8 `cage4` and `logic3`; 9–12 `cage5`, `nono5` and `logic4`. Every generated puzzle is checked by a brute-force solver in tests; cages, nonograms and logic grids have exactly one solution, while patterns and sorts take any rule-valid answer.
- **R-F5: subject sorts come from JSON pools** (`src/content/sorts/<poolId>.json`) of science and vocabulary, each crediting an existing skill id, with their own validator and blind-pass sheet. A skill with no sort pool keeps playing as `choice`.
- **R-F6: `logic` is a new `SkillArea`** with one row per band at the band's lowest grade (`logic-k1`, `-g23`, `-g45`, `-g68`, `-g912`), spell school `none`, and the hero's own grade with no offset. It is pickable as a focus skill and shown in the mastery and focus panels.
- **R-F7: logic skills have their own `SkillSource`, `{ kind: "lock" }`.** They are never drawn as `choice`; with locks off, a logic skill draws nothing and Puzzle practice is hidden.
- **R-F8: logic has no side quests** (the owner). The "every area has two deeds" tests exempt it by name. It is practised through Puzzle practice (a `world` run of 3 logic locks at the hero's grade, from the Side Quests page) and through world locks and the Tower (4b).
- **R-F9: a `world` run moves mastery, feeds review and allows second chances**, and raises no building, earns no stars, counts for no school and pays no minutes. `tower` comes in 4b.
- **R-F10: demo-first is generalised.** For K–3, `demoAt` marks the first task whose demo the hero has never seen. The demo copy is per kind and mode. The bench's two stay one demo: any bench task answered ends Aldo's. Pip has one demo for every puzzle a K–3 hero can meet (ruling RF-g): `pattern`, a shape sort (`sort1` and `sort2`), a word sort (`sort`), `shapes3` and `balance`. Each is seen once, on its own puzzles: a word sort answered never hides the shape grid's demo. `hasAnsweredBench` becomes `hasAnsweredDemo`. A run still shows at most one demo.
- **R-F11: the five science deeds become `mechanic: "lock"`** (well-water, mill-wheel, chapel-stars, watchtower-signals, garden-bees). Recorded snapshots that change get choice-pinned twins. Vocabulary stays `choice` inside `language` deeds, and vocabulary sorts are reached through a grown-up's focus skill and the world locks of 4b.
- **RF-j: a science side quest played as locks is half as long.** It runs half the grown-up's side-quest length, rounded (8 gives 4 sorts, 12 gives 6), because each sort places 6 to 10 items. No sort set repeats in a run while its pool has an unused one. The half applies only when the run actually draws sorts. A run that falls back to multiple choice keeps the whole length: locks off, the gate, or a skill no sort pool credits.

### Calls settled for slice 4b (2026-11-20)

The owner's answers:
- **An emptied chest keeps relocking weekly, with a fresh puzzle (R-G2).** Once the hero owns every reward it holds, opening it gives no reward and writes no reward row; its line is exactly "You've found everything in this chest."
- **The Tower's floors (R-G5).** One floor per band. 3 stars on a science (lock) side quest at the hero's own band opens their floor and every floor below it. Floors above the hero's band are never shown. A waiting floor reads exactly "Earn 3 stars on a science side quest to open this floor." and never names a grade or band.
- **The grown-up's locks switch (R-G7).** With "Solving logic locks" off, chests and vault doors are not drawn, the Tower's bonus locks are not offered, and the two start actions refuse with `WORLD_LOCKS_OFF`. Everything already found stays.

The rulings:
- **R-G1: `realm_world_state (id, child_id, object_id, state, updated_at)`**, unique on `(child_id, object_id)`, every column but `id` `notNull`, in migration 0044. A pure `lockedNow(object, row, today, zone)`: no row is locked; `"open"` with no `resetAfterDays` stays open; with it, the object locks again once `today - dayOf(updated_at) >= resetAfterDays`.
- **R-G2: objects are a pure catalog (`WORLD_OBJECTS`).** Chests (`resetAfterDays: 7`) stand at fixed village and room spots; vault doors (once) stand beside the five authored places and each reveal a generated place and a lore page. Every lock draws from the hero's logic skill, except a library chest (vocabulary) and a garden chest (science) when those pools exist.
- **R-G3: opening is a `world` run of one lock task**, started by `startWorldLockRun(childId, objectId)`: hero only, refused while the object is open, resumed on `sourceRef = objectId`. The close, the open and the rewards are written together, in one `withChildLock` transaction, when the task resolved right (first or second try). A miss leaves it locked and the hero tries again with a fresh puzzle.
- **R-G4: rewards are never materials.** `decor` is a box at a fixed spot (`DECOR`), `lore` a page in the Chronicle's new "Found pages" section, `fragment` a generated place id applied with `addPlacesFound` and announced by a toast.
- **R-G4b: `RUN_EFFECTS.tower` has every effect false.** A tower run moves nothing but the tower record.
- **R-G5: the Puzzle Tower** is a fixed structure at (25.5, 23.5), 8 by 8, the village's one free plot. It is not a `BUILDINGS` entry: it has its own catalog entry and clearance test. Each open floor offers a bonus lock one level harder, as a `tower` run; the record is `tower:<band>`, holding the solved count; the exterior grows one storey per open floor.
- **R-G6: interactables.** New interact kinds `"lock"` and `"tower"` join the overlay chain's negative list. Room chests take an optional third argument on `roomSpots`. Chests and doors are non-solid; a door's frame stands beside the path, never across it.
- **R-G7: see the owner's answer above.**

The controller's rulings (pre-flight scan):
- **RG-a:** `World` takes `worldLocks?: WorldCanvas`, and its `spots` memo depends on that one prop.
- **RG-b:** the clearance helpers are `yardPieces()` (the keep yard's spots and hall boxes) and `villagePieces()` (everything else); `keep-yard.test.ts` compares the first against the second, and the new spots are tested against both.
- **RG-c:** `withChildLock` serialises across instances, so finishing is a plain read-check-write inside it, with no compare-and-set. A second finish is a no-op and writes no second reward row.
- **RG-d:** every `worldLockSkill` test case spells out the hero's full `grades`.
- **RG-e:** `EMPTY_WORLD_STATE.locksOn` is `false`, so a failed read draws nothing; `KingdomState` gains an optional `grades`; `RealmData.worldState` is optional.
- **RG-f:** every chest has an `ry`, every decoration a `label` and `ry`; `lore.test.ts` holds ten unique pages of 2 to 4 sentences and at most 320 characters, a title of at most 40, and no grade, kindergarten, "behind", "ahead" or markup.
- **RG-g:** G5 tests `applyTowerOutcome`, every `towerFloorLine`, a bad band id, and that a tower `RunStart` carries no `"solution"`.
- **RG-h:** G6's tests move into G3 (the bundle's reads) and G5 (`EXPLAIN QUERY PLAN`), each written red first; G7's review counts the per-load queries.
- **RG-i:** the test `DEED_RUN_DDL` includes the `(child_id, completed_at)` index.
- **RG-j:** practice, world locks and the Tower share one run builder (`lockRun`), one band derivation (`towerBands`), one set of copy constants (`world-lock-copy.ts`) and one start skeleton (`startLockRun`); test DDL comes from `src/test/realm-db-ddl.ts`.
- **RG-k:** G7's smoke shows an emptied chest's exact line, the exact waiting-floor line, and that no floor above the hero's band shows.
- **RG-l:** a `realm-game` test of `handed.props.worldLocks` replaces the vacuous `quietSurfaces(true)` test. In the quiet world (0 minutes) the canvas is the bundle's, unchanged: locks pay nothing, so they are learning, which stays on.
- **RG-m:** a chest or door run's finish button reads "Done" and its leave link "Leave the lock"; tower runs keep Puzzle practice's copy.
- **RG-n:** the open and the run's close share one `withChildLock` transaction; if opening throws, both roll back, and the tower's count bump takes the same path. There is no `"error"` outcome.
- **RG-o:** `worldLockSkill` resolves a subject skill through the catalog, never by building an id string, walking `nearestGrades` within the grade's own band.

The planner's calls (the code forced each one):
- **PC-G1: one table, namespaced ids.** `chest:<id>` and `door:<place>` (state `"open"`), `decor:<id>` (`"placed"`), `lore:<id>` (`"found"`) and `tower:<band>` (the solved count as text); a chest relocks weekly but what it gave stays, so rewards have rows of their own.
- **PC-G2: finishing a lock run is one locked transaction:** close the run, read the world rows, check `lockedNow`, upsert the object to `"open"`, write the rewards (`onConflictDoNothing`; fragments through `addPlacesFound(…, exec)`).
- **PC-G3: each lock run start is seeded with `Date.now() >>> 0`**, as every run start is, so a miss brings a fresh puzzle; a resumed run keeps one stable for 60 minutes.
- **PC-G4: which skill a lock draws** (`WorldObject.draws` is an area). Logic uses `practiceSkill(grades.logic, focusSkillIds)`; language and science walk the catalog (RG-o). A K-3 language hero finds no skill in their band and gets a logic lock, never a vocabulary `choice`.
- **PC-G5: what a chest gives.** The first reward in its list the hero does not own; a door gives all at once; an emptied chest opens weekly and gives nothing, writing no reward row.
- **PC-G6: with locks off the Tower stays drawn at its earned storeys, with no E spot**, because the earned storeys are the record R-G7 keeps.
- **PC-G7: only the hero finishes a world-object or tower run;** `completeDeedRun` refuses a grown-up with `WORLD_HERO_ONLY`. A grown-up can still answer the hero's open chest run, as with Puzzle practice and side quests today.
- **PC-G8: the floor query counts science deed runs by the deed's identity**, whether the run played as sorts or as `choice`.
- **PC-G9: E spots go through `World`, which draws through its siblings** `<WorldLocks>`, `<Decorations>` and `<PuzzleTower>`; `SpikeScene` hands the same stable `worldLocks` prop to both; the Tower's collider is static.
- **PC-G10: an open chest or door keeps its E spot** ("Look in", "Look through"); its board says it is open and starts nothing.
- **PC-G11: the component is `WorldLockBoard`**, because `src/lib/tasks/lock-board.ts` already exists.
- **PC-G12: the Tower.** The base is always drawn and one storey is added per open visible floor (at most 5); the body is 6 by 6 on the 8 by 8 plot with one static collider as tall as five storeys; a floor's lock is `logic-<band>` at `towerLevel(mastery) = min(mastery + 1, MASTERY_MAX)`; no demo, no second chances.
- **PC-G13: the fragment toast reuses `DeedToast`** with an optional `icon: "map"`, held until the board closes.
- **PC-G14: vault doors.** A door's id is `door:<placeId>`; its position is the place's plus an offset from a local `DOOR_OFFSETS` table, resolved at module load; the riddle-stone tests arbitrate, and an implementer may move a door at most 3 units.
- **PC-G15: the world state is assembled after the child row is read,** from rows read in the first parallel round, at no extra read.
- **PC-G16: `RunKind` gains `"tower"` in G2** with `deed_run.kind`'s TS enum; `db:generate` emits nothing for the enum, so 0044 holds only the table.
- **PC-G17: the world-lock path runs only when `run.kind === "world" && isWorldObjectId(run.sourceRef)`,** so Puzzle practice is untouched.
- **PC-G18: "the hero's band".** `towerBands(grades)` gives `ownBand` (the band of the logic grade, which has no offset) and `scienceBand` (where science side quests draw now). `towerFloors(starred, bands)`: the top open floor is `ownBand` if the science band is starred, else the highest starred band at or below `ownBand`; every floor up to it is open; the visible floors are the open ones plus `ownBand`.

### Calls settled for slice 5 (2026-11-21)

The owner's answers:
- **A wrong place on a trail works like the other puzzles.** The first wrong place gets a gentle redirect and a second try; the second resolves a miss, reveals the answer and moves on.
- **Trails reach the village only.** No trail sends anyone to the five named places or into a room.
- **Rune objects can be fixed any time, like chests (Part I).**
- **Slice 5 merges into `dev` when green** (full checks and the whole-branch review), pre-authorized; slice 6 needs the owner's word.
- **K–2 readers' trails come from one grade up, and a Kindergarten hero always hears every clue read aloud** (R-H17, R-H21).
- **A reading focus that no trail can play wins:** that side quest plays as multiple choice (R-H22).
- **With runes off, rune objects are not drawn** (R-I13).

The rulings:
- **R-H1:** `trailKind.allowsSecondChance` is `true`. The first wrong anchor resolves `open` with `feedback: "wrong_place"` and the clue's redirect for that anchor as the hint; the second resolves `missed` with `reveal` the answer's anchor id and `answer` "It was {label}.", and the trail moves on. Stars, mastery and minutes follow `RUN_EFFECTS.deed`.
- **R-H2:** the village only. Every answer is one of 14 anchors: the eight building sites, the castle gate, the Puzzle Tower and four new small objects.
- **R-H3:** merging is pre-authorized (see the owner's answer above).
- **R-H4:** anchors are a pure catalog (`ANCHORS`, `src/lib/realm/anchors.ts`), ids `landmark:<id>` or `object:<id>`, never renamed or reused. Every anchor looks the same to every child; the hitching post, the Ring's arch, scenery and reward decorations or chests are not anchors.
- **R-H5:** the `trail` kind: the response is an anchor id, the view is `{}`, the clue is the task's `prompt` and `readAloud`. The answer, redirects, `trail` and `explain` stay on the server until resolution. The task id is opaque: `<skillId>:trail:<8 hex>`.
- **R-H6:** every anchor is a candidate everywhere: all 14 stakes have E spots, the picture map shows all 14, and `parseResponse` accepts any anchor id.
- **R-H7:** `TaskKindDef` gains optional `reveal?(t)` and `retryLine?(t, r)`; `secondChanceHint(t, firstPick)` is the one place `resultFor` and `resumedStart` read a second-chance line from.
- **R-H8:** `SkillSource` gains `{ kind: "trail" }`; `read-g6` and `read-g9` are trail-only rows; `choiceDrawable(s)` replaces each lock test that meant "has no choice questions"; `runCandidates` keeps only skills the run can play. With trails off, or at the gate, reading is `read-g4` multiple choice exactly as today.
- **R-H9:** walking runs: `WALKING_KINDS = ["trail"]`. The candidates are the skills the mechanic presents (the band's skill when the hero's own grade has none); a focus skill the mechanic does not present leaves the walk for the whole run; review of other kinds is left out; clues keep their drawn order and review clues come last.
- **R-H10:** a trail side quest is half the grown-up's length (`questionCount: TRAIL_CLUES` = 4), only when the run draws trails.
- **R-H11:** a week without repeats: the drawer passes over trails met in the hero's last `TRAIL_MEMORY_RUNS = 21` reading side quests, and uses them only after every other trail is used. Pools hold at least 45 trails, 100 clues and 9 trails per level.
- **R-H12:** trail pools `src/content/trails/trail-<band>.json`, each crediting one skill (k1 `read-g1`, g23 `read-g3`, g45 `read-g4`, g68 `read-g6`, g912 `read-g9`); a trail is 2–4 clues (k1: 2–3); every clue can be answered from its own text alone, by one anchor only.
- **R-H13:** comprehension by band: k1 literal and decodable; g23 main idea, never naming the place; g45 inference and vocabulary in context; g68 purpose and point of view with two or more facts; g912 tone and word choice with facts.
- **R-H14:** the walking run in the Realm: the villager's board starts the run, "Set off" hands it to the frame's `TrailWalk` tracker, E at a stake answers the current clue, "Leave the trail" ends the walk with the run still open. The tracker does not survive a reload and adds no per-load query.
- **R-H15:** the picture run off-world: an SVG village map with all 14 anchors as buttons; a tap selects, "Search here" sends; a ruled-out place is "Not here"; a resolved miss marks the answer "It was here."; it fits 390 px.
- **R-H16:** `DemoKey` gains `"trail"`, one demo, "Watch Pip", shown to a K–3 hero before their first clue.
- **R-H17:** a Kindergarten hero always hears every clue, its second-chance line and its miss line read aloud; every other hero hears it unprompted only with read-aloud on. One pure rule, `autoSpeaks(task, readAloud, narrateClues)`.
- **R-H18:** the switch "Reading trails" (`mechanics.trail`) defaults on; off, reading plays as multiple choice. The gate, riddle stones and Quick review stay multiple choice.
- **R-H19:** no migration and no per-load query; a reading run start with trails on costs one more query, `loadRecentTrailIds`, in its second parallel round.
- **R-H20:** the reading deeds' stories are unchanged; the walk's words come from `trail-copy.ts`.
- **R-H21:** K–2 readers' trails come from one grade up: a K hero draws `read-g1` trails, a grade-2 hero `read-g3` trails; their sight-word skills stay in review and in a focus.
- **R-H22:** a reading focus no trail can play (`sight-k1`, `sight-g23`) wins: that side quest plays as multiple choice and is the grown-up's whole length.

The controller's rulings (pre-flight scan, adopted as RH-a for F-1 to F-23):
- **F-1:** one shared list, `NON_DRILL_SHEET_PREFIXES = ["sort-", "trail-"]`, drives the drill blind-pass gate.
- **F-2:** a sheet's per-clue code fingerprints what the reader sees (`clueCode`), never the identity hash; `carryTrailForward` keeps unchanged answers and blanks an edited clue's.
- **F-3:** on the board and the page, a trail task speaks its second-chance and miss lines through `autoSpeaks`, as the tracker does.
- **F-4:** building stakes start 2.2 past the drawn site's north edge, at least 2.0 and at most 3.5; H1 runs the full-village "no spot holds a stake, no stake holds a spot" check, so the catalog is final at H1.
- **F-5:** H3's candidate tests use a local fixture `{ ...findDeed("well-signs")!, mechanic: "choice" }` and define `ALL_ON`.
- **F-6:** the blind sheet takes an anchor id, `both` or `?`; `CONFUSABLE_ANCHORS` names the well and the water trough, the garden and the beehives, the notice board and the library; a clue using a pair's shared word carries `parts` ruling the partner out.
- **F-7:** H4 rewrites H2's `presents` assertion under `__setTrailPoolsForTest([])`; H7 and H8 land together before any manual play.
- **F-8:** `walked` is cleared whenever the overlay leaves `interact`.
- **F-9:** this spec's §4.6 and §8 carry the village-only and narration fixes.
- **F-10:** forged anchors go through `answerDeedQuestion`, and a resumed start's JSON is checked against the stored answers.
- **F-11:** the no-repeats bar is tested on the database path: 7 days of three reading side quests a day, per band.
- **F-12:** one shared skill-map parser (`src/test/skill-map.ts`) and shared blind-pass helpers (`src/lib/content/sheet-kit.ts`).
- **F-13:** the map's controls are real `<button>`s over an `aria-hidden` `<svg>`, never inside it.
- **F-14:** H3 lists `skills.test.ts`'s "resolvable sources" branch and `content-review.tsx` among its files.
- **F-15:** H5 commits no sheets; H6 cuts, answers and settles them, so the gate is never red at an H5 commit.
- **F-16:** grade words are matched on word boundaries, `/grades?|kindergarten/i`.
- **F-17:** `TrailWalk` passes `result.reveal` on only when `isAnchorId` holds.
- **F-18:** with second chances off, a first wrong place resolves a miss with its reveal; E while the clue is resolved does nothing.
- **F-19:** the backdrop's plots fit the map; a building stake stands on its slot's own x (a catalog convention).
- **F-20:** a clue with no `why` gets the band's generic line, `TRAIL_GENERIC_WHY[band]`, as its `explain`.
- **F-21:** the content page's trail sample lives in `sample.ts`/`content-review.tsx`; `simulateTrailWeek` in `src/test/trail-week.ts`; `bandTopGrade` gives the readability ceiling; `TRAIL_MEMORY_RUNS` lives in `deed-run-store.ts`; `avoid` reaches the refill draw too.
- **F-22:** H5 and H6 each start red (the expected-pool list, then "every pool has a sheet"); H3's grade-7 `deeds-db` case is a regression guard.
- **F-23:** the validator tests a `redirects[...]` value that names the answer.
- **RH-b (H1 review):** the castle gate's stake stands at (1.5, -9.25), inside the ceremony plaza's x range, on purpose: the gate's reach, the citadel collider and the 3.5 cap leave only that strip. A test keeps it at least 1.0 from every crown-ceremony mark. The towers (`landmark:watchtower`, `landmark:puzzle-tower`) join `CONFUSABLE_ANCHORS` on the shared word "tower".

### Calls settled for slice 6 (2026-11-21)

The owner's answers:
- **Rune objects can be fixed any time, like chests.** Outside a side quest, fixing one is a `world` run that pays nothing and moves mastery. Language side quests also send the hero to 2–3 rune objects.
- **Objects cycle.** A fixed object stays fixed for that child until it breaks again, through `resetAfterDays` in `realm_world_state`. The launch catalog has at least 12 rune objects across the village and the named places (15).
- **With runes off, rune objects are not drawn,** as with locks. Fixed records stay (R-I13).
- **Focus wins for runes too:** a language side quest that would draw a grown-up's focus skill no rune pool can play (today `lang-g1`) plays as multiple choice at full length (R-I8, mirroring R-H22).
- **Slice 6 merges into `dev` only on the owner's word** (R-I16).
- **Grades 2–3 build the word they hear:** the word is always spoken (dictation), with the object's picture, as at K–1 (R-I18).
- **A side quest shows its named objects broken until cast (2026-11-21):** during a rune walk every object it still names is drawn broken, by its broken label and with the cast verb, whatever its record says, and shows mended once its word is cast on this walk; it is a client view of the walk (`withRuneWalk`), and any-time fixes and the server's renewal writes (R-I22) are unchanged.

The rulings:
- **R-I1:** rune objects can be fixed any time: a `world` run of one rune task, started by `startRuneObjectRun(childId, objectId)` on the shared lock start skeleton; the hero's alone; refused with runes off (`RUNES_OFF`); while the object holds the start answers `{ held: true }`, a value and not a thrown error, as a chest that stands open does (smoke I12); the fix and the run's close are one `withChildLock` transaction. A miss leaves it broken.
- **R-I2:** a language side quest with runes on is a walking run: the board names the objects, "Set off" hands the run to the rune walk's tracker, E at the current object opens the rune stone. Each task is bound to its object at the run's start (R-I22); the object is part of the question, never the answer.
- **R-I3:** rows are `rune:<name>` with state `"fixed"`; one cycling rule serves both, `heldNow(object, row, held, today, zone)`; `lockedNow` is `!heldNow(…, "open", …)` with unchanged output and `brokenNow` is `!heldNow(…, "fixed", …)`. Every rune object has `resetAfterDays: RUNE_RESET_DAYS = 4`.
- **R-I4:** a sibling catalog, `RUNE_OBJECTS` (`src/lib/realm/rune-objects.ts`), not a widened `WORLD_OBJECTS`, whose type is lock-only and which seven readers treat as "the locks". Shared: the table, the id namespace, `heldNow`, the start skeleton and the locked finish.
- **R-I5:** the `rune` kind: the response is the tile indices placed (`"r:3,0,5"`); any accepted word counts however it is tiled; the view is `{ effect, object, tiles, listen }`; second chances are on; the task id is opaque.
- **R-I6:** rune pools are validated JSON (`src/content/runes/rune-<band>.json`), effect × band → accepted words, tiles and prompts, for five effects (`mend`, `light`, `water`, `open`, `grow`); every accepted word can be built from its entry's tiles.
- **R-I7:** `SkillSource` gains `{ kind: "rune" }`; `spell-g1` is a new rune-only row (the ELA map has 40 rows); at grade 1 the walking rules present `spell-g1`; the spelling and vocabulary drill pools stay as choice review.
- **R-I8:** focus wins, and inside a rune deed a vocabulary focus a rune pool presents is a rune, never a sort.
- **R-I9:** a rune side quest asks `clamp(round(L × 3 / 8), 2, 3)` tasks; language deeds take `questionCount: 3` and `stops: RUNE_STOPS = { min: 2, max: 3 }`; choice keeps the whole length; the Crown Challenge stays at 3.
- **R-I10:** 15 rune objects: ten in the village (two per effect) and one at each named place; never solid, always drawn while runes are on, in every palette; held by slice 4's clearance and reach tests and slice 5's stake rule; no village label holds a trail anchor's name, and no label holds an accepted word.
- **R-I11:** in the Realm the walk uses the rune walk's tracker and a right cast plays the effect at once; off-world the picture run shows the object's picture with the rune stone beside it; the gate stays multiple choice.
- **R-I12:** the rune stone is DOM with no dragging: tap to place, tap to take back, Clear, Cast; keyboard-complete; the built row is an `aria-live` region; one read-aloud control replaces the host's generic button; it fits 390 px; a K–3 hero sees one "Watch Pip" demo first.
- **R-I13:** the switch "Rune spellcraft" (`mechanics.rune`) defaults on; off, language is multiple choice, rune objects are not drawn or offered, fixed records stay; a run started before the switch went off can still be finished on the board's stone.
- **R-I14:** the language deeds (`mill-ledger`, `bridge-toll`, `market-crier`, `library-scribe`) become `mechanic: "rune"`; recorded snapshots that change get choice-pinned twins; a stored language choice run still resumes.
- **R-I15:** copy never names a grade or band, and never says "behind" or "ahead".
- **R-I16:** slice 6 merges into `dev` only on the owner's word.
- **R-I17:** the leak rule: the view carries no shape of the word (no slot count, length, first tile or decoy marking); the tile order is no tell (a capped seeded shuffle, with a validated fallback); the decoy count is no tell; decoys are plausible; no accepted word, nor inflection of one, appears in a prompt, a hint, a g45-and-up `readAloud`, an object's label or any rune copy shown before resolution; the id, entry and hint stay on the server. **The one exception is dictation (R-I18):** at k1 and g23 the word is the spoken prompt, so it reaches the browser inside `readAloud`, spoken and printed only when speech is unavailable. This is the spelling pools' existing contract, and the one exception to §5's "solutions never leave the server before a task is resolved" (RI-a / N16). **Beside it, the dictation's `view.effect`:** nine k1 and g23 entries (k1 `mend`, `light`, `open`, `grow`; g23 `mend`, `light`, `water`, `open`, `grow`) have the effect id as their word, so the view's `effect` equals it. This is accepted because the word is spoken anyway, and RI-d keeps the effect from ever being rendered as text (the stone shows it only as a picture, with no class, id or title naming it).
- **R-I18:** k1 and g23 are dictation (the object's picture, a shown line that never holds the word, a spoken `readAloud`; the view marks it `listen: true`); g45 and up build from a shown meaning or definition; a `listen` task is always spoken; no task word is spoken at Set off (the walk's card says where to go, "Next: …", whenever `autoSpeaks` holds, review I-1); without speech the word is shown.
- **R-I19:** no repeats for a week: the drawer passes over entries met in the hero's last `RUNE_MEMORY_RUNS = 21` rune runs; pools hold at least 16 entries per effect and 3 per effect per level.
- **R-I20:** no migration and no per-load query: rune state is rows of `realm_world_state`, read by the bundle's existing `loadWorldRaw`.
- **R-I21:** the effect plays at once; the record lands at the finish: a right cast marks its object mended on the walk, and the rows are written in the locked finish.
- **R-I22:** a side quest's tasks are bound to unused village objects of their effect, broken ones first, with the run's seeded `Rng`; a task with no object left is dropped; every right cast in a `deed` or `challenge` run fixes its object only when the hero finishes the run; a `review` run never holds a rune.

The controller's rulings (pre-flight scan, adopted as RI-a for B1–B4, S1–S18 and S20, N1–N18):
- **B1–B4:** the walk's stone stays open after a right cast; `hidden` hides the tracker's card only; `WALKING_KINDS` gains `"rune"` in I8; at k1 and g23 the blind sheet shows `Heard:`.
- **S1–S3:** the walk reports its stop through `onAt`; a stop is done only when mended on this walk; E cannot act during a cast.
- **S4–S7:** one read-aloud control, the stone's; no task word spoken at Set off (the destination is); without speech a dictation shows its word; a run started before runes went off is offered no walk.
- **S8–S9:** deed and challenge fixes apply only when the hero finishes; binding happens before the size checks.
- **S10–S13:** I2's registry test runs under `__setRunePoolsForTest([])`; the dev content page draws its rune samples on the server; one matcher, `containsWord`; one Set off card.
- **S14:** shared shells, `WalkCard` and `ObjectRunBoard`, with slice 4b's and slice 5's tests kept green unchanged.
- **S15–S18:** inflections count as the word; the shuffle is capped and the validator proves every entry can be arranged; the leak test runs at grades K, 3, 5, 7 and 10; 16 entries per effect and 3 per level.
- **S20:** the rune board asks the server even at an object drawn fixed.
- **N1–N18:** the pinning and naming fixes: `runeTarget` cases pin the union; `spelled` compares ruled-out words; a stored rune task whose object left the catalog fixes nothing; `runeStops` keeps catalog objects; a fixed object reads by its `fixedLabel`; copy homes named; the walk routing lives in `use-walks.ts`; the dictation exception is recorded here; the count-tell share is `LENGTH_TELL_MAX_SHARE`; the built row is a live region.

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

- **A trail** is 2–4 short clue texts at the child's reading level, found on signboards, letters from villagers and notes in the village. Each clue's answer is **a place or object in the village** (village only, owner, 2026-11-21), chosen by walking to it and interacting. Reading *is* the navigation.
- **Content:** validated JSON pools `src/content/trails/*.json` per band (k1, g23, g45, g68, g912).
  - Each clue references world anchors by id (`landmark:mill`, `object:notice-board`; ~~`place:longwater`~~ struck: no trail reaches the five named places), never raw coordinates, so trails survive layout changes. A test asserts that every referenced anchor exists.
  - Comprehension is built into the clue: literal at k1–g23, inference and vocabulary-in-context at g45 and up, and multi-clue synthesis at g68 and up. A wrong choice leads somewhere with a gentle redirect line, not a red X.
- **Narration** (`readAloud`, the existing speech path): a Kindergarten hero always hears every clue; others hear it on request, or with read-aloud on.
- `trail` is a task kind. A trail run is an ordinary deed run whose tasks are clues; the response is an anchor id, checked server-side. Reading deeds become trail deeds (`Deed.mechanic = "trail"`). In the world it is a walking run, and off-world a picture run (§4.10).
- **Skill ids:** trail pools credit the existing reading ids for k1–g45 (`read-g1`, `read-g3`, `read-g4`) and two new rows, `read-g6` and `read-g9`, for the bands reading lacks today.
- The existing reading pools (`read-g1`, `read-g3`, `read-g4`, sight words) stay as `choice` review.

### 4.7 Rune spellcraft (slice 6)

- **Rune objects in the world** (a sibling catalog, `RUNE_OBJECTS`, R-I4) each want an effect: a broken cart (mend), a dark lamp (light), a dry bed (water), a stuck gate (open), a wilted tree (grow).
- **The child builds the word from rune tiles at the rune stone,** then casts it at the object. A correct word *is* the effect (cart mended, lamp lit). Each fixed object stays fixed and is recorded per child.
- **Grade scaling** (catalog `RUNE_WORDS`: effect × band → accepted words, tile sets, definitions):
  - K–1: letter tiles, picture plus spoken prompt (fix, lit, dig).
  - Grades 2–3: phonogram tiles (m-e-n-d, l-igh-t); the child hears the word, always spoken, with the object's picture (owner, 2026-11-21).
  - Grades 4–5: spelling-pool words (repair, water), built from a short meaning (R-I18).
  - Grades 6–8: morphemes, i.e. prefix + root + suffix from a definition (re-store, il-lumin-ate).
  - Grades 9–12: Greek and Latin roots from a definition (re-habilit-ate, ir-rig-ate).
  - Tiles include distractors. Content is validated JSON (`src/content/runes/*.json`) with the pool validator.
- `rune` is a task kind. Language deeds become rune deeds (`Deed.mechanic = "rune"`). Spelling and vocabulary pools stay as `choice` review.
- **In the world it is a walking run:** the villager names two or three rune objects nearby, and interacting with each one opens the rune stone surface for its word. Side quests name village objects; the named places' objects are fixed any time (R-I10). Off-world, the object is shown as a picture (§4.10).
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
- **Solutions never leave the server** before a task is resolved, as with `Question.answer` today. `explain` is released after resolution. One exception: a dictation rune task (k1 and g23) sends its word inside `readAloud`, as the spelling pools do (§2a, R-I17).
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
| 5 | **Reading clue trails** | `trail` kind, world anchors, trail pools per band, narration, reading deeds → trail. | 1, 4 |
| 6 | **Rune spellcraft** | `rune` kind, rune stone presenter, rune objects, `RUNE_WORDS` pools, language deeds → rune. | 1, 4, 5 (the walk) |

Each slice ships on its own branch, merges into `dev` when green, and leaves the app fully working. A slice whose mechanic is turned off falls back to `choice`.

## 9. Left to the builder

- Exact copy, colours, icons and 3D piece geometry for materials, improvements, stockpiles, locks and rune objects (keep to the low-poly box style).
- Exact cost numbers and focus weight (start from §4.4's "about a week of quests per one or two levels", and expose them as constants).
- The pace-guard thresholds, demo scripts and feedback-code copy.
- How many trail, rune and sort items to author per band for launch (at least enough for a week of daily play per band without repeats).
- Splitting `src/lib/actions/deeds.ts` (a playability §11 follow-up) when slice 1 touches it.
