# Realm: Season's End Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the crown its moment: a ceremony at the castle on the hero's next Realm visit after a promotion (with a Tavern card for heroes who never open the Realm), wearable crowns on the avatar, castle banners per completed season, and defined grade-removal semantics.

**Architecture:** One migration adds `season.ceremony_seen_at`. The pure season rules in `src/lib/utils/seasons.ts` gain the pause/delete rows and the ceremony selection helpers; a small `src/lib/services/crowns.ts` loads season rows and marks ceremonies seen. The ceremony itself is a pure script in `src/lib/realm/ceremony/ceremony.ts` stepped from the scene's frame loop (the same ref-driven pattern as spells and recess), drawn by a `CeremonyLayer`, and wired by the shell, which pauses input and the clock while it runs. Regalia is derived: banners from completed seasons, the worn crown from a validated avatar-config field.

**Tech Stack:** Next.js 16 App Router (server actions), React 19 + React Compiler, Drizzle + libsql, three 0.185 / @react-three/fiber 9 / drei 10, Vitest + Testing Library (jsdom, no WebGL), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-08-realm-seasons-end-design.md`

## Global Constraints

- `"use server"` files export only async functions; never `export type { X }` from one (types live in `src/lib/services/**` or `src/lib/utils/**`).
- Hero-or-parent writes go through `requireChildAccess(childId, { write: true })`; reads through `requireChildAccess(childId)`.
- No synchronous `setState` inside effects (lint rule `react-hooks/set-state-in-effect`); scene events reach React via `queueMicrotask`; the React Compiler forbids render-time ref writes.
- `World` in the scene is memoised: every scene prop must be referentially stable (memoise objects, `useCallback` handlers, keep refs).
- three.js runtime imports only in `realm-scene.tsx`, `spell-layer.tsx`, `recess-layer.tsx`, and the new `ceremony-layer.tsx`; nothing under test imports them.
- DOM overlays inside `.realm-root` stop pointer propagation; never put `zoom` on `.realm-root`.
- Copy, verbatim: "The people of the Realm gather.", "Hail, {name}, {crown label}!", "Season {ordinal} complete", "Skip", "A crown awaits, {name}!", "See the ceremony", "Hail!", "Finish a season to earn your first crown.", "Ceremony held", "Ceremony awaits", "No grade set: the season is paused.", "That crown is not yours yet.", customizer tab "Crown".
- Timing constants: `GATHER_MS = 3000`, `DESCEND_MS = 1500`, `HAIL_MS = 4000`, walk safety net 20 s, crown from y 4 to y 1.9, `BANNER_CAP = 8`.
- Parents never see the ceremony in the world (`bundle.ceremony` is null for parent views).
- Skip is a 44 px HUD button and the Escape key; "Leave the Realm" always works.
- Git: run each git command on its own (no `&&` chains); commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- After editing `src/lib/db/schema.ts`, run `npm run db:generate` and then `npm run db:migrate`; check the generated SQL by eye.

---

### Task 1: Season model, migration, service, and actions

**Files:**
- Modify: `src/lib/db/schema.ts` (the `season` table, around line 657)
- Create (generated): `src/lib/db/migrations/0024_*.sql` and its `meta/` entries via `npm run db:generate`
- Modify: `src/lib/utils/seasons.ts`
- Test: `src/lib/utils/seasons.test.ts`
- Modify: `src/lib/services/season-sync.ts`
- Create: `src/lib/services/crowns.ts`
- Modify: `src/lib/actions/seasons.ts`
- Modify: `src/lib/actions/children.ts:141-145`

**Interfaces:**
- Consumes: `crownById(id): CrownTier | null` and `crownForOrdinal(ordinal)` from `src/lib/utils/crown-catalog.ts`; `SeasonRecord`, `planSeasonTransition`, `TransitionPlan` from `src/lib/utils/seasons.ts`.
- Produces (used by Tasks 2, 5):
  - `type SeasonWithCeremony = SeasonRecord & { completedAt: string | null; ceremonySeenAt: string | null }`
  - `BANNER_CAP = 8`, `type CompletedCrown = { season: SeasonWithCeremony; crown: CrownTier }`, `type CrownChoice = { id: string; label: string; color: string; seasonLabel: string }`
  - `pendingCeremony(seasons): SeasonWithCeremony | null`, `completedCrowns(seasons): CompletedCrown[]`, `crownChoices(seasons): CrownChoice[]`, `bannerCount(seasons): number`, `wearableCrownIds(seasons): Set<string>`, `seasonsToMark(seasons, seasonId): string[]`, `gradeName(grade): string`
  - `TransitionInput.newGrade: string | null`; plan types `{ type: "pause"; seasonId }` and `{ type: "delete_open"; seasonId }`
  - `src/lib/services/crowns.ts`: `loadSeasons(childId): Promise<SeasonWithCeremony[]>` (ordinal descending), `markCeremonySeen(childId, seasonId): Promise<void>`
  - `src/lib/services/season-sync.ts`: `syncSeasonForGrade(childId, newGrade: string | null, today)`
  - `src/lib/actions/seasons.ts`: `getSeasons(childId): Promise<{ open: SeasonWithCeremony | null; history: SeasonWithCeremony[]; pending: SeasonWithCeremony | null }>`, `markCeremonySeen(childId, seasonId): Promise<void>`

Clearing a grade needs no new control: the Chronicle's age input already switches a hero to a birth year, and `resolveAge` then stores `grade: null`. This task only makes the season hear about it.

- [ ] **Step 1: Add the column and generate the migration**

In `src/lib/db/schema.ts`, inside the `season` table after the `crownId` line, add:

```ts
    ceremonySeenAt: integer("ceremony_seen_at", { mode: "timestamp" }), // null until the hero has seen (or a family member has dismissed) the crown ceremony
```

Run:

```bash
npm run db:generate
```

Expected: a new file `src/lib/db/migrations/0024_<words>.sql` containing exactly `ALTER TABLE \`season\` ADD \`ceremony_seen_at\` integer;` and a new entry with `"idx": 24` in `src/lib/db/migrations/meta/_journal.json`. Then run:

```bash
npm run db:migrate
```

Expected: exits 0 (the local `local.db` now has the column).

- [ ] **Step 2: Write the failing season-rule tests**

Append to `src/lib/utils/seasons.test.ts` (extend the existing import line to include the new names):

```ts
import {
  planSeasonTransition, seasonLabel, nextOrdinal, gradeName,
  pendingCeremony, completedCrowns, crownChoices, bannerCount, wearableCrownIds, seasonsToMark, BANNER_CAP,
  type TransitionInput, type SeasonWithCeremony,
} from "./seasons";
```

```ts
describe("clearing the grade", () => {
  it("pauses an open season that has activity", () => {
    expect(planSeasonTransition({ ...base, newGrade: null })).toEqual({ type: "pause", seasonId: "s-open" });
  });
  it("deletes an open season with no activity", () => {
    expect(planSeasonTransition({ ...base, newGrade: null, openSeasonHasActivity: false })).toEqual({ type: "delete_open", seasonId: "s-open" });
  });
  it("does nothing when no season is open", () => {
    expect(planSeasonTransition({ ...base, newGrade: null, openSeason: null })).toEqual({ type: "noop" });
  });
});

const done = (id: string, ordinal: number, crownId: string | null, seen: string | null = null): SeasonWithCeremony => ({
  id, grade: String(ordinal), ordinal, startDate: `${2020 + ordinal}-08-15`, endDate: `${2021 + ordinal}-06-01`, crownId,
  completedAt: `${2021 + ordinal}-06-01T00:00:00.000Z`, ceremonySeenAt: seen,
});
const stillOpen: SeasonWithCeremony = { id: "s-open", grade: "9", ordinal: 9, startDate: "2029-08-15", endDate: null, crownId: null, completedAt: null, ceremonySeenAt: null };

describe("ceremony selection", () => {
  it("picks the newest completed, crowned season whose ceremony has not been seen", () => {
    const seasons = [done("s1", 1, "crown-copper", "2022-06-02T00:00:00.000Z"), done("s2", 2, "crown-iron"), done("s3", 3, "crown-silver"), stillOpen];
    expect(pendingCeremony(seasons)?.id).toBe("s3");
    expect(pendingCeremony([stillOpen, done("s2", 2, "crown-iron"), done("s3", 3, "crown-silver")])?.id).toBe("s3");
  });
  it("is null when every crown has had its ceremony or nothing is complete", () => {
    expect(pendingCeremony([done("s1", 1, "crown-copper", "2022-06-02T00:00:00.000Z"), stillOpen])).toBeNull();
    expect(pendingCeremony([stillOpen])).toBeNull();
    expect(pendingCeremony([])).toBeNull();
  });
  it("still offers a ceremony for an unknown crown id, but never lists it as wearable", () => {
    expect(pendingCeremony([done("s1", 1, "crown-mystery")])?.id).toBe("s1");
    expect(completedCrowns([done("s1", 1, "crown-copper"), done("s2", 2, "crown-mystery")]).map((c) => c.crown.id)).toEqual(["crown-copper"]);
    expect(wearableCrownIds([done("s2", 2, "crown-mystery")]).size).toBe(0);
  });
  it("lists crowns newest first with their season labels and counts banners up to the cap", () => {
    const many = Array.from({ length: 10 }, (_, i) => done(`s${i + 1}`, i + 1, crownForOrdinal(i + 1).id));
    expect(completedCrowns(many)[0].crown.id).toBe(crownForOrdinal(10).id);
    expect(crownChoices(many)[9]).toEqual({ id: "crown-copper", label: "Copper Circlet", color: "#b87333", seasonLabel: "2021–22" });
    expect(bannerCount(many)).toBe(BANNER_CAP);
    expect(bannerCount([done("s1", 1, "crown-copper"), stillOpen])).toBe(1);
    expect(bannerCount([stillOpen])).toBe(0);
    expect(wearableCrownIds(many).has("crown-copper")).toBe(true);
    expect(wearableCrownIds([stillOpen]).size).toBe(0);
  });
  it("marks the chosen season and every older unmarked one, never the open season", () => {
    const seasons = [done("s1", 1, "crown-copper"), done("s2", 2, "crown-iron", "2023-06-02T00:00:00.000Z"), done("s3", 3, "crown-silver"), done("s4", 4, "crown-gold"), stillOpen];
    expect(seasonsToMark(seasons, "s3").sort()).toEqual(["s1", "s3"]);
    expect(seasonsToMark(seasons, "s-open")).toEqual([]);
    expect(seasonsToMark(seasons, "nope")).toEqual([]);
    expect(seasonsToMark(seasons, "s2")).toEqual(["s1"]);
  });
  it("names grades for people", () => {
    expect(gradeName("K")).toBe("Kindergarten");
    expect(gradeName("3")).toBe("Grade 3");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/lib/utils/seasons.test.ts`
Expected: FAIL (the new exports do not exist; `newGrade: null` is a type error).

- [ ] **Step 4: Implement the rules and helpers**

In `src/lib/utils/seasons.ts`:

Change the import line to `import { crownById, crownForOrdinal, type CrownTier } from "./crown-catalog";`.

Change `newGrade: string;` in `TransitionInput` to:

```ts
  /** null when the grade is being cleared. */
  newGrade: string | null;
```

Add two members to `TransitionPlan` after `reopen_previous`:

```ts
  | { type: "pause"; seasonId: string } // the grade was cleared while the open season has activity: keep it, no crown
  | { type: "delete_open"; seasonId: string }; // the grade was cleared and nothing happened in the season: a label that never became a year
```

At the top of `planSeasonTransition`, before `if (!openSeason)`, add:

```ts
  // Clearing the grade neither promotes nor demotes. A season with work in it
  // waits for a grade again; an empty one never was a year.
  if (newGrade === null) {
    if (!openSeason) return { type: "noop" };
    return openSeasonHasActivity ? { type: "pause", seasonId: openSeason.id } : { type: "delete_open", seasonId: openSeason.id };
  }
```

Append at the end of the file:

```ts
export function gradeName(grade: string): string {
  return grade === "K" ? "Kindergarten" : `Grade ${grade}`;
}

// ── Ceremonies and regalia ──────────────────────────────────

/** A season row as the client sees it: timestamps as ISO strings, never Dates. */
export type SeasonWithCeremony = SeasonRecord & { completedAt: string | null; ceremonySeenAt: string | null };
export type CompletedCrown = { season: SeasonWithCeremony; crown: CrownTier };
/** What the customizer's Crown tab lists. */
export type CrownChoice = { id: string; label: string; color: string; seasonLabel: string };

/** The castle carries at most this many banners, however many seasons are done. */
export const BANNER_CAP = 8;

function completedNewestFirst(seasons: SeasonWithCeremony[]): SeasonWithCeremony[] {
  return seasons.filter((s) => s.completedAt !== null).sort((a, b) => b.ordinal - a.ordinal);
}

/** The newest completed season with a crown whose ceremony nobody has seen yet. An unknown crown id still gets its ceremony. */
export function pendingCeremony(seasons: SeasonWithCeremony[]): SeasonWithCeremony | null {
  return completedNewestFirst(seasons).find((s) => s.crownId !== null && s.ceremonySeenAt === null) ?? null;
}

/** Every earned crown with its season, newest first; a crown id the catalog does not know is skipped. */
export function completedCrowns(seasons: SeasonWithCeremony[]): CompletedCrown[] {
  const out: CompletedCrown[] = [];
  for (const season of completedNewestFirst(seasons)) {
    const crown = season.crownId ? crownById(season.crownId) : null;
    if (crown) out.push({ season, crown });
  }
  return out;
}

export function crownChoices(seasons: SeasonWithCeremony[]): CrownChoice[] {
  return completedCrowns(seasons).map(({ season, crown }) => ({ id: crown.id, label: crown.label, color: crown.color, seasonLabel: seasonLabel(season.startDate) }));
}

export function bannerCount(seasons: SeasonWithCeremony[]): number {
  return Math.min(BANNER_CAP, completedNewestFirst(seasons).length);
}

export function wearableCrownIds(seasons: SeasonWithCeremony[]): Set<string> {
  return new Set(completedCrowns(seasons).map((c) => c.crown.id));
}

/**
 * Which seasons a "seen" mark on `seasonId` covers: that season and every
 * older completed season still unmarked, so a backlog never plays as a queue.
 * Empty when the id is not one of this hero's completed seasons.
 */
export function seasonsToMark(seasons: SeasonWithCeremony[], seasonId: string): string[] {
  const target = seasons.find((s) => s.id === seasonId && s.completedAt !== null);
  if (!target) return [];
  return seasons.filter((s) => s.completedAt !== null && s.ceremonySeenAt === null && s.ordinal <= target.ordinal).map((s) => s.id);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/utils/seasons.test.ts`
Expected: PASS.

- [ ] **Step 6: Apply the new plans in the sync service and accept a null grade**

In `src/lib/services/season-sync.ts`, add two cases to the `switch` in `applyPlan`, after the `reopen_previous` case:

```ts
    case "pause":
      // Kept as-is: an open season without a grade simply waits for one.
      return;
    case "delete_open":
      await db.delete(schema.season).where(eq(schema.season.id, plan.seasonId));
      return;
```

Change the signature of `syncSeasonForGrade` to:

```ts
/** Called whenever a hero's grade is set or cleared (`newGrade` null). `today` is the caller's local ISO date. */
export async function syncSeasonForGrade(
  childId: string,
  newGrade: string | null,
  today: string
): Promise<TransitionPlan> {
```

(The body is unchanged; `planSeasonTransition` now accepts null.)

- [ ] **Step 7: Create the crowns service**

Create `src/lib/services/crowns.ts`:

```ts
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { seasonsToMark, type SeasonWithCeremony } from "@/lib/utils/seasons";

/**
 * Season rows for the client and the ceremony bookkeeping. Plain module, not
 * a "use server" file: callers have already authorized the child.
 */

export function toSeasonWithCeremony(row: typeof schema.season.$inferSelect): SeasonWithCeremony {
  return {
    id: row.id,
    grade: row.grade,
    ordinal: row.ordinal,
    startDate: row.startDate,
    endDate: row.endDate,
    crownId: row.crownId,
    completedAt: row.completedAt?.toISOString() ?? null,
    ceremonySeenAt: row.ceremonySeenAt?.toISOString() ?? null,
  };
}

/** Every season the hero has, newest ordinal first. */
export async function loadSeasons(childId: string): Promise<SeasonWithCeremony[]> {
  const rows = await db.select().from(schema.season).where(eq(schema.season.childId, childId)).orderBy(desc(schema.season.ordinal));
  return rows.map(toSeasonWithCeremony);
}

/**
 * Records that the crown ceremony for `seasonId` has been seen, along with
 * any older completed season still unmarked. Idempotent: marking a season
 * that is already marked changes nothing. Throws when the season is not
 * this hero's.
 */
export async function markCeremonySeen(childId: string, seasonId: string): Promise<void> {
  const seasons = await loadSeasons(childId);
  if (!seasons.some((s) => s.id === seasonId)) throw new Error("That season is not yours.");
  const ids = seasonsToMark(seasons, seasonId);
  if (ids.length === 0) return;
  const now = new Date();
  await db.update(schema.season).set({ ceremonySeenAt: now, updatedAt: now }).where(inArray(schema.season.id, ids));
}
```

- [ ] **Step 8: Rewrite the seasons action and pass null grades from the child update**

Replace the whole of `src/lib/actions/seasons.ts` with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { requireChildAccess } from "@/lib/auth/access";
import { ensureSeason } from "@/lib/services/season-sync";
import { loadSeasons, markCeremonySeen as markSeen } from "@/lib/services/crowns";
import { pendingCeremony, type SeasonWithCeremony } from "@/lib/utils/seasons";

/** The open season, completed history (newest first), and the ceremony waiting to be held, if any. A hero may read their own. */
export async function getSeasons(
  childId: string
): Promise<{ open: SeasonWithCeremony | null; history: SeasonWithCeremony[]; pending: SeasonWithCeremony | null }> {
  await requireChildAccess(childId);
  await ensureSeason(childId);
  const seasons = await loadSeasons(childId);
  return {
    open: seasons.find((s) => s.completedAt === null) ?? null,
    history: seasons.filter((s) => s.completedAt !== null),
    pending: pendingCeremony(seasons),
  };
}

/** The hero has seen the ceremony (or a family member dismissed the card). Hero or parent. */
export async function markCeremonySeen(childId: string, seasonId: string): Promise<void> {
  await requireChildAccess(childId, { write: true });
  await markSeen(childId, seasonId);
  revalidatePath("/tavern");
  revalidatePath("/loot");
  revalidatePath("/realm");
  revalidatePath("/settings");
}
```

In `src/lib/actions/children.ts`, replace the block

```ts
  let seasonTransition: TransitionPlan | null = null;
  if (data.grade) {
    seasonTransition = await syncSeasonForGrade(childId, data.grade, today ?? formatDate(new Date()));
  }
```

with

```ts
  // A birth year replaces the grade (resolveAge clears it), so the season
  // hears about the cleared grade too: paused if it has work, dropped if not.
  let seasonTransition: TransitionPlan | null = null;
  if (data.grade) {
    seasonTransition = await syncSeasonForGrade(childId, data.grade, today ?? formatDate(new Date()));
  } else if (data.birthYear) {
    seasonTransition = await syncSeasonForGrade(childId, null, today ?? formatDate(new Date()));
  }
```

- [ ] **Step 9: Typecheck and run the suite**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: both clean. Any caller that switched on `TransitionPlan` exhaustively will now need the two new cases; add them where the compiler points (there should be none besides `applyPlan`).

- [ ] **Step 10: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/migrations src/lib/utils/seasons.ts src/lib/utils/seasons.test.ts src/lib/services/season-sync.ts src/lib/services/crowns.ts src/lib/actions/seasons.ts src/lib/actions/children.ts
git commit -m "feat(realm): season pause/delete on grade removal, ceremony bookkeeping" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Wearable crown on the avatar

**Files:**
- Modify: `src/lib/utils/avatar-catalog.ts` (`AvatarConfig`, `DEFAULT_AVATAR`, `normalizeAvatarConfig`, `isValidAvatarConfig`)
- Test: `src/lib/utils/avatar-catalog.test.ts`
- Modify: `src/components/avatar.tsx` (`Avatar`, `AvatarFigure`; new `CrownLayer`)
- Test: `src/components/avatar-figures.test.tsx`
- Modify: `src/components/avatar-customizer.tsx`
- Test: `src/components/avatar-customizer.test.tsx`
- Modify: `src/lib/actions/avatar.ts`
- Modify: `src/app/(app)/tavern/tavern-avatar-card.tsx`, `src/app/(app)/tavern/page.tsx:206-215`, `src/app/(app)/settings/child-list.tsx:115` and `AvatarSection` (~line 886)

**Interfaces:**
- Consumes: `CROWNS`, `crownById` from `src/lib/utils/crown-catalog.ts`; `crownChoices`, `wearableCrownIds`, `SeasonWithCeremony`, `CrownChoice` from `src/lib/utils/seasons.ts`; `loadSeasons` from `src/lib/services/crowns.ts` (Task 1).
- Produces: `AvatarConfig.crown: string | null`; `AvatarCustomizer` prop `crowns?: CrownChoice[]`; `TavernAvatarCard` prop `crowns?: CrownChoice[]`; `<g data-layer="crown" data-crown="{id}">` in the rendered avatar SVGs (Task 4's sprite pipeline picks it up automatically because `spriteKey(config)` serialises the whole config).

- [ ] **Step 1: Write the failing catalog and figure tests**

Append to the `mounts` describe block's neighbour in `src/lib/utils/avatar-catalog.test.ts` (as a new describe):

```ts
describe("worn crown", () => {
  it("normalises and validates the crown field", () => {
    expect(normalizeAvatarConfig({}).crown).toBeNull();
    expect(DEFAULT_AVATAR.crown).toBeNull();
    expect(isValidAvatarConfig({ ...DEFAULT_AVATAR, crown: "crown-copper" })).toBe(true);
    expect(isValidAvatarConfig({ ...DEFAULT_AVATAR, crown: "crown-of-lies" })).toBe(false);
    expect(isValidAvatarConfig({ ...DEFAULT_AVATAR, crown: null })).toBe(true);
  });
});
```

(Make sure `normalizeAvatarConfig`, `isValidAvatarConfig`, and `DEFAULT_AVATAR` are in that file's import list.)

Append to `src/components/avatar-figures.test.tsx` (add `import { crownById } from "@/lib/utils/crown-catalog";`):

```tsx
describe("CrownLayer", () => {
  it("draws no crown by default and a tier-coloured circlet when one is worn, in both the figure and the full avatar", () => {
    const { container: bare } = render(<AvatarFigure config={DEFAULT_AVATAR} />);
    expect(bare.querySelector('[data-layer="crown"]')).toBeNull();
    const { container } = render(<AvatarFigure config={{ ...DEFAULT_AVATAR, crown: "crown-silver" }} />);
    const layer = container.querySelector('[data-layer="crown"]')!;
    expect(layer.getAttribute("data-crown")).toBe("crown-silver");
    expect(layer.querySelector("rect")!.getAttribute("fill")).toBe(crownById("crown-silver")!.color);
    const { container: full } = render(<Avatar config={{ ...DEFAULT_AVATAR, crown: "crown-copper" }} name="Lily" />);
    expect(full.querySelector('[data-layer="crown"]')!.querySelector("rect")!.getAttribute("fill")).toBe("#b87333");
  });
  it("draws nothing for a crown id the catalog does not know", () => {
    const { container } = render(<AvatarFigure config={{ ...DEFAULT_AVATAR, crown: "crown-of-lies" }} />);
    expect(container.querySelector('[data-layer="crown"]')).toBeNull();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/utils/avatar-catalog.test.ts src/components/avatar-figures.test.tsx`
Expected: FAIL (`crown` is not a field; no `[data-layer="crown"]`).

- [ ] **Step 3: Add the field to the catalog**

In `src/lib/utils/avatar-catalog.ts`:

- Add `import { CROWNS } from "./crown-catalog";` at the top.
- In `AvatarConfig`, after `mountColor: string;` add `crown: string | null; // a crown-catalog id the hero has earned, or null`.
- In `DEFAULT_AVATAR`, after `mountColor: "#8b5e3c",` add `crown: null,`.
- In `normalizeAvatarConfig`, after the `mountColor` line add `crown: (raw.crown as string) ?? null,`.
- In `isValidAvatarConfig`, after `validMountColor` add:

```ts
  const validCrown = c.crown === null || c.crown === undefined || CROWNS.some((k) => k.id === c.crown);
```

and add `validCrown &&` to the returned conjunction (next to `validMount && validMountColor &&`).

- [ ] **Step 4: Draw the crown layer**

In `src/components/avatar.tsx`:

- Add `import { crownById } from "@/lib/utils/crown-catalog";`.
- Add this module-private layer next to `AccessoryLayer`:

```tsx
/** The worn crown, above the hair, in its tier's colour. Sits on the 36×48 canvas like every other head layer. */
function CrownLayer({ crown }: { crown: string | null }) {
  if (!crown) return null;
  const tier = crownById(crown);
  if (!tier) return null;
  const color = tier.color;
  return (
    <g data-layer="crown" data-crown={tier.id}>
      <rect x="10" y="4" width="12" height="2" fill={color} />
      <rect x="10" y="6" width="12" height="1" fill={darken(color, 0.25)} />
      <rect x="10" y="2" width="2" height="2" fill={color} />
      <rect x="15" y="1" width="2" height="3" fill={color} />
      <rect x="20" y="2" width="2" height="2" fill={color} />
      <rect x="16" y="2" width="1" height="1" fill={lighten(color, 0.3)} />
    </g>
  );
}
```

- In `Avatar`, after `<AccessoryLayer accessory={c.accessory} color={c.accessoryColor} />` add `<CrownLayer crown={c.crown} />`.
- In `AvatarFigure`, after its `<AccessoryLayer … />` add `<CrownLayer crown={c.crown} />`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/lib/utils/avatar-catalog.test.ts src/components/avatar-figures.test.tsx`
Expected: PASS.

- [ ] **Step 6: Write the failing customizer test**

Append to `src/components/avatar-customizer.test.tsx`:

```tsx
describe("AvatarCustomizer crown tab", () => {
  const copper = { id: "crown-copper", label: "Copper Circlet", color: "#b87333", seasonLabel: "2024–25" };
  it("explains when no crown has been earned", () => {
    render(<AvatarCustomizer childId="c1" childName="Lily" currentConfig={DEFAULT_AVATAR} level={1} earnedBadgeIds={[]} questUnlockedItems={[]} crowns={[]} open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Crown" }));
    expect(screen.getByText("Finish a season to earn your first crown.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "None" })).not.toBeInTheDocument();
  });
  it("lists earned crowns only, with None, and selects one", () => {
    render(<AvatarCustomizer childId="c1" childName="Lily" currentConfig={DEFAULT_AVATAR} level={1} earnedBadgeIds={[]} questUnlockedItems={[]} crowns={[copper]} open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Crown" }));
    const chip = screen.getByRole("button", { name: /Copper Circlet/ });
    expect(chip.textContent).toContain("2024–25");
    expect(screen.queryByRole("button", { name: /Iron Crown/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "None" })).toBeInTheDocument();
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/components/avatar-customizer.test.tsx`
Expected: FAIL (no "Crown" tab).

- [ ] **Step 8: Add the Crown tab**

In `src/components/avatar-customizer.tsx`:

- Add `import { GameIcon } from "@/components/game-icon";` and `import type { CrownChoice } from "@/lib/utils/seasons";` (skip the first if the file already imports `GameIcon`).
- Extend `type Tab` with `| "crown"` and append `{ id: "crown", label: "Crown" }` to `TABS`.
- Add `crowns?: CrownChoice[];` to `AvatarCustomizerProps` and `crowns = [],` to the destructured props.
- Add this module-level helper (above `ItemGrid`) and make `ItemGrid` and `NullableItemGrid` use it in place of their identical inline class templates (`className={chipClass(selected === item.id, unlocked)}`; the "None" button in `NullableItemGrid` uses `chipClass(selected === null)`):

```tsx
function chipClass(selected: boolean, unlocked = true): string {
  return `rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
    selected
      ? "border-[var(--gold-border)] bg-[rgba(201,168,76,0.1)] text-[var(--gold-bright)] shadow-[0_0_8px_-2px_var(--glow-gold)]"
      : unlocked
        ? "border-border text-muted-foreground hover:bg-[rgba(201,168,76,0.06)] hover:border-[var(--gold-dim)]"
        : "border-dashed border-border text-muted-foreground/50 cursor-not-allowed"
  }`;
}
```

- After the `{tab === "mount" && (…)}` block add:

```tsx
          {tab === "crown" && (
            crowns.length === 0 ? (
              <p className="text-sm text-muted-foreground">Finish a season to earn your first crown.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => update({ crown: null })} className={chipClass(config.crown === null)} aria-pressed={config.crown === null}>
                  None
                </button>
                {crowns.map((c) => (
                  <button key={c.id} type="button" onClick={() => update({ crown: c.id })} className={chipClass(config.crown === c.id)} aria-pressed={config.crown === c.id} title={c.label}>
                    <span className="inline-flex items-center gap-1.5">
                      <span style={{ color: c.color }}><GameIcon name="crown" className="size-4" /></span>
                      {c.label}
                      <span className="text-[10px] opacity-70">{c.seasonLabel}</span>
                    </span>
                  </button>
                ))}
              </div>
            )
          )}
```

- In `randomAvatarConfig`, make sure the returned object carries `crown: null` (a random look never puts on a crown).

- [ ] **Step 9: Run the customizer tests**

Run: `npx vitest run src/components/avatar-customizer.test.tsx`
Expected: PASS.

- [ ] **Step 10: Validate the crown on save and pass crowns from the callers**

In `src/lib/actions/avatar.ts`:

- Add `import { loadSeasons } from "@/lib/services/crowns";` and `import { wearableCrownIds } from "@/lib/utils/seasons";`.
- After the `for (const item of items) { … }` unlock loop, add:

```ts
  // A crown is earned by finishing a season, never by level or badge.
  if (config.crown) {
    const wearable = wearableCrownIds(await loadSeasons(childId));
    if (!wearable.has(config.crown)) throw new Error("That crown is not yours yet.");
  }
```

In `src/app/(app)/tavern/tavern-avatar-card.tsx`: add `import type { CrownChoice } from "@/lib/utils/seasons";`, a prop `crowns?: CrownChoice[]` (default `[]`), and pass `crowns={crowns}` to `<AvatarCustomizer>`.

In `src/app/(app)/tavern/page.tsx`: add `import { crownChoices } from "@/lib/utils/seasons";` and pass `crowns={crownChoices(seasons.history)}` to `<TavernAvatarCard>`.

In `src/app/(app)/settings/child-list.tsx`: change the `Child` type's `seasons?: { open: SeasonRecord | null; history: SeasonRecord[] };` to use `SeasonWithCeremony` for both (import it from `@/lib/utils/seasons`, alongside `crownChoices`; drop the `SeasonRecord` import if nothing else uses it), and in `AvatarSection` pass `crowns={crownChoices(child.seasons?.history ?? [])}` to `<AvatarCustomizer>`.

- [ ] **Step 11: Typecheck, run the suite, commit**

Run: `npx tsc --noEmit` then `npx vitest run`
Expected: clean.

```bash
git add src/lib/utils/avatar-catalog.ts src/lib/utils/avatar-catalog.test.ts src/components/avatar.tsx src/components/avatar-figures.test.tsx src/components/avatar-customizer.tsx src/components/avatar-customizer.test.tsx src/lib/actions/avatar.ts "src/app/(app)/tavern/tavern-avatar-card.tsx" "src/app/(app)/tavern/page.tsx" "src/app/(app)/settings/child-list.tsx"
git commit -m "feat(avatar): wearable crown from completed seasons" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Ceremony script and castle banners (pure)

**Files:**
- Create: `src/lib/realm/ceremony/ceremony.ts`
- Test: `src/lib/realm/ceremony/ceremony.test.ts`
- Modify: `src/lib/realm/layout.ts`
- Test: `src/lib/realm/layout.test.ts`

**Interfaces:**
- Consumes: `stepHero`, `HERO_SPEED`, `HERO_RADIUS`, `HeroState` from `src/lib/realm/movement.ts` (`stepHero` stops within `ARRIVE_RADIUS = 0.25` of a target and slides along colliders); `VILLAGERS` from `src/lib/realm/villagers.ts`; `WorldLayout`, `Prop`, `Vec2`, `CASTLE_FOOTPRINTS` from `src/lib/realm/layout.ts`; `crownForOrdinal` from `src/lib/utils/crown-catalog.ts`; `BANNER_CAP` from `src/lib/utils/seasons.ts`.
- Produces (used by Tasks 4, 5):
  - `type CeremonyStep = "walk" | "gather" | "descend" | "hail" | "done"`
  - `type CeremonyMarks = { hero: Vec2; villagers: Record<string, Vec2> }`
  - `type CeremonyState = { step; elapsed: number; hero: Vec2; villagers: Record<string, Vec2>; crownY: number; skipped: boolean; marks: CeremonyMarks }`
  - `type CeremonyEvent = { kind: "step"; step: CeremonyStep }`
  - `GATHER_MS`, `DESCEND_MS`, `HAIL_MS`, `WALK_TIMEOUT_MS`, `CROWN_HIGH = 4`, `CROWN_LOW = 1.9`, `MARK_RADIUS = 0.3`, `VILLAGER_SPEED = 3`
  - `ceremonyMarks(layout): CeremonyMarks`, `startCeremony(layout, hero: Vec2, reducedMotion): CeremonyState`, `stepCeremony(state, dt, colliders, reducedMotion): { state: CeremonyState; entered: CeremonyStep | null }`, `skipCeremony(state): CeremonyState`, `ceremonyNotice(step, heroName, crownLabel): string | null`
  - `PropKind` gains `"banner"`; `buildWorldLayout({ …, banners?: number })` adds up to `BANNER_CAP` props `{ id: "banner-N", kind: "banner", label: "", size: BANNER_SIZE, color: crownForOrdinal(N).color, solid: false }`; `BANNER_SIZE = { w: 0.4, d: 0.4, h: 1.6 }`, `BANNER_MARGIN = 0.6`

Ruling carried from the spec: the spec names a `CEREMONY_MARKS` constant, but the hero's mark is "the castle's south face", which moves with the castle tier (a citadel is 8 deep, a campsite 2). The marks are therefore a function of the layout, `ceremonyMarks(layout)`, and are stored on the state so the frame loop never recomputes them.

- [ ] **Step 1: Write the failing ceremony tests**

Create `src/lib/realm/ceremony/ceremony.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  ceremonyMarks, startCeremony, stepCeremony, skipCeremony, ceremonyNotice,
  GATHER_MS, DESCEND_MS, HAIL_MS, WALK_TIMEOUT_MS, CROWN_HIGH, CROWN_LOW, MARK_RADIUS,
  type CeremonyState, type CeremonyStep,
} from "./ceremony";
import { buildWorldLayout, CASTLE_FOOTPRINTS, SPAWN, WORLD_SIZE, type Prop } from "../layout";
import { HERO_RADIUS } from "../movement";
import { VILLAGERS } from "../villagers";
import { BUILDINGS } from "@/lib/utils/kingdom";

const allBuilt = BUILDINGS.map((b) => ({ id: b.id, done: b.deedsToBuild, total: b.deedsToBuild, complete: true }));
const layout = buildWorldLayout({ castleType: "keep", buildings: allBuilt });
const DT = 1 / 60;

function dist(a: { x: number; z: number }, b: { x: number; z: number }) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Steps for `seconds`, collecting the steps entered along the way. */
function run(state: CeremonyState, seconds: number, colliders: Prop[] = layout.colliders, reduced = false) {
  let s = state;
  const entered: CeremonyStep[] = [];
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    const r = stepCeremony(s, DT, colliders, reduced);
    s = r.state;
    if (r.entered) entered.push(r.entered);
  }
  return { state: s, entered };
}

describe("ceremonyMarks", () => {
  it("puts the hero on the path at the castle's south face and eight villagers in a half circle behind, clear of every solid prop, for every castle tier", () => {
    for (const castleType of Object.keys(CASTLE_FOOTPRINTS)) {
      const l = buildWorldLayout({ castleType, buildings: allBuilt });
      const castle = l.props.find((p) => p.kind === "castle")!;
      const marks = ceremonyMarks(l);
      expect(marks.hero.x).toBe(0);
      expect(marks.hero.z).toBeGreaterThan(castle.position.z + castle.size.d / 2 + HERO_RADIUS);
      expect(Object.keys(marks.villagers).sort()).toEqual(VILLAGERS.map((v) => v.id).sort());
      for (const m of [marks.hero, ...Object.values(marks.villagers)]) {
        expect(Math.abs(m.x)).toBeLessThan(WORLD_SIZE / 2);
        expect(Math.abs(m.z)).toBeLessThan(WORLD_SIZE / 2);
        for (const c of l.colliders) {
          const inside = Math.abs(m.x - c.position.x) < c.size.w / 2 + HERO_RADIUS && Math.abs(m.z - c.position.z) < c.size.d / 2 + HERO_RADIUS;
          expect(inside).toBe(false);
        }
      }
      for (const v of Object.values(marks.villagers)) expect(v.z).toBeGreaterThan(marks.hero.z);
    }
  });
});

describe("startCeremony", () => {
  it("begins with a walk from where everyone stands, the crown held high", () => {
    const s = startCeremony(layout, SPAWN, false);
    expect(s.step).toBe("walk");
    expect(s.hero).toEqual(SPAWN);
    expect(s.crownY).toBe(CROWN_HIGH);
    expect(s.skipped).toBe(false);
    for (const v of layout.villagers) expect(s.villagers[v.id]).toEqual(v.position);
  });
  it("under reduced motion starts gathered at the marks with the crown already down", () => {
    const s = startCeremony(layout, SPAWN, true);
    expect(s.step).toBe("gather");
    expect(s.hero).toEqual(s.marks.hero);
    expect(s.crownY).toBe(CROWN_LOW);
    for (const v of layout.villagers) expect(s.villagers[v.id]).toEqual(s.marks.villagers[v.id]);
  });
  it("only drives villagers the layout actually has", () => {
    const empty = buildWorldLayout({ castleType: "keep", buildings: [], villagers: false });
    expect(Object.keys(startCeremony(empty, SPAWN, false).villagers)).toEqual([]);
    expect(Object.keys(startCeremony(empty, SPAWN, true).villagers)).toEqual([]);
  });
});

describe("stepCeremony", () => {
  it("walks everyone to their marks well inside the safety net, then gathers", () => {
    let s = startCeremony(layout, SPAWN, false);
    let seconds = 0;
    while (s.step === "walk" && seconds < WALK_TIMEOUT_MS / 1000) {
      s = stepCeremony(s, DT, layout.colliders, false).state;
      seconds += DT;
    }
    expect(s.step).toBe("gather");
    expect(seconds).toBeLessThan(15);
    expect(dist(s.hero, s.marks.hero)).toBeLessThanOrEqual(MARK_RADIUS);
    for (const [id, p] of Object.entries(s.villagers)) expect(dist(p, s.marks.villagers[id])).toBeLessThanOrEqual(MARK_RADIUS);
  });
  it("gathers, lowers the crown with an ease-out, hails, and finishes on the clock", () => {
    const start = startCeremony(layout, SPAWN, false);
    const gathered: CeremonyState = { ...start, step: "gather", hero: start.marks.hero, villagers: { ...start.marks.villagers } };
    const a = run(gathered, GATHER_MS / 1000 + DT);
    expect(a.entered).toEqual(["descend"]);
    const mid = run(a.state, DESCEND_MS / 2000).state;
    expect(mid.crownY).toBeLessThan(CROWN_HIGH);
    expect(mid.crownY).toBeGreaterThan(CROWN_LOW);
    expect(mid.crownY).toBeLessThan((CROWN_HIGH + CROWN_LOW) / 2); // ease-out: more than half way down at half time
    const b = run(a.state, DESCEND_MS / 1000 + DT);
    expect(b.entered).toEqual(["hail"]);
    expect(b.state.crownY).toBe(CROWN_LOW);
    const c = run(b.state, HAIL_MS / 1000 + DT);
    expect(c.entered).toEqual(["done"]);
    expect(stepCeremony(c.state, DT, layout.colliders, false)).toEqual({ state: c.state, entered: null });
  });
  it("under reduced motion goes gather → hail → done with no descend", () => {
    const s = startCeremony(layout, SPAWN, true);
    const r = run(s, (GATHER_MS + HAIL_MS) / 1000 + 2 * DT, layout.colliders, true);
    expect(r.entered).toEqual(["hail", "done"]);
  });
  it("proceeds to gather after the safety net when the hero cannot reach the mark", () => {
    const wall: Prop = { id: "wall", kind: "barrier", label: "", position: { x: 0, z: 0 }, size: { w: WORLD_SIZE, d: 1, h: 1 }, color: "#000000", solid: true };
    const r = run(startCeremony(layout, SPAWN, false), WALK_TIMEOUT_MS / 1000 + 1, [...layout.colliders, wall]);
    expect(r.entered[0]).toBe("gather");
    expect(r.state.hero.z).toBeGreaterThan(0);
  });
});

describe("skipCeremony", () => {
  it("jumps to hail with everyone at their marks and the crown down, then finishes after HAIL_MS", () => {
    const s = skipCeremony(startCeremony(layout, SPAWN, false));
    expect(s.step).toBe("hail");
    expect(s.skipped).toBe(true);
    expect(s.crownY).toBe(CROWN_LOW);
    expect(s.hero).toEqual(s.marks.hero);
    for (const v of layout.villagers) expect(s.villagers[v.id]).toEqual(s.marks.villagers[v.id]);
    expect(run(s, HAIL_MS / 1000 + DT).entered).toEqual(["done"]);
  });
  it("changes nothing once hailing or done", () => {
    const hailing = skipCeremony(startCeremony(layout, SPAWN, false));
    expect(skipCeremony(hailing)).toBe(hailing);
    const finished = run(hailing, HAIL_MS / 1000 + DT).state;
    expect(skipCeremony(finished)).toBe(finished);
  });
});

describe("ceremonyNotice", () => {
  it("speaks at the gather and the hail only", () => {
    expect(ceremonyNotice("gather", "Emma", "Copper Circlet")).toBe("The people of the Realm gather.");
    expect(ceremonyNotice("hail", "Emma", "Copper Circlet")).toBe("Hail, Emma, Copper Circlet!");
    expect(ceremonyNotice("walk", "Emma", "Copper Circlet")).toBeNull();
    expect(ceremonyNotice("descend", "Emma", "Copper Circlet")).toBeNull();
    expect(ceremonyNotice("done", "Emma", "Copper Circlet")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/realm/ceremony/ceremony.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the ceremony script**

Create `src/lib/realm/ceremony/ceremony.ts`:

```ts
import type { Prop, Vec2, WorldLayout } from "../layout";
import { HERO_SPEED, stepHero } from "../movement";
import { VILLAGERS } from "../villagers";

/**
 * The crown ceremony, as a pure script stepped by the scene's frame loop.
 * Everyone walks to marks by the castle, the people gather, the crown descends,
 * the hero is hailed, and play resumes. Nothing here touches React or three.
 */

export type CeremonyStep = "walk" | "gather" | "descend" | "hail" | "done";
export type CeremonyMarks = { hero: Vec2; villagers: Record<string, Vec2> };
export type CeremonyState = {
  step: CeremonyStep;
  elapsed: number; // ms inside the current step
  hero: Vec2;
  villagers: Record<string, Vec2>;
  crownY: number;
  skipped: boolean;
  marks: CeremonyMarks;
};
export type CeremonyEvent = { kind: "step"; step: CeremonyStep };

export const GATHER_MS = 3000;
export const DESCEND_MS = 1500;
export const HAIL_MS = 4000;
/** A hero who cannot reach the mark (blocked in) still gets their ceremony. */
export const WALK_TIMEOUT_MS = 20_000;
export const CROWN_HIGH = 4;
export const CROWN_LOW = 1.9;
export const MARK_RADIUS = 0.3;
export const VILLAGER_SPEED = 3;
/** The villagers' half circle: its radius, and how far south of the hero its centre sits. */
const GATHER_RADIUS = 3;
const GATHER_OFFSET = 2;
/** Clearance between the castle's south face and the hero (the castle collider pads by the hero's radius). */
const HERO_CLEARANCE = 1.5;

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Where everyone stands: the hero on the path at the castle's south face, the villagers in a half circle two units behind, facing the castle. */
export function ceremonyMarks(layout: WorldLayout): CeremonyMarks {
  const castle = layout.props.find((p) => p.kind === "castle");
  const cx = castle?.position.x ?? 0;
  const south = castle ? castle.position.z + castle.size.d / 2 : -13;
  const hero = { x: cx, z: south + HERO_CLEARANCE };
  const villagers: Record<string, Vec2> = {};
  VILLAGERS.forEach((v, i) => {
    // Angles from east (0) to west (π) through the south, so the ring opens toward the castle.
    const angle = (Math.PI * (i + 0.5)) / VILLAGERS.length;
    villagers[v.id] = { x: hero.x + Math.cos(angle) * GATHER_RADIUS, z: hero.z + GATHER_OFFSET + Math.sin(angle) * GATHER_RADIUS };
  });
  return { hero, villagers };
}

function marksFor(marks: CeremonyMarks, ids: string[]): Record<string, Vec2> {
  return Object.fromEntries(ids.map((id) => [id, marks.villagers[id]]));
}

export function startCeremony(layout: WorldLayout, hero: Vec2, reducedMotion: boolean): CeremonyState {
  const marks = ceremonyMarks(layout);
  const ids = layout.villagers.map((v) => v.id);
  if (reducedMotion) {
    return { step: "gather", elapsed: 0, hero: marks.hero, villagers: marksFor(marks, ids), crownY: CROWN_LOW, skipped: false, marks };
  }
  const villagers = Object.fromEntries(layout.villagers.map((v) => [v.id, v.position]));
  return { step: "walk", elapsed: 0, hero, villagers, crownY: CROWN_HIGH, skipped: false, marks };
}

/** One walker's frame toward a mark, with the hero's own axis-cancel slide along walls. */
function walk(from: Vec2, mark: Vec2, speed: number, dt: number, colliders: Prop[]): Vec2 {
  return stepHero({ position: from, facing: "n", target: mark, mounted: false }, { axis: { x: 0, z: 0 } }, dt, colliders, speed).position;
}

function enter(state: CeremonyState, step: CeremonyStep): { state: CeremonyState; entered: CeremonyStep } {
  return { state: { ...state, step, elapsed: 0 }, entered: step };
}

export function stepCeremony(state: CeremonyState, dt: number, colliders: Prop[], reducedMotion: boolean): { state: CeremonyState; entered: CeremonyStep | null } {
  if (state.step === "done") return { state, entered: null };
  const elapsed = state.elapsed + dt * 1000;
  switch (state.step) {
    case "walk": {
      const hero = walk(state.hero, state.marks.hero, HERO_SPEED, dt, colliders);
      const villagers: Record<string, Vec2> = {};
      for (const [id, p] of Object.entries(state.villagers)) villagers[id] = walk(p, state.marks.villagers[id], VILLAGER_SPEED, dt, colliders);
      const arrived = dist(hero, state.marks.hero) <= MARK_RADIUS && Object.entries(villagers).every(([id, p]) => dist(p, state.marks.villagers[id]) <= MARK_RADIUS);
      const moved = { ...state, hero, villagers, elapsed };
      if (arrived || elapsed >= WALK_TIMEOUT_MS) return enter(moved, "gather");
      return { state: moved, entered: null };
    }
    case "gather":
      if (elapsed >= GATHER_MS) return enter(state, reducedMotion ? "hail" : "descend");
      return { state: { ...state, elapsed }, entered: null };
    case "descend": {
      const k = Math.min(1, elapsed / DESCEND_MS);
      if (k >= 1) return enter({ ...state, crownY: CROWN_LOW }, "hail");
      return { state: { ...state, elapsed, crownY: CROWN_HIGH - (CROWN_HIGH - CROWN_LOW) * easeOut(k) }, entered: null };
    }
    case "hail":
      if (elapsed >= HAIL_MS) return enter(state, "done");
      return { state: { ...state, elapsed }, entered: null };
  }
}

/** Straight to the hail: everyone at their marks, the crown down. Nothing changes once hailing or done. */
export function skipCeremony(state: CeremonyState): CeremonyState {
  if (state.step === "hail" || state.step === "done") return state;
  return { ...state, step: "hail", elapsed: 0, hero: state.marks.hero, villagers: marksFor(state.marks, Object.keys(state.villagers)), crownY: CROWN_LOW, skipped: true };
}

export function ceremonyNotice(step: CeremonyStep, heroName: string, crownLabel: string): string | null {
  if (step === "gather") return "The people of the Realm gather.";
  if (step === "hail") return `Hail, ${heroName}, ${crownLabel}!`;
  return null;
}
```

- [ ] **Step 4: Run the ceremony tests**

Run: `npx vitest run src/lib/realm/ceremony/ceremony.test.ts`
Expected: PASS. If the walk test exceeds 15 s, a villager is sliding along a building; check `villagerPosition` starts outside its building's padded footprint before changing anything else (the safety-net test must still pass).

- [ ] **Step 5: Write the failing banner test**

Append to `src/lib/realm/layout.test.ts` (extend the import to include `BANNER_SIZE`, `BANNER_MARGIN`, and add `import { crownForOrdinal } from "@/lib/utils/crown-catalog";`):

```ts
describe("castle banners", () => {
  it("raises one pole per completed season in tier colours, just outside the castle, capped at eight", () => {
    const three = buildWorldLayout({ ...none, castleType: "keep", banners: 3 });
    const banners = three.props.filter((p) => p.kind === "banner");
    expect(banners.map((b) => b.color)).toEqual([crownForOrdinal(1).color, crownForOrdinal(2).color, crownForOrdinal(3).color]);
    expect(banners.map((b) => b.id)).toEqual(["banner-1", "banner-2", "banner-3"]);
    expect(banners.every((b) => !b.solid && b.label === "" && b.size.h === BANNER_SIZE.h)).toBe(true);
    const castle = three.props.find((p) => p.kind === "castle")!;
    for (const b of banners) {
      const outside = Math.max(Math.abs(b.position.x - castle.position.x) - castle.size.w / 2, Math.abs(b.position.z - castle.position.z) - castle.size.d / 2);
      expect(outside).toBeCloseTo(BANNER_MARGIN, 5);
    }
    expect(banners[0].position.x).toBeLessThan(castle.position.x); // the first pole stands on the west side
    expect(banners[0].position.z).toBeGreaterThan(castle.position.z); // toward the south-west corner
    expect(three.colliders.some((c) => c.kind === "banner")).toBe(false);
    expect(buildWorldLayout({ ...none, banners: 12 }).props.filter((p) => p.kind === "banner").length).toBe(8);
    expect(buildWorldLayout({ ...none, banners: -1 }).props.filter((p) => p.kind === "banner").length).toBe(0);
    expect(buildWorldLayout(none).props.filter((p) => p.kind === "banner").length).toBe(0);
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/lib/realm/layout.test.ts`
Expected: FAIL (`banners` unknown, no banner props).

- [ ] **Step 7: Add banners to the layout**

In `src/lib/realm/layout.ts`:

- Add imports: `import { crownForOrdinal } from "@/lib/utils/crown-catalog";` and `import { BANNER_CAP } from "@/lib/utils/seasons";`.
- Extend `PropKind` with `| "banner"`.
- Add near the other constants:

```ts
export const BANNER_SIZE = { w: 0.4, d: 0.4, h: 1.6 };
/** How far outside the castle footprint a banner pole stands. */
export const BANNER_MARGIN = 0.6;
/** Eight poles, two per side, clockwise from the south-west corner: west side, north, east, south. Factors of the half-footprint. */
const BANNER_POLES: Vec2[] = [
  { x: -1, z: 1 / 3 }, { x: -1, z: -1 / 3 },
  { x: -1 / 3, z: -1 }, { x: 1 / 3, z: -1 },
  { x: 1, z: -1 / 3 }, { x: 1, z: 1 / 3 },
  { x: 1 / 3, z: 1 }, { x: -1 / 3, z: 1 },
];
```

- Change the signature to `export function buildWorldLayout(input: { castleType: string; buildings: SiteProgress[]; villagers?: boolean; banners?: number }): WorldLayout {` and, after the path loop, add:

```ts
  // One banner per completed season, in that season's crown colour, on fixed poles around the castle.
  const banners = Math.min(BANNER_CAP, Math.max(0, Math.floor(input.banners ?? 0)));
  for (let i = 0; i < banners; i++) {
    const pole = BANNER_POLES[i];
    const halfW = castleSize.w / 2;
    const halfD = castleSize.d / 2;
    const position = {
      x: CASTLE_POSITION.x + (Math.abs(pole.x) === 1 ? pole.x * (halfW + BANNER_MARGIN) : pole.x * halfW),
      z: CASTLE_POSITION.z + (Math.abs(pole.z) === 1 ? pole.z * (halfD + BANNER_MARGIN) : pole.z * halfD),
    };
    props.push({ id: `banner-${i + 1}`, kind: "banner", label: "", position, size: BANNER_SIZE, color: crownForOrdinal(i + 1).color, solid: false });
  }
```

- [ ] **Step 8: Run the layout tests, typecheck, commit**

Run: `npx vitest run src/lib/realm/layout.test.ts src/lib/realm` then `npx tsc --noEmit`
Expected: PASS, clean. (The recess gleam spawner treats non-solid, non-foundation props as free ground; a 0.4-unit pole is too small to matter.)

```bash
git add src/lib/realm/ceremony/ceremony.ts src/lib/realm/ceremony/ceremony.test.ts src/lib/realm/layout.ts src/lib/realm/layout.test.ts
git commit -m "feat(realm): crown ceremony script and castle banners" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Scene, sprites, and HUD for the ceremony

**Files:**
- Create: `src/components/realm/ceremony-figures.tsx`
- Create: `src/components/realm/ceremony-layer.tsx`
- Modify: `src/components/realm/sprite-source.tsx`
- Modify: `src/components/realm/realm-scene.tsx`
- Modify: `src/components/realm/realm-hud.tsx`
- Test: `src/components/realm/realm-hud.test.tsx`
- Modify: `src/app/globals.css` (after line 1743, the `.realm-hud-ride` rules)

**Interfaces:**
- Consumes (Task 3): `CeremonyState`, `CeremonyStep`, `CeremonyEvent`, `startCeremony`, `stepCeremony`, `skipCeremony`, `CROWN_LOW`; `Prop.kind === "banner"`.
- Produces (used by Task 5):
  - `SpriteSource` props `crown?: { id: string; color: string } | null` and `castleBanner?: boolean`; `SpriteTextures` gains `crown: THREE.CanvasTexture | null` and `castleBanner: THREE.CanvasTexture | null`.
  - `RealmSceneProps` gains `ceremonyActive: boolean`, `ceremonySkipRef: RefObject<boolean>`, `onCeremonyEvent: (e: CeremonyEvent) => void`.
  - `RealmHud` gains optional props `crown?: { label: string; color: string } | null`, `ceremony?: { onSkip: () => void } | null`, `ceremonyError?: string`, `onCeremonyRetry?: () => void`; CSS classes `.realm-hud-crown`, `.realm-hud-skip`.

The scene cannot be unit-tested (no WebGL in jsdom); the HUD, figures, and sprite source can. Type-check the scene and keep it lint-clean.

- [ ] **Step 1: Write the failing HUD test**

Append to `src/components/realm/realm-hud.test.tsx`:

```tsx
  it("shows the worn crown and the ceremony's Skip button", () => {
    const onSkip = vi.fn();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={true} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} crown={{ label: "Copper Circlet", color: "#b87333" }} ceremony={{ onSkip }} />);
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
    const skip = screen.getByRole("button", { name: "Skip" });
    expect(skip.className).toContain("realm-hud-skip");
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
  it("offers a retry when the ceremony could not be recorded", () => {
    const onCeremonyRetry = vi.fn();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} ceremonyError="The crown could not be recorded." onCeremonyRetry={onCeremonyRetry} />);
    expect(screen.getByText(/The crown could not be recorded\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onCeremonyRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/realm/realm-hud.test.tsx`
Expected: FAIL (no crown text, no Skip).

- [ ] **Step 3: Extend the HUD**

In `src/components/realm/realm-hud.tsx`:

- Add `import { GameIcon } from "@/components/game-icon";`.
- Add to the destructured props (with defaults) and the props type:

```tsx
  crown = null,
  ceremony = null,
  ceremonyError = "",
  onCeremonyRetry = () => {},
```

```tsx
  crown?: { label: string; color: string } | null; // the hero's crown for the session, as a badge
  ceremony?: { onSkip: () => void } | null; // non-null while the ceremony plays
  ceremonyError?: string;
  onCeremonyRetry?: () => void;
```

- In the row, after the `ride` button and before the `preview` badge, add:

```tsx
        {crown && (
          <span className="realm-hud-badge realm-hud-crown" style={{ color: crown.color }}>
            <GameIcon name="crown" className="size-4" /> {crown.label}
          </span>
        )}
        {ceremony && (
          <Button size="sm" variant="outline" className="realm-hud-skip" onClick={ceremony.onSkip}>Skip</Button>
        )}
```

- After the `kingdomError` block add:

```tsx
      {ceremonyError && (
        <p className="realm-hud-error">
          {ceremonyError} <Button size="xs" variant="ghost" onClick={onCeremonyRetry}>Try again</Button>
        </p>
      )}
```

In `src/app/globals.css`, after `.realm-hud .realm-hud-ride { font-size: 0.9em; }` add:

```css
.realm-hud-skip { min-height: 44px; min-width: 44px; }
.realm-hud .realm-hud-skip { font-size: 0.9em; }
.realm-hud-crown { display: inline-flex; align-items: center; gap: 0.3rem; font-weight: 700; }
```

- [ ] **Step 4: Run the HUD tests**

Run: `npx vitest run src/components/realm/realm-hud.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the figures and the sprite textures**

Create `src/components/realm/ceremony-figures.tsx`:

```tsx
/** The ceremony crown, in its tier's colour. Rasterised once per crown id. */
export function CrownFigure({ id, color, size = 96 }: { id: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure="crown" data-figure-id={id}>
      <rect x="6" y="26" width="24" height="9" fill={color} />
      <rect x="6" y="32" width="24" height="3" fill="#000000" opacity="0.25" />
      <polygon points="6,26 10,14 14,26" fill={color} />
      <polygon points="14,26 18,9 22,26" fill={color} />
      <polygon points="22,26 26,14 30,26" fill={color} />
      <circle cx="18" cy="25" r="2.2" fill="#fff7cc" />
      <circle cx="10" cy="28" r="1.5" fill="#fff7cc" opacity="0.8" />
      <circle cx="26" cy="28" r="1.5" fill="#fff7cc" opacity="0.8" />
    </svg>
  );
}

/** A plain white pennant; the scene tints it with a season's crown colour. */
export function CastleBannerFigure({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure="castle-banner">
      <path d="M3 10 L33 20 L3 30 Z" fill="#ffffff" />
      <path d="M3 14 L24 20 L3 26 Z" fill="#e5e7eb" />
    </svg>
  );
}
```

In `src/components/realm/sprite-source.tsx`:

- Import `import { CrownFigure, CastleBannerFigure } from "@/components/realm/ceremony-figures";`.
- Add to `SpriteTextures`: `crown: THREE.CanvasTexture | null;` and `castleBanner: THREE.CanvasTexture | null;`.
- Add props `crown = null,` and `castleBanner = false,` with types:

```tsx
  /** When set, also rasterizes the ceremony crown. Must be a stable (memoised) object. */
  crown?: { id: string; color: string } | null;
  /** When true, also rasterizes the white pennant the castle banners are tinted from. */
  castleBanner?: boolean;
```

- Inside the async body, after the recess block, add:

```ts
      let crownTexture: THREE.CanvasTexture | null = null;
      if (crown) {
        const svg = root.querySelector<SVGSVGElement>(`svg[data-figure="crown"][data-figure-id="${crown.id}"]`);
        if (svg) crownTexture = await textureFor(`crown:${crown.id}`, svg);
      }
      let castleBannerTexture: THREE.CanvasTexture | null = null;
      if (castleBanner) {
        const svg = root.querySelector<SVGSVGElement>('svg[data-figure="castle-banner"]');
        if (svg) castleBannerTexture = await textureFor("castle-banner", svg);
      }
```

and include `crown: crownTexture, castleBanner: castleBannerTexture` in the `onReady({...})` object; add `crown, castleBanner` to the effect's dependency array.

- In the hidden host, after `{recess && <BannerFigure />}` add `{crown && <CrownFigure id={crown.id} color={crown.color} />}` and `{castleBanner && <CastleBannerFigure />}`.

If `src/components/realm/sprite-source.test.tsx` exists and builds a `SpriteTextures` literal or asserts the `onReady` shape, add the two new null fields there.

- [ ] **Step 6: Write the ceremony layer**

Create `src/components/realm/ceremony-layer.tsx`:

```tsx
"use client";

import "@react-three/fiber";
import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { CROWN_LOW, type CeremonyState, type CeremonyStep } from "@/lib/realm/ceremony/ceremony";
import type { HeroState } from "@/lib/realm/movement";
import type { SpriteTextures } from "./sprite-source";

const SPARKLES = 16;
const SPARKLE_MS = 700;

/**
 * The ceremony crown above the hero (hovering, descending, then worn for the
 * rest of the visit) and one burst of gold sparkles when it settles. Reads the
 * ceremony state from a ref every frame; renders nothing while no ceremony
 * has started.
 */
export function CeremonyLayer({ sim, heroRef, textures, calm, motion }: { sim: RefObject<CeremonyState | null>; heroRef: RefObject<HeroState>; textures: SpriteTextures; calm: boolean; motion: boolean }) {
  const crown = useRef<THREE.Sprite>(null);
  // Object3D, not Points: the JSX intrinsic's geometry generic does not match a plain THREE.Points ref (see spell-layer.tsx).
  const points = useRef<THREE.Object3D>(null);
  const burst = useRef<{ x: number; y: number; z: number; startedAt: number } | null>(null);
  const lastStep = useRef<CeremonyStep | null>(null);
  const buffer = useMemo(() => new Float32Array(SPARKLES * 3), []);

  useFrame((state) => {
    const s = sim.current;
    const nowMs = state.clock.elapsedTime * 1000;
    const p = heroRef.current.position;
    if (crown.current) {
      const visible = s !== null && s.step !== "walk";
      crown.current.visible = visible;
      if (visible && s) {
        const bob = motion && s.step !== "descend" ? Math.sin(state.clock.elapsedTime * 2) * 0.05 : 0;
        crown.current.position.set(p.x, s.crownY + bob, p.z);
      }
    }
    if (s && s.step !== lastStep.current) {
      // Sparkles once, as the crown settles. A skipped ceremony and reduced motion both go without.
      if (s.step === "hail" && motion && !s.skipped) burst.current = { x: p.x, y: CROWN_LOW, z: p.z, startedAt: nowMs };
      lastStep.current = s.step;
    }
    const pts = points.current as THREE.Points | null;
    const b = burst.current;
    if (!pts) return;
    if (!b) {
      pts.visible = false;
      return;
    }
    const k = (nowMs - b.startedAt) / SPARKLE_MS;
    if (k >= 1) {
      burst.current = null;
      pts.visible = false;
      return;
    }
    pts.visible = true;
    for (let i = 0; i < SPARKLES; i++) {
      const a = (i / SPARKLES) * Math.PI * 2;
      const r = 0.3 + k * 1.6;
      buffer[i * 3] = b.x + Math.cos(a) * r;
      buffer[i * 3 + 1] = b.y + Math.sin(a * 3) * 0.4 + k * 0.6;
      buffer[i * 3 + 2] = b.z + Math.sin(a) * r;
    }
    const pos = pts.geometry.getAttribute("position") as THREE.BufferAttribute;
    pos.needsUpdate = true;
    (pts.material as THREE.PointsMaterial).opacity = 1 - k;
  });

  const sparkle = calm ? "#c9b27a" : "#fde68a";
  return (
    <>
      {textures.crown && (
        <sprite ref={crown} visible={false} scale={[1.2, 1.2, 1]}>
          <spriteMaterial map={textures.crown} transparent alphaTest={0.1} />
        </sprite>
      )}
      <points ref={points} visible={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[buffer, 3]} />
        </bufferGeometry>
        <pointsMaterial color={sparkle} size={0.18} transparent sizeAttenuation depthWrite={false} />
      </points>
    </>
  );
}
```

- [ ] **Step 7: Wire the scene**

In `src/components/realm/realm-scene.tsx`:

- Imports: add `import { startCeremony, stepCeremony, skipCeremony, type CeremonyEvent, type CeremonyState } from "@/lib/realm/ceremony/ceremony";` and `import { CeremonyLayer } from "./ceremony-layer";`.
- Add to `RealmSceneProps`:

```ts
  ceremonyActive: boolean; // true while the shell wants the ceremony running; the scene starts it once
  ceremonySkipRef: RefObject<boolean>; // the shell sets it; the scene reads and clears it
  onCeremonyEvent: (e: CeremonyEvent) => void;
```

and destructure `ceremonyActive, ceremonySkipRef, onCeremonyEvent` in `World`.

- Add refs next to the others:

```ts
  const ceremonyRef = useRef<CeremonyState | null>(null);
  const villagerSprites = useRef(new Map<string, THREE.Sprite>());
```

- In `useFrame`, replace the line `if (interactive) {` and its `else if (wasInteractive.current) {` structure with a ceremony branch first:

```ts
    if (ceremonyActive && !ceremonyRef.current) {
      const started = startCeremony(layout, hero.current.position, !settings.motion);
      ceremonyRef.current = started;
      const first = started.step;
      queueMicrotask(() => onCeremonyEvent({ kind: "step", step: first }));
    }
    const ceremony = ceremonyRef.current;
    if (ceremony && ceremony.step !== "done") {
      // The ceremony drives the hero and the villagers; input, spells and recess wait.
      let s = ceremony;
      if (ceremonySkipRef.current) {
        ceremonySkipRef.current = false;
        const skipped = skipCeremony(s);
        if (skipped !== s) {
          s = skipped;
          queueMicrotask(() => onCeremonyEvent({ kind: "step", step: "hail" }));
        }
      }
      const r = stepCeremony(s, dt, layout.colliders, !settings.motion);
      ceremonyRef.current = r.state;
      const entered = r.entered;
      if (entered) queueMicrotask(() => onCeremonyEvent({ kind: "step", step: entered }));
      hero.current = { ...hero.current, position: r.state.hero, target: null, facing: "n" };
      companion.current = stepCompanion(companion.current, hero.current, dt);
      for (const [id, sprite] of villagerSprites.current) {
        const v = r.state.villagers[id];
        if (v) sprite.position.set(v.x, SPRITE_H / 2, v.z);
      }
      if (r.state.step === "done") {
        // The people return to their sites, where Talk expects them.
        for (const v of layout.villagers) villagerSprites.current.get(v.id)?.position.set(v.position.x, SPRITE_H / 2, v.position.z);
      }
    } else if (interactive) {
```

(keep the existing body of the `interactive` branch and the existing `else if (wasInteractive.current) { … }` after it unchanged).

- Give the villager sprites refs: change `<sprite key={v.id} position={…} scale={…}>` to

```tsx
          <sprite
            key={v.id}
            ref={(el) => {
              if (el) villagerSprites.current.set(v.id, el);
              else villagerSprites.current.delete(v.id);
            }}
            position={[v.position.x, SPRITE_H / 2, v.position.z]}
            scale={[SPRITE_W, SPRITE_H, 1]}
          >
```

- Exclude banners from the generic prop loop: change its filter to `layout.props.filter((prop) => prop.kind !== "villager" && prop.kind !== "banner")`, and after that loop add:

```tsx
      {layout.props.filter((prop) => prop.kind === "banner").map((prop) => (
        <group key={prop.id} position={[prop.position.x, 0, prop.position.z]}>
          <mesh position={[0, prop.size.h / 2, 0]}>
            <boxGeometry args={[0.12, prop.size.h, 0.12]} />
            <meshStandardMaterial color="#6b4226" />
          </mesh>
          {textures.castleBanner && (
            <sprite position={[0.4, prop.size.h - 0.1, 0]} scale={[0.9, 0.7, 1]}>
              <spriteMaterial map={textures.castleBanner} color={prop.color} transparent alphaTest={0.1} />
            </sprite>
          )}
        </group>
      ))}
```

- After `<RecessLayer … />` add `<CeremonyLayer sim={ceremonyRef} heroRef={hero} textures={textures} calm={settings.calmPalette} motion={settings.motion} />`.

- [ ] **Step 8: Typecheck, lint, run the realm tests**

Run: `npx tsc --noEmit` then `npx eslint src/components/realm` then `npx vitest run src/components/realm`
Expected: clean (the shell test's fake `onReady` object is untyped, so the new texture fields do not break it yet).

- [ ] **Step 9: Commit**

```bash
git add src/components/realm/ceremony-figures.tsx src/components/realm/ceremony-layer.tsx src/components/realm/sprite-source.tsx src/components/realm/realm-scene.tsx src/components/realm/realm-hud.tsx src/components/realm/realm-hud.test.tsx src/app/globals.css
git commit -m "feat(realm): ceremony layer, crown sprite, castle banners, HUD crown and Skip" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Shell wiring, bundle fields, Tavern crown card, Loot and Chronicle lines

**Files:**
- Create: `src/lib/utils/speech.ts`; Modify: `src/components/deed-player.tsx:13-21`
- Modify: `src/lib/actions/realm.ts`
- Modify: `src/components/realm/realm-shell.tsx`
- Test: `src/components/realm/realm-shell.test.tsx`
- Create: `src/components/crown-card.tsx`; Test: `src/components/crown-card.test.tsx`
- Modify: `src/app/(app)/tavern/page.tsx` (before the `{/* ═══ ROW 1 … */}` comment)
- Modify: `src/components/crowns-panel.tsx`; Test: `src/components/crowns-panel.test.tsx` (new)
- Modify: `src/app/(app)/settings/season-panel.tsx`

**Interfaces:**
- Consumes: Task 1 (`loadSeasons`, `pendingCeremony`, `bannerCount`, `seasonLabel`, `gradeName`, `SeasonWithCeremony`, actions `getSeasons`/`markCeremonySeen`), Task 3 (`CeremonyEvent`, `ceremonyNotice`), Task 4 (scene props `ceremonyActive`/`ceremonySkipRef`/`onCeremonyEvent`, HUD props, `SpriteSource` `crown`/`castleBanner`), `isChildActor` from `src/lib/auth/access.ts`, `crownById`/`CROWNS` from `src/lib/utils/crown-catalog.ts`.
- Produces: `RealmBundle.ceremony: { seasonId; crownId; ordinal; grade; seasonLabel } | null`, `RealmBundle.banners: number`, `RealmBundle.wornCrown: CrownTier | null`; `CrownCard` component; `speak(text)`/`canSpeak()` in `src/lib/utils/speech.ts`.

- [ ] **Step 1: Extract the speech helper**

Create `src/lib/utils/speech.ts`:

```ts
export function canSpeak(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && !!window.speechSynthesis;
}

/** Reads `text` aloud, replacing anything still being spoken. A no-op where speech is unavailable. */
export function speak(text: string) {
  if (!canSpeak()) return;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}
```

In `src/components/deed-player.tsx`, delete the local `canSpeak` and `speak` functions and add `import { speak } from "@/lib/utils/speech";` (keep `canSpeak` imported only if the file still uses it). Run `npx vitest run src/components/deed-player.test.tsx` — expected PASS.

- [ ] **Step 2: Extend the bundle**

In `src/lib/actions/realm.ts`:

- Imports: `import { isChildActor } from "@/lib/auth/access";`, `import { loadSeasons } from "@/lib/services/crowns";`, `import { bannerCount, pendingCeremony, seasonLabel } from "@/lib/utils/seasons";`, `import { crownById, type CrownTier } from "@/lib/utils/crown-catalog";`.
- Add to `RealmBundle`:

```ts
  /** The crown ceremony waiting for the hero; always null for a parent's preview. */
  ceremony: { seasonId: string; crownId: string; ordinal: number; grade: string; seasonLabel: string } | null;
  banners: number; // completed seasons, capped; one castle banner each
  wornCrown: CrownTier | null; // the crown on the hero's avatar, if any
```

- In `getRealmBundle`, change `await requireChildAccess(childId);` to `const access = await requireChildAccess(childId);`, add `loadSeasons(childId),` as the last member of the `Promise.all` array (destructure it as `seasons`), and before the `return` compute:

```ts
  const pending = isChildActor(access) ? pendingCeremony(seasons) : null;
  const ceremony = pending && pending.crownId
    ? { seasonId: pending.id, crownId: pending.crownId, ordinal: pending.ordinal, grade: pending.grade, seasonLabel: seasonLabel(pending.startDate) }
    : null;
  const wornCrown = avatarConfig?.crown ? crownById(avatarConfig.crown) : null;
```

and add `ceremony, banners: bannerCount(seasons), wornCrown,` to the returned object.

- [ ] **Step 3: Write the failing shell tests**

In `src/components/realm/realm-shell.test.tsx`:

- Add a mock for the seasons action next to the others:

```ts
const markCeremonySeen = vi.fn();
vi.mock("@/lib/actions/seasons", () => ({ markCeremonySeen: (...a: unknown[]) => markCeremonySeen(...a) }));
```

- In the scene mock's `<div data-testid="scene" …>` add `data-ceremony={String(props.ceremonyActive)}`.
- In the sprite-source mock's `onReady({...})` object add `crown: null, castleBanner: null`.
- Extend the `bundle` fixture with `ceremony: null, banners: 0, wornCrown: null`.
- Add a describe block:

```tsx
describe("RealmShell crown ceremony", () => {
  const ceremonyBundle = { ...bundle, ceremony: { seasonId: "s1", crownId: "crown-copper", ordinal: 1, grade: "3", seasonLabel: "2025–26" }, banners: 1 };
  const step = (s: string) => act(() => { (sceneProps.onCeremonyEvent as (e: unknown) => void)({ kind: "step", step: s }); });

  it("holds the ceremony for the hero, then records it and restores play", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markCeremonySeen.mockResolvedValue(undefined);
    render(<RealmShell bundle={ceremonyBundle} childId="c1" isChildView={true} />);
    const scene = await screen.findByTestId("scene");
    expect(scene.dataset.ceremony).toBe("true");
    expect(scene.dataset.interactive).toBe("false");
    expect(screen.getByText("12 min left · paused")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
    expect(screen.queryByText("Copper Circlet")).not.toBeInTheDocument();
    step("gather");
    expect(screen.getByText("The people of the Realm gather.")).toBeInTheDocument();
    step("hail");
    expect(screen.getByText("Hail, Lily, Copper Circlet!")).toBeInTheDocument();
    expect(screen.getByText("Season 1 complete")).toBeInTheDocument();
    step("done");
    await waitFor(() => expect(markCeremonySeen).toHaveBeenCalledWith("c1", "s1"));
    await waitFor(() => expect(screen.getByTestId("scene").dataset.interactive).toBe("true"));
    expect(screen.getByTestId("scene").dataset.ceremony).toBe("false");
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
    expect(screen.queryByText("Hail, Lily, Copper Circlet!")).not.toBeInTheDocument();
  });

  it("raises the skip flag from the Skip button and from Escape", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={ceremonyBundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const skipRef = sceneProps.ceremonySkipRef as { current: boolean };
    expect(skipRef.current).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(skipRef.current).toBe(true);
    skipRef.current = false;
    fireEvent.keyDown(window, { key: "Escape" });
    expect(skipRef.current).toBe(true);
  });

  it("restores play and offers a retry when the ceremony cannot be recorded", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markCeremonySeen.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    render(<RealmShell bundle={ceremonyBundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    step("done");
    expect(await screen.findByText(/The crown could not be recorded\./)).toBeInTheDocument();
    expect(screen.getByTestId("scene").dataset.interactive).toBe("true");
    expect(screen.queryByText("Copper Circlet")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(markCeremonySeen).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Copper Circlet")).toBeInTheDocument();
    expect(screen.queryByText(/could not be recorded/)).not.toBeInTheDocument();
  });

  it("never holds a ceremony for a parent, and shows a worn crown as a badge", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "earned" });
    render(<RealmShell bundle={{ ...ceremonyBundle, wornCrown: { ordinal: 1, id: "crown-copper", label: "Copper Circlet", description: "", icon: "crown", color: "#b87333" } }} childId="c1" isChildView={false} />);
    const scene = await screen.findByTestId("scene");
    expect(scene.dataset.ceremony).toBe("false");
    expect(scene.dataset.interactive).toBe("true");
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/components/realm/realm-shell.test.tsx`
Expected: the four new tests FAIL (no ceremony props); the existing ones still pass.

- [ ] **Step 5: Wire the shell**

In `src/components/realm/realm-shell.tsx`:

- Imports: `import { markCeremonySeen } from "@/lib/actions/seasons";`, `import { ceremonyNotice, type CeremonyEvent } from "@/lib/realm/ceremony/ceremony";`, `import { crownById, CROWNS } from "@/lib/utils/crown-catalog";`, `import { speak } from "@/lib/utils/speech";`.
- Add a constant `const CEREMONY_FAILED = "The crown could not be recorded.";`.
- In `RealmOpen`, add state and refs after `const [seed] = …`:

```ts
  // The ceremony waits for textures ("waiting"), plays ("running"), records itself ("finishing"), then is over ("done").
  const ceremonyPending = isChildView ? bundle.ceremony : null;
  const [ceremonyStage, setCeremonyStage] = useState<"waiting" | "running" | "finishing" | "done">(ceremonyPending ? "waiting" : "done");
  const [ceremonyNoticeText, setCeremonyNoticeText] = useState<string | null>(null);
  const [ceremonyError, setCeremonyError] = useState("");
  const [crown, setCrown] = useState<{ label: string; color: string } | null>(bundle.wornCrown ? { label: bundle.wornCrown.label, color: bundle.wornCrown.color } : null);
  const ceremonySkipRef = useRef(false);
  const ceremonyRunning = ceremonyStage === "running" || ceremonyStage === "finishing";
```

- Change the layout memo to pass `banners: bundle.banners` (add `bundle.banners` to its dependencies).
- Change `useRealmInput({ enabled: !panelOpen, castEnabled: isChildView && !panelOpen && !riding && selectedSpell !== null })` to `useRealmInput({ enabled: !panelOpen && !ceremonyRunning, castEnabled: isChildView && !panelOpen && !ceremonyRunning && !riding && selectedSpell !== null })`.
- Change the clock's `paused: panelOpen` to `paused: panelOpen || ceremonyRunning`.
- Replace `onReady` with:

```ts
  const onReady = useCallback((t: SpriteTextures) => {
    setTextures(t);
    setCeremonyStage((s) => (s === "waiting" ? "running" : s)); // a sprite retry after the ceremony must not replay it
  }, []);
```

- Add the crown sprite memo next to `mountTexture` (an unknown crown id borrows the copper look):

```ts
  const crownSprite = useMemo(
    () => (ceremonyPending ? { id: ceremonyPending.crownId, color: crownById(ceremonyPending.crownId)?.color ?? CROWNS[0].color } : null),
    [ceremonyPending]
  );
```

- Add the completion and event handlers after `onKingdomRetry`:

```ts
  const ceremonyCrown = useMemo(() => {
    if (!ceremonyPending) return null;
    const tier = crownById(ceremonyPending.crownId);
    return { label: tier?.label ?? "Crown", color: tier?.color ?? CROWNS[0].color };
  }, [ceremonyPending]);

  const recordCeremony = useCallback(() => {
    if (!ceremonyPending || !ceremonyCrown) return;
    setCeremonyStage("finishing");
    markCeremonySeen(childId, ceremonyPending.seasonId)
      .then(() => {
        setCrown(ceremonyCrown);
        setCeremonyError("");
      })
      .catch(() => setCeremonyError(CEREMONY_FAILED))
      .finally(() => {
        // Play resumes whether or not the record landed; the card and the next visit offer the ceremony again.
        setCeremonyStage("done");
        setCeremonyNoticeText(null);
      });
  }, [childId, ceremonyPending, ceremonyCrown]);

  const onCeremonyEvent = useCallback((e: CeremonyEvent) => {
    if (!ceremonyPending || !ceremonyCrown) return;
    const text = ceremonyNotice(e.step, bundle.heroName, ceremonyCrown.label);
    if (text) {
      setCeremonyNoticeText(text);
      if (bundle.profile.readAloud) speak(text);
    }
    if (e.step === "hail") setToast(`Season ${ceremonyPending.ordinal} complete`);
    if (e.step === "done") recordCeremony();
  }, [ceremonyPending, ceremonyCrown, bundle.heroName, bundle.profile.readAloud, recordCeremony]);

  const onSkip = useCallback(() => {
    ceremonySkipRef.current = true;
  }, []);
```

- Escape skips: add an effect after the Talk/M key effect:

```ts
  // Escape skips the ceremony; nothing else listens for it while the ceremony runs (the deed panel cannot open).
  useEffect(() => {
    if (!ceremonyRunning) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      ceremonySkipRef.current = true;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ceremonyRunning]);
```

- In the Talk/M key effect, change the guard `if (panelOpen) return;` to `if (panelOpen || ceremonyRunning) return;` and add `ceremonyRunning` to its dependencies.
- Pass to `<SpriteSource …>`: `crown={crownSprite} castleBanner={bundle.banners > 0}`.
- Pass to `<RealmScene …>`: `interactive={!panelOpen && !ceremonyRunning}`, `ceremonyActive={ceremonyStage === "running"}`, `ceremonySkipRef={ceremonySkipRef}`, `onCeremonyEvent={onCeremonyEvent}`.
- Pass to `<RealmHud …>`: `paused={panelOpen || ceremonyRunning}`, `notice={ceremonyNoticeText ?? notice}`, `crown={crown}`, `ceremony={ceremonyRunning ? { onSkip } : null}`, `ceremonyError={ceremonyError}`, `onCeremonyRetry={recordCeremony}`.
- Hide the stick and the spell bar while the ceremony runs: `{settings.showStick && !panelOpen && !ceremonyRunning && <TouchStick … />}` and `{isChildView && !panelOpen && !ceremonyRunning && pages.length > 0 && (<SpellBar … />)}`.

Note for the retry path: `recordCeremony` sets the stage to "finishing" again, which pauses play for the duration of the retry; that matches the first attempt and keeps one code path.

- [ ] **Step 6: Run the shell tests**

Run: `npx vitest run src/components/realm/realm-shell.test.tsx`
Expected: PASS. If the "restores play" test finds `interactive` still `"false"`, check that `.finally` runs before the assertion (it awaits `findByText` for the error, which is set in `.catch`, so use `waitFor` on the `interactive` attribute if needed).

- [ ] **Step 7: Write the failing CrownCard and CrownsPanel tests**

Create `src/components/crown-card.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CrownCard } from "./crown-card";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const markCeremonySeen = vi.fn();
vi.mock("@/lib/actions/seasons", () => ({ markCeremonySeen: (...a: unknown[]) => markCeremonySeen(...a) }));

const season = { id: "s1", crownId: "crown-copper", grade: "3", startDate: "2025-08-15" };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("CrownCard", () => {
  it("announces the crown to the hero with both actions", () => {
    render(<CrownCard childId="c1" childName="Emma" season={season} isChildView={true} />);
    expect(screen.getByText("A crown awaits, Emma!")).toBeInTheDocument();
    expect(screen.getByText(/2025–26 · Grade 3/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the ceremony" })).toHaveAttribute("href", "/realm");
    expect(screen.getByRole("button", { name: "Hail!" })).toBeInTheDocument();
  });
  it("gives a parent only Hail!, which records the ceremony and refreshes", async () => {
    markCeremonySeen.mockResolvedValue(undefined);
    render(<CrownCard childId="c1" childName="Emma" season={season} isChildView={false} />);
    expect(screen.queryByRole("link", { name: "See the ceremony" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hail!" }));
    await waitFor(() => expect(markCeremonySeen).toHaveBeenCalledWith("c1", "s1"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("shows the failure and keeps the card", async () => {
    markCeremonySeen.mockRejectedValue(new Error("The Realm is out of reach."));
    render(<CrownCard childId="c1" childName="Emma" season={season} isChildView={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Hail!" }));
    expect(await screen.findByText("The Realm is out of reach.")).toBeInTheDocument();
    expect(screen.getByText("A crown awaits, Emma!")).toBeInTheDocument();
  });
  it("borrows the copper look for an unknown crown id", () => {
    render(<CrownCard childId="c1" childName="Emma" season={{ ...season, crownId: "crown-mystery" }} isChildView={true} />);
    expect(screen.getByText(/· Crown$/)).toBeInTheDocument();
  });
});
```

Create `src/components/crowns-panel.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CrownsPanel } from "./crowns-panel";
import type { SeasonWithCeremony } from "@/lib/utils/seasons";

afterEach(cleanup);

const done = (id: string, ordinal: number, seen: string | null): SeasonWithCeremony => ({
  id, grade: String(ordinal), ordinal, startDate: `${2020 + ordinal}-08-15`, endDate: `${2021 + ordinal}-06-01`, crownId: ordinal === 1 ? "crown-copper" : "crown-iron",
  completedAt: `${2021 + ordinal}-06-01T00:00:00.000Z`, ceremonySeenAt: seen,
});

describe("CrownsPanel", () => {
  it("says whether each crown's ceremony has been held", () => {
    render(<CrownsPanel history={[done("s1", 1, "2022-06-02T00:00:00.000Z"), done("s2", 2, null)]} />);
    expect(screen.getByText("Ceremony held")).toBeInTheDocument();
    expect(screen.getByText("Ceremony awaits")).toBeInTheDocument();
  });
});
```

- [ ] **Step 8: Run them to verify they fail**

Run: `npx vitest run src/components/crown-card.test.tsx src/components/crowns-panel.test.tsx`
Expected: FAIL (no `crown-card` module; no ceremony line).

- [ ] **Step 9: Build the card and the panel lines**

Create `src/components/crown-card.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { markCeremonySeen } from "@/lib/actions/seasons";
import { crownById, CROWNS } from "@/lib/utils/crown-catalog";
import { gradeName, seasonLabel } from "@/lib/utils/seasons";

/**
 * A crown waiting for its ceremony. The hero can go and see it in the Realm or
 * simply hail it here; a parent can only hail it. Gone once marked.
 */
export function CrownCard({
  childId,
  childName,
  season,
  isChildView,
}: {
  childId: string;
  childName: string;
  season: { id: string; crownId: string | null; grade: string; startDate: string };
  isChildView: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const crown = season.crownId ? crownById(season.crownId) : null;
  const color = crown?.color ?? CROWNS[0].color;
  const label = crown?.label ?? "Crown";

  function hail() {
    setError("");
    startTransition(async () => {
      try {
        await markCeremonySeen(childId, season.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "The crown slipped. Try again.");
      }
    });
  }

  return (
    <GameFrame className="crown-card">
      <div className="flex flex-wrap items-center gap-4">
        <span style={{ color }}>
          <GameIcon name={crown?.icon ?? "crown"} className="size-10 drop-shadow-[0_0_6px_var(--glow-gold)]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">A crown awaits, {childName}!</p>
          <p className="text-sm text-muted-foreground">
            {seasonLabel(season.startDate)} &middot; {gradeName(season.grade)} &middot; {label}
          </p>
          {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
        </div>
        <div className="flex items-center gap-3">
          {isChildView && (
            <Link href="/realm" className="text-sm font-medium text-primary hover:underline">See the ceremony</Link>
          )}
          <Button size="sm" variant="outline" onClick={hail} disabled={pending}>Hail!</Button>
        </div>
      </div>
    </GameFrame>
  );
}
```

In `src/app/(app)/tavern/page.tsx`: add `import { CrownCard } from "@/components/crown-card";` and, immediately before the `{/* ═══ ROW 1: Assigned Quests | Character | Quest Form ═══ */}` comment, add:

```tsx
      {seasons.pending && (
        <CrownCard childId={activeChild.id} childName={activeChild.displayName} season={seasons.pending} isChildView={isChildView} />
      )}
```

In `src/components/crowns-panel.tsx`: change the import to `import { seasonLabel, gradeName, type SeasonWithCeremony } from "@/lib/utils/seasons";`, the prop to `history: SeasonWithCeremony[]`, use `gradeName(s.grade)` in place of the inline ternary, and after the grade line add:

```tsx
                <p className="text-xs text-muted-foreground">{s.ceremonySeenAt ? "Ceremony held" : "Ceremony awaits"}</p>
```

In `src/app/(app)/settings/season-panel.tsx`: delete the local `gradeName` and import it (`import { seasonLabel, gradeName, type SeasonRecord } from "@/lib/utils/seasons";`), and change the first branch of the panel body so a paused season is named:

```tsx
        {!hasGrade && open ? (
          <p className="text-muted-foreground">No grade set: the season is paused.</p>
        ) : !hasGrade ? (
          <p className="text-muted-foreground">
            Set a grade to begin the season. Each grade is one season, and finishing it earns a crown.
          </p>
        ) : open ? (
```

(the rest of the ternary chain stays as it is).

- [ ] **Step 10: Run the tests, typecheck, lint, build**

Run: `npx vitest run` then `npx tsc --noEmit` then `npm run lint` then `npm run build`
Expected: all green (the build catches any type re-export from a `"use server"` file and any three.js import outside the scene chunks).

- [ ] **Step 11: Commit**

```bash
git add src/lib/utils/speech.ts src/components/deed-player.tsx src/lib/actions/realm.ts src/components/realm/realm-shell.tsx src/components/realm/realm-shell.test.tsx src/components/crown-card.tsx src/components/crown-card.test.tsx src/components/crowns-panel.tsx src/components/crowns-panel.test.tsx "src/app/(app)/tavern/page.tsx" "src/app/(app)/settings/season-panel.tsx"
git commit -m "feat(realm): hold the crown ceremony, Tavern crown card, ceremony lines in Loot and Chronicle" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Final verification and the browser pass

**Files:** none new in the repo (scratchpad script only).

- [ ] **Step 1: Full verification**

Run: `npx tsc --noEmit`, `npx vitest run`, `npm run lint`, `npm run build`.
Expected: clean; the build's react-loadable manifest still references the WebGL chunks only from the realm route.

- [ ] **Step 2: Seed the demo hero for a ceremony**

With the dev server running (`PORT=3111 npm run dev`, `DEMO_MODE=true` in `.env.local`), against `local.db`:

1. Note the demo hero's current `child.grade` and their open `season` row (id, ordinal, start_date) for restoration.
2. Insert an `activity_log` row for `demo-child-1` dated after the open season's `start_date` (any subject and quest already in the DB; the row only needs `date > start_date`).
3. As the parent persona (cookie `demo_persona=parent`), open `/settings` and move Emma up one grade (the Chronicle's grade control). Confirm the notice "Emma finished the season and earned the Copper Circlet!" and a new open season.
4. Confirm the Tavern (parent view of Emma) shows the crown card "A crown awaits, Emma!" with only "Hail!".

- [ ] **Step 3: Watch the ceremony as the hero**

Copy `realm-recess-pass.mjs` from the scratchpad to `realm-ceremony-pass.mjs`, drop the ride section, and after the canvas appears: screenshot every two seconds for 20 s, logging the HUD notice, toast, and whether a `.realm-hud-skip` button exists. Expected sequence in the logs: "The people of the Realm gather." → "Hail, Emma, Copper Circlet!" with toast "Season 1 complete" → Skip gone, badge "Copper Circlet" in the HUD row, `12 min left` no longer "paused". Take a final screenshot showing the banner pole beside the castle and the crown sprite above the hero.

- [ ] **Step 4: Confirm the record and the regalia**

1. Reload `/realm` as the hero: no ceremony, crown badge absent (the avatar has no worn crown yet), banner still present.
2. `/tavern` as the hero: no crown card. `/loot`: the Crowns panel shows "Ceremony held".
3. Open the customizer's Crown tab: "Copper Circlet 2026–27" listed; pick it and save; the Tavern avatar shows the circlet.
4. As the parent, switch Emma to a birth year (clearing the grade): the season panel reads "No grade set: the season is paused." and the open season row survives (it has activity). Set the grade back: the plan is `relabel` or `noop`, never a new crown.

- [ ] **Step 5: Restore the demo data**

Delete the inserted `activity_log` row, delete the completed season row and reopen the original (`completed_at`, `end_date`, `crown_id`, `ceremony_seen_at` back to null; `grade` back to the original), restore `child.grade`, and reset the avatar config's `crown` to null. Stop the dev server (`fuser -k 3111/tcp`).
