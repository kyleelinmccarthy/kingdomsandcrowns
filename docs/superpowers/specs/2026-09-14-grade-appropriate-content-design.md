# Grade-appropriate content — design

**Status:** approved in brainstorm, 2026-09-14
**Scope:** side-quest content (the deed engine), which serves both `/side-quests` and the Realm

---

## 1. What started this

The user, after playing:

> currently Emma is grade 6 and noah is grade 3, but it feels like the math, english and science in the realm arent grade appropriate. but also I think each needs to be able subject grade level to be set for each student - perhaps with a toggle if they arent at grade level and each wants to be set separately by the parent.

## 2. Why the content is not grade-appropriate today

Verified against the code and the local database, not inferred.

**One band per hero drives every subject.** `bandForHero(grade, ageMode)` in `src/lib/utils/content-bands.ts` returns one of five bands — `k1`, `g23`, `g45`, `g68`, `g912` — and the engine uses it for all four areas. Each band spans two or three grades, so grade 6 draws the same content as grade 8.

**The bank has holes, and the fallback fills them with easier work.** `chooseSkills` in `src/lib/utils/deed-engine.ts` walks `nearestBands(band)` easier-first when a band has nothing for an area, deliberately, so a hero is never handed harder work than their grade. Against today's skill table (`src/lib/utils/skills.ts`) that produces:

| | Emma, grade 6 (`g68`) | Noah, grade 3 (`g23`) |
|---|---|---|
| Reading | **No reading skill exists above `g23`**, so she falls back to grades 2–3 sight words | Sight words |
| Math | Two skills for all of grades 6–8 | Addition and subtraction within 20. **Multiplication is filed under `g45` and never reachable** |
| Language | Vocabulary only | Spelling |
| Science | A pool per band | A pool per band |

The drill bank holds 572 items across the five bands.

**So a per-subject picker alone cannot fix this.** Setting Emma's reading to grade 6 would still fall back to grades 2–3 sight words, because grade-6 reading does not exist. The picker is only useful once content exists at each grade it offers.

## 3. Decisions

| # | Question | Decision |
|---|---|---|
| 1 | How to produce grade-appropriate content | **Per-grade content, all subjects** — grades K–12 per strand, replacing the five bands. |
| 2 | What promotion does to a subject set away from grade | **Keep the gap.** Stored as an offset from the child's grade, so a child who is ahead stays ahead. |
| 3 | How English is set | **ELA is the umbrella; Reading and Language Arts are separate strands under it, each set on its own.** |

Decision 3 records the user's own words: "English is known as ELA - English Language Arts, reading is separate. It should cover Language Arts and Reading." It was read as two separately-settable strands grouped under ELA, and that reading was stated back before the design proceeded.

## 4. The model

### 4.1 Grades replace bands

Content is keyed by a real grade, `"K"` or `"1"`–`"12"`, per strand. The within-skill mastery rung (levels 0–4) is unchanged, so difficulty still adapts inside a grade.

The easier-first fallback is kept and now walks grades: a gap at grade 6 tries 5, then 4, and only then upward. After §6 it should rarely fire.

### 4.2 The per-strand setting is an offset

Each child has one integer per strand — Math, Reading, Language Arts, Science — being an offset from their own grade. `0` means at grade level.

`effectiveGrade(childGrade, offset) = clamp(childGrade + offset, K, 12)`, with `K` as 0.

Promotion needs no code path of its own: the child's grade changes and the offset does not, so "+1 math" follows the child from grade 4 to grade 5.

### 4.3 Edge cases

- **A child with a birth year and no grade.** A grade is estimated as age minus 5, clamped to K–12, and shown to the parent as estimated (§5.4). Offsets apply against the estimate.
- **An offset past either end.** The effective grade clamps to K or 12. The stored offset is left as the parent set it, so a later promotion can bring it back into range.

### 4.4 What changes shape

| Today | Becomes |
|---|---|
| `bandForHero(grade, ageMode): ContentBand` | a per-strand grade lookup taking the child and their offsets |
| `drill_item.band` | a grade |
| `Skill.band` in `skills.ts` | a grade |
| `chooseSkills(deed, band)` walking `nearestBands` | walking nearest grades, easier-first |

Unchanged: the deed stories, the Realm, the mastery ladder, the spell schools, and every consumer of a deed's questions.

## 5. The parent setting

### 5.1 Placement

A **Subject Levels** panel in each child's detail in Settings, beside the existing learning-profile and mastery panels. It opens with the anchor — "Noah is in grade 3" — then the strands, grouped: **Math**; **ELA**, containing **Reading** and **Language Arts**; **Science**.

### 5.2 Each strand

A toggle, **Not at grade level**, off by default. Off means an offset of 0. On reveals a picker of **concrete grades** — a parent thinks "grade 4", not "+1" — and the offset is derived from the pick. The strand shows both, e.g. `Grade 4 · 1 ahead`, `Grade 2 · 1 behind`, `Grade 3 · at grade level`. Turning the toggle off resets the strand to 0.

### 5.3 Saving

Saves on change. **The displayed value is bound directly to the saved data, never copied into local state.** On a failed save the control shows an error and stays on the saved value.

This is a hard requirement, not a style preference. The Settings bug fixed in `8d07be4` came from panels copying a child's values into `useState` and writing that copy back after the parent switched children, which overwrote a sibling's name. The existing Realm depth control in `realm-settings-panel.tsx` is the pattern to follow.

### 5.4 Edge cases as shown

- Birth year only: `Estimated grade 3 from age — set a grade in Hero Details for accuracy`.
- Clamped: `Grade K · the lowest level`, or `Grade 12 · the highest level`.

### 5.5 Who can see and change it

**Parent-only.** The server action refuses a child's own account and a view-only family member, matching `updateRealmSettings`.

**Nothing child-facing ever says "behind", "ahead" or a level.** A child reading below grade level simply receives reading that fits them. This is a firm rule: telling a child they are behind costs more than the setting gains.

### 5.6 Naming

The area labelled "Language" becomes **Language Arts** everywhere, including the side-quest subject chips, so a child's chip and a parent's setting use the same words. **Only the label changes:** the internal area id stays `"language"`, so `SkillArea`, the spell-school mapping in `AREA_SCHOOL`, every deed's `area`, and existing mastery rows need no migration. The **ELA** grouping appears only in the parent panel; children see Reading and Language Arts as subjects in their own right.

## 6. Producing the content

### 6.1 Scale

Thirteen grades × four strands: about **40 math generators** and about **1,750 authored questions**, against 572 items today.

### 6.2 The skill map comes first

Before any question is written, a skill map fixes what each grade covers in each strand, using common US grade-level standards as the baseline — Common Core for math and ELA, NGSS-aligned topics for science. The map is a reviewable artifact in the repo, and it is the place to substitute a different curriculum if the family follows one.

Illustrative, not final: grade 3 math — multiplication and division within 100, fractions on a number line, area. Grade 6 math — ratios and unit rates, dividing fractions, expressions, integers.

### 6.3 Math is generated

Each math skill is a generator with unit tests. The answer is computed, never typed; the three distractors are plausible and distinct; none equals the answer. A generator cannot carry a wrong answer key.

### 6.4 Reading, Language Arts and Science are authored

About 45 questions per grade per strand, matching today's science pools. Reading at K–1 is phonics and sight words; from grade 2 it is a short passage of two to four sentences with a comprehension question, kept short enough to fit the side-quest panel. Language Arts covers grammar, conventions, spelling and vocabulary by grade.

### 6.5 Three checks before a child sees any item

1. **Automated validation.** Exactly three distractors; the answer is not among them; distractors are distinct; no duplicate prompts within a pool; levels spread across 0–4; each prompt's measured reading level within a tolerance of its target grade (the content plan pins the tolerance and the readability formula, and applies it to prompts only — never to an answer or distractor, which are often single words).
2. **A blind answer pass.** An independent checker answers every question without seeing the answer key, and flags any item where its answer differs from the key or where more than one option is defensible. This targets what structural validation cannot see: a wrong key, an ambiguous question, a distractor that is also correct.
3. **A `/dev/content` page.** Pick a grade and strand; see every question with its answer marked. Dev-only, never reachable by families, for the parent's spot-checks.

An item that fails check 1 or is flagged by check 2 does not ship until corrected.

### 6.6 Mastery progress is preserved

Mastery rungs are stored per skill id in `skill_mastery`. Re-keying every skill would silently reset each child's progress. So **existing skill ids are kept wherever a skill carries forward** (addition within 20 remains the same skill when it moves from a band to a grade), and existing band content is mapped onto grades rather than discarded. Only genuinely new skills start at zero.

## 7. What this deliberately does not do

- **Regular quests.** This covers side-quest content only. Parent-assigned quests are unchanged.
- **Adaptive placement.** No test decides a child's level. The parent sets it; mastery adapts within it.
- **Showing a child their level**, in any form (§5.5).
- **Any roadmap slice.** Art, the castle, the world's size and the minimap are the Realm overhaul's slices 2–13, specified separately and sequenced after this.

## 8. Three plans, in order

1. **The model and the setting** (§4, §5). Small, and it unblocks the rest.
2. **Math generators per grade** (§6.2, §6.3). Verifiable by code.
3. **Authored pools per grade**, strand by strand, each through all three checks (§6.4–§6.6), with the skill map and `/dev/content` built first.

## 9. Testing

- **Pure and unit-tested:** `effectiveGrade` including both clamps and the promotion case; the birth-year estimate; the grade-walking fallback; every math generator (answer correct by construction, distractors distinct, none equal to the answer); the validators in §6.5.
- **Component:** the Subject Levels panel — toggle off means grade level, picking a grade derives the offset, the saved value is shown rather than a local copy, a failed save reverts, and **switching children shows the new child's levels** (the regression `8d07be4` fixed, guarded here too).
- **Authorisation:** the action refuses a child's account and a view-only member.
- **Content:** the automated validators run in CI over every pool; the blind answer pass runs before a pool ships.
- **Copy:** a test asserts no child-facing string contains "behind", "ahead" or a level.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Wrong answer keys across ~1,750 authored items | Blind answer pass (§6.5.2) plus parent spot-checks on `/dev/content` |
| Children lose mastery progress | Existing skill ids kept where a skill carries forward (§6.6) |
| Reading passages overflow the side-quest panel | Two to four sentences, checked in the panel before a pool ships |
| The skill map does not match the family's curriculum | The map is reviewed before content is written (§6.2) |
| A stale-state save writes one child's levels onto another | Values bound to saved data, never copied to state (§5.3), with a switching test |
