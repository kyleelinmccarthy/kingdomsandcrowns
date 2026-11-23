# Landing page: Realm showcase

**Date:** 2026-11-23 · **Base:** `dev` (Realm learning-woven-in and keybinds merged)
**Owner's request:** "update the main landing page to include info about the new Realm addition." Principles: SOLID, DRY, KISS, configurability, dynamicness, scalability, security, sturdy long-term architecture.
**Size:** a small change.

## Why

The marketing landing (`src/components/marketing/landing.tsx`) sells quest tracking, records and rewards, but never mentions the Realm, the 3D game that is now the biggest reason a student wants to log in. Visitors deciding whether to request access should see it.

## What the owner decided

| Question | Decision |
|---|---|
| Prominence | Its own showcase section between "How it works" and the feature grid, plus a one-line mention in the hero copy. |
| Visuals | Real game screenshots: one large, two small. |
| Message | All four points: learning is the game; schoolwork builds a kingdom; play time is earned; parents stay in control. |
| Status | Presented as available now (no "coming soon", no "new" badge). |
| Build | Approach A below. |

## Goals, non-goals, anti-goals

- **Goal:** a visitor understands in one screen what the Realm is and why it helps their homeschool, and sees the real game.
- **Non-goals:** no changes to the `/how-it-works` walkthrough; no carousel or interactive media; no new routes.
- **Anti-goals:** claims the code doesn't back up (every point below was checked against the schema and specs on 2026-11-23); client JavaScript added to the landing page; the screenshots turning into a one-off nobody can reproduce.

## Approaches

- **A. Component plus config (chosen).** `realm-showcase.tsx` renders the section from a typed config in `realm-showcase-data.ts`, the same split as `walkthrough.tsx` / `walkthrough-data.ts`. `landing.tsx` gains one line. The Realm shots are added to `scripts/capture-screens.mjs` so one command recaptures them. Chosen for single responsibility, copy edits in one place, and screenshots that can be reproduced.
- **B. Inline in `landing.tsx`.** Smallest diff, but the file grows to about 350 lines and the screenshots become a one-off.
- **C. Client carousel.** Shows more shots but adds client JS and interaction code to the landing page for little gain.

## Design

**Placement:** `<Hero> · <Divider> · How it works · **Realm showcase** · Features · Divider · Built for parents · Footer`.

```
┌──────────────────────── THE REALM ────────────────────────┐
│          A kingdom built by learning (page-title)          │
│   Every hero gets a 3D world to explore. … (subline)       │
│ ┌──────────────── large shot: the village ───────────────┐ │
│ │                                                        │ │
│ └────────────────────────────────────────────────────────┘ │
│ ┌──── small: learning ────┐  ┌── small: earned time ───┐   │
│ └─────────────────────────┘  └─────────────────────────┘   │
│  ◆ Learning is the game        ◆ Schoolwork builds a kingdom│
│  ◆ Play time is earned         ◆ Parents stay in control    │
└────────────────────────────────────────────────────────────┘
```
On mobile everything stacks in one column. Frames, gold icons and type reuse the landing's existing `FRAME` / icon / `page-title` styling. Shared style constants (`FRAME`) move to a small module both files import, so they aren't duplicated.

**Config (`realm-showcase-data.ts`):** `eyebrow`, `title`, `subtitle`, `points: { icon: GameIconName; title; body }[]`, `shots: { src; alt; width; height }[]` (first = large). Shot paths are built from `SCREENS_REV` (shared with the walkthrough) so a recapture lands on a fresh, un-cached URL.

**Draft copy** (the builder may tighten wording, not claims):
- Eyebrow: *The Realm* · Title: *A kingdom built by learning*
- Subtitle: *Every hero gets a 3D world to explore. The schoolwork they finish raises their kingdom, and the skills they practise are how the game is played.*
- **Learning is the game:** students measure to build, follow reading clue trails, craft spells from spelling runes, and crack logic locks, matched to their grade from K to 12.
- **Schoolwork builds a kingdom:** finished quests earn materials for new wings and upgrades. Each grade year is a season, and finishing it earns that year's Crown.
- **Play time is earned:** a small free allowance every day, more minutes for stars earned on side quests, and unspent time banks for tomorrow.
- **Parents stay in control:** you set every number: the daily cap, off-hours access, and how minutes are earned. Gentle and non-violent by default, with accessibility options.
- Hero copy gains a sentence pointing at the Realm.

**Screenshots:** 3 JPGs in `public/marketing/screens/<SCREENS_REV>/` (`realm-village`, `realm-learning`, `realm-earned-time`), captured by `scripts/capture-screens.mjs` in demo mode as a parent visitor (`/realm?child=demo-child-1`, never gated) or the locked gate for the earned-time shot. The script uses swiftshader WebGL args and a longer settle wait for these shots, and drives the game only with keys and `page.evaluate`. It **never clicks the canvas** (pointer lock has crashed WSL here). Alt text describes what's shown.

**Tests:** `realm-showcase.test.tsx` renders the section from its config: the title, all four points and each image with non-empty alt text. The landing renders the section.

## Left to the builder

Exact camera, steps and scene for each shot; icon choice per point; final copy wording within the claims above; whether `SCREENS_REV` bumps (only if existing shots are recaptured).
