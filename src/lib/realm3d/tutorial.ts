/**
 * THE 3D REALM'S TUTORIAL — seven lessons, each one finished by DOING it.
 *
 * The flat Realm's `lib/realm/tutorial.ts` taught four verbs (walk, go to the light, press E,
 * press 1) for a tabletop camera that no longer exists. This is the same idea — a prompt that
 * names a key, gone the moment the child has done the thing — rewritten for the controls the 3D
 * world really binds: WASD with A and D stepping sideways, a mouse drag to look, Space to jump,
 * E to talk, the number row (or a click) to cast, and a `+` page that says how spells are earned.
 *
 * The rules that made the old ladder safe carry over, and each one is here for the same reason:
 *
 *   - Walking needs a real distance AND more than one key. A child who only ever holds W has
 *     not learned to steer, and telling them they have is how they get lost later.
 *   - A lesson that cannot be done is never shown. A child with no spell written is not told to
 *     press 1, and a child with every page full is not told to click an empty one — the ladder
 *     steps over those lessons rather than stranding the child on them.
 *   - Nothing traps. The Skip is always there, and a lesson that has sat on screen for
 *     `STEP_ESCAPE_MS` offers "Skip this step" as well, so a child who cannot find Old Bram is
 *     never stuck being told to find him.
 *
 * PERSISTENCE, and why the numbers are offset. Completion is written exactly the way the flat
 * tutorial wrote it — `setTutorialStep`, fire-and-forget, into `realm_settings.tutorial_step` —
 * but that column already holds the FLAT tutorial's 0..4, and most children who have played
 * finished it (4). Read naively, a 4 would put every one of them on lesson five of a tutorial
 * for controls they have never used. So the 3D ladder is stored ABOVE the flat one: lesson k done
 * is `LEGACY + k`, and anything at or below `LEGACY` means "no 3D lesson done yet". No migration,
 * no second column, and a value written by either Realm reads correctly in this one.
 *
 * Pure and three-free: no clock, no DOM. The frame feeds it signals and writes down what it says.
 */

import { TUTORIAL_STEPS } from "@/lib/realm/tutorial";

/** The flat Realm's ladder length: stored values up to here are its, not ours. */
export const LEGACY_STEPS = TUTORIAL_STEPS.length;

export type LessonId = "walk" | "look" | "jump" | "find" | "talk" | "cast" | "spells" | "ride";

export type LessonSignal =
  /** `keys` is how many DIFFERENT movement keys the child has pressed; `distance` in world units. */
  | { kind: "walked"; keys: number; distance: number }
  /** Pixels of mouse drag on the world, left or right button. */
  | { kind: "looked"; px: number }
  | { kind: "jumped" }
  /** Something came into E's reach. `waiting` is true when it is the villager the child is sent to. */
  | { kind: "near"; villager: boolean; waiting: boolean }
  /** A conversation opened with a villager (by E, a click on the prompt, or at their site). */
  | { kind: "talked" }
  /** A spell really went off: mana spent, not refused. */
  | { kind: "cast" }
  /** The "how do I get spells?" card was opened from an empty page. */
  | { kind: "page" }
  /** The child got on their mount (M, or the Ride slot). */
  | { kind: "rode" };

export type Lesson = {
  id: LessonId;
  signal: LessonSignal["kind"];
  /** The keycaps drawn beside the prompt. */
  keys: string[];
};

/** The ladder, in the order a child meets it. */
export const LESSONS: readonly Lesson[] = [
  { id: "walk", signal: "walked", keys: ["W", "A", "S", "D"] },
  { id: "look", signal: "looked", keys: ["Drag"] },
  { id: "jump", signal: "jumped", keys: ["Space"] },
  { id: "find", signal: "near", keys: [] },
  { id: "talk", signal: "talked", keys: ["E"] },
  { id: "cast", signal: "cast", keys: ["1"] },
  { id: "spells", signal: "page", keys: ["+"] },
  // Last, and only for a child who has a mount to ride (`impossible` steps over it otherwise).
  // Appended rather than inserted, so every stored count above means what it meant before.
  { id: "ride", signal: "rode", keys: ["M"] },
];

/**
 * The lessons every child has, before the mount's. `tutorialLearned` counts these, so a child
 * who finished the seven before riding was taught is not demoted to the simple view for want of
 * a lesson about a mount they may not even have.
 */
export const CORE_LESSONS = 7;

/** The highest value this ladder ever writes to `tutorial_step`. */
export const STORED_MAX = LEGACY_STEPS + LESSONS.length;

/** Far enough to be a walk, not a twitch: the flat Realm's own number. */
export const WALK_DISTANCE = 4;
/** Two different keys: forward and one other. */
export const WALK_KEYS = 2;
/** A deliberate look round: about a sixth of a turn at the camera's drag speed. */
export const LOOK_PX = 160;
/** After this long on one lesson, "Skip this step" is offered as well as Skip. */
export const STEP_ESCAPE_MS = 45_000;

/** What the world can offer right now, which decides which lessons are possible at all. */
export type LessonContext = {
  /** The name of the villager the objective sends the child to, or null (nobody is waiting). */
  waiting: string | null;
  /** Whether any villagers stand in the world (false when the kingdom failed to load). */
  villagers: boolean;
  /** The first written page, or null when the child has no spell at all. */
  spell: { name: string; key: number } | null;
  /** Whether any page is empty. */
  emptyPage: boolean;
  /** The mount the child can ride ("Pony"), or null: no mount, no riding lesson. */
  mount?: string | null;
};

const clamp = (n: number) => Math.max(0, Math.min(LESSONS.length, Math.floor(Number.isFinite(n) ? n : 0)));

/** How many 3D lessons a stored `tutorial_step` says are done. */
export function lessonsFromStored(stored: number): number {
  if (!Number.isFinite(stored) || stored <= LEGACY_STEPS) return 0;
  return clamp(stored - LEGACY_STEPS);
}

/** What to write to `tutorial_step` for `done` lessons. Nothing done is 0, as it always was. */
export function storedFromLessons(done: number): number {
  const d = clamp(done);
  return d === 0 ? 0 : LEGACY_STEPS + d;
}

/**
 * Whether the Realm counts this child as having learned it, for `depth: "auto"`. Either
 * tutorial will do: a child who finished the flat one had the full view there already, and
 * taking it away because the world became 3D would be a demotion nobody asked for.
 */
export function tutorialLearned(stored: number): boolean {
  return stored === LEGACY_STEPS || lessonsFromStored(stored) >= CORE_LESSONS;
}

/**
 * A lesson the world cannot offer for as long as this visit lasts. The spell lessons are the
 * only ones: a spell or an empty page does not appear mid-visit. A missing villager is NOT
 * here — a kingdom that failed to load comes back with a retry, so those lessons wait (their
 * prompt is simply not shown) instead of being stepped over for good.
 */
function impossible(lesson: Lesson, ctx: LessonContext): boolean {
  if (lesson.id === "cast") return ctx.spell === null;
  if (lesson.id === "spells") return !ctx.emptyPage;
  if (lesson.id === "ride") return !ctx.mount;
  return false;
}

/** `done` moved forward over every lesson this visit cannot offer. */
export function settle(done: number, ctx: LessonContext): number {
  let d = clamp(done);
  while (d < LESSONS.length && impossible(LESSONS[d], ctx)) d++;
  return d;
}

/** The lesson on screen, or null when the ladder is finished. */
export function currentLesson(done: number, ctx: LessonContext): Lesson | null {
  return LESSONS[settle(done, ctx)] ?? null;
}

/**
 * Feeds one signal to the ladder and returns how many lessons are now done. A signal for any
 * lesson but the current one changes nothing — reaching Old Bram before learning to walk does
 * not skip walking — and the result is always `settle`d, so finishing the last possible lesson
 * finishes the tutorial.
 */
export function advanceLesson(done: number, signal: LessonSignal, ctx: LessonContext): number {
  const d = settle(done, ctx);
  const lesson = LESSONS[d];
  if (!lesson || lesson.signal !== signal.kind) return d;
  if (signal.kind === "walked" && (signal.keys < WALK_KEYS || signal.distance < WALK_DISTANCE)) return d;
  if (signal.kind === "looked" && signal.px < LOOK_PX) return d;
  // Walking up to ANY villager teaches the step when nobody in particular is waiting (a
  // finished village); otherwise it must be the one the objective names.
  if (signal.kind === "near" && !(signal.villager && (signal.waiting || ctx.waiting === null))) return d;
  return settle(d + 1, ctx);
}

/** One lesson done by hand: the "Skip this step" way out. */
export function skipLesson(done: number, ctx: LessonContext): number {
  return settle(settle(done, ctx) + 1, ctx);
}

/** What a lesson says: a short instruction, and one line saying how. */
export type LessonCopy = { title: string; how: string; spoken: string };

/**
 * The words. Written for an eight-year-old reading from a metre back, naming keys and never the
 * complexity axis. Null when there is nothing to say — no lesson left, or a villager lesson in
 * a village whose villagers did not load (the objective card already explains that).
 */
export function lessonCopy(done: number, ctx: LessonContext): LessonCopy | null {
  const lesson = currentLesson(done, ctx);
  if (!lesson) return null;
  const say = (title: string, how: string): LessonCopy => ({ title, how, spoken: `${title} ${how}` });
  switch (lesson.id) {
    case "walk":
      return say("Walk around.", "W walks forward and S walks back. A and D step to the side.");
    case "look":
      return say("Look around.", "Hold the left mouse button and move the mouse. Roll the wheel to zoom.");
    case "jump":
      return say("Jump!", "Press Space.");
    case "find":
      if (!ctx.villagers) return null;
      return ctx.waiting
        ? say(`Find ${ctx.waiting}.`, "Follow the gold ! — it is on your map too.")
        : say("Find a villager.", "Anyone with a name over their head.");
    case "talk":
      if (!ctx.villagers) return null;
      return ctx.waiting ? say(`Talk to ${ctx.waiting}.`, "Stand close and press E.") : say("Talk to a villager.", "Stand close and press E.");
    case "cast":
      return say(`Cast ${ctx.spell!.name}.`, `Press ${ctx.spell!.key}, or click the spell.`);
    case "spells":
      return say("Get more spells.", "Click a + page to see how.");
    case "ride":
      return say(`Ride your ${ctx.mount}!`, "Press M to get on, and M again to get off.");
  }
}

/** The line that says the tutorial is over, and the one key it has not taught by doing. */
export const TUTORIAL_DONE = "You know the Realm! Press Esc any time for the menu.";
