# The Realm — Program Overview

**Date:** 2026-09-02
**Status:** Approved direction. Each slice below gets its own design spec and implementation plan.

## Why this exists

Kingdoms & Crowns tracks homeschool work as quests, XP, badges, avatars, companions, and castles.
The Realm adds a three.js world where those same heroes, companions, and castles come to life,
with a story that explains the app's name: a hero establishes a kingdom and earns a crown.

The idea was sparked by a Reddit demo ("Spellwright") where players prompt any spell into an LLM
and fight in a ThreeJS physics world. We keep the spirit (a personal spellbook, physics-lite spells,
a 3D world) and drop the LLM: spells are assembled from a fixed catalog of parts stored in the
database. That costs no tokens, is perfectly consistent, and cannot be prompt-injected.

## Story frame

- Every hero arrives in a Realm that has lost its Crown.
- A **season** is one grade year. During the season the hero helps the people of the Realm
  through **deeds**. Each deed raises the kingdom: a well, a mill, a bridge, a chapel, a market.
- Finishing the season earns the **Crown** of that year. A returning hero begins the next season
  with the kingdom they built, adds to it, and earns a grander crown. A K-to-12 learner ends with
  thirteen crowns and a citadel.
- Deeds are the story wrapper around a built-in drill bank (math facts, spelling, sight words,
  vocabulary, science facts) by grade band.
- **Recess** is free roam of the same kingdom, with spells for fun and a mount once earned.

## Decisions already made

| Topic | Decision |
|---|---|
| Education source | Built-in drill bank by grade band first; parent-authored question sets later using the same schema |
| Players | Single player. Social is async: leaderboards, castle visits, shared spell combos. No realtime server (the app runs on Vercel, which cannot host WebSockets) |
| Art | Existing pixel-art SVG avatars and companions rasterized to textures on camera-facing billboards inside a low-poly three.js world. No downloaded assets |
| Engine | react-three-fiber plus drei, orthographic fixed-angle "tabletop" camera, tap-to-move plus WASD plus on-screen stick, no physics engine. Loaded client-only by dynamic import |
| Access during the day | Parent configures per child: earned minutes per completed quest, scheduled recess blocks, or both; optional off-hours access; a daily screen-time cap always applies |
| Tone | Non-violent by default (shadow blobs, fog, cursed statues that "clear"; hero "loses focus" rather than dying). Parent toggle allows cartoon monsters |
| Accommodations | Toggles only, presets as shortcuts, no diagnosis label ever stored |
| Devices | Tablets and laptops, touch first. Low-poly budget for integrated GPUs |
| Spells | Combos of catalog parts (element, form, modifier). Unlocked through the existing free/level/badge/quest pattern plus drill mastery. No AI generation |
| Code principles | Rules in pure functions under `src/lib/utils/` with colocated tests written first. Server actions stay thin. One file per domain. Existing medieval vocabulary |

## Slices (each is its own spec, plan, and TDD cycle)

1. **Foundations** — level util, seasons and crowns, realm settings, recess blocks, learning profile,
   play-time ledger and access rules. No 3D. Spec: `2026-09-02-realm-foundations-design.md`.
2. **Spellbook** — spell parts catalog, combo rules, unlock sources, spellbook page in Loot.
3. **Drill bank and deeds** — seeded question sets, question engine that adapts to the learning
   profile, deed definitions that wrap question sets in story.
4. **Realm shell** — R3F world, avatar-to-sprite pipeline, hub, movement, touch input, accessibility
   settings applied to rendering, access rules enforced, play-time heartbeat. Preceded by a
   throwaway spike: one SVG avatar billboard in R3F on a tablet, to confirm the pipeline and frame rate.
5. **Deeds in the Realm** — NPCs, trials, spell casting, kingdom buildings appearing as deeds complete.
6. **Recess and mounts** — free-roam mode, mount catalog, mount sprites.
7. **Season's end** — crown ceremony, returning-hero carryover, yearly additions to castle and character.

## Repo facts that shape every slice

- XP is recomputed from activity counts plus `bonusXp`; anything derived must be ledger-based or
  follow the same "derived plus bonus" discipline or it will be silently zeroed.
- The level formula was inlined in eight places; slice 1 extracts it.
- All character art is inline SVG in `src/components/avatar.tsx` (1,757 lines); companions are a
  layer of that SVG, not an entity. Castles are eight tiers gated at level 50 and up.
- `schedule_block.subjectId` is NOT NULL and thirteen files assume it, so recess blocks live in
  their own table.
- Nothing in the app knows when a school year starts or ends; the `season` table introduces that.
- Accessibility today is three `prefers-reduced-motion` blocks and a forced dark theme.
