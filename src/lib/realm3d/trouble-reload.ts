/**
 * A RELOAD DOES NOT BRING A CLEARED TROUBLE BACK.
 *
 * In play, a cleared trouble's home waits `RESPAWN_MS` (20 s) and then wakes only once the child
 * is more than `NO_POP_R` (34) away (`homeReady` in `troubles3d.ts`). That lived in the field, and
 * a reload makes a new field: every home read as never cleared, so the fog a child had just
 * lifted was standing there again the moment the island came back.
 *
 * The clears were already kept (`realm_trouble_clear`, one row per clear, paid or not, with its
 * `created_at`). The bundle now carries each home's LATEST clear from the last
 * `RELOAD_MEMORY_MS`, as how long ago it was on the server's own clock (`latestClears`), and the
 * new field is seeded with them (`seedClears`) before its first step. So across a reload "normal"
 * means exactly the rule in play, measured in real time:
 *
 *   - the 20 s runs from the clear itself, not from the reload — a reload neither restarts it nor
 *     skips it;
 *   - the 34 is measured from where the child stands after the reload. Nothing says where they
 *     were in between, so a home is treated as though they never walked away: it stays empty
 *     while they are within 34, and comes back once they are further (as it would have if they had
 *     walked away and back — it would have woken behind them).
 *
 * Why it cannot be farmed: nothing here writes, and nothing comes back SOONER than it would have
 * without the reload — the seed only ever pushes a home's cleared time later (`Math.max`), and the
 * age is rounded down to the stored second and then a second more (`STAMP_SLACK_MS`). Payment is
 * the server's anyway: a home pays once a day (the table's partial unique index), whatever wakes.
 *
 * Why it cannot lose a clear: every clear is still written as before, and only a home's latest
 * one is read; an older clear, or one from a day long gone, cannot hold a home empty for ever —
 * past `RELOAD_MEMORY_MS` it is not read at all, and inside it the child only has to step 34
 * away. A clear still waiting in the page's batch when it reloads is sent on the way out
 * (`use-trouble-bounty.ts`'s page-hide beacon), so the server still records it; and since that
 * beacon can reach the server after the reload has already read the bundle, the tab keeps its
 * own note of each clear too (below), so the reloaded page knows of it either way.
 *
 * A visiting grown-up reads the same bundle, so they see the child's cleared homes stay cleared;
 * they write nothing (`recordTroubleClears` refuses them, and their bounty hook never sends).
 *
 * Pure, no `three`: the server builds the list, the scene seeds the field.
 */

import type { TroubleField } from "./troubles3d";

/** How far back a reload remembers clears. Far past the 20 s wait: only the 34 is left to keep. */
export const RELOAD_MEMORY_MS = 10 * 60_000;

/**
 * `created_at` is stored to the second, and is when the clear REACHED the server (a batch waits
 * up to a few seconds), never before the clear. The stored second rounds the age up by as much
 * as a second; taking a second off keeps a reload from ever bringing a home back early.
 */
export const STAMP_SLACK_MS = 1000;

/** One home's latest clear: how long before the bundle was read it was cleared. */
export type RecentClear = { homeId: string; agoMs: number };

/** Each home's latest clear inside the window, as an age at `now`. `at` is epoch ms. */
export function latestClears(rows: readonly { homeId: string; at: number }[], now: number): RecentClear[] {
  const latest = new Map<string, number>();
  for (const r of rows) {
    if (!(now - r.at <= RELOAD_MEMORY_MS)) continue;
    const had = latest.get(r.homeId);
    if (had === undefined || r.at > had) latest.set(r.homeId, r.at);
  }
  return [...latest].map(([homeId, at]) => ({ homeId, agoMs: Math.max(0, now - at - STAMP_SLACK_MS) }));
}

/**
 * Seeds a new field with the clears a reload would otherwise forget. `sinceMs` is how long has
 * passed since the list was made (the page's own load time), added to every age. A home the
 * plan does not have (a place since built over, an old rim slot) is skipped. Only ever moves a
 * home's cleared time LATER. A trouble already awake at a seeded home — only possible if the
 * field stepped before the seed — is put back to sleep, since the child has not seen it for
 * more than a frame. Allocation-free; runs once, when the field is made.
 */
export function seedClears(f: TroubleField, clears: readonly RecentClear[], sinceMs: number): void {
  for (const c of clears) {
    let h = -1;
    for (let i = 0; i < f.homes.length; i++) {
      if (f.homes[i].id === c.homeId && !f.homes[i].leaving) {
        h = i;
        break;
      }
    }
    if (h < 0) continue;
    const at = f.now - Math.max(0, c.agoMs) - Math.max(0, sinceMs);
    if (at > f.clearedAt[h]) f.clearedAt[h] = at;
    const slot = f.slotOf[h];
    if (slot >= 0 && !f.troubles[slot].dying) {
      f.troubles[slot].live = false;
      f.slotOf[h] = -1;
    }
  }
}

/* ------------------------------------------------------------ the tab's own memory */

/**
 * The server's record is the record, but it is always a little behind: a clear that pays
 * nothing waits in the page's batch for a few seconds, and a page-hide beacon races the reload's
 * own request to the server. A reload in that gap read no clear, and the trouble stood there
 * again. So the hero's page also notes each clear in this tab's `sessionStorage`, at the moment
 * it happens, on this device's own clock, and a reload takes whichever of the two is newer per
 * home (`mergeClears`). The tab's note is only a waiting room: nothing is paid or counted from it,
 * it never outlives the tab, and it forgets anything past `RELOAD_MEMORY_MS`.
 */
export type TabClear = { homeId: string; at: number };

/** The tab's note, per hero. */
export function tabClearsKey(childId: string): string {
  return `realm3d:clears:${childId}`;
}

/** The most notes a tab keeps; a child clears a few a minute, and the window is ten minutes. */
export const TAB_CLEARS_MAX = 64;

/** A stored note, read defensively: anything malformed is dropped, as is anything past the window. */
export function readTabClears(raw: string | null, now: number): TabClear[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: TabClear[] = [];
  for (const e of parsed) {
    if (!e || typeof e !== "object") continue;
    const { homeId, at } = e as Record<string, unknown>;
    if (typeof homeId !== "string" || homeId.length > 64 || typeof at !== "number" || !Number.isFinite(at)) continue;
    if (now - at > RELOAD_MEMORY_MS) continue;
    out.push({ homeId, at });
  }
  return out.slice(-TAB_CLEARS_MAX);
}

/** The note with one more clear on it, the stale ones dropped. */
export function addTabClear(list: readonly TabClear[], homeId: string, now: number): TabClear[] {
  return [...list.filter((c) => now - c.at <= RELOAD_MEMORY_MS), { homeId, at: now }].slice(-TAB_CLEARS_MAX);
}

/**
 * The server's list and the tab's note, as one: per home, the NEWER clear (the smaller age). A
 * note stamped in the future (the device's clock went back) counts as just now, so it can only
 * make a home wait longer.
 */
export function mergeClears(server: readonly RecentClear[], tab: readonly TabClear[], now: number): RecentClear[] {
  const age = new Map<string, number>();
  for (const c of server) age.set(c.homeId, Math.min(age.get(c.homeId) ?? Infinity, Math.max(0, c.agoMs)));
  for (const c of tab) {
    const ago = now - c.at;
    if (ago > RELOAD_MEMORY_MS) continue;
    age.set(c.homeId, Math.min(age.get(c.homeId) ?? Infinity, Math.max(0, ago)));
  }
  return [...age].map(([homeId, agoMs]) => ({ homeId, agoMs }));
}

/** What the trouble bus carries from the bundle to the scene: the list, and when the page got it. */
export type HeldClears = { clears: readonly RecentClear[]; heldAt: number };

/** The page's side: hold the bundle's list with the moment it arrived (`performance.now()`). */
export function holdClears(clears: readonly RecentClear[] | undefined, now: number = typeof performance !== "undefined" ? performance.now() : 0): HeldClears {
  return { clears: clears ?? [], heldAt: now };
}
