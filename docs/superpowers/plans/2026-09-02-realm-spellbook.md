# Realm Spellbook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A personal spellbook for every hero: spells assembled from a fixed catalog of parts that unlock through schoolwork, named from a word bank, kept in level-based slots, with a resolved definition the 3D slices can cast.

**Architecture:** Every rule is a pure function in `src/lib/utils/` with a colocated test written first (catalog, unlocks, resolution, names, slots, subject-to-school defaults). One thin `"use server"` action file gates and persists. Subjects gain a school of magic; quest rewards reuse the existing unlock table with new categories. A new `/spellbook` page renders one client builder component.

**Tech Stack:** Next.js 16 App Router, React 19, Drizzle ORM 0.45 on libsql/Turso, Vitest 4 + Testing Library, Tailwind v4, shadcn primitives in `src/components/ui/`.

**Spec:** `docs/superpowers/specs/2026-09-02-realm-spellbook-design.md` (read it first; program context in `docs/superpowers/specs/2026-09-02-realm-program-overview.md`; slice 1 in `2026-09-02-realm-foundations-design.md`).

## Global Constraints

- Branch: `realm-foundations` in the worktree `.claude/worktrees/realm-foundations`. Never commit to `main`. Confirm `git branch --show-current` before every commit. Run git as plain single commands (no command substitution around git; the harness refuses those).
- `"use server"` files export only async functions (plus erased `type` exports, which a prior ruling allows). Types, constants, and pure helpers go in `src/lib/utils/`.
- Parent-or-hero writes: `requireChildAccess(childId, { write: true })` (a hero may edit their own spellbook, like their avatar). Parent-only writes additionally reject `isChildActor(access)`.
- IDs are `nanoid()`. Timestamps are `new Date()` into `integer(..., { mode: "timestamp" })`.
- Copy uses the app's medieval voice. Error copy verbatim from the spec: "That page of the spellbook isn't open yet.", "That part is still sealed.", "Pick a name from the word bank."
- Catalog values are exactly the spec's tables (ids, labels, adjectives, nouns, suffixes, icons, colors, particles, shapes, mana, cast ms, range, speed, status kinds and durations, unlocks). Slots: `Math.min(12, 4 + Math.floor(level / 10))`. School thresholds 5, 15, 30.
- Quest-reward categories: `spellElement`, `spellForm`, `spellModifier` in `child_avatar_unlock`.
- Vitest: `npx vitest run "<path>"` for one file (quote paths with parentheses), `npm test` for all. Tests colocated as `*.test.ts(x)`.
- After editing `src/lib/db/schema.ts`: `npm run db:generate` then `npm run db:migrate`; verify rather than trust.
- Comments explain *why* a rule exists. Commit after every task with the trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Final gate: `npm run typecheck && npm test` pass; `npm run lint` adds no new errors (one pre-existing error in `src/components/quest-template-list.tsx` is known).

## File Map

| File | Responsibility |
|---|---|
| `src/lib/db/schema.ts` (exists) | `subject.spellSchool` column; `spell` table |
| `src/lib/utils/spell-schools.ts` (+test) | `SpellSchool`, `SubjectSchool`, labels, `defaultSchoolForSubject`, `isSubjectSchool` |
| `src/lib/actions/subjects.ts` (exists) | `spellSchool` on create/update; `getSchoolCounts` |
| `src/lib/actions/children.ts` (exists) | default subjects get a school |
| `src/lib/db/backfill-spell-schools.ts` + `package.json` script | one-time school assignment for existing subjects |
| `src/lib/utils/spell-catalog.ts` (+test) | parts lists, unlock evaluation, hints, `resolveSpell`, `describeSpell` |
| `src/lib/utils/spell-names.ts` (+test) | word-bank names |
| `src/lib/utils/spell-slots.ts` (+test) | `spellSlots(level)` |
| `src/lib/utils/avatar-catalog.ts` (+new test) | spell parts in quest-reward helpers |
| `src/components/quest-template-form.tsx` (exists) | reward label copy |
| `src/lib/actions/spells.ts` | `getSpellbook`, `saveSpell`, `clearSpell` |
| `src/components/spellbook-builder.tsx` (+test) | slot list, part grids, name picker |
| `src/app/(app)/spellbook/page.tsx` | route |
| `src/components/nav-items.ts` (exists) | Spellbook nav item |
| `src/app/(app)/loot/page.tsx` (exists) | Spellbook card |
| `src/app/(app)/settings/child-list.tsx` (exists) | School of Magic select in the Subject Manager |

---

### Task 1: Schema and migration

**Files:**
- Modify: `src/lib/db/schema.ts` (the `subject` table around line 299; append the `spell` table after `realmPlayLedger`)
- Generated: `src/lib/db/migrations/0022_*.sql`

**Interfaces:**
- Produces: `schema.subject.spellSchool` (text enum `element | form | modifier | none`, NOT NULL, default `"none"`); `schema.spell` with columns `id, childId, slot, elementId, formId, modifierId, adjective, noun, createdAt, updatedAt`.

- [ ] **Step 1: Add the subject column**

Inside the `subject` table definition, after `isActive`:
```ts
    // Which school of magic this discipline feeds in the Realm's spellbook.
    // Set by name when the subject is created; a grown-up can change it, so a
    // family decides where "Latin" or "Piano" counts.
    spellSchool: text("spell_school", { enum: ["element", "form", "modifier", "none"] })
      .notNull()
      .default("none"),
```

- [ ] **Step 2: Append the spell table**

After the `realmPlayLedger` table:
```ts
// ── The Realm: spellbook ────────────────────────────────────

/**
 * One named spell in one page (slot) of a hero's spellbook. Parts are catalog
 * ids, never copied in: the catalog is the source of truth for what a part
 * does, and which parts a hero may use is decided at save time from their
 * level, badges, quest rewards, and schoolwork.
 */
export const spell = sqliteTable(
  "spell",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(), // 1-based page number
    elementId: text("element_id").notNull(),
    formId: text("form_id").notNull(),
    modifierId: text("modifier_id"), // null = no modifier
    adjective: text("adjective").notNull(), // word-bank pick
    noun: text("noun").notNull(), // word-bank pick
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("spell_child_slot_idx").on(table.childId, table.slot),
    index("spell_child_idx").on(table.childId),
  ]
);
```

- [ ] **Step 3: Generate, apply, verify**

Run: `npm run db:generate`
Expected: one new `src/lib/db/migrations/0022_<name>.sql` containing `ALTER TABLE \`subject\` ADD \`spell_school\` text DEFAULT 'none' NOT NULL;` and `CREATE TABLE \`spell\` ...` with `spell_child_slot_idx` UNIQUE.

Run: `npm run db:migrate`
Expected: applies cleanly.

Verify: `node -e "const {createClient}=require('@libsql/client');const c=createClient({url:'file:./local.db'});Promise.all([c.execute(\"select name from sqlite_master where name in ('spell','spell_child_slot_idx')\"),c.execute('select spell_school from subject limit 1')]).then(([a,b])=>console.log(a.rows,b.rows))"`
Expected: two names, and a `spell_school` value of `none`.

- [ ] **Step 4: Commit**

Run: `npm run typecheck`
```bash
git add src/lib/db
git commit -m "Add subject spell school and the spell table

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Schools of magic — defaults, subject actions, backfill

**Files:**
- Create: `src/lib/utils/spell-schools.ts`, `src/lib/utils/spell-schools.test.ts`, `src/lib/db/backfill-spell-schools.ts`
- Modify: `src/lib/actions/subjects.ts`, `src/lib/actions/children.ts` (default-subjects loop), `package.json` (scripts)

**Interfaces:**
- Produces:
  - `SpellSchool = "element" | "form" | "modifier"`, `SubjectSchool = SpellSchool | "none"`, `SUBJECT_SCHOOLS: SubjectSchool[]`, `SCHOOL_LABELS: Record<SubjectSchool, string>`, `defaultSchoolForSubject(name: string): SubjectSchool`, `isSubjectSchool(v: unknown): v is SubjectSchool`, `emptySchoolCounts(): Record<SpellSchool, number>`
  - `createSubject(childId, { name, color?, icon?, spellSchool? })`, `updateSubject(subjectId, { name?, color?, icon?, isActive?, spellSchool? })`, `getSchoolCounts(childId): Promise<Record<SpellSchool, number>>`

- [ ] **Step 1: Write the failing test**

`src/lib/utils/spell-schools.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultSchoolForSubject, isSubjectSchool, SCHOOL_LABELS, emptySchoolCounts } from "./spell-schools";

describe("defaultSchoolForSubject", () => {
  it("maps the default disciplines", () => {
    expect(defaultSchoolForSubject("Math")).toBe("form");
    expect(defaultSchoolForSubject("Reading")).toBe("element");
    expect(defaultSchoolForSubject("Science")).toBe("modifier");
    expect(defaultSchoolForSubject("History")).toBe("element");
    expect(defaultSchoolForSubject("Art")).toBe("modifier");
  });
  it("ignores case and matches whole words only", () => {
    expect(defaultSchoolForSubject("mathematics")).toBe("form");
    expect(defaultSchoolForSubject("ELA")).toBe("element");
    expect(defaultSchoolForSubject("Smarts")).toBe("none"); // "art" inside a word does not count
  });
  it("checks schools in the order element, form, modifier when a name spans two", () => {
    expect(defaultSchoolForSubject("Art History")).toBe("element");
    expect(defaultSchoolForSubject("Math Science")).toBe("form");
  });
  it("leaves unknown disciplines without a school", () => {
    expect(defaultSchoolForSubject("Piano")).toBe("none");
    expect(defaultSchoolForSubject("")).toBe("none");
  });
});

describe("isSubjectSchool", () => {
  it("accepts the four values and nothing else", () => {
    expect(isSubjectSchool("element")).toBe(true);
    expect(isSubjectSchool("none")).toBe(true);
    expect(isSubjectSchool("elements")).toBe(false);
    expect(isSubjectSchool(undefined)).toBe(false);
  });
});

describe("labels and counts", () => {
  it("has a label for every school", () => {
    expect(Object.keys(SCHOOL_LABELS).sort()).toEqual(["element", "form", "modifier", "none"]);
  });
  it("starts every school at zero", () => {
    expect(emptySchoolCounts()).toEqual({ element: 0, form: 0, modifier: 0 });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/utils/spell-schools.test.ts`
Expected: FAIL, cannot resolve `./spell-schools`.

- [ ] **Step 3: Implement the util**

`src/lib/utils/spell-schools.ts`:
```ts
/** The three schools of magic a discipline can feed. "none" means it feeds nothing. */
export type SpellSchool = "element" | "form" | "modifier";
export type SubjectSchool = SpellSchool | "none";

export const SUBJECT_SCHOOLS: SubjectSchool[] = ["element", "form", "modifier", "none"];

export const SCHOOL_LABELS: Record<SubjectSchool, string> = {
  element: "School of Elements",
  form: "School of Forms",
  modifier: "School of Modifiers",
  none: "No school",
};

// Checked in this order; the first school with a matching word wins, so
// "Art History" is an element discipline. Whole words only: "Smarts" is not art.
const SCHOOL_WORDS: [SpellSchool, string[]][] = [
  ["element", ["reading", "writing", "ela", "english", "history", "language", "spelling", "grammar", "literature"]],
  ["form", ["math", "mathematics", "arithmetic", "algebra", "geometry"]],
  ["modifier", ["science", "art", "music", "biology", "chemistry", "physics"]],
];

/** Best-guess school for a discipline name. Parents can override it later. */
export function defaultSchoolForSubject(name: string): SubjectSchool {
  const words = name.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  for (const [school, list] of SCHOOL_WORDS) {
    if (words.some((w) => list.includes(w))) return school;
  }
  return "none";
}

export function isSubjectSchool(v: unknown): v is SubjectSchool {
  return typeof v === "string" && (SUBJECT_SCHOOLS as string[]).includes(v);
}

export function emptySchoolCounts(): Record<SpellSchool, number> {
  return { element: 0, form: 0, modifier: 0 };
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/utils/spell-schools.test.ts`
Expected: all pass.

- [ ] **Step 5: Subject actions**

In `src/lib/actions/subjects.ts` add imports:
```ts
import { sql } from "drizzle-orm";
import {
  defaultSchoolForSubject,
  emptySchoolCounts,
  isSubjectSchool,
  type SpellSchool,
  type SubjectSchool,
} from "@/lib/utils/spell-schools";
```
(merge `sql` into the existing `drizzle-orm` import line).

`createSubject`: add `spellSchool?: SubjectSchool;` to the `data` type; in the insert add
```ts
    spellSchool: data.spellSchool && isSubjectSchool(data.spellSchool) ? data.spellSchool : defaultSchoolForSubject(name),
```

`updateSubject`: add `spellSchool?: SubjectSchool;` to the `data` type and, after the `isActive` line:
```ts
  if (data.spellSchool !== undefined) {
    if (!isSubjectSchool(data.spellSchool)) throw new Error("Choose a school of magic from the list.");
    updates.spellSchool = data.spellSchool;
  }
```

Append:
```ts
/**
 * All-time activity counts per school of magic. What a hero has logged in
 * their element, form, and modifier disciplines is what unlocks spell parts.
 * A hero may read their own.
 */
export async function getSchoolCounts(childId: string): Promise<Record<SpellSchool, number>> {
  await requireChildAccess(childId);
  const rows = await db
    .select({ school: schema.subject.spellSchool, count: sql<number>`count(*)` })
    .from(schema.activityLog)
    .innerJoin(schema.subject, eq(schema.activityLog.subjectId, schema.subject.id))
    .where(eq(schema.activityLog.childId, childId))
    .groupBy(schema.subject.spellSchool);
  const counts = emptySchoolCounts();
  for (const row of rows) {
    if (row.school !== "none") counts[row.school] = Number(row.count);
  }
  return counts;
}
```

- [ ] **Step 6: Default subjects get a school**

In `src/lib/actions/children.ts` add `import { defaultSchoolForSubject } from "@/lib/utils/spell-schools";` and in the `createChild` default-subjects insert add the line `spellSchool: defaultSchoolForSubject(s.name),` next to `isRequired: s.isRequired,`.

- [ ] **Step 7: Backfill script**

`src/lib/db/backfill-spell-schools.ts`:
```ts
/**
 * Gives existing disciplines a school of magic by name. Subjects created
 * before the spellbook existed carry the column default ("none"); this sets
 * the same default-by-name rule new subjects get, and never touches a subject
 * that already has a school, so a grown-up's choice survives a re-run.
 *
 * Idempotent. Run with:
 *   npx tsx --env-file=.env.prod src/lib/db/backfill-spell-schools.ts
 * Add --dry-run to print the changes without writing them.
 */
import { eq } from "drizzle-orm";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import { defaultSchoolForSubject } from "../utils/spell-schools";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client, { schema });
const dryRun = process.argv.includes("--dry-run");

async function main() {
  const subjects = await db
    .select({ id: schema.subject.id, name: schema.subject.name, spellSchool: schema.subject.spellSchool })
    .from(schema.subject);
  let changed = 0;
  for (const s of subjects) {
    if (s.spellSchool !== "none") continue;
    const school = defaultSchoolForSubject(s.name);
    if (school === "none") continue;
    changed += 1;
    console.log(`${dryRun ? "[dry-run] " : ""}${s.name} → ${school}`);
    if (!dryRun) {
      await db.update(schema.subject).set({ spellSchool: school }).where(eq(schema.subject.id, s.id));
    }
  }
  console.log(`${changed} subject(s) ${dryRun ? "would be" : ""} assigned a school.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```
`package.json` scripts: add `"db:backfill-spell-schools": "npx tsx src/lib/db/backfill-spell-schools.ts"` after `db:backfill-streaks`.

Run: `npm run db:backfill-spell-schools -- --dry-run` against the worktree's `local.db`
Expected: the demo heroes' Math/Reading/Science/History/Art subjects listed with their schools. Then run it for real once and re-run dry-run to confirm zero changes.

- [ ] **Step 8: Verify and commit**

Run: `npm run typecheck && npm test`
```bash
git add src/lib/utils/spell-schools.ts src/lib/utils/spell-schools.test.ts src/lib/actions/subjects.ts src/lib/actions/children.ts src/lib/db/backfill-spell-schools.ts package.json
git commit -m "Give disciplines a school of magic and count activity per school

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Spell catalog, unlock rules, resolution

**Files:**
- Create: `src/lib/utils/spell-catalog.ts`, `src/lib/utils/spell-catalog.test.ts`

**Interfaces:**
- Consumes: `SpellSchool` from Task 2.
- Produces (all exported from `spell-catalog.ts`):
  - types `SpellUnlock`, `StatusKind`, `SpellStatus`, `SpellElement`, `SpellForm`, `SpellModifier`, `SpellShape`, `SpellPartCategory = "spellElement" | "spellForm" | "spellModifier"`, `SpellParts = { elementId: string; formId: string; modifierId: string | null }`, `SpellDefinition`, `SpellUnlockContext`
  - `SPELL_ELEMENTS`, `SPELL_FORMS`, `SPELL_MODIFIERS`, `SPELL_CATEGORY: Record<SpellSchool, SpellPartCategory>`, `SPELL_PART_COUNT` (24)
  - `findElement(id)`, `findForm(id)`, `findModifier(id)` → part or null
  - `isSpellPartUnlocked(unlock, ctx)`, `unlockedPartIds(ctx): Set<string>`, `spellUnlockHint(unlock, ctx, subjectNamesBySchool): string | null`
  - `resolveSpell(parts): SpellDefinition | null`, `describeSpell(parts): string`

- [ ] **Step 1: Write the failing test**

`src/lib/utils/spell-catalog.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  SPELL_ELEMENTS,
  SPELL_FORMS,
  SPELL_MODIFIERS,
  SPELL_PART_COUNT,
  isSpellPartUnlocked,
  unlockedPartIds,
  spellUnlockHint,
  resolveSpell,
  describeSpell,
  type SpellUnlockContext,
} from "./spell-catalog";

const fresh: SpellUnlockContext = {
  level: 1,
  earnedBadgeIds: [],
  questUnlockedIds: new Set(),
  schoolCounts: { element: 0, form: 0, modifier: 0 },
};
const subjects = { element: ["Reading", "History"], form: ["Math"], modifier: [] as string[] };

describe("catalog shape", () => {
  it("has unique ids across all parts and the documented count", () => {
    const ids = [...SPELL_ELEMENTS, ...SPELL_FORMS, ...SPELL_MODIFIERS].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(SPELL_PART_COUNT);
    expect(SPELL_PART_COUNT).toBe(24);
  });
  it("only references seeded badge ids", () => {
    const seeded = ["badge-streak-7", "badge-volume-25", "badge-streak-30"];
    for (const p of [...SPELL_ELEMENTS, ...SPELL_FORMS, ...SPELL_MODIFIERS]) {
      if (p.unlock.type === "badge") expect(seeded).toContain(p.unlock.badgeId);
    }
  });
});

describe("isSpellPartUnlocked", () => {
  it("free is always open", () => {
    expect(isSpellPartUnlocked({ type: "free" }, fresh)).toBe(true);
  });
  it("level compares against the hero's level", () => {
    expect(isSpellPartUnlocked({ type: "level", level: 10 }, fresh)).toBe(false);
    expect(isSpellPartUnlocked({ type: "level", level: 10 }, { ...fresh, level: 10 })).toBe(true);
  });
  it("badge needs the badge", () => {
    const u = { type: "badge" as const, badgeId: "badge-streak-7", badgeName: "Week Warrior" };
    expect(isSpellPartUnlocked(u, fresh)).toBe(false);
    expect(isSpellPartUnlocked(u, { ...fresh, earnedBadgeIds: ["badge-streak-7"] })).toBe(true);
  });
  it("quest needs the id in the quest unlocks, checked by the caller per part", () => {
    expect(isSpellPartUnlocked({ type: "quest" }, fresh, "storm")).toBe(false);
    expect(isSpellPartUnlocked({ type: "quest" }, { ...fresh, questUnlockedIds: new Set(["storm"]) }, "storm")).toBe(true);
  });
  it("school compares the school's count", () => {
    const u = { type: "school" as const, school: "form" as const, count: 15 };
    expect(isSpellPartUnlocked(u, { ...fresh, schoolCounts: { element: 99, form: 14, modifier: 0 } })).toBe(false);
    expect(isSpellPartUnlocked(u, { ...fresh, schoolCounts: { element: 0, form: 15, modifier: 0 } })).toBe(true);
  });
});

describe("unlockedPartIds", () => {
  it("gives a fresh hero exactly the free parts", () => {
    expect([...unlockedPartIds(fresh)].sort()).toEqual(["bolt", "ember", "orb", "slow", "tide"]);
  });
  it("adds quest-rewarded parts by id", () => {
    expect(unlockedPartIds({ ...fresh, questUnlockedIds: new Set(["bloom", "quicken"]) })).toContain("bloom");
    expect(unlockedPartIds({ ...fresh, questUnlockedIds: new Set(["bloom"]) })).not.toContain("quicken");
  });
});

describe("spellUnlockHint", () => {
  it("is null when unlocked", () => {
    expect(spellUnlockHint({ type: "free" }, fresh, subjects)).toBeNull();
  });
  it("names the level, badge, and quest routes", () => {
    expect(spellUnlockHint({ type: "level", level: 10 }, fresh, subjects)).toBe("Reach level 10.");
    expect(spellUnlockHint({ type: "badge", badgeId: "x", badgeName: "Week Warrior" }, fresh, subjects)).toBe("Earn the Week Warrior badge.");
    expect(spellUnlockHint({ type: "quest" }, fresh, subjects)).toBe("A grown-up can award this as a quest reward.");
  });
  it("counts remaining quests in the hero's own disciplines", () => {
    const ctx = { ...fresh, schoolCounts: { element: 3, form: 0, modifier: 0 } };
    expect(spellUnlockHint({ type: "school", school: "element", count: 15 }, ctx, subjects)).toBe("Log 12 more Reading or History quests.");
    expect(spellUnlockHint({ type: "school", school: "form", count: 5 }, ctx, subjects)).toBe("Log 5 more Math quests.");
  });
  it("asks for a discipline when none feeds the school", () => {
    expect(spellUnlockHint({ type: "school", school: "modifier", count: 5 }, fresh, subjects)).toBe(
      "Ask a grown-up to point a discipline at the School of Modifiers."
    );
  });
});

describe("resolveSpell", () => {
  it("merges the parts into one definition", () => {
    const def = resolveSpell({ elementId: "ember", formId: "bolt", modifierId: "slow" });
    expect(def).toEqual({
      parts: { elementId: "ember", formId: "bolt", modifierId: "slow" },
      color: "#f97316",
      particle: "sparks",
      shape: "projectile",
      manaCost: 15,
      castMs: 300,
      range: 12,
      speed: 14,
      statuses: [{ kind: "slowed", durationMs: 2000 }],
    });
  });
  it("works without a modifier", () => {
    const def = resolveSpell({ elementId: "tide", formId: "orb", modifierId: null });
    expect(def?.manaCost).toBe(15);
    expect(def?.statuses).toEqual([]);
  });
  it("halves cast time for quicken and puts the element's chill first", () => {
    const def = resolveSpell({ elementId: "frost", formId: "beam", modifierId: "quicken" });
    expect(def?.castMs).toBe(200);
    expect(def?.manaCost).toBe(25);
    expect(def?.statuses).toEqual([
      { kind: "chilled", durationMs: 800 },
      { kind: "quickened", durationMs: 0 },
    ]);
  });
  it("returns null for any unknown id", () => {
    expect(resolveSpell({ elementId: "lava", formId: "bolt", modifierId: null })).toBeNull();
    expect(resolveSpell({ elementId: "ember", formId: "bolt", modifierId: "nope" })).toBeNull();
  });
});

describe("describeSpell", () => {
  it("reads as a sentence", () => {
    expect(describeSpell({ elementId: "ember", formId: "bolt", modifierId: null })).toBe("A bolt of ember.");
    expect(describeSpell({ elementId: "ember", formId: "bolt", modifierId: "slow" })).toBe("A bolt of ember that slows what it touches.");
    expect(describeSpell({ elementId: "frost", formId: "wall", modifierId: "bind" })).toBe("A wall of frost that holds its target still. It chills.");
  });
  it("is empty for unknown ids", () => {
    expect(describeSpell({ elementId: "lava", formId: "bolt", modifierId: null })).toBe("");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/utils/spell-catalog.test.ts`
Expected: FAIL, cannot resolve `./spell-catalog`.

- [ ] **Step 3: Implement**

`src/lib/utils/spell-catalog.ts`:
```ts
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
  adjectives: [string, string, string];
  color: string;
  particle: string;
  unlock: SpellUnlock;
  onHit?: SpellStatus;
};

export type SpellForm = {
  id: string;
  label: string;
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
  { id: "ember", label: "Ember", adjectives: ["Ember", "Cinder", "Blaze"], color: "#f97316", particle: "sparks", unlock: { type: "free" } },
  { id: "tide", label: "Tide", adjectives: ["Tide", "Ripple", "Wave"], color: "#3b82f6", particle: "droplets", unlock: { type: "free" } },
  { id: "stone", label: "Stone", adjectives: ["Stone", "Pebble", "Boulder"], color: "#a16207", particle: "pebbles", unlock: { type: "school", school: "element", count: 5 } },
  { id: "gale", label: "Gale", adjectives: ["Gale", "Breeze", "Zephyr"], color: "#22d3ee", particle: "wisps", unlock: { type: "school", school: "element", count: 15 } },
  { id: "light", label: "Light", adjectives: ["Radiant", "Sunlit", "Gleaming"], color: "#fde68a", particle: "motes", unlock: { type: "level", level: 10 } },
  { id: "shadow", label: "Shadow", adjectives: ["Umbral", "Dusk", "Shade"], color: "#6d28d9", particle: "smoke", unlock: { type: "school", school: "element", count: 30 } },
  { id: "frost", label: "Frost", adjectives: ["Frost", "Rime", "Glacial"], color: "#bae6fd", particle: "crystals", unlock: { type: "badge", badgeId: "badge-streak-7", badgeName: "Week Warrior" }, onHit: { kind: "chilled", durationMs: 800 } },
  { id: "storm", label: "Storm", adjectives: ["Storm", "Thunder", "Tempest"], color: "#818cf8", particle: "bolts", unlock: { type: "quest" } },
  { id: "bloom", label: "Bloom", adjectives: ["Bloom", "Petal", "Verdant"], color: "#4ade80", particle: "petals", unlock: { type: "quest" } },
];

export const SPELL_FORMS: SpellForm[] = [
  { id: "bolt", label: "Bolt", nouns: ["Bolt", "Dart", "Lance"], icon: "lightning", shape: "projectile", manaCost: 10, castMs: 300, range: 12, speed: 14, unlock: { type: "free" } },
  { id: "orb", label: "Orb", nouns: ["Orb", "Sphere", "Globe"], icon: "gem", shape: "projectile", manaCost: 15, castMs: 500, range: 10, speed: 8, unlock: { type: "free" } },
  { id: "burst", label: "Burst", nouns: ["Burst", "Nova", "Flare"], icon: "sparkles", shape: "area", manaCost: 20, castMs: 600, range: 4, speed: 0, unlock: { type: "school", school: "form", count: 5 } },
  { id: "wall", label: "Wall", nouns: ["Wall", "Rampart", "Bulwark"], icon: "stoneTower", shape: "barrier", manaCost: 25, castMs: 800, range: 6, speed: 0, unlock: { type: "school", school: "form", count: 15 } },
  { id: "beam", label: "Beam", nouns: ["Beam", "Ray", "Shaft"], icon: "sun", shape: "beam", manaCost: 20, castMs: 400, range: 14, speed: 0, unlock: { type: "level", level: 10 } },
  { id: "shield", label: "Shield", nouns: ["Shield", "Ward", "Aegis"], icon: "shield", shape: "self", manaCost: 15, castMs: 300, range: 0, speed: 0, unlock: { type: "school", school: "form", count: 30 } },
  { id: "sprite", label: "Sprite", nouns: ["Sprite", "Wisp", "Familiar"], icon: "bee", shape: "summon", manaCost: 30, castMs: 900, range: 8, speed: 6, unlock: { type: "badge", badgeId: "badge-volume-25", badgeName: "Dedicated Scholar" } },
  { id: "aura", label: "Aura", nouns: ["Aura", "Halo", "Mantle"], icon: "fireRing", shape: "self", manaCost: 25, castMs: 700, range: 5, speed: 0, unlock: { type: "quest" } },
];

export const SPELL_MODIFIERS: SpellModifier[] = [
  { id: "slow", label: "Slow", suffix: "of Slowing", icon: "hourglass", status: { kind: "slowed", durationMs: 2000 }, manaCostDelta: 5, unlock: { type: "free" } },
  { id: "bounce", label: "Bounce", suffix: "of Bouncing", icon: "compass", status: { kind: "bounce", durationMs: 0 }, manaCostDelta: 5, unlock: { type: "school", school: "modifier", count: 5 } },
  { id: "seek", label: "Seek", suffix: "of Seeking", icon: "telescope", status: { kind: "seeking", durationMs: 0 }, manaCostDelta: 10, unlock: { type: "school", school: "modifier", count: 15 } },
  { id: "grow", label: "Grow", suffix: "of Growing", icon: "upgrade", status: { kind: "grown", durationMs: 0 }, manaCostDelta: 10, unlock: { type: "level", level: 10 } },
  { id: "mend", label: "Mend", suffix: "of Mending", icon: "flower", status: { kind: "mended", durationMs: 0 }, manaCostDelta: 10, unlock: { type: "school", school: "modifier", count: 30 } },
  { id: "bind", label: "Bind", suffix: "of Binding", icon: "link", status: { kind: "bound", durationMs: 1500 }, manaCostDelta: 15, unlock: { type: "badge", badgeId: "badge-streak-30", badgeName: "Monthly Master" } },
  { id: "quicken", label: "Quicken", suffix: "of Quickening", icon: "timer", status: { kind: "quickened", durationMs: 0 }, manaCostDelta: 5, unlock: { type: "quest" } },
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
      return `Log ${remaining} more ${joinNames(names)} quests.`;
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

export function describeSpell(parts: SpellParts): string {
  const found = lookup(parts);
  if (!found) return "";
  const { element, form, modifier } = found;
  let sentence = `A ${form.label.toLowerCase()} of ${element.label.toLowerCase()}`;
  if (modifier) sentence += ` that ${MODIFIER_PHRASES[modifier.id]}`;
  sentence += ".";
  if (element.onHit?.kind === "chilled") sentence += " It chills.";
  return sentence;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/lib/utils/spell-catalog.test.ts`
Expected: all pass.

- [ ] **Step 5: Commit**

Run: `npm run typecheck`
```bash
git add src/lib/utils/spell-catalog.ts src/lib/utils/spell-catalog.test.ts
git commit -m "Add the spell parts catalog with unlock rules and resolution

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Spell names and slots

**Files:**
- Create: `src/lib/utils/spell-names.ts`, `src/lib/utils/spell-names.test.ts`, `src/lib/utils/spell-slots.ts`, `src/lib/utils/spell-slots.test.ts`

**Interfaces:**
- Consumes: `SpellParts`, `findElement`, `findForm`, `findModifier` from Task 3.
- Produces: `spellNameOptions(parts): { adjectives: string[]; nouns: string[]; suffix: string | null } | null`, `defaultSpellName(parts): { adjective: string; noun: string } | null`, `isValidSpellName(parts, adjective, noun): boolean`, `displaySpellName(parts, adjective, noun): string`; `MAX_SPELL_SLOTS = 12`, `spellSlots(level: number): number`.

- [ ] **Step 1: Write the failing tests**

`src/lib/utils/spell-names.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { spellNameOptions, defaultSpellName, isValidSpellName, displaySpellName } from "./spell-names";

const plain = { elementId: "ember", formId: "bolt", modifierId: null };
const modified = { elementId: "tide", formId: "wall", modifierId: "slow" };

describe("spellNameOptions", () => {
  it("offers the element's adjectives and the form's nouns", () => {
    expect(spellNameOptions(plain)).toEqual({ adjectives: ["Ember", "Cinder", "Blaze"], nouns: ["Bolt", "Dart", "Lance"], suffix: null });
  });
  it("carries the modifier's suffix", () => {
    expect(spellNameOptions(modified)?.suffix).toBe("of Slowing");
  });
  it("is null for unknown parts", () => {
    expect(spellNameOptions({ ...plain, elementId: "lava" })).toBeNull();
  });
});

describe("defaultSpellName", () => {
  it("is the first adjective and first noun", () => {
    expect(defaultSpellName(plain)).toEqual({ adjective: "Ember", noun: "Bolt" });
  });
});

describe("isValidSpellName", () => {
  it("accepts a pick from the bank and rejects a foreign word", () => {
    expect(isValidSpellName(plain, "Cinder", "Lance")).toBe(true);
    expect(isValidSpellName(plain, "Frost", "Bolt")).toBe(false);
    expect(isValidSpellName(plain, "Ember", "Orb")).toBe(false);
  });
});

describe("displaySpellName", () => {
  it("joins adjective, noun, and suffix", () => {
    expect(displaySpellName(plain, "Ember", "Bolt")).toBe("Ember Bolt");
    expect(displaySpellName(modified, "Wave", "Rampart")).toBe("Wave Rampart of Slowing");
  });
});
```

`src/lib/utils/spell-slots.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { spellSlots, MAX_SPELL_SLOTS } from "./spell-slots";

describe("spellSlots", () => {
  it("opens four pages for a new hero", () => {
    expect(spellSlots(1)).toBe(4);
    expect(spellSlots(9)).toBe(4);
  });
  it("adds a page every ten levels", () => {
    expect(spellSlots(10)).toBe(5);
    expect(spellSlots(50)).toBe(9);
  });
  it("never passes the cap", () => {
    expect(spellSlots(100)).toBe(MAX_SPELL_SLOTS);
    expect(spellSlots(500)).toBe(12);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/utils/spell-names.test.ts src/lib/utils/spell-slots.test.ts`
Expected: FAIL, cannot resolve.

- [ ] **Step 3: Implement**

`src/lib/utils/spell-names.ts`:
```ts
import { findElement, findForm, findModifier, type SpellParts } from "./spell-catalog";

/**
 * Spell names come from a word bank tied to the parts, never free text: a
 * hero's spellbook needs no moderation and every name reads in the Realm's
 * voice. Null means the parts are not a real spell.
 */
export function spellNameOptions(parts: SpellParts) {
  const element = findElement(parts.elementId);
  const form = findForm(parts.formId);
  const modifier = parts.modifierId === null ? null : findModifier(parts.modifierId);
  if (!element || !form || (parts.modifierId !== null && !modifier)) return null;
  return { adjectives: [...element.adjectives], nouns: [...form.nouns], suffix: modifier?.suffix ?? null };
}

export function defaultSpellName(parts: SpellParts): { adjective: string; noun: string } | null {
  const options = spellNameOptions(parts);
  if (!options) return null;
  return { adjective: options.adjectives[0], noun: options.nouns[0] };
}

export function isValidSpellName(parts: SpellParts, adjective: string, noun: string): boolean {
  const options = spellNameOptions(parts);
  return !!options && options.adjectives.includes(adjective) && options.nouns.includes(noun);
}

export function displaySpellName(parts: SpellParts, adjective: string, noun: string): string {
  const suffix = spellNameOptions(parts)?.suffix;
  return suffix ? `${adjective} ${noun} ${suffix}` : `${adjective} ${noun}`;
}
```

`src/lib/utils/spell-slots.ts`:
```ts
export const MAX_SPELL_SLOTS = 12;

/** Pages in a hero's spellbook: four to start, one more every ten levels, twelve at most. */
export function spellSlots(level: number): number {
  const safe = Number.isFinite(level) && level > 0 ? Math.floor(level) : 1;
  return Math.min(MAX_SPELL_SLOTS, 4 + Math.floor(safe / 10));
}
```

- [ ] **Step 4: Run the tests and commit**

Run: `npx vitest run src/lib/utils/spell-names.test.ts src/lib/utils/spell-slots.test.ts && npm run typecheck`
```bash
git add src/lib/utils/spell-names.ts src/lib/utils/spell-names.test.ts src/lib/utils/spell-slots.ts src/lib/utils/spell-slots.test.ts
git commit -m "Add spell word-bank names and spellbook slot rule

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Spell parts as quest rewards

**Files:**
- Modify: `src/lib/utils/avatar-catalog.ts` (`getQuestUnlockableItems`, `CATEGORY_LABELS`, `CATEGORY_ITEMS`, around lines 542–606), `src/components/quest-template-form.tsx` (reward field copy, around lines 601–636)
- Create: `src/lib/utils/avatar-catalog.test.ts`

**Interfaces:**
- Consumes: `SPELL_ELEMENTS`, `SPELL_FORMS`, `SPELL_MODIFIERS`, `SPELL_CATEGORY` from Task 3.
- Produces: `getQuestUnlockableItems()` also returns quest-unlockable spell parts with categories `spellElement | spellForm | spellModifier`; `getRewardItemLabel('{"category":"spellElement","itemId":"storm"}') === "Spell Element: Storm"`; `getCategoryLabel("spellForm") === "Spell Form"`.

- [ ] **Step 1: Write the failing test**

`src/lib/utils/avatar-catalog.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getQuestUnlockableItems, getRewardItemLabel, getCategoryLabel } from "./avatar-catalog";

describe("quest-unlockable items", () => {
  it("still lists avatar items", () => {
    expect(getQuestUnlockableItems().some((e) => e.category === "companion" && e.item.id === "pegasus")).toBe(true);
  });
  it("lists every quest-unlockable spell part under its spell category", () => {
    const entries = getQuestUnlockableItems();
    const spellEntries = entries.filter((e) => e.category.startsWith("spell")).map((e) => `${e.category}:${e.item.id}`).sort();
    expect(spellEntries).toEqual(["spellElement:bloom", "spellElement:storm", "spellForm:aura", "spellModifier:quicken"]);
  });
  it("marks spell parts as quest unlocks", () => {
    const storm = getQuestUnlockableItems().find((e) => e.item.id === "storm");
    expect(storm?.item.unlock).toEqual({ type: "quest" });
  });
});

describe("reward labels", () => {
  it("labels spell parts by school", () => {
    expect(getRewardItemLabel(JSON.stringify({ category: "spellElement", itemId: "storm" }))).toBe("Spell Element: Storm");
    expect(getRewardItemLabel(JSON.stringify({ category: "spellModifier", itemId: "quicken" }))).toBe("Spell Modifier: Quicken");
    expect(getCategoryLabel("spellForm")).toBe("Spell Form");
  });
  it("still labels avatar items", () => {
    expect(getRewardItemLabel(JSON.stringify({ category: "accessory", itemId: "wings" }))).toMatch(/^Flair: /);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/utils/avatar-catalog.test.ts`
Expected: FAIL on the spell cases (`spellEntries` empty; label "spellElement: storm").

- [ ] **Step 3: Extend the helpers**

In `src/lib/utils/avatar-catalog.ts` add:
```ts
import { SPELL_ELEMENTS, SPELL_FORMS, SPELL_MODIFIERS, SPELL_CATEGORY } from "./spell-catalog";
```
At the end of `getQuestUnlockableItems`, before `return items;`:
```ts
  // Spell parts a grown-up may award. Stored in the same unlock table as
  // avatar items, under their own categories, so the reward flow is shared.
  for (const part of SPELL_ELEMENTS) {
    if (part.unlock.type === "quest") items.push({ category: SPELL_CATEGORY.element, item: { id: part.id, label: part.label, unlock: { type: "quest" } } });
  }
  for (const part of SPELL_FORMS) {
    if (part.unlock.type === "quest") items.push({ category: SPELL_CATEGORY.form, item: { id: part.id, label: part.label, unlock: { type: "quest" } } });
  }
  for (const part of SPELL_MODIFIERS) {
    if (part.unlock.type === "quest") items.push({ category: SPELL_CATEGORY.modifier, item: { id: part.id, label: part.label, unlock: { type: "quest" } } });
  }
```
Add to `CATEGORY_LABELS`:
```ts
  spellElement: "Spell Element",
  spellForm: "Spell Form",
  spellModifier: "Spell Modifier",
```
Change `CATEGORY_ITEMS` to be label-only and include the spell lists (only `id` and `label` are read from it):
```ts
const CATEGORY_ITEMS: Record<string, { id: string; label: string }[]> = {
  outfit: OUTFITS,
  legwear: LEGWEAR,
  boots: BOOTS,
  accessory: ACCESSORIES,
  companion: COMPANIONS,
  background: BACKGROUNDS,
  hairStyle: HAIR_STYLES,
  spellElement: SPELL_ELEMENTS,
  spellForm: SPELL_FORMS,
  spellModifier: SPELL_MODIFIERS,
};
```
(`getRewardItemLabel` needs no change.)

- [ ] **Step 4: Reward field copy**

In `src/components/quest-template-form.tsx`: the `<Label htmlFor="reward-avatar">` text becomes `Item Unlock`; the empty option text becomes `No item reward`; the caption becomes `Unlock a special avatar item or spell part when this quest is completed`. The dropdown already prefixes each option with `getCategoryLabel(category)`, so spell parts appear as "Spell Element: Storm" with no further change. `childUnlockedItems` (from `getChildAvatarUnlocks`) already includes spell categories, so "(already unlocked)" works too.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run src/lib/utils/avatar-catalog.test.ts && npm run typecheck && npm test`
```bash
git add src/lib/utils/avatar-catalog.ts src/lib/utils/avatar-catalog.test.ts src/components/quest-template-form.tsx
git commit -m "Let grown-ups award spell parts as quest rewards

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Spellbook actions

**Files:**
- Create: `src/lib/actions/spells.ts`

**Interfaces:**
- Consumes: `schema.spell`, `schema.childBadge`, `schema.childAvatarUnlock`, `schema.subject`, `schema.child`; `levelFromXp`; `spellSlots`; `resolveSpell`, `unlockedPartIds`, `SPELL_CATEGORY`, `SpellUnlockContext`, `SpellParts`; `isValidSpellName`; `emptySchoolCounts`, `SpellSchool`; `getSchoolCounts` from `./subjects`.
- Produces:
  - `type SpellRecord = { id: string; slot: number; elementId: string; formId: string; modifierId: string | null; adjective: string; noun: string }`
  - `type Spellbook = { spells: SpellRecord[]; slots: number; level: number; unlocked: string[]; schoolCounts: Record<SpellSchool, number>; subjectNamesBySchool: Record<SpellSchool, string[]> }`
  - `getSpellbook(childId): Promise<Spellbook>`, `saveSpell(childId, slot, input: SpellInput): Promise<SpellRecord>` with `type SpellInput = { elementId: string; formId: string; modifierId: string | null; adjective: string; noun: string }`, `clearSpell(childId, slot): Promise<void>`

- [ ] **Step 1: Write the action file**

`src/lib/actions/spells.ts`:
```ts
"use server";

import { and, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { requireChildAccess } from "@/lib/auth/access";
import { levelFromXp } from "@/lib/utils/level";
import { spellSlots } from "@/lib/utils/spell-slots";
import {
  resolveSpell,
  unlockedPartIds,
  SPELL_CATEGORY,
  type SpellUnlockContext,
} from "@/lib/utils/spell-catalog";
import { isValidSpellName } from "@/lib/utils/spell-names";
import type { SpellSchool } from "@/lib/utils/spell-schools";
import { getSchoolCounts } from "./subjects";

export type SpellRecord = {
  id: string;
  slot: number;
  elementId: string;
  formId: string;
  modifierId: string | null;
  adjective: string;
  noun: string;
};

export type SpellInput = Omit<SpellRecord, "id" | "slot">;

export type Spellbook = {
  spells: SpellRecord[];
  slots: number;
  level: number;
  /** Part ids this hero may use, decided once here so the builder never re-derives it. */
  unlocked: string[];
  schoolCounts: Record<SpellSchool, number>;
  subjectNamesBySchool: Record<SpellSchool, string[]>;
};

const SPELL_CATEGORIES = Object.values(SPELL_CATEGORY);

function toRecord(row: typeof schema.spell.$inferSelect): SpellRecord {
  return {
    id: row.id,
    slot: row.slot,
    elementId: row.elementId,
    formId: row.formId,
    modifierId: row.modifierId,
    adjective: row.adjective,
    noun: row.noun,
  };
}

/** Everything the unlock rules need about one hero, loaded in parallel. */
async function loadUnlockContext(childId: string) {
  const [childRows, badges, unlocks, schoolCounts, subjects] = await Promise.all([
    db.select({ currentXp: schema.child.currentXp }).from(schema.child).where(eq(schema.child.id, childId)).limit(1),
    db.select({ badgeId: schema.childBadge.badgeId }).from(schema.childBadge).where(eq(schema.childBadge.childId, childId)),
    db
      .select({ itemId: schema.childAvatarUnlock.itemId })
      .from(schema.childAvatarUnlock)
      .where(and(eq(schema.childAvatarUnlock.childId, childId), inArray(schema.childAvatarUnlock.category, SPELL_CATEGORIES))),
    getSchoolCounts(childId),
    db
      .select({ name: schema.subject.name, spellSchool: schema.subject.spellSchool })
      .from(schema.subject)
      .where(and(eq(schema.subject.childId, childId), eq(schema.subject.isActive, true)))
      .orderBy(schema.subject.sortOrder),
  ]);
  if (!childRows[0]) throw new Error("Hero not found.");
  const level = levelFromXp(childRows[0].currentXp);
  const subjectNamesBySchool: Record<SpellSchool, string[]> = { element: [], form: [], modifier: [] };
  for (const s of subjects) {
    if (s.spellSchool !== "none") subjectNamesBySchool[s.spellSchool].push(s.name);
  }
  const ctx: SpellUnlockContext = {
    level,
    earnedBadgeIds: badges.map((b) => b.badgeId),
    questUnlockedIds: new Set(unlocks.map((u) => u.itemId)),
    schoolCounts,
  };
  return { level, ctx, subjectNamesBySchool };
}

/** A hero may read their own spellbook. */
export async function getSpellbook(childId: string): Promise<Spellbook> {
  await requireChildAccess(childId);
  const [{ level, ctx, subjectNamesBySchool }, rows] = await Promise.all([
    loadUnlockContext(childId),
    db.select().from(schema.spell).where(eq(schema.spell.childId, childId)).orderBy(schema.spell.slot),
  ]);
  return {
    spells: rows.map(toRecord),
    slots: spellSlots(level),
    level,
    unlocked: [...unlockedPartIds(ctx)],
    schoolCounts: ctx.schoolCounts,
    subjectNamesBySchool,
  };
}

/**
 * Hero or grown-up. Every rule is checked again here with fresh data, because
 * the builder's view of what is unlocked can be minutes stale.
 */
export async function saveSpell(childId: string, slot: number, input: SpellInput): Promise<SpellRecord> {
  await requireChildAccess(childId, { write: true });
  const { level, ctx } = await loadUnlockContext(childId);
  if (!Number.isInteger(slot) || slot < 1 || slot > spellSlots(level)) {
    throw new Error("That page of the spellbook isn't open yet.");
  }
  const parts = { elementId: input.elementId, formId: input.formId, modifierId: input.modifierId ?? null };
  const unlocked = unlockedPartIds(ctx);
  const partsOpen =
    unlocked.has(parts.elementId) &&
    unlocked.has(parts.formId) &&
    (parts.modifierId === null || unlocked.has(parts.modifierId));
  if (!partsOpen || !resolveSpell(parts)) throw new Error("That part is still sealed.");
  if (!isValidSpellName(parts, input.adjective, input.noun)) throw new Error("Pick a name from the word bank.");

  const now = new Date();
  await db
    .insert(schema.spell)
    .values({
      id: nanoid(),
      childId,
      slot,
      elementId: parts.elementId,
      formId: parts.formId,
      modifierId: parts.modifierId,
      adjective: input.adjective,
      noun: input.noun,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.spell.childId, schema.spell.slot],
      set: {
        elementId: parts.elementId,
        formId: parts.formId,
        modifierId: parts.modifierId,
        adjective: input.adjective,
        noun: input.noun,
        updatedAt: now,
      },
    });
  const rows = await db
    .select()
    .from(schema.spell)
    .where(and(eq(schema.spell.childId, childId), eq(schema.spell.slot, slot)))
    .limit(1);
  revalidatePath("/spellbook");
  revalidatePath("/loot");
  return toRecord(rows[0]);
}

export async function clearSpell(childId: string, slot: number): Promise<void> {
  await requireChildAccess(childId, { write: true });
  await db.delete(schema.spell).where(and(eq(schema.spell.childId, childId), eq(schema.spell.slot, slot)));
  revalidatePath("/spellbook");
  revalidatePath("/loot");
}
```

- [ ] **Step 2: Smoke against the local database**

This task has no unit tests by plan (rules were tested in Tasks 3–4; actions are thin by repo convention). Write a throwaway `npx tsx` script under `/tmp/claude-1000/` (do not commit) that imports `saveSpell`-equivalent logic is not possible without an actor, so instead exercise the pieces: call `unlockedPartIds` with a context built the way `loadUnlockContext` builds it for a demo hero (query the same tables against `file:./local.db`), and insert/upsert one `spell` row twice for the same `(childId, slot)` to confirm the unique index and `onConflictDoUpdate` behave (one row, updated values). Clean up the row. Record the output in your report.

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm test`
```bash
git add src/lib/actions/spells.ts
git commit -m "Add spellbook actions: read, save with unlock checks, clear

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Spellbook builder, page, and nav

**Files:**
- Create: `src/components/spellbook-builder.tsx`, `src/components/spellbook-builder.test.tsx`, `src/app/(app)/spellbook/page.tsx`
- Modify: `src/components/nav-items.ts`

**Interfaces:**
- Consumes: `Spellbook`, `SpellRecord`, `saveSpell`, `clearSpell` (Task 6); `SPELL_ELEMENTS`, `SPELL_FORMS`, `SPELL_MODIFIERS`, `spellUnlockHint`, `describeSpell`, `findElement`, `findForm`, `findModifier`, `SpellParts` (Task 3); `spellNameOptions`, `defaultSpellName`, `displaySpellName` (Task 4).
- Produces: `SpellbookBuilder({ childId, heroName, book, canEdit })`.

Accessible names used by the tests (keep them exact): slot buttons `Page N`; part tiles `Element Ember`, `Form Bolt`, `Modifier Slow`, `Modifier None`; name chips `Adjective Ripple`, `Noun Sphere`; buttons `Save spell`, `Clear page N`.

- [ ] **Step 1: Write the failing test**

`src/components/spellbook-builder.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpellbookBuilder } from "./spellbook-builder";
import type { Spellbook } from "@/lib/actions/spells";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const saveSpell = vi.fn().mockResolvedValue({});
const clearSpell = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/actions/spells", () => ({
  saveSpell: (...a: unknown[]) => saveSpell(...a),
  clearSpell: (...a: unknown[]) => clearSpell(...a),
}));

const book: Spellbook = {
  spells: [{ id: "s1", slot: 1, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" }],
  slots: 4,
  level: 1,
  unlocked: ["ember", "tide", "bolt", "orb", "slow"],
  schoolCounts: { element: 0, form: 0, modifier: 0 },
  subjectNamesBySchool: { element: ["Reading"], form: ["Math"], modifier: [] },
};

function renderBuilder() {
  return render(<SpellbookBuilder childId="c1" heroName="Lily" book={book} canEdit={true} />);
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("SpellbookBuilder", () => {
  it("renders a filled page with its name and description", () => {
    renderBuilder();
    expect(screen.getByRole("button", { name: "Page 1" })).toHaveTextContent("Ember Bolt");
    expect(screen.getByText("A bolt of ember.")).toBeInTheDocument();
  });

  it("keeps sealed parts unselectable and shows why", () => {
    renderBuilder();
    const stone = screen.getByRole("button", { name: "Element Stone" });
    expect(stone).toBeDisabled();
    expect(screen.getByText("Log 5 more Reading quests.")).toBeInTheDocument();
  });

  it("offers the word bank for the chosen parts", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await user.click(screen.getByRole("button", { name: "Element Tide" }));
    await user.click(screen.getByRole("button", { name: "Form Orb" }));
    expect(screen.getByRole("button", { name: "Adjective Ripple" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Noun Sphere" })).toBeInTheDocument();
  });

  it("saves the chosen parts and name into the selected page", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Page 2" }));
    await user.click(screen.getByRole("button", { name: "Element Tide" }));
    await user.click(screen.getByRole("button", { name: "Form Orb" }));
    await user.click(screen.getByRole("button", { name: "Adjective Ripple" }));
    await user.click(screen.getByRole("button", { name: "Noun Sphere" }));
    await user.click(screen.getByRole("button", { name: "Save spell" }));
    expect(saveSpell).toHaveBeenCalledWith("c1", 2, {
      elementId: "tide",
      formId: "orb",
      modifierId: null,
      adjective: "Ripple",
      noun: "Sphere",
    });
  });

  it("clears a page", async () => {
    const user = userEvent.setup();
    renderBuilder();
    await user.click(screen.getByRole("button", { name: "Clear page 1" }));
    expect(clearSpell).toHaveBeenCalledWith("c1", 1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/components/spellbook-builder.test.tsx`
Expected: FAIL, cannot resolve `./spellbook-builder`.

- [ ] **Step 3: Write the builder**

`src/components/spellbook-builder.tsx`:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import { saveSpell, clearSpell, type Spellbook, type SpellRecord } from "@/lib/actions/spells";
import {
  SPELL_ELEMENTS,
  SPELL_FORMS,
  SPELL_MODIFIERS,
  describeSpell,
  findElement,
  spellUnlockHint,
  type SpellParts,
  type SpellUnlock,
} from "@/lib/utils/spell-catalog";
import { spellNameOptions, defaultSpellName, displaySpellName } from "@/lib/utils/spell-names";

type Props = { childId: string; heroName: string; book: Spellbook; canEdit: boolean };

type Draft = { elementId: string | null; formId: string | null; modifierId: string | null; adjective: string; noun: string };

function draftFromSpell(spell: SpellRecord | undefined, firstElement: string | null, firstForm: string | null): Draft {
  if (spell) {
    return { elementId: spell.elementId, formId: spell.formId, modifierId: spell.modifierId, adjective: spell.adjective, noun: spell.noun };
  }
  const parts = firstElement && firstForm ? { elementId: firstElement, formId: firstForm, modifierId: null } : null;
  const name = parts ? defaultSpellName(parts) : null;
  return { elementId: firstElement, formId: firstForm, modifierId: null, adjective: name?.adjective ?? "", noun: name?.noun ?? "" };
}

function partsOf(d: Draft): SpellParts | null {
  return d.elementId && d.formId ? { elementId: d.elementId, formId: d.formId, modifierId: d.modifierId } : null;
}

export function SpellbookBuilder({ childId, heroName, book, canEdit }: Props) {
  const router = useRouter();
  const unlocked = new Set(book.unlocked);
  const ctx = { level: book.level, earnedBadgeIds: [] as string[], questUnlockedIds: new Set<string>(), schoolCounts: book.schoolCounts };
  const spellsBySlot = new Map(book.spells.map((s) => [s.slot, s]));
  const firstElement = SPELL_ELEMENTS.find((p) => unlocked.has(p.id))?.id ?? null;
  const firstForm = SPELL_FORMS.find((p) => unlocked.has(p.id))?.id ?? null;
  const firstEmpty = Array.from({ length: book.slots }, (_, i) => i + 1).find((n) => !spellsBySlot.has(n)) ?? 1;

  const [slot, setSlot] = useState(firstEmpty);
  const [draft, setDraft] = useState<Draft>(() => draftFromSpell(spellsBySlot.get(firstEmpty), firstElement, firstForm));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parts = partsOf(draft);
  const names = parts ? spellNameOptions(parts) : null;

  // The hint copy only needs level and school counts; badge and quest unlocks
  // are already folded into `book.unlocked`, so a sealed part with one of
  // those unlock kinds still gets the right sentence.
  function hintFor(unlock: SpellUnlock, id: string): string | null {
    if (unlocked.has(id)) return null;
    return spellUnlockHint(unlock, ctx, book.subjectNamesBySchool, id) ?? "Sealed for now.";
  }

  function choosePage(n: number) {
    setSlot(n);
    setDraft(draftFromSpell(spellsBySlot.get(n), firstElement, firstForm));
    setError("");
  }

  /** Changing a part resets the name to the bank's first words for the new parts. */
  function updateParts(patch: Partial<Pick<Draft, "elementId" | "formId" | "modifierId">>) {
    setDraft((d) => {
      const next = { ...d, ...patch };
      const p = partsOf(next);
      const name = p ? defaultSpellName(p) : null;
      return { ...next, adjective: name?.adjective ?? "", noun: name?.noun ?? "" };
    });
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  const canSave = canEdit && !!parts && !!draft.adjective && !!draft.noun && !busy;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <GameFrame title={`${heroName}'s Pages`} icon={<GameIcon name="book" className="size-4 text-[var(--gold-bright)]" />}>
        <ul className="space-y-2">
          {Array.from({ length: book.slots }, (_, i) => i + 1).map((n) => {
            const spell = spellsBySlot.get(n);
            const spellParts = spell ? { elementId: spell.elementId, formId: spell.formId, modifierId: spell.modifierId } : null;
            return (
              <li key={n} className="flex items-start gap-2">
                <button
                  type="button"
                  aria-label={`Page ${n}`}
                  aria-pressed={slot === n}
                  onClick={() => choosePage(n)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-left ${slot === n ? "border-[var(--gold-border)] bg-muted/40" : "border-gold-dim bg-muted/20"}`}
                >
                  <p className="text-xs text-muted-foreground">Page {n}</p>
                  {spell && spellParts ? (
                    <>
                      <p className="font-medium" style={{ color: findElement(spell.elementId)?.color }}>
                        {displaySpellName(spellParts, spell.adjective, spell.noun)}
                      </p>
                      <p className="text-xs text-muted-foreground">{describeSpell(spellParts)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Empty page</p>
                  )}
                </button>
                {spell && canEdit && (
                  <Button size="xs" variant="ghost" aria-label={`Clear page ${n}`} disabled={busy} onClick={() => run(() => clearSpell(childId, n))}>
                    Clear
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </GameFrame>

      <GameFrame title="Weave a Spell" icon={<GameIcon name="crystalBall" className="size-4 text-[var(--gold-bright)]" />}>
        {error && <div className="mb-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
        <div className="space-y-5">
          <PartGrid
            title="Elements"
            kind="Element"
            tiles={SPELL_ELEMENTS.map((p) => ({ id: p.id, label: p.label, color: p.color, icon: "sparkles" as GameIconName, hint: hintFor(p.unlock, p.id) }))}
            selectedId={draft.elementId}
            canEdit={canEdit}
            onSelect={(id) => updateParts({ elementId: id })}
          />
          <PartGrid
            title="Forms"
            kind="Form"
            tiles={SPELL_FORMS.map((p) => ({ id: p.id, label: p.label, color: "var(--gold-bright)", icon: p.icon, hint: hintFor(p.unlock, p.id) }))}
            selectedId={draft.formId}
            canEdit={canEdit}
            onSelect={(id) => updateParts({ formId: id })}
          />
          <PartGrid
            title="Modifiers"
            kind="Modifier"
            tiles={[
              { id: null, label: "None", color: "var(--muted-foreground)", icon: "check" as GameIconName, hint: null },
              ...SPELL_MODIFIERS.map((p) => ({ id: p.id as string | null, label: p.label, color: "var(--magic)", icon: p.icon, hint: hintFor(p.unlock, p.id) })),
            ]}
            selectedId={draft.modifierId}
            canEdit={canEdit}
            onSelect={(id) => updateParts({ modifierId: id })}
          />

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</p>
            {names && parts ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {names.adjectives.map((w) => (
                    <button key={w} type="button" aria-label={`Adjective ${w}`} aria-pressed={draft.adjective === w} disabled={!canEdit}
                      onClick={() => setDraft((d) => ({ ...d, adjective: w }))}
                      className={`rounded-full border px-2.5 py-1 text-xs ${draft.adjective === w ? "border-[var(--gold-border)] bg-muted/40" : "border-gold-dim"}`}>
                      {w}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {names.nouns.map((w) => (
                    <button key={w} type="button" aria-label={`Noun ${w}`} aria-pressed={draft.noun === w} disabled={!canEdit}
                      onClick={() => setDraft((d) => ({ ...d, noun: w }))}
                      className={`rounded-full border px-2.5 py-1 text-xs ${draft.noun === w ? "border-[var(--gold-border)] bg-muted/40" : "border-gold-dim"}`}>
                      {w}
                    </button>
                  ))}
                </div>
                <p className="text-sm">
                  <span className="font-medium">{displaySpellName(parts, draft.adjective, draft.noun)}</span>
                  <span className="text-muted-foreground"> &middot; {describeSpell(parts)}</span>
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Choose an element and a form to name your spell.</p>
            )}
          </div>

          <Button aria-label="Save spell" disabled={!canSave} onClick={() => parts && run(() => saveSpell(childId, slot, { ...parts, adjective: draft.adjective, noun: draft.noun }))}>
            {busy ? "Weaving..." : `Save to page ${slot}`}
          </Button>
        </div>
      </GameFrame>
    </div>
  );
}

type Tile = { id: string | null; label: string; color: string; icon: GameIconName; hint: string | null };

function PartGrid({ title, kind, tiles, selectedId, canEdit, onSelect }: {
  title: string;
  kind: string;
  tiles: Tile[];
  selectedId: string | null;
  canEdit: boolean;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {tiles.map((t) => {
          const locked = t.hint !== null;
          const selected = selectedId === t.id;
          return (
            <button
              key={t.id ?? "none"}
              type="button"
              aria-label={`${kind} ${t.label}`}
              aria-pressed={selected}
              aria-disabled={locked}
              disabled={locked || !canEdit}
              onClick={() => onSelect(t.id)}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center ${selected ? "border-[var(--gold-border)] bg-muted/40" : "border-gold-dim bg-muted/20"} ${locked ? "opacity-50" : ""}`}
            >
              <span style={{ color: t.color }}>
                <GameIcon name={locked ? "lock" : t.icon} className="size-5" />
              </span>
              <span className="text-xs font-medium">{t.label}</span>
              {locked && <span className="text-[10px] leading-tight text-muted-foreground">{t.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```
If `GameIconName` is not exported as a type from `game-icon.tsx`, export it there (`export type GameIconName = keyof typeof PATHS;` already exists at line 71; confirm and import it as shown).

- [ ] **Step 4: Run the builder test**

Run: `npx vitest run src/components/spellbook-builder.test.tsx`
Expected: 5 passed.

- [ ] **Step 5: Page and nav**

`src/app/(app)/spellbook/page.tsx`:
```tsx
import Link from "next/link";
import { requireActor } from "@/lib/auth/actor";
import { getFamily } from "@/lib/actions/family";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getSpellbook } from "@/lib/actions/spells";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { SpellbookBuilder } from "@/components/spellbook-builder";
import { SPELL_PART_COUNT } from "@/lib/utils/spell-catalog";

export default async function SpellbookPage({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  await requireActor();
  const { child: selectedChildId } = await searchParams;
  const { child: activeChild, allChildren, isChildView } = await resolveActiveChild(selectedChildId);

  if (!isChildView && !(await getFamily())) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Spellbook</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="crystalBall" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Set up your family</Link> before the magic can begin.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl">Spellbook</h1>
        <GameFrame>
          <div className="py-4 text-center">
            <GameIcon name="person" className="mx-auto size-10 text-[var(--gold-bright)]" />
            <p className="mt-3 text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">Summon a hero</Link> to open a spellbook.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  const book = await getSpellbook(activeChild.id);

  return (
    <div className="space-y-6">
      <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-4xl">{isChildView ? "My Spellbook" : `${activeChild.displayName}'s Spellbook`}</h1>
          <p className="mt-1 text-muted-foreground">
            {book.unlocked.length} of {SPELL_PART_COUNT} parts unlocked &middot; {book.spells.length} of {book.slots} pages filled. Quests you log open more.
          </p>
        </div>
        {!isChildView && allChildren.length > 1 && <ChildSelector kids={allChildren} selectedId={activeChild.id} />}
      </div>
      <SpellbookBuilder childId={activeChild.id} heroName={activeChild.displayName} book={book} canEdit={true} />
    </div>
  );
}
```

`src/components/nav-items.ts`: after the Schedule entry add
```ts
  {
    href: "/spellbook",
    label: "Spellbook",
    icon: "crystalBall",
    description: "Your book of spells — assemble what you've unlocked and name your magic.",
  },
```

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm test`; lint must add no new errors (in particular no `react-hooks/set-state-in-effect`: the builder uses no effects).
```bash
git add src/components/spellbook-builder.tsx src/components/spellbook-builder.test.tsx "src/app/(app)/spellbook/page.tsx" src/components/nav-items.ts
git commit -m "Add the Spellbook page and builder

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Loot card and School of Magic select

**Files:**
- Modify: `src/app/(app)/loot/page.tsx` (imports, `Promise.all` at ~line 62, a card above "Claimed treasures"), `src/app/(app)/settings/child-list.tsx` (`Subject` type ~line 71, `SubjectManager` ~595–700, `SortableSubjectRow` ~747–870)

**Interfaces:**
- Consumes: `getSpellbook`, `SPELL_PART_COUNT`; `updateSubject(subjectId, { spellSchool })`, `SCHOOL_LABELS`, `SUBJECT_SCHOOLS`, `SubjectSchool`.

- [ ] **Step 1: Loot card**

In `src/app/(app)/loot/page.tsx` add imports `import { getSpellbook } from "@/lib/actions/spells";` and `import { SPELL_PART_COUNT } from "@/lib/utils/spell-catalog";`. Add `getSpellbook(activeChild.id)` as the last element of the existing `Promise.all` and destructure it as `spellbook`. Directly above the `CrownsPanel` render (or above "Claimed treasures" if the crowns panel sits elsewhere) add:
```tsx
      <GameFrame title="Spellbook" icon={<GameIcon name="crystalBall" className="size-4 text-[var(--gold-bright)]" />}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            {spellbook.spells.length} {spellbook.spells.length === 1 ? "spell" : "spells"} kept &middot; {spellbook.unlocked.length} of {SPELL_PART_COUNT} parts unlocked
          </p>
          <Link href={isChildView ? "/spellbook" : `/spellbook?child=${activeChild.id}`} className="text-sm font-medium text-primary hover:underline">
            Open the Spellbook →
          </Link>
        </div>
      </GameFrame>
```

- [ ] **Step 2: School of Magic in the Subject Manager**

In `src/app/(app)/settings/child-list.tsx`:
- Import `Select` is already imported; add `import { SCHOOL_LABELS, SUBJECT_SCHOOLS, type SubjectSchool } from "@/lib/utils/spell-schools";`.
- `Subject` type: add `spellSchool: SubjectSchool;` (the settings page passes full `getSubjects` rows, so the field is already present at runtime; if typecheck complains about the `kids` prop shape in `settings/page.tsx`, the rows already carry `spellSchool` from the schema and no page change is needed).
- `SubjectManager`: add `const [editSchool, setEditSchool] = useState<SubjectSchool>("none");`. In `startEdit` add `setEditSchool(subject.spellSchool ?? "none");`. In `handleUpdateSubject` pass `spellSchool: editSchool` alongside name and color. Under the "Disciplines & Studies" header row add:
```tsx
      <p className="text-xs text-muted-foreground">
        Quests logged in a discipline unlock spell parts from its school of magic.
      </p>
```
- Pass `editSchool={editSchool}` and `onEditSchoolChange={setEditSchool}` to every `<SortableSubjectRow>`; add both to its props type (`editSchool: SubjectSchool; onEditSchoolChange: (value: SubjectSchool) => void;`).
- In `SortableSubjectRow` editing branch, after the color swatches and before the Save button:
```tsx
          <Select
            aria-label="School of magic"
            value={editSchool}
            onChange={(e) => onEditSchoolChange(e.target.value as SubjectSchool)}
            className="h-7 w-44 text-xs"
          >
            {SUBJECT_SCHOOLS.map((s) => (
              <option key={s} value={s}>{SCHOOL_LABELS[s]}</option>
            ))}
          </Select>
```
- In the non-editing branch, after the subject name span and before the "sacred" marker:
```tsx
          {subject.spellSchool && subject.spellSchool !== "none" && (
            <span className="text-xs text-muted-foreground">{SCHOOL_LABELS[subject.spellSchool]}</span>
          )}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test` (lint: no new errors). Smoke in the dev server if one is practical: edit a discipline's school and confirm the caption updates; otherwise say so in the report.
```bash
git add "src/app/(app)/loot/page.tsx" "src/app/(app)/settings/child-list.tsx"
git commit -m "Show the spellbook on Loot and let grown-ups set a discipline's school of magic

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Final verification

**Files:** none new.

- [ ] **Step 1: Full gate**

Run: `npm run typecheck && npm test`, then `npm run lint` and confirm the only error is the pre-existing one in `src/components/quest-template-list.tsx`.

- [ ] **Step 2: Migration and backfill sanity**

`ls src/lib/db/migrations | tail -3` shows one new `0022_*` file for this slice. `npm run db:backfill-spell-schools -- --dry-run` reports zero changes (already applied in Task 2).

- [ ] **Step 3: Spec walk**

Against `docs/superpowers/specs/2026-09-02-realm-spellbook-design.md`: A catalog and resolution → Task 3; A names and slots → Task 4; B schema → Task 1; B defaults, backfill, counts, Subject Manager → Tasks 2 and 8; C table → Task 1; C quest rewards → Task 5; C actions → Task 6; D page, nav, builder → Task 7; D Loot card → Task 8; access-control table: `saveSpell`/`clearSpell` allow the hero (write access, no `isChildActor` rejection), `updateSubject` keeps its existing gating. Anything missing is a new task, not a note.

- [ ] **Step 4: Hand off**

Use `superpowers:finishing-a-development-branch` (this slice continues on `realm-foundations`; the branch now carries slices 1 and 2).
