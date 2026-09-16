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

        // The id encodes the parameters, so the same id is always the same question.
        const seen = byId.get(q.id);
        if (seen) {
          expect(q.prompt).toBe(seen.prompt);
          expect(q.answer).toBe(seen.answer);
        } else {
          byId.set(q.id, q);
        }
      }
    }
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
