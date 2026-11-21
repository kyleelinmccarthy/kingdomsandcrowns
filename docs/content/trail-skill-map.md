# Reading trails: band, pool and skill

**Status:** the format, validator, blind pass and drawer are built (slice 5, H4). The pools are written in H5 and blind-passed in H6.
**Implements:** R-H12 and R-H13 of `docs/superpowers/plans/2026-11-10-realm-learning-woven-in.md`, Part H.
**Read by:** `src/lib/content/trail-pools.test.ts`, which holds this table to `TRAIL_SKILLS` (through the shared parser in `src/test/skill-map.ts`).

A reading side quest can be played as a trail: the child reads a clue, walks the village to the place it tells
of, and searches there. Each content band has one pool, `src/content/trails/trail-<band>.json`, and each pool
credits one reading skill, so a clue answered right moves that skill's mastery as any side quest does.

A clue is always answered by **one** of the village's fourteen places (`src/lib/realm/anchors.ts`). What a clue may
say, and how it is read, depends on the band; the validator (`src/lib/content/trail-pools.ts`) holds each rule.

## Reading

| Grade | Skill id | Pool | Comprehension | Status |
|---|---|---|---|---|
| 1 | `read-g1` | `trail-k1` | Literal and decodable. The clue may name its place ("Go to the mill."). Every clue has a narration form. | written (H5); blind pass pending (H6) |
| 3 | `read-g3` | `trail-g23` | Main idea: a 2-3 sentence note whose main idea is the place. It never names the place. | pool pending (H5) |
| 4 | `read-g4` | `trail-g45` | Inference and vocabulary in context. `why` says what the answer rests on. | pool pending (H5) |
| 6 | `read-g6` | `trail-g68` | Purpose and point of view: a villager's note whose purpose, with two or more facts (`parts`), fits exactly one place. | pool pending (H5) |
| 9 | `read-g9` | `trail-g912` | Tone and word choice: figurative or precise wording that must be read for meaning, combined with facts (`parts`). | pool pending (H5) |

Kindergarten and Grade 2 readers play their reading side quests from one grade up: a kindergartener draws `read-g1`
trails and a grade-2 reader draws `read-g3` trails (R-H21). Their sight-word skills stay in review and in a grown-up's
focus.
