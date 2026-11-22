/**
 * THE WORLD'S STATE: what a hero has opened, and what it left them. Pure and client-safe.
 *
 * `realm_world_state` holds one row per hero and namespaced object id (see its schema comment).
 * `heldNow` is the one rule for whether a chest or door is still open or a rune object still fixed
 * (`lockedNow` and `brokenNow` are its two readings), read with the server's day in the family's
 * zone, never the device's. `worldStateView` is the shape the frame draws from,
 * built from the rows the server read and mirrored on the client.
 */

import { addDays, todayInZone } from "@/lib/utils/dates";
import type { ContentBand } from "@/lib/utils/content-bands";
import { DECOR_IDS, WORLD_OBJECTS, rewardKey, worldObjectById, type DecorId, type WorldObject, type WorldReward } from "./world-objects";
import { towerRef } from "./puzzle-tower";
import { RUNE_OBJECTS, runeObjectById, type RuneEffect, type RuneObject } from "./rune-objects";
import type { RoomKind } from "@/lib/realm3d/doorways";
import type { RuneOutcome, TowerOutcome, WorldOutcome } from "@/lib/utils/deed-run-types";

export type WorldRow = { objectId: string; state: string; updatedAt: Date };

/**
 * Does this object still hold what its row says (`held`: "open" for a chest or door, "fixed" for a
 * rune object) at `today` (the family's calendar day in `zone`)? One with no row, or a row in any
 * other state, holds nothing. A held one with no `resetAfterDays` holds for good; with it, it lets go
 * on the local day that many days after the day the row was written.
 */
export function heldNow(object: { resetAfterDays?: number }, row: Pick<WorldRow, "state" | "updatedAt"> | null, held: string, today: string, zone: string): boolean {
  if (!row || row.state !== held) return false;
  if (object.resetAfterDays === undefined) return true;
  return addDays(todayInZone(zone, row.updatedAt), object.resetAfterDays) > today;
}

/** Is this chest or door shut at `today`? One with no row, or a row that is not "open", is shut; an open chest shuts again after its reset. */
export function lockedNow(object: Pick<WorldObject, "resetAfterDays">, row: Pick<WorldRow, "state" | "updatedAt"> | null, today: string, zone: string): boolean {
  return !heldNow(object, row, "open", today, zone);
}

/** Is this rune object broken at `today`? One with no row, or a row that is not "fixed", is broken; a fixed one breaks again after its reset. */
export function brokenNow(object: Pick<RuneObject, "resetAfterDays">, row: Pick<WorldRow, "state" | "updatedAt"> | null, today: string, zone: string): boolean {
  return !heldNow(object, row, "fixed", today, zone);
}

/**
 * What opening gives. A vault door gives everything it holds, at once. A chest gives the first
 * reward in its list that the hero does not yet own (`owned` is `rewardKey`s), and nothing once
 * they own them all: an emptied chest still refills, and still opens, for nothing.
 */
export function nextRewards(object: WorldObject, owned: ReadonlySet<string>): WorldReward[] {
  if (object.type === "door") return [...object.rewards];
  const next = object.rewards.find((r) => !owned.has(rewardKey(r)));
  return next ? [next] : [];
}

export type TowerFloorView = { band: ContentBand; open: boolean; solved: number };

/** What the frame draws the world's locks from. */
export type WorldStateView = {
  /** The grown-up's "Solving logic locks" switch: off, no chest, door or bonus lock is offered. */
  locksOn: boolean;
  /** The grown-up's "Rune spellcraft" switch: off, no rune object is drawn or offered (what is fixed stays recorded). */
  runesOn: boolean;
  /** Chest and door ids that stand open now: an object with no row, a relocked chest and an unknown id are not here. Catalog order. */
  open: string[];
  /** Rune object ids that stand fixed now: one with no row, or one that has broken again, is not here. Catalog order, whatever the switch says. */
  fixed: string[];
  /** The decorations the hero has found, in catalog order. */
  decor: DecorId[];
  /** The Tower's visible floors, bottom first. */
  tower: TowerFloorView[];
};

/** Nothing found and nothing offered: what a failed read draws. */
export const EMPTY_WORLD_STATE: WorldStateView = { locksOn: false, runesOn: false, open: [], fixed: [], decor: [], tower: [] };

/**
 * A tower record's state is the solved count as text; anything that is not a whole count is none.
 * The one reading of it: the view here, and the server's bump and miss (`realm-world-state.ts`).
 */
export function solvedCount(state: string | undefined): number {
  return state !== undefined && /^\d{1,9}$/.test(state) ? Number(state) : 0;
}

/**
 * The view of a hero's world: what is open and what is fixed at `clock`, what they have found, and
 * each of the Tower's `floors` with its solved count (the floors come from `towerFloors`, which knows
 * what the hero has earned; this only gives them their counts). `runesOn` is only carried: what is
 * fixed is listed either way, so an object comes back as its row says when the switch does.
 */
export function worldStateView(rows: readonly WorldRow[], floors: readonly { band: ContentBand; open: boolean }[], clock: { today: string; zone: string }, locksOn: boolean, runesOn = false): WorldStateView {
  const byId = new Map(rows.map((r) => [r.objectId, r]));
  const open = WORLD_OBJECTS.filter((o) => !lockedNow(o, byId.get(o.id) ?? null, clock.today, clock.zone)).map((o) => o.id);
  const fixed = RUNE_OBJECTS.filter((o) => !brokenNow(o, byId.get(o.id) ?? null, clock.today, clock.zone)).map((o) => o.id);
  const decor = DECOR_IDS.filter((id) => byId.has(`decor:${id}`));
  const tower = floors.map((f) => ({ band: f.band, open: f.open, solved: solvedCount(byId.get(towerRef(f.band))?.state) }));
  return { locksOn, runesOn, open, fixed, decor, tower };
}

/* ------------------------------------------------------------------ what the scene draws */

/** A chest or vault door as the scene draws it and E reaches it: where, which way, and whether it stands open. */
export type LockSpotView = { id: string; type: "chest" | "door"; label: string; x: number; z: number; ry: number; open: boolean };

/**
 * A rune object as the scene draws it and E reaches it: where, which way, and whether it stands fixed.
 * `label` is its name for its state: "the broken wagon", then "the wagon" (RI-a / N8).
 */
export type RuneSpotView = { id: string; effect: RuneEffect; label: string; x: number; z: number; ry: number; fixed: boolean };

/**
 * What the island's canvas draws from (RG-a): the chests and doors out in the world, the rune
 * objects, the decorations found, how many storeys the Tower has grown, and whether its floors are known at all
 * (`towerKnown`: a failed kingdom read lists none, and then the Tower offers no board). Handed to
 * the memoised `World`, so the frame keeps it the same object until one of these changes
 * (`use-world-state.ts`).
 */
export type WorldCanvas = { locksOn: boolean; locks: readonly LockSpotView[]; runes: readonly RuneSpotView[]; decor: readonly DecorId[]; storeys: number; towerKnown: boolean };

export function lockSpotView(o: WorldObject, open: boolean): LockSpotView {
  return { id: o.id, type: o.type, label: o.label, x: o.x, z: o.z, ry: o.ry, open };
}

export function runeSpotView(o: RuneObject, fixed: boolean): RuneSpotView {
  return { id: o.id, effect: o.effect, label: fixed ? o.fixedLabel : o.label, x: o.x, z: o.z, ry: o.ry, fixed };
}

/**
 * The island's canvas: every chest and door out in the world (a room's chest is the room's, see
 * `roomChestFor`), or none at all with the locks switched off (R-G7), when nothing is drawn and
 * nothing offered; likewise every rune object, or none with runes off (R-I13). What was found stays
 * either way: the decorations and the Tower's open storeys.
 */
export function worldCanvas(view: WorldStateView): WorldCanvas {
  const open = new Set(view.open);
  const locks = view.locksOn ? WORLD_OBJECTS.filter((o) => !o.room).map((o) => lockSpotView(o, open.has(o.id))) : [];
  const fixed = new Set(view.fixed);
  const runes = view.runesOn ? RUNE_OBJECTS.map((o) => runeSpotView(o, fixed.has(o.id))) : [];
  return { locksOn: view.locksOn, locks, runes, decor: view.decor, storeys: view.tower.filter((f) => f.open).length, towerKnown: view.tower.length > 0 };
}

/**
 * A rune walk's view of its objects (owner, 2026-11-21): every object the walk still `named` is drawn
 * broken, by its broken label and with the cast verb, whatever its record says, until its word is
 * cast on this walk (`mended`), when it shows mended at once. Anything else keeps its record. Only
 * the canvas changes: the record, and the renewal a right cast writes at the finish (R-I22), are the
 * server's. The same canvas comes back when the walk changes nothing, so the memoised `World` is not
 * redrawn for nothing; with no walk it is the canvas itself.
 */
export function withRuneWalk(canvas: WorldCanvas, walk: { named: readonly string[]; mended: readonly string[] } | null): WorldCanvas {
  if (!walk) return canvas;
  let changed = false;
  const runes = canvas.runes.map((r) => {
    const fixed = walk.mended.includes(r.id) ? true : walk.named.includes(r.id) ? false : r.fixed;
    const object = fixed === r.fixed ? null : runeObjectById(r.id);
    if (!object) return r;
    changed = true;
    return runeSpotView(object, fixed);
  });
  return changed ? { ...canvas, runes } : canvas;
}

/** The chest standing in this room, in the room's own frame, or null: none there, or the locks are off. */
export function roomChestFor(room: RoomKind, view: WorldStateView): LockSpotView | null {
  if (!view.locksOn) return null;
  const chest = WORLD_OBJECTS.find((o) => o.room === room);
  return chest ? lockSpotView(chest, view.open.includes(chest.id)) : null;
}

/**
 * The client's mirror of an opening the server wrote (PC-G2), so the chest stands open and its
 * decoration appears without a reload. A miss changes nothing and gives back the same view. A lock
 * the server says was already open (another run opened it, or its start was refused as open) is
 * shown open too, with nothing new placed; if the view already shows it open, that is the same view
 * as well. Catalog order is kept, as `worldStateView` gives it.
 */
export function applyWorldOutcome(view: WorldStateView, o: WorldOutcome): WorldStateView {
  const nowOpen = o.opened || o.reason === "already-open";
  if (!nowOpen || !worldObjectById(o.objectId) || (!o.opened && view.open.includes(o.objectId))) return view;
  const open = new Set([...view.open, o.objectId]);
  // Only an opening gives anything: an "already-open" answer shows the lock open and places nothing.
  const given = o.opened ? o.rewards : [];
  const decor = new Set<DecorId>([...view.decor, ...given.flatMap((r) => (r.kind === "decor" ? [r.id] : []))]);
  return {
    ...view,
    open: WORLD_OBJECTS.filter((x) => open.has(x.id)).map((x) => x.id),
    decor: DECOR_IDS.filter((id) => decor.has(id)),
  };
}

/**
 * The client's mirror of a Tower floor's solved count, so the board shows it without a reload. The
 * server's count is taken as it stands (a miss carries the unchanged count, so the view comes back
 * the same). A band the view does not show gives the same view, and no floor is ever opened here:
 * only the bundle's `towerFloors` says which are.
 */
export function applyTowerOutcome(view: WorldStateView, o: TowerOutcome): WorldStateView {
  const floor = view.tower.find((f) => f.band === o.band);
  if (!floor || floor.solved === o.solved) return view;
  return { ...view, tower: view.tower.map((f) => (f.band === o.band ? { ...f, solved: o.solved } : f)) };
}

/**
 * The client's mirror of the fixes a finished run wrote (R-I21), so each object stands fixed without
 * a reload. A miss changes nothing. An object the server says already held (another run fixed it) is
 * shown fixed too. An id that is not in the catalog, and an object the view already shows fixed, give
 * back the same view. Catalog order is kept, as `worldStateView` gives it.
 */
export function applyRuneOutcomes(view: WorldStateView, outcomes: readonly RuneOutcome[]): WorldStateView {
  const now = new Set(view.fixed);
  for (const o of outcomes) if ((o.fixed || o.reason === "already-fixed") && runeObjectById(o.objectId)) now.add(o.objectId);
  if (now.size === view.fixed.length) return view;
  return { ...view, fixed: RUNE_OBJECTS.filter((o) => now.has(o.id)).map((o) => o.id) };
}
