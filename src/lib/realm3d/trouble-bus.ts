/**
 * THE TROUBLES' OWN WIRE between the frame loop and the DOM — the same carrier trick as
 * `hud-bus.ts`, kept in its own object so the troubles plug into the game with a line or two
 * in each shared file rather than a dozen new fields on the HUD's bus.
 *
 * Continuous values (where each trouble's marker hangs, where its dot sits on the map) are
 * written onto DOM nodes the HUD put on screen, each write guarded by a compare against the
 * last one. Discrete events (a trouble cleared, a child bumped, the first sighting) go the other
 * way as one callback the frame installs. And the one setting a grown-up can change mid-visit —
 * gentle or monsters — is a plain field the scene reads every frame, so flipping it in the pause
 * menu re-skins every trouble without re-rendering the island.
 *
 * No `three` here: the HUD side is tested under Vitest.
 */

import type { TroubleKind, TroubleSkin } from "@/lib/realm/spells/troubles";
import { TROUBLE_POOL, type TroubleEvent } from "./troubles3d";

export type TroubleBus = {
  skin: TroubleSkin;
  /** One marker per trouble pool slot: the plate, its name, and its pips. */
  plates: (HTMLElement | null)[];
  names: (HTMLElement | null)[];
  pips: (HTMLElement | null)[];
  /** One dot per pool slot on the minimap, inside the map's panning world group. */
  marks: (SVGGElement | null)[];
  /** A cleared trouble, a bump, the first sighting: `placeName` is the place it haunted, if any, and `homeId` its home (for the bounty). */
  onEvent: (e: TroubleEvent, placeName: string | null, homeId?: string | null) => void;

  setSkin(skin: TroubleSkin): void;
  setPlate(index: number, which: "plate" | "name" | "pips", el: HTMLElement | null): void;
  setMark(index: number, el: SVGGElement | null): void;
  setHandler(fn: (e: TroubleEvent, placeName: string | null, homeId?: string | null) => void): void;

  /** @internal — the write cache. */
  last: { plate: string[]; shown: boolean[]; label: string[]; pips: string[]; mark: string[] };
};

const noop = () => {};

export function makeTroubleBus(slots: number = TROUBLE_POOL): TroubleBus {
  const bus: TroubleBus = {
    skin: "gentle",
    plates: new Array(slots).fill(null),
    names: new Array(slots).fill(null),
    pips: new Array(slots).fill(null),
    marks: new Array(slots).fill(null),
    onEvent: noop,
    setSkin(skin) {
      if (bus.skin === skin) return;
      bus.skin = skin;
      // Every label is stale in the other tone: forget what was written so it is written again.
      bus.last.label.fill("");
    },
    setPlate(index, which, el) {
      if (index < 0 || index >= slots) return;
      if (which === "plate") bus.plates[index] = el;
      else if (which === "name") bus.names[index] = el;
      else bus.pips[index] = el;
    },
    setMark(index, el) {
      if (index >= 0 && index < slots) bus.marks[index] = el;
    },
    setHandler(fn) {
      bus.onEvent = fn;
    },
    last: {
      plate: new Array(slots).fill(""),
      shown: new Array(slots).fill(false),
      label: new Array(slots).fill(""),
      pips: new Array(slots).fill(""),
      mark: new Array(slots).fill(""),
    },
  };
  return bus;
}

/* ------------------------------------------------------------------ painting */

export function hideTroublePlate(bus: TroubleBus, i: number): void {
  const node = bus.plates[i];
  if (!node || !bus.last.shown[i]) return;
  bus.last.shown[i] = false;
  node.style.display = "none";
}

export function paintTroublePlate(bus: TroubleBus, i: number, transform: string, opacity: string): void {
  const node = bus.plates[i];
  if (!node) return;
  if (!bus.last.shown[i]) {
    bus.last.shown[i] = true;
    node.style.display = "";
  }
  if (transform === bus.last.plate[i]) return;
  bus.last.plate[i] = transform;
  node.style.transform = transform;
  node.style.opacity = opacity;
}

/**
 * What the marker says: its kind (which picks the glyph and colour through CSS), its name in the
 * chosen tone, and its hits as pips. `key` is the caller's compact "kind|skin" so a standing
 * trouble costs one string compare; the text is only touched when it changed.
 */
export function paintTroubleLabel(bus: TroubleBus, i: number, kind: TroubleKind, skin: TroubleSkin, name: string): void {
  const node = bus.plates[i];
  if (!node) return;
  const key = kind === "fog" ? (skin === "gentle" ? "fg" : "fm") : kind === "cursed-stone" ? (skin === "gentle" ? "sg" : "sm") : skin === "gentle" ? "bg" : "bm";
  if (key === bus.last.label[i]) return;
  bus.last.label[i] = key;
  node.dataset.kind = kind;
  node.dataset.skin = skin;
  const n = bus.names[i];
  if (n) n.textContent = name;
}

/** `left` of `max` hits still to go, as filled pips; only written when it changed. */
export function paintTroublePips(bus: TroubleBus, i: number, left: number, max: number): void {
  const node = bus.pips[i];
  if (!node) return;
  const key = left === 1 ? (max === 1 ? "11" : "12") : left === 2 ? "22" : `${left}${max}`;
  if (key === bus.last.pips[i]) return;
  bus.last.pips[i] = key;
  node.dataset.left = String(left);
  node.dataset.max = String(max);
}

/** A dot on the map, in world units, or "" to hide it. */
export function paintTroubleMark(bus: TroubleBus, i: number, transform: string): void {
  if (transform === bus.last.mark[i]) return;
  bus.last.mark[i] = transform;
  const node = bus.marks[i];
  if (!node) return;
  if (transform === "") {
    node.style.display = "none";
    return;
  }
  node.style.display = "";
  node.setAttribute("transform", transform);
}
