# Math skill map, K–12

**Status:** draft for review — no content is written against it yet
**Implements:** spec §6.2 of `docs/superpowers/specs/2026-09-14-grade-appropriate-content-design.md`
**Baseline:** Common Core State Standards for Mathematics

This table fixes what each grade practises in math. It is the place to change the curriculum: edit a
row here and the generators follow. Nothing else in the app decides what a grade covers.

Every math skill is **generated, not authored** — the answer is computed from the parameters, so a
generator cannot carry a wrong answer key (§6.3). Each generator takes a mastery level 0–4 and gets
harder within the grade, which is the ladder a child climbs before the grade itself changes.

## How to read the table

- **Skill id** is permanent. Mastery is stored per skill id, so renaming one would reset every
  child's practice history on it (§6.6).
- **Carried forward** marks a skill that exists today and keeps its id and its history.
- A skill listed at one grade is offered at that grade only. A child whose grade has no skill for a
  subject falls back to the nearest **easier** grade, never a harder one.

## The table

| Grade | Skill id | What it practises | Status |
|---|---|---|---|
| **K** | `count-seq` | Counting and number order to 20 | new |
| | `compare-num` | Which number is greater, to 10 | new |
| | `add-10` | Addition within 10 | **carried forward** |
| | `sub-10` | Subtraction within 10 | **carried forward** |
| **1** | `add-20` | Addition within 20 | **carried forward** |
| | `sub-20` | Subtraction within 20 | **carried forward** |
| | `ten-more-less` | Ten more, ten less | new |
| | `compare-num-100` | Comparing two-digit numbers | new |
| **2** | `add-100` | Addition within 100 | **carried forward** |
| | `sub-100` | Subtraction within 100 | new (reuses the `sub` generator) |
| | `skip-count` | Skip counting by 2s, 5s, 10s | new |
| | `time-clock` | Telling time to five minutes | new |
| | `money-coins` | Counting coins | new |
| **3** | `mul-facts` | Multiplication facts | **carried forward** |
| | `div-facts` | Division facts | **carried forward** |
| | `frac-unit` | Unit fractions on a number line | new |
| | `area-perimeter` | Area and perimeter of rectangles | new |
| | `round-nearest` | Rounding to the nearest 10 and 100 | new |
| | `add-1000` | Addition within 1000, with regrouping | new |
| | `sub-1000` | Subtraction within 1000, with regrouping | new |
| **4** | `mul-multi` | Multi-digit multiplication | new |
| | `div-multi` | Division with remainders | new |
| | `frac-equiv` | Equivalent fractions | new |
| | `place-value` | Place value | **carried forward** |
| | `factors` | Factors and multiples | new |
| **5** | `frac-addsub` | Adding and subtracting fractions | new |
| | `frac-mul` | Multiplying fractions | new |
| | `dec-ops` | Decimal arithmetic | new |
| | `volume-prism` | Volume of a rectangular prism | new |
| | `order-ops` | Order of operations | new |
| | `mul-standard` | Multi-digit multiplication by the standard algorithm | new (reuses the `mul-multi` generator) |
| | `div-2digit` | Division by a two-digit divisor | new |
| **6** | `ratio-rate` | Ratios and unit rates | new |
| | `frac-div` | Dividing fractions | new |
| | `integer-ops` | Integer operations | **carried forward** (from grades 6–8) |
| | `eval-expr` | Evaluating expressions | new |
| | `percent-of` | Percent of a number | **carried forward** (from grades 9–12) |
| **7** | `proportion` | Proportional relationships | new |
| | `rational-ops` | Operations with rational numbers | new |
| | `percent-change` | Percent increase and decrease | new |
| | `two-step-eq` | Two-step equations | new |
| | `circle-measure` | Circle area and circumference | new |
| **8** | `linear-eq` | Linear equations in one variable | new |
| | `slope` | Slope from two points | new |
| | `exponent-rules` | Properties of exponents | new |
| | `pythagorean` | The Pythagorean theorem | new |
| | `sci-notation` | Scientific notation | new |
| **9** *(Algebra I)* | `multi-step-eq` | Multi-step equations | new |
| | `one-step-eq` | One-step equations | **carried forward** (kept as the level-0 rung) |
| | `systems-eq` | Systems of two equations | new |
| | `factor-quad` | Factoring quadratics | new |
| | `slope-intercept` | Slope-intercept form | new |
| | `inequalities` | Solving inequalities | new |
| **10** *(Geometry)* | `angle-pairs` | Angle relationships | new |
| | `similar-tri` | Similar and congruent triangles | new |
| | `trig-ratios` | Right-triangle trigonometry | new |
| | `solid-measure` | Surface area and volume of solids | new |
| | `dist-midpoint` | Distance and midpoint | new |
| **11** *(Algebra II)* | `quad-formula` | The quadratic formula | new |
| | `poly-ops` | Polynomial arithmetic | new |
| | `radical-ops` | Radicals and rational exponents | new |
| | `log-rules` | Exponentials and logarithms | new |
| | `fn-compose` | Function composition and inverses | new |
| **12** *(Precalculus & Statistics)* | `unit-circle` | The unit circle and radians | new |
| | `sequences` | Arithmetic and geometric sequences | new |
| | `probability` | Probability of simple events | new |
| | `rational-expr` | Rational expressions | new |
| | `log-eq` | Logarithmic and exponential equations | new |

**Totals:** 68 skills across 13 grades — 11 carried forward with their history, 57 new. Three of
the new ones reuse an existing generator with a different parameter table rather than adding code
(`sub-100` reuses `sub`, `compare-num-100` reuses `compare-num`, `mul-standard` reuses
`mul-multi`), and `add-1000` and `sub-1000` share one generator between them, so 53 new
generators.

Today's math bank is 12 skills built on 9 generators, all of them keyed to a five-band ladder where
one band spans three grades. That is what this replaces.

## Three skills change which grade they are offered at

These already exist and keep their ids and every child's mastery history. What changes is the grade
that receives them, because the band they sat in spanned three grades:

| Skill | Today | Becomes | Why |
|---|---|---|---|
| `integer-ops` | grades 6–8 | grade 6 | Integers are a grade-6 standard; grades 7 and 8 get `rational-ops` and `linear-eq`. |
| `percent-of` | grades 9–12 | grade 6 | Percent of a number is grade 6. A high schooler was practising middle-school work. |
| `one-step-eq` | grades 9–12 | grade 9, level 0 | Kept as the entry rung of Algebra I rather than dropped, so no history is stranded. |

## Two gaps closed after the first pass

Reading the map back once the content had landed turned up two grades missing a standard they
plainly should have had. Both are closed above with **new ids**; nothing was renamed or moved.

| Grade | Added | Standard | Why it was missing |
|---|---|---|---|
| 3 | `add-1000`, `sub-1000` | 3.NBT.2 | `add-100` and `sub-100` sit at grade 2 and nothing carried addition and subtraction into grade 3 at all. |
| 5 | `mul-standard`, `div-2digit` | 5.NBT.5, 5.NBT.6 | `mul-multi` and `div-multi` sit at grade 4, so grade 5 practised fractions, decimals and volume but no whole-number multiplication or division. |

The ladders for these four are cut by **shape, not by size**. Within 1000 the ceiling is the
standard's, so the rungs climb through regrouping instead: nothing to carry, one regrouping, two
regroupings, then the regrouping caused by the one below it — and for subtraction the borrow
across a zero. Grade 5's multiplication buys only one rung with a longer number; the others are a
zero inside the multiplicand and a third partial-product row. Grade 5's division climbs by the
digits of the QUOTIENT, ending on the one with a zero inside it, which is the step children drop.

`fractions-compare` is the one skill with no home in this map: comparing fractions is covered inside
`frac-equiv` (grade 4) and `frac-addsub` (grade 5). Its id and its mastery rows are left in place and
simply stop being offered — **no row is deleted and no id is reused**, so nothing resets.

## What this map does not cover

Reading, Language Arts and Science get their own maps in plan 3. This is math only.
