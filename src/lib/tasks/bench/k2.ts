/**
 * The K-2 bench (R-C3): `add-*` is assembled, `sub-*` is cut.
 *
 * - assemble: the mark is a sum; the villager offers 4-5 whole-number pieces, no two alike, every
 *   one shorter than the mark, of which two (the stored addends) make it. Any subset that sums to
 *   the mark counts when graded.
 * - cut: a beam of `a` has `b` cut off; the piece left is `a - b`.
 *
 * Sizes ride the same ceilings the choice generators use (`ADD_MAX`, `SUB_MAX`), so a level means
 * the same difficulty either way. The prompt's flavour is a function of the parameters (never the
 * rng), so one id is always one task.
 */
import { ADD_MAX, SUB_MAX, randInt, shuffle, speakNumber } from "@/lib/utils/drill-generators";
import type { MeasurePiece, MeasureTask } from "../types";
import type { BenchGenerator } from "./index";

type Setting = {
  /** The unit as the task carries it, and as one of it. */
  unit: string; one: string;
  /** Who is asking: the village's tradesman for this grade. */
  who: string; thing: string;
  /** K-1 children may not read: the prompt is also spoken, numbers in words. */
  spoken: boolean;
};

const BLOCKS = { unit: "blocks", one: "block" };
const FEET = { unit: "feet", one: "foot" };
const SETTINGS: Record<string, Setting> = {
  "add-10": { ...BLOCKS, who: "The well-digger", thing: "beam", spoken: true },
  "sub-10": { ...BLOCKS, who: "The well-digger", thing: "beam", spoken: true },
  "add-20": { ...BLOCKS, who: "The baker", thing: "shelf", spoken: true },
  "sub-20": { ...BLOCKS, who: "The baker", thing: "beam", spoken: true },
  "add-100": { ...FEET, who: "The mason", thing: "plank", spoken: false },
  "sub-100": { ...FEET, who: "The mason", thing: "beam", spoken: false },
};

const level4 = (level: number) => Math.min(4, Math.max(0, Math.floor(level)));
const minus = "−";

/** "7 blocks", "1 block": the label a piece, mark or sentence uses. */
const lengthText = (n: number, s: Setting, say: (n: number) => string = String) => `${say(n)} ${n === 1 ? s.one : s.unit}`;

/** The shortest mark that can offer four distinct pieces all shorter than it. */
const MIN_MARK = 5;

const assemble: BenchGenerator = (level, rng, skillId) => {
  const s = SETTINGS[skillId];
  const mark = randInt(rng, MIN_MARK, ADD_MAX[skillId][level4(level)]);
  // Two different addends: equal ones would be two pieces of one value.
  const a = randInt(rng, 1, Math.floor((mark - 1) / 2));
  const b = mark - a;
  const others = Array.from({ length: mark - 1 }, (_, i) => i + 1).filter((v) => v !== a && v !== b);
  const total = Math.min(randInt(rng, 4, 5), others.length + 2);
  const values = shuffle([a, b, ...shuffle(others, rng).slice(0, total - 2)], rng);
  const pieces: MeasurePiece[] = values.map((v) => ({ label: lengthText(v, s), value: String(v) }));
  const solution = [values.indexOf(a), values.indexOf(b)].sort((x, y) => x - y);

  const ask = (say: (n: number) => string) =>
    `${s.who} needs a ${s.thing} ${lengthText(mark, s, say)} long. Pick the pieces that make it.`;
  const task: MeasureTask = {
    kind: "measure", id: `${skillId}:asm:${mark}=${values.join(",")}`, skillId, prompt: ask(String),
    mode: "assemble", unit: s.unit, pieces, target: { label: lengthText(mark, s), value: String(mark) }, solution,
    bridge: `${a} + ${b} = ${mark}`,
    explain: `${lengthText(a, s)} and ${lengthText(b, s)} make ${lengthText(mark, s)}: ${a} + ${b} = ${mark}.`,
  };
  if (s.spoken) task.readAloud = ask(speakNumber);
  return task;
};

const cut: BenchGenerator = (level, rng, skillId) => {
  const s = SETTINGS[skillId];
  const beam = randInt(rng, 2, SUB_MAX[skillId][level4(level)]);
  const off = randInt(rng, 1, beam - 1);
  const left = beam - off;

  const ask = (say: (n: number) => string) =>
    `${s.who} has a ${s.thing} ${lengthText(beam, s, say)} long. Cut off ${lengthText(off, s, say)}. How long is the piece that's left?`;
  const task: MeasureTask = {
    kind: "measure", id: `${skillId}:cut:${beam}-${off}`, skillId, prompt: ask(String),
    mode: "cut", unit: s.unit, answer: String(left), step: "1", maxLength: String(beam),
    bridge: `${beam} ${minus} ${off} = ${left}`,
    explain: `Take ${off} from ${beam} and ${left} is left: ${beam} ${minus} ${off} = ${left}.`,
  };
  if (s.spoken) task.readAloud = ask(speakNumber);
  return task;
};

export const K2_BENCH: Record<string, BenchGenerator> = {
  "add-10": assemble, "add-20": assemble, "add-100": assemble,
  "sub-10": cut, "sub-20": cut, "sub-100": cut,
};
