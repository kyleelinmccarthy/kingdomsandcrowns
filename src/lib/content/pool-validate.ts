/**
 * What stands in the verifier's place for authored content.
 *
 * Math side-quest questions are generated, so every answer can be recomputed from the question
 * and checked by an independent verifier. Reading, Language Arts and Science are written by a
 * person: there is no formula to recompute, so nothing mechanical can tell us the answer key is
 * right. That is the blind pass's job (spec §6.5.2).
 *
 * This module is the other half — everything about an authored item that a machine CAN see:
 * the shape of the choices, the spread of levels, the size of the pool, whether the text can be
 * spoken, whether the prompt reads at the grade it is aimed at, whether the answer wears a
 * tell that lets a child score full marks without knowing anything, and whether a child who is
 * LISTENING to the question rather than reading it is given enough to answer at all.
 *
 * `validatePool` returns every problem it finds. An empty array means the pool passes. Each rule
 * is its own exported function so a failure names the rule that broke, and so a rule can be
 * exercised on its own.
 */
import { GRADES, gradeIndex, type Grade } from "../utils/grade-levels";

export type PoolItem = {
  id: string;
  prompt: string;
  answer: string;
  distractors: string[];
  readAloud?: string;
  level?: number;
};

export type Pool = {
  poolId: string;
  grade: Grade;
  items: PoolItem[];
};

/**
 * `itemId` is null for a problem that belongs to the pool as a whole rather than to one item —
 * the pool is too small, a level is missing, the answer is the longest choice too often.
 */
export type Problem = { itemId: string | null; rule: string; detail: string };

/** The rule names a `Problem` can carry. Stable strings: tests and reports group by them. */
export const RULES = {
  choices: "four-distinct-choices",
  duplicatePrompt: "duplicate-prompt",
  levelSpread: "level-spread",
  poolSize: "pool-size",
  readAloud: "read-aloud",
  readability: "readability",
  lengthTell: "length-tell",
  aboveOrBelow: "all-of-the-above",
  homophone: "homophone-by-ear",
} as const;

/** A deed asks 8 questions from one pool, so a pool needs comfortably more than 8. Target is 45. */
export const MIN_POOL_SIZE = 40;

/** `seed-drills.ts` writes `level ?? 2`, so an item with no level is a level-2 item here too. */
const DEFAULT_LEVEL = 2;
const LEVELS = [0, 1, 2, 3, 4] as const;

/** Trimmed and case-insensitive: "Cat" and "cat" are the same choice to a child. */
function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function choicesOf(item: PoolItem): string[] {
  return [item.answer, ...item.distractors];
}

// ---------------------------------------------------------------------------
// 1. Four distinct choices
// ---------------------------------------------------------------------------

/**
 * Exactly three distractors, none equal to the answer, no two equal. A child shown the same
 * text twice has either two right answers or one fewer wrong one; both break the question.
 */
export function checkChoices(pool: Pool): Problem[] {
  const problems: Problem[] = [];
  for (const item of pool.items) {
    if (item.distractors.length !== 3) {
      problems.push({
        itemId: item.id,
        rule: RULES.choices,
        detail: `has ${item.distractors.length} distractors, expected 3`,
      });
    }
    const seen = new Map<string, number>();
    for (const choice of choicesOf(item)) seen.set(norm(choice), (seen.get(norm(choice)) ?? 0) + 1);
    for (const [value, count] of seen) {
      if (count > 1) {
        const alsoAnswer = norm(item.answer) === value;
        problems.push({
          itemId: item.id,
          rule: RULES.choices,
          detail: alsoAnswer
            ? `a distractor repeats the answer ("${item.answer.trim()}")`
            : `two distractors are the same choice ("${value}")`,
        });
      }
    }
    for (const choice of choicesOf(item)) {
      if (choice.trim() === "") {
        problems.push({ itemId: item.id, rule: RULES.choices, detail: "a choice is empty" });
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 2. No duplicate prompts within a pool
// ---------------------------------------------------------------------------

/**
 * Two items that ask the same question can be drawn into the same deed, where the child is asked
 * it twice — and if their answers differ, one of them is wrong. Compared the same way as choices:
 * trimmed and case-insensitively.
 *
 * DEPARTURE FROM THE BRIEF: a shared prompt alone is not the defect; a shared prompt AND a shared
 * CHOICE is. Some question shapes carry the whole question in the choices and the prompt is a
 * standing instruction. Spelling is the clearest: every item in `spelling-g23` and `spelling-g45`
 * asks "Which is spelled correctly?", because naming the word in the prompt would spell it — the
 * prompt cannot be made unique without giving the answer away. Read literally, rule 2 flags 92 of
 * those 92 items, which is 80% of every problem the corpus produces, and all of it correct
 * content. That is a rule nobody can satisfy, and it would be suppressed within a week.
 *
 * Requiring an overlapping choice keeps everything the rule was for. The severe case — the same
 * question with two different answer keys — has the two items' choice sets drawn from the same
 * small set, so it overlaps and still fires. So does the redundant case, where the answer itself
 * is shared. What it lets through is the one shape it should: forty-six spelling items whose
 * choice sets are disjoint because they are about forty-six different words.
 */
export function checkDuplicatePrompts(pool: Pool): Problem[] {
  const problems: Problem[] = [];
  const byPrompt = new Map<string, { id: string; choices: Set<string> }[]>();
  for (const item of pool.items) {
    const key = norm(item.prompt);
    const choices = new Set(choicesOf(item).map(norm));
    for (const earlier of byPrompt.get(key) ?? []) {
      const shared = [...choices].filter((c) => earlier.choices.has(c));
      if (shared.length > 0) {
        problems.push({
          itemId: item.id,
          rule: RULES.duplicatePrompt,
          detail: `asks the same question as ${earlier.id} — same prompt ("${item.prompt.trim()}") and a shared choice ("${shared[0]}")`,
        });
        break;
      }
    }
    byPrompt.set(key, [...(byPrompt.get(key) ?? []), { id: item.id, choices }]);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 3. Levels span 0-4
// ---------------------------------------------------------------------------

/**
 * Mastery climbs through five rungs, so a pool with a hole in its levels has a rung it cannot
 * serve, and a pool where one level holds more than half the items is that rung wearing the
 * others as a disguise.
 */
export function checkLevelSpread(pool: Pool): Problem[] {
  const problems: Problem[] = [];
  const count = new Map<number, number>();
  for (const item of pool.items) {
    const level = item.level ?? DEFAULT_LEVEL;
    count.set(level, (count.get(level) ?? 0) + 1);
    if (!(LEVELS as readonly number[]).includes(level)) {
      problems.push({
        itemId: item.id,
        rule: RULES.levelSpread,
        detail: `level ${level} is outside 0-4`,
      });
    }
  }
  for (const level of LEVELS) {
    if ((count.get(level) ?? 0) === 0) {
      problems.push({ itemId: null, rule: RULES.levelSpread, detail: `no item at level ${level}` });
    }
  }
  const half = pool.items.length / 2;
  for (const level of LEVELS) {
    const n = count.get(level) ?? 0;
    if (n > half) {
      problems.push({
        itemId: null,
        rule: RULES.levelSpread,
        detail: `level ${level} holds ${n} of ${pool.items.length} items, more than half`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 4. Pool size
// ---------------------------------------------------------------------------

/** A deed asks 8; at 40 the same eight questions do not come back around. */
export function checkPoolSize(pool: Pool): Problem[] {
  if (pool.items.length >= MIN_POOL_SIZE) return [];
  return [
    {
      itemId: null,
      rule: RULES.poolSize,
      detail: `${pool.items.length} items, fewer than the ${MIN_POOL_SIZE} a pool needs`,
    },
  ];
}

// ---------------------------------------------------------------------------
// 5. Read-aloud present and speakable
// ---------------------------------------------------------------------------

/**
 * Characters a speech synthesiser either reads out literally or swallows. A blank line of
 * underscores becomes "underscore underscore underscore"; a slash becomes "slash". Quotation
 * marks and ordinary punctuation are fine and stay off this list — `"because"` is spoken
 * correctly, and quoting the target word is how half the Language Arts prompts are written.
 */
const UNSPEAKABLE = /[_*/\\|^~<>{}[\]#@=+]|\.\.\./;

/** `5th` is read as "five th" by some voices. Ordinals belong in the read-aloud as words. */
const DIGIT_ORDINAL = /\b\d+(?:st|nd|rd|th)\b/i;

/**
 * What a child actually hears. `deed-player.tsx` speaks `readAloud ?? prompt`, so that fallback
 * is the string this rule measures.
 *
 * DEPARTURE FROM THE BRIEF, and the reason is in the corpus. The brief says "read-aloud present":
 * read literally, that demands a `readAloud` field on every item, which would flag 356 of the 572
 * items that exist — every science and vocabulary item, whose prompts are plain speakable English
 * and for which a `readAloud` field would be a verbatim copy of the prompt. Presence of the field
 * is not the property worth checking; whether the spoken string can be spoken is. So this rule
 * checks the string the app will actually speak, and adds the case the fallback silently gets
 * wrong: a prompt that is NOT speakable (a fill-in-the-blank line, a slash, a digit ordinal) and
 * carries no `readAloud` to speak instead. That is the defect a Language Arts pool full of
 * `The cat ___ on the mat` will produce, and mere presence of the field would not have caught it.
 */
export function checkReadAloud(pool: Pool): Problem[] {
  const problems: Problem[] = [];
  for (const item of pool.items) {
    const hasOwn = item.readAloud !== undefined;
    if (hasOwn && (item.readAloud ?? "").trim() === "") {
      problems.push({ itemId: item.id, rule: RULES.readAloud, detail: "readAloud is empty" });
      continue;
    }
    const spoken = hasOwn ? (item.readAloud as string) : item.prompt;
    if (spoken.trim() === "") {
      problems.push({ itemId: item.id, rule: RULES.readAloud, detail: "nothing to speak: the prompt is empty and there is no readAloud" });
      continue;
    }
    const banned = UNSPEAKABLE.exec(spoken);
    if (banned) {
      problems.push({
        itemId: item.id,
        rule: RULES.readAloud,
        detail: hasOwn
          ? `readAloud contains "${banned[0]}", which is read out literally`
          : `the prompt is spoken as-is and contains "${banned[0]}", which is read out literally — give it a readAloud`,
      });
    }
    const ordinal = DIGIT_ORDINAL.exec(spoken);
    if (ordinal) {
      problems.push({
        itemId: item.id,
        rule: RULES.readAloud,
        detail: `"${ordinal[0]}" is a digit ordinal; spell it as a word in readAloud`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 6. Readability
// ---------------------------------------------------------------------------

/**
 * Syllables, by the usual heuristic: count vowel groups, drop a silent trailing `e`, never go
 * below one. It is approximate — every syllable counter is — and it is applied identically to
 * every prompt, so the comparison between an item and its grade is consistent even where the
 * absolute count is a syllable out.
 */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w === "") return 0;
  if (w.length <= 3) return 1;
  const trimmed = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  return Math.max(1, (trimmed.match(/[aeiouy]{1,2}/g) ?? []).length);
}

export function countWords(text: string): number {
  return (text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? []).length;
}

/**
 * FLESCH-KINCAID GRADE LEVEL, the formula this project uses for authored prompts (spec §6.5.1):
 *
 *     0.39 x (words / sentences) + 11.8 x (syllables / words) - 15.59
 *
 * Returns null for text with no words at all.
 */
export function fleschKincaidGrade(text: string): number | null {
  const words = text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
  if (words.length === 0) return null;
  const sentences = Math.max(1, (text.split(/[.!?]+/).filter((s) => s.trim() !== "")).length);
  const syllables = words.reduce((sum, w) => sum + countSyllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59;
}

/**
 * TOLERANCE: a prompt may read up to TWO grades above the grade the pool is authored for.
 * There is no lower bound, and the check starts at grade 2 and at 12 words. All three of those
 * are departures from the brief, measured against the 572 items that exist. See below.
 */
export const READABILITY_MAX_ABOVE = 2;
export const READABILITY_FIRST_GRADE = 2;
export const READABILITY_MIN_WORDS = 12;

/**
 * Reading level within tolerance of the target grade, over the PROMPT ONLY — never over an
 * answer or a distractor, which are often single words and would score as nonsense.
 *
 * TWO DEPARTURES FROM THE BRIEF, both because the rule as written cannot be satisfied by good
 * content. The brief's own instruction was to say so and write the rule I judge right.
 *
 * 1. NO LOWER BOUND. The brief asked for +/-2. The lower half fires on correct content and
 *    punishes exactly the thing a question stem should be: plain. Measured on the existing
 *    corpus it would flag 43 of 59 sight-word prompts at grade 2 (`Which word is "because"?`),
 *    26 of 44 vocabulary prompts at grade 9, and 21 of 45 science prompts at grade 9. To clear
 *    it, an author would have to pad a stem with subordinate clauses — making the question
 *    HARDER TO READ without making it harder to answer, which is the opposite of the point. The
 *    difficulty of an authored item lives in its content and its distractors, not in the syntax
 *    of its stem, and a stem that reads easily is never a harm to a child. A pool whose CONTENT
 *    is too easy for its grade is a real risk, but Flesch-Kincaid on a question stem cannot see
 *    it; that is the blind pass's and the /dev/content page's job.
 *
 * 2. A MINIMUM OF 12 WORDS. Flesch-Kincaid is calibrated on continuous prose. On a short stem
 *    the syllables-per-word term dominates completely and a single necessary technical word
 *    sets the score: `What is photosynthesis?` scores 13.1 and `Which habitat has many trees?`
 *    scores 5.2 — so the rule as written calls the first too hard for grade 6 and the second
 *    too hard for grade 2. Neither is a readability defect, and you cannot ask about
 *    photosynthesis without the word. Below 12 words the score measures vocabulary the item is
 *    there to teach; at 12 and above it starts measuring sentences. This deliberately points
 *    the rule where it has teeth and where it matters most: from grade 2 Reading is a two-to-
 *    four-sentence passage, which is long enough for the formula to mean something.
 *
 * Unchanged from the brief: the formula, the +2 ceiling, and the exemption of K and 1, whose
 * prompts are phonics and sight words where the formula is meaningless in either direction.
 */
export function checkReadability(pool: Pool): Problem[] {
  if (gradeIndex(pool.grade) < READABILITY_FIRST_GRADE) return [];
  const ceiling = gradeIndex(pool.grade) + READABILITY_MAX_ABOVE;
  const problems: Problem[] = [];
  for (const item of pool.items) {
    if (countWords(item.prompt) < READABILITY_MIN_WORDS) continue;
    const score = fleschKincaidGrade(item.prompt);
    if (score === null) continue;
    if (score > ceiling) {
      problems.push({
        itemId: item.id,
        rule: RULES.readability,
        detail: `prompt reads at grade ${score.toFixed(1)}, above the grade ${ceiling} ceiling for a grade ${pool.grade} pool`,
      });
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 7. No length tell
// ---------------------------------------------------------------------------

/**
 * The share of a pool's items in which the answer may be the strictly longest choice, or the
 * strictly shortest. Chance alone puts it near 25% each way; the twelve pools that exist run
 * 0-34% longest and 0-23% shortest, so 60% leaves real content plenty of room and still catches
 * a pool a child could farm.
 */
export const LENGTH_TELL_MAX_SHARE = 0.6;

/**
 * No length tell. This is the authored twin of the position tell that appeared nineteen times in
 * the math content — the answer sitting at a predictable place among the choices, so a child
 * scores full marks by pattern rather than by knowing anything. In math the tell was sorted
 * position; in authored multiple choice, length is the cheapest equivalent: the fully-qualified
 * true statement is longer than the three throwaways, unless the author works at it.
 *
 * Counted STRICTLY. An answer that ties another choice for longest is no tell at all: a child
 * following "pick the long one" cannot tell which of the two to pick.
 */
export function checkLengthTell(pool: Pool): Problem[] {
  if (pool.items.length === 0) return [];
  let longest = 0;
  let shortest = 0;
  for (const item of pool.items) {
    const answer = item.answer.trim().length;
    const others = item.distractors.map((d) => d.trim().length);
    if (others.length === 0) continue;
    if (answer > Math.max(...others)) longest += 1;
    if (answer < Math.min(...others)) shortest += 1;
  }
  const problems: Problem[] = [];
  const cap = LENGTH_TELL_MAX_SHARE;
  const n = pool.items.length;
  if (longest / n > cap) {
    problems.push({
      itemId: null,
      rule: RULES.lengthTell,
      detail: `the answer is the longest choice in ${longest} of ${n} items (${Math.round((longest / n) * 100)}%), over the ${Math.round(cap * 100)}% cap`,
    });
  }
  if (shortest / n > cap) {
    problems.push({
      itemId: null,
      rule: RULES.lengthTell,
      detail: `the answer is the shortest choice in ${shortest} of ${n} items (${Math.round((shortest / n) * 100)}%), over the ${Math.round(cap * 100)}% cap`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 8. No "all of the above" / "none of the above"
// ---------------------------------------------------------------------------

/**
 * These are never a real choice: they are either the answer or filler, and a child learns which
 * within a deed or two. They also break the shuffle — a choice that refers to a position stops
 * meaning anything once the choices are reordered, which this app does on every draw.
 */
const ABOVE_OR_BELOW = /\b(?:all|none|any|both)\s+of\s+(?:the\s+)?(?:above|below|these|them|the\s+others)\b/i;

export function checkAboveOrBelow(pool: Pool): Problem[] {
  const problems: Problem[] = [];
  for (const item of pool.items) {
    for (const choice of choicesOf(item)) {
      const hit = ABOVE_OR_BELOW.exec(choice);
      if (hit) {
        problems.push({
          itemId: item.id,
          rule: RULES.aboveOrBelow,
          detail: `a choice is "${hit[0]}"`,
        });
      }
    }
  }
  return problems;
}

// ---------------------------------------------------------------------------
// 9. Answerable by ear: a homophone pair the audio cannot tell apart
// ---------------------------------------------------------------------------

/**
 * Words that sound alike. Grouped, so `right`, `write` and `rite` are one entry and every pair
 * inside a group is a homophone of every other.
 *
 * THIS LIST IS NECESSARILY INCOMPLETE, and it cannot be otherwise: English homophony is not a
 * closed set, it shifts with accent (`merry`/`marry`/`Mary` are three words here and one in much
 * of North America), and no rule short of a pronouncing dictionary — which would still disagree
 * with the voice the browser actually uses — can enumerate it. So read a green run of this rule
 * as "none of the pairs we know about is unspoken", never as "no item is ambiguous by ear". It
 * catches the cases that exist; it does not prove none remain. When a reader reports a new pair,
 * the fix is to add it here as well as to fix the item, so the class cannot come back.
 */
const HOMOPHONE_GROUPS: readonly (readonly string[])[] = [
  ["ad", "add"], ["aid", "aide"], ["ail", "ale"], ["air", "heir"], ["aisle", "isle", "i'll"],
  ["allowed", "aloud"], ["altar", "alter"], ["ant", "aunt"], ["ate", "eight"], ["bail", "bale"],
  ["bare", "bear"], ["be", "bee"], ["beat", "beet"], ["berry", "bury"], ["berth", "birth"],
  ["billed", "build"], ["blew", "blue"], ["board", "bored"], ["brake", "break"], ["bread", "bred"],
  ["buy", "by", "bye"], ["cell", "sell"], ["cent", "scent", "sent"], ["cereal", "serial"],
  ["chews", "choose"], ["chord", "cord"], ["cite", "sight", "site"], ["coarse", "course"],
  ["creak", "creek"], ["days", "daze"], ["dear", "deer"], ["dew", "do", "due"], ["die", "dye"],
  ["doe", "dough"], ["earn", "urn"], ["eye", "i"], ["fair", "fare"], ["feat", "feet"],
  ["find", "fined"], ["fir", "fur"], ["flea", "flee"], ["flew", "flu", "flue"],
  ["flour", "flower"], ["for", "fore", "four"], ["foul", "fowl"], ["gait", "gate"],
  ["grate", "great"], ["groan", "grown"], ["guessed", "guest"], ["hair", "hare"],
  ["hall", "haul"], ["heal", "heel"], ["hear", "here"], ["heard", "herd"], ["hi", "high"],
  ["higher", "hire"], ["hoarse", "horse"], ["hole", "whole"], ["hour", "our"], ["idle", "idol"],
  ["in", "inn"], ["its", "it's"], ["knead", "need"], ["knew", "new"], ["knight", "night"],
  ["knot", "not"], ["know", "no"], ["knows", "nose"], ["lead", "led"], ["lessen", "lesson"],
  ["loan", "lone"], ["made", "maid"], ["mail", "male"], ["main", "mane"], ["meat", "meet"],
  ["might", "mite"], ["missed", "mist"], ["moan", "mown"], ["morning", "mourning"],
  ["muscle", "mussel"], ["none", "nun"], ["oar", "or", "ore"], ["one", "won"], ["pail", "pale"],
  ["pain", "pane"], ["pair", "pear", "pare"], ["patience", "patients"], ["pause", "paws"],
  ["peace", "piece"], ["peak", "peek"], ["peal", "peel"], ["pedal", "peddle"], ["peer", "pier"],
  ["plain", "plane"], ["pole", "poll"], ["poor", "pour", "pore"], ["praise", "prays", "preys"],
  ["pray", "prey"], ["principal", "principle"], ["profit", "prophet"], ["rain", "reign", "rein"],
  ["raise", "rays", "raze"], ["rap", "wrap"], ["read", "red"], ["reed", "read"], ["right", "rite", "write"],
  ["ring", "wring"], ["road", "rode", "rowed"], ["role", "roll"], ["root", "route"],
  ["rose", "rows"], ["rote", "wrote"], ["sail", "sale"], ["scene", "seen"], ["sea", "see"],
  ["seam", "seem"], ["sew", "so", "sow"], ["shoe", "shoo"], ["some", "sum"], ["son", "sun"],
  ["soar", "sore"], ["sole", "soul"], ["stair", "stare"], ["stake", "steak"],
  ["stationary", "stationery"], ["steal", "steel"], ["straight", "strait"], ["suite", "sweet"],
  ["tail", "tale"], ["taught", "taut"], ["tea", "tee"], ["team", "teem"], ["tear", "tier"],
  ["their", "there", "they're"], ["threw", "through"], ["throne", "thrown"], ["thyme", "time"],
  ["tide", "tied"], ["to", "too", "two"], ["toad", "towed", "toed"], ["toe", "tow"],
  ["vain", "vane", "vein"], ["vary", "very"], ["wail", "whale"], ["waist", "waste"],
  ["wait", "weight"], ["war", "wore"], ["ware", "wear", "where"], ["way", "weigh", "whey"],
  ["we", "wee"], ["weak", "week"], ["weather", "whether"], ["which", "witch"],
  ["whine", "wine"], ["who's", "whose"], ["wood", "would"], ["yoke", "yolk"],
  ["your", "you're", "yore"],
];

/** Every homophone, pointing at the other members of its group. */
const HOMOPHONES = ((): Map<string, Set<string>> => {
  const map = new Map<string, Set<string>>();
  for (const group of HOMOPHONE_GROUPS) {
    for (const word of group) {
      const set = map.get(word) ?? new Set<string>();
      for (const other of group) if (other !== word) set.add(other);
      map.set(word, set);
    }
  }
  return map;
})();

/** A choice as one comparable word: lower case, letters and apostrophes only. */
function wordKey(text: string): string {
  return text.trim().toLowerCase().replace(/[’]/g, "'").replace(/[^a-z']/g, "");
}

export function soundAlike(a: string, b: string): boolean {
  const x = wordKey(a);
  const y = wordKey(b);
  if (x === "" || x === y) return false;
  return HOMOPHONES.get(x)?.has(y) ?? false;
}

/**
 * Words that carry no context of their own: the frame a question is built from, and the
 * grammatical glue inside a sense phrase. `Which word is "for"?` is made entirely of these, and
 * so is the bare word on its own — which is the point. Anything left over after these and the
 * four choices are removed is something a listener can actually use to choose.
 *
 * Kept deliberately small and function-word-only. A content word that happens to be frequent
 * (`turn`, `gift`, `book`) must never appear here, or a real sense phrase would stop counting.
 */
const FRAME_WORDS = new Set([
  "a", "about", "an", "and", "answer", "are", "as", "at", "be", "best", "but", "by", "choose",
  "correct", "correctly", "definition", "do", "does", "each", "find", "fits", "for", "from",
  "goes", "had", "has", "have", "he", "her", "here", "hers", "him", "his", "how", "i", "if",
  "in", "into", "is", "it", "its", "like", "listen", "means", "meaning", "mean", "me", "my",
  "name", "not", "of", "on", "one", "or", "our", "out", "pick", "read", "said", "same", "say",
  "says", "she", "should", "so", "sound", "sounds", "spell", "spelled", "spelling", "text",
  "that", "the", "their", "them", "then", "there", "these", "they", "this", "those", "to",
  "up", "us", "was", "we", "well", "were", "what", "when", "which", "who", "whose", "why",
  "will", "with", "word", "words", "would", "write", "you", "your", "yours",
]);

/**
 * RULE 9 — a question a child listening to it cannot answer.
 *
 * Two readers on the blind pass raised the same conditional from opposite ends of the corpus:
 * an item that pairs a word with its homophone reads perfectly and breaks the moment it is
 * spoken. It is spoken. `deed-player.tsx` speaks `readAloud ?? prompt`, and in the sight-word
 * pools `readAloud` was the bare answer word, so a child on read-aloud support heard "right"
 * and was asked to choose between `right` and `write`. There is nothing in that audio to choose
 * with. The nine items this found were in the two pools aimed at the youngest readers — the
 * children most likely to be listening rather than reading in the first place.
 *
 * What the rule checks: when a distractor is a homophone of the answer, the spoken string must
 * carry something besides the two words and the question's own frame. Strip the four choices and
 * the function words out of what will be spoken; if nothing is left, the audio is the same audio
 * whichever of the pair is meant, and the item is unanswerable by ear.
 *
 * That test is a proxy for meaning and it knows it. It cannot tell whether the context it finds
 * actually points at the right word — `right, as in turn right` passes and so would `right, as
 * in xylophone` — and it is only as complete as `HOMOPHONE_GROUPS` above. It catches a bare word
 * spoken beside its twin, which is the whole of the defect that existed, and it makes the next
 * one cost an author one sense phrase rather than a child a wrong mark they did not earn.
 */
export function checkHomophoneByEar(pool: Pool): Problem[] {
  const problems: Problem[] = [];
  for (const item of pool.items) {
    const twin = item.distractors.find((d) => soundAlike(item.answer, d));
    if (twin === undefined) continue;

    const spoken = (item.readAloud ?? item.prompt) || "";
    const choices = new Set(choicesOf(item).map(wordKey));
    const context = (spoken.toLowerCase().match(/[a-z][a-z'’-]*/g) ?? []).filter((token) => {
      const key = wordKey(token);
      if (key === "" || choices.has(key)) return false;
      if (HOMOPHONES.get(wordKey(item.answer))?.has(key)) return false;
      return !FRAME_WORDS.has(key);
    });
    if (context.length > 0) continue;

    problems.push({
      itemId: item.id,
      rule: RULES.homophone,
      detail:
        `what the app speaks ("${spoken.trim()}") does not distinguish the answer ` +
        `("${item.answer.trim()}") from the distractor "${twin.trim()}" — they are homophones, ` +
        `so give readAloud a sense phrase that tells them apart`,
    });
  }
  return problems;
}

// ---------------------------------------------------------------------------

/** Structural problems that are not one of the nine rules: a pool that is not a pool. */
function checkShape(pool: Pool): Problem[] {
  const problems: Problem[] = [];
  if (!(GRADES as readonly string[]).includes(pool.grade)) {
    problems.push({ itemId: null, rule: RULES.poolSize, detail: `grade "${pool.grade}" is not on the K-12 ladder` });
  }
  const seen = new Set<string>();
  for (const item of pool.items) {
    if (seen.has(item.id)) {
      problems.push({ itemId: item.id, rule: RULES.choices, detail: "two items share this id" });
    }
    seen.add(item.id);
  }
  return problems;
}

/**
 * Every rule, over one pool. An empty array means the pool passes. Order is stable: shape, then
 * rules 1 through 9, so a report reads the same way twice.
 */
export function validatePool(pool: Pool): Problem[] {
  return [
    ...checkShape(pool),
    ...checkChoices(pool),
    ...checkDuplicatePrompts(pool),
    ...checkLevelSpread(pool),
    ...checkPoolSize(pool),
    ...checkReadAloud(pool),
    ...checkReadability(pool),
    ...checkLengthTell(pool),
    ...checkAboveOrBelow(pool),
    ...checkHomophoneByEar(pool),
  ];
}
