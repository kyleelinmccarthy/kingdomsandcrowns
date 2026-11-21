/**
 * Trail pools: the content behind a reading `trail` (slice 5, R-H12). A reading side quest can be
 * played as a clue trail: the child reads a clue, walks the village to the place it tells of and
 * searches there. Each band has one pool in `src/content/trails/trail-<band>.json`, crediting one
 * reading skill (`TRAIL_SKILLS`).
 *
 * A pool is `{ poolId, skillId, band, trails }`. A trail is 2-4 clues told in order (k1: 2-3) and a
 * mastery level 0-4. A clue is `{ text, answer, redirect, ... }`: the words the child reads, the
 * anchor (`landmark:mill`) it leads to, and the line said after a wrong place. Optional: `redirects`
 * (a line for one particular wrong place), `readAloud` (a narration form), `why` (said after a miss)
 * and `parts` (the facts a clue joins, each as the places that part alone fits).
 *
 * This module is pure (no filesystem, no `three`, nothing server-only), so the content test, the
 * blind-pass tooling and the drawer share one definition of a good pool. `validateTrailPool` is the
 * machine's half of the review; the blind pass (`trail-blind-pass.ts`) is the other half, the only
 * check that sees whether a clue really fits ONE place. It is the trail-shaped twin of
 * `sort-pools.ts` and `pool-validate.ts`.
 *
 * What a clue may say depends on its band. A k1 clue may name its place ("Go to the mill."): that is
 * the reading. From g23 up a clue never names it, in its text or its `readAloud`, and at every band
 * no redirect does, because a redirect is said after a wrong place and must not hand over the right
 * one. A clue that uses a word two confusable places share (the well and the water trough) must
 * carry `parts` that rule the partner out (F-6).
 */
import { ANCHORS, ANCHOR_IDS, isAnchorId, type AnchorId } from "../realm/anchors";
import { CONTENT_BANDS, type ContentBand } from "../utils/content-bands";
import { bandTopGrade, gradeIndex } from "../utils/grade-levels";
import { findSkill } from "../utils/skills";
import { hash32 } from "./hash32";
import { CONFUSABLE_ANCHORS } from "./trail-anchor-facts";
import { READABILITY_MAX_ABOVE, READABILITY_MIN_WORDS, countWords, fleschKincaidGrade, type Problem } from "./pool-validate";
import { normLabel } from "./sort-pools";

export type { Problem } from "./pool-validate";

export type TrailLevel = 0 | 1 | 2 | 3 | 4;

export type TrailClue = {
  /** What the child reads. */
  text: string;
  /** The anchor the clue leads to. */
  answer: string;
  /** Said after a wrong place, unless `redirects` has a line for that place. */
  redirect: string;
  /** A line for one particular wrong place, by anchor id. */
  redirects?: Record<string, string>;
  /** The clue as it is spoken, when saying the text would not do (k1 clues always have one). */
  readAloud?: string;
  /** Said after a miss: why this place. From g45 up every clue has one. */
  why?: string;
  /** The facts a clue joins, each as the places that part alone fits; they meet at the answer (g68 and up). */
  parts?: string[][];
};

export type Trail = { id: string; level: TrailLevel; clues: TrailClue[] };

export type TrailPool = { poolId: string; skillId: string; band: ContentBand; trails: Trail[] };

/** Every pool id starts with this. A drill pool id never does, so a sheet in `src/content/review` cannot collide. */
export const TRAIL_POOL_PREFIX = "trail-";

/** The reading skill each band's pool credits (R-H12). */
export const TRAIL_SKILLS: Readonly<Record<ContentBand, string>> = { k1: "read-g1", g23: "read-g3", g45: "read-g4", g68: "read-g6", g912: "read-g9" };

export const TRAIL_POOL_RULES = {
  shape: "shape",
  poolId: "pool-id",
  skill: "credited-skill",
  trailId: "trail-id",
  duplicateTrail: "duplicate-trail",
  opaqueCollision: "opaque-id-collision",
  duplicateText: "duplicate-text",
  poolSize: "pool-size",
  levelSize: "level-size",
  trailLength: "trail-length",
  repeatAnchor: "repeat-anchor",
  anchor: "unknown-anchor",
  redirectKey: "redirects-answer",
  clueLength: "clue-length",
  redirectLength: "redirect-length",
  whyLength: "why-length",
  readability: "readability",
  namesAnswer: "names-answer",
  redirectNamesAnswer: "redirect-names-answer",
  confusable: "confusable",
  readAloud: "read-aloud",
  why: "why",
  parts: "parts",
  partTooNarrow: "part-too-narrow",
  partsIntersect: "parts-intersection",
  childWords: "child-words",
  characters: "unsafe-characters",
} as const;
const R = TRAIL_POOL_RULES;

/** R-H11 and F-11: a week of three reading side quests a day never repeats a trail. */
export const MIN_TRAILS = 45;
export const MIN_CLUES = 100;
export const MIN_TRAILS_PER_LEVEL = 9;
const MIN_TRAIL_CLUES = 2;
/** A trail has at most this many clues; a k1 trail one fewer. */
const MAX_TRAIL_CLUES = 4;
const MAX_K1_TRAIL_CLUES = 3;
const LEVELS: readonly TrailLevel[] = [0, 1, 2, 3, 4];

/** Clue text, at most this many characters, by band. */
const TEXT_MAX: Readonly<Record<ContentBand, number>> = { k1: 80, g23: 180, g45: 240, g68: 300, g912: 320 };
const K1_MAX_WORDS = 12;
const REDIRECT_MAX = 140;
const WHY_MAX = 200;
const TRAIL_ID = /^[a-z0-9-]{3,40}$/;

/** A grade word and the two comparatives are never said to a child (F-16): on word boundaries, so "gradually" and "upgrade" pass. */
const GRADE_WORDS = /\bgrades?\b|\bkindergarten\b/i;
const COMPARISON_WORDS = /\b(behind|ahead)\b/i;
/** Control characters (a newline would break the sheet's one-line-per-clue format), markup and backticks (its code fences). */
const UNSAFE_CHARS = /[\u0000-\u001f\u007f`<]/;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/g;

// ---------------------------------------------------------------------------
// Identity: what goes in an id, and what goes on a sheet
// ---------------------------------------------------------------------------

/** `<poolId>/<trailId>`: how a run remembers which trail a clue came from (`avoid`, R-H11). */
export const trailKey = (poolId: string, trailId: string): string => `${poolId}/${trailId}`;

const hex8 = (n: number): string => n.toString(16).padStart(8, "0");

/**
 * What the browser sees of a clue in a task id: 8 lower-case hex characters, from the pool, the
 * author's trail id and the clue's place in the trail. An author's trail id can lean on the answer
 * (`mill-walk`), so it never leaves the server. For task ids ONLY: a sheet's per-clue code is
 * `clueCode`, which follows the text, not this.
 */
export const opaqueClueId = (poolId: string, trailId: string, index: number): string => hex8(hash32(`${poolId}/${trailId}/${index}`));

/**
 * A short fingerprint of exactly what the reviewer is shown for a clue: the pool and the normalised
 * text (F-2). It is how a comparison knows an answer still belongs to the clue it was given for.
 * It deliberately does NOT cover the key (so correcting a wrong answer leaves a finished sheet valid;
 * resolutions pin the key separately, through `keyAt`) and does not follow the clue's place in the
 * pool: moving a clue to another trail keeps its code, and editing its words changes it.
 */
export const clueCode = (poolId: string, clue: Pick<TrailClue, "text">): string => hex8(hash32([poolId, normLabel(clue.text)].join("\u0000")));

/** How a clue is named in a problem or a resolution: its trail and its place in it, counting from 1. */
export const clueRef = (trailId: string, index: number): string => `${trailId}/${index + 1}`;

// ---------------------------------------------------------------------------
// 1. Shape: exact, no extra keys. Everything after this assumes it holds.
// ---------------------------------------------------------------------------

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isFilled = (x: unknown): x is string => typeof x === "string" && x.trim() !== "";

function exactKeys(x: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): string | null {
  const extra = Object.keys(x).filter((k) => !required.includes(k) && !optional.includes(k));
  if (extra.length > 0) return `unexpected key ${extra.map((k) => `"${k}"`).join(", ")}`;
  const missing = required.filter((k) => !(k in x));
  return missing.length > 0 ? `missing key ${missing.map((k) => `"${k}"`).join(", ")}` : null;
}

function checkShape(raw: unknown): Problem[] {
  const problems: Problem[] = [];
  const bad = (itemId: string | null, detail: string): void => void problems.push({ itemId, rule: R.shape, detail });
  if (!isRecord(raw)) {
    bad(null, "a pool is an object { poolId, skillId, band, trails }");
    return problems;
  }
  const keyProblem = exactKeys(raw, ["poolId", "skillId", "band", "trails"]);
  if (keyProblem) bad(null, `pool: ${keyProblem}`);
  if (typeof raw.poolId !== "string") bad(null, "poolId is a string");
  if (typeof raw.skillId !== "string") bad(null, "skillId is a string");
  if (typeof raw.band !== "string" || !(CONTENT_BANDS as readonly string[]).includes(raw.band)) bad(null, `band is one of ${CONTENT_BANDS.join(", ")}`);
  if (!Array.isArray(raw.trails)) {
    bad(null, "trails is an array");
    return problems;
  }
  raw.trails.forEach((trail: unknown, t) => {
    const where = `trail ${t + 1}`;
    if (!isRecord(trail)) return bad(null, `${where} is an object`);
    const trailKeys = exactKeys(trail, ["id", "level", "clues"]);
    if (trailKeys) bad(null, `${where}: ${trailKeys}`);
    if (typeof trail.id !== "string") bad(null, `${where}: id is a string`);
    if (!(LEVELS as readonly unknown[]).includes(trail.level)) bad(null, `${where}: level is 0, 1, 2, 3 or 4`);
    if (!Array.isArray(trail.clues)) return bad(null, `${where}: clues is an array`);
    const trailId = typeof trail.id === "string" ? trail.id : `trail ${t + 1}`;
    trail.clues.forEach((clue: unknown, c) => {
      const at = clueRef(trailId, c);
      const here = `${where}, clue ${c + 1}`;
      if (!isRecord(clue)) return bad(at, `${here} is an object`);
      const clueKeys = exactKeys(clue, ["text", "answer", "redirect"], ["redirects", "readAloud", "why", "parts"]);
      if (clueKeys) bad(at, `${here}: ${clueKeys}`);
      if (typeof clue.text !== "string") bad(at, `${here}: text is a string`);
      if (typeof clue.answer !== "string") bad(at, `${here}: answer is a string`);
      // An empty redirect would make the second-chance line read only "Not here." (H2's review).
      if (!isFilled(clue.redirect)) bad(at, `${here}: redirect is a non-empty string`);
      if ("readAloud" in clue && !isFilled(clue.readAloud)) bad(at, `${here}: readAloud is a non-empty string`);
      if ("why" in clue && !isFilled(clue.why)) bad(at, `${here}: why is a non-empty string`);
      if ("redirects" in clue) {
        if (!isRecord(clue.redirects)) bad(at, `${here}: redirects is an object of anchor id to line`);
        else if (!Object.values(clue.redirects).every(isFilled)) bad(at, `${here}: every redirects value is a non-empty string`);
      }
      if ("parts" in clue) {
        if (!Array.isArray(clue.parts) || !clue.parts.every((p: unknown) => Array.isArray(p) && p.every((x) => typeof x === "string"))) {
          bad(at, `${here}: parts is a list of lists of anchor ids`);
        }
      }
    });
  });
  return problems;
}

// ---------------------------------------------------------------------------
// 2. Everything else, on a pool whose shape is known to be right
// ---------------------------------------------------------------------------

const wordIn = (text: string, word: string): boolean => new RegExp(nameRegex(word).source, "i").test(text);

const nameRegex = (name: string): RegExp => new RegExp(`(?<![a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}(?![a-z0-9])`, "gi");

/** `text` with every whole-word occurrence of any of `names` blanked out, longest name first ("watch tower" before "tower"). */
const withoutNames = (text: string, names: readonly string[]): string =>
  [...names].sort((a, b) => b.length - a.length).reduce((t, n) => t.replace(nameRegex(n), " "), text);

/** Which of `names` the text holds as a whole word, case-insensitively, or null. */
const nameIn = (text: string, names: readonly string[]): string | null => names.find((n) => wordIn(text, n)) ?? null;

/** The anchors every part lists, in catalog order. Parts that are not anchors count as listing nothing. */
function intersection(parts: readonly (readonly string[])[]): string[] {
  return ANCHOR_IDS.filter((id) => parts.every((p) => p.includes(id)));
}

function checkIdentity(pool: TrailPool): Problem[] {
  const problems: Problem[] = [];
  const bad = (rule: string, detail: string): void => void problems.push({ itemId: null, rule, detail });
  if (pool.poolId !== `${TRAIL_POOL_PREFIX}${pool.band}`) bad(R.poolId, `poolId "${pool.poolId}" must be "${TRAIL_POOL_PREFIX}${pool.band}"`);
  const skillId = TRAIL_SKILLS[pool.band];
  if (pool.skillId !== skillId) bad(R.skill, `skillId "${pool.skillId}" must be "${skillId}", the skill band ${pool.band}'s pool credits`);
  else if (!findSkill(skillId)) bad(R.skill, `skillId "${skillId}" is not a skill`);
  return problems;
}

function checkClue(pool: TrailPool, trail: Trail, index: number): Problem[] {
  const clue = trail.clues[index];
  const problems: Problem[] = [];
  const at = clueRef(trail.id, index);
  const bad = (rule: string, detail: string): void => void problems.push({ itemId: at, rule, detail });
  const band = pool.band;
  const known = isAnchorId(clue.answer);
  const redirectLines: [string, string][] = [["redirect", clue.redirect], ...Object.entries(clue.redirects ?? {}).map(([k, v]): [string, string] => [`redirects["${k}"]`, v])];
  const fields: [string, string | undefined][] = [["text", clue.text], ["readAloud", clue.readAloud], ["why", clue.why], ...redirectLines];

  // Words and characters, in every field a child can read.
  for (const [name, value] of fields) {
    if (value === undefined) continue;
    if (UNSAFE_CHARS.test(value)) bad(R.characters, `${name} "${value.replace(CONTROL_CHARS, "?")}" has a control character, a backtick or "<"`);
    if (GRADE_WORDS.test(value)) bad(R.childWords, `${name} "${value}" says a grade or kindergarten: nobody is told a grade`);
    if (COMPARISON_WORDS.test(value)) bad(R.childWords, `${name} "${value}" says "behind" or "ahead": nobody is behind or ahead`);
  }

  // Anchors.
  if (!known) bad(R.anchor, `answer "${clue.answer}" is not an anchor`);
  for (const key of Object.keys(clue.redirects ?? {})) {
    if (!isAnchorId(key)) bad(R.anchor, `redirects key "${key}" is not an anchor`);
    else if (key === clue.answer) bad(R.redirectKey, `redirects has a line for the answer ${key}: nobody is sent away from the right place`);
  }

  // Lengths.
  if (clue.text.trim() === "" || clue.text.length > TEXT_MAX[band]) bad(R.clueLength, `text is ${clue.text.length} characters; a ${band} clue is 1-${TEXT_MAX[band]}`);
  if (band === "k1" && countWords(clue.text) > K1_MAX_WORDS) bad(R.clueLength, `text is ${countWords(clue.text)} words; a k1 clue is at most ${K1_MAX_WORDS}`);
  for (const [name, line] of redirectLines) if (line.length > REDIRECT_MAX) bad(R.redirectLength, `${name} is ${line.length} characters; at most ${REDIRECT_MAX}`);
  if (clue.why !== undefined && clue.why.length > WHY_MAX) bad(R.whyLength, `why is ${clue.why.length} characters; at most ${WHY_MAX}`);
  if (countWords(clue.text) >= READABILITY_MIN_WORDS) {
    const score = fleschKincaidGrade(clue.text);
    const ceiling = gradeIndex(bandTopGrade(band)) + READABILITY_MAX_ABOVE;
    if (score !== null && score > ceiling) bad(R.readability, `text reads at grade ${score.toFixed(1)}, above the ceiling of ${ceiling} for band ${band}`);
  }

  // Never naming the answer.
  if (known) {
    const names = ANCHORS[clue.answer as AnchorId].names;
    for (const [name, line] of redirectLines) {
      const found = nameIn(line, names);
      if (found) bad(R.redirectNamesAnswer, `${name} "${line}" names the answer ("${found}"): a line said after a wrong place must not give the right one away`);
    }
    if (band !== "k1") {
      for (const [name, value] of [["text", clue.text], ["readAloud", clue.readAloud]] as const) {
        const found = value === undefined ? null : nameIn(value, names);
        if (found) bad(R.namesAnswer, `${name} "${value}" names the answer ("${found}"); only a k1 clue may name its place`);
      }
    }
  }

  // One place only (F-6): a shared word needs parts that rule the partner out.
  if (known) {
    // A k1 clue may name its place, and a place's own name can hold a shared word ("water trough",
    // "puzzle tower"). Saying a place by its own name is no overlap, so those names are set aside
    // before the shared words are looked for; the word has to turn up anywhere else in the clue.
    const heard = withoutNames(`${clue.text}\n${clue.readAloud ?? ""}`, ANCHORS[clue.answer as AnchorId].names);
    for (const pair of CONFUSABLE_ANCHORS) {
      if (!pair.anchors.includes(clue.answer as AnchorId)) continue;
      const other = pair.anchors[0] === clue.answer ? pair.anchors[1] : pair.anchors[0];
      const shared = pair.shared.find((w) => wordIn(heard, w));
      if (!shared) continue;
      const rulesOut = (clue.parts ?? []).some((p) => p.includes(other)) && !intersection(clue.parts ?? []).includes(other);
      if (!rulesOut) bad(R.confusable, `the clue says "${shared}", which ${clue.answer} and ${other} share, and carries no parts that rule ${other} out`);
    }
  }

  // By band.
  if (band === "k1" && clue.readAloud === undefined) bad(R.readAloud, "a k1 clue always has readAloud (a kindergarten hero hears every clue)");
  if ((band === "g45" || band === "g68" || band === "g912") && clue.why === undefined) bad(R.why, `a ${band} clue has a why`);
  const needsParts = band === "g68" || band === "g912";
  if (clue.parts === undefined) {
    if (needsParts) bad(R.parts, `a ${band} clue has parts: at least 2, each at least 2 places, meeting at the answer`);
  } else {
    if (clue.parts.length < 2) bad(R.parts, `parts has ${clue.parts.length}; it needs at least 2`);
    clue.parts.forEach((part, p) => {
      for (const id of part) if (!isAnchorId(id)) bad(R.anchor, `parts[${p}] holds "${id}", which is not an anchor`);
      if (new Set(part).size < 2) bad(R.partTooNarrow, `parts[${p}] lists ${new Set(part).size} place(s); each part fits at least 2`);
    });
    const meet = intersection(clue.parts);
    if (clue.parts.length >= 2 && (meet.length !== 1 || meet[0] !== clue.answer)) {
      bad(R.partsIntersect, `parts meet at [${meet.join(", ")}], not at exactly [${clue.answer}]`);
    }
  }
  return problems;
}

/**
 * Every problem with a trail pool; an empty array means it passes. Takes `unknown` so a hand-edited
 * file can be judged before it is trusted: the shape is checked first, and nothing else runs on a
 * pool whose shape is wrong.
 */
export function validateTrailPool(raw: unknown): Problem[] {
  const shape = checkShape(raw);
  if (shape.length > 0) return shape;
  const pool = raw as TrailPool;
  const problems: Problem[] = [...checkIdentity(pool)];

  const seenTrail = new Set<string>();
  const seenText = new Map<string, string>();
  const seenCode = new Map<string, string>();
  const seenOpaque = new Map<string, string>();
  const seenOnTrail = new Set<string>();
  const maxClues = pool.band === "k1" ? MAX_K1_TRAIL_CLUES : MAX_TRAIL_CLUES;
  let clueTotal = 0;

  for (const trail of pool.trails) {
    if (!TRAIL_ID.test(trail.id)) problems.push({ itemId: null, rule: R.trailId, detail: `trail id "${trail.id}" must be 3-40 lower-case letters, digits and dashes` });
    if (seenTrail.has(trail.id)) problems.push({ itemId: null, rule: R.duplicateTrail, detail: `trail id "${trail.id}" is used twice` });
    seenTrail.add(trail.id);

    if (trail.clues.length < MIN_TRAIL_CLUES || trail.clues.length > maxClues) {
      problems.push({ itemId: null, rule: R.trailLength, detail: `trail "${trail.id}" has ${trail.clues.length} clues; a ${pool.band} trail has ${MIN_TRAIL_CLUES}-${maxClues}` });
    }
    clueTotal += trail.clues.length;

    seenOnTrail.clear();
    trail.clues.forEach((clue, i) => {
      const at = clueRef(trail.id, i);
      problems.push(...checkClue(pool, trail, i));
      if (seenOnTrail.has(clue.answer)) problems.push({ itemId: at, rule: R.repeatAnchor, detail: `trail "${trail.id}" sends the hero to ${clue.answer} twice` });
      seenOnTrail.add(clue.answer);

      const key = normLabel(clue.text);
      const firstText = seenText.get(key);
      if (firstText !== undefined) problems.push({ itemId: at, rule: R.duplicateText, detail: `the text is the same as ${firstText}'s (compared without case or spacing)` });
      else seenText.set(key, at);
      const code = clueCode(pool.poolId, clue);
      const firstCode = seenCode.get(code);
      if (firstCode !== undefined && firstText === undefined) problems.push({ itemId: at, rule: R.duplicateText, detail: `the text has the same sheet code (#${code}) as ${firstCode}'s; reword one` });
      else seenCode.set(code, at);

      const opaque = opaqueClueId(pool.poolId, trail.id, i);
      const firstOpaque = seenOpaque.get(opaque);
      if (firstOpaque !== undefined) problems.push({ itemId: at, rule: R.opaqueCollision, detail: `its opaque id ${opaque} is also ${firstOpaque}'s; rename a trail` });
      else seenOpaque.set(opaque, at);
    });
  }

  if (pool.trails.length < MIN_TRAILS || clueTotal < MIN_CLUES) {
    problems.push({ itemId: null, rule: R.poolSize, detail: `the pool has ${pool.trails.length} trails and ${clueTotal} clues; it needs at least ${MIN_TRAILS} and ${MIN_CLUES}` });
  }
  for (const level of LEVELS) {
    const n = pool.trails.filter((t) => t.level === level).length;
    if (n < MIN_TRAILS_PER_LEVEL) problems.push({ itemId: null, rule: R.levelSize, detail: `level ${level} has ${n} trails; every level needs at least ${MIN_TRAILS_PER_LEVEL}` });
  }
  return problems;
}

/** The problems as lines, for a failure message. */
export function formatTrailProblems(problems: readonly Problem[]): string {
  return problems.map((p) => `[${p.rule}]${p.itemId ? ` ${p.itemId}:` : ""} ${p.detail}`).join("\n");
}
