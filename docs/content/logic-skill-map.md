# Logic skill map, K–12

**Status:** the skill rows exist, and each has its puzzle generators (slice 4a, tasks F2 and F3)
**Implements:** R-F4, R-F6 and R-F7 of `docs/superpowers/plans/2026-11-10-realm-learning-woven-in.md`, Part F
**Companions:** `docs/content/math-skill-map.md` and `docs/content/ela-science-skill-map.md`; the tests that parse those two pin their row counts, so logic has its own file

Logic is the fifth strand. It is **generated, never authored**: every puzzle is built from a seed and checked
by a brute-force solver in tests, and it is played only on **lock** puzzles, never as multiple choice. A logic
skill therefore has no `choice` questions at all (`SkillSource` kind `lock`), and with locks switched off it
draws nothing.

Logic has **no side quests** (the owner's decision). A hero meets it on world locks, on the Puzzle Tower, and
through the Puzzle practice button. A grown-up may still pick a logic skill as a focus skill.

It is taught at the hero's **own grade**: there is no grade gap to set for it, and it belongs to no spell school.

## How the rows are laid out

There is one row per band, at the band's lowest grade, the same convention the carried-forward science pools use.
A grade with no row of its own resolves to the nearest row, easier first: a grade-3 hero gets `logic-g23`,
a grade-12 hero gets `logic-g912`.

## Logic

| Grade | Skill id | Puzzles | Status |
|---|---|---|---|
| K | `logic-k1` | Patterns (AB AB ?), sorting shapes by one attribute | new |
| 2 | `logic-g23` | 3×3 shape grids, balances, sorting by two attributes | new |
| 4 | `logic-g45` | 4×4 number cages (KenKen-style), easy at first (`+` only); some 3×3 logic grids | new |
| 6 | `logic-g68` | 4×4 cages, 3×3 logic grids | new |
| 9 | `logic-g912` | 5×5 cages, 5×5 nonograms, 4×4 logic grids | new |
