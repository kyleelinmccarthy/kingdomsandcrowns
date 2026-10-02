import type { GameIconName } from "@/components/game-icon";
import { SCHOOL_LABELS, type SpellSchool } from "./spell-schools";

// ── Types ────────────────────────────────────────────────────

export type SpellUnlock =
  | { type: "free" }
  | { type: "level"; level: number }
  | { type: "badge"; badgeId: string; badgeName: string }
  | { type: "quest" }
  | { type: "school"; school: SpellSchool; count: number };

export type StatusKind =
  | "slowed" | "bounce" | "seeking" | "grown" | "mended" | "bound" | "quickened" | "chilled";

/** durationMs 0 means "for the spell's lifetime". */
export type SpellStatus = { kind: StatusKind; durationMs: number };

export type SpellShape = "projectile" | "area" | "barrier" | "beam" | "summon" | "self";

export type SpellElement = {
  id: string;
  label: string;
  /** One line for the Spellbook tile: what the part does in the Realm, in a student's words. */
  help: string;
  adjectives: [string, string, string];
  color: string;
  /**
   * What the element LOOKS like, and the icon every spell made of it wears on the spell bar.
   * A spell is read by what it is made of — an Ember Bolt is fire before it is a bolt — so a
   * page's icon is its element's, and the form's icon is only for the form's own tile in the
   * Spellbook.
   */
  icon: GameIconName;
  particle: string;
  unlock: SpellUnlock;
  onHit?: SpellStatus;
};

export type SpellForm = {
  id: string;
  label: string;
  help: string;
  nouns: [string, string, string];
  icon: GameIconName;
  shape: SpellShape;
  manaCost: number;
  castMs: number;
  range: number;
  speed: number;
  unlock: SpellUnlock;
};

export type SpellModifier = {
  id: string;
  label: string;
  help: string;
  suffix: string;
  icon: GameIconName;
  status: SpellStatus;
  manaCostDelta: number;
  unlock: SpellUnlock;
};

export type SpellPartCategory = "spellElement" | "spellForm" | "spellModifier";

/** child_avatar_unlock category for a quest-rewarded part of each school. */
export const SPELL_CATEGORY: Record<SpellSchool, SpellPartCategory> = {
  element: "spellElement",
  form: "spellForm",
  modifier: "spellModifier",
};

// ── Catalog ──────────────────────────────────────────────────
// Balance numbers are the contract the Realm's caster reads: range and speed
// are world units, castMs is milliseconds. Roughly a third of parts are free
// so a brand-new hero can cast on day one.

export const SPELL_ELEMENTS: SpellElement[] = [
  { id: "ember", label: "Ember", help: "Fiery orange sparks.", adjectives: ["Ember", "Cinder", "Blaze"], color: "#f97316", icon: "fire", particle: "sparks", unlock: { type: "free" } },
  { id: "tide", label: "Tide", help: "Splashing blue droplets.", adjectives: ["Tide", "Ripple", "Wave"], color: "#3b82f6", icon: "droplet", particle: "droplets", unlock: { type: "free" } },
  { id: "stone", label: "Stone", help: "Tumbling brown pebbles.", adjectives: ["Stone", "Pebble", "Boulder"], color: "#a16207", icon: "rock", particle: "pebbles", unlock: { type: "school", school: "element", count: 5 } },
  { id: "gale", label: "Gale", help: "Swirling wisps of wind.", adjectives: ["Gale", "Breeze", "Zephyr"], color: "#22d3ee", icon: "wind", particle: "wisps", unlock: { type: "school", school: "element", count: 15 } },
  { id: "light", label: "Light", help: "Golden motes of sunlight.", adjectives: ["Radiant", "Sunlit", "Gleaming"], color: "#fde68a", icon: "sun", particle: "motes", unlock: { type: "level", level: 10 } },
  { id: "shadow", label: "Shadow", help: "Curling purple smoke.", adjectives: ["Umbral", "Dusk", "Shade"], color: "#6d28d9", icon: "moon", particle: "smoke", unlock: { type: "school", school: "element", count: 30 } },
  { id: "frost", label: "Frost", help: "Icy crystals. Chills troubles so they move slower.", adjectives: ["Frost", "Rime", "Glacial"], color: "#bae6fd", icon: "snowflake", particle: "crystals", unlock: { type: "badge", badgeId: "badge-streak-7", badgeName: "Week Warrior" }, onHit: { kind: "chilled", durationMs: 800 } },
  { id: "storm", label: "Storm", help: "Crackling lightning.", adjectives: ["Storm", "Thunder", "Tempest"], color: "#818cf8", icon: "thunderbolt", particle: "bolts", unlock: { type: "quest" } },
  { id: "bloom", label: "Bloom", help: "Drifting green petals.", adjectives: ["Bloom", "Petal", "Verdant"], color: "#4ade80", icon: "flower", particle: "petals", unlock: { type: "quest" } },
];

export const SPELL_FORMS: SpellForm[] = [
  { id: "bolt", label: "Bolt", help: "A fast shot that flies at one trouble.", nouns: ["Bolt", "Dart", "Lance"], icon: "thunderbolt", shape: "projectile", manaCost: 10, castMs: 300, range: 12, speed: 14, unlock: { type: "free" } },
  { id: "orb", label: "Orb", help: "A slow, floating shot at one trouble.", nouns: ["Orb", "Sphere", "Globe"], icon: "gem", shape: "projectile", manaCost: 15, castMs: 500, range: 10, speed: 8, unlock: { type: "free" } },
  { id: "burst", label: "Burst", help: "A ring that hits every trouble close by.", nouns: ["Burst", "Nova", "Flare"], icon: "sparkles", shape: "area", manaCost: 20, castMs: 600, range: 4, speed: 0, unlock: { type: "school", school: "form", count: 5 } },
  { id: "wall", label: "Wall", help: "A wall that shoves troubles back and blocks them.", nouns: ["Wall", "Rampart", "Bulwark"], icon: "stoneTower", shape: "barrier", manaCost: 25, castMs: 800, range: 6, speed: 0, unlock: { type: "school", school: "form", count: 15 } },
  { id: "beam", label: "Beam", help: "A long ray that hits the same trouble up to 3 times.", nouns: ["Beam", "Ray", "Shaft"], icon: "sun", shape: "beam", manaCost: 20, castMs: 400, range: 14, speed: 0, unlock: { type: "level", level: 10 } },
  { id: "shield", label: "Shield", help: "Keeps troubles from bumping you for a few seconds.", nouns: ["Shield", "Ward", "Aegis"], icon: "shield", shape: "self", manaCost: 15, castMs: 300, range: 0, speed: 0, unlock: { type: "school", school: "form", count: 30 } },
  { id: "sprite", label: "Sprite", help: "A little helper that follows you and throws bolts.", nouns: ["Sprite", "Wisp", "Familiar"], icon: "bee", shape: "summon", manaCost: 30, castMs: 900, range: 8, speed: 6, unlock: { type: "badge", badgeId: "badge-volume-25", badgeName: "Dedicated Scholar" } },
  { id: "aura", label: "Aura", help: "A glow around you that keeps hitting nearby troubles.", nouns: ["Aura", "Halo", "Mantle"], icon: "fireRing", shape: "self", manaCost: 25, castMs: 700, range: 5, speed: 0, unlock: { type: "quest" } },
];

export const SPELL_MODIFIERS: SpellModifier[] = [
  { id: "slow", label: "Slow", help: "Troubles it hits crawl for 2 seconds.", suffix: "of Slowing", icon: "hourglass", status: { kind: "slowed", durationMs: 2000 }, manaCostDelta: 5, unlock: { type: "free" } },
  { id: "bounce", label: "Bounce", help: "A shot bounces once, off a wall or on to the next trouble.", suffix: "of Bouncing", icon: "compass", status: { kind: "bounce", durationMs: 0 }, manaCostDelta: 5, unlock: { type: "school", school: "modifier", count: 5 } },
  { id: "seek", label: "Seek", help: "A shot curves harder toward its target.", suffix: "of Seeking", icon: "telescope", status: { kind: "seeking", durationMs: 0 }, manaCostDelta: 10, unlock: { type: "school", school: "modifier", count: 15 } },
  { id: "grow", label: "Grow", help: "A shot gets bigger the farther it flies.", suffix: "of Growing", icon: "upgrade", status: { kind: "grown", durationMs: 0 }, manaCostDelta: 10, unlock: { type: "level", level: 10 } },
  { id: "mend", label: "Mend", help: "Gives your mana back when it hits.", suffix: "of Mending", icon: "flower", status: { kind: "mended", durationMs: 0 }, manaCostDelta: 10, unlock: { type: "school", school: "modifier", count: 30 } },
  { id: "bind", label: "Bind", help: "Freezes a trouble in place for a moment.", suffix: "of Binding", icon: "link", status: { kind: "bound", durationMs: 1500 }, manaCostDelta: 15, unlock: { type: "badge", badgeId: "badge-streak-30", badgeName: "Monthly Master" } },
  { id: "quicken", label: "Quicken", help: "Casts in half the time and is ready again sooner.", suffix: "of Quickening", icon: "timer", status: { kind: "quickened", durationMs: 0 }, manaCostDelta: 5, unlock: { type: "quest" } },
];

export const SPELL_PART_COUNT = SPELL_ELEMENTS.length + SPELL_FORMS.length + SPELL_MODIFIERS.length;

export function findElement(id: string): SpellElement | null {
  return SPELL_ELEMENTS.find((p) => p.id === id) ?? null;
}
export function findForm(id: string): SpellForm | null {
  return SPELL_FORMS.find((p) => p.id === id) ?? null;
}
export function findModifier(id: string): SpellModifier | null {
  return SPELL_MODIFIERS.find((p) => p.id === id) ?? null;
}

// ── Unlocks ──────────────────────────────────────────────────

export type SpellUnlockContext = {
  level: number;
  earnedBadgeIds: string[];
  /** itemIds recorded in child_avatar_unlock under the spell categories. */
  questUnlockedIds: Set<string>;
  schoolCounts: Record<SpellSchool, number>;
};

/**
 * Quest unlocks are recorded per part id, so the caller passes the part's id
 * for that one case; every other kind is decided from the context alone.
 */
export function isSpellPartUnlocked(unlock: SpellUnlock, ctx: SpellUnlockContext, partId?: string): boolean {
  switch (unlock.type) {
    case "free":
      return true;
    case "level":
      return ctx.level >= unlock.level;
    case "badge":
      return ctx.earnedBadgeIds.includes(unlock.badgeId);
    case "quest":
      return partId !== undefined && ctx.questUnlockedIds.has(partId);
    case "school":
      return ctx.schoolCounts[unlock.school] >= unlock.count;
  }
}

export function unlockedPartIds(ctx: SpellUnlockContext): Set<string> {
  const ids = new Set<string>();
  for (const p of [...SPELL_ELEMENTS, ...SPELL_FORMS, ...SPELL_MODIFIERS]) {
    if (isSpellPartUnlocked(p.unlock, ctx, p.id)) ids.add(p.id);
  }
  return ids;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}`;
}

/** Why a part is sealed, in the hero's own terms; null when it is open. */
export function spellUnlockHint(
  unlock: SpellUnlock,
  ctx: SpellUnlockContext,
  subjectNamesBySchool: Record<SpellSchool, string[]>,
  partId?: string
): string | null {
  if (isSpellPartUnlocked(unlock, ctx, partId)) return null;
  switch (unlock.type) {
    case "free":
      return null;
    case "level":
      return `Reach level ${unlock.level}.`;
    case "badge":
      return `Earn the ${unlock.badgeName} badge.`;
    case "quest":
      return "A grown-up can award this as a quest reward.";
    case "school": {
      const names = subjectNamesBySchool[unlock.school];
      if (names.length === 0) {
        return `Ask a grown-up to point a discipline at the ${SCHOOL_LABELS[unlock.school]}.`;
      }
      const remaining = unlock.count - ctx.schoolCounts[unlock.school];
      return `${remaining} more ${joinNames(names)} quests or side quests to go.`;
    }
  }
}

// ── Resolution ───────────────────────────────────────────────

export type SpellParts = { elementId: string; formId: string; modifierId: string | null };

export type SpellDefinition = {
  parts: SpellParts;
  color: string;
  particle: string;
  shape: SpellShape;
  manaCost: number;
  castMs: number;
  range: number;
  speed: number;
  /** Element on-hit status first (if any), then the modifier's (if any). */
  statuses: SpellStatus[];
};

function lookup(parts: SpellParts) {
  const element = findElement(parts.elementId);
  const form = findForm(parts.formId);
  const modifier = parts.modifierId === null ? null : findModifier(parts.modifierId);
  if (!element || !form || (parts.modifierId !== null && !modifier)) return null;
  return { element, form, modifier };
}

/** The one shape the Realm casts. Null on any unknown id rather than a throw: the builder shows the miss. */
export function resolveSpell(parts: SpellParts): SpellDefinition | null {
  const found = lookup(parts);
  if (!found) return null;
  const { element, form, modifier } = found;
  const statuses: SpellStatus[] = [];
  if (element.onHit) statuses.push(element.onHit);
  if (modifier) statuses.push(modifier.status);
  // Quicken is the one modifier that changes the cast itself, not what lands.
  const castMs = modifier?.id === "quicken" ? Math.round(form.castMs / 2) : form.castMs;
  return {
    parts: { ...parts },
    color: element.color,
    particle: element.particle,
    shape: form.shape,
    manaCost: form.manaCost + (modifier?.manaCostDelta ?? 0),
    castMs,
    range: form.range,
    speed: form.speed,
    statuses,
  };
}

const MODIFIER_PHRASES: Record<string, string> = {
  slow: "slows what it touches",
  bounce: "bounces onward",
  seek: "seeks its mark",
  grow: "grows as it goes",
  mend: "mends the caster",
  bind: "holds its target still",
  quicken: "is cast in a flash",
};

/** "An" before a vowel sound, "A" otherwise — used for the form label. */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? "An" : "A";
}

export function describeSpell(parts: SpellParts): string {
  const found = lookup(parts);
  if (!found) return "";
  const { element, form, modifier } = found;
  const formLabel = form.label.toLowerCase();
  let sentence = `${article(formLabel)} ${formLabel} of ${element.label.toLowerCase()}`;
  if (modifier) sentence += ` that ${MODIFIER_PHRASES[modifier.id]}`;
  sentence += ".";
  if (element.onHit?.kind === "chilled") sentence += " It chills.";
  return sentence;
}
