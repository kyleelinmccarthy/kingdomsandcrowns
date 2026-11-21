# Rune spellcraft: band, pool and skill

**Status:** the format, validator, blind pass and drawer are built (slice 6, I4). The pools are written in I5 and blind-passed in I6.
**Implements:** R-I6, R-I7 and R-I18 of `docs/superpowers/plans/2026-11-10-realm-learning-woven-in.md`, Part I.
**Read by:** `src/lib/content/rune-pools.test.ts`, which holds this table to `RUNE_SKILLS` (through the shared parser in `src/test/skill-map.ts`).

A language side quest can be played as rune spellcraft: the hero walks to something in the village that needs a
rune (a broken wagon, a dark lantern), and builds a word from rune tiles to set it right. Each content band has one
pool, `src/content/runes/rune-<band>.json`, and each pool credits the language skills of its band, so a word built
right moves that skill's mastery as any side quest does.

Every entry belongs to one of the five effects (`mend`, `light`, `water`, `open`, `grow`). Its tiles hold the word
and at least three decoys, shuffled so no run of them spells the word. What the child is given depends on the band;
the validator (`src/lib/content/rune-pools.ts`) holds each rule.

## Language Arts

| Grade | Skill id | Pool | Tiles and prompt | Status |
|---|---|---|---|---|
| K | `lang-gk` | `rune-k1` | Single letters. The object's picture and a spoken word (dictation). | format built (I4); pool pending (I5) |
| 1 | `spell-g1` | `rune-k1` | Single letters. The object's picture and a spoken word (dictation). Rune-only: never multiple choice. | format built (I4); pool pending (I5) |
| 2 | `spell-g23` | `rune-g23` | Phonograms (`m`, `e`, `nd`; `l`, `igh`, `t`). The object's picture and a spoken word (dictation). | format built (I4); pool pending (I5) |
| 3 | `lang-g3` | `rune-g23` | Phonograms. The object's picture and a spoken word (dictation). | format built (I4); pool pending (I5) |
| 4 | `spell-g45` | `rune-g45` | Letters and common chunks. A short meaning, shown. | format built (I4); pool pending (I5) |
| 5 | `vocab-g45` | `rune-g45` | Letters and common chunks. A short meaning, shown. | format built (I4); pool pending (I5) |
| 6 *(6–8)* | `vocab-g68` | `rune-g68` | Morphemes: prefix, root, suffix (`re`, `store`). A definition, shown. | format built (I4); pool pending (I5) |
| 9 *(9–12)* | `vocab-g912` | `rune-g912` | Greek and Latin roots and affixes (`re`, `habilit`, `ate`). A definition, shown. | format built (I4); pool pending (I5) |

At K–3 the word is always spoken (R-I18): the child hears it and builds it, so the dictation pools' blind pass checks
only that the heard word can be built and that the shown line fits the picture. From grade 4 up the word never reaches
the browser before the answer: no prompt, hint or narration holds it, nor does the effect the stone shows.
