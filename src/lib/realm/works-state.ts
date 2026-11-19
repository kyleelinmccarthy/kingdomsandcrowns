// The hero's works as the Realm holds them: the satchel, the built levels and their plaques, the pinned
// plan and the delivery not yet seen. Pure and client-safe (the plan catalog and the material table, no server code): the server loads it
// (`loadWorks`), and the HUD folds a finished build into it (`applyBuild`) without a reload.
import { IMPROVEMENTS, LEVELS, type ImprovementId, type Plaque } from "@/lib/realm/improvements";
import { MATERIAL_IDS, materialPhrase, type MaterialId } from "@/lib/realm/materials";
import type { RunSummary } from "@/lib/utils/deed-run-types";

export type { Plaque };

/** The earned materials created since the delivery card was last seen; `through` is the newest, in epoch seconds. */
export type Delivery = {
  rows: { materialId: MaterialId; amount: number; title: string; origin: "quest" | "welcome" }[];
  through: number;
};

export type Works = {
  balance: Record<MaterialId, number>;
  /** The highest built level per improvement id. */
  built: Record<string, number>;
  /** One per built level, oldest first. */
  plaques: Plaque[];
  /** The plan the hero pinned, when it is in the catalog. */
  pinned: string | null;
  delivery: Delivery | null;
};

/** What the Realm holds when nothing has been earned or built, or the read failed. */
export const EMPTY_WORKS: Works = {
  balance: { stone: 0, ink: 0, herbs: 0, thread: 0, dye: 0, timber: 0 },
  built: {},
  plaques: [],
  pinned: null,
  delivery: null,
};

/**
 * The plan the hero is working toward: the pinned plan while it still has a level to build. Null
 * with nothing pinned, for an id outside the catalog, and once every level stands (a finished plan
 * is no goal, whatever was pinned before it finished). The beacon (`plan-goal.ts`) asks this rather
 * than reading `works.pinned` itself; later readers should too.
 */
export function activePin(works: Pick<Works, "built" | "pinned">): ImprovementId | null {
  const pinned = works.pinned;
  if (!pinned || !Object.hasOwn(IMPROVEMENTS, pinned)) return null;
  return (works.built[pinned] ?? 0) >= LEVELS ? null : (pinned as ImprovementId);
}

export const CARTS_TITLE = "The carts are in!";
export const WELCOME_TITLE = "The carts arrived with four weeks of your work";

/** The plaques with `plaque` added, unless that level of that plan already has one (a level another tab built is handed back to the tab that did not). */
function addPlaque(plaques: readonly Plaque[], plaque: Plaque | undefined): Plaque[] {
  if (!plaque || plaques.some((p) => p.improvementId === plaque.improvementId && p.level === plaque.level)) return [...plaques];
  return [...plaques, plaque];
}

/** The Works after a build run's summary: the balance always; the level and plaque only when it was built. */
export function applyBuild(works: Works, improvement: NonNullable<RunSummary["improvement"]>): Works {
  if (!improvement.built) return { ...works, balance: improvement.balance };
  return {
    ...works,
    balance: improvement.balance,
    built: { ...works.built, [improvement.id]: Math.max(works.built[improvement.id] ?? 0, improvement.level) },
    plaques: addPlaque(works.plaques, improvement.plaque),
  };
}

const MAX_LINES = 6;
/** A line names this many quests (oldest first); `more` counts the rest. */
const MAX_TITLES = 3;

/**
 * What the delivery card says: a title, then one line per material (catalog order) with its total
 * ("2 Stone") and the distinct quests it came from, oldest first. The welcome title is for a delivery
 * of nothing but the welcome script's rows.
 */
export function deliveryLines(delivery: Delivery): { title: string; lines: { phrase: string; titles: string[]; more: number }[] } {
  const welcome = delivery.rows.length > 0 && delivery.rows.every((r) => r.origin === "welcome");
  const lines: { phrase: string; titles: string[]; more: number }[] = [];
  for (const id of MATERIAL_IDS) {
    const rows = delivery.rows.filter((r) => r.materialId === id);
    if (rows.length === 0) continue;
    const titles: string[] = [];
    for (const r of rows) if (!titles.includes(r.title)) titles.push(r.title);
    lines.push({
      phrase: materialPhrase(rows.reduce((n, r) => n + r.amount, 0), id),
      titles: titles.slice(0, MAX_TITLES),
      more: Math.max(0, titles.length - MAX_TITLES),
    });
  }
  return { title: welcome ? WELCOME_TITLE : CARTS_TITLE, lines: lines.slice(0, MAX_LINES) };
}
