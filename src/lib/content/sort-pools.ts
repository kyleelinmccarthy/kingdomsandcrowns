/**
 * Sort pools: the content behind a `sort` lock (slice 4a, R-F5). A science or vocabulary side quest
 * can be played as "sort these into two bins" instead of four-choice questions; the items come from
 * JSON pools in `src/content/sorts/<poolId>.json`, one per credited skill.
 *
 * A pool is `{ poolId, skillId, grade, sets }`. A set is one sorting job: two category names and the
 * items that belong to them (`living` / `non-living`: dog, rock, ...). Each item carries its own
 * category (0 or 1) and a mastery level 0-4, which steers how many a lock asks and how hard they are.
 *
 * This module is pure (no filesystem, no `three`, nothing server-only), so the content test, the
 * blind-pass tooling and the drawer can all share one definition of a good pool.
 *
 * `validateSortPool` is the machine's half of the review; the blind pass (`sort-blind-pass.ts`) is the
 * other half, the only check that sees whether an item is in the right bin. It is the sort-shaped twin
 * of `pool-validate.ts`, which is hard-wired to four-choice questions.
 *
 * READABILITY IS NOT CHECKED HERE, deliberately. The drill validator's Flesch-Kincaid check
 * (`checkReadability`) ignores any text under 12 words, because on short text the score measures the
 * vocabulary the item exists to teach ("photosynthesis" is a long word, not a hard sentence). A sort
 * label is at most four words, so the check would never fire. What keeps a label readable is the length
 * cap, and the blind pass covers whether a reader at the grade can place it.
 */
import { GRADES, type Grade } from "../utils/grade-levels";
import { SKILLS, findSkill } from "../utils/skills";
import type { Problem } from "./pool-validate";

export type { Problem } from "./pool-validate";

export type SortLevel = 0 | 1 | 2 | 3 | 4;

export type SortPoolItem = {
  id: string;
  label: string;
  /** Which of the set's two categories the item belongs to. */
  category: 0 | 1;
  level: SortLevel;
  readAloud?: string;
};

export type SortSet = {
  id: string;
  categories: [string, string];
  items: SortPoolItem[];
};

export type SortPool = {
  poolId: string;
  skillId: string;
  grade: Grade;
  sets: SortSet[];
};

/** Every pool id starts with this. A drill pool id never does, so a sheet in `src/content/review` cannot collide. */
export const SORT_POOL_PREFIX = "sort-";

export const SORT_POOL_RULES = {
  shape: "shape",
  poolId: "pool-id",
  skill: "credited-skill",
  grade: "grade",
  categories: "categories",
  idFormat: "id-format",
  duplicateId: "duplicate-id",
  setSize: "set-size",
  balance: "category-balance",
  poolSize: "pool-size",
  levelSpread: "level-spread",
  duplicateLabel: "duplicate-label",
  labelLength: "label-length",
  categoryWord: "category-word-in-label",
  idTellsCategory: "id-tells-category",
} as const;
const R = SORT_POOL_RULES;

export const MIN_SET_SIZE = 16;
/** Each category's share of a set. */
export const BALANCE_MIN = 0.4;
export const BALANCE_MAX = 0.6;
export const MIN_SORT_POOL_SIZE = 40;
export const MAX_LABEL_WORDS = 4;
export const MAX_LABEL_CHARS = 32;
/** The lock's prompt is "Sort these: A or B?" and must stay short, so each category is too. */
export const MAX_CATEGORY_CHARS = 20;
export const MAX_CATEGORY_WORDS = 3;
const LEVELS: readonly SortLevel[] = [0, 1, 2, 3, 4];
const SKILL_AREAS = new Set(["science", "language"]);
/** Taken in id order, the two categories must change at least this many times, or the ids run bin by bin. */
export const MIN_ID_SWITCHES = 3;
/** Ids sit inside a task id, where `:` and `,` are separators. */
const ID_FORMAT = /^[A-Za-z0-9._-]+$/;

const ID_ORDER = new Intl.Collator("en", { numeric: true });
const norm = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, " ");
const words = (s: string): string[] => s.trim().split(/\s+/).filter(Boolean);
/** Lower-case alphanumeric runs: a hyphen, dot or underscore is a word boundary, so "non-living" has "living" in it. */
const tokens = (s: string): string[] => s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

// ---------------------------------------------------------------------------
// 1. Shape: exact, no extra keys. Everything after this assumes it holds.
// ---------------------------------------------------------------------------

const isRecord = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

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
    bad(null, "a pool is an object { poolId, skillId, grade, sets }");
    return problems;
  }
  const keyProblem = exactKeys(raw, ["poolId", "skillId", "grade", "sets"]);
  if (keyProblem) bad(null, `pool: ${keyProblem}`);
  if (typeof raw.poolId !== "string") bad(null, "poolId is a string");
  if (typeof raw.skillId !== "string") bad(null, "skillId is a string");
  if (typeof raw.grade !== "string" || !(GRADES as readonly string[]).includes(raw.grade)) bad(null, `grade is one of ${GRADES.join(", ")}`);
  if (!Array.isArray(raw.sets)) {
    bad(null, "sets is an array");
    return problems;
  }
  raw.sets.forEach((set: unknown, s) => {
    const where = `set ${s + 1}`;
    if (!isRecord(set)) return bad(null, `${where} is an object`);
    const setKeys = exactKeys(set, ["id", "categories", "items"]);
    if (setKeys) bad(null, `${where}: ${setKeys}`);
    if (typeof set.id !== "string") bad(null, `${where}: id is a string`);
    const c = set.categories;
    if (!Array.isArray(c) || c.length !== 2 || !c.every((x) => typeof x === "string")) bad(null, `${where}: categories is two strings`);
    if (!Array.isArray(set.items)) return bad(null, `${where}: items is an array`);
    set.items.forEach((item: unknown, i) => {
      const at = isRecord(item) && typeof item.id === "string" ? item.id : null;
      const here = `${where}, item ${i + 1}`;
      if (!isRecord(item)) return bad(null, `${here} is an object`);
      const itemKeys = exactKeys(item, ["id", "label", "category", "level"], ["readAloud"]);
      if (itemKeys) bad(at, `${here}: ${itemKeys}`);
      if (typeof item.id !== "string") bad(at, `${here}: id is a string`);
      if (typeof item.label !== "string") bad(at, `${here}: label is a string`);
      if (item.category !== 0 && item.category !== 1) bad(at, `${here}: category is 0 or 1`);
      if (!(LEVELS as readonly unknown[]).includes(item.level)) bad(at, `${here}: level is 0, 1, 2, 3 or 4`);
      if ("readAloud" in item && typeof item.readAloud !== "string") bad(at, `${here}: readAloud is a string`);
    });
  });
  return problems;
}

// ---------------------------------------------------------------------------
// 2. Everything else, on a pool whose shape is known to be right
// ---------------------------------------------------------------------------

function checkIdentity(pool: SortPool): Problem[] {
  const problems: Problem[] = [];
  const bad = (rule: string, detail: string): void => void problems.push({ itemId: null, rule, detail });
  if (!pool.poolId.startsWith(SORT_POOL_PREFIX) || !ID_FORMAT.test(pool.poolId)) {
    bad(R.poolId, `poolId "${pool.poolId}" must be "${SORT_POOL_PREFIX}<skill>" (letters, digits, dots, dashes, underscores), e.g. sort-science-g23, so it never collides with a drill pool`);
  }
  if (SKILLS.some((s) => s.source.kind === "pool" && s.source.poolId === pool.poolId)) {
    bad(R.poolId, `poolId "${pool.poolId}" is a drill pool's id`);
  }
  const skill = findSkill(pool.skillId);
  if (!skill) {
    bad(R.skill, `skillId "${pool.skillId}" is not a skill`);
  } else {
    if (!SKILL_AREAS.has(skill.area)) bad(R.skill, `skill "${skill.id}" is in the ${skill.area} area; a sort credits science or language (vocabulary lives in language)`);
    if (!skill.grades.includes(pool.grade)) bad(R.grade, `pool grade ${pool.grade} is not skill "${skill.id}"'s grade (${skill.grades.join(", ") || "none"})`);
  }
  return problems;
}

/** Whether `text` holds a whole-word category phrase or any of its meaningful words. */
function categoryWordIn(text: string, category: string): string | null {
  const have = tokens(text);
  const phrase = tokens(category);
  const hit = (seq: string[]): boolean => seq.length > 0 && have.some((_, i) => seq.every((w, j) => have[i + j] === w));
  if (hit(phrase)) return category;
  // Short joiners ("non", "of", "in") carry no meaning on their own.
  const word = phrase.find((w) => w.length >= 4 && have.includes(w));
  return word ?? null;
}

function checkSet(set: SortSet): Problem[] {
  const problems: Problem[] = [];
  const bad = (itemId: string | null, rule: string, detail: string): void => void problems.push({ itemId, rule, detail });
  const where = `set "${set.id}"`;

  if (!ID_FORMAT.test(set.id)) bad(null, R.idFormat, `${where}: the id must be letters, digits, dots, dashes and underscores`);

  const [a, b] = set.categories;
  for (const c of set.categories) {
    if (norm(c) === "" || c.length > MAX_CATEGORY_CHARS || words(c).length > MAX_CATEGORY_WORDS) {
      bad(null, R.categories, `${where}: category "${c}" must be 1-${MAX_CATEGORY_WORDS} words and at most ${MAX_CATEGORY_CHARS} characters`);
    }
  }
  if (norm(a) === norm(b)) bad(null, R.categories, `${where}: the two categories are the same`);

  if (set.items.length < MIN_SET_SIZE) bad(null, R.setSize, `${where} has ${set.items.length} items; a set needs at least ${MIN_SET_SIZE}`);
  if (set.items.length > 0) {
    for (const c of [0, 1] as const) {
      const share = set.items.filter((i) => i.category === c).length / set.items.length;
      if (share < BALANCE_MIN || share > BALANCE_MAX) {
        bad(null, R.balance, `${where}: "${set.categories[c]}" is ${Math.round(share * 100)}% of the set; each category must be ${BALANCE_MIN * 100}-${BALANCE_MAX * 100}%`);
      }
    }
  }

  const seenLabel = new Map<string, string>();
  for (const item of set.items) {
    const label = item.label.trim();
    if (label === "" || words(label).length > MAX_LABEL_WORDS || label.length > MAX_LABEL_CHARS) {
      bad(item.id, R.labelLength, `${where}: label "${item.label}" must be 1-${MAX_LABEL_WORDS} words and at most ${MAX_LABEL_CHARS} characters`);
    }
    const key = norm(item.label);
    const first = seenLabel.get(key);
    if (first !== undefined) bad(item.id, R.duplicateLabel, `${where}: label "${item.label}" is already used by ${first}`);
    else seenLabel.set(key, item.id);

    if (!ID_FORMAT.test(item.id)) bad(item.id, R.idFormat, `${where}: item id "${item.id}" must be letters, digits, dots, dashes and underscores`);
    // The label AND the id reach the browser (the id rides in the lock's view and its task id), so neither may name a bin.
    for (const [what, text] of [["label", item.label], ["id", item.id]] as const) {
      for (const c of set.categories) {
        const found = categoryWordIn(text, c);
        if (found) bad(item.id, R.categoryWord, `${where}: the ${what} "${text}" contains "${found}", a word of the category "${c}", which gives the answer away`);
      }
    }
  }

  // The ids reach the browser too. Numbered bin by bin (liv-1 ... liv-12 living, liv-13 ... non-living) they
  // would hand over the answer, so taken in id order the categories must be well mixed.
  if (set.items.length >= MIN_SET_SIZE) {
    const byId = [...set.items].sort((x, y) => ID_ORDER.compare(x.id, y.id));
    const switches = byId.filter((item, i) => i > 0 && item.category !== byId[i - 1].category).length;
    if (switches < MIN_ID_SWITCHES) {
      bad(null, R.idTellsCategory, `${where}: in id order the items change category only ${switches} time(s); ids that run bin by bin give the answer away. Name ids after the item (e.g. "${set.id}-oak-tree"), not by number`);
    }
  }
  return problems;
}

/**
 * Every problem with a sort pool; an empty array means it passes. Takes `unknown` so a hand-edited
 * file can be judged before it is trusted: the shape is checked first, and nothing else runs on a
 * pool whose shape is wrong.
 */
export function validateSortPool(raw: unknown): Problem[] {
  const shape = checkShape(raw);
  if (shape.length > 0) return shape;
  const pool = raw as SortPool;
  const problems: Problem[] = [...checkIdentity(pool)];

  const seenSet = new Set<string>();
  const seenItem = new Map<string, string>();
  for (const set of pool.sets) {
    if (seenSet.has(set.id)) problems.push({ itemId: null, rule: R.duplicateId, detail: `set id "${set.id}" is used twice` });
    seenSet.add(set.id);
    problems.push(...checkSet(set));
    for (const item of set.items) {
      const first = seenItem.get(item.id);
      if (first !== undefined) problems.push({ itemId: item.id, rule: R.duplicateId, detail: `item id "${item.id}" is used in sets "${first}" and "${set.id}"` });
      else seenItem.set(item.id, set.id);
    }
  }

  const all = pool.sets.flatMap((s) => s.items);
  if (all.length < MIN_SORT_POOL_SIZE) {
    problems.push({ itemId: null, rule: R.poolSize, detail: `the pool has ${all.length} items; it needs at least ${MIN_SORT_POOL_SIZE}` });
  }
  const missing = LEVELS.filter((l) => !all.some((i) => i.level === l));
  if (missing.length > 0) {
    problems.push({ itemId: null, rule: R.levelSpread, detail: `no item at level ${missing.join(", ")}; every level 0-4 needs items` });
  }
  return problems;
}

/** The problems as lines, for a failure message. */
export function formatSortProblems(problems: readonly Problem[]): string {
  return problems.map((p) => `[${p.rule}]${p.itemId ? ` ${p.itemId}:` : ""} ${p.detail}`).join("\n");
}
