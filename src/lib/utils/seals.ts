/**
 * A grown-up's seal on a page of the Chronicle: one of six short phrases, or one short note.
 * It is a moment of connection, never a reward: nothing here touches XP, minutes or materials.
 *
 * Stored as JSON text on `quest_assignment.seal`. `parseSealInput` validates what a grown-up
 * sends; `parseSeal` reads what is stored, leniently (anything invalid is null).
 */
import { sanitizeText } from "./sanitize";

export const SEAL_PHRASES = [
  "Wonderful work!",
  "I'm proud of you.",
  "You kept going!",
  "I loved seeing this.",
  "What a clever idea!",
  "You did that so carefully.",
] as const;

export const SEAL_NOTE_MAX = 60;
/** Refuse a stored value longer than this before parsing it. A real seal is far smaller. */
const SEAL_MAX_CHARS = 1024;

/** What a grown-up sends: exactly one of a phrase index or a note. */
export type SealInput = { phrase: number; note?: undefined } | { note: string; phrase?: undefined };

/** What is stored: the seal, the grown-up's display name at the time, and when (epoch seconds). */
export type Seal = { phrase?: number; note?: string; by: string; at: number };

export const SEAL_REFUSED = "That seal couldn't be pressed.";

const LINE_BREAK = new RegExp("[\\r\\n\\u2028\\u2029]");

function isPhrase(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n < SEAL_PHRASES.length;
}

function cleanNote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (LINE_BREAK.test(raw.trim())) return null;
  const note = sanitizeText(raw, SEAL_NOTE_MAX + 1);
  if (note.length < 1 || note.length > SEAL_NOTE_MAX) return null;
  // Sanitizing can expose a line break that was hiding inside a tag.
  if (LINE_BREAK.test(note)) return null;
  return note;
}

function isPlainObject(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw);
}

/** Validate what a grown-up sends. Null when it is not exactly one valid phrase or note. */
export function parseSealInput(raw: unknown): SealInput | null {
  if (!isPlainObject(raw)) return null;
  const keys = Object.keys(raw).filter((k) => raw[k] !== undefined);
  if (keys.length !== 1) return null;
  if (keys[0] === "phrase") return isPhrase(raw.phrase) ? { phrase: raw.phrase } : null;
  if (keys[0] === "note") {
    const note = cleanNote(raw.note);
    return note === null ? null : { note };
  }
  return null;
}

/** Read a stored seal (an object or its JSON text). Anything invalid is null. */
export function parseSeal(raw: unknown): Seal | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    if (raw.length === 0 || raw.length > SEAL_MAX_CHARS) return null;
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!isPlainObject(value)) return null;
  const { phrase, note, by, at } = value;
  if (typeof by !== "string" || by.trim() === "" || by.length > 200) return null;
  if (typeof at !== "number" || !Number.isFinite(at)) return null;
  const hasPhrase = phrase !== undefined;
  const hasNote = note !== undefined;
  if (hasPhrase === hasNote) return null;
  if (hasPhrase) return isPhrase(phrase) ? { phrase, by, at } : null;
  const clean = cleanNote(note);
  return clean === null || clean !== note ? null : { note: clean, by, at };
}

/** The words on the seal: the phrase, or the note. */
export function sealText(seal: Seal): string {
  if (seal.phrase !== undefined) return SEAL_PHRASES[seal.phrase] ?? "";
  return seal.note ?? "";
}

/** Add who sealed it and when (epoch seconds). */
export function buildSeal(input: SealInput, by: string, at: number): Seal {
  return input.phrase !== undefined ? { phrase: input.phrase, by, at } : { note: input.note, by, at };
}

export function sealToStore(seal: Seal): string {
  return JSON.stringify(seal);
}
