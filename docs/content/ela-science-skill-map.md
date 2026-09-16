# Reading, Language Arts and Science skill map, K–12

**Status:** draft for review — no content is written against it yet
**Implements:** spec §6.2 and §6.4 of `docs/superpowers/specs/2026-09-14-grade-appropriate-content-design.md`
**Baseline:** Common Core State Standards for ELA (Reading and Language); NGSS-aligned topics for Science
**Companion:** `docs/content/math-skill-map.md` — the same job for math, already built

This table fixes what each grade practises in Reading, Language Arts and Science. It is the place to
change the curriculum: edit a row and the content follows. Nothing else in the app decides what a grade
covers.

Unlike math, these three strands are **authored, not generated** — a person writes each question and
its wrong answers. So every item passes three checks before a child sees it (spec §6.5): automated
validation, an independent blind answer pass, and a parent's eye on `/dev/content`.

## What is wrong today

All three strands are still keyed to the old five-band ladder, and the bands have holes:

| Strand | Today | What that means |
|---|---|---|
| Reading | Two pools, `k1` and `g23` — **nothing above grade 3** | A grade-6 child falls back to grade 2–3 sight words. A grade-12 child does too. |
| Language Arts | Spelling at `g23`/`g45`, vocabulary at `g45`/`g68`/`g912` — **nothing at K or 1** | A kindergartener falls *upward* to grade 2–3 spelling, because there is nothing easier. |
| Science | Five pools, one per band | Works, but one band spans three grades. |

The upward fallback is the sharpest of these: `nearestGrades` walks easier-first by design, but when a
child's grade is at the bottom of the ladder there is nothing easier to walk to, so it walks up. A
five-year-old is handed grade 2–3 spelling. This map is what closes that.

## How to read the table

- **Skill id** is permanent. Mastery is stored per skill id, so renaming one resets every child's
  practice history on it.
- **Carried forward** marks a skill that exists today and keeps its id, its items and its history.
  Each is assigned to the **lowest grade of its old band** — the conservative choice, since a pool
  written for grades 2–3 is right at grade 2 and easy at grade 3, never too hard.
- One skill per strand per grade. A deed draws all eight of its questions from one pool, so every pool
  needs comfortably more than eight items; the target is **45**, matching the science pools today.

## Reading

Phonics and sight words at K–1; from grade 2, a passage of two to four sentences with a question about
it. Passages stay short enough to read inside the side-quest panel.

| Grade | Skill id | What it practises | Standard | Status |
|---|---|---|---|---|
| K | `sight-k1` | Letter sounds, beginning sounds, first sight words | RF.K.3 | **carried forward** |
| 1 | `read-g1` | Short vowels, blends and digraphs; sight words | RF.1.3 | new |
| 2 | `sight-g23` | Sight words, and a two-sentence passage read literally | RI.2.1 | **carried forward** |
| 3 | `read-g3` | Passage: the main idea | RI.3.2 | new |
| 4 | `read-g4` | Passage: drawing an inference and saying what it rests on | RL.4.1 | new |
| 5 | `read-g5` | Passage: theme, and summarising | RL.5.2 | new |
| 6 | `read-g6` | Passage: the author's purpose and point of view | RI.6.6 | new |
| 7 | `read-g7` | Passage: central idea, and the evidence for it | RI.7.2 | new |
| 8 | `read-g8` | Passage: judging an argument and spotting an unsupported claim | RI.8.8 | new |
| 9 | `read-g9` | Passage: tone, and what word choice does to it | RL.9-10.4 | new |
| 10 | `read-g10` | Passage: how a text is put together, and why | RI.9-10.5 | new |
| 11 | `read-g11` | Passage: rhetoric — how a writer persuades | RI.11-12.6 | new |
| 12 | `read-g12` | Passage: holding two accounts together and reconciling them | RI.11-12.7 | new |

## Language Arts

Grammar, conventions, spelling and vocabulary. Spelling leads at the younger grades, vocabulary at the
older; both strands of work run under one skill per grade.

| Grade | Skill id | What it practises | Standard | Status |
|---|---|---|---|---|
| K | `lang-gk` | Letter names, where a word ends, plural `-s` | L.K.1 | new |
| 1 | `lang-g1` | Capital letters, end punctuation, nouns and verbs | L.1.1, L.1.2 | new |
| 2 | `spell-g23` | Spelling patterns, collective nouns, irregular plurals | L.2.1, L.2.2 | **carried forward** |
| 3 | `lang-g3` | Spelling, regular and irregular verbs, subject–verb agreement | L.3.1 | new |
| 4 | `spell-g45` | Spelling, prepositional phrases, homophones | L.4.1 | **carried forward** |
| 5 | `vocab-g45` | Vocabulary, verb tense, conjunctions | L.5.1, L.5.4 | **carried forward** |
| 6 | `vocab-g68` | Vocabulary, pronoun case, commonly confused words | L.6.1 | **carried forward** |
| 7 | `lang-g7` | Vocabulary, phrases and clauses, misplaced modifiers | L.7.1 | new |
| 8 | `lang-g8` | Vocabulary, verbals, active and passive voice | L.8.1 | new |
| 9 | `vocab-g912` | Vocabulary, parallel structure, semicolons | L.9-10.1, L.9-10.2 | **carried forward** |
| 10 | `lang-g10` | Vocabulary, phrases and clauses, colons and dashes | L.9-10.2 | new |
| 11 | `lang-g11` | Vocabulary, usage conventions, syntax chosen for effect | L.11-12.1, L.11-12.3 | new |
| 12 | `lang-g12` | Vocabulary, word choice and register, hyphenation | L.11-12.2, L.11-12.4 | new |

## Science

NGSS-aligned topics. Grades 9–12 follow the usual course sequence rather than a strand-per-year, which
is how these are actually taught.

| Grade | Skill id | What it practises | NGSS | Status |
|---|---|---|---|---|
| K | `science-k1` | Weather, what plants and animals need, pushes and pulls | K-PS2, K-LS1, K-ESS2 | **carried forward** |
| 1 | `science-g1` | Light and sound, parts of plants and animals, patterns in the sky | 1-PS4, 1-LS1, 1-ESS1 | new |
| 2 | `science-g23` | Properties of materials, habitats, Earth's surface | 2-PS1, 2-LS4, 2-ESS1 | **carried forward** |
| 3 | `science-g3` | Forces and motion, life cycles, weather hazards | 3-PS2, 3-LS1, 3-ESS2 | new |
| 4 | `science-g45` | Energy, waves, structures for survival, Earth's features | 4-PS3, 4-PS4, 4-LS1, 4-ESS1 | **carried forward** |
| 5 | `science-g5` | Matter and its changes, ecosystems, the solar system | 5-PS1, 5-LS2, 5-ESS1 | new |
| 6 | `science-g68` | Cells and body systems, thermal energy, weather and climate | MS-LS1, MS-PS3, MS-ESS2 | **carried forward** |
| 7 | `science-g7` | Chemical reactions, matter cycling in ecosystems, geologic processes | MS-PS1, MS-LS2, MS-ESS2 | new |
| 8 | `science-g8` | Forces and fields, heredity and natural selection, space systems | MS-PS2, MS-LS3, MS-LS4, MS-ESS1 | new |
| 9 *(Biology)* | `science-g912` | Cell structure and function, DNA and proteins, evolution | HS-LS1, HS-LS3, HS-LS4 | **carried forward** |
| 10 *(Chemistry)* | `science-g10` | Atomic structure, bonding, reactions and the mole | HS-PS1 | new |
| 11 *(Physics)* | `science-g11` | Motion and forces, energy, waves and electromagnetism | HS-PS2, HS-PS3, HS-PS4 | new |
| 12 *(Earth and Space)* | `science-g12` | Earth systems, climate, astronomy | HS-ESS1, HS-ESS2, HS-ESS3 | new |

## Totals

**39 skills across 13 grades and 3 strands** — 12 carried forward with their items and their history,
**27 new**. At 45 items per new pool that is **about 1,215 new questions**, against 572 today.

No existing skill id is renamed, reused or deleted, and no existing item is thrown away. Every carried
pool keeps every question it has; it simply stops covering a band and starts covering one grade.

## What this map does not do

- **Change math.** That is `math-skill-map.md`, already built and shipped.
- **Split an existing band pool across grades.** A pool written for grades 2–3 lands whole at grade 2.
  Splitting item by item would be better content, but it is a judgement call per question and a worse
  use of the effort than writing the eleven missing grades.
- **Add a second skill per grade.** One pool per strand per grade, each with far more items than a
  deed can ask, is enough variety; a second skill is a later decision if a grade feels thin.
