# The Realm Overhaul — the whole programme, in one place

**Date:** 2026-09-10
**Status:** Design complete. Thirteen slices, thirteen design specs, reconciled against each other. Implementation plans are written per slice, at build time.
**This document is for you.** The specs are for whoever builds each slice; this one is so you can see the shape of the thing you are buying, decide whether it is the right shape, and know what you are not getting.

---

## 1. Your verdict, which started this

> the world still looks pretty rough since the buildings are flat and its not clear that the clouds are enemies and the spell bar looks really rough and there are not slots for the mount. theres no way to get to spellbook from here and no quest log or tracking. no starting quest. no main tavern no tutorial. i dont like the location of the mana or player name/health. its really, really rough in a bad way and needs to improve a LOT. there should be an indicator over or under the character and names over NPCs and should be WAY more development in the world. also the castle looks like a TeePee. messages are left aligned rather than centered which is no good. this doesnt feel like a well thought out game at all.

## 2. What we found, in a paragraph

Eighteen complaints, six code audits, sixty-eight findings — and they turned out to be one problem seen from eighteen angles. The Realm has a genuinely good simulation underneath it and almost none of it reaches the player. The world never says what you are there to do; nothing on the screen is anchored to your hero or to the people standing around; and every channel a game normally speaks through — silhouette, ground contact, a name over a head, a marker, a slot, where a message appears, what happens when you hit something, sound — is either unused or pointed at the wrong object. Nine high-contrast labels float over scenery while the eight villagers and every enemy are anonymous. The one resource that never gates anything gets the biggest widget on screen, while the three states that actually stop you playing — being dazzled, casting, shielded — are invisible. The only route to the Spellbook disappears the moment a child achieves the goal we set them. The castle is literally a tent, and is a tent from level 1 to level 55 no matter how much schoolwork the child does. None of that is a missing feature; all of it is a presentation layer that was never built. So the programme rebuilds the channels the game speaks through, in an order where each slice makes the next one cheaper, and it adds as few new mechanics as it possibly can.

---

## 3. Your nine decisions, and what each one changed

| # | The decision | What it changed in the programme |
|---|---|---|
| **1** | **Plan the whole programme up front.** Design specs for every slice now; implementation plans per slice at build time. | Thirteen design specs exist and have been reconciled against each other — which is how we found that the same enemy-spawn rewrite was being written twice, the Tavern was sited on top of the Village Well, and the complexity axis had fragmented into four spellings. None of that survives to build time. Implementation plans stay per-slice because a plan citing `file:line` would be stale before its slice started. |
| **2** | **The full village**, not the scoped version. | Added two large slices (4 and 5) and pushed everything after them back. The four engineering objections became work: spawning moved off building foundations onto ten fixed zones so a finished kingdom keeps its enemies; the hero's unstick routine was rewritten to resolve every overlap instead of one; the ceremony walk and the recess lap were re-pathed onto the road; and the world's whole pixel budget was re-derived at the new camera zoom. The cost this created — a 20-second walk across town — is what makes decision 5 mandatory rather than optional. |
| **3** | **Clearing troubles earns Realm minutes**, never gates a side quest. | Slice 8 grew a whole economy half: one minute per clear, a new `bonus` ledger kind, and a per-day sub-cap that can never exceed the minutes the day's real schoolwork already earned. The help card's false promise — *"Clear troubles to protect the sites"* — is deleted in slice 1 and replaced in slice 8 with a sentence that is true. |
| **4** | **Kingdom progress drives the keep**; the cosmetic ladder becomes a skin. | Slice 10 is now a large slice. Five keep silhouettes driven by buildings raised, eight `CASTLE_TYPES` tiers preserved intact as liveries, and the `/castle` page recopied to "Choose your castle's colours". Nobody loses what they were saving toward, and nobody is shown a tent. |
| **5** | **The mount gets a job: fast travel.** | Slice 7 exists because of this. A hitching post at every district entrance, a real ride down the road at 2.2× the mount's speed, and the eight-tier ladder finally meaning something — 6.5 seconds against 4.0 on the longest route, printed on the row so a child can check it against the clock. The companion got an answer too: it became the living marker, and a slot on the bar that says what it is doing. |
| **6** | **Keep recess and fix it.** | Slice 12 exists because of this. Gleams and lap times persist in a new table; the lap is a real 128-unit circuit on the road (laid in slice 4, at the length slice 12 needs) with eight lit posts and a pace ghost of the child's own best; and mounted and on-foot records are kept apart so a pony can never erase a six-year-old's own time. |
| **7** | **One Realm that grows with the player.** | The single most cross-cutting decision. Slice 1 publishes a closed thirteen-field contract (`Surfaces`) that every other slice reads and none may extend: pips or numerals, one tracked objective or three, earned slots or all, and so on. Depth is never a word a child reads, and every simple-depth surface is a **substitution**, never a removal. Slice 9 turns completing the tutorial into a five-second "the Realm opens up" beat that names only the surfaces that actually changed. |
| **8** | **A Tavern board only** — no visitable sibling realms. | Slice 6 ships a read-only family board (*"Emma raised the Mill yesterday"*) behind the existing family-read permission, with no minutes, no XP, no quest titles and nothing to visit. Refused permanently, not deferred. |
| **9** | **Attribution** — *"Raised by Emma · Spring 2026"* on a finished building. | **Recommended, and taken.** It is the strongest emotional payoff in the programme and it costs two nullable columns. It is designed to degrade: the name is **snapshotted at completion** so renaming a hero never rewrites history; the season is **derived, never stored**, from the date plus the family's own timezone, so a southern-hemisphere family does not read "Spring" in September and a fix later corrects every stone retroactively; a hero with no snapshot falls back to the live name and then to a bare `Raised.`; and a hero **shared between two children** — the realistic homeschool case — gets **one** name on every stone, the hero's, because that is what the app's data actually knows. The line lives in exactly one place: line 3 of the building's signboard. |

---

## 4. The thirteen slices

Effort is honest: **small** ≈ 1–2 days, **medium** ≈ 3–5 days, **large** ≈ 1.5–2.5 weeks, at part-time pace.

| # | Slice | What you get | Effort | Depends on | Spec |
|---|---|---|---|---|---|
| 1 | **It's a game now** | A gold ring under your hero with a facing notch, real contact shadows so nothing floats, names over all eight villagers with what each one is waiting for, one starting quest with a beacon and an off-screen arrow, and every message centred instead of stacked in the corner. The fake scoreboard goes. The app chrome stops floating over the game board. Also the programme's two contracts: the complexity axis, and the fix for the play-clock leak. | large | — | [first-impression](./2026-09-10-realm-first-impression-design.md) |
| 2 | **Stop looking rough** | The mechanical cause of "rough", fixed: one integer pixel per art pixel at both screen densities, mipmapped ground that stops shimmering, trees taller than the person walking past them, sprites standing on the ground instead of hovering. Plus `/dev/figures`, the gallery that turns the art work from one blind pass into ten fast ones. | medium | 1 | [sprite-budget-and-gallery](./2026-09-10-realm-sprite-budget-and-gallery-design.md) |
| | **▸ CHECKPOINT 1** | **You replay and re-judge "really, really rough".** See §8. | | | |
| 3 | **The ability bar, and the mount finally exists** | The bottom of the screen becomes one control surface: fixed square slots with the cost always visible, genuinely-empty sockets that stop pretending to be abilities, a cast-progress sweep, mana hugging the bar instead of a corner meter, a mount slot that is there even when empty with a picker over what you have earned, and a Spellbook button that can never disappear. | large | 1, 2 | [ability-bar-and-mount-slot](./2026-09-10-realm-ability-bar-and-mount-slot-design.md) |
| 4 | **The village takes shape** | Eight named districts, six streets with a door for every building, three paved plazas, a town wall with a gate, and a river with two crossings so the River Bridge is finally a bridge. The camera moves in so the world is bigger than the screen. Zero new drawings. | large | 1, 2 | [village-ground](./2026-09-10-realm-village-ground-design.md) |
| 5 | **The village fills up** | About ninety-six of people's things — stalls, crates, carts, washing lines, hedges, orchards — seeded per child so every town is that child's town, a built-out Market Plaza, carved wooden district signs that tell you where you are and can be tapped to hear it again, a painted river with banks and reeds, and one palette every figure draws from. Calm mode stops emptying the world and starts muting it. | large | 2, 4 | [village-life](./2026-09-10-realm-village-life-design.md) |
| | **▸ CHECKPOINT 2** | **You replay and re-judge "WAY more development in the world".** See §8. | | | |
| 6 | **Doors, the Tavern, and an honest way out** | The rest of the app becomes places you walk into. A Tavern beside the gate whose door shows today's quests and then ends your visit; the Keep's door opens your kingdom; the Library's door opens the Spellbook once it is built. The underlined gold link on grass is deleted. And the Tavern page finally hears of the Realm, with a family board of who raised what. | medium | 1, 3, 4, 5 | [doors-and-the-tavern](./2026-09-10-realm-doors-and-the-tavern-design.md) |
| 7 | **The mount gets a job** | Hitching posts at every district entrance, a real ride down the road with the camera pulled back, and a printed second count on every destination so "the Stag is faster" is something a child can check. The companion stops being scenery: it walks to what you are meant to be doing and waits there. | large | 3, 4, 6 | [fast-travel-and-the-companion](./2026-09-10-realm-fast-travel-and-the-companion-design.md) |
| 8 | **Enemies you can read, and combat that pays** | The cloud gets a face. All three troubles get an outline, a shadow, a name over them and a reserved violet that appears nowhere else in the world. Hitting something flashes, cracks and knocks it back; killing it has a death beat; the 1.5-second dazzle becomes something you can see. Every cue has a non-motion version, because today reduced-motion erases 100% of combat feedback. And clearing pays Realm minutes. | large | 1, 3, 4, 5 | [troubles-that-read-and-pay](./2026-09-10-realm-troubles-that-read-and-pay-design.md) |
| 9 | **Sound, and a first five minutes** | Twenty-four short, soft, quiet cues — the feedback channel your settings page has been promising parents while the codebase contained no audio at all. Plus an eight-step walkthrough that gates on **doing** (moved, reached, opened, finished a side quest, watched it rise, met a trouble, cleared it), budgeted at 43 seconds, persisted so a five-minute grant can interrupt it. Finishing it is what opens the Realm up. | medium | 1, 3, 4, 6, 7, 8 | [sound-and-first-five-minutes](./2026-09-10-realm-sound-and-first-five-minutes-design.md) |
| | **▸ CHECKPOINT 3** | **You judge the first five minutes with a real child.** See §8. | | | |
| 10 | **Plots, signs, and a keep that is not a tent** | Every finished side quest changes the ground: four drawn plot stages instead of one dark diamond. The keep grows through five silhouettes as you raise the eight buildings, with your chosen castle tier as its livery. And the nine floating white-on-black pills — the highest-contrast objects in both your screenshots — are deleted and replaced with wooden signboards in the world. | large | 1, 2, 4, 5 | [plots-signs-and-the-keep](./2026-09-10-realm-plots-signs-and-the-keep-design.md) |
| 11 | **The building redraw** | "The buildings are flat" stops being true. Sixteen figures redrawn in real 3/4 isometric — a roof plane, a lit wall, a shaded wall, a door you could walk through — with one baked sun across the whole set. The mechanical blocker is fixed first: today's sprite box is 24% too narrow for a correct isometric base to fit in it, which is why nobody could have drawn one. | large | 2, 4, 5, 10 | [building-redraw](./2026-09-10-realm-building-redraw-design.md) |
| 12 | **Recess that counts** | Gleams and lap times survive the visit. A 128-unit course on the road with eight lit posts and a start arch on the Market Plaza, a ghost of your own best pace to chase, mounted and on-foot records kept apart, and a long-arc sink: lamps along the road that light as you collect. | medium | 1, 4, 5, 6, 7 | [recess-that-counts](./2026-09-10-realm-recess-that-counts-design.md) |
| 13 | **The record of the work** | The kingdom becomes a shape a child can hold: twenty side quests raise it, not forty runs drawn from twenty stories. Per-quest checkmarks and a *Continue* label. Villagers stop begging for a well they already have. A real ceremony at 8 of 8. "Raised by Emma · Spring 2026" on every finished building. A session summary at the door, and a Realm panel for you showing minutes against side quests over time. | large | 1, 4, 6, 8, 10, 11, 12 | [record-of-the-work](./2026-09-10-realm-record-of-the-work-design.md) |

### Why this order and not another

Three sequencing rules are load-bearing and the rest follows from them.

1. **The sampling fix lands before any art is redrawn.** Slice 2 before slices 5, 10 and 11. Redrawing sixteen figures at today's 2.7×–5.3× point-sampled minification means drawing them twice.
2. **The markers land before the camera moves.** Slice 1 before slice 4. Slice 4 shrinks the frame to about 13% of the world; a smaller frame without an off-screen objective arrow is how you lose a six-year-old.
3. **The town plan lands before anything is sited on it.** Slice 4 before 5, 6, 7, 10, 12 and 13. Six slices put something at a coordinate, and there is exactly one table of coordinates.

Slice 1 is first because it alone is built to flip your headline verdict. Slice 13 is last because it depends on six other slices and because its schema change is the one genuinely dangerous migration in the programme.

---

## 5. Your eighteen complaints, and where each is answered

| Your words | Answered by |
|---|---|
| *the world still looks pretty rough* | **Slice 2** fixes the mechanical cause — every figure is sampled at a non-integer ratio with no mip chain, which is why a flag pole is 1 pixel on one frame and 2 on the next. Then **4** (a town instead of a lawn), **5** (a palette, a river, ninety-six props), **10** (ochre plots, no floating pills) and **11** (the redraw) carry it the rest of the way. |
| *the buildings are flat* | **Slice 11.** All eight plus the Tavern and the keep redrawn in true 3/4 isometric with a roof plane, a lit and a shaded face, and one sun. Prepared by **1** (contact shadows that are footprint diamonds, not bars) and **2** (baseline anchoring, per-building heights). |
| *its not clear that the clouds are enemies* | **Slice 8.** The Fog is redrawn with a face; all three get an ink outline, a ground shadow, a name over them, and a violet that a colour-separation test guarantees appears nowhere else in the world. One rule a child learns once. |
| *the spell bar looks really rough* | **Slice 3.** Fixed 56-px square slots, cost always visible, real recessed empty sockets, a cast-progress sweep, one scale knob instead of two incompatible ones, a measured bar height instead of four hand-tuned offsets. |
| *there are not slots for the mount* | **Slice 3** (a mount slot after a divider, present even when empty, with a picker over what you have unlocked) and **7** (it gets a job). |
| *theres no way to get to spellbook from here* | **Slice 3** (a permanent Spellbook button that can never disappear) and **6** (the Library's door opens it, so it is also a place). Today the only link is two interactions deep inside a hint that only an *empty* slot can open — fill your pages, which is the goal we set, and it becomes unreachable. |
| *no quest log or tracking* | **Slice 1** (an objective card, and site state on every villager's nameplate), **6** (the Keep's door opens the whole kingdom, eight rows in objective order), **10** (plots that visibly rise and signboards you can read), **13** (per-quest checkmarks, a *Continue* label, and the session summary). |
| *no starting quest* | **Slice 1.** One objective, picked by the same rank the Side Quests page already uses, with a gold beacon on the site, a gold `!` on the villager, and a screen-edge arrow when it is off camera. A brand-new hero always gets the Village Well, so the opening is identical every time. **Slice 9**'s walkthrough then walks them to it. |
| *no main tavern* | **Slice 6.** A 7×6 inn east of the Kingsway, 1.5 seconds from where you land, whose door shows today's quests and ends the visit. Plus a Realm card on the Tavern page, which today has zero awareness the Realm exists. |
| *no tutorial* | **Slice 9.** Eight steps that gate on doing rather than on reading and clicking Close, 43 seconds of a five-minute grant, persisted so being interrupted does not lose it. |
| *i dont like the location of the mana or player name/health* | **Slice 1** (the corner scoreboard deleted, hero identity on a real plate), **3** (mana moved to hug the ability bar where the costs are), **8** (the ruling that **there is no hero health** and we are not adding one — what happens to your hero is the 1.5-second dazzle and the shield, and both now show on the plate, so the question gets an answer instead of a missing bar). |
| *there should be an indicator over or under the character* | **Slice 1.** A gold ground ring with a notch showing which way you face, plus a contact shadow that stays on the ground while the sprite bobs above it — which is the detail that turns "floating" into "hopping". |
| *names over NPCs* | **Slice 1.** From a label the code already builds and the scene already throws away one line before the screen, anchored to the live sprite so the crown ceremony does not detach all eight. **Slice 8** adds threat plates over the enemies. |
| *should be WAY more development in the world* | **Slices 4 and 5** — the two large slices your decision 2 bought. Eight districts, six streets, three plazas, a wall and a gate, a river with two crossings, ninety-six seeded props, carved signs. Then **6** (the Tavern), **10** (plots and a growing keep) and **13** (an 8-of-8 completion). |
| *the castle looks like a TeePee* | **Slice 10.** Five stages driven by buildings raised, from stone-and-scaffolding to a citadel. Never a tent at any stage. Your cosmetic tiers survive as its colours. |
| *messages are left aligned rather than centered which is no good* | **Slice 1.** Two centred lanes, one message at a time, under an explicit priority — and the underlying bug fixed too: today ceremony narration and spell notices share one variable and silently suppress each other, so centring alone would have dropped the same messages in a nicer place. |
| *its really, really rough in a bad way and needs to improve a LOT* | **Slices 1 and 2 together** are designed to flip this, and **Checkpoint 1** is where you re-judge it. |
| *this doesnt feel like a well thought out game at all* | **Slice 1** alone is built to answer this: you can see which figure is yours, the people have names and one of them is waiting, you know where to go, and the game speaks to you in the middle of the screen. **8** (combat that responds), **9** (onboarding and sound) and **13** (a long arc and a report) are what keep it answered. |

---

## 6. The things that run through every slice

Seven contracts are shared. Each has exactly one owner, and the reconciliation pass that produced this roadmap existed largely to make that true.

| Contract | Owner | The rule |
|---|---|---|
| **The complexity axis** (`Surfaces`) | Slice 1 | **Thirteen fields, closed.** `numerals`, `trackedObjectives`, `abilitySlots`, `keycapHints`, `listRows`, `districtDetail`, `fastTravel`, `troubleNames`, `troubleDetail`, `troubleHitPips`, `clearCount`, `bountyLedgerLine`, `lapTimes`. No later slice adds a field; a slice that wants a fourteenth amends slice 1's spec first. Depth is never a word a child reads, and every simple-depth surface is a substitution. |
| **The town plan** (`village.ts`) | Slice 4 | One coordinate table, one footprint table, one road graph. Six slices site things on it and none of them invents a name. Its §8.1 is frozen before slice 5 begins, with a reconciliation table listing every name a later spec reached for and what it gets instead. |
| **Open ground** (`open-ground.ts`) | Slice 4 | Ten rectangular spawn zones with weights, three rule sets (troubles, gleams, decor), two placement functions. Troubles, gleams and props all ask the same module what "open" means. |
| **The figure catalog** | Slice 2 | Every drawn thing is a catalog row — never a hand-tuned case in `spriteSizeFor`. A row gets you the gallery, the raster budget and the pixel-grid test for free. Keys are always `family:id`. |
| **The palette** (`palette.ts`) | Slice 5 | One module: ground, props, accents, shadow, buildings, and the lit/mid/shade material ladder slice 11 draws from. Two tests enforce it — nothing may collide with the grass, and nothing may collide with the enemy violet. A colour written inline in a figure fails the build. |
| **The metered clock** | Slice 1 | Minutes are earned from schoolwork and spent by the clock. **Every** unmount charges the minute in progress at 30 seconds or more, so leaving cannot be farmed. **No later slice adds a second rounding rule.** The only interruption forgiven is the side-quest panel, because that is real schoolwork. |
| **Sound cues** | Slice 9 | Twenty-four ids, camelCase, each with a wave, a frequency, a duration, a peak and a calm-mode variant. Four earlier slices reserve ids; **a reserved id with no cue row fails the build**, so a promised sound can never silently not exist. |

Two more rules apply everywhere and are worth stating plainly:

- **A spec that republishes a type it did not originate must show the full accumulated shape and diff it against the previous version.** This is how `PropKind` nearly lost the river, and how the cast-progress sweep nearly lost the field it runs on.
- **Migration numbers are the tool's, never a spec's.** The last committed migration is `0025`. Seven slices take one — 1, 7, 8, 9, 10, 12, 13 — so they will be numbered 0026 to 0032 in build order. Every spec records the number the generator actually produced, and every one of the seven runs the same five-step verification rather than trusting the silent post-commit hook.

---

## 7. What the whole programme is deliberately **not** doing

Named so none of these is a surprise later.

**Refused outright, for the life of the programme:**

- **Hero health.** There is no health in this game and we are not adding one. What happens to your hero is a 1.5-second dazzle and a shield, and slice 8 makes both visible on the hero's plate. Your complaint gets an answer rather than a bar you keep looking for.
- **Visitable sibling realms.** Your decision 8. A shared board, not a shared world.
- **A pause or main menu.** The exit is two doors in the world, which is better for a six-year-old than a menu; and the only interruption the clock forgives is a child doing actual schoolwork. A pause button for standing still would turn a five-minute grant into an unbounded one.
- **Returning to where you left off.** Every visit starts at the gate, facing the town, with the Well on one hand and the Tavern on the other — 2.6 seconds from the first objective, identical every time. That opening is worth more than the walk it saves, and fast travel already saves the walk.
- **A sky or a horizon.** The camera is clamped so the ground plane's edge is never in shot. The town wall is the edge of the world, permanently.
- **New mechanics generally.** Mounted combat, mount stamina, a map screen, a minimap, elevation, weather, day and night, building interiors. The brief's direction is that we make the existing mechanics readable, and thirteen slices of that is already a lot.

**Out of scope but genuinely wanted, and named with what it would cost:**

- **Ambient life — two or three villagers wandering the streets.** Costed inside slice 5 at about half a day (one sprite kind, no new pathing, routes the road-graph test already proves walkable) and held as the second of three named levers if Checkpoint 2 still reads thin. Not scheduled.
- **World animation** — chimney smoke, turning mill sails, flickering lanterns. Only the reeds and the washing line move. Smoke and sails belong to the buildings that emit them, which means slice 11, which is already the largest hand-authoring bill in the programme.
- **A family-wide dashboard.** A parent with no hero selected sees no Realm surface at all. Slice 13 gives you a per-child Realm panel; a roll-up across three children is a separate, larger design.
- **A per-hero opt-out from the family board.** Ruled out with reasons in slice 6 rather than left open: the board shows one fact per row that the Chronicle already shows you, and a hidden hero makes the board lie by omission. If you want one it is a column, a control and a filter, in its own slice.
- **A hemisphere override.** The season is derived from your family's timezone, so it will be right. What you cannot do is override it, or ask for "Fall" instead of "Autumn". Because nothing stores the phrase, adding that later corrects every stone retroactively.

---

## 8. The three checkpoints, and what happens if one fails

A checkpoint is **you playing and re-judging**, not a test suite. Three of them, and — because decision 1 means eleven specs downstream are already written when the first one fires — each needs a stated failure protocol, or a bad checkpoint turns into an unbudgeted redesign.

| | After | The question | If the answer is no |
|---|---|---|---|
| **1** | Slice 2 | *Is it still "really, really rough"?* Same-framing before/after of the two views you photographed. | This is a **mechanical** question with mechanical levers, so a failure is tuning, not redesign: the pixel-per-art-pixel ratio, the tile period, the ground's mip and anisotropy settings, and the scale ladder. Budget **2–3 days** and re-shoot. It does **not** invalidate slices 3–13. Two of your complaints are knowingly still true here — the castle is still a tent and the nine label pills are still on screen — because both are slice 10's, and fixing them earlier means doing them twice. |
| **2** | Slice 5 | *Is there "WAY more development in the world"?* | Three levers, in order, all costed before the checkpoint so none is invented under pressure: **(a)** raise `PROP_BUDGET` and rebalance the per-district quotas — hours; **(b)** add the two wandering villagers slice 5 costed — half a day; **(c)** author more prop kinds — days each. Budget **up to 1 week**. This checkpoint can also legitimately **re-order** what follows (pulling slice 10 or 11 forward if the world reads structurally fine but visually poor), which costs nothing but changes what the specs assume about build order — and the specs' interface sections are written to survive re-ordering, which is what the reconciliation was for. |
| **3** | Slice 9 | *Does a real child get through the first five minutes?* Watched, on a tablet, with a stopwatch. | The lever is **copy and step budgets**, not architecture: the tutorial is a pure step machine with per-step budgets, so cutting or merging steps is an afternoon. Budget **2–3 days**. If a step fails because the thing it teaches is unclear (riding, a door, a trouble), the fix belongs in that thing's slice as a follow-up, not in the tutorial. |

**The rule that makes a failed checkpoint affordable:** a checkpoint may change the *plan*, but it may not change a *published contract* without an explicit amendment pass. The seven contracts in §6 are what the eleven downstream specs are written against. Re-tuning a prop budget, re-ordering two slices, or rewriting a tutorial step touches no contract and costs days. Changing what `Surfaces` contains, or where the town's coordinates live, touches all of them — so that is an amendment to slice 1's or slice 4's spec first, and a re-read of the specs that consume it second. That pass is **about a day** and it is the honest price of having planned the whole thing up front.

---

## 9. The honest total

| | |
|---|---|
| **Thirteen slices** | 7 large, 6 medium |
| **Build time** | **11–14 weeks of part-time work**, not counting checkpoints |
| **Checkpoint response** | **up to 2 weeks** across the three, if all three need work |
| **Realistic total** | **three to four months**, part-time |

Where the money goes, and it is worth knowing before you start:

- **The single largest and least verifiable cost is slice 11** — sixteen hand-authored figures whose only real acceptance criterion is you looking at them. `/dev/figures` (built in slice 2, for this reason) turns that from one blind pass into ten fast ones, but no unit test can judge whether something looks like a chapel.
- **Slice 10 draws the keep twice.** Five silhouettes hand-authored there, then redrawn as a seven-piece kit in slice 11. That is deliberate — slice 10 needs a keep that is not a tent before slice 11 exists, and slice 11 needs a kit before five stages × eight liveries is affordable at all — but it is real work done twice on the single most visible object in the game.
- **Decision 2 cost about two large slices** and pushed everything after them back by roughly three weeks. It also created the traversal problem that made slice 7 mandatory. You accepted that trade knowingly; this is what it came to.
- **Slice 1 is deliberately over-invested.** It is large, it is first, and it is designed so that on its own it changes the answer to *"this doesn't feel like a well thought out game at all."* If only one slice ever ships, it should be that one.

---

## 10. Three things we still need from you

1. ~~**Is twenty side quests the right length for the kingdom?**~~ **DECIDED 2026-09-11: twenty side quests.** Slice 13 lowers every building to its real story count (3/3/2/3/2/3/2/2) so no child ever replays a story to finish a building. The kingdom is twenty side quests and finishes in seven to ten weeks at two or three a week, after which the world runs on slice 8's troubles and slice 12's laps. Authoring twenty more stories stays available later as content work, outside this programme. Original text follows.

   **Is twenty side quests the right length for the kingdom?** Slice 13 lowers every building to its real story count — 3/3/2/3/2/3/2/2 — because today all eight demand five runs while only twenty distinct stories exist, so four buildings can *only* be finished by replaying the same two stories. That is the right fix for the replay wall. But it means the whole kingdom is **twenty side quests**, and at two or three a week a child finishes it in **seven to ten weeks**, after which the world runs on slice 8's troubles and slice 12's laps. The alternative is **writing the twenty missing stories** so every building has five — real curriculum content, four buildings × two or three stories each, and no slice in this programme authors it. **This needs your answer before slice 13, and it is a content decision, not an engineering one.**

2. **Look at `/dev/figures` at the end of slice 2, and again at the end of slice 5.** The art direction is settled in the specs — pixel art on a coarse grid, everything structural on whole pixels, one baked upper-left sun, warm palette, antialiasing confined to the isometric diagonals that cannot be on a grid — but "settled in a spec" and "you like it" are different things, and slice 11 is the expensive one to get wrong. If after slice 5 the buildings and the props read as two different media, the fix is to hand-step the diagonals, and that is about a week. Better to know at slice 5 than at slice 11.

3. **Confirm the bounty cap.** Slice 8 defaults to **five bonus minutes a day** from clearing troubles, on top of what quests earn, and it is bounded so it can never exceed the minutes the day's real schoolwork already earned — at any cap you set. Five is deliberately modest. It is one number in one column and you can change it in the settings panel, but it is worth deciding what you *want* before a child learns the old one.
