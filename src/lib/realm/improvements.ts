// Improvements: what the hero spends materials on once real quests have brought them.
// Thirteen plans of three levels each: a wing or upgrade on each raised building, the Chronicle
// Hall in the keep yard, and four decorations for the village. Pure and client-safe, with no three.js
// and no database: the scene draws the boxes, the bench draws `planElevation`, the plans board
// lists `planState` through `planLine`, and quest cards hint through `planHint`.
import { BUILDINGS, type Building } from "@/lib/utils/kingdom";
import { MATERIALS, MATERIAL_IDS, allocateSpend, type MaterialId, type MaterialRow } from "./materials";

export type ImprovementId =
  | "well-house"
  | "mill-granary"
  | "bridge-arches"
  | "chapel-windows"
  | "market-stalls"
  | "library-reading-wing"
  | "watchtower-beacon"
  | "garden-herb-house"
  | "chronicle-hall"
  | "village-banners"
  | "village-lamps"
  | "village-fountain"
  | "village-statue";

/** Catalog order: the eight wings in the order of the buildings, then the hall, then the four decorations. */
export const IMPROVEMENT_IDS: readonly ImprovementId[] = [
  "well-house", "mill-granary", "bridge-arches", "chapel-windows", "market-stalls", "library-reading-wing", "watchtower-beacon", "garden-herb-house",
  "chronicle-hall", "village-banners", "village-lamps", "village-fountain", "village-statue",
];

/**
 * The plaque a built level carries: what was built, who built it and when (the season's label), the
 * quests that paid for it (titles, oldest first) and the stars the building run earned.
 */
export type Plaque = {
  improvementId: ImprovementId;
  level: number;
  label: string;
  builtBy: string;
  season: string | null;
  sources: string[];
  stars: number;
};

/**
 * What a plaque reads, as one line: "Banners · built by Emma · Autumn 2026 · from: Fractions p.12, Maps".
 * The season and the quests are left out when they are not known.
 */
export function plaqueLine(p: Pick<Plaque, "label" | "builtBy" | "season" | "sources">): string {
  const parts = [p.label, `built by ${p.builtBy}`];
  if (p.season) parts.push(p.season);
  if (p.sources.length > 0) parts.push(`from: ${p.sources.join(", ")}`);
  return parts.join(" · ");
}

export type ImprovementColor = "stone" | "timber" | "plaster" | "roof" | "cloth" | "glass" | "gold" | "water";

/** Low-poly colours, in the spirit of the construction site's: weathered stone, pale timber, warm plaster. */
export const IMPROVEMENT_COLORS: Record<ImprovementColor, string> = {
  stone: "#a39b8a",
  timber: "#9a7446",
  plaster: "#e6dcc6",
  roof: "#a8553b",
  cloth: "#b8483f",
  glass: "#9ccfe3",
  gold: "#e3b948",
  water: "#4f9fcb",
};

/**
 * One box, in its host's frame: `x`/`z` are the centre on the ground plane, `y` the centre height,
 * and `sx`/`sy`/`sz` the size. For a building host the origin is the building's centre on the
 * ground and +z is the door side (the building is drawn 4.5 wide and deep; the watchtower 3).
 * For the keep and the village it is the improvement's own spot.
 */
export type ImprovementBox = { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: ImprovementColor };

export type ImprovementHost = Building["id"] | "keep" | "village";

export type Improvement = {
  label: string;
  host: ImprovementHost;
  primary: MaterialId;
  secondary: MaterialId;
  /** Level n's boxes are drawn on top of every earlier level's, so each level only lists what it ADDS. */
  levels: { cost: Partial<Record<MaterialId, number>>; boxes: ImprovementBox[] }[];
  /** The name is plural ("Lamps"), so the copy says "are", "grow" and "need" (`agree`). */
  plural?: boolean;
};

/** The word that agrees with a plan's name: `one` for "the Fountain", `many` for "the Lamps". */
export const agree = (id: ImprovementId, one: string, many: string): string => (IMPROVEMENTS[id]?.plural ? many : one);

/* ---- box helpers ---------------------------------------------------------- */

/** A box by its colour, centre on the ground plane, footprint, and the height of its BOTTOM. */
const bx = (color: ImprovementColor, x: number, z: number, sx: number, sz: number, y0: number, sy: number): ImprovementBox => ({ x, y: y0 + sy / 2, z, sx, sy, sz, color });
/** The same boxes moved to a wing's place beside its building. */
const at = (ax: number, az: number, boxes: ImprovementBox[]): ImprovementBox[] => boxes.map((b) => ({ ...b, x: b.x + ax, z: b.z + az }));

const costs = (primary: MaterialId, secondary: MaterialId) =>
  ([[4, 2], [6, 3], [8, 4]] as const).map(([p, s]) => ({ [primary]: p, [secondary]: s }) as Partial<Record<MaterialId, number>>);

function make(label: string, host: ImprovementHost, primary: MaterialId, secondary: MaterialId, boxes: [ImprovementBox[], ImprovementBox[], ImprovementBox[]]): Improvement {
  const c = costs(primary, secondary);
  return { label, host, primary, secondary, levels: boxes.map((b, i) => ({ cost: c[i], boxes: b })) };
}

/* ---- the wings (each stands outside its building's drawn footprint, on a side or the back) --- */

const wellHouse = make("Well House", "well", "stone", "thread", [
  // A stone base with four posts: the frame of a little shelter, west of the well and behind its door.
  at(-4.6, -2.6, [bx("stone", 0, 0, 2.2, 2.2, 0, 0.3), ...[[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]].map(([x, z]) => bx("timber", x, z, 0.2, 0.2, 0.3, 1.5))]),
  at(-4.6, -2.6, [bx("roof", 0, 0, 2.6, 2.6, 1.8, 0.5), bx("stone", 0, 0, 1.4, 1.2, 0.3, 0.5)]),
  at(-4.6, -2.6, [bx("water", 0, 0, 1.1, 0.9, 0.8, 0.1), bx("gold", 0, 0, 0.35, 0.35, 2.3, 0.5), bx("cloth", 0.4, 0, 0.5, 0.06, 2.3, 0.35)]),
]);

const millGranary = make("Granary", "mill", "herbs", "stone", [
  at(1.5, -3.8, [bx("stone", 0, 0, 2.6, 2.6, 0, 0.3), bx("timber", 0, 0, 2.2, 2.2, 0.3, 1.1)]),
  at(1.5, -3.8, [bx("roof", 0, 0, 2.8, 2.8, 1.4, 0.5), bx("plaster", -0.8, -1.55, 0.5, 0.5, 0, 0.5), bx("plaster", 0.8, -1.55, 0.5, 0.5, 0, 0.5)]),
  at(1.5, -3.8, [bx("stone", 0.7, 0.3, 0.4, 0.4, 1.9, 1), bx("gold", -0.7, 0, 0.2, 0.2, 1.9, 0.5), bx("timber", 0, 1.15, 0.8, 0.06, 0.3, 0.9)]),
]);

const bridgeArches = make("Stone Arches", "bridge", "stone", "dye", [
  // A walkway on two piers, running north-south, west of the bridge house.
  at(-4.4, 0, [bx("stone", 0, -1.2, 0.8, 0.8, 0, 1.6), bx("stone", 0, 1.2, 0.8, 0.8, 0, 1.6), bx("stone", 0, 0, 1.6, 3.2, 1.6, 0.4)]),
  at(-4.4, 0, [bx("stone", -0.65, 0, 0.3, 3.2, 2, 0.4), bx("stone", 0.65, 0, 0.3, 3.2, 2, 0.4)]),
  at(-4.4, 0, [bx("glass", -0.65, -1.3, 0.3, 0.3, 2.4, 0.4), bx("glass", 0.65, 1.3, 0.3, 0.3, 2.4, 0.4), bx("gold", -0.65, -1.3, 0.35, 0.35, 2.8, 0.1), bx("gold", 0.65, 1.3, 0.35, 0.35, 2.8, 0.1)]),
]);

const chapelWindows = make("Painted Windows", "chapel", "dye", "stone", [
  at(4.4, 0, [bx("stone", 0, 0, 2.2, 2.4, 0, 0.3), bx("plaster", 0, 0, 2, 2.2, 0.3, 1)]),
  at(4.4, 0, [[-0.55, 1], [0.55, 1], [-0.55, -1], [0.55, -1]].map(([x, z]) => bx("glass", x, z, 0.8, 0.12, 1.3, 0.8))),
  at(4.4, 0, [bx("roof", 0, 0, 2.4, 2.6, 2.1, 0.5), bx("gold", 0, 0, 0.2, 0.2, 2.6, 0.5)]),
]);

const marketStalls = make("Cloth Stalls", "market", "thread", "dye", [
  // A stall on the market's east side, near the front but off the door lane, the road and the plaza.
  at(3.5, 3, [bx("timber", 0, 0.1, 1.6, 0.6, 0, 0.7), ...[[-0.85, -0.7], [0.85, -0.7], [-0.85, 0.7], [0.85, 0.7]].map(([x, z]) => bx("timber", x, z, 0.15, 0.15, 0, 1.7)), bx("cloth", 0, 0, 2, 1.6, 1.7, 0.12)]),
  at(3.5, 3, [bx("timber", -0.55, 0.1, 0.5, 0.5, 0.7, 0.4), bx("timber", 0.55, 0.1, 0.5, 0.5, 0.7, 0.4), bx("cloth", 0, 0.1, 0.6, 0.4, 0.7, 0.3)]),
  at(3.5, 3, [bx("gold", 0, -0.7, 0.8, 0.08, 1.82, 0.35), bx("plaster", -0.6, 0.65, 0.5, 0.5, 0, 0.5)]),
]);

const libraryReadingWing = make("Reading Wing", "library", "ink", "thread", [
  at(3.9, 0.4, [bx("stone", 0, 0, 2.6, 2.4, 0, 0.3), bx("plaster", 0, 0, 2.4, 2.2, 0.3, 1.3)]),
  at(3.9, 0.4, [bx("roof", 0, 0, 2.8, 2.6, 1.6, 0.5), bx("stone", 0.8, -0.6, 0.4, 0.4, 2.1, 1)]),
  at(3.9, 0.4, [bx("glass", -0.5, 0.4, 0.9, 0.6, 2.1, 0.6), bx("gold", 0.8, -0.6, 0.25, 0.25, 3.1, 0.4), bx("cloth", -0.5, 0.75, 0.6, 0.06, 2.1, 0.5)]),
]);

const watchtowerBeacon = make("Beacon Loft", "watchtower", "stone", "ink", [
  at(-4.7, -0.5, [bx("stone", 0, 0, 1.4, 1.4, 0, 0.8)]),
  at(-4.7, -0.5, [bx("stone", 0, 0, 1.1, 1.1, 0.8, 0.9), bx("timber", 0, 0, 1.4, 1.4, 1.7, 0.15)]),
  at(-4.7, -0.5, [...[[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]].map(([x, z]) => bx("timber", x, z, 0.12, 0.12, 1.85, 0.8)), bx("gold", 0, 0, 0.5, 0.5, 1.85, 0.6)]),
]);

const gardenHerbHouse = make("Herb House", "garden", "herbs", "thread", [
  at(4.6, 0.3, [bx("stone", 0, 0, 2.4, 2.4, 0, 0.15), bx("timber", 0, -0.7, 2, 0.6, 0.15, 0.7)]),
  at(4.6, 0.3, [bx("timber", -0.5, 0.6, 0.9, 0.9, 0.15, 0.35), bx("timber", 0.5, 0.6, 0.9, 0.9, 0.15, 0.35), bx("plaster", 0, -1.1, 2.4, 0.2, 0.15, 1.5)]),
  at(4.6, 0.3, [bx("timber", -1, 0.9, 0.15, 0.15, 0.15, 1.5), bx("timber", 1, 0.9, 0.15, 0.15, 0.15, 1.5), bx("glass", 0, -0.1, 2.4, 2.2, 1.65, 0.12)]),
]);

/* ---- the keep yard and the village (boxes centred on their spots) --------- */

const chronicleHall = make("Chronicle Hall", "keep", "ink", "stone", [
  [bx("stone", 0, 0, 5, 4, 0, 0.4), bx("plaster", 0, 0, 4.4, 3.4, 0.4, 1.8)],
  [bx("roof", 0, 0, 5, 4, 2.2, 0.7), bx("timber", 0, 1.73, 0.9, 0.06, 0.4, 1.3), bx("stone", 0, 2.25, 1.6, 0.5, 0, 0.2)],
  [bx("stone", 0, 0, 1.2, 1.2, 2.9, 0.9), bx("roof", 0, 0, 1.5, 1.5, 3.8, 0.4), bx("gold", 0, 0, 0.25, 0.25, 4.2, 0.5)],
]);

/** One banner: a stone foot, a pole, and a cloth hung beside it that rests on the foot. */
const banner = (x: number, finial: boolean): ImprovementBox[] => [
  bx("stone", x, 0, 0.6, 0.6, 0, 0.2),
  bx("timber", x, 0, 0.12, 0.12, 0.2, 2.2),
  bx("cloth", x + 0.3, 0, 0.5, 0.05, 0.2, 1.2),
  ...(finial ? [bx("gold", x, 0, 0.2, 0.2, 2.4, 0.25)] : []),
];
const villageBanners = make("Banners", "village", "dye", "thread", [
  banner(0, false),
  [...banner(-1.2, false), ...banner(1.2, false)],
  [bx("gold", 0, 0, 0.2, 0.2, 2.4, 0.25), bx("gold", -1.2, 0, 0.2, 0.2, 2.4, 0.25), bx("gold", 1.2, 0, 0.2, 0.2, 2.4, 0.25)],
]);

/** One lamp post: a stone foot, a post, a glass lantern and a cap. */
const lamp = (x: number): ImprovementBox[] => [
  bx("stone", x, 0, 0.5, 0.5, 0, 0.2),
  bx("timber", x, 0, 0.14, 0.14, 0.2, 1.8),
  bx("glass", x, 0, 0.4, 0.4, 2, 0.4),
  bx("roof", x, 0, 0.5, 0.5, 2.4, 0.12),
];
const villageLamps = make("Lamps", "village", "thread", "stone", [
  lamp(0),
  [...lamp(-1.3), ...lamp(1.3)],
  [0, -1.3, 1.3].map((x) => bx("gold", x, 0, 0.15, 0.15, 2.52, 0.2)),
]);

const villageFountain = make("Fountain", "village", "stone", "herbs", [
  [bx("stone", 0, 0, 3, 3, 0, 0.5), bx("water", 0, 0, 2.6, 2.6, 0.5, 0.08)],
  [bx("stone", 0, 0, 0.5, 0.5, 0.5, 1.2), bx("stone", 0, 0, 1.3, 1.3, 1.7, 0.2)],
  [bx("water", 0, 0, 1, 1, 1.9, 0.08), bx("gold", 0, 0, 0.2, 0.2, 1.9, 0.4), ...[[-1.75, -1.75], [1.75, -1.75], [-1.75, 1.75], [1.75, 1.75]].map(([x, z]) => bx("stone", x, z, 0.5, 0.5, 0, 0.7))],
]);

const villageStatue = make("Statue", "village", "stone", "ink", [
  [bx("stone", 0, 0, 1.8, 1.8, 0, 0.2), bx("stone", 0, 0, 1.3, 1.3, 0.2, 0.5)],
  [bx("stone", 0, 0, 0.9, 0.9, 0.7, 0.9)],
  [bx("stone", 0, 0, 0.55, 0.35, 1.6, 1), bx("plaster", 0, 0, 0.35, 0.35, 2.6, 0.35), bx("gold", 0, 0, 0.45, 0.45, 2.95, 0.14)],
]);

export const IMPROVEMENTS: Record<ImprovementId, Improvement> = {
  "well-house": wellHouse,
  "mill-granary": millGranary,
  "bridge-arches": { ...bridgeArches, plural: true },
  "chapel-windows": { ...chapelWindows, plural: true },
  "market-stalls": { ...marketStalls, plural: true },
  "library-reading-wing": libraryReadingWing,
  "watchtower-beacon": watchtowerBeacon,
  "garden-herb-house": gardenHerbHouse,
  "chronicle-hall": chronicleHall,
  "village-banners": { ...villageBanners, plural: true },
  "village-lamps": { ...villageLamps, plural: true },
  "village-fountain": villageFountain,
  "village-statue": villageStatue,
};

/* ---- plans ---------------------------------------------------------------- */

export type PlanStatus = {
  id: ImprovementId;
  /** The level on offer: one past the highest built, or the last level when all three stand. */
  level: number;
  state: "ready" | "short" | "host" | "done";
  /** What the hero lacks, even counting timber as a wildcard. Only on "short". */
  short?: Partial<Record<MaterialId, number>>;
};

/** How many levels every plan has. */
export const LEVELS = 3;

/**
 * What a plan's level costs, and its flexible share (RD-t): the catalog's secondary, which any
 * material may pay for once timber is spent. The one way to price a plan, so `planState`, the
 * hints, the Tavern card and `finishBuild` all weigh it by the same rule.
 */
export function planCost(id: ImprovementId, level: number): { cost: Partial<Record<MaterialId, number>>; flexible: MaterialId } {
  const plan = IMPROVEMENTS[id];
  return { cost: plan.levels[level - 1].cost, flexible: plan.secondary };
}

/** `allocateSpend` for a plan's level, with its flexible share marked (`planCost`). */
export function allocatePlan(id: ImprovementId, level: number, rows: readonly MaterialRow[]): ReturnType<typeof allocateSpend> {
  const { cost, flexible } = planCost(id, level);
  return allocateSpend(cost, rows, { flexible });
}

/**
 * Which of the gap notes a plan's cost bars need against a balance, so a bar that looks short is
 * explained: `timber` when timber fills a gap, and `any` when the secondary is short even after
 * timber and other materials have units this cost does not need, which pay for it (RD-t).
 */
export function planFillers(id: ImprovementId, level: number, balance: Record<MaterialId, number>): { timber: boolean; any: boolean } {
  const { cost, flexible } = planCost(id, level);
  const has = (m: MaterialId) => balance[m] ?? 0;
  const gap = (m: MaterialId) => Math.max(0, (cost[m] ?? 0) - has(m));
  const fixedGap = MATERIAL_IDS.reduce((n, m) => n + (m === flexible || m === "timber" ? 0 : gap(m)), 0);
  const spareTimber = has("timber") - (cost.timber ?? 0);
  const flexGap = gap(flexible);
  const spare = MATERIAL_IDS.some((m) => m !== flexible && m !== "timber" && has(m) > (cost[m] ?? 0));
  return {
    timber: spareTimber > 0 && fixedGap + flexGap > 0,
    any: spare && flexGap > Math.max(0, spareTimber - fixedGap),
  };
}
const totalOf = (m: Partial<Record<MaterialId, number>> | undefined): number => Object.values(m ?? {}).reduce<number>((n, v) => n + (v ?? 0), 0);
/** The building a wing stands on ("Village Well"); null for the keep yard's and the village's plans. */
export const hostLabel = (host: ImprovementHost): string | null => BUILDINGS.find((b) => b.id === host)?.label ?? null;

/**
 * Every plan's status for a hero. A wing is offered once its building is raised; the hall and the
 * decorations are always offered. Sorted: ready, then short (fewest missing first), then waiting
 * on a building, then done; catalog order within each.
 */
export function planState(input: { built: Record<string, number>; raised: ReadonlySet<string>; balance: Record<MaterialId, number> }): PlanStatus[] {
  // One earned row per material, so `allocateSpend` stays the one rule for what can be paid.
  const rows: MaterialRow[] = MATERIAL_IDS.map((m) => ({ materialId: m, amount: input.balance[m] ?? 0, kind: "earned" as const, sourceAssignmentId: null, createdAt: 0 })).filter((r) => r.amount > 0);
  const plans = IMPROVEMENT_IDS.map((id): PlanStatus => {
    const raw = Math.floor(input.built[id] ?? 0);
    const built = Number.isFinite(raw) ? Math.max(0, Math.min(LEVELS, raw)) : 0;
    if (built >= LEVELS) return { id, level: LEVELS, state: "done" };
    const level = built + 1;
    if (hostLabel(IMPROVEMENTS[id].host) !== null && !input.raised.has(IMPROVEMENTS[id].host)) return { id, level, state: "host" };
    const spend = allocatePlan(id, level, rows);
    return spend.ok ? { id, level, state: "ready" } : { id, level, state: "short", short: spend.short };
  });
  const rank = { ready: 0, short: 1, host: 2, done: 3 } as const;
  return plans
    .map((p, order) => ({ p, order }))
    .sort((a, b) => rank[a.p.state] - rank[b.p.state] || (a.p.state === "short" ? totalOf(a.p.short) - totalOf(b.p.short) : 0) || a.order - b.order)
    .map(({ p }) => p);
}

/** One line for a plan: what a child reads under its name. */
export function planLine(s: PlanStatus): string {
  switch (s.state) {
    case "ready":
      return "Ready to build";
    case "done":
      return "Built";
    case "host":
      return `Raise the ${hostLabel(IMPROVEMENTS[s.id].host)} first`;
    case "short": {
      const parts = Object.entries(s.short ?? {})
        .filter(([, n]) => (n ?? 0) > 0)
        .map(([m, n]) => `${n} more ${n === 1 ? MATERIALS[m as MaterialId].label : MATERIALS[m as MaterialId].plural}`);
      return `Needs ${parts.join(" and ")}`;
    }
  }
}

/** The plan's name as a sentence has it: "the Library's Reading Wing", "the Banners". */
function planName(id: ImprovementId): string {
  const { label, host } = IMPROVEMENTS[id];
  const building = hostLabel(host);
  return building ? `the ${building}'s ${label}` : `the ${label}`;
}

/** The nearest first: the fewest missing in all, catalog order on a tie. */
const nearestFirst = (a: PlanStatus, b: PlanStatus): number =>
  totalOf(a.short) - totalOf(b.short) || IMPROVEMENT_IDS.indexOf(a.id) - IMPROVEMENT_IDS.indexOf(b.id);

/**
 * What to say about a plan after a quest brought `made`: the pinned plan if it still wants that
 * material, otherwise the nearest plan that does (fewest missing in all, catalog order on a tie).
 * A plan wants `made` when it is short of it, or short of its flexible share, which any material
 * pays for (RD-t, `planCost`). Null when no plan needs it.
 */
export function planHint(made: MaterialId, plans: PlanStatus[], pinned: string | null): string | null {
  const wanted = (p: PlanStatus): number =>
    p.state === "short" ? (p.short?.[made] ?? 0) || (p.short?.[planCost(p.id, p.level).flexible] ?? 0) : 0;
  const needs = (p: PlanStatus) => wanted(p) > 0;
  const pin = pinned ? plans.find((p) => p.id === pinned && needs(p)) : undefined;
  const best = pin ?? plans.filter(needs).sort(nearestFirst)[0];
  return best ? `${planName(best.id)} ${agree(best.id, "needs", "need")} ${wanted(best)} more` : null;
}

/**
 * What to say after a quest brought timber, which no plan's cost names (it fills any gap): the
 * nearest short plan overall, worded like `planHint` with the plan's whole shortfall. Null when
 * no plan is short.
 */
export function nearestPlanHint(plans: PlanStatus[]): string | null {
  const best = plans.filter((p) => p.state === "short").sort(nearestFirst)[0];
  return best ? `${planName(best.id)} ${agree(best.id, "needs", "need")} ${totalOf(best.short)} more` : null;
}

/**
 * A front view (x across, y up) of what a level adds to what stands: `base` is every earlier
 * level's boxes and `added` is this level's. `x` and `y` are the left edge and the bottom of each
 * rectangle. Boxes further from the viewer come first, so nearer ones draw over them.
 */
export type Rect = { x: number; y: number; w: number; h: number; color: ImprovementColor };

export function planElevation(id: ImprovementId, level: number): { base: Rect[]; added: Rect[] } {
  const plan = IMPROVEMENTS[id];
  if (!plan) throw new Error(`Unknown improvement: ${id}`);
  if (!Number.isInteger(level) || level < 1 || level > LEVELS) throw new Error(`Unknown level for ${id}: ${level}`);
  const front = (boxes: ImprovementBox[]): Rect[] =>
    boxes
      .map((b, order) => ({ b, order }))
      .sort((a, b) => a.b.z - b.b.z || a.order - b.order)
      .map(({ b }) => ({ x: b.x - b.sx / 2, y: b.y - b.sy / 2, w: b.sx, h: b.sy, color: b.color }));
  return {
    base: front(plan.levels.slice(0, level - 1).flatMap((l) => l.boxes)),
    added: front(plan.levels[level - 1].boxes),
  };
}

/* ---- plan references ------------------------------------------------------- */

/** What a build run's `sourceRef` holds: the plan and the level it builds, as `<id>:<level>`. */
export function planRef(id: ImprovementId, level: number): string {
  return `${id}:${level}`;
}

/**
 * Reads a `planRef` back. Null for anything that `planRef` could not have written: not a string, an
 * id outside the catalog, a level that is not a plain 1, 2 or 3, or a different number of parts.
 */
export function parsePlanRef(sourceRef: string): { improvementId: ImprovementId; level: number } | null {
  if (typeof sourceRef !== "string") return null;
  const parts = sourceRef.split(":");
  if (parts.length !== 2) return null;
  const [id, digits] = parts;
  if (!Object.hasOwn(IMPROVEMENTS, id) || !/^[1-3]$/.test(digits)) return null;
  return { improvementId: id as ImprovementId, level: Number(digits) };
}
