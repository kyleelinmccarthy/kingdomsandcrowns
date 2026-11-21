/**
 * The rune (slice 6, R-I5): a word built from tiles at a rune stone. Server-only, like the registry:
 * a rune task holds its accepted words, and the pools that `presents` reads (`runes/`) hold every word.
 *
 * The leak rule (R-I17): the view is the effect, the object, the tray and whether the word is heard,
 * built field by field, so no accepted word, its length, the entry or the hint can ride along. The
 * tray was shuffled at draw time so no run of it spells a word, and it is stored in that order, so a
 * resumed run shows the same tray. The cast is graded here, never in the browser: the placed tiles
 * are joined and checked against every accepted word, so any of them counts however it is tiled. The
 * second-chance line is the entry's hint (`retryLine`), and one word's tiling is sent as `reveal`
 * only once the task is resolved and missed. At a dictation the word is the spoken prompt, so it is
 * in `readAloud` and nowhere else (R-I18).
 */
import { RUNE_MAX_CHARS, TASK_CODECS } from "./codecs";
import { runeAnswerText } from "./rune-copy";
import { runeTiling, spelled } from "./rune-tiles";
import { runePoolFor } from "./runes";
import { taskHint } from "@/lib/utils/skill-hints";
import type { RuneResponse, RuneTask, RuneView, TaskKindDef } from "./types";

/**
 * The stored task's tray and words, read defensively: a malformed row has none, and never throws. A
 * tray keeps its indices (a stray non-string tile reads as an empty one, which builds nothing).
 */
const trayOf = (t: RuneTask): string[] => (Array.isArray(t.tiles) ? t.tiles.map((x) => (typeof x === "string" ? x : "")) : []);
const wordsOf = (t: RuneTask): string[] => (Array.isArray(t.words) ? t.words.filter((x): x is string => typeof x === "string") : []);

/** Every pick is a tile of this task's tray. */
const onTray = (t: RuneTask, r: RuneResponse): boolean => {
  const size = trayOf(t).length;
  return r.length > 0 && r.every((i) => i < size);
};

/** Built from the four view fields only; the tray and the object are copies, so nothing else can ride along. */
function toView(t: RuneTask): RuneView {
  return {
    effect: String(t.effect) as RuneTask["effect"],
    object: t.object ? { id: String(t.object.id), label: String(t.object.label) } : null,
    tiles: trayOf(t),
    listen: t.listen === true,
  };
}

function isCorrect(t: RuneTask, r: RuneResponse): boolean {
  if (!onTray(t, r)) return false;
  const word = spelled(trayOf(t), r);
  return wordsOf(t).some((w) => w.toLowerCase() === word);
}

export const runeKind: TaskKindDef<"rune"> = {
  toView,
  // Strict: the encoded string only, at most RUNE_MAX_CHARS, in its one canonical form, every index on
  // this task's tray. Never trimmed or coerced; an array is not the encoded string.
  parseResponse: (raw, t) => {
    if (typeof raw !== "string" || raw.length > RUNE_MAX_CHARS) return null;
    const r = TASK_CODECS.rune.decode(raw);
    return r !== null && onTray(t, r) ? r : null;
  },
  encode: TASK_CODECS.rune.encode,
  decode: TASK_CODECS.rune.decode,
  isCorrect,
  // A wrong word works like the other puzzles: one more try, with the entry's hint.
  allowsSecondChance: () => true,
  sameResponse: TASK_CODECS.rune.sameResponse,
  answerText: (t) => runeAnswerText(wordsOf(t)[0] ?? ""),
  feedback: (t, r) => (isCorrect(t, r) ? "none" : "wrong_word"),
  // A skill is played as runes exactly while a loaded rune pool credits it (F-7).
  presents: (id) => runePoolFor(id) !== undefined,
  // A missed rune shows one accepted word built on its tray: the first word that tiles. A stored task
  // whose words no longer tile (a content change) reveals nothing, and never throws (Review Focus 4).
  reveal: (t) => {
    const tray = trayOf(t);
    for (const w of wordsOf(t)) {
      const tiling = runeTiling(w, tray);
      if (tiling) return TASK_CODECS.rune.encode(tiling);
    }
    return "";
  },
  // The entry's own hint; a stored entry with none falls back to the rune's, never an empty line.
  retryLine: (t) => t.hint || taskHint(t),
};
