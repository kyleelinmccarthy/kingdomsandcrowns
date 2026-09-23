/**
 * THE WIRE BETWEEN THE FRAME LOOP AND THE HUD.
 *
 * The HUD is DOM and the scene is WebGL, and the numbers on the HUD change sixty times a
 * second. Threading them through React state would re-render the HUD — and, since the HUD's
 * state would have to live in the common parent of the HUD and the `<Canvas>`, it would
 * re-render the entire scene tree with it, sixty times a second, which is why `World` is
 * memoised and why every prop handed to it is referentially stable.
 *
 * So the values that move every frame do not go through React at all. This object is created
 * once, the HUD writes its own DOM nodes into it on mount, and the scene's driver writes those
 * nodes directly — the same carrier trick `realm-minimap.tsx` already uses for the hero dot,
 * generalised to the whole HUD. Nothing here re-renders anything.
 *
 * The three things that change RARELY — which place the child is standing in, which places
 * they have found, which slot just refused — go the other way, as callbacks the HUD installs,
 * and those do set React state, a handful of times a session. That is the line: continuous
 * values are written to nodes, discrete events are published as callbacks.
 */

export type HudSlotNodes = {
  root: HTMLElement | null;
  /** The cooldown wipe: its `transform: scaleY()` is written every frame. */
  cool: HTMLElement | null;
};

/** The single nodes the driver writes, by name. */
export type HudNodeKey = "manaFill" | "manaText" | "mapWorld" | "mapYou" | "mapCone" | "mapHome";

export type HudHandlers = Pick<HudBus, "onPlace" | "onFound" | "onRefuse" | "onNear" | "onInteract">;

/**
 * Something the child can press the interact key at. The scene decides what is in reach (it
 * owns positions and the frame loop); the HUD decides what pressing it means (it owns the
 * dialogue, the deed flow and every other panel). `id` is the layout's own id for that kind —
 * a villager id, a building slot id, a landmark id — so neither side has to translate.
 */
export type InteractTarget = {
  kind: "villager" | "site" | "castle" | "landmark";
  id: string;
  /** What the prompt calls it: "Old Bram", "the Chapel", "Cloudfoot". */
  label: string;
};

export type HudBus = {
  manaFill: HTMLElement | null;
  manaText: HTMLElement | null;
  slots: HudSlotNodes[];
  /** One per anchor in `buildAnchors` order; index 0 is the child's own name. */
  plates: (HTMLElement | null)[];
  /** The map's panning group, the hero arrow, the view cone, and one rim arrow per landmark. */
  mapWorld: SVGGElement | null;
  mapYou: SVGGElement | null;
  mapCone: SVGGElement | null;
  mapHome: SVGGElement | null;

  /** Fired when the child arrives at, or leaves, a named place. Null means nowhere named. */
  onPlace: (id: string | null) => void;
  /** Fired the first time the child stands in a named place. */
  onFound: (id: string) => void;
  /** Fired when a press did nothing, with the slot number and why. */
  onRefuse: (slot: number, why: "mana" | "cooldown") => void;
  /** Fired when the nearest thing in interact reach changes. Null means nothing is in reach. */
  onNear: (target: InteractTarget | null) => void;
  /** Fired when the child presses the interact key with something in reach. */
  onInteract: (target: InteractTarget) => void;

  /**
   * True while a menu, dialogue, tutorial card or the pause screen owns the child's attention.
   * Written by the HUD through `setPaused`; read by the scene every frame. While it is true the
   * scene takes no movement, casting, camera or interact input and advances no simulation
   * clock — the world may keep drawing, but nothing in it moves because of the child.
   */
  paused: boolean;

  /**
   * The HUD hands its nodes and its handlers over through these rather than assigning the
   * fields directly, and that is the React compiler's rule rather than a preference: a prop is
   * immutable as far as the compiler is concerned, so `bus.manaFill = el` inside a ref callback
   * is an error ("this value cannot be modified") however well it works at runtime. Writing
   * through a function the bus owns says the same thing and is honest about who owns the
   * object — which is nobody's render, and that is the whole point of it.
   */
  setNode(key: HudNodeKey, el: HTMLElement | SVGGElement | null): void;
  setSlot(index: number, which: keyof HudSlotNodes, el: HTMLElement | null): void;
  setPlate(index: number, el: HTMLElement | null): void;
  setHandlers(handlers: Partial<HudHandlers>): void;
  setPaused(paused: boolean): void;

  /** @internal — the write cache the `paint*` functions below keep. */
  last: HudLast;
};

/** What was written last, so a standing child with everything ready writes nothing at all. */
type HudLast = {
  mana: number;
  cool: number[];
  plate: string[];
  shown: boolean[];
  node: Record<string, string>;
};

const noop = () => {};

export function makeHudBus(slots: number, plates: number): HudBus {
  const bus: HudBus = {
    manaFill: null,
    manaText: null,
    slots: Array.from({ length: slots }, () => ({ root: null, cool: null })),
    plates: new Array(plates).fill(null),
    mapWorld: null,
    mapYou: null,
    mapCone: null,
    mapHome: null,
    onPlace: noop,
    onFound: noop,
    onRefuse: noop,
    onNear: noop,
    onInteract: noop,
    paused: false,
    setNode(key, el) {
      // One assignment, one narrow cast. Every key above is either an HTMLElement slot or an
      // SVGGElement slot and the call sites are typed, so the cast cannot pick the wrong one.
      (bus as unknown as Record<HudNodeKey, HTMLElement | SVGGElement | null>)[key] = el;
    },
    setSlot(index, which, el) {
      const slot = bus.slots[index];
      if (slot) slot[which] = el;
    },
    setPlate(index, el) {
      if (index >= 0 && index < bus.plates.length) bus.plates[index] = el;
    },
    last: {
      mana: -1,
      cool: new Array(Math.max(1, slots)).fill(-1),
      plate: new Array(Math.max(1, plates)).fill(""),
      shown: new Array(Math.max(1, plates)).fill(false),
      node: {},
    },
    setHandlers(handlers) {
      if (handlers.onPlace) bus.onPlace = handlers.onPlace;
      if (handlers.onFound) bus.onFound = handlers.onFound;
      if (handlers.onRefuse) bus.onRefuse = handlers.onRefuse;
      if (handlers.onNear) bus.onNear = handlers.onNear;
      if (handlers.onInteract) bus.onInteract = handlers.onInteract;
    },
    setPaused(paused) {
      bus.paused = paused;
    },
  };
  return bus;
}

/* ------------------------------------------------------------------ painting */

/**
 * The DOM writes, all of them, as free functions over the bus.
 *
 * They live here rather than in the driver for two reasons. The honest one is that it puts
 * every write to the HUD in one file, next to the cache that decides whether a write is
 * needed at all — the driver is then purely "work out the numbers", which is the part worth
 * reading. The forcing one is that the React compiler will not let a component assign through
 * a prop (`bus.manaFill.style.width = …` is "this value cannot be modified", and it is right:
 * the node belongs to the HUD, not to the driver's render). Writing through a function the bus
 * owns says exactly that.
 *
 * Every one of them is guarded by a compare against what went out last, so the per-frame cost
 * of a HUD that is not changing is a handful of number comparisons and no string at all.
 */

export function paintMana(bus: HudBus, mana: number, fraction: number, max: number): void {
  if (mana === bus.last.mana) return;
  bus.last.mana = mana;
  if (bus.manaFill) bus.manaFill.style.width = `${(fraction * 100).toFixed(1)}%`;
  if (bus.manaText) bus.manaText.textContent = `${mana} / ${max}`;
}

/**
 * `fraction` is 1 the instant a page was cast and 0 when it is ready. Quantised to fiftieths
 * on the way in: the wipe is an 80px tile, so anything finer is a write nobody can see.
 */
export function paintCooldown(bus: HudBus, index: number, fraction: number): void {
  const node = bus.slots[index]?.cool;
  if (!node) return;
  const q = Math.round(fraction * 50);
  if (q === bus.last.cool[index]) return;
  bus.last.cool[index] = q;
  node.style.transform = `scaleY(${(q / 50).toFixed(2)})`;
}

export function hidePlate(bus: HudBus, index: number): void {
  const node = bus.plates[index];
  if (!node || !bus.last.shown[index]) return;
  bus.last.shown[index] = false;
  node.style.display = "none";
}

export function paintPlate(bus: HudBus, index: number, transform: string, opacity: string): void {
  const node = bus.plates[index];
  if (!node) return;
  if (!bus.last.shown[index]) {
    bus.last.shown[index] = true;
    node.style.display = "";
  }
  if (transform === bus.last.plate[index]) return;
  bus.last.plate[index] = transform;
  node.style.transform = transform;
  node.style.opacity = opacity;
}

/** A transform onto one of the map's groups, or "" to hide it (the rim arrow's off state). */
export function paintNode(bus: HudBus, key: HudNodeKey, transform: string): void {
  if (transform === bus.last.node[key]) return;
  bus.last.node[key] = transform;
  const node = bus[key];
  if (!node) return;
  if (transform === "") {
    node.style.display = "none";
    return;
  }
  node.style.display = "";
  node.setAttribute("transform", transform);
}
