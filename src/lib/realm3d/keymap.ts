/**
 * EVERY KEY THE REALM LISTENS FOR, in one table. Each thing a player can do from the keyboard is
 * an action with a label, a group for the controls panel and one or two default keys. The input
 * router reads the keymap to turn a key press into an action; the controls panel reads the same
 * table to show what is bound and to rebind it. Keys are `KeyboardEvent.code` values, the key's
 * place on the board, not the letter it types, so W stays a walk key on a French keyboard.
 *
 * What a player may bind is kept narrow on purpose. Esc is never in the keymap: it is the frame's
 * back key everywhere (`escapeFrom`), and a player who bound it away could not get out of a menu.
 * Ctrl, Alt and Meta are refused because the browser and the computer own them (Ctrl+W closes the
 * tab), and so are Tab, which moves focus, and the F keys, which reload and open tools. What is
 * left is letters, digits, the arrows, Space, Shift, punctuation, Enter and Backspace.
 *
 * Pure: no DOM, no three. What this computer kept is read by `keymapFrom`, which makes anything
 * unreadable safe, and written by `keymapToStored`, which keeps only what differs from the defaults
 * so a change to a default later reaches everyone who never touched it.
 */

export type CastAction = "cast1" | "cast2" | "cast3" | "cast4" | "cast5" | "cast6" | "cast7" | "cast8" | "cast9";

export type ActionId =
  | "walkForward"
  | "walkBack"
  | "strafeLeft"
  | "strafeRight"
  | "jump"
  | "interact"
  | CastAction
  | "pause"
  | "map"
  | "mount"
  | "follow";

/** The headings of the controls panel. */
export type ActionGroup = "move" | "act" | "spells" | "menus";

/** `hold` is true for an action that is a state while the key is down (walking), false for one that fires once per press. */
export type ActionDef = { id: ActionId; label: string; group: ActionGroup; defaults: readonly string[]; hold: boolean };

const CASTS: readonly ActionDef[] = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({
  id: `cast${n}` as CastAction,
  label: `Cast spell ${n}`,
  group: "spells",
  defaults: [`Digit${n}`],
  hold: false,
}));

/**
 * The table. Its order is the order of precedence: when two saved overrides ask for the same key,
 * the one higher in this list keeps it.
 */
export const ACTIONS: readonly ActionDef[] = [
  { id: "walkForward", label: "Walk forward", group: "move", defaults: ["KeyW", "ArrowUp"], hold: true },
  { id: "walkBack", label: "Walk back", group: "move", defaults: ["KeyS", "ArrowDown"], hold: true },
  { id: "strafeLeft", label: "Step left", group: "move", defaults: ["KeyA", "ArrowLeft"], hold: true },
  { id: "strafeRight", label: "Step right", group: "move", defaults: ["KeyD", "ArrowRight"], hold: true },
  { id: "jump", label: "Jump", group: "move", defaults: ["Space"], hold: false },
  { id: "interact", label: "Talk or look", group: "act", defaults: ["KeyE"], hold: false },
  ...CASTS,
  { id: "pause", label: "Pause", group: "menus", defaults: ["KeyP"], hold: false },
  { id: "map", label: "Open the map", group: "menus", defaults: ["KeyM"], hold: false },
  { id: "mount", label: "Get on or off your mount", group: "act", defaults: ["KeyZ"], hold: false },
  { id: "follow", label: "Follow your companion", group: "act", defaults: ["KeyF"], hold: false },
];

/** An action can have two keys, so a player can keep WASD and the arrows, or one hand's key and the other's. */
export const MAX_KEYS = 2;

/** What each action is bound to. Always has every action; an unbound one holds an empty list. */
export type Keymap = Readonly<Record<ActionId, readonly string[]>>;

/** The four walking actions, the ones the locomotion reads as held directions. */
export const WALK_ACTIONS = ["walkForward", "walkBack", "strafeLeft", "strafeRight"] as const;

const DEFAULT_KEYMAP: Keymap = Object.freeze(
  Object.fromEntries(ACTIONS.map((a) => [a.id, Object.freeze([...a.defaults])])) as Record<ActionId, readonly string[]>,
);

/** The keys the game ships with. The same frozen object every time, so `actionIndex` is built once for it. */
export function defaultKeymap(): Keymap {
  return DEFAULT_KEYMAP;
}

const PUNCTUATION_LABELS: Readonly<Record<string, string>> = {
  Backquote: "`",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
};

const OTHER_LABELS: Readonly<Record<string, string>> = {
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "Space",
  ShiftLeft: "Left Shift",
  ShiftRight: "Right Shift",
  Enter: "Enter",
  Backspace: "Backspace",
};

/** Every code a player may bind. Anything not here (Esc, Tab, Ctrl, Alt, Meta, F1 to F12, ...) is refused. */
const BINDABLE: ReadonlySet<string> = new Set([
  ...Array.from({ length: 26 }, (_, i) => `Key${String.fromCharCode(65 + i)}`),
  ...Array.from({ length: 10 }, (_, i) => `Digit${i}`),
  ...Array.from({ length: 10 }, (_, i) => `Numpad${i}`),
  ...Object.keys(PUNCTUATION_LABELS),
  ...Object.keys(OTHER_LABELS),
]);

export function isBindable(code: string): boolean {
  return typeof code === "string" && BINDABLE.has(code);
}

/**
 * The codes of one saved override, made safe: strings only, bindable only, no repeats, at most `MAX_KEYS`.
 * Null (the action keeps its defaults) if it is not a list, or if it had entries and every one was refused.
 * An explicitly empty list stays empty: that is how an unbound action (a lost clash) round-trips.
 */
function cleanKeys(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const keys: string[] = [];
  for (const code of value) {
    if (typeof code === "string" && isBindable(code) && !keys.includes(code)) keys.push(code);
    if (keys.length === MAX_KEYS) break;
  }
  return keys.length === 0 && value.length > 0 ? null : keys;
}

/**
 * What this computer kept, made safe. Takes the saved object, its JSON text, or anything at all
 * (null, garbage, a list); whatever cannot be read leaves the defaults. Clashes are settled in two
 * passes so a saved choice always beats a default: the overrides claim their keys in table order,
 * then each action that kept its defaults takes the default keys still free. An action can end up
 * with fewer keys than it asked for, or none.
 */
export function keymapFrom(raw: unknown): Keymap {
  let stored: unknown = raw;
  if (typeof raw === "string") {
    try {
      stored = JSON.parse(raw);
    } catch {
      stored = null;
    }
  }
  const saved = stored && typeof stored === "object" && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};

  const taken = new Set<string>();
  const out = {} as Record<ActionId, readonly string[]>;
  const overridden = new Set<ActionId>();
  for (const a of ACTIONS) {
    const keys = Object.hasOwn(saved, a.id) ? cleanKeys(saved[a.id]) : null;
    if (!keys) continue;
    overridden.add(a.id);
    out[a.id] = keys.filter((code) => !taken.has(code));
    for (const code of out[a.id]) taken.add(code);
  }
  for (const a of ACTIONS) {
    if (overridden.has(a.id)) continue;
    const free = a.defaults.filter((code) => !taken.has(code));
    out[a.id] = free;
    for (const code of free) taken.add(code);
  }
  return sameAsDefault(out) ? DEFAULT_KEYMAP : out;
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((code, i) => code === b[i]);
}

function sameAsDefault(k: Keymap): boolean {
  return ACTIONS.every((a) => sameKeys(k[a.id], a.defaults));
}

/** What to keep on this computer: only the actions that differ from the defaults, as JSON, or null when nothing does. */
export function keymapToStored(k: Keymap): string | null {
  const diff: Partial<Record<ActionId, readonly string[]>> = {};
  for (const a of ACTIONS) if (!sameKeys(k[a.id], a.defaults)) diff[a.id] = k[a.id];
  return Object.keys(diff).length === 0 ? null : JSON.stringify(diff);
}

export type BindResult = { ok: true; keymap: Keymap; displaced: ActionId | null } | { ok: false; reason: "reserved" };

/**
 * Put `code` on `action`'s key slot (0 is the first key, 1 the second). A key belongs to one
 * action, so if another action has it, the two trade: that action takes the key being replaced,
 * or simply loses the key if the slot was empty. `displaced` names the action that moved, so the
 * panel can say so. A key moved between the action's own two slots just swaps them.
 */
export function bind(k: Keymap, action: ActionId, slot: 0 | 1, code: string): BindResult {
  if (!isBindable(code)) return { ok: false, reason: "reserved" };
  const own = [...k[action]];
  const at = Math.min(slot, own.length);
  const replaced = own[at];
  if (own[at] === code) return { ok: true, keymap: k, displaced: null };

  const next: Record<ActionId, readonly string[]> = { ...k };
  const ownIndex = own.indexOf(code);
  if (ownIndex >= 0) {
    if (replaced === undefined) return { ok: true, keymap: k, displaced: null };
    own[ownIndex] = replaced;
    own[at] = code;
    next[action] = own;
    return { ok: true, keymap: next, displaced: null };
  }

  own[at] = code;
  next[action] = own;
  const owner = ACTIONS.find((a) => a.id !== action && k[a.id].includes(code))?.id ?? null;
  if (owner) {
    next[owner] = replaced === undefined ? k[owner].filter((c) => c !== code) : k[owner].map((c) => (c === code ? replaced : c));
  }
  return { ok: true, keymap: next, displaced: owner };
}

const INDEXES = new WeakMap<Keymap, ReadonlyMap<string, ActionId>>();

/** Which action a key is bound to. Built once per keymap object, so the router can look a key up on every press. */
export function actionIndex(k: Keymap): ReadonlyMap<string, ActionId> {
  let index = INDEXES.get(k);
  if (!index) {
    const built = new Map<string, ActionId>();
    for (const a of ACTIONS) for (const code of k[a.id]) if (!built.has(code)) built.set(code, a.id);
    index = built;
    INDEXES.set(k, index);
  }
  return index;
}

/** The action for spell slot 1 to 9, or null for any other number. */
export function castAction(slot: number): CastAction | null {
  return Number.isInteger(slot) && slot >= 1 && slot <= 9 ? (`cast${slot}` as CastAction) : null;
}

/** The spell slot (1 to 9) a cast action casts, or 0 for any action that is not one. */
export function castSlotOf(action: ActionId): number {
  return action.startsWith("cast") ? Number(action.slice(4)) : 0;
}

/** A key as a child reads it: "Z", "3", "↑", "Left Shift", "Num 4". An unknown code comes back as itself. */
export function keyLabel(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  return OTHER_LABELS[code] ?? PUNCTUATION_LABELS[code] ?? code;
}

/** The label of an action's first key, or a dash when it has none. */
export function primaryLabel(k: Keymap, action: ActionId): string {
  const first = k[action][0];
  return first === undefined ? "—" : keyLabel(first);
}

/** The label of an action's first key, or null when it has none: for copy, which must not say "Press —". */
export function boundLabel(k: Keymap, action: ActionId): string | null {
  const first = k[action][0];
  return first === undefined ? null : keyLabel(first);
}

/** What copy says instead of naming a key an action does not have: where to give it one. */
export function setKeyLine(action: ActionId): string {
  return `Set a key for ${ACTIONS.find((a) => a.id === action)?.label ?? action} in Controls.`;
}

/**
 * A sentence that names an action's key. `key` is its label (`boundLabel`), and `line` is the
 * sentence built round it. An action can be left with no key (a swap took it, or a list lost a
 * clash), and a keycap may show a dash for that, but a sentence that read "Press —." would tell
 * an eight-year-old nothing; so with no key the sentence is `none`, which by default says where
 * the key is set. A sentence with another way to do the thing (Esc pauses too, the door can be
 * walked into) passes that way as `none` instead.
 */
export function keyLine(key: string | null, action: ActionId, line: (key: string) => string, none: string = setKeyLine(action)): string {
  return key === null ? none : line(key);
}

/** `keyLine` with the label read from the keymap. */
export function pressLine(k: Keymap, action: ActionId, line: (key: string) => string, none?: string): string {
  return keyLine(boundLabel(k, action), action, line, none);
}

/** The labels of all of an action's keys, in slot order. */
export function keysLabels(k: Keymap, action: ActionId): string[] {
  return k[action].map(keyLabel);
}
