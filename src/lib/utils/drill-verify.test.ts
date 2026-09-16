import { describe, it, expect } from "vitest";
import { GENERATORS, seededRng, type Question } from "./drill-generators";
import { VERIFIERS } from "./drill-verify";
import { SKILLS } from "./skills";

const LEVELS = [0, 1, 2, 3, 4];
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 13);

/** Every skill that names this generator — a generator's behaviour is skill-dependent. */
const skillIdsFor = (generatorId: string) =>
  SKILLS.filter((s) => s.source.kind === "generator" && s.source.generatorId === generatorId).map((s) => s.id);

/**
 * The only generators allowed to render without a spoken form, both predating this harness:
 * `place-value` prints a digit inside a numeral and `fractions-compare` offers fractions as
 * the choices, and neither had a `readAloud` written for it. Listed rather than inferred so
 * that adding a generator without speech is a deliberate edit here, visible in review.
 */
const SPEECHLESS = new Set(["place-value", "fractions-compare"]);

const cases = Object.keys(GENERATORS).flatMap((genId) =>
  skillIdsFor(genId).flatMap((skillId) => LEVELS.map((level) => [genId, skillId, level] as [string, string, number]))
);

describe("every generated question is independently verifiable", () => {
  it("covers every generator, so the checks below are not vacuous", () => {
    expect(Object.keys(GENERATORS).length).toBeGreaterThan(0);
    expect(cases.length).toBeGreaterThanOrEqual(Object.keys(GENERATORS).length * LEVELS.length);
  });

  it("has a verifier for every generator, and no verifier without a generator", () => {
    expect(Object.keys(VERIFIERS).sort()).toEqual(Object.keys(GENERATORS).sort());
  });

  /**
   * A retired skill (`fractions-compare`, served at no grade) keeps its row and so keeps its
   * generator reachable here: this counts skill ROWS, not grades, which is what makes the check
   * about dead code rather than about the curriculum. A generator reaching zero rows really is
   * unreferenced, so this stays un-narrowed.
   */
  it("has at least one skill pointing at every generator, so none is dead", () => {
    const orphans = Object.keys(GENERATORS).filter((g) => skillIdsFor(g).length === 0);
    expect(orphans, `generators no skill uses: ${orphans.join(", ")}`).toEqual([]);
  });

  it.each(cases)("%s / %s / level %i produces questions that survive every check", (genId, skillId, level) => {
    const generate = GENERATORS[genId];
    const verify = VERIFIERS[genId];
    const byId = new Map<string, Question>();

    for (const seed of SEEDS) {
      const rng = seededRng(seed);
      for (let i = 0; i < 5; i++) {
        const q = generate(level, rng, skillId);

        // The answer is what an independent reading of the prompt says it is.
        expect(verify(q), `wrong answer key for "${q.prompt}"`).toBe(q.answer);

        // Structure: exactly four distinct choices, the answer among them.
        expect(q.choices).toHaveLength(4);
        expect(new Set(q.choices).size, `duplicate choices in "${q.prompt}"`).toBe(4);
        expect(q.choices).toContain(q.answer);

        // Nothing malformed leaks into a child's screen.
        expect(q.prompt).not.toMatch(/NaN|undefined|Infinity/);
        expect(q.answer).not.toBe("");
        expect(q.skillId).toBe(skillId);

        // Read-aloud must be speakable: no symbol a screen reader would mangle.
        // Supplying a spoken form is required, not optional: `if (readAloud !== undefined)`
        // alone meant deleting a generator's spoken argument went unnoticed, and a child on
        // read-aloud would hear "What is 3 × 4?" read out as "what is three ex four".
        // The two exemptions are the generators that have never had one; any NEW generator
        // without a spoken form is a bug, so this list must not grow.
        if (!SPEECHLESS.has(genId)) expect(q.readAloud, `${genId} supplies no read-aloud`).toBeDefined();
        if (q.readAloud !== undefined) {
          // A child using read-aloud support hears this literally, so every symbol must be
          // spelled out in words. `%` is here because `drill-generators.test.ts` banned it
          // and this list was written without it — coverage that survived only as long as
          // that older file does. A bare `-` is banned outright, which also covers the
          // "negative negative" run the old test watched for. `¢` and `$` joined when the
          // money generator arrived: its ANSWERS read "32¢" and "$1.15", which are fine on
          // a screen and unspeakable aloud, so neither may reach the spoken text.
          expect(q.readAloud, `unspeakable read-aloud: ${q.readAloud}`).not.toMatch(/[-×÷%²³√π^\/¢$]/);
        }

        // The id encodes the parameters, so the same id is always the same PROMPT. That is
        // the property `drawGenerated` rests on: it fills a deed by drawing until it has
        // eight distinct ids, so an id that does not pin the prompt lets a child be asked
        // the same question twice.
        //
        // The ANSWER is pinned too, except for the two generators whose question lives in
        // its choices rather than in its prompt. "Which number is a factor of 12?" has six
        // right answers and "Which fraction is equal to 1/2?" has infinitely many; their
        // ids name the target alone, on purpose, because an id carrying the chosen answer
        // let the SAME prompt through twice in one deed with two different right answers —
        // the first of them missing from the second question's choices. Nothing is lost by
        // exempting them: `verify(q)` above re-derives the answer on every single draw, so
        // a wrong key is caught there whether or not it matches the previous draw's. Listed
        // rather than inferred, so exempting a third generator is a deliberate edit here.
        const CHOICES_ARE_THE_DATA = new Set(["factors", "frac-equiv"]);
        const seen = byId.get(q.id);
        if (seen) {
          expect(q.prompt, `id ${q.id} asked two different prompts`).toBe(seen.prompt);
          if (!CHOICES_ARE_THE_DATA.has(genId)) expect(q.answer, `id ${q.id} gave two different answers`).toBe(seen.answer);
        } else {
          byId.set(q.id, q);
        }
      }
    }
  });

  /**
   * A question can satisfy every check above and still be defective. "Which fraction is equal
   * to 4/5?" answered `4/5`, and "Which number is a factor of 24?" answered `1` or `24`, are
   * both true and both teach nothing — the answer is read off the prompt, or off the
   * definition. Neither generator can produce one today, and each was held there by exactly
   * one assertion in one generator test. Saying it in the VERIFIER is what makes it hold for
   * every draw of every level, and these cases are what prove the verifier says it.
   */
  describe("a defective question is rejected, not merely answered", () => {
    const ask = (skillId: string, prompt: string, choices: string[], answer: string): Question =>
      ({ id: `${skillId}:golden`, skillId, prompt, choices, answer });

    it("frac-equiv refuses an answer copied off the prompt", () => {
      expect(() => VERIFIERS["frac-equiv"](ask("frac-equiv", "Which fraction is equal to 4/5?", ["4/5", "5/4", "4/6", "5/6"], "4/5")))
        .toThrow(/already names/);
      // Not vacuous: the same question scaled by 2 is answered rather than thrown.
      expect(VERIFIERS["frac-equiv"](ask("frac-equiv", "Which fraction is equal to 4/5?", ["8/10", "5/4", "4/6", "5/6"], "8/10")))
        .toBe("8/10");
    });

    it("factors refuses 1 and refuses the target", () => {
      expect(() => VERIFIERS["factors"](ask("factors", "Which number is a factor of 24?", ["1", "5", "7", "11"], "1")))
        .toThrow(/1 and itself/);
      expect(() => VERIFIERS["factors"](ask("factors", "Which number is a factor of 24?", ["24", "5", "7", "11"], "24")))
        .toThrow(/1 and itself/);
      // Not vacuous: a proper divisor of 24 is answered rather than thrown.
      expect(VERIFIERS["factors"](ask("factors", "Which number is a factor of 24?", ["6", "5", "7", "11"], "6"))).toBe("6");
    });

    it("factors refuses the target when a multiple was asked for", () => {
      // The same defect in the other wording: every number is a multiple of itself, so "6"
      // answers "which number is a multiple of 6?" truthfully and teaches nothing. The
      // generator draws from 2t up, and this is where that is insisted on.
      expect(() => VERIFIERS["factors"](ask("factors", "Which number is a multiple of 6?", ["6", "4", "5", "7"], "6")))
        .toThrow(/multiple of itself/);
      // Not vacuous: a genuine multiple of 6 is answered rather than thrown.
      expect(VERIFIERS["factors"](ask("factors", "Which number is a multiple of 6?", ["18", "4", "5", "7"], "18"))).toBe("18");
    });
  });

  /**
   * Every case, not a slice of them. This ran over `cases.slice(0, 20)`, which was `add`'s
   * three skills plus `sub-10` — seven of the nine generators then had no determinism check
   * at all, and `percent-of` drawing from `Math.random()` survived the whole suite. The
   * fraction would have shrunk with every generator added. A question that cannot be
   * replayed from its seed can never be re-asked verbatim, which is the entire reason ids
   * encode their parameters.
   */
  it.each(cases)("%s / %s / level %i replays the same questions for the same seed", (genId, skillId, level) => {
    const run = () => {
      const rng = seededRng(4242);
      return Array.from({ length: 5 }, () => GENERATORS[genId](level, rng, skillId).id);
    };
    expect(run()).toEqual(run());
  });
});

/**
 * Every rung must be a different rung — for every generated skill in the bank.
 *
 * This started as a per-file check and is universal because the same defect has now been
 * found three times, in three different files, by three different people: `two-step-eq`
 * levels 0 and 1 produced literally the same 480 equations, `exponent-rules` level 1 could
 * ask nothing level 0 could not, and `factor-quad` and `inequalities` shipped with levels 0
 * and 1 sharing a pool. A child masters a rung, is promoted, and is handed the questions
 * they just finished — while their mastery number goes up. Per-level ceilings asserted with
 * `toBeLessThanOrEqual` pin that flatness in place rather than catching it.
 *
 * What this asserts is the weakest honest form: level N must be able to ask something no
 * earlier level can. Harder rungs may and should revisit easier work; what is forbidden is a
 * rung that changes nothing.
 *
 * Honest limitation: it samples. For a small question space it is decisive; for a very large
 * one it can only fail, never prove — two levels sharing a 7,000-question pool would need an
 * exhaustive census to distinguish. It has caught every flat rung found so far.
 */
describe("every level of every skill offers something no earlier level can ask", () => {
  const LADDER_SEEDS = Array.from({ length: 120 }, (_, i) => i * 131 + 7);
  const GENERATED = SKILLS.filter((s) => s.source.kind === "generator");

  it("covers every generated skill, so the check below is not vacuous", () => {
    expect(GENERATED.length).toBeGreaterThanOrEqual(Object.keys(GENERATORS).length);
  });

  it.each(GENERATED.map((s) => [s.id, (s.source as { generatorId: string }).generatorId]))(
    "%s climbs",
    (skillId, genId) => {
      // A few generators put the whole question in the choices — "Which number is the
      // greatest?" is one prompt forever, and the four numbers are the question. For those
      // the identity is the sorted choice set; for everyone else it is the prompt, because
      // their distractors are drawn and would make every draw look unique.
      const prompts = new Set<string>();
      for (const seed of LADDER_SEEDS.slice(0, 20)) {
        const rng = seededRng(seed);
        for (const level of LEVELS) for (let i = 0; i < 6; i++) prompts.add(GENERATORS[genId](level, rng, skillId).prompt);
      }
      const identity = (q: Question) =>
        prompts.size === 1 ? [...q.choices].sort().join(",") : q.prompt;

      /**
       * The history each level is measured against is drawn TEN TIMES as heavily as the level
       * itself. Without that, the check could not see a rung whose pool is a strict SUBSET of
       * the rung below: changing a parameter shifts the rng stream, so the thinner level turns
       * up draws the thicker level's sample happened to miss, and they read as new. Saturating
       * the history removes most of that — a level with 1,186 questions was proved to slip
       * through the un-saturated version while asking literally nothing new.
       *
       * What it CAN and CANNOT do, stated precisely, because a check that is trusted past its
       * range is worse than no check:
       *
       *  - Two byte-identical rungs: **decisive.** Same parameters and the same seed stream
       *    produce the same draws, so nothing reads as fresh. Every flat rung found so far
       *    was of this kind, and all twelve were caught here.
       *  - A rung whose pool is a strict SUBSET of the one below, with a pool small enough to
       *    saturate: **decisive**, thanks to the 10x history above.
       *  - The same, with a pool too large to saturate (`inequalities`, `systems-eq`,
       *    `dec-ops` and friends run to thousands): **NOT caught.** A parameter change shifts
       *    the rng stream, the narrower level turns up draws the wider level's sample missed,
       *    and they read as new. This was demonstrated, not theorised.
       *
       * A pool-size rule would close the last case but cannot be had honestly: `frac-unit`,
       * `mul-multi`, `sequences` and `probability` all shrink legitimately between rungs,
       * because a harder level narrows to a harder SHAPE with fewer instances of it. Any
       * blanket "must not shrink" fires on all four, and an exemption list for them would rot.
       * Closing it properly needs per-generator enumeration of the parameter space, which is
       * a bigger piece of work than this plan; until then the sizes are printed on failure so
       * a human can see a shrinking rung.
       */
      const census = (level: number, seeds: number[], per: number) => {
        const out = new Set<string>();
        for (const seed of seeds) {
          const rng = seededRng(seed);
          for (let i = 0; i < per; i++) out.add(identity(GENERATORS[genId](level, rng, skillId)));
        }
        return out;
      };
      const HISTORY_SEEDS = Array.from({ length: 400 }, (_, i) => i * 7919 + 3);

      const seen = new Set<string>();
      for (const level of LEVELS) {
        const here = census(level, LADDER_SEEDS, 12);
        if (level > 0) for (const p of census(level - 1, HISTORY_SEEDS, 30)) seen.add(p);
        if (level > 0) {
          const fresh = [...here].filter((p) => !seen.has(p));
          expect(
            fresh.length,
            `${skillId} level ${level} can ask nothing level ${level - 1} could not — ${here.size} questions here, ${seen.size} already reachable`
          ).toBeGreaterThan(0);
        }
        for (const p of here) seen.add(p);
      }
    }
  );
});
