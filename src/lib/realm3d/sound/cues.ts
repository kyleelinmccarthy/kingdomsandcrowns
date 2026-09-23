/**
 * WHAT MAKES WHICH SOUND, as pure rules.
 *
 * The engine plays; this file decides. Every mapping from something that happened in the game
 * — a trouble event, a spell's element, a room's fixture, the ground under a foot, the country
 * the child is standing in — to a sound id lives here, next to each sound's place in the mix
 * (its bus, its priority when voices run short, how close together two of it may play, how many
 * of it may overlap). All of it is tested without an `AudioContext`.
 */

import type { Biome } from "@/lib/realm3d/worldgen";
import type { RoomKind } from "@/lib/realm3d/doorways";
import type { TroubleEventKind } from "@/lib/realm3d/troubles3d";
import { ELEMENTS, type BedId, type DetailId, type EffectId, type Element, type SoundId, type Surface, type Zone } from "./recipes";

/* ------------------------------------------------------------------ the mix */

export type Bus = "sfx" | "amb" | "music";

export type CueInfo = {
  bus: Bus;
  /**
   * Who wins when every voice is busy: a new sound may take the voice of an older one of the
   * same or lower priority, never a higher one. A footstep never cuts off a building finishing.
   */
  priority: number;
  /** The least time between two plays of this sound, in seconds. Closer than that, the second is dropped. */
  gap: number;
  /** The most of this one sound that may sound at once. */
  max: number;
};

const LOW = 1;
const BODY = 2;
const ACTION = 3;
const ANSWER = 4;
const MOMENT = 5;

export function cueInfo(id: SoundId): CueInfo {
  if (id.startsWith("amb-") || id.startsWith("bed-")) return { bus: "amb", priority: 0, gap: 0.5, max: 2 };
  if (id.startsWith("step-")) return { bus: "sfx", priority: LOW, gap: 0.12, max: 2 };
  if (id.startsWith("charge-") || id.startsWith("release-")) return { bus: "sfx", priority: ACTION, gap: 0.05, max: 2 };
  if (id.startsWith("fixture-")) return { bus: "sfx", priority: ANSWER, gap: 0.4, max: 1 };
  switch (id as EffectId) {
    case "jump":
    case "land":
      return { bus: "sfx", priority: BODY, gap: 0.1, max: 1 };
    case "ui-click":
      return { bus: "sfx", priority: BODY, gap: 0.05, max: 2 };
    case "prompt":
      return { bus: "sfx", priority: BODY, gap: 0.35, max: 1 };
    case "refuse":
      return { bus: "sfx", priority: BODY, gap: 0.25, max: 1 };
    case "trouble-hit":
      return { bus: "sfx", priority: ACTION, gap: 0.06, max: 3 };
    case "blob-bounce":
      return { bus: "sfx", priority: ACTION, gap: 0.2, max: 1 };
    case "trouble-sighted":
    case "trouble-shielded":
      return { bus: "sfx", priority: ACTION, gap: 0.5, max: 1 };
    case "trouble-clear":
      return { bus: "sfx", priority: ANSWER, gap: 0.15, max: 2 };
    case "talk":
    case "deed-right":
    case "deed-wrong":
    case "door-in":
    case "door-out":
    case "pause":
    case "resume":
      return { bus: "sfx", priority: ANSWER, gap: 0.15, max: 1 };
    default:
      // rise, complete, lesson, tutorial-done, found: the big moments.
      return { bus: "sfx", priority: MOMENT, gap: 0.3, max: 1 };
  }
}

/* ------------------------------------------------------------------ spells */

/** The spell's element, from its catalogue id, or null for anything unknown. */
export function elementOf(elementId: string | null | undefined): Element | null {
  return (ELEMENTS as readonly string[]).includes(elementId ?? "") ? (elementId as Element) : null;
}

/** The charge and the release for a spell of this element. */
export function castCues(element: Element): { charge: EffectId; release: EffectId } {
  return { charge: `charge-${element}`, release: `release-${element}` };
}

/* ------------------------------------------------------------------ troubles */

export function troubleCue(kind: TroubleEventKind): EffectId | null {
  switch (kind) {
    case "cleared":
      return "trouble-clear";
    case "hit":
      return "trouble-hit";
    case "bounced":
      return "blob-bounce";
    case "shielded":
      return "trouble-shielded";
    case "sighted":
      return "trouble-sighted";
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ rooms */

const FIXTURE_OF: Readonly<Record<RoomKind, EffectId>> = {
  chapel: "fixture-bell",
  mill: "fixture-lever",
  castle: "fixture-throne",
  bridge: "fixture-boat",
  market: "fixture-scales",
  library: "fixture-page",
  watchtower: "fixture-scope",
  garden: "fixture-bees",
};

/** What using the room's one thing sounds like: the bell rope, the mill lever, the throne… */
export function fixtureCue(room: RoomKind): EffectId {
  return FIXTURE_OF[room];
}

/** Every room has boards underfoot, except the great hall, which is flagstones. */
export function roomFloor(room: RoomKind): Surface {
  return room === "castle" ? "stone" : "wood";
}

/* ------------------------------------------------------------------ the ground */

/**
 * What the sound needs to know about the ground, and nothing else. Built once from the world
 * (`groundProbe`), faked in tests. None of these allocates.
 */
export type GroundProbe = {
  /** How deep the water is here, in world units; 0 or less is dry. */
  waterDepth(x: number, z: number): number;
  /** On a road or the village lane. */
  onRoad(x: number, z: number): boolean;
  biome(x: number, z: number): Biome;
  /** Distance from the middle of the village. */
  fromVillage(x: number, z: number): number;
};

/** Ankle-deep counts: the splash starts where the wade does. */
export const WADE_DEPTH = 0.08;
/** The village's own sound reaches a little past its flat ground. */
export const VILLAGE_REACH = 34;

export function surfaceAt(g: GroundProbe, x: number, z: number): Surface {
  if (g.waterDepth(x, z) > WADE_DEPTH) return "water";
  if (g.onRoad(x, z)) return "road";
  return "grass";
}

/** Which country's sound the child is standing in. */
export function zoneAt(g: GroundProbe, x: number, z: number): Zone {
  if (g.fromVillage(x, z) < VILLAGE_REACH) return "village";
  if (g.waterDepth(x, z) > 0) return "shore";
  const b = g.biome(x, z);
  if (b === "shore" || b === "ocean" || b === "marsh") return "shore";
  if (b === "crag" || b === "moor") return "summit";
  if (b === "wood" || b === "forest") return "wood";
  return "meadow";
}

/**
 * Zones are sampled every few steps and only change when two samples in a row agree, so a child
 * walking the line between the wood and the meadow does not flick the whole soundscape back and
 * forth with every stride.
 */
export type ZoneTracker = { current: Zone | null; pending: Zone | null };

export function makeZoneTracker(): ZoneTracker {
  return { current: null, pending: null };
}

/** Returns the zone to change to, or null for no change. The first sample is taken at once. */
export function trackZone(t: ZoneTracker, sample: Zone): Zone | null {
  if (t.current === null) {
    t.current = sample;
    t.pending = null;
    return sample;
  }
  if (sample === t.current) {
    t.pending = null;
    return null;
  }
  if (t.pending === sample) {
    t.current = sample;
    t.pending = null;
    return sample;
  }
  t.pending = sample;
  return null;
}

/* ------------------------------------------------------------------ the soundscape */

export type ZoneSound = {
  /** Two beds of different loop lengths, and how loud each sits (0..1). */
  beds: readonly [BedId, number][];
  /** The little things that happen now and then, and how long between them. */
  details: readonly DetailId[];
  minGap: number;
  maxGap: number;
};

const SCAPES: Readonly<Record<Zone, ZoneSound>> = {
  village: { beds: [["bed-air", 0.7], ["bed-meadow", 0.5]], details: ["amb-bird-a", "amb-bird-b", "amb-bird-a", "amb-hammer", "amb-bird-c"], minGap: 5, maxGap: 12 },
  meadow: { beds: [["bed-air", 0.8], ["bed-meadow", 0.8]], details: ["amb-bird-a", "amb-bird-b", "amb-cricket", "amb-bird-c"], minGap: 5, maxGap: 13 },
  wood: { beds: [["bed-leaves", 0.9], ["bed-air", 0.4]], details: ["amb-bird-c", "amb-owl", "amb-bird-a", "amb-creak"], minGap: 7, maxGap: 16 },
  shore: { beds: [["bed-waves", 1], ["bed-air", 0.5]], details: ["amb-lap", "amb-lap", "amb-bird-b"], minGap: 6, maxGap: 14 },
  summit: { beds: [["bed-peak", 1], ["bed-air", 0.4]], details: ["amb-gust", "amb-gust", "amb-bird-c"], minGap: 8, maxGap: 18 },
  indoors: { beds: [["bed-room", 1]], details: ["amb-crackle", "amb-creak", "amb-crackle"], minGap: 6, maxGap: 14 },
};

export function zoneSound(zone: Zone): ZoneSound {
  return SCAPES[zone];
}

/** A deterministic 0..1 sequence for the soundscape's timing and choices, from a counter. */
export function jitter(n: number): number {
  let h = (n + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
