# Realm Slice 8: Side Quests, Onboarding, and the Pixel World — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename deeds to Side Quests everywhere a person reads, make the Realm explain itself (subjects, spells, controls, the parent view), guarantee a spell in the bar, and redraw the world as pixel art through the existing sprite pipeline.

**Architecture:** Copy comes from one table (`side-quest-copy.ts`) and subject labels from `AREA_LABELS` in `skills.ts`; the Side Quests page moves to `/side-quests` with a redirect. A starter spell is seeded lazily (`ensureStarterSpell`) the way seasons are, and the bar always renders with empty pages that prompt for the Spellbook. A `RealmHelp` dialog opens once per hero (`realm_settings.help_seen_at`) and holds a pending ceremony until closed. The world's boxes become SVG pixel figures rasterised by `SpriteSource` and drawn as billboards; the ground and path are canvas-painted tiles.

**Tech Stack:** Next.js 16 App Router (server actions), React 19 + React Compiler, Drizzle + libsql, three 0.185 / @react-three/fiber 9 / drei 10, Vitest + Testing Library (jsdom, no WebGL), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-09-09-realm-side-quests-onboarding-design.md`

## Global Constraints

- The new name is **Side Quests**: nouns come only from `src/lib/utils/side-quest-copy.ts` (`SIDE_QUEST = "Side Quest"`, `SIDE_QUESTS = "Side Quests"`, `SIDE_QUEST_LOWER = "side quest"`, `SIDE_QUESTS_LOWER = "side quests"`). Code identifiers (`deed_run`, `DeedPanel`, `DeedPicker`, `startDeedRun`, the `deeds` catalog) are NOT renamed.
- Copy, verbatim: "Finish a season to earn your first crown." (unchanged), "Make a spell in your Spellbook", "Your spellbook has room. Make a spell to fill this page.", "Open the Spellbook", "Empty", "How to play", "Show the how-to-play card again", "You're looking at {name}'s grounds. Spells, side quests and recess are theirs to play.", "Tap or click where the spell should go, or press Space to aim at the nearest trouble.", "Tap where the spell should go.", "Side quests are for the hero to play.", "How side quests make magic".
- Migration 0025 adds nullable timestamps `help_seen_at` and `starter_spell_at` to `realm_settings`; after editing `src/lib/db/schema.ts`, run `npm run db:generate` then `npm run db:migrate` and read the generated SQL.
- `"use server"` files export only async functions; never `export type { X }` from one.
- Hero-or-parent writes go through `requireChildAccess(childId, { write: true })`; parent-only writes also check `isChildActor(access)`.
- Lint rule `react-hooks/set-state-in-effect` (no synchronous setState in effects); the React Compiler forbids render-time ref writes; scene events reach React via `queueMicrotask`; `World` in the scene is memoised, so scene props must be referentially stable.
- three.js runtime imports only in `realm-scene.tsx`, `spell-layer.tsx`, `recess-layer.tsx`, `ceremony-layer.tsx`, and the dynamic `import("three")` inside `src/lib/realm/sprite-texture.ts` and the new `src/lib/realm/tile-texture.ts`; nothing under Vitest imports three at module load.
- DOM overlays inside `.realm-root` stop pointer propagation; HUD buttons are 44 px; never put `zoom` on `.realm-root`.
- Git: run each git command on its own line (no `&&` chains between git commands); commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Work on branch `realm-foundations` in the main checkout `/home/kylee/projects/kingdoms-and-crowns`.
- Spell slots are 1-based (`saveSpell` rejects slot < 1); the starter spell is slot 1, Ember + Bolt, named "Ember Bolt".

---

### Task 1: Rename to Side Quests, subject chips, magic lines, parent note

**Files:**
- Create: `src/lib/utils/side-quest-copy.ts`
- Modify: `src/lib/utils/skills.ts` (add `AREA_LABELS`, `schoolLines`)
- Create: `src/components/subject-chip.tsx`
- Create: `src/components/side-quest-magic.tsx`
- Move: `src/app/(app)/deeds/page.tsx` → `src/app/(app)/side-quests/page.tsx` (git mv, then edit)
- Modify: `next.config.ts` (add `redirects`)
- Modify: `src/components/nav-items.ts` (the Deeds entry and the Realm description)
- Modify: `src/components/deed-picker.tsx`, `src/components/deed-player.tsx`, `src/components/deed-results.tsx`, `src/components/realm/site-card.tsx`, `src/components/realm/deed-panel.tsx`
- Modify: `src/lib/actions/deeds.ts` (`RunStart.deed.area`, `revalidatePath`), `src/lib/utils/deeds.ts` (header comment), `src/lib/utils/spell-catalog.ts:178`
- Modify: `src/app/(app)/realm/page.tsx:55`, `src/app/(app)/settings/mastery-panel.tsx:10-14`, `src/app/(app)/settings/realm-settings-panel.tsx:63`
- Modify: `src/components/realm/realm-hud.tsx` (preview intro line), `src/components/realm/realm-shell.tsx` (the `preview` prop)
- Test: `src/lib/utils/side-quest-copy.test.tsx` (new), `src/lib/utils/skills.test.ts` (new or existing), `src/components/subject-chip.test.tsx` (new), `src/components/side-quest-magic.test.tsx` (new), `src/components/deed-picker.test.tsx`, `src/components/realm/site-card.test.tsx`, `src/components/realm/realm-hud.test.tsx`

**Interfaces:**
- Consumes: `AREA_SCHOOL: Record<SkillArea, SpellSchool>` and `type SkillArea = "math" | "reading" | "language" | "science"` from `src/lib/utils/skills.ts`; `SPELL_ELEMENTS`, `SPELL_FORMS` from `src/lib/utils/spell-catalog.ts`; `BuildingOverview.deeds[].area` (already present) from `src/lib/services/deeds.ts`.
- Produces: `SIDE_QUEST`, `SIDE_QUESTS`, `SIDE_QUEST_LOWER`, `SIDE_QUESTS_LOWER`; `AREA_LABELS: Record<SkillArea, { label: string; color: string }>`; `schoolLines(): { school: SpellSchool; areas: SkillArea[] }[]`; `SubjectChip({ area, size? })`; `SideQuestMagic({ spellbookHref })` and `magicLine(school, areas)`; `RunStart.deed.area: SkillArea`; `DeedResults` prop `area: SkillArea`; `RealmHud` prop `preview: { intro?: string; note: string | null } | null`; the route `/side-quests`.

- [ ] **Step 1: Write the failing copy, chip, and magic-line tests**

Create `src/lib/utils/side-quest-copy.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { MAIN_NAV } from "@/components/nav-items";
import { SiteCard, HERO_ONLY } from "@/components/realm/site-card";
import { DeedResults } from "@/components/deed-results";
import { VILLAGERS } from "@/lib/realm/villagers";
import { SIDE_QUEST, SIDE_QUESTS, SIDE_QUEST_LOWER, SIDE_QUESTS_LOWER } from "./side-quest-copy";
import nextConfig from "../../../next.config";

afterEach(cleanup);

const building = {
  id: "well", label: "Village Well", description: "Clean water for every doorstep.", icon: "box" as const, done: 2, total: 5, complete: false,
  deeds: [{ id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const }],
};

describe("side quest copy", () => {
  it("has the four nouns", () => {
    expect([SIDE_QUEST, SIDE_QUESTS, SIDE_QUEST_LOWER, SIDE_QUESTS_LOWER]).toEqual(["Side Quest", "Side Quests", "side quest", "side quests"]);
  });
  it("never says deed where a person reads", () => {
    for (const item of MAIN_NAV) expect(`${item.label} ${item.description}`).not.toMatch(/deed/i);
    expect(MAIN_NAV.find((i) => i.label === "Side Quests")?.href).toBe("/side-quests");
    expect(HERO_ONLY).toBe("Side quests are for the hero to play.");
    const card = render(<SiteCard villager={VILLAGERS[0]} building={building} preview={true} busy={false} error="" onBegin={() => {}} onClearError={() => {}} onClose={() => {}} />);
    expect(card.container.textContent).not.toMatch(/deed/i);
    cleanup();
    const results = render(<DeedResults summary={{ correctCount: 4, total: 5, flawless: false, masteryChanges: [], building: { label: "Village Well", done: 3, total: 5, complete: false } }} deedTitle="Count the Well Stones" area="math" onDone={() => {}} />);
    expect(results.container.textContent).toContain("Side quest done!");
    expect(results.container.textContent).toContain("Village Well: 3 of 5 side quests");
    expect(results.container.textContent).toContain("Back to side quests");
    expect(results.container.textContent).not.toMatch(/deed/i);
  });
  it("redirects the old deeds address for good", async () => {
    const rules = await nextConfig.redirects!();
    expect(rules).toContainEqual({ source: "/deeds", destination: "/side-quests", permanent: true });
  });
});
```

Create `src/components/subject-chip.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SubjectChip } from "./subject-chip";
import { AREA_LABELS } from "@/lib/utils/skills";

afterEach(cleanup);

describe("SubjectChip", () => {
  it("names the subject in its colour for every area", () => {
    for (const area of ["math", "reading", "language", "science"] as const) {
      render(<SubjectChip area={area} />);
      const chip = screen.getByLabelText(`Subject: ${AREA_LABELS[area].label}`);
      expect(chip.textContent).toBe(AREA_LABELS[area].label);
      expect(chip.getAttribute("style")).toContain(AREA_LABELS[area].color.replace("#", ""));
      cleanup();
    }
    expect(AREA_LABELS).toEqual({
      math: { label: "Math", color: "#3b82f6" },
      reading: { label: "Reading", color: "#22c55e" },
      language: { label: "Language", color: "#a855f7" },
      science: { label: "Science", color: "#f97316" },
    });
  });
});
```

Create `src/components/side-quest-magic.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SideQuestMagic, magicLine } from "./side-quest-magic";
import { schoolLines } from "@/lib/utils/skills";

afterEach(cleanup);

describe("How side quests make magic", () => {
  it("derives one line per school from the area mapping", () => {
    expect(schoolLines()).toEqual([
      { school: "form", areas: ["math"] },
      { school: "element", areas: ["reading", "language"] },
      { school: "modifier", areas: ["science"] },
    ]);
    expect(magicLine("form", ["math"])).toBe("Math side quests unlock Forms: Bolt, Orb, Burst and more.");
    expect(magicLine("element", ["reading", "language"])).toBe("Reading and Language side quests unlock Elements: Ember, Tide, Stone and more.");
    expect(magicLine("modifier", ["science"])).toBe("Science side quests unlock Modifiers.");
  });
  it("links every line to the Spellbook", () => {
    render(<SideQuestMagic spellbookHref="/spellbook?child=c1" />);
    expect(screen.getByText("How side quests make magic")).toBeInTheDocument();
    const links = screen.getAllByRole("link", { name: "Open the Spellbook" });
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "/spellbook?child=c1");
  });
});
```

Add to `src/components/deed-picker.test.tsx` (extend the `overview` fixture's `startDeedRun` resolved value with `area: "math"` inside `deed`, since `RunStart.deed` gains `area` in this task):

```tsx
  it("shows each side quest's subject and filters by it", async () => {
    render(<DeedPicker childId="c1" overview={overview} profile={profile} calm={false} />);
    expect(screen.getAllByLabelText("Subject: Math")).toHaveLength(2);
    expect(screen.getByLabelText("Subject: Reading")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reading", pressed: false }));
    expect(screen.queryByText("Grain Mill")).not.toBeInTheDocument();
    expect(screen.getByText("Village Well")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "All", pressed: false }));
    expect(screen.getByText("Grain Mill")).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/deed/i);
  });
```

Add to `src/components/realm/site-card.test.tsx`:

```tsx
  it("shows each side quest's subject", () => {
    render(<SiteCard villager={VILLAGERS[0]} building={building} preview={false} busy={false} error="" onBegin={() => {}} onClearError={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText("Subject: Math")).toBeInTheDocument();
    expect(screen.getByLabelText("Subject: Reading")).toBeInTheDocument();
  });
```

Add to `src/components/realm/realm-hud.test.tsx`:

```tsx
  it("tells a parent what the preview leaves out, then the closed reason", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={null} warning={false} preview={{ intro: "You're looking at Lily's grounds. Spells, side quests and recess are theirs to play.", note: "Closed for Lily: it's school time." }} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} />);
    expect(screen.getByText("You're looking at Lily's grounds. Spells, side quests and recess are theirs to play.")).toBeInTheDocument();
    expect(screen.getByText("Closed for Lily: it's school time.")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/utils/side-quest-copy.test.tsx src/components/subject-chip.test.tsx src/components/side-quest-magic.test.tsx src/components/deed-picker.test.tsx src/components/realm/site-card.test.tsx src/components/realm/realm-hud.test.tsx`
Expected: FAIL (modules missing; old copy).

- [ ] **Step 3: Create the copy table and the subject labels**

Create `src/lib/utils/side-quest-copy.ts`:

```ts
/**
 * "Deed" in code is "side quest" on screen. Every visible string builds from
 * these four nouns; identifiers (deed_run, DeedPanel, startDeedRun) keep their names.
 */
export const SIDE_QUEST = "Side Quest";
export const SIDE_QUESTS = "Side Quests";
export const SIDE_QUEST_LOWER = "side quest";
export const SIDE_QUESTS_LOWER = "side quests";
```

Add the same first sentence as a comment at the top of `src/lib/utils/deeds.ts`: `// "Deed" in code is "side quest" on screen. Identifiers are not renamed; copy comes from side-quest-copy.ts.`

In `src/lib/utils/skills.ts`, after `AREA_SCHOOL`, add:

```ts
/** What a child sees on a side quest: the subject's name and chip colour. */
export const AREA_LABELS: Record<SkillArea, { label: string; color: string }> = {
  math: { label: "Math", color: "#3b82f6" },
  reading: { label: "Reading", color: "#22c55e" },
  language: { label: "Language", color: "#a855f7" },
  science: { label: "Science", color: "#f97316" },
};

const SCHOOL_ORDER: SpellSchool[] = ["form", "element", "modifier"];

/** Which subjects feed each spell school, for the "How side quests make magic" lines. */
export function schoolLines(): { school: SpellSchool; areas: SkillArea[] }[] {
  const areas = Object.keys(AREA_SCHOOL) as SkillArea[];
  return SCHOOL_ORDER.map((school) => ({ school, areas: areas.filter((a) => AREA_SCHOOL[a] === school) }));
}
```

(`SpellSchool` is already imported there as a type; `AREA_SCHOOL`'s key order is reading, language, math, science, which is what the test expects for elements.)

- [ ] **Step 4: Create the chip and the magic frame**

Create `src/components/subject-chip.tsx`:

```tsx
import { AREA_LABELS, type SkillArea } from "@/lib/utils/skills";

/** The subject a side quest practices, as a small coloured pill. */
export function SubjectChip({ area, size = "sm" }: { area: SkillArea; size?: "sm" | "md" }) {
  const { label, color } = AREA_LABELS[area];
  return (
    <span
      aria-label={`Subject: ${label}`}
      className={`inline-flex shrink-0 items-center rounded-full border font-medium ${size === "sm" ? "px-2 py-0 text-[11px]" : "px-2.5 py-0.5 text-xs"}`}
      style={{ color, borderColor: color }}
    >
      {label}
    </span>
  );
}
```

Create `src/components/side-quest-magic.tsx`:

```tsx
import Link from "next/link";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { AREA_LABELS, schoolLines, type SkillArea } from "@/lib/utils/skills";
import { SPELL_ELEMENTS, SPELL_FORMS } from "@/lib/utils/spell-catalog";
import type { SpellSchool } from "@/lib/utils/spell-schools";
import { SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";

const PLURAL: Record<SpellSchool, string> = { form: "Forms", element: "Elements", modifier: "Modifiers" };

function examplesFor(school: SpellSchool): string[] {
  if (school === "form") return SPELL_FORMS.slice(0, 3).map((p) => p.label);
  if (school === "element") return SPELL_ELEMENTS.slice(0, 3).map((p) => p.label);
  return [];
}

function joinSubjects(areas: SkillArea[]): string {
  const names = areas.map((a) => AREA_LABELS[a].label);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
}

/** "Math side quests unlock Forms: Bolt, Orb, Burst and more." */
export function magicLine(school: SpellSchool, areas: SkillArea[]): string {
  const examples = examplesFor(school);
  const tail = examples.length > 0 ? `: ${examples.join(", ")} and more.` : ".";
  return `${joinSubjects(areas)} ${SIDE_QUESTS_LOWER} unlock ${PLURAL[school]}${tail}`;
}

export function SideQuestMagic({ spellbookHref }: { spellbookHref: string }) {
  return (
    <GameFrame title="How side quests make magic" icon={<GameIcon name="sparkles" className="size-4 text-[var(--gold-bright)]" />}>
      <ul className="space-y-2">
        {schoolLines().map(({ school, areas }) => (
          <li key={school} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{magicLine(school, areas)}</span>
            <Link href={spellbookHref} className="text-xs font-medium text-primary hover:underline">Open the Spellbook</Link>
          </li>
        ))}
      </ul>
    </GameFrame>
  );
}
```

- [ ] **Step 5: Move the page, add the redirect, rename the nav**

Run: `git mv "src/app/(app)/deeds/page.tsx" "src/app/(app)/side-quests/page.tsx"` (create the directory first with `mkdir -p "src/app/(app)/side-quests"`).

Edit the moved page: rename the component to `SideQuestsPage`; import `SIDE_QUESTS` and `SIDE_QUESTS_LOWER` from `@/lib/utils/side-quest-copy` and `SideQuestMagic` from `@/components/side-quest-magic`; replace the three `<h1>` texts with `{SIDE_QUESTS}` (and `` `${activeChild.displayName}'s ${SIDE_QUESTS}` `` / `` `My ${SIDE_QUESTS}` ``); change "to take up deeds" to `` to take up {SIDE_QUESTS_LOWER} ``; change the blurb to `Help the folk of the kingdom. Each side quest raises a building and strengthens your magic. &middot; {overview.bandLabel}`; and directly under the banner `div` (before the `overview.enabled` branch) add:

```tsx
      <SideQuestMagic spellbookHref={isChildView ? "/spellbook" : `/spellbook?child=${activeChild.id}`} />
```

In `next.config.ts`, add inside `nextConfig` before `async headers()`:

```ts
  // "Deeds" became "Side Quests" (slice 8); old links and bookmarks keep working.
  async redirects() {
    return [{ source: "/deeds", destination: "/side-quests", permanent: true }];
  },
```

In `src/components/nav-items.ts`, import `SIDE_QUESTS` from `@/lib/utils/side-quest-copy` and change the Deeds entry to:

```ts
  {
    href: "/side-quests",
    label: SIDE_QUESTS,
    icon: "map",
    description: "Help the folk of your kingdom. Each side quest raises a building and strengthens your magic.",
  },
```

and the Realm entry's description to `"Walk your kingdom — the castle, the buildings your side quests raised, and your companion at your side."`. Keep the alphabetical order comment true: "Side Quests" sorts after "Schedule" and before "Spellbook", so move the entry there.

In `src/lib/actions/deeds.ts`: change `revalidatePath("/deeds")` to `revalidatePath("/side-quests")`; change `RunStart` to `deed: { id: string; title: string; story: string; area: SkillArea }` (import `type SkillArea` from `@/lib/utils/skills`), and at both places that build `deed: { id: deed.id, title: deed.title, story }` add `, area: deed.area`.

- [ ] **Step 6: Rename the remaining copy and add the chips**

`src/components/deed-picker.tsx`: import `SubjectChip`, `AREA_LABELS`, `type SkillArea`, and `SIDE_QUESTS_LOWER`. Add state `const [area, setArea] = useState<SkillArea | "all">("all");` and compute

```tsx
  const visible = buildings
    .map((b) => ({ ...b, deeds: b.deeds.filter((d) => area === "all" || d.area === area) }))
    .filter((b) => b.deeds.length > 0);
```

Render a filter row above the sections:

```tsx
      <div className="flex flex-wrap gap-2" role="group" aria-label="Subject">
        {(["all", "math", "reading", "language", "science"] as const).map((a) => (
          <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${area === a ? "border-[var(--gold-border)] bg-[rgba(201,168,76,0.15)] text-[var(--gold-bright)]" : "border-border text-muted-foreground"}`}>
            {a === "all" ? "All" : AREA_LABELS[a].label}
          </button>
        ))}
      </div>
```

map over `visible` instead of `buildings`, and put `<SubjectChip area={d.area} />` beside each side quest title: `<p className="flex items-center gap-2 text-sm font-medium">{d.title} <SubjectChip area={d.area} /></p>`. If the picker has an empty-state string containing "deeds", rebuild it from the copy table (`No ${SIDE_QUESTS_LOWER} yet`).

`src/components/deed-player.tsx`: change the two "Finish deed" strings to `` `Finish ${SIDE_QUEST_LOWER}` `` (import `SIDE_QUEST_LOWER`), render `<SubjectChip area={run.deed.area} />` at the start of the story line (`<p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><SubjectChip area={run.deed.area} /> {run.deed.story}</p>`), and pass `area={run.deed.area}` to `<DeedResults>`.

`src/components/deed-results.tsx`: add the prop `area: SkillArea`; default `doneLabel` becomes `` `Back to ${SIDE_QUESTS_LOWER}` ``; "Deed done!" becomes `` `${SIDE_QUEST} done!` ``; "… deeds" becomes `` `${summary.building.label}: ${summary.building.done} of ${summary.building.total} ${SIDE_QUESTS_LOWER}` ``; render `<SubjectChip area={area} size="md" />` under the heading.

`src/components/realm/site-card.tsx`: `export const HERO_ONLY = \`${SIDE_QUESTS} are for the hero to play.\`;` and `<p className="flex items-center gap-2 text-sm font-medium">{d.title} <SubjectChip area={d.area} /></p>`.

`src/components/realm/deed-panel.tsx`: "Leave the deed" → `` `Leave the ${SIDE_QUEST_LOWER}` ``.

`src/app/(app)/realm/page.tsx:55`: "…visit what your deeds have raised…" → "…visit what your side quests have raised…".

`src/app/(app)/settings/mastery-panel.tsx`: "Deeds are practice inside the Realm." → `` `${SIDE_QUESTS} are practice inside the Realm.` ``; "No deeds yet." → `` `No ${SIDE_QUESTS_LOWER} yet.` ``.

`src/app/(app)/settings/realm-settings-panel.tsx:63`: "The 3D world where quests become deeds and seasons earn crowns." → "The 3D world where side quests raise a kingdom and seasons earn crowns." (The spec placed this line in the marketing walkthrough; it lives here. The walkthrough's "heroic deeds" line uses the ordinary word and stays.)

`src/lib/utils/spell-catalog.ts:178`: "quests or deeds to go." → "quests or side quests to go." (update any test asserting the old sentence). Ruling: the builder's sealed-part hint already names the family's subjects ("3 more Math quests or side quests to go."), so only the noun changes; the spec's example sentence is not adopted verbatim.

Then run `grep -rn "deed" src/app src/components --include=*.tsx | grep -vi "deedId\|deed_run\|deedRun\|DeedP\|DeedR\|deeds\.\|deedsOverview\|DeedsOverview\|startDeedRun\|completeDeedRun\|answerDeed\|getDeeds\|import\|deed-\|@/lib/utils/deeds\|deedsToBuild\|deedsDone\|deed\.area\|deed\.title\|deed\.story\|deed\.id\|heroic deeds"` and rebuild any remaining visible string from the copy table.

- [ ] **Step 7: The parent preview intro**

In `src/components/realm/realm-hud.tsx`, change the prop type to `preview: { intro?: string; note: string | null } | null;` and render, in place of the single note line:

```tsx
      {preview?.intro && <p className="realm-hud-note">{preview.intro}</p>}
      {preview?.note && <p className="realm-hud-note">{preview.note}</p>}
```

In `src/components/realm/realm-shell.tsx`, add `import { SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";` and change the HUD prop to:

```tsx
        preview={isChildView ? null : { intro: `You're looking at ${bundle.heroName}'s grounds. Spells, ${SIDE_QUESTS_LOWER} and recess are theirs to play.`, note }}
```

- [ ] **Step 8: Run the tests, typecheck, lint, commit**

Run: `npx vitest run src/lib/utils src/components` then `npx tsc --noEmit` then `npx eslint src`
Expected: PASS; tsc clean; lint shows only the pre-existing error in `src/components/quest-template-list.tsx`.

```bash
git add -A src next.config.ts
git commit -m "feat(side-quests): rename deeds to Side Quests, subject chips, magic lines, parent note" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Starter spell, the always-on bar, and the cast hint

**Files:**
- Modify: `src/lib/db/schema.ts` (`realmSettings`: `helpSeenAt`, `starterSpellAt`); generate migration 0025
- Modify: `src/lib/services/realm-play.ts` (add `loadRealmFlags`)
- Modify: `src/lib/services/spells.ts` (add `STARTER_SPELL`, `starterSpellDecision`, `ensureStarterSpell`)
- Test: `src/lib/services/spells.test.ts` (new)
- Modify: `src/lib/actions/children.ts` (call after the season sync), `src/lib/actions/spells.ts` (`getSpellbook`), `src/lib/actions/realm.ts` (`getRealmBundle`)
- Modify: `src/lib/realm/spells/pages.ts`; Test: `src/lib/realm/spells/pages.test.ts`
- Modify: `src/components/realm/spell-bar.tsx`; Test: `src/components/realm/spell-bar.test.tsx`
- Modify: `src/components/realm/realm-shell.tsx`; Test: `src/components/realm/realm-shell.test.tsx`
- Modify: `src/app/globals.css` (empty page, hint panel, crosshair)

**Interfaces:**
- Consumes: `spellSlots(level)`; `resolvePages`; `SpellPageView`; `loadRealmSettings` (creates the row on first read).
- Produces: `loadRealmFlags(childId): Promise<{ helpSeenAt: Date | null; starterSpellAt: Date | null }>` (Task 3 reads `helpSeenAt`); `STARTER_SPELL`; `starterSpellDecision(hasSpells, starterSpellAt): "seed" | "mark" | "none"`; `ensureStarterSpell(childId)`; `EMPTY_PAGE = "Empty"`; `SpellPageView.empty?: boolean`; `withEmptyPages(pages, slots)`; the bar renders for every hero visit.

Two rulings recorded here: `resolvePages` filtered `slot < slots`, which dropped a hero's last page (slots are 1-based; page 4 of 4 never reached the Realm) — fixed to `1 ≤ slot ≤ slots`, and the spell-bar test fixture moves from slots 0–5 to 1–6. The cast hint uses the 4 s toast rather than the 2 s notice, because a sentence cannot be read in two seconds.

- [ ] **Step 1: Schema and migration**

In `src/lib/db/schema.ts`, inside the `realmSettings` table after `toneMode`, add:

```ts
    // Slice 8: when the hero first saw the how-to-play card, and when the starter spell was seeded (or found unnecessary).
    helpSeenAt: integer("help_seen_at", { mode: "timestamp" }),
    starterSpellAt: integer("starter_spell_at", { mode: "timestamp" }),
```

Run `npm run db:generate` then `npm run db:migrate`. Expected: a new `src/lib/db/migrations/0025_<words>.sql` containing two `ALTER TABLE \`realm_settings\` ADD …` statements, and migrate exits 0.

- [ ] **Step 2: Write the failing pure tests**

Create `src/lib/services/spells.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { starterSpellDecision, STARTER_SPELL } from "./spells";

describe("starterSpellDecision", () => {
  it("seeds a hero who has never had a spell, marks one who built their own, and leaves a marked hero alone", () => {
    expect(starterSpellDecision(false, null)).toBe("seed");
    expect(starterSpellDecision(true, null)).toBe("mark");
    expect(starterSpellDecision(false, new Date("2026-09-01"))).toBe("none");
    expect(starterSpellDecision(true, new Date("2026-09-01"))).toBe("none");
  });
  it("is Ember Bolt on page one", () => {
    expect(STARTER_SPELL).toEqual({ slot: 1, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" });
  });
});
```

Append to `src/lib/realm/spells/pages.test.ts` (add `withEmptyPages`, `EMPTY_PAGE` to its import):

```ts
describe("withEmptyPages", () => {
  const saved = (slot: number) => ({ id: `s${slot}`, slot, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" });
  it("keeps the last page of a full book", () => {
    expect(resolvePages([saved(1), saved(4)], 4).map((p) => p.slot)).toEqual([1, 4]);
    expect(resolvePages([saved(0), saved(5)], 4)).toEqual([]);
  });
  it("fills every open slot with an empty page, in slot order", () => {
    const pages = withEmptyPages(resolvePages([saved(2)], 4), 4);
    expect(pages.map((p) => p.slot)).toEqual([1, 2, 3, 4]);
    expect(pages.filter((p) => p.empty).map((p) => p.slot)).toEqual([1, 3, 4]);
    expect(pages[0].name).toBe(EMPTY_PAGE);
    expect(pages[0].spell).toBeNull();
    expect(pages[1].empty).toBeUndefined();
    expect(withEmptyPages([], 0)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx vitest run src/lib/services/spells.test.ts src/lib/realm/spells/pages.test.ts`
Expected: FAIL (exports missing; `resolvePages([saved(1), saved(4)], 4)` currently drops slot 4).

- [ ] **Step 4: Flags, decision, seeding, and callers**

In `src/lib/services/realm-play.ts` add (it already imports `db`, `schema`, `eq`):

```ts
/** The two slice-8 timestamps on realm_settings; the row is created if missing. */
export async function loadRealmFlags(childId: string): Promise<{ helpSeenAt: Date | null; starterSpellAt: Date | null }> {
  await loadRealmSettings(childId);
  const rows = await db
    .select({ helpSeenAt: schema.realmSettings.helpSeenAt, starterSpellAt: schema.realmSettings.starterSpellAt })
    .from(schema.realmSettings)
    .where(eq(schema.realmSettings.childId, childId))
    .limit(1);
  return { helpSeenAt: rows[0]?.helpSeenAt ?? null, starterSpellAt: rows[0]?.starterSpellAt ?? null };
}
```

In `src/lib/services/spells.ts` add `import { nanoid } from "nanoid";` and `import { loadRealmFlags } from "./realm-play";` and append:

```ts
/** Every hero's first page: two free parts, so the bar is never empty on a first visit. */
export const STARTER_SPELL = { slot: 1, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" } as const;

export type StarterDecision = "seed" | "mark" | "none";

/** Seed once, never twice; a hero who already built spells is only marked. */
export function starterSpellDecision(hasSpells: boolean, starterSpellAt: Date | null): StarterDecision {
  if (starterSpellAt) return "none";
  return hasSpells ? "mark" : "seed";
}

export async function ensureStarterSpell(childId: string): Promise<StarterDecision> {
  const flags = await loadRealmFlags(childId);
  const existing = await db.select({ id: schema.spell.id }).from(schema.spell).where(eq(schema.spell.childId, childId)).limit(1);
  const decision = starterSpellDecision(existing.length > 0, flags.starterSpellAt);
  if (decision === "none") return decision;
  const now = new Date();
  if (decision === "seed") {
    await db.insert(schema.spell).values({ id: nanoid(), childId, ...STARTER_SPELL, createdAt: now, updatedAt: now }).onConflictDoNothing();
  }
  await db.update(schema.realmSettings).set({ starterSpellAt: now, updatedAt: now }).where(eq(schema.realmSettings.childId, childId));
  return decision;
}
```

Callers:
- `src/lib/actions/children.ts`: import `ensureStarterSpell` from `@/lib/services/spells`; after `if (grade) await syncSeasonForGrade(id, grade, formatDate(now));` add `await ensureStarterSpell(id);`.
- `src/lib/actions/spells.ts` `getSpellbook`: after `await requireChildAccess(childId);` add `await ensureStarterSpell(childId).catch((err: unknown) => console.error("Starter spell failed", err));` (import it next to `loadSpellbookPages`).
- `src/lib/actions/realm.ts` `getRealmBundle`: after the access line add the same `await ensureStarterSpell(childId).catch(...)` before the `Promise.all` (import it next to `loadSpellbookPages`).

- [ ] **Step 5: Pages with empties**

In `src/lib/realm/spells/pages.ts`:

```ts
export const EMPTY_PAGE = "Empty";

export type SpellPageView = { slot: number; name: string; spell: SpellDefinition | null; color: string; icon: GameIconName | null; empty?: boolean };
```

change the filter in `resolvePages` to `.filter((s) => s.slot >= 1 && s.slot <= slots)` (slots are 1-based), and append:

```ts
/** Saved pages plus one empty page per open slot, so the bar always shows the whole book. */
export function withEmptyPages(pages: SpellPageView[], slots: number): SpellPageView[] {
  const bySlot = new Map(pages.map((p) => [p.slot, p]));
  return Array.from({ length: Math.max(0, Math.floor(slots)) }, (_, i) => bySlot.get(i + 1) ?? { slot: i + 1, name: EMPTY_PAGE, spell: null, color: "#6b7280", icon: null, empty: true });
}
```

Run: `npx vitest run src/lib/services/spells.test.ts src/lib/realm/spells/pages.test.ts` → PASS.

- [ ] **Step 6: Write the failing bar and shell tests**

In `src/components/realm/spell-bar.test.tsx`, move the fixture to 1-based slots: `const pages = resolvePages([page(1), page(2, "tide", "orb"), page(3, "nope"), page(4, "ember", "burst"), page(5, "ember", "wall"), page(6, "ember", "sprite")], 12);` and update every slot number the existing tests pass or expect by +1 (e.g. `selectedSlot={2}` where it was 1, `toHaveBeenLastCalledWith(2)` where it was 1, key "2" now selects slot 2). Then add:

```tsx
  it("shows an empty page as a dashed chip that opens the Spellbook hint, and skips it for keys", () => {
    const onSelect = vi.fn();
    const withEmpties = withEmptyPages(resolvePages([page(2, "tide", "orb")], 3), 3);
    render(<SpellBar pages={withEmpties} selectedSlot={null} mana={100} fewerChoices={false} onSelect={onSelect} raised={false} hudScale={1} />);
    const empty = screen.getByRole("button", { name: "Empty page 1" });
    expect(empty.className).toContain("realm-spell--empty");
    expect(empty).toHaveAttribute("aria-disabled", "true");
    expect(empty).toHaveAttribute("title", "Make a spell in your Spellbook");
    fireEvent.keyDown(window, { key: "1" });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(empty);
    const hint = screen.getByRole("dialog", { name: "Empty page" });
    expect(hint.textContent).toContain("Your spellbook has room. Make a spell to fill this page.");
    expect(screen.getByRole("link", { name: "Open the Spellbook" })).toHaveAttribute("href", "/spellbook");
    fireEvent.keyDown(hint, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Empty page" })).not.toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.click(empty);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "Empty page" })).not.toBeInTheDocument();
  });
```

(add `withEmptyPages` to the test's import from `@/lib/realm/spells/pages`).

In `src/components/realm/realm-shell.test.tsx`, add to the bundle fixture `helpSeen: true` (Task 3 adds the field; adding it now keeps the fixture stable), and add:

```tsx
describe("RealmShell spell bar", () => {
  it("always shows the hero's book, with empty pages for open slots, and never shows a parent one", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    expect(screen.getByRole("toolbar", { name: "Spellbook" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Empty page \d$/ })).toHaveLength(4);
    cleanup();
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={false} />);
    await screen.findByTestId("scene");
    expect(screen.queryByRole("toolbar", { name: "Spellbook" })).not.toBeInTheDocument();
  });

  it("explains casting the first time a page is picked, in the words the input mode needs", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    const spell = { id: "s1", slot: 1, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" };
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: [spell], slots: 4 } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    fireEvent.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect(screen.getByText("Tap or click where the spell should go, or press Space to aim at the nearest trouble.")).toBeInTheDocument();
    expect(document.querySelector(".realm-root")?.className).toContain("realm-root--aiming");
    cleanup();
    render(<RealmShell bundle={{ ...bundle, spellbook: { spells: [spell], slots: 4 }, profile: { ...DEFAULT_LEARNING_PROFILE, inputMode: "touch" as const } }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    fireEvent.click(screen.getByRole("button", { name: "Ember Bolt, 10 mana" }));
    expect(screen.getByText("Tap where the spell should go.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run them to verify they fail**

Run: `npx vitest run src/components/realm/spell-bar.test.tsx src/components/realm/realm-shell.test.tsx`
Expected: the new tests FAIL (no empty chips; no bar without spells; no hint).

- [ ] **Step 8: The bar**

Rewrite `src/components/realm/spell-bar.tsx` as:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GameIcon } from "@/components/game-icon";
import type { SpellPageView } from "@/lib/realm/spells/pages";

const FEWER = 4;
export const EMPTY_TITLE = "Make a spell in your Spellbook";
export const EMPTY_HINT = "Your spellbook has room. Make a spell to fill this page.";

/** The hero's pages along the bottom of the world. Keys 1–9 select, a second tap or Escape deselects; an empty page explains where spells come from. */
export function SpellBar({
  pages,
  selectedSlot,
  mana,
  fewerChoices,
  onSelect,
  raised,
  hudScale,
}: {
  pages: SpellPageView[];
  selectedSlot: number | null;
  mana: number;
  fewerChoices: boolean;
  onSelect: (slot: number | null) => void;
  raised: boolean;
  hudScale: number;
}) {
  const shown = fewerChoices ? pages.slice(0, FEWER) : pages;
  const [hint, setHint] = useState(false);
  const hintPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (hint) hintPanel.current?.focus();
  }, [hint]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest("input, textarea, select, [role='dialog']")) return;
      if (e.key === "Escape") {
        onSelect(null);
        return;
      }
      const index = Number.parseInt(e.key, 10);
      if (!Number.isInteger(index) || index < 1 || index > 9) return;
      const page = shown[index - 1];
      if (!page || !page.spell) return; // faded and empty pages are not spells
      e.preventDefault();
      onSelect(page.slot === selectedSlot ? null : page.slot);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, selectedSlot, onSelect]);

  return (
    <>
      <div
        className={`realm-spellbar${raised ? " realm-spellbar--raised" : ""}`}
        style={{ fontSize: `${12 * hudScale}px` }}
        role="toolbar"
        aria-label="Spellbook"
      >
        {shown.map((page, i) => {
          if (page.empty) {
            return (
              <button
                key={page.slot}
                type="button"
                className="realm-spell realm-spell--empty"
                aria-disabled="true"
                aria-label={`Empty page ${i + 1}`}
                title={EMPTY_TITLE}
                onClick={() => setHint(true)}
              >
                <span className="realm-spell-key">{i + 1}</span>
                <span className="realm-spell-name">{page.name}</span>
              </button>
            );
          }
          const selected = page.slot === selectedSlot;
          const affordable = page.spell ? mana >= page.spell.manaCost : false;
          const label = page.spell ? `${page.name}, ${page.spell.manaCost} mana` : page.name;
          return (
            <button
              key={page.slot}
              type="button"
              className={`realm-spell${selected ? " realm-spell--selected" : ""}${page.spell && !affordable ? " realm-spell--dim" : ""}`}
              style={{ borderColor: page.color }}
              aria-pressed={selected}
              aria-label={label}
              disabled={!page.spell}
              onClick={() => onSelect(selected ? null : page.slot)}
            >
              <span className="realm-spell-key">{i + 1}</span>
              <span className="realm-spell-swatch" style={{ background: page.color }} />
              {page.icon && <GameIcon name={page.icon} className="size-4" />}
              <span className="realm-spell-name">{page.name}</span>
              {selected && page.spell && <span className="realm-spell-cost">{page.spell.manaCost}</span>}
            </button>
          );
        })}
      </div>
      {hint && (
        <div
          ref={hintPanel}
          className={`realm-spell-hint${raised ? " realm-spell-hint--raised" : ""}`}
          role="dialog"
          aria-label="Empty page"
          tabIndex={-1}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setHint(false);
            }
          }}
        >
          <p className="realm-spell-hint-text">{EMPTY_HINT}</p>
          <div className="realm-spell-hint-actions">
            <Link href="/spellbook" className="realm-spell-hint-link">Open the Spellbook</Link>
            <button type="button" className="realm-spell-hint-close" onClick={() => setHint(false)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}
```

Append to `src/app/globals.css` after `.realm-spell-cost { … }`:

```css
.realm-spell--empty { border-style: dashed; border-color: rgba(255, 255, 255, 0.35); opacity: 0.75; }
.realm-spell-hint { position: absolute; left: 50%; bottom: 5.5rem; z-index: 21; width: min(22rem, calc(100vw - 2rem)); transform: translateX(-50%); border-radius: 0.75rem; border: 1px solid var(--gold-border); background: rgba(0, 0, 0, 0.85); color: #fff; padding: 0.75rem 1rem; font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; font-size: 14px; outline: none; }
.realm-spell-hint--raised { bottom: 13.75rem; }
.realm-spell-hint-text { margin: 0 0 0.6rem; }
.realm-spell-hint-actions { display: flex; align-items: center; gap: 0.75rem; }
.realm-spell-hint-link { min-height: 44px; display: inline-flex; align-items: center; padding: 0 1rem; border-radius: 9999px; border: 1px solid var(--gold-border); background: rgba(201, 168, 76, 0.25); color: var(--gold-bright); font-weight: 700; }
.realm-spell-hint-close { min-height: 44px; min-width: 44px; background: none; border: none; color: #fff; text-decoration: underline; cursor: pointer; }
.realm-root--aiming canvas { cursor: crosshair; }
```

- [ ] **Step 9: The shell**

In `src/components/realm/realm-shell.tsx`:

- Import `withEmptyPages` next to `resolvePages`.
- Add constants: `const CAST_HINT = "Tap or click where the spell should go, or press Space to aim at the nearest trouble.";` and `const CAST_HINT_TOUCH = "Tap where the spell should go.";`.
- Change the pages memo to `const pages = useMemo(() => withEmptyPages(resolvePages(bundle.spellbook.spells, bundle.spellbook.slots), bundle.spellbook.slots), [bundle.spellbook]);`.
- Add `const castHintShown = useRef(false);` near the other refs.
- Change the root's className to `` className={`realm-root${selectedSpell ? " realm-root--aiming" : ""}`} ``.
- Change the bar's render guard to `{isChildView && !panelOpen && !ceremonyRunning && (` (drop `pages.length > 0`), and its `onSelect` to:

```tsx
          onSelect={(slot) => {
            if (riding && slot !== null) {
              setNotice("Dismount to cast.");
              return;
            }
            setSelectedSlot(slot);
            if (slot !== null && !castHintShown.current) {
              castHintShown.current = true; // once per visit; the toast holds four seconds
              setToast(settings.showStick ? CAST_HINT_TOUCH : CAST_HINT);
            }
          }}
```

- [ ] **Step 10: Run the tests, typecheck, lint, commit**

Run: `npx vitest run src/components/realm src/lib/realm src/lib/services` then `npx tsc --noEmit` then `npx eslint src/components/realm src/lib`
Expected: PASS; clean.

```bash
git add -A src
git commit -m "feat(realm): starter spell, always-on spell bar with empty pages, cast hint" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Right-click, the help card, first visit, and the settings reset

**Files:**
- Create: `src/components/realm/realm-help.tsx`; Test: `src/components/realm/realm-help.test.tsx`
- Modify: `src/lib/actions/realm-settings.ts` (add `markRealmHelpSeen`, `resetRealmHelp`)
- Modify: `src/lib/actions/realm.ts` (`RealmBundle.helpSeen`)
- Modify: `src/components/realm/realm-hud.tsx` (help button); Test: `src/components/realm/realm-hud.test.tsx`
- Modify: `src/components/realm/realm-shell.tsx`; Test: `src/components/realm/realm-shell.test.tsx`
- Modify: `src/components/realm/realm-scene.tsx` (pointer buttons)
- Modify: `src/app/(app)/settings/realm-settings-panel.tsx`; Test: `src/app/(app)/settings/realm-settings-panel.test.tsx`
- Modify: `src/app/globals.css` (help list, help button)

**Interfaces:**
- Consumes: `loadRealmFlags` (Task 2); `SIDE_QUEST_LOWER` (Task 1); `speak` from `src/lib/utils/speech.ts`; `readingAttributes` already on `.realm-root`.
- Produces: `helpGroups(touch: boolean, ceremony: boolean): { icon; title; text }[]`; `RealmHelp({ touch, ceremony, readAloud, onClose })`; `RealmBundle.helpSeen: boolean`; actions `markRealmHelpSeen(childId)` (hero or parent) and `resetRealmHelp(childId)` (parent only); `RealmHud` prop `help?: { onOpen: () => void; disabled: boolean } | null`.

Number keys 1–4 already select pages (the bar's own key handler, Task 2 made it skip empty pages), and the scene's ground handler already fires for any mouse button, so right-click already walks and casts; what was missing is suppressing the browser menu, which this task adds on `.realm-root`.

- [ ] **Step 1: Write the failing help-card and HUD tests**

Create `src/components/realm/realm-help.test.tsx`:

```tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RealmHelp, helpGroups } from "./realm-help";

afterEach(cleanup);

describe("helpGroups", () => {
  it("speaks keys to a keyboard hero and taps to a touch hero", () => {
    const keys = helpGroups(false, false);
    expect(keys.map((g) => g.title)).toEqual(["Move", "Talk", "Cast", "Ride and recess"]);
    expect(keys[0].text).toBe("WASD or the arrow keys, or click where you want to go.");
    expect(keys[1].text).toBe("Walk up to a villager and press Enter, or tap Talk. They'll give you a side quest.");
    expect(keys[2].text).toBe("Pick a spell page (1, 2, 3, 4) or tap it, then click where the spell should go. Space aims at the nearest trouble. Clear troubles to protect the sites.");
    expect(keys[3].text).toBe("Press M or tap Ride to get on your mount. At recess, collect gleams and run the lap ring.");
    const touch = helpGroups(true, false);
    expect(touch[0].text).toBe("Drag the stick, or tap where you want to go.");
    expect(touch[1].text).toBe("Walk up to a villager and tap Talk. They'll give you a side quest.");
    expect(touch[2].text).toBe("Tap a spell page, then tap where the spell should go. Clear troubles to protect the sites.");
    expect(touch[3].text).toBe("Tap Ride to get on your mount. At recess, collect gleams and run the lap ring.");
    expect(touch.join(" ")).not.toMatch(/WASD|Enter|Space|Press M|\(1, 2, 3, 4\)/);
  });
  it("adds the ceremony line only during a ceremony", () => {
    expect(helpGroups(false, true).at(-1)?.text).toBe("Skip the ceremony with Escape or the Skip button.");
    expect(helpGroups(false, false).some((g) => g.title === "Ceremony")).toBe(false);
  });
});

describe("RealmHelp", () => {
  it("is a dialog named How to play that closes on Close and on Escape", () => {
    const onClose = vi.fn();
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    expect(dialog).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
```

Add to `src/components/realm/realm-hud.test.tsx`:

```tsx
  it("offers How to play as a 44px button and disables it while a panel is open", () => {
    const onOpen = vi.fn();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} help={{ onOpen, disabled: false }} />);
    const button = screen.getByRole("button", { name: "How to play" });
    expect(button.className).toContain("realm-hud-help");
    fireEvent.click(button);
    expect(onOpen).toHaveBeenCalledTimes(1);
    cleanup();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={true} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} help={{ onOpen, disabled: true }} />);
    expect(screen.getByRole("button", { name: "How to play" })).toBeDisabled();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/realm/realm-help.test.tsx src/components/realm/realm-hud.test.tsx`
Expected: FAIL (module missing; no help button).

- [ ] **Step 3: The help card and the HUD button**

Create `src/components/realm/realm-help.tsx`:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import { SIDE_QUEST_LOWER } from "@/lib/utils/side-quest-copy";
import { speak } from "@/lib/utils/speech";

export type HelpGroup = { icon: GameIconName; title: string; text: string };

/** The controls, in the words the hero's input mode needs. Written for a reader of about eight. */
export function helpGroups(touch: boolean, ceremony: boolean): HelpGroup[] {
  const groups: HelpGroup[] = [
    { icon: "compass", title: "Move", text: touch ? "Drag the stick, or tap where you want to go." : "WASD or the arrow keys, or click where you want to go." },
    {
      icon: "scroll",
      title: "Talk",
      text: touch
        ? `Walk up to a villager and tap Talk. They'll give you a ${SIDE_QUEST_LOWER}.`
        : `Walk up to a villager and press Enter, or tap Talk. They'll give you a ${SIDE_QUEST_LOWER}.`,
    },
    {
      icon: "sparkles",
      title: "Cast",
      text: touch
        ? "Tap a spell page, then tap where the spell should go. Clear troubles to protect the sites."
        : "Pick a spell page (1, 2, 3, 4) or tap it, then click where the spell should go. Space aims at the nearest trouble. Clear troubles to protect the sites.",
    },
    {
      icon: "map",
      title: "Ride and recess",
      text: touch ? "Tap Ride to get on your mount. At recess, collect gleams and run the lap ring." : "Press M or tap Ride to get on your mount. At recess, collect gleams and run the lap ring.",
    },
  ];
  if (ceremony) groups.push({ icon: "crown", title: "Ceremony", text: "Skip the ceremony with Escape or the Skip button." });
  return groups;
}

/** The how-to-play card: a dialog inside .realm-root; the world's controls are disabled while it is open. */
export function RealmHelp({ touch, ceremony, readAloud, onClose }: { touch: boolean; ceremony: boolean; readAloud: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const groups = helpGroups(touch, ceremony);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  // Read-aloud speaks the whole card once; the effect only starts speech, it sets no state.
  useEffect(() => {
    if (readAloud) speak(groups.map((g) => `${g.title}. ${g.text}`).join(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readAloud]);

  return (
    <div className="realm-overlay" onPointerDown={(e) => e.stopPropagation()}>
      <div
        ref={panel}
        className="realm-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="realm-help-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          } else if (e.key === "Tab") {
            e.preventDefault(); // the only control is Close; Tab must not wander into the HUD
            closeButton.current?.focus();
          }
        }}
      >
        <div className="realm-panel-head">
          <GameIcon name="book" className="size-6 text-[var(--gold-bright)]" />
          <h2 id="realm-help-title" className="text-lg font-bold">How to play</h2>
          <Button ref={closeButton} size="sm" variant="ghost" className="ml-auto" onClick={onClose}>Close</Button>
        </div>
        <ul className="realm-help-list">
          {groups.map((g) => (
            <li key={g.title} className="realm-help-item">
              <GameIcon name={g.icon} className="size-6 shrink-0 text-[var(--gold-bright)]" />
              <div>
                <p className="font-medium">{g.title}</p>
                <p className="text-sm text-muted-foreground">{g.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

(If `Button` does not forward refs, wrap the Close control in a plain `<button type="button" className="…">` with the same classes `Button` renders for `size="sm" variant="ghost"`, or use `closeButton` on a wrapping `span` and focus its first child.)

Append to `src/app/globals.css`:

```css
.realm-help-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
.realm-help-item { display: flex; align-items: flex-start; gap: 0.75rem; }
.realm-hud-help { min-height: 44px; min-width: 44px; font-weight: 700; }
.realm-hud .realm-hud-help { font-size: 0.9em; }
```

In `src/components/realm/realm-hud.tsx`, add the prop `help = null` with type `help?: { onOpen: () => void; disabled: boolean } | null;` and render, just before the `preview` badge:

```tsx
        {help && (
          <Button size="sm" variant="outline" className="realm-hud-help" aria-label="How to play" disabled={help.disabled} onClick={help.onOpen}>?</Button>
        )}
```

Run: `npx vitest run src/components/realm/realm-help.test.tsx src/components/realm/realm-hud.test.tsx` → PASS.

- [ ] **Step 4: Actions and the bundle**

In `src/lib/actions/realm-settings.ts` append:

```ts
/** The hero has seen the how-to-play card (or a grown-up closed it for them). Hero or parent. */
export async function markRealmHelpSeen(childId: string): Promise<void> {
  await requireChildAccess(childId, { write: true });
  await loadRealmSettings(childId);
  const now = new Date();
  await db.update(schema.realmSettings).set({ helpSeenAt: now, updatedAt: now }).where(eq(schema.realmSettings.childId, childId));
}

/** Shows the card again on the hero's next visit. Grown-ups only. */
export async function resetRealmHelp(childId: string): Promise<void> {
  const { access } = await requireChildAccess(childId, { write: true });
  if (isChildActor(access)) throw new Error("Only a grown-up can change Realm settings.");
  await loadRealmSettings(childId);
  await db.update(schema.realmSettings).set({ helpSeenAt: null, updatedAt: new Date() }).where(eq(schema.realmSettings.childId, childId));
  revalidatePath("/settings");
}
```

In `src/lib/actions/realm.ts`: add `helpSeen: boolean; // false until the hero has seen the how-to-play card` to `RealmBundle`; import `loadRealmFlags` from `@/lib/services/realm-play`; add `loadRealmFlags(childId)` as the last member of the `Promise.all` array (destructure as `flags`); return `helpSeen: flags.helpSeenAt !== null`.

- [ ] **Step 5: Write the failing shell tests**

In `src/components/realm/realm-shell.test.tsx` add the mock next to the others:

```ts
const markRealmHelpSeen = vi.fn();
vi.mock("@/lib/actions/realm-settings", () => ({ markRealmHelpSeen: (...a: unknown[]) => markRealmHelpSeen(...a) }));
```

and the describe block:

```tsx
describe("RealmShell help card", () => {
  const ceremony = { seasonId: "s1", crownId: "crown-copper", ordinal: 1, grade: "3", seasonLabel: "2025–26" };

  it("opens the card on a first visit, records it on close, and only then starts a pending ceremony", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markRealmHelpSeen.mockResolvedValue(undefined);
    render(<RealmShell bundle={{ ...bundle, helpSeen: false, ceremony, banners: 1 }} childId="c1" isChildView={true} />);
    const scene = await screen.findByTestId("scene");
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    expect(scene.dataset.ceremony).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();
    await waitFor(() => expect(markRealmHelpSeen).toHaveBeenCalledWith("c1"));
    expect(screen.getByTestId("scene").dataset.ceremony).toBe("true");
  });

  it("closes the card even when the record fails", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    markRealmHelpSeen.mockRejectedValueOnce(new Error("offline"));
    render(<RealmShell bundle={{ ...bundle, helpSeen: false }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();
    await waitFor(() => expect(markRealmHelpSeen).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("scene").dataset.interactive).toBe("true");
  });

  it("never opens by itself for a parent, but the ? button opens it and Escape closes it", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 0, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, helpSeen: false }} childId="c1" isChildView={false} />);
    await screen.findByTestId("scene");
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();
    expect(markRealmHelpSeen).not.toHaveBeenCalled();
  });

  it("lets Escape close the card before it skips a running ceremony", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={{ ...bundle, ceremony, banners: 1 }} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    const skipRef = sceneProps.ceremonySkipRef as { current: boolean };
    fireEvent.keyDown(screen.getByRole("dialog", { name: "How to play" }), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeInTheDocument();
    expect(skipRef.current).toBe(false);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(skipRef.current).toBe(true);
  });

  it("suppresses the browser menu over the world and focuses the world on open", async () => {
    getRealmAccess.mockResolvedValue({ allowed: true, minutesRemaining: 12, source: "earned" });
    render(<RealmShell bundle={bundle} childId="c1" isChildView={true} />);
    await screen.findByTestId("scene");
    const root = document.querySelector<HTMLElement>(".realm-root")!;
    await waitFor(() => expect(document.activeElement).toBe(root));
    const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    root.dispatchEvent(menu);
    expect(menu.defaultPrevented).toBe(true);
  });
});
```

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run src/components/realm/realm-shell.test.tsx`
Expected: the five new tests FAIL.

- [ ] **Step 7: Wire the shell and the scene**

In `src/components/realm/realm-shell.tsx`:

- Imports: `import { markRealmHelpSeen } from "@/lib/actions/realm-settings";` and `import { RealmHelp } from "./realm-help";`.
- State and refs, after `ceremonySkipRef`:

```ts
  const [helpOpen, setHelpOpen] = useState(false);
  // A first visit shows the card once, before anything else; the record is sent once.
  const helpPending = useRef(isChildView && !bundle.helpSeen);
  const helpMarked = useRef(bundle.helpSeen);
  const ceremonyStageRef = useRef(ceremonyStage);
  useEffect(() => {
    ceremonyStageRef.current = ceremonyStage;
  }, [ceremonyStage]);
```

- Replace `onReady` with:

```ts
  const beginCeremonyIfWaiting = useCallback(() => {
    if (ceremonyStageRef.current !== "waiting") return; // a sprite retry after the ceremony must not replay it
    setRiding(false); // the mount sprite would overlap the crown
    setCeremonyStage("running");
  }, []);
  const onReady = useCallback((t: SpriteTextures) => {
    setTextures(t);
    if (helpPending.current) {
      helpPending.current = false;
      setHelpOpen(true); // the ceremony waits behind the card
      return;
    }
    beginCeremonyIfWaiting();
  }, [beginCeremonyIfWaiting]);
```

- Add the help handlers after `returnFocus`:

```ts
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const onHelpClose = useCallback(() => {
    setHelpOpen(false);
    if (!helpMarked.current) {
      helpMarked.current = true;
      markRealmHelpSeen(childId).catch(() => {}); // the next visit simply shows the card again
    }
    beginCeremonyIfWaiting();
    returnFocus();
  }, [childId, beginCeremonyIfWaiting, returnFocus]);
```

- Focus the world once it opens (an effect that only moves focus):

```ts
  useEffect(() => {
    if (textures && !helpOpen) rootRef.current?.focus();
  }, [textures, helpOpen]);
```

- In the Escape-skips-the-ceremony effect, change the guard to `if (!ceremonyRunning || helpOpen) return;` and add `helpOpen` to its dependencies. In the Talk/M key effect, change its guard to `if (panelOpen || ceremonyRunning || helpOpen) return;` and add `helpOpen` to its dependencies.
- `useRealmInput({ enabled: !panelOpen && !ceremonyRunning && !helpOpen, castEnabled: … && !helpOpen … })`; the clock's `paused: panelOpen || ceremonyRunning || helpOpen`; the scene's `interactive={!panelOpen && !ceremonyRunning && !helpOpen}`; the HUD's `paused={panelOpen || ceremonyRunning || helpOpen}`; hide the stick and the spell bar while `helpOpen` (add `&& !helpOpen` to both guards).
- Root: `<div ref={rootRef} className={…} tabIndex={-1} onContextMenu={(e) => e.preventDefault()} {...readingAttributes(bundle.profile)}>`.
- HUD: `help={{ onOpen: openHelp, disabled: panelOpen || helpOpen }}`.
- Render the card after the `DeedPanel` block:

```tsx
      {helpOpen && <RealmHelp touch={settings.showStick} ceremony={ceremonyRunning} readAloud={bundle.profile.readAloud} onClose={onHelpClose} />}
```

In `src/components/realm/realm-scene.tsx`, at the top of the ground mesh's `onPointerDown`, after `e.stopPropagation();`, add `if (e.button !== 0 && e.button !== 2) return; // left and right buttons walk or cast; the wheel does nothing`.

- [ ] **Step 8: The settings reset button**

In `src/app/(app)/settings/realm-settings-panel.tsx`, import `resetRealmHelp` from `@/lib/actions/realm-settings` and add a final row before the closing `</div>`:

```tsx
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
          <p className="text-sm">The how-to-play card</p>
          <p className="text-xs text-muted-foreground">Heroes see it once, on their first visit. The ? button in the Realm opens it any time.</p>
        </div>
        <Button size="sm" variant="outline" className="!border-[var(--gold-border)]" disabled={busy} onClick={() => run(() => resetRealmHelp(childId))}>
          Show the how-to-play card again
        </Button>
      </div>
```

In `src/app/(app)/settings/realm-settings-panel.test.tsx`, extend the `@/lib/actions/realm-settings` mock with `resetRealmHelp: (...a: unknown[]) => resetRealmHelp(...a)` (a `vi.fn()` declared beside the others) and add:

```tsx
  it("lets a parent show the how-to-play card again", async () => {
    resetRealmHelp.mockResolvedValue(undefined);
    render(<RealmSettingsPanel childId="c1" settings={settings} summary={summary} />);
    fireEvent.click(screen.getByRole("button", { name: "Show the how-to-play card again" }));
    await waitFor(() => expect(resetRealmHelp).toHaveBeenCalledWith("c1"));
  });
```

(use the file's existing `settings` and `summary` fixtures and its render helper).

- [ ] **Step 9: Run the tests, typecheck, lint, commit**

Run: `npx vitest run src/components/realm "src/app/(app)/settings/realm-settings-panel.test.tsx"` then `npx tsc --noEmit` then `npx eslint src/components/realm src/lib/actions "src/app/(app)/settings"`
Expected: PASS; clean.

```bash
git add -A src
git commit -m "feat(realm): how-to-play card, first-visit flow, context-menu suppression, settings reset" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: World figures, sprite sizes, decor spots, and tiles (pure)

**Files:**
- Create: `src/components/realm/world-figures.tsx`; Test: `src/components/realm/world-figures.test.tsx`
- Modify: `src/lib/realm/layout.ts` (`PropKind` "decor", `Prop.variant`, `DECOR_SPOTS`, `spriteSizeFor`, decor props); Test: `src/lib/realm/layout.test.ts`
- Create: `src/lib/realm/tiles.ts`; Test: `src/lib/realm/tiles.test.ts`
- Create: `src/lib/realm/tile-texture.ts`
- Modify: `src/lib/realm/sprite-texture.ts` (read the viewBox instead of assuming 36×48); Test: `src/lib/realm/sprite-texture.test.ts` (should still pass)

**Interfaces:**
- Consumes: `CASTLE_FOOTPRINTS`, `BUILDING_SLOTS`, `buildingFootprint`, `LAP_WAYPOINTS` (from `src/lib/realm/recess/recess.ts`), `seededRng(seed): () => number` from `src/lib/utils/drill-generators.ts`.
- Produces (Task 5 consumes): `CASTLE_TIERS`, `DECOR_KINDS`, `WORLD_SPRITE_SCALE`, `CastleFigure({ tier })`, `BuildingFigure({ id })`, `FoundationFigure()`, `DecorFigure({ kind })` with `data-figure` of `castle` / `building` / `foundation` / `decor` and `data-figure-id`; `spriteSizeFor(prop): { w: number; h: number }`; `Prop.variant?: string`; `buildWorldLayout({ …, decor?: boolean })`; `grassTile(seed, size?)`, `cobbleTile(seed, size?)` returning `string[][]`; `tileToTexture(tile, pixel?)`.

- [ ] **Step 1: Write the failing figure tests**

Create `src/components/realm/world-figures.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CastleFigure, BuildingFigure, FoundationFigure, DecorFigure, CASTLE_TIERS, DECOR_KINDS, WORLD_SPRITE_SCALE } from "./world-figures";
import { BUILDINGS } from "@/lib/utils/kingdom";

afterEach(cleanup);

/** Every drawn number must sit inside the 64×64 canvas. */
function assertInside(svg: SVGSVGElement) {
  expect(svg.getAttribute("viewBox")).toBe("0 0 64 64");
  for (const r of svg.querySelectorAll("rect")) {
    const x = Number(r.getAttribute("x")), y = Number(r.getAttribute("y")), w = Number(r.getAttribute("width")), h = Number(r.getAttribute("height"));
    expect(x).toBeGreaterThanOrEqual(0); expect(y).toBeGreaterThanOrEqual(0); expect(x + w).toBeLessThanOrEqual(64); expect(y + h).toBeLessThanOrEqual(64);
  }
  for (const p of svg.querySelectorAll("polygon")) {
    for (const n of (p.getAttribute("points") ?? "").split(/[\s,]+/).filter(Boolean).map(Number)) { expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThanOrEqual(64); }
  }
  for (const c of svg.querySelectorAll("circle, ellipse")) {
    const cx = Number(c.getAttribute("cx")), cy = Number(c.getAttribute("cy"));
    const rx = Number(c.getAttribute("r") ?? c.getAttribute("rx")), ry = Number(c.getAttribute("r") ?? c.getAttribute("ry"));
    expect(cx - rx).toBeGreaterThanOrEqual(0); expect(cx + rx).toBeLessThanOrEqual(64); expect(cy - ry).toBeGreaterThanOrEqual(0); expect(cy + ry).toBeLessThanOrEqual(64);
  }
  expect(svg.querySelectorAll("rect, polygon, circle, ellipse").length).toBeGreaterThanOrEqual(3);
}

describe("world figures", () => {
  it("draws every castle tier inside the canvas with its ids", () => {
    expect(CASTLE_TIERS).toEqual(["campsite", "cottage", "watchtower", "keep", "manor", "castle", "fortress", "citadel"]);
    for (const tier of CASTLE_TIERS) {
      const { container } = render(<CastleFigure tier={tier} />);
      const svg = container.querySelector<SVGSVGElement>(`svg[data-figure="castle"][data-figure-id="${tier}"]`)!;
      expect(svg).not.toBeNull();
      assertInside(svg);
      cleanup();
    }
  });
  it("draws every kingdom building", () => {
    for (const b of BUILDINGS) {
      const { container } = render(<BuildingFigure id={b.id} />);
      const svg = container.querySelector<SVGSVGElement>(`svg[data-figure="building"][data-figure-id="${b.id}"]`)!;
      expect(svg).not.toBeNull();
      assertInside(svg);
      cleanup();
    }
  });
  it("draws the foundation and every decoration", () => {
    const { container } = render(<FoundationFigure />);
    assertInside(container.querySelector<SVGSVGElement>('svg[data-figure="foundation"]')!);
    cleanup();
    expect(DECOR_KINDS).toEqual(["oak", "pine", "bush", "rock", "fence", "lantern"]);
    for (const kind of DECOR_KINDS) {
      const { container: c } = render(<DecorFigure kind={kind} />);
      assertInside(c.querySelector<SVGSVGElement>(`svg[data-figure="decor"][data-figure-id="${kind}"]`)!);
      cleanup();
    }
    expect(WORLD_SPRITE_SCALE).toEqual({ castle: 8, building: 6, foundation: 4, decor: 4 });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/components/realm/world-figures.test.tsx`
Expected: FAIL (module missing).

- [ ] **Step 3: Draw the figures**

Create `src/components/realm/world-figures.tsx`:

```tsx
/**
 * Pixel figures for the world: castles by tier, the eight kingdom buildings,
 * the foundation a site shows until it is built, and decorations. Drawn on a
 * 64×64 grid so roofs and towers have room; rasterised by SpriteSource like
 * the heroes. Each figure carries data-figure and data-figure-id.
 */

export const CASTLE_TIERS = ["campsite", "cottage", "watchtower", "keep", "manor", "castle", "fortress", "citadel"] as const;
export type CastleTier = (typeof CASTLE_TIERS)[number];
export const DECOR_KINDS = ["oak", "pine", "bush", "rock", "fence", "lantern"] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];
/** Rasterisation scale per figure family: the citadel is 512 px, a bush 256 px. */
export const WORLD_SPRITE_SCALE = { castle: 8, building: 6, foundation: 4, decor: 4 } as const;

const STONE = "#9a9aa8";
const STONE_DARK = "#6f6f7c";
const ROOF = "#7b3f3f";
const ROOF_DARK = "#5a2d2d";
const WOOD = "#6b4226";
const PLASTER = "#d8cfc0";
const FLAG = "#c0563d";
const GOLD = "#fde68a";
const LEAF = "#2f7a3d";
const LEAF_LIGHT = "#4a9a55";
const PINE = "#1f5f30";

function Frame({ figure, id, children, size = 96 }: { figure: string; id?: string; children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure={figure} data-figure-id={id}>
      {children}
    </svg>
  );
}

/** Square battlements along a wall top: alternating merlons. */
function Merlons({ x, y, width, color = STONE }: { x: number; y: number; width: number; color?: string }) {
  const teeth: React.ReactNode[] = [];
  for (let i = 0; i * 6 + 3 <= width; i++) teeth.push(<rect key={i} x={x + i * 6} y={y} width={3} height={3} fill={color} />);
  return <>{teeth}</>;
}

function Flag({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y} width={1} height={8} fill={WOOD} />
      <polygon points={`${x + 1},${y} ${x + 6},${y + 2} ${x + 1},${y + 4}`} fill={FLAG} />
    </>
  );
}

export function CastleFigure({ tier }: { tier: string }) {
  let body: React.ReactNode;
  switch (tier) {
    case "cottage":
      body = (
        <>
          <rect x={14} y={30} width={36} height={26} fill={PLASTER} />
          <polygon points="8,32 32,10 56,32" fill={ROOF} />
          <polygon points="12,32 32,14 52,32" fill={ROOF_DARK} />
          <rect x={42} y={14} width={6} height={10} fill={STONE_DARK} />
          <rect x={28} y={42} width={8} height={14} fill={WOOD} />
          <rect x={18} y={36} width={6} height={6} fill={GOLD} />
          <rect x={40} y={36} width={6} height={6} fill={GOLD} />
        </>
      );
      break;
    case "watchtower":
      body = (
        <>
          <rect x={22} y={14} width={20} height={42} fill={STONE} />
          <rect x={22} y={14} width={4} height={42} fill={STONE_DARK} />
          <Merlons x={20} y={10} width={24} />
          <rect x={20} y={13} width={24} height={2} fill={STONE_DARK} />
          <rect x={29} y={24} width={6} height={8} fill={GOLD} />
          <rect x={28} y={44} width={8} height={12} fill={WOOD} />
          <Flag x={31} y={2} />
        </>
      );
      break;
    case "keep":
      body = (
        <>
          <rect x={10} y={30} width={44} height={26} fill={STONE} />
          <rect x={6} y={18} width={12} height={38} fill={STONE_DARK} />
          <rect x={46} y={18} width={12} height={38} fill={STONE_DARK} />
          <Merlons x={6} y={14} width={12} color={STONE_DARK} />
          <Merlons x={46} y={14} width={12} color={STONE_DARK} />
          <Merlons x={18} y={26} width={28} />
          <rect x={28} y={42} width={8} height={14} fill={WOOD} />
          <rect x={20} y={34} width={4} height={6} fill={GOLD} />
          <rect x={40} y={34} width={4} height={6} fill={GOLD} />
          <Flag x={11} y={6} />
        </>
      );
      break;
    case "manor":
      body = (
        <>
          <rect x={8} y={26} width={48} height={30} fill={PLASTER} />
          <polygon points="4,28 32,8 60,28" fill={ROOF} />
          <polygon points="10,28 32,13 54,28" fill={ROOF_DARK} />
          <rect x={46} y={12} width={6} height={12} fill={STONE_DARK} />
          <rect x={14} y={32} width={6} height={6} fill={GOLD} />
          <rect x={44} y={32} width={6} height={6} fill={GOLD} />
          <rect x={14} y={44} width={6} height={6} fill={GOLD} />
          <rect x={44} y={44} width={6} height={6} fill={GOLD} />
          <rect x={28} y={42} width={8} height={14} fill={WOOD} />
          <rect x={8} y={40} width={48} height={2} fill={WOOD} />
        </>
      );
      break;
    case "castle":
      body = (
        <>
          <rect x={8} y={32} width={48} height={24} fill={STONE} />
          <Merlons x={8} y={28} width={48} />
          <rect x={4} y={16} width={12} height={40} fill={STONE_DARK} />
          <rect x={48} y={16} width={12} height={40} fill={STONE_DARK} />
          <Merlons x={4} y={12} width={12} color={STONE_DARK} />
          <Merlons x={48} y={12} width={12} color={STONE_DARK} />
          <rect x={26} y={40} width={12} height={16} fill={WOOD} />
          <rect x={26} y={40} width={12} height={4} fill={STONE_DARK} />
          <rect x={8} y={24} width={4} height={6} fill={GOLD} />
          <rect x={52} y={24} width={4} height={6} fill={GOLD} />
          <Flag x={9} y={4} />
          <Flag x={53} y={4} />
        </>
      );
      break;
    case "fortress":
      body = (
        <>
          <rect x={4} y={30} width={56} height={26} fill={STONE} />
          <Merlons x={4} y={26} width={56} />
          <rect x={4} y={14} width={12} height={42} fill={STONE_DARK} />
          <rect x={26} y={10} width={12} height={46} fill={STONE_DARK} />
          <rect x={48} y={14} width={12} height={42} fill={STONE_DARK} />
          <Merlons x={4} y={10} width={12} color={STONE_DARK} />
          <Merlons x={26} y={6} width={12} color={STONE_DARK} />
          <Merlons x={48} y={10} width={12} color={STONE_DARK} />
          <rect x={16} y={44} width={8} height={12} fill={WOOD} />
          <rect x={40} y={44} width={8} height={12} fill={WOOD} />
          <rect x={30} y={20} width={4} height={6} fill={GOLD} />
          <Flag x={31} y={0} />
        </>
      );
      break;
    case "citadel":
      body = (
        <>
          <rect x={4} y={34} width={56} height={22} fill={STONE} />
          <Merlons x={4} y={30} width={56} />
          <rect x={4} y={18} width={10} height={38} fill={STONE_DARK} />
          <rect x={50} y={18} width={10} height={38} fill={STONE_DARK} />
          <rect x={20} y={8} width={10} height={48} fill={STONE_DARK} />
          <rect x={34} y={8} width={10} height={48} fill={STONE_DARK} />
          <rect x={28} y={14} width={8} height={42} fill={STONE} />
          <polygon points="26,14 32,2 38,14" fill={ROOF} />
          <Merlons x={4} y={14} width={10} color={STONE_DARK} />
          <Merlons x={50} y={14} width={10} color={STONE_DARK} />
          <Merlons x={20} y={4} width={10} color={STONE_DARK} />
          <Merlons x={34} y={4} width={10} color={STONE_DARK} />
          <rect x={28} y={44} width={8} height={12} fill={WOOD} />
          <rect x={30} y={24} width={4} height={6} fill={GOLD} />
          <Flag x={6} y={6} />
          <Flag x={52} y={6} />
        </>
      );
      break;
    default: // campsite
      body = (
        <>
          <polygon points="8,56 32,20 56,56" fill="#c9b27a" />
          <polygon points="20,56 32,34 44,56" fill="#8f7d55" />
          <rect x={30} y={18} width={4} height={4} fill={WOOD} />
          <rect x={48} y={50} width={10} height={4} fill={WOOD} />
          <rect x={51} y={44} width={4} height={6} fill="#f97316" />
          <rect x={52} y={40} width={2} height={4} fill={GOLD} />
        </>
      );
  }
  return (
    <Frame figure="castle" id={tier}>
      {body}
      <rect x={4} y={56} width={56} height={4} fill="#24492e" />
    </Frame>
  );
}

export function BuildingFigure({ id }: { id: string }) {
  let body: React.ReactNode;
  switch (id) {
    case "well":
      body = (
        <>
          <rect x={20} y={22} width={4} height={20} fill={WOOD} />
          <rect x={40} y={22} width={4} height={20} fill={WOOD} />
          <polygon points="14,24 32,10 50,24" fill={ROOF} />
          <rect x={30} y={30} width={6} height={6} fill={STONE_DARK} />
          <rect x={18} y={40} width={28} height={16} fill="#7d7d7d" />
          <rect x={18} y={40} width={28} height={3} fill="#5c5c5c" />
          <rect x={26} y={46} width={12} height={10} fill="#1e3a8a" />
        </>
      );
      break;
    case "mill":
      body = (
        <>
          <rect x={22} y={30} width={20} height={26} fill="#b08a5a" />
          <polygon points="18,32 32,20 46,32" fill={ROOF} />
          <rect x={30} y={4} width={4} height={26} fill={PLASTER} />
          <rect x={12} y={28} width={40} height={4} fill={PLASTER} />
          <rect x={18} y={6} width={14} height={4} fill={PLASTER} />
          <rect x={32} y={44} width={14} height={4} fill={PLASTER} />
          <circle cx={32} cy={30} r={3} fill={WOOD} />
          <rect x={28} y={44} width={8} height={12} fill={WOOD} />
        </>
      );
      break;
    case "bridge":
      body = (
        <>
          <rect x={4} y={36} width={56} height={12} fill="#8c7a6b" />
          <polygon points="22,48 32,40 42,48" fill="#1e3a8a" />
          <rect x={4} y={30} width={56} height={4} fill={WOOD} />
          <rect x={8} y={24} width={4} height={12} fill={WOOD} />
          <rect x={30} y={24} width={4} height={12} fill={WOOD} />
          <rect x={52} y={24} width={4} height={12} fill={WOOD} />
          <rect x={4} y={48} width={56} height={8} fill="#1e3a8a" />
        </>
      );
      break;
    case "chapel":
      body = (
        <>
          <rect x={14} y={30} width={36} height={26} fill={PLASTER} />
          <polygon points="10,32 32,16 54,32" fill={ROOF} />
          <rect x={28} y={10} width={8} height={20} fill={PLASTER} />
          <polygon points="26,12 32,2 38,12" fill={ROOF_DARK} />
          <rect x={30} y={16} width={4} height={6} fill={GOLD} />
          <rect x={28} y={42} width={8} height={14} fill={WOOD} />
          <rect x={18} y={38} width={4} height={8} fill="#3b82f6" />
          <rect x={42} y={38} width={4} height={8} fill="#3b82f6" />
        </>
      );
      break;
    case "market":
      body = (
        <>
          <rect x={8} y={26} width={48} height={8} fill={FLAG} />
          <rect x={16} y={26} width={8} height={8} fill={GOLD} />
          <rect x={32} y={26} width={8} height={8} fill={GOLD} />
          <rect x={48} y={26} width={8} height={8} fill={GOLD} />
          <rect x={10} y={34} width={4} height={22} fill={WOOD} />
          <rect x={50} y={34} width={4} height={22} fill={WOOD} />
          <rect x={12} y={40} width={40} height={16} fill="#b08a5a" />
          <rect x={16} y={34} width={8} height={6} fill="#ef4444" />
          <rect x={28} y={34} width={8} height={6} fill="#22c55e" />
          <rect x={40} y={34} width={8} height={6} fill="#f97316" />
        </>
      );
      break;
    case "library":
      body = (
        <>
          <rect x={10} y={28} width={44} height={28} fill="#6f5a8a" />
          <polygon points="6,28 32,14 58,28" fill={PLASTER} />
          <rect x={14} y={32} width={4} height={24} fill={PLASTER} />
          <rect x={46} y={32} width={4} height={24} fill={PLASTER} />
          <rect x={26} y={42} width={12} height={14} fill={WOOD} />
          <rect x={20} y={34} width={4} height={6} fill="#ef4444" />
          <rect x={24} y={34} width={4} height={6} fill="#3b82f6" />
          <rect x={36} y={34} width={4} height={6} fill="#22c55e" />
          <rect x={40} y={34} width={4} height={6} fill={GOLD} />
        </>
      );
      break;
    case "watchtower":
      body = (
        <>
          <rect x={24} y={12} width={16} height={44} fill="#7d7d7d" />
          <rect x={24} y={12} width={4} height={44} fill="#5c5c5c" />
          <Merlons x={22} y={8} width={20} color="#7d7d7d" />
          <rect x={22} y={11} width={20} height={2} fill="#5c5c5c" />
          <rect x={30} y={22} width={4} height={6} fill={GOLD} />
          <rect x={29} y={46} width={6} height={10} fill={WOOD} />
        </>
      );
      break;
    default: // garden
      body = (
        <>
          <rect x={8} y={40} width={48} height={16} fill="#5aa55a" />
          <rect x={8} y={46} width={48} height={2} fill="#3d8a4a" />
          <rect x={12} y={36} width={4} height={4} fill="#ec4899" />
          <rect x={22} y={36} width={4} height={4} fill={GOLD} />
          <rect x={32} y={36} width={4} height={4} fill="#ef4444" />
          <rect x={42} y={36} width={4} height={4} fill="#ec4899" />
          <rect x={6} y={30} width={2} height={26} fill={WOOD} />
          <rect x={56} y={30} width={2} height={26} fill={WOOD} />
          <circle cx={48} cy={24} r={8} fill={LEAF} />
          <rect x={46} y={30} width={4} height={10} fill={WOOD} />
        </>
      );
  }
  return (
    <Frame figure="building" id={id}>
      {body}
      <rect x={4} y={56} width={56} height={4} fill="#24492e" />
    </Frame>
  );
}

/** Staked dirt with a sign: the site a hero is still raising. Drawn flat on the ground. */
export function FoundationFigure() {
  return (
    <Frame figure="foundation">
      <rect x={4} y={20} width={56} height={36} fill="#6b665a" />
      <rect x={8} y={24} width={48} height={28} fill="#7a7464" />
      <rect x={4} y={18} width={4} height={8} fill={WOOD} />
      <rect x={56} y={18} width={4} height={8} fill={WOOD} />
      <rect x={4} y={50} width={4} height={8} fill={WOOD} />
      <rect x={56} y={50} width={4} height={8} fill={WOOD} />
      <rect x={26} y={8} width={12} height={8} fill={PLASTER} />
      <rect x={31} y={16} width={2} height={6} fill={WOOD} />
    </Frame>
  );
}

export function DecorFigure({ kind }: { kind: string }) {
  let body: React.ReactNode;
  switch (kind) {
    case "pine":
      body = (
        <>
          <rect x={29} y={46} width={6} height={12} fill={WOOD} />
          <polygon points="32,18 8,50 56,50" fill={PINE} />
          <polygon points="32,4 14,34 50,34" fill={LEAF} />
        </>
      );
      break;
    case "bush":
      body = (
        <>
          <ellipse cx={32} cy={46} rx={20} ry={12} fill="#3d8a4a" />
          <ellipse cx={26} cy={42} rx={8} ry={6} fill={LEAF_LIGHT} />
          <rect x={38} y={40} width={3} height={3} fill="#ec4899" />
        </>
      );
      break;
    case "rock":
      body = (
        <>
          <polygon points="10,54 20,34 40,30 56,50 50,58 14,58" fill="#7d7d7d" />
          <polygon points="22,38 38,34 44,44 26,46" fill="#9a9aa8" />
          <rect x={14} y={56} width={40} height={2} fill="#5c5c5c" />
        </>
      );
      break;
    case "fence":
      body = (
        <>
          <rect x={4} y={30} width={56} height={4} fill="#a07b4a" />
          <rect x={4} y={42} width={56} height={4} fill="#a07b4a" />
          <rect x={8} y={22} width={6} height={34} fill={WOOD} />
          <rect x={30} y={22} width={6} height={34} fill={WOOD} />
          <rect x={52} y={22} width={6} height={34} fill={WOOD} />
        </>
      );
      break;
    case "lantern":
      body = (
        <>
          <rect x={30} y={20} width={4} height={38} fill={WOOD} />
          <rect x={24} y={8} width={16} height={14} fill={STONE_DARK} />
          <rect x={27} y={11} width={10} height={8} fill={GOLD} />
          <rect x={24} y={56} width={16} height={4} fill={STONE_DARK} />
        </>
      );
      break;
    default: // oak
      body = (
        <>
          <rect x={29} y={40} width={6} height={18} fill={WOOD} />
          <circle cx={22} cy={32} r={10} fill={LEAF} />
          <circle cx={42} cy={32} r={10} fill={LEAF} />
          <circle cx={32} cy={24} r={14} fill={LEAF_LIGHT} />
          <circle cx={28} cy={20} r={4} fill="#7cc27c" />
        </>
      );
  }
  return <Frame figure="decor" id={kind}>{body}</Frame>;
}
```

In `src/lib/realm/sprite-texture.ts`, make the rasteriser honour a figure's own viewBox: replace the two `SVG_W * scale` / `SVG_H * scale` uses with values read from the SVG:

```ts
  const [, , vw, vh] = (svg.getAttribute("viewBox") ?? `0 0 ${SVG_W} ${SVG_H}`).split(/\s+/).map(Number);
  const width = (Number.isFinite(vw) && vw > 0 ? vw : SVG_W) * scale;
  const height = (Number.isFinite(vh) && vh > 0 ? vh : SVG_H) * scale;
```

then use `width`/`height` for the clone's attributes and the canvas size (the existing 36×48 figures rasterise exactly as before).

Run: `npx vitest run src/components/realm/world-figures.test.tsx src/lib/realm/sprite-texture.test.ts` → PASS.

- [ ] **Step 4: Write the failing layout and tile tests**

Append to `src/lib/realm/layout.test.ts` (extend its import with `DECOR_SPOTS`, `spriteSizeFor`, and add `import { LAP_WAYPOINTS } from "./recess/recess";`):

```ts
describe("decorations", () => {
  const allBuilt = BUILDINGS.map((b) => ({ id: b.id, done: b.deedsToBuild, total: b.deedsToBuild, complete: true }));
  const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

  it("places twelve fixed, non-solid decorations, or none when asked", () => {
    const layout = buildWorldLayout({ castleType: "citadel", buildings: allBuilt });
    const decor = layout.props.filter((p) => p.kind === "decor");
    expect(decor).toHaveLength(12);
    expect(decor.every((d) => !d.solid && d.label === "" && d.variant)).toBe(true);
    expect(layout.colliders.some((c) => c.kind === "decor")).toBe(false);
    expect(buildWorldLayout({ castleType: "citadel", buildings: allBuilt, decor: false }).props.some((p) => p.kind === "decor")).toBe(false);
  });

  it("keeps every decoration clear of the path, the sites, the lap ring, the ceremony plaza and the world's edge", () => {
    const layout = buildWorldLayout({ castleType: "citadel", buildings: allBuilt });
    const sites = layout.props.filter((p) => p.kind === "castle" || p.kind === "building" || p.kind === "foundation");
    const castle = layout.props.find((p) => p.kind === "castle")!;
    const south = castle.position.z + castle.size.d / 2;
    for (const spot of DECOR_SPOTS) {
      expect(Math.abs(spot.x)).toBeGreaterThanOrEqual(3.5);
      expect(Math.abs(spot.x)).toBeLessThanOrEqual(WORLD_SIZE / 2 - 2);
      expect(Math.abs(spot.z)).toBeLessThanOrEqual(WORLD_SIZE / 2 - 2);
      for (const s of sites) {
        const inside = Math.abs(spot.x - s.position.x) < s.size.w / 2 + 2 && Math.abs(spot.z - s.position.z) < s.size.d / 2 + 2;
        expect(inside).toBe(false);
      }
      for (const w of LAP_WAYPOINTS) expect(dist(spot, w)).toBeGreaterThanOrEqual(2);
      const inPlaza = Math.abs(spot.x) <= 4.5 && spot.z >= south && spot.z <= south + 8;
      expect(inPlaza).toBe(false);
    }
  });

  it("sizes sprites from footprints", () => {
    const layout = buildWorldLayout({ castleType: "keep", buildings: allBuilt });
    const castle = layout.props.find((p) => p.kind === "castle")!;
    expect(spriteSizeFor(castle)).toEqual({ w: CASTLE_FOOTPRINTS.keep.w + 1, h: CASTLE_FOOTPRINTS.keep.h + 1.5 });
    const well = layout.props.find((p) => p.id === "well")!;
    expect(spriteSizeFor(well)).toEqual({ w: 3.5, h: 3.5 });
    const oak = layout.props.find((p) => p.kind === "decor" && p.variant === "oak")!;
    expect(spriteSizeFor(oak)).toEqual({ w: 1.2, h: 1.6 });
    const rock = layout.props.find((p) => p.kind === "decor" && p.variant === "rock")!;
    expect(spriteSizeFor(rock)).toEqual({ w: 0.9, h: 0.9 });
  });
});
```

Create `src/lib/realm/tiles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { grassTile, cobbleTile, GRASS_COLORS, COBBLE_COLORS } from "./tiles";

describe("tiles", () => {
  it("paints deterministic grass of the right size from the grass palette", () => {
    const a = grassTile(7);
    const b = grassTile(7);
    expect(a).toEqual(b);
    expect(a).toHaveLength(32);
    expect(a.every((row) => row.length === 32)).toBe(true);
    expect(a.flat().every((c) => GRASS_COLORS.includes(c))).toBe(true);
    expect(grassTile(8)).not.toEqual(a);
    expect(grassTile(7, 16)).toHaveLength(16);
  });
  it("paints cobbles with mortar lines every eight pixels", () => {
    const t = cobbleTile(11);
    expect(t.flat().every((c) => COBBLE_COLORS.includes(c))).toBe(true);
    expect(t[0].every((c) => c === COBBLE_COLORS[0])).toBe(true); // top row is mortar
    expect(t.every((row) => row[8] === COBBLE_COLORS[0])).toBe(true); // a mortar column
    expect(t[4][4]).not.toBe(COBBLE_COLORS[0]); // inside a stone
    expect(cobbleTile(11)).toEqual(t);
  });
});
```

- [ ] **Step 5: Run them to verify they fail**

Run: `npx vitest run src/lib/realm/layout.test.ts src/lib/realm/tiles.test.ts`
Expected: FAIL (no decor, no `spriteSizeFor`, no tiles module).

- [ ] **Step 6: Decor spots, sprite sizes, tiles**

In `src/lib/realm/layout.ts`:

- `export type PropKind = "castle" | "building" | "foundation" | "path" | "villager" | "barrier" | "banner" | "decor";`
- Add `variant?: string; // decor kind (oak, pine, bush, rock, fence, lantern)` to `Prop`.
- Add after `BANNER_POLES`:

```ts
const DECOR_SIZE = { w: 0.9, d: 0.9, h: 1.4 };
/** Twelve fixed spots clear of the path corridor, every site (padded 2), the lap ring, and the ceremony plaza. */
export const DECOR_SPOTS: { kind: string; x: number; z: number }[] = [
  { kind: "oak", x: -15, z: 14 },
  { kind: "pine", x: 15, z: 14 },
  { kind: "bush", x: -4, z: 13 },
  { kind: "rock", x: 4.5, z: 12.5 },
  { kind: "fence", x: -16, z: 6 },
  { kind: "lantern", x: 16, z: 5 },
  { kind: "oak", x: -16, z: -4 },
  { kind: "pine", x: 16, z: -4 },
  { kind: "bush", x: -13.5, z: -14.5 },
  { kind: "rock", x: 14, z: -15 },
  { kind: "pine", x: -16, z: -18 },
  { kind: "oak", x: 16, z: -18 },
];

/** Billboard size for a prop drawn as a sprite: a little wider than its footprint and taller than its box, so roofs show. */
export function spriteSizeFor(prop: Prop): { w: number; h: number } {
  switch (prop.kind) {
    case "castle":
      return { w: prop.size.w + 1, h: prop.size.h + 1.5 };
    case "building":
      return { w: prop.size.w + 0.5, h: prop.size.h + 1 };
    case "decor":
      return prop.variant === "oak" || prop.variant === "pine" ? { w: 1.2, h: 1.6 } : { w: 0.9, h: 0.9 };
    default:
      return { w: prop.size.w, h: prop.size.h };
  }
}
```

- Add `decor?: boolean` to `buildWorldLayout`'s input, and before the `return` add:

```ts
  if (input.decor ?? true) {
    DECOR_SPOTS.forEach((spot, i) => {
      props.push({ id: `decor-${i + 1}`, kind: "decor", label: "", variant: spot.kind, position: { x: spot.x, z: spot.z }, size: DECOR_SIZE, color: "#2f7a3d", solid: false });
    });
  }
```

Create `src/lib/realm/tiles.ts`:

```ts
import { seededRng } from "@/lib/utils/drill-generators";

/** A tile is rows of colours; the adapter in tile-texture.ts paints it. Pure, so the grids are testable. */
export type Tile = string[][];

export const GRASS_COLORS = ["#2e5a3a", "#33633f", "#24492e", "#fde68a", "#f9a8d4", "#ffffff"];
const [GRASS_A, GRASS_B, TUFT, ...FLOWERS] = GRASS_COLORS;

/** Two greens in a soft checker, darker tufts, a few flowers. Same seed, same grass. */
export function grassTile(seed: number, size = 32): Tile {
  const rng = seededRng(seed);
  const grid: Tile = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const r = rng();
      if (r < 0.06) row.push(TUFT);
      else if (r < 0.072) row.push(FLOWERS[Math.floor(rng() * FLOWERS.length)]);
      else row.push((x + y) % 2 === 0 && r < 0.55 ? GRASS_A : GRASS_B);
    }
    grid.push(row);
  }
  return grid;
}

export const COBBLE_COLORS = ["#8f7d55", "#c9b27a", "#bda56f", "#d4bd85"];
const [MORTAR, ...STONES] = COBBLE_COLORS;
const STONE = 8;

/** Stones eight pixels wide with mortar lines between; each stone keeps one shade. */
export function cobbleTile(seed: number, size = 32): Tile {
  const rng = seededRng(seed);
  const across = Math.ceil(size / STONE);
  const shades = Array.from({ length: across * across }, () => STONES[Math.floor(rng() * STONES.length)]);
  const grid: Tile = [];
  for (let y = 0; y < size; y++) {
    const row: string[] = [];
    for (let x = 0; x < size; x++) {
      const mortar = x % STONE === 0 || y % STONE === 0;
      row.push(mortar ? MORTAR : shades[Math.floor(y / STONE) * across + Math.floor(x / STONE)]);
    }
    grid.push(row);
  }
  return grid;
}
```

Create `src/lib/realm/tile-texture.ts`:

```ts
import type { CanvasTexture } from "three";
import type { Tile } from "./tiles";

/** Paints a tile onto a canvas as a repeating, nearest-filtered texture. three loads only when the world opens. */
export async function tileToTexture(tile: Tile, pixel = 4): Promise<CanvasTexture> {
  const { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace } = await import("three");
  const canvas = document.createElement("canvas");
  canvas.width = (tile[0]?.length ?? 0) * pixel;
  canvas.height = tile.length * pixel;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("The ground could not be drawn.");
  tile.forEach((row, y) => row.forEach((color, x) => {
    ctx.fillStyle = color;
    ctx.fillRect(x * pixel, y * pixel, pixel, pixel);
  }));
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = NearestFilter;
  texture.minFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
```

- [ ] **Step 7: Run the tests, typecheck, commit**

Run: `npx vitest run src/lib/realm src/components/realm/world-figures.test.tsx` then `npx tsc --noEmit`
Expected: PASS; clean. (The recess gleam spawner treats non-solid props as free ground; a decoration under a gleam is cosmetic.)

```bash
git add -A src
git commit -m "feat(realm): pixel world figures, decor spots, sprite sizes, grass and cobble tiles" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Draw the pixel world — sprite pipeline and scene

**Files:**
- Modify: `src/lib/realm/layout.ts` (`WorldLayout.castleType`); Test: `src/lib/realm/layout.test.ts`
- Modify: `src/components/realm/sprite-source.tsx`; Test: `src/components/realm/sprite-source.test.tsx`
- Modify: `src/components/realm/realm-scene.tsx`
- Modify: `src/components/realm/realm-shell.tsx` (the memoised `world` prop); Test: `src/components/realm/realm-shell.test.tsx` (fake textures gain `world` and `tiles`)

**Interfaces:**
- Consumes (Task 4): `CastleFigure`, `BuildingFigure`, `FoundationFigure`, `DecorFigure`, `DECOR_KINDS`, `WORLD_SPRITE_SCALE`; `spriteSizeFor`, `Prop.variant`, `kind: "decor"`; `grassTile`, `cobbleTile`, `tileToTexture`; `svgElementToTexture(svg, scale)`.
- Produces: `WorldLayout.castleType: string`; `SpriteSource` prop `world?: { castleType: string; buildingIds: string[]; decor: boolean } | null`; `SpriteTextures.world: Record<string, THREE.CanvasTexture>` keyed `castle:{tier}`, `building:{id}`, `foundation`, `decor:{kind}`; `SpriteTextures.tiles: { grass: THREE.CanvasTexture; cobble: THREE.CanvasTexture } | null`.

The scene cannot run under Vitest (no WebGL); it is gated by typecheck, lint, and Task 6's browser pass. The sprite source and layout are tested.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/realm/layout.test.ts`:

```ts
describe("castle tier on the layout", () => {
  it("carries the castle type so the scene can pick its figure", () => {
    expect(buildWorldLayout({ ...none, castleType: "keep" }).castleType).toBe("keep");
    expect(buildWorldLayout({ ...none, castleType: "moon-base" }).castleType).toBe("campsite");
  });
});
```

In `src/components/realm/sprite-source.test.tsx`, add a mock beside the sprite-texture mock:

```ts
const tileToTexture = vi.fn();
vi.mock("@/lib/realm/tile-texture", () => ({ tileToTexture: (...a: unknown[]) => tileToTexture(...a) }));
```

set in `beforeEach`: `tileToTexture.mockImplementation(async (tile: string[][]) => ({ id: `tile:${tile.length}`, repeat: { set: vi.fn() }, dispose: () => {} }));`, and add:

```tsx
  it("rasterizes the world set at its own scales and paints the two tiles", async () => {
    const onReady = vi.fn();
    render(<SpriteSource config={DEFAULT_AVATAR} world={{ castleType: "keep", buildingIds: ["well", "mill"], decor: true }} onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    const textures = onReady.mock.calls[0][0];
    expect(textures.world["castle:keep"].id).toBe("keep");
    expect(textures.world["building:well"].id).toBe("well");
    expect(textures.world["building:mill"].id).toBe("mill");
    expect(textures.world.foundation.id).toBe("foundation");
    expect(textures.world["decor:oak"].id).toBe("oak");
    expect(textures.tiles.grass).toBeTruthy();
    expect(textures.tiles.cobble).toBeTruthy();
    const scaleOf = (figure: string) => svgElementToTexture.mock.calls.find((c) => (c[0] as SVGSVGElement).getAttribute("data-figure") === figure)?.[1];
    expect(scaleOf("castle")).toBe(8);
    expect(scaleOf("building")).toBe(6);
    expect(scaleOf("foundation")).toBe(4);
    expect(scaleOf("decor")).toBe(4);
  });
  it("skips decorations when the world asks for none", async () => {
    const onReady = vi.fn();
    render(<SpriteSource config={DEFAULT_AVATAR} world={{ castleType: "campsite", buildingIds: [], decor: false }} onReady={onReady} onError={() => {}} />);
    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
    expect(Object.keys(onReady.mock.calls[0][0].world).some((k) => k.startsWith("decor:"))).toBe(false);
  });
```

In `src/components/realm/realm-shell.test.tsx`, extend the sprite-source mock's `onReady({...})` object with `world: {}, tiles: null`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/realm/layout.test.ts src/components/realm/sprite-source.test.tsx`
Expected: FAIL (`castleType` undefined; no world textures).

- [ ] **Step 3: Layout and sprite source**

In `src/lib/realm/layout.ts`: add `castleType: string;` to `WorldLayout`, and in `buildWorldLayout` compute `const castleType = input.castleType in CASTLE_FOOTPRINTS ? input.castleType : "campsite";` (use it for `castleSize` too) and return `{ props, spawn: SPAWN, colliders: …, villagers, castleType }`.

In `src/components/realm/sprite-source.tsx`:

- Imports: `import { CastleFigure, BuildingFigure, FoundationFigure, DecorFigure, DECOR_KINDS, WORLD_SPRITE_SCALE } from "@/components/realm/world-figures";`, `import { grassTile, cobbleTile, type Tile } from "@/lib/realm/tiles";`, `import { tileToTexture } from "@/lib/realm/tile-texture";`, `import { WORLD_SIZE } from "@/lib/realm/layout";`.
- `SpriteTextures` gains `world: Record<string, THREE.CanvasTexture>;` and `tiles: { grass: THREE.CanvasTexture; cobble: THREE.CanvasTexture } | null;`.
- `textureFor` takes a scale: `async function textureFor(key: string, svg: SVGSVGElement, scale?: number)` and calls `svgElementToTexture(svg, scale)`.
- Add:

```ts
/** A grass tile spans two world units; the ground plane is WORLD_SIZE * 3 across. */
const GRASS_REPEAT = (WORLD_SIZE * 3) / 2;

async function tileTexture(key: string, tile: Tile, repeat: number): Promise<THREE.CanvasTexture> {
  const cached = getCachedTexture(key);
  if (cached) return cached;
  const texture = await tileToTexture(tile);
  texture.repeat.set(repeat, repeat);
  setCachedTexture(key, texture);
  return texture;
}
```

- Props: `world = null,` with type `/** When set, rasterizes the castle, the built buildings, the foundation, and (optionally) the decorations, and paints the ground tiles. Must be a stable (memoised) object. */ world?: { castleType: string; buildingIds: string[]; decor: boolean } | null;`.
- In the async body, after the castle-banner block:

```ts
      const worldTextures: Record<string, THREE.CanvasTexture> = {};
      let tiles: SpriteTextures["tiles"] = null;
      if (world) {
        const castleSvg = root.querySelector<SVGSVGElement>(`svg[data-figure="castle"][data-figure-id="${world.castleType}"]`);
        if (castleSvg) worldTextures[`castle:${world.castleType}`] = await textureFor(`castle:${world.castleType}`, castleSvg, WORLD_SPRITE_SCALE.castle);
        for (const id of world.buildingIds) {
          const svg = root.querySelector<SVGSVGElement>(`svg[data-figure="building"][data-figure-id="${id}"]`);
          if (svg) worldTextures[`building:${id}`] = await textureFor(`building:${id}`, svg, WORLD_SPRITE_SCALE.building);
        }
        const foundationSvg = root.querySelector<SVGSVGElement>('svg[data-figure="foundation"]');
        if (foundationSvg) worldTextures.foundation = await textureFor("foundation", foundationSvg, WORLD_SPRITE_SCALE.foundation);
        if (world.decor) {
          for (const kind of DECOR_KINDS) {
            const svg = root.querySelector<SVGSVGElement>(`svg[data-figure="decor"][data-figure-id="${kind}"]`);
            if (svg) worldTextures[`decor:${kind}`] = await textureFor(`decor:${kind}`, svg, WORLD_SPRITE_SCALE.decor);
          }
        }
        tiles = { grass: await tileTexture("tile:grass", grassTile(7), GRASS_REPEAT), cobble: await tileTexture("tile:cobble", cobbleTile(11), 1) };
      }
```

include `world: worldTextures, tiles` in the `onReady({...})` object, and add `world` to the effect's dependency array.

- In the hidden host, after the castle banner: `{world && <CastleFigure tier={world.castleType} />}`, `{world && world.buildingIds.map((id) => <BuildingFigure key={id} id={id} />)}`, `{world && <FoundationFigure />}`, `{world?.decor && DECOR_KINDS.map((kind) => <DecorFigure key={kind} kind={kind} />)}`.

Run: `npx vitest run src/lib/realm/layout.test.ts src/components/realm/sprite-source.test.tsx src/components/realm/realm-shell.test.tsx` → PASS.

- [ ] **Step 4: The scene**

In `src/components/realm/realm-scene.tsx`:

- Import `spriteSizeFor` from `@/lib/realm/layout` (extend the existing import).
- Add `const CALM_TINT = "#a9aaa4";` beside `CALM_FOUNDATION`.
- Replace `const buildingMeshes = useRef(new Map<string, THREE.Mesh>());` with `const buildingObjects = useRef(new Map<string, THREE.Object3D>()); // a sprite, or the fallback box mesh when its texture is missing`.
- Replace the rising block at the end of `useFrame` with:

```ts
    const r = rising.current;
    if (r) {
      const obj = buildingObjects.current.get(r.id);
      const k = Math.min(1, (performance.now() - r.startedAt) / RISE_MS);
      const s = 0.1 + 0.9 * easeOut(k);
      if (obj) {
        if (obj.userData.box) {
          obj.scale.y = s;
          obj.position.y = ((obj.userData.boxH as number) * s) / 2; // the box's centre rises with it, base on the ground
        } else {
          const h = obj.userData.h as number;
          obj.scale.y = h * s;
          obj.position.y = (h * s) / 2;
        }
      }
      if (k >= 1) rising.current = null;
    }
```

- Add a module-level label component (uses the already-imported `Html`):

```tsx
function PropLabel({ prop, y }: { prop: Prop; y: number }) {
  return (
    <Html position={[0, y, 0]} center zIndexRange={[10, 0]}>
      <span className="realm-label">
        {prop.label}
        {prop.tag && <span className="realm-label-tag">{prop.tag}</span>}
      </span>
    </Html>
  );
}
```

- In `World`'s render, add before the `return`:

```ts
  const tint = settings.calmPalette ? CALM_TINT : "#ffffff";
  const worldTex = (key: string): THREE.CanvasTexture | undefined => textures.world[key];
  const spriteFor = (prop: Prop): THREE.CanvasTexture | undefined => {
    if (prop.kind === "castle") return worldTex(`castle:${layout.castleType}`);
    if (prop.kind === "building") return worldTex(`building:${prop.id}`);
    if (prop.kind === "decor") return worldTex(`decor:${prop.variant ?? ""}`);
    return undefined;
  };
  const standing = layout.props.filter((p) => p.kind === "castle" || p.kind === "building" || p.kind === "decor" || p.kind === "barrier");
```

- Replace the ground mesh's material with `{textures.tiles ? <meshStandardMaterial map={textures.tiles.grass} color={tint} /> : <meshStandardMaterial color={ground} />}` (keep its geometry and pointer handler).
- Replace the whole `layout.props.filter((prop) => prop.kind !== "villager" && prop.kind !== "banner").map(...)` block with three blocks:

```tsx
      {layout.props.filter((p) => p.kind === "path").map((prop) => (
        <mesh key={prop.id} position={[prop.position.x, 0.03, prop.position.z]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[prop.size.w, prop.size.d]} />
          {textures.tiles ? <meshStandardMaterial map={textures.tiles.cobble} color={tint} /> : <meshStandardMaterial color={prop.color} />}
        </mesh>
      ))}
      {layout.props.filter((p) => p.kind === "foundation").map((prop) => (
        <group key={prop.id} position={[prop.position.x, 0, prop.position.z]}>
          <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[prop.size.w, prop.size.d]} />
            {worldTex("foundation") ? (
              <meshStandardMaterial map={worldTex("foundation")} color={tint} transparent alphaTest={0.1} />
            ) : (
              <meshStandardMaterial color={colorFor(prop)} />
            )}
          </mesh>
          <PropLabel prop={prop} y={0.8} />
        </group>
      ))}
      {standing.map((prop) => {
        const texture = spriteFor(prop);
        const { w, h } = spriteSizeFor(prop);
        const register = (obj: THREE.Object3D | null) => {
          if (prop.kind !== "building") return;
          if (obj) {
            obj.userData.h = h;
            obj.userData.box = !texture;
            obj.userData.boxH = prop.size.h;
            buildingObjects.current.set(prop.id, obj);
          } else {
            buildingObjects.current.delete(prop.id);
          }
        };
        if (texture) {
          return (
            <group key={prop.id} position={[prop.position.x, 0, prop.position.z]}>
              <sprite ref={register} position={[0, h / 2, 0]} scale={[w, h, 1]}>
                <spriteMaterial map={texture} color={tint} transparent alphaTest={0.1} />
              </sprite>
              {prop.kind !== "decor" && <PropLabel prop={prop} y={h + 0.4} />}
            </group>
          );
        }
        // No texture for this prop (a barrier, or a figure that failed to draw): the slice 4 box.
        return (
          <group key={prop.id} position={[prop.position.x, 0, prop.position.z]}>
            <mesh ref={register} position={[0, prop.size.h / 2, 0]}>
              <boxGeometry args={[prop.size.w, prop.size.h, prop.size.d]} />
              <meshStandardMaterial color={colorFor(prop)} />
            </mesh>
            {prop.kind !== "decor" && prop.kind !== "barrier" && <PropLabel prop={prop} y={prop.size.h + 0.6} />}
          </group>
        );
      })}
```

(The villager, banner, spell, recess and ceremony blocks stay as they are.)

- [ ] **Step 5: The shell's world prop**

In `src/components/realm/realm-shell.tsx`, after the `layout` memo:

```ts
  // Which world figures to rasterise; keyed by a string so a building completing is the only thing that changes it.
  const builtKey = kingdom.buildings.filter((b) => b.complete).map((b) => b.id).sort().join(",");
  const world = useMemo(
    () => ({ castleType: bundle.castleType, buildingIds: builtKey ? builtKey.split(",") : [], decor: !settings.calmPalette }),
    [bundle.castleType, builtKey, settings.calmPalette]
  );
```

and pass `world={world}` to `<SpriteSource …>`.

- [ ] **Step 6: Typecheck, lint, tests, commit**

Run: `npx tsc --noEmit` then `npx eslint src/components/realm src/lib/realm` then `npx vitest run src/components/realm src/lib/realm`
Expected: clean; PASS.

```bash
git add -A src
git commit -m "feat(realm): draw the world as pixel sprites with tiled ground and path" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Final verification and the browser pass

**Files:** none in the repo (scratchpad scripts only).

- [ ] **Step 1: Full verification**

Run: `npx tsc --noEmit`, `npx vitest run`, `npm run lint`, `npm run build`.
Expected: tsc clean; all tests green; lint shows only the pre-existing error in `src/components/quest-template-list.tsx`; the build succeeds with `/side-quests` in the route list and no `/deeds` route.

- [ ] **Step 2: Seed the demo hero**

With `PORT=3111 npm run dev` running from the main checkout (`.env.local` has `DEMO_MODE=true`), use a small libsql script against `local.db` (the previous slice's `db.mjs` in the earlier session's scratchpad runs one SQL statement; copy it and point it at `/home/kylee/projects/kingdoms-and-crowns/local.db`):

1. Insert earned minutes so Emma can enter: `insert into realm_play_ledger (id, child_id, date, kind, minutes, created_at) values ('seed-s8', 'demo-child-1', '<today ISO>', 'earned', 20, <epoch seconds>)`.
2. Confirm `select help_seen_at, starter_spell_at from realm_settings where child_id = 'demo-child-1'` returns nulls (or delete the row so it is recreated).
3. Confirm `select count(*) from spell where child_id = 'demo-child-1'` is 0 (delete any leftover test spells first).

- [ ] **Step 3: Pass as the hero**

With Playwright and the headless Chromium from the local screenshot setup, cookie `demo_persona=lily`:

1. Open `/realm`. Expected: the "How to play" dialog is open over the world; screenshot `s8-help.png`. The world is not interactive (no Talk bubble; `.realm-hud-minutes` reads "paused").
2. Close it. Expected: `realm_settings.help_seen_at` is now set; the world renders pixel art: a tent for the campsite, staked foundations with signs, cobbled path, grass, trees at the edges; screenshot `s8-world-campsite.png`. The spell bar shows "Ember Bolt, 10 mana" on page 1 and three "Empty" pages (`select count(*) from spell` is 1).
3. Click an empty page. Expected: the "Empty page" panel with "Open the Spellbook"; screenshot `s8-empty-hint.png`; Escape closes it.
4. Press `1`. Expected: page 1 selected, the toast "Tap or click where the spell should go, or press Space to aim at the nearest trouble.", the canvas cursor is a crosshair (`getComputedStyle(canvas).cursor === "crosshair"`).
5. Dispatch a `contextmenu` event on `.realm-root` via `page.evaluate` and assert `defaultPrevented`.
6. Right-click the ground with page 1 selected (`page.mouse.click(x, y, { button: "right" })`). Expected: a bolt flies (the spell layer draws it; verify via a screenshot two frames later or the mana bar dropping below 100).
7. Set the castle to a citadel (`update castle set type = 'citadel' where child_id = 'demo-child-1'`), reload, and screenshot `s8-world-citadel.png`; restore the castle type afterwards.
8. Open `/side-quests`. Expected: subject chips on every side quest, the filter row, the "How side quests make magic" frame with three lines; `curl -sI http://localhost:3111/deeds` returns 308 with `location: /side-quests`. Screenshot `s8-side-quests.png`.

- [ ] **Step 4: Pass as the parent**

Cookie `demo_persona=parent`, open `/realm?child=demo-child-1`. Expected: no help card opens by itself; the HUD note reads "You're looking at Emma's grounds. Spells, side quests and recess are theirs to play."; the `?` button opens the card; no spell bar. Open `/settings`, expand Emma's Realm settings, click "Show the how-to-play card again"; confirm `help_seen_at` is null again.

- [ ] **Step 5: Restore**

Delete the seeded ledger row and the seeded spell row (`delete from spell where child_id = 'demo-child-1' and slot = 1`), set `starter_spell_at` and `help_seen_at` back to null, restore the castle type, and stop the dev server (`fuser -k 3111/tcp`). Record the screenshot paths in the hand-off.
