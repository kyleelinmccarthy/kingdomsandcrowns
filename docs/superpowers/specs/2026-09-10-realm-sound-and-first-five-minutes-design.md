# Sound, a first five minutes that gates on doing, and the Realm opening up

**Date:** 2026-09-10
**Status:** Design spec. Written up front per decision 1; the implementation plan is written at build time, after slices 1–8 have landed and their file:line facts are real.
**Programme:** *The Realm: Presentation Overhaul* (`docs/superpowers/specs/2026-09-10-realm-presentation-overhaul-brief.md`). Slice 9 of 13, effort **medium**.
**Depends on:** 1 `first-impression`, 3 `ability-bar-and-mount-slot`, 6 `doors-and-the-tavern`, 7 `fast-travel-and-the-companion`, 8 `troubles-that-read-and-pay`.
**Consumed by:** 12 `recess-that-counts` (cue ids, the depth flip), 13 `record-of-the-work` (cue ids, `tutorialDoneAt`, the depth flip).
**Decisions applied:** **D7** — the complexity axis flips here, as a visible moment, with three written anti-patronising guarantees. **D3** — the "meet a trouble" step teaches a real reward instead of the false protection promise.

**Why this slice is late, stated once and then not repeated.** A tutorial teaches the shape of the game. In the brief's draft this was slice 6 of 9. Between then and now the shape moves under it four times: the ability bar is rebuilt in slice 3, the world becomes a village with districts and roads in 4–5, the exits become doors in 6, riding becomes fast travel in 7, and combat gains a reward in 8. A tutorial written at draft-position 6 would have taught a bar that no longer exists, a lawn that is now a town, a text link that is now a door, and a mount that did nothing. It would have been written three times. It is written once, here, after the last surface it points at is finished — and it is the last slice that can hold the depth flip, because the flip has to unlock surfaces that exist.

---

## 1. Why — the complaints and the findings this answers

### The verdict, the two clauses this slice owns

> "...no main tavern **no tutorial**. ... **this doesnt feel like a well thought out game at all**."

### Audit finding — "no tutorial" (blocking, large effort)

> The entire onboarding is one static modal shown once, ever. helpGroups() (realm-help.tsx:12-37) is a control glossary: four rows titled Move / Talk / Cast / Ride and recess. Not one of them says what the goal of the world is. It is shown before the child has touched anything (realm-shell.tsx:255-264: onReady sets textures and immediately setHelpOpen(true)), it is dismissed by a single Close button (realm-help.tsx:77), and on close markRealmHelpSeen fires (realm-shell.tsx:384-394) so bundle.helpSeen is true forever (realm.ts:106). **A six-year-old who taps Close in half a second has had the whole tutorial.** There is no sequencing, no gating, no 'now try it', no in-world coach mark, no re-show on a later visit, no highlight of the thing being described. The only way back is a '?' button that is the eighth item in a wrapping HUD row (realm-hud.tsx:91-93). Worse, the Cast group promises something untrue: 'Clear troubles to protect the sites' (realm-help.tsx:26-27) — nothing a trouble does touches a site or a building.

Every clause of that verified against the code as it stands today: `realm-shell.tsx:186-188` is `helpPending`/`helpMarked`, `onReady` at `:255-264` calls `setHelpOpen(true)` before the child has touched anything, `onHelpClose` at `:384-394` fires `markRealmHelpSeen(childId)` once and never again, and `getRealmBundle` reduces the whole of onboarding to `helpSeen: flags.helpSeenAt !== null` (`realm.ts:106`).

### Audit finding — "Any sound at all" (from the enemies-and-combat cluster, *Missing entirely*)

> Any sound at all. A grep for `new Audio`, `AudioContext` and `playSound` across /home/kylee/projects/kingdoms-and-crowns/src returns nothing. No cast sound, no impact, no enemy noise, no death chime. For a child action game this is half of the combat feedback budget, and it is zero.

### Audit finding — "Ship the sound the settings page already promises" (medium)

> `soundEnabled` is in LearningProfile (learning-profile.ts:19, default true), persisted (schema.ts:749), included in the sensory-routine preset as `soundEnabled: false`, and the settings panel shows it to the parent as 'Sound — Music and effects in the Realm' (settings/learning-profile-panel.tsx:36). A grep for `new Audio`, `AudioContext` and `playSound` across all of src/ returns nothing. **The toggle controls a feature that does not exist.**

Confirmed again while writing this spec: `grep -rn "AudioContext\|new Audio\|playSound\|webkitAudio" src` returns zero lines. `learning-profile.ts:19` has the field, `:34` defaults it true, `:66` turns it off in the sensory preset, `schema.ts:749` stores it, and `learning-profile-panel.tsx:36` shows a parent the words *"Sound — Music and effects in the Realm."* Four shipped artefacts pointing at nothing.

### Audit finding — the freeze that is actually a hit (from the combat cluster)

> ...a blob touches you, it vanishes 4 units away, and your controls die for a second and a half with no flash, no hero hurt sprite, no vignette, no shake, **no sound** — just a small left-aligned line of text ("You lost focus for a moment.") in the top-left HUD stack that auto-clears after 2s. That reads as the game freezing, not as being hit.

Slice 8 owns the visual half of that. This slice owns the missing word in it.

### Audit finding — the tutorial has to survive a metered session

From the "no tutorial" fix and the brief's standing constraint: *"Play is metered: a child may only have five earned minutes, so a tutorial that cannot survive being interrupted by the clock is not a tutorial."* `usePlayClock` closes the world when the ledger says zero (`use-play-clock.ts`, `applyAccess` → `closeRef.current`), and `startClock(minutesRemaining)` starts from whatever the gate granted. A five-minute grant is the realistic floor.

### Audit finding — the '?' is the eighth chip in a wrapping row

`realm-hud.tsx:91-93` renders `<Button … aria-label="How to play">?</Button>` after mana, Cleared, Gleams, Laps, Ride and the crown badge. Slice 1 deletes most of that row; this slice inherits the button and gives it something worth opening.

### What this slice therefore has to be true of, at the end

A child who has never played opens the Realm and, inside about forty seconds of metered time, has **walked**, **found a person**, **talked to them**, **finished one side quest**, **watched a building rise because of it**, **met a trouble** and **cast a spell at it** — each because they did it, not because they read it and pressed Close. They heard every one of those moments. And the instant it is done, the Realm visibly gives them more than it had before.

---

## 2. Decisions

| # | Question | Decision |
|---|---|---|
| D9.1 | Where does the cue table live? | Pure `src/lib/realm/audio-cues.ts` (data + gate + mapping, fully unit-tested). The browser half is `src/lib/realm/audio.ts` and imports no three. |
| D9.2 | Asset files or synthesis? | Synthesis. Oscillator + short filtered noise burst through a gain envelope. No files, no network, no CDN, ~1.5 KB of JS. |
| D9.3 | When is the AudioContext created? | On the first real gesture (`pointerdown` or `keydown`) inside `.realm-root`, never before. Absent or throwing `AudioContext` yields a silent no-op player, never an error the child sees. |
| D9.4 | Does the audio layer touch the scene? | No. Every cue fires from callbacks the shell already owns (`onSpellEvent`, `onRecessEvent`, `onDeedFinished`, `onCeremonyEvent`, the clock's `warning`). No `*-layer.tsx` file changes, no three import, no new scene prop. |
| D9.5 | Is there an in-world mute independent of the parent's switch? | Yes, and it persists: `realm_settings.sound_muted`, written by a hero-or-parent action. A parent's `soundEnabled: false` is a hard off the child cannot undo; the child's mute is a soft off the child can undo. |
| D9.6 | Does the tutorial gate on reading or on doing? | Doing, at every step but the opening banner, whose "doing" is pressing one button. |
| D9.7 | Can the tutorial ever trap a child? | No. Every step but one carries a `ceilingMs` that advances it regardless. The exception is step 4 (*finish one side quest*), which has no ceiling because it is real schoolwork and may span visits. |
| D9.8 | Where is the clock paused? | The opening banner and nowhere else in the programme — and even there it is capped at `WELCOME_PAUSE_CEILING_MS` (20 s), after which the clock resumes whether or not the banner has been dismissed. A paused banner is not a free-play exploit. |
| D9.9 | Is the ability bar unmounted during the tutorial? | No — slice 3's invariant is that the Spellbook button can never disappear. The bar is mounted from frame one with **empty sockets**; the hero's pages arrive at the `cast` step. |
| D9.10 | Are troubles held back? | Held only during the visit that *starts* the tutorial. A resumed tutorial on a later visit spawns troubles normally, so a bounced-out child can never leave the world permanently empty. |
| D9.11 | What makes `realmDepth()` return `'full'`? | `tutorial_done_at IS NOT NULL`, or a `depth_override` of `'full'`. Replaying the walkthrough never lowers a hero's depth. |
| D9.12 | Is the flip silent? | No. A short "The Realm opens up" beat, on the live clock, ~5 s, naming only the surfaces that actually changed — computed by diffing `surfacesFor()` before and after, so it can never promise a surface `fewerChoices` has capped away. |
| D9.13 | Does the flip ever read as patronising? | Three written guarantees: depth is never a word on screen; the gate's "Show me everything" (slice 1) skips to full depth and is remembered; a parent can set the override in the Realm settings panel (row shipped here). Flipping to full does **not** skip the tutorial — the tutorial still runs, and it is under a minute. |
| D9.14 | What happens to the '?' button? | It opens the tutorial at step one. `RealmHelp` stays, one link deeper, as the control reference. In parent preview it opens `RealmHelp` directly. |
| D9.15 | Does the parent-facing sound copy stay as it is? | No. *"Music and effects in the Realm"* is a promise of music, and this slice ships no music. The hint is rewritten. A string may not promise what the code does not do — that is the lesson of `realm-help.tsx:26-27`. |
| D9.16 | Does anything here grant, spend or gate Realm minutes? | Nothing. The tutorial grants no minutes, gates no side quest, blocks no door and holds no Begin button. Covered by a test. |

---

## 3. Design

### 3.1 The cue synth

Two modules. The data and every decision are pure; the browser objects are a thin, untestable shell.

**`src/lib/realm/audio-cues.ts`** — new, pure, colocated test.

```ts
/**
 * The whole vocabulary. Four earlier slices reserved cue ids by name; every one of them is here,
 * spelled camelCase, with a row in CUES. **A reserved id with no CUES row is a test failure** —
 * a promised sound may never silently not exist.
 */
export type CueId =
  // this slice
  | "talk" | "cast" | "impact" | "clear" | "dazzle"
  | "questDone" | "buildingRises" | "gleam" | "ride"
  | "oneMinute" | "step" | "open"
  // reserved by slice 6 (doors-and-the-tavern)
  | "doorReach" | "doorOpen" | "doorExit"
  // reserved by slice 7 (fast-travel-and-the-companion)
  | "travelStart" | "travelArrive" | "travelStop" | "companionPoint"
  // reserved by slice 10 (plots-signs-and-the-keep)
  | "plotStage" | "keepGrew"
  // reserved by slice 13 (record-of-the-work)
  | "kingdomHail" | "summary";
// Slice 13 also reserved `rise`; it is DELETED as a duplicate of `buildingRises`, which already
// fires on exactly that moment. Slice 13 consumes `buildingRises`.

export type CueWave = "sine" | "triangle" | "square" | "sawtooth";

export type CueTone = {
  wave: CueWave;
  freq: number;        // Hz at tone start
  toFreq?: number;     // linear ramp target; absent = steady
  startMs: number;     // offset from cue start
  durMs: number;
  peak: number;        // 0..1, multiplied by MASTER_GAIN
};

export type CueNoise = {
  startMs: number;
  durMs: number;
  peak: number;
  filterHz: number;    // one-pole lowpass
};

export type Cue = {
  id: CueId;
  totalMs: number;
  tones: CueTone[];
  noise: CueNoise[];
};

export const MASTER_GAIN = 0.18;
export const ATTACK_MS = 12;
export const RELEASE_MS = 40;
export const CUE_MAX_MS = 600;
export const CUE_MAX_PEAK = 0.7;

export const CALM_GAIN = 0.55;
export const CALM_MAX_HZ = 800;

export const CUES: Readonly<Record<CueId, Cue>>;

export function cueFor(id: CueId): Cue;
/** Softer, lower, no hard edges: square/sawtooth become triangle, peaks scale by CALM_GAIN, frequencies clamp to CALM_MAX_HZ. */
export function calmCue(cue: Cue): Cue;

export type CueGate = { lastAt: Partial<Record<CueId, number>>; recent: number[] };
export const CUE_MIN_GAP_MS = 70;
export const CUE_MAX_PER_SECOND = 8;
export function newCueGate(): CueGate;
/** Rate limit, so a beam clearing three troubles in one frame is one sound, not three. */
export function admitCue(gate: CueGate, id: CueId, nowMs: number): { gate: CueGate; play: boolean };

export function cueForSpellEvent(e: SpellEvent): CueId | null;
export function cueForRecessEvent(e: RecessSimEvent): CueId | null;
```

The table, in full, as it ships:

| Cue | Tones | Noise | Total | Fires on |
|---|---|---|---|---|
| `talk` | triangle 392→440 Hz, 0–90 ms, peak 0.50 | — | 90 ms | villager reach → panel opens |
| `cast` | sine 523→784 Hz, 0–120 ms, peak 0.55 | — | 120 ms | `{kind:"castState", casting:true}` |
| `impact` | square 220 Hz, 0–50 ms, peak 0.30 | 0–40 ms, peak 0.50, 1400 Hz | 50 ms | slice 8's hit event |
| `clear` | triangle 659 Hz 0–80 ms peak 0.55; triangle 880 Hz 80–180 ms peak 0.60 | — | 180 ms | `{kind:"cleared"}` |
| `dazzle` | sine 330→196 Hz, 0–260 ms, peak 0.45 | — | 260 ms | `{kind:"focusLost"}` |
| `questDone` | triangle 523 / 659 / 784 Hz, 110 ms each, peak 0.60 | — | 330 ms | `onDeedFinished` |
| `buildingRises` | triangle 392 / 523 / 659 Hz, 140 ms each, peak 0.65 | 280–480 ms, peak 0.25, 600 Hz (a soft settling swell) | 480 ms | `onDeedFinished` where `applied.rose` |
| `gleam` | sine 1046 Hz, 0–70 ms, peak 0.40 | — | 70 ms | `{kind:"gleam"}` |
| `ride` | square 262→330 Hz, 0–140 ms, peak 0.45 | 0–60 ms, peak 0.30, 900 Hz | 140 ms | mount / dismount, fast travel arrival |
| `oneMinute` | sine 440 Hz 0–160 ms peak 0.50; sine 440 Hz 200–360 ms peak 0.50 | — | 360 ms | the clock's `warning` edge |
| `step` | sine 587 Hz, 0–80 ms, peak 0.35 | — | 80 ms | a tutorial step advances |
| `open` | triangle 392 / 494 / 587 / 784 Hz, 130 ms each, peak 0.65 | — | 520 ms | the depth flip |
| `doorReach` | sine 349 Hz, 0–70 ms, peak 0.30 | — | 70 ms | a door arms (slice 6) |
| `doorOpen` | triangle 349→523 Hz, 0–150 ms, peak 0.50 | — | 150 ms | a door panel opens (slice 6) |
| `doorExit` | triangle 523→349 Hz, 0–180 ms, peak 0.45 | 120–220 ms, peak 0.20, 500 Hz (the latch) | 220 ms | `Go in` — the visit ends (slice 6) |
| `travelStart` | square 196→294 Hz, 0–160 ms, peak 0.45 | 0–80 ms, peak 0.28, 800 Hz | 160 ms | a ride begins (slice 7) |
| `travelArrive` | triangle 294→392 Hz, 0–130 ms, peak 0.45 | — | 130 ms | a ride ends at the far post (slice 7) |
| `travelStop` | sine 294→247 Hz, 0–110 ms, peak 0.35 | — | 110 ms | the child pulls up mid-ride (slice 7) |
| `companionPoint` | sine 784 Hz 0–60 ms peak 0.30; sine 988 Hz 60–130 ms peak 0.28 | — | 130 ms | the companion reaches its goal and turns (slice 7) |
| `plotStage` | triangle 330 Hz 0–90 ms peak 0.45; triangle 415 Hz 90–200 ms peak 0.45 | 0–70 ms, peak 0.22, 700 Hz (timber settling) | 200 ms | a plot advances a stage (slice 10) |
| `keepGrew` | triangle 262 / 330 / 392 Hz, 150 ms each, peak 0.60 | 300–520 ms, peak 0.26, 500 Hz | 520 ms | the keep's silhouette grows (slice 10) |
| `kingdomHail` | triangle 392 / 523 / 659 / 784 Hz, 140 ms each, peak 0.65 | 480–580 ms, peak 0.22, 900 Hz | 580 ms | the 8-of-8 hail (slice 13) |
| `summary` | sine 523 Hz 0–100 ms peak 0.40; sine 392 Hz 100–220 ms peak 0.38 | — | 220 ms | the session summary appears (slice 13) |

**Twelve of those twenty-four rows are written for other slices' moments.** Each reserving slice states, in its own §3, which event fires the cue; this slice owns the *sound*. Two are worth a word on tone: `doorExit` is the only cue in the set that resolves **downward**, because it is the one that ends a visit and it should feel like a door closing behind you rather than an achievement; and `keepGrew` deliberately shares `buildingRises`'s shape one fifth lower, so a child hears "something went up" and then "something bigger went up" as the same family of sound.

Everything is short (≤ 480 ms of tone, 600 ms hard ceiling), soft-attacked (12 ms), low (nothing above 1046 Hz, and nothing above 800 Hz under calm), and quiet (`MASTER_GAIN` 0.18 against a peak of 0.7 → an absolute ceiling of 0.126 linear gain).

**`src/lib/realm/audio.ts`** — new, browser-only, no three, no React.

```ts
import type { CueId } from "./audio-cues";

export type CuePlayer = {
  /** Idempotent; creates or resumes the AudioContext. Called from a real gesture handler only. */
  unlock(): void;
  play(id: CueId): void;
  /** The child's in-world mute. The parent's soundEnabled is applied at construction. */
  setMuted(muted: boolean): void;
  /** Read-aloud is speaking: drop cue gain to DUCK_GAIN for ms, so speech is never buried. */
  duck(ms: number): void;
  close(): void;
};

export const DUCK_GAIN = 0.35;
export const MAX_VOICES = 4;

/** A player that does nothing at all — no AudioContext, no listeners — used where audio is off or unavailable. */
export function silentCuePlayer(): CuePlayer;

export function createCuePlayer(opts: { enabled: boolean; calm: boolean; muted: boolean }): CuePlayer;
```

`createCuePlayer` returns `silentCuePlayer()` when `!opts.enabled`, when `typeof window === "undefined"`, or when neither `window.AudioContext` nor `window.webkitAudioContext` exists. It never constructs an `AudioContext` in the factory — only in `unlock()`, inside a try/catch whose catch swaps the instance to silent for the rest of the visit. Each `play` builds an `OscillatorNode`/`BufferSourceNode` per tone, a `GainNode` per cue with a linear ramp (`ATTACK_MS` up, hold, `RELEASE_MS` down), and disconnects on `ended`. Voices over `MAX_VOICES` are dropped, not queued.

**`src/components/realm/use-realm-audio.ts`** — new hook, the only React surface.

```ts
export function useRealmAudio(opts: {
  enabled: boolean;      // settings.sound — the parent's switch
  calm: boolean;         // settings.calmPalette || !settings.motion
  muted: boolean;        // the child's in-world mute
  rootRef: React.RefObject<HTMLDivElement | null>;
}): { play: (id: CueId) => void; duck: (ms: number) => void };
```

It builds the player once in a ref, attaches one `{ once: true }` `pointerdown` and one `{ once: true }` `keydown` listener to `rootRef.current` in an effect (both call `unlock()`), calls `setMuted` in an effect when `muted` changes, and calls `close()` in cleanup. `play` is a stable `useCallback` that runs `admitCue` against a gate held in a ref before touching the player, so a cue storm costs one gate lookup. No state, no re-render, nothing that can enter the `World` memo.

**`src/lib/realm/render-settings.ts`** gains one field:

```ts
export type RenderSettings = {
  motion: boolean;
  calmPalette: boolean;
  showStick: boolean;
  hudScale: number;
  sound: boolean;       // profile.soundEnabled — the parent's switch, never the child's mute
};
// renderSettingsFor(...): { ..., sound: profile.soundEnabled }
```

The child's mute is deliberately **not** here. `settings` is a scene prop under the memoised `World`; a mute toggle inside it would re-render the scene subtree on every press. `render-settings.test.ts` gains two cases: `sound` follows `soundEnabled` exactly, and `sound` is independent of `lowStimulus` and `reducedMotion`.

### 3.2 The mute control

A 56 px round button in the top-right utility cluster slice 1 establishes, immediately before the `?`, and the first tab stop in that cluster.

```
class:        realm-sound-toggle
aria-label:   "Sound"
aria-pressed: {!muted}
title:        muted ? "Sound off" : "Sound on"
```

Pressing it announces through slice 1's message lane, at `toast` priority:

- turning it off: **"Sound off."**
- turning it on: **"Sound on."**

Read-aloud variant, spoken: *"Sound off."* / *"Sound on."* (identical; there is nothing to expand).

No keyboard shortcut. `M`, `Space`, `Enter` and `1`–`4` are taken (`realm-shell.tsx` `onKey`, `use-realm-input.ts`), and a mis-hit mute in an action game is worse than a Tab press. The button is disabled and hidden when `settings.sound === false` — there is nothing to mute, and a dead control that does nothing is exactly the failure this slice exists to correct.

### 3.3 The parent-facing copy, corrected

`src/app/(app)/settings/learning-profile-panel.tsx:36` today:

```
{ key: "soundEnabled", label: "Sound", hint: "Music and effects in the Realm." },
```

becomes, verbatim:

```
{ key: "soundEnabled", label: "Sound", hint: "Short sounds in the Realm for casting, talking, and a building going up. No music." },
```

There is no music in this slice and none is planned. The old hint was the same class of error as *"Clear troubles to protect the sites"* — a shipped string describing something that does not exist.

### 3.4 The tutorial state machine

**`src/lib/realm/tutorial.ts`** — new, pure, colocated test. Imports nothing from three, nothing from React, and nothing that imports either.

```ts
export type TutorialStepId =
  | "welcome" | "move" | "find" | "talk" | "quest" | "rise" | "trouble" | "cast";

export type TutorialMarker =
  | "none" | "hero" | "objectiveSite" | "objectiveVillager" | "nearestTrouble" | "abilityBar";

export type TutorialUnlock = "abilityBar" | "troubleSpawn";

export type TutorialStep = {
  id: TutorialStepId;
  index: number;                 // 0..7
  marker: TutorialMarker;
  pausesClock: boolean;          // true for "welcome" and nothing else
  budgetSeconds: number;         // metered seconds this step is expected to cost
  ceilingMs: number | null;      // auto-advance after this long; null = waits forever (step 4 only)
  unlocks: TutorialUnlock[];
};

export const TUTORIAL_STEPS: readonly TutorialStep[];   // length 8
export const TUTORIAL_COMPLETE = 8;                     // the sentinel stored in tutorial_step
export const TUTORIAL_START = 0;

export const TUTORIAL_MOVE_UNITS = 2;
export const TUTORIAL_TROUBLE_NEAR = 8;                 // world units
export const RISE_HOLD_MS = 4000;
export const WELCOME_PAUSE_CEILING_MS = 20_000;

export type TutorialInput = {
  msInStep: number;
  acknowledged: boolean;          // the welcome button was pressed
  distanceMoved: number;          // units travelled since this step began
  reachId: string | null;
  objectiveVillagerId: string | null;   // null when there is no objective at all
  panelOpen: boolean;
  panelOpenedCount: number;
  questsFinished: number;
  sitesAdvanced: number;
  nearestTroubleDistance: number | null;
  cleared: number;
};

export function tutorialStepAt(index: number): TutorialStep | null;
export function isTutorialComplete(index: number | null): boolean;
export function stepAdvances(step: TutorialStep, input: TutorialInput): boolean;
/** At most one step per call. `reason` is "done" when the child did the thing, "ceiling" when time ran it out. */
export function advanceTutorial(
  index: number,
  input: TutorialInput
): { index: number; changed: boolean; reason: "done" | "ceiling" | null };
export function tutorialUnlocked(index: number | null, unlock: TutorialUnlock): boolean;
/** Total metered seconds across every step, for the budget assertion in the test. */
export function tutorialBudgetSeconds(): number;

export type TutorialCopyOpts = {
  touch: boolean;                 // settings.showStick, exactly as helpGroups(touch) branches today
  heroName: string;
  villagerName: string | null;
  siteLabel: string | null;
  companionLabel: string | null;  // null when the hero has no companion
  troubleName: string | null;     // slice 8's name for the nearest trouble
  progress: string | null;        // slice 1/10's rendered progress: "●●○○○" or "2 of 5"
};

export function tutorialBanner(step: TutorialStep, opts: TutorialCopyOpts): string;
export function tutorialSpoken(step: TutorialStep, opts: TutorialCopyOpts): string;
export const TUTORIAL_WELCOME_TITLE = "Welcome to your Realm, {heroName}.";
export const TUTORIAL_PRIMARY = "Show me";
export const TUTORIAL_SECONDARY = "I've played before";
export const TUTORIAL_CONTROLS_LINK = "Just show me the controls";
```

`stepAdvances` short-circuits the middle of the sequence when there is nothing to point at: for `find`, `talk`, `quest` and `rise`, `objectiveVillagerId === null` advances immediately. That covers a hero who has raised all eight buildings, a kingdom that failed to load (`kingdomError`), and a villager whose sprite failed to rasterise (slice 1 filters those out of `layout.villagers` before anything reads it).

### 3.5 The steps, with every string verbatim

Placeholders in braces are substituted by `tutorialBanner`/`tutorialSpoken`. "Deed" never appears; the nouns come from `SIDE_QUEST_LOWER` in `src/lib/utils/side-quest-copy.ts`.

---

**Step 0 — `welcome`** · marker `none` · **clock paused** · 0 metered seconds · ceiling: the pause ends at 20 s, the card stays

Title: **"Welcome to your Realm, {heroName}."**
Body: **"Eight buildings to raise. We'll start with one."**
Primary button: **"Show me"**
Secondary button (suppressed under `fewerChoices`): **"I've played before"**
Link, small, under the buttons: **"Just show me the controls"**

Spoken: *"Welcome to your realm, {heroName}. There are eight buildings to raise here, and we will start with just one. Press Show me when you are ready."*

`aria-live`: the card is a `role="dialog"` with `aria-modal="true"` and its own focus, matching `RealmHelp`'s shape; nothing is announced through the live lane while it is open.

Advances when `acknowledged` is true. Pressing **"I've played before"** does not advance — it completes: `tutorial_step = TUTORIAL_COMPLETE`, `tutorial_done_at = now`, and the depth-open beat plays (or is suppressed; see §3.7).

---

**Step 1 — `move`** · marker `hero` (slice 1's gold ground ring, pulsed) · 5 metered seconds · ceiling 45 s

Banner, touch: **"Drag the stick to walk."**
Banner, keyboard: **"Walk with W, A, S, D — or click the ground."**

Spoken, touch: *"Put your thumb on the circle at the bottom left and drag it. That walks you around."*
Spoken, keyboard: *"Use the W, A, S and D keys to walk. You can also click on the ground where you want to go."*

Advances when `distanceMoved >= 2`.

---

**Step 2 — `find`** · marker `objectiveVillager` (slice 1's beacon and gold `!`, plus the edge arrow when off camera) · 12 metered seconds · ceiling 60 s

Banner, with a companion: **"Follow your companion to the gold light. {villagerName} is waiting there."**
Banner, without: **"Head for the gold light. {villagerName} is waiting there."**

Spoken: *"Follow the gold light. {villagerName} is waiting for you there."*

Advances when `reachId === objectiveVillagerId`.

---

**Step 3 — `talk`** · marker `objectiveVillager` · 3 metered seconds · ceiling 30 s

Banner, touch: **"Tap Talk."**
Banner, keyboard: **"Press Enter to talk."**

Spoken, touch: *"You are close enough now. Tap the Talk button."*
Spoken, keyboard: *"You are close enough now. Press Enter to talk to {villagerName}."*

Advances when `panelOpenedCount >= 1`.

---

**Step 4 — `quest`** · marker `none` · 0 metered seconds (the clock is already paused while the panel is open) · **no ceiling**

The banner is hidden while `panelOpen` is true — nothing floats over the side-quest panel. If the child closes the panel without finishing, the banner returns:

Banner: **"Finish one {SIDE_QUEST_LOWER} and the {siteLabel} rises."**

Spoken: *"Finish one side quest for {villagerName}, and the {siteLabel} will rise."*

Advances when `questsFinished >= 1`. This is the only step with no ceiling, and the reason is that it is not tutorial overhead — it is the product. A child may take twenty minutes over it, run out of Realm minutes, leave, come back tomorrow and finish it then. `tutorial_step` is persisted, so they resume exactly here.

---

**Step 5 — `rise`** · marker `objectiveSite` · 5 metered seconds · ceiling 8 s

Banner: **"Look — the {siteLabel} is rising. {progress}"**

`{progress}` is whatever slice 1 and slice 10 render for that surface at this hero's depth: filled pips at simple depth, a numeral fraction at full. This slice does not choose; it asks.

Spoken: *"Look at that. The {siteLabel} is rising, because of the work you just did."*

Advances when `!panelOpen && msInStep >= RISE_HOLD_MS`.

---

**Step 6 — `trouble`** · marker `nearestTrouble` · unlocks `troubleSpawn` · 5 metered seconds · ceiling 45 s

Banner: **"A {troubleName} has drifted in. Go and have a look."**

Spoken: *"A {troubleName} has drifted in near the {siteLabel}. Go and have a look at it."*

Advances when `nearestTroubleDistance !== null && nearestTroubleDistance <= 8`.

`{troubleName}` is slice 8's name for the trouble under the hero's `toneMode`, from `TROUBLE_COPY[kind].gentleName` / `.monstersName` — strings that are written, typed, and rendered by nothing today. If no trouble exists when the step opens (the spawner found no free zone), the copy falls back to **"Something has drifted in near the {siteLabel}. Go and have a look."** and the ceiling carries the step.

---

**Step 7 — `cast`** · marker `abilityBar` · unlocks `abilityBar` · 8 metered seconds · ceiling 60 s

Banner, touch: **"Tap a spell, then tap the {troubleName}."**
Banner, keyboard: **"Press 1 to pick a spell, then press Space."**

Spoken, touch: *"Your spells are along the bottom now. Tap one, then tap the trouble."*
Spoken, keyboard: *"Your spells are along the bottom now. Press the one key to pick a spell, then press the space bar to send it."*

Advances when `cleared >= 1`.

On ceiling — the child could not land one — the step advances with no praise and no reproach. The tutorial simply finishes. This matters: a six-year-old on a trackpad, or a child on a bad motor day, must not be the one player who never sees the Realm open up.

---

### 3.6 Metered budget, in seconds

| Step | Metered seconds | Clock |
|---|---|---|
| 0 `welcome` | 0 | **paused**, capped at 20 s |
| 1 `move` | 5 | live |
| 2 `find` | 12 | live |
| 3 `talk` | 3 | live |
| 4 `quest` | 0 | paused by `panelOpen`, as it already is today |
| 5 `rise` | 5 | live |
| 6 `trouble` | 5 | live |
| 7 `cast` | 8 | live |
| depth-open beat | 5 | live |
| **Total** | **43 s** | |

The ceiling set by the brief is 15% of a child's daily allowance. The realistic floor for that allowance is one five-minute earned grant — 300 s — so the ceiling is **45 s**. The budget is 43 s, and `tutorial.ts`'s test asserts `tutorialBudgetSeconds() + DEPTH_OPEN_MS/1000 <= 45`, so the number cannot drift without a red test.

Two honesty notes on that table. First, the `find` step's 12 s is the walk to the first objective — time the child would have spent walking there anyway; it is counted as tutorial cost because it is spent while a banner is up, not because the tutorial added it. Second, the only pure overhead in the whole sequence is the 5 s depth-open beat; everything else is play with a sentence over it.

### 3.7 The depth flip

**`src/lib/realm/depth-open.ts`** — new, pure, colocated test.

```ts
import type { Surfaces } from "./depth";   // slice 1

export type DepthOpenLineId = "numbers" | "objectives" | "abilities" | "travel" | "troubleNames";

export type DepthOpenLine = { id: DepthOpenLineId; text: string; spoken: string };

export const DEPTH_OPEN_TITLE = "The Realm opens up.";
export const DEPTH_OPEN_BUTTON = "Let's go";
export const DEPTH_OPEN_NONE = "That's everything there is. Go and raise a kingdom.";
export const DEPTH_OPEN_MS = 5000;

/** Only the surfaces that actually changed. A line that would describe a surface fewerChoices has capped is never produced. */
export function depthOpenLines(before: Surfaces, after: Surfaces): DepthOpenLine[];
export function depthOpenSpoken(lines: DepthOpenLine[], heroName: string): string;
```

The five candidate lines, verbatim, each emitted only when the corresponding field of `Surfaces` differs between `before` and `after`:

| id | Condition | Text | Spoken |
|---|---|---|---|
| `numbers` | `numerals` changed `false` → `true` | **"Numbers now, not dots — you can see exactly how many."** | *"You will see numbers now instead of dots, so you know exactly how many are left."* |
| `objectives` | `trackedObjectives` rose above 1 | **"More than one thing to work on at a time."** | *"You can keep track of more than one thing at a time now."* |
| `abilities` | `abilitySlots` changed `"earned"` → `"all"` | **"Every spell slot you've earned."** | *"Every spell slot you have earned is on the bar now."* |
| `travel` | `fastTravel` became true | **"Ride anywhere you've already been."** | *"You can ride to anywhere you have already been."* |
| `troubleNames` | `troubleNames` became true | **"Every trouble has a name."** | *"Every trouble has a name now, so you can tell them apart."* |

Card title: **"The Realm opens up."** Button: **"Let's go"**.
Spoken, whole card: *"Well done, {heroName}. The realm is opening up. {each spoken line, joined by a full stop}"*
`aria-live="polite"` announcement, for a hero who is not on read-aloud: `The Realm opens up. {each text line, joined by a full stop}`

Three cases where the beat does not play as written:

1. **No line survives.** A hero under `fewerChoices` with the ability bar already at `"earned"` at both depths may change nothing but `numerals` — in which case one line shows, which is correct. If genuinely nothing changed, the card shows the title and `DEPTH_OPEN_NONE` and the same button. It is never empty and never lies.
2. **The hero was already at full depth** via a `depth_override` of `'full'` (the gate's "Show me everything", or a parent's setting). The beat is suppressed entirely; the message lane shows, at `toast` priority: **"That's the walkthrough done."** Spoken: *"That is the walkthrough done. Off you go."* Nothing "opens up" that was not already open — that would be the false-promise failure again.
3. **Parent preview.** Never plays. The tutorial does not run in preview at all (§5).

The `open` cue plays with the card. Under `reducedMotion` the card appears without the stagger; under `lowStimulus` it uses the plain, un-gilded panel styling and holds 2 s longer, because a calm hero reads slower, not less.

### 3.8 Wiring in `realm-shell.tsx`

Existing structure this replaces:

- `helpPending` / `helpMarked` refs (`:186-188`), `onReady`'s `setHelpOpen(true)` branch (`:255-264`), and `onHelpClose`'s `markRealmHelpSeen` (`:384-394`) become the tutorial's own start/advance/complete path. `markRealmHelpSeen` is kept and still fires on the first `RealmHelp` close, because slice 1 and slice 13 both read `helpSeen`, and because it is the backfill key (§4).
- `paused: panelOpen || ceremonyRunning || helpOpen` on `usePlayClock` gains one term: `|| tutorialPausing`, where `tutorialPausing` is `step.pausesClock && welcomeElapsedMs < WELCOME_PAUSE_CEILING_MS`. That is the entire pause surface of this slice and of the programme.
- The tutorial holds a pending ceremony exactly as `helpOpen` does today: `beginCeremonyIfWaiting()` is called when the tutorial completes or is dismissed, not before. A first-ever visit cannot have a completed season, but a *resumed* tutorial can, and the crown must not descend over a coach mark.
- `spellsEnabled` and the ability bar's `pages` prop are gated on `tutorialUnlocked(step, "abilityBar")`: the bar mounts from frame one (slice 3's Spellbook button can never disappear), showing empty sockets, and the hero's real pages arrive at the `cast` step.
- Slice 8's trouble spawner is called with `enabled: tutorialUnlocked(step, "troubleSpawn")`.

New shell state, all of it small and none of it entering the `World` memo:

```ts
const [tutorialStep, setTutorialStep] = useState<number | null>(bundle.tutorialStep);
const [tutorialAcked, setTutorialAcked] = useState(false);
const [depthOpen, setDepthOpen] = useState<DepthOpenLine[] | null>(null);
const [muted, setMuted] = useState(bundle.soundMuted);
```

The advance loop runs on the existing one-second interval the clock already owns — not a new timer, and not a per-frame check — reading a `tutorialInputRef` that the shell's own callbacks write (`onReachChange`, `onTalk`, `onDeedFinished`, `onSpellEvent`, and a distance accumulator fed from the scene's existing reach/position event, all through `queueMicrotask` as scene→React events already do). Advancing calls `saveTutorialStep(childId, next)` fire-and-forget, plays the `step` cue, and speaks the new step's line when `readAloud` is on (with a `duck(2500)` first, and behind a last-spoken ref, exactly as slice 1 does for objective changes).

New components:

- **`src/components/realm/realm-tutorial.tsx`** → `RealmTutorial`. The welcome card (a `role="dialog"`, focus-trapped like `RealmHelp`) and, for steps 1–7, a banner rendered **through slice 1's centred message lane** at a new `tutorial` priority sitting just under `error` and above the one-minute banner. It does not open a second message channel; the whole point of slice 1's lane is that there is one.
- **`src/components/realm/realm-depth-open.tsx`** → `RealmDepthOpen`. The flip card.

New CSS in `globals.css`, and one correction to an existing rule. `globals.css:244` scopes larger text to `.realm-panel` only:

```css
.realm-root[data-larger-text="on"] .realm-panel { … }
```

becomes

```css
.realm-root[data-larger-text="on"] .realm-panel,
.realm-root[data-larger-text="on"] .realm-tutorial,
.realm-root[data-larger-text="on"] .realm-depth-open { … }
```

Without that, a `largerText` hero reads their entire onboarding at 14 px — the same defect slice 1 fixes for the world's nameplates.

### 3.9 The '?' button, repointed

`realm-hud.tsx:91-93`'s button keeps its position and its shape. Its behaviour changes:

- **Child view:** opens `RealmTutorial` at step 0, with `tutorial_step` reset to `TUTORIAL_START` in memory only until the child presses **"Show me"** — a mis-tap must not silently restart a hero's onboarding. Pressing "Show me" writes `TUTORIAL_START`. `tutorial_done_at` is never cleared, so a replay cannot demote a hero's depth.
- **Parent preview:** opens `RealmHelp` directly. A parent pressing `?` wants the control reference, and previewing must never write to the hero's row.
- `aria-label` changes from `"How to play"` to `"How to play"` — unchanged; it is still exactly right.

`RealmHelp` survives untouched as the control glossary, one link deeper, behind **"Just show me the controls"** on the welcome card and a **"Controls"** row in the tutorial banner's overflow. Its `Cast` group string is slice 8's to rewrite (decision D3 makes clearing pay Realm minutes, which finally makes a promise there truthful); this slice ships the regression test that no string returned by `helpGroups()` contains `"protect the sites"`.

### 3.10 The parent's depth control

One new row in `RealmSettingsPanel` (`src/app/(app)/settings/realm-settings-panel.tsx`), writing through the existing parent-only `updateRealmSettings(childId, { depthOverride })`:

Legend: **"What the Realm shows"**
Three radios:

- **"Grows with them"** — hint: *"Simple to begin with. Everything opens up once they finish the walkthrough."* (value: **`"auto"`**, the default and the column's `NOT NULL DEFAULT`. It is a real selectable value, not an absence — which is why `DepthOverride` has three members and not two plus `null`.)
- **"Simple"** — hint: *"Dots instead of numbers, one thing to do at a time. Good for a new reader."* (value: `"simple"`)
- **"Everything"** — hint: *"The full Realm from the first visit."* (value: `"full"`)

And one button beside the existing "Show the how-to-play card again":

Button: **"Play the walkthrough again"** — hint: *"{heroName} sees the guided first few minutes on their next visit. What the Realm shows them does not change."*

That second sentence is load-bearing and true: `replayRealmTutorial` writes `tutorial_step = TUTORIAL_START` and leaves `tutorial_done_at` alone.

---

## 4. Data model

### 4.1 Columns

Three columns on `realm_settings`, beside `helpSeenAt` and `starterSpellAt`:

```ts
// src/lib/db/schema.ts, in realmSettings
// Slice 9: the guided first few minutes, and the child's own mute.
tutorialStep: integer("tutorial_step"),                                  // nullable; 0..7, or 8 = complete
tutorialDoneAt: integer("tutorial_done_at", { mode: "timestamp" }),      // nullable; first completion, never cleared
soundMuted: integer("sound_muted", { mode: "boolean" }).notNull().default(false),
```

**Why two tutorial columns and not one.** `tutorial_step` is *where the hero is now*; `tutorial_done_at` is *whether they have ever finished*. Depth reads the second. Without the split, a parent pressing "Play the walkthrough again" would reset the step, `realmDepth()` would see an incomplete tutorial, and a thirteen-year-old would be demoted to pips for pressing a button labelled "play it again". That is precisely the patronising failure decision 7 names, arriving through the back door.

### 4.2 Migration

**`src/lib/db/migrations/<next>_<drizzle-name>.sql`.** **Migration numbers are assigned by drizzle-kit, never reserved by a spec.** The last committed migration is `0025_worried_tyrannus`. Only seven slices in the programme take one (1, 7, 8, 9, 10, 12, 13), so the generator will number them **0026 through 0032** in build order. This spec names no number; the build step runs `npm run db:generate`, reads the filename it produced, and records it here and in the implementation plan.

```sql
ALTER TABLE `realm_settings` ADD `tutorial_step` integer;
ALTER TABLE `realm_settings` ADD `tutorial_done_at` integer;
ALTER TABLE `realm_settings` ADD `sound_muted` integer DEFAULT false NOT NULL;
```

Three `ADD COLUMN`s, all legal in SQLite: two nullable with no default, one `NOT NULL` with a constant default.

**Verification, run and checked rather than trusted** (the hook runs `db:migrate` silently, per the standing memory note):

1. `npm run db:generate` — confirm exactly one new file appears in `src/lib/db/migrations/` and **record the number the generator actually produced** here and in the implementation plan. This five-step ritual is the pattern every migration-taking slice in the programme follows.
2. Read the generated `.sql` and confirm it contains those three statements and nothing else — in particular, no table rebuild.
3. `npm run db:migrate`.
4. `sqlite3 ./local.db "PRAGMA table_info(realm_settings);"` and confirm `tutorial_step`, `tutorial_done_at`, `sound_muted` are present with the expected types and the `sound_muted` default of `0`.
5. Confirm the new entry in `src/lib/db/migrations/meta/_journal.json`.

### 4.3 What existing rows do

Every hero who has ever opened the Realm has a `realm_settings` row (`loadRealmSettings` inserts-if-missing). After the migration every one of those rows reads `tutorial_step = NULL`, `tutorial_done_at = NULL`, `sound_muted = 0`.

The backfill is a **read rule, not an UPDATE**, so it is pure, testable, and reversible:

**`src/lib/utils/realm-settings.ts`** gains:

```ts
export type RealmTutorialState = {
  step: number | null;   // null = never started
  done: boolean;         // has ever completed
};

/**
 * A hero with help_seen_at set and no tutorial_step has already played the Realm under the
 * old one-shot card. They are treated as complete: this never re-locks a returning child,
 * and it never demotes one to simple depth on the day the tutorial ships.
 */
export function tutorialStateFromRow(row: {
  tutorialStep: number | null;
  tutorialDoneAt: Date | null;
  helpSeenAt: Date | null;
}): RealmTutorialState;
```

The rule, exhaustively:

| `tutorial_step` | `tutorial_done_at` | `help_seen_at` | Result | Meaning |
|---|---|---|---|---|
| `NULL` | `NULL` | `NULL` | `{ step: 0, done: false }` | A genuinely new hero. The tutorial runs. |
| `NULL` | `NULL` | set | `{ step: 8, done: true }` | **An existing hero.** Complete. Full depth. No tutorial, no re-lock. |
| `0..7` | `NULL` | either | `{ step: n, done: false }` | Mid-tutorial. Resumes at step *n*. |
| `8` | set | either | `{ step: 8, done: true }` | Finished. |
| `8` | `NULL` | either | `{ step: 8, done: true }` | A completion whose `done_at` write was lost. Treated as done. |
| `0..7` | set | either | `{ step: n, done: true }` | A deliberate replay. Runs the walkthrough, keeps full depth. |
| out of range | any | any | clamped into `0..8` | A corrupt value never crashes the world. |

When the shell next writes for a row in the second case, it stamps `tutorial_done_at = helpSeenAt` in the same statement, so the derived value becomes a stored one on first touch and the rule stops being needed for that hero. That is a lazy backfill, not a migration script, and it can be re-derived if it never runs.

**Does this need a one-time message to the child?** No. Nothing here changes what a stored value *means* — three columns are added and one derived reading is applied to rows that had no opinion. A returning hero sees no tutorial, no re-lock, no change of depth, and no notice. Slice 13's `deedsToBuild` change is the migration in this programme that does need a message; this one does not.

### 4.4 Actions and the bundle

**`src/lib/actions/realm-settings.ts`** gains three server actions (the file is `"use server"`; every export is `async`):

```ts
/** The hero advanced. Hero or parent may write; a parent's preview never calls it. */
export async function saveTutorialStep(childId: string, step: number): Promise<void>;
/** Grown-ups only: show the walkthrough again. Never clears tutorial_done_at. */
export async function replayRealmTutorial(childId: string): Promise<void>;
/** The child's in-world mute. Hero or parent. */
export async function setRealmSoundMuted(childId: string, muted: boolean): Promise<void>;
```

`saveTutorialStep` clamps `step` to `0..TUTORIAL_COMPLETE`, and when `step === TUTORIAL_COMPLETE` sets `tutorial_done_at = COALESCE(tutorial_done_at, now)` in the same `UPDATE`, so the completion timestamp is written exactly once and never moved by a replay. Access follows `markRealmHelpSeen`: `requireChildAccess(childId, { write: true })`, no `isChildActor` rejection, because the hero legitimately writes their own progress.

**`src/lib/services/realm-play.ts`**: `loadRealmFlags` gains the three columns to its `cols` object and returns them, so `getRealmBundle` still pays exactly one read — the audit's own note at `realm.ts:52-53` about not paying a second round trip stays true, and the memoised-auth discipline in the project memory is untouched.

**`src/lib/actions/realm.ts`**, `RealmBundle` gains:

```ts
tutorialStep: number | null;   // from tutorialStateFromRow().step
tutorialDone: boolean;         // from tutorialStateFromRow().done — what realmDepth() reads
soundMuted: boolean;
```

`helpSeen` stays exactly as it is. Nothing that reads it changes.

---

## 5. Errors and edge cases

**Audio can fail in six ways and none of them may reach a child.**

1. No `AudioContext` constructor (an old browser, a locked-down webview): `createCuePlayer` returns `silentCuePlayer()`. No error, no message, no retry.
2. Construction throws inside `unlock()`: caught; the instance swaps to silent for the visit.
3. The context is created `suspended` (autoplay policy): `unlock()` calls `resume()` and ignores the rejection. The next gesture tries again — the unlock listeners are re-armed once if `state !== "running"` after the first attempt.
4. iOS `state === "interrupted"` (a phone call, a Siri invocation): the next `play` calls `resume()` first.
5. A cue storm (a beam clearing three troubles in one frame): `admitCue` rate-limits to one per `CUE_MIN_GAP_MS` per id and `CUE_MAX_PER_SECOND` overall; `MAX_VOICES` drops the rest.
6. Read-aloud and a cue land together: `duck(ms)` drops cue gain to `DUCK_GAIN` for the duration, and the `talk` cue is never played on the same tick as a spoken villager line.

**Tutorial failures.**

- **The step write fails.** `saveTutorialStep` is fire-and-forget with a `.catch(() => {})`, exactly as `markRealmHelpSeen` is today. The local step advances regardless; the child's play never blocks on a round trip. The retry is the next advance, which writes the later index and supersedes the lost one. If every write in the visit is lost, the child replays the tutorial next visit — acceptable, and stated here so nobody later calls it a bug. **No error text is shown to the child for this.**
- **The completion write fails.** `tutorial_done_at` is unset, and the hero replays a sub-minute walkthrough next visit. Depth is unaffected *for that visit* (the flip already happened in memory) but reverts on the next load. The mitigation is the `step === 8 && done_at IS NULL → done: true` row in §4.3, which catches the common case where the step landed and the timestamp did not.
- **The child leaves mid-tutorial** (the Tavern door, the browser back button, the clock closing): the last persisted step wins; `clock.flushPending()` still runs on unmount, because this slice adds no exit path and touches none.
- **The clock closes during the tutorial.** `RealmClosed` renders as it does today. Nothing about the tutorial holds the world open, and nothing about it is lost.
- **The welcome pause is sat on.** After `WELCOME_PAUSE_CEILING_MS` (20 s) the clock resumes and the card stays. A child cannot bank free minutes behind a banner, and a child who wandered off does not lose the card.
- **No objective at all** — all eight raised, or `kingdomError` set, or the objective villager's sprite failed to rasterise and slice 1 filtered it out. Steps 2–5 self-advance; the sequence is `welcome → move → trouble → cast` and the flip still fires.
- **No trouble can be placed.** Step 6 falls back to the unnamed copy and its ceiling carries it. Step 7 then has nothing to hit, and its ceiling carries that too. The tutorial completes.
- **Two conditions become true in one tick** (a trouble arrives and is cleared in the same second): `advanceTutorial` moves at most one step per call, so the copy is never skipped past. Covered by a test.
- **A double-advance from a repeated event:** the input is levels and counters (`questsFinished`, `cleared`, `panelOpenedCount`), never edges, so a re-delivered event cannot advance twice.
- **A ceremony is pending on a resumed first visit:** the tutorial holds it exactly as `helpOpen` does now; `beginCeremonyIfWaiting()` is called on completion or dismissal.
- **A corrupt `tutorial_step`** (a hand-edited row, a bad restore): clamped to `0..8` by `tutorialStateFromRow`. The world opens.
- **Parent preview:** the tutorial does not run, the welcome card does not render, the clock is not paused, no unlock gates apply, and nothing is written to the hero's row. `?` opens `RealmHelp`.

**The one string that must never appear.** A regression test asserts that no string returned by `helpGroups(touch, ceremony)` contains `"protect the sites"`. Slice 8 owns the replacement; this slice owns the guard.

---

## 6. Accessibility

### Per learning-profile setting

| Setting | What this slice does |
|---|---|
| **reducedMotion** | The welcome card and the flip card appear without slide or stagger; the step banner swaps instantly instead of cross-fading. Every tutorial marker (`hero`, `objectiveVillager`, `nearestTrouble`, `abilityBar`) has a non-motion substitute: where a marker bobs or pulses for other heroes, it renders as a static high-contrast outline plus the same banner text, so a reducedMotion hero loses the animation and loses nothing else. **Sound is the substitute channel this slice exists to add** — the `step` cue is what a reducedMotion hero gets in place of a pulse, which is why the cue set is not gated on `motion`. |
| **lowStimulus** | Cues are passed through `calmCue`: square and sawtooth become triangle, peaks scale by `CALM_GAIN` (0.55), frequencies clamp to `CALM_MAX_HZ` (800). Cards use the plain panel styling with no gilding and no sparkle. The flip card holds `DEPTH_OPEN_MS + 2000`. **Sound is not turned off** — `soundEnabled` is a separate, parent-owned switch, and lowStimulus *mutes rather than empties*, which here means quieter and lower, not silent. That is the same ruling this programme applies to `decor: !settings.calmPalette`. |
| **largerText** | `globals.css:244` is extended to scope `data-larger-text` over `.realm-tutorial` and `.realm-depth-open` as well as `.realm-panel`. Without it the entire onboarding is unreadable for exactly the hero who needs it most. Every card and banner is measured at 1.25em with the longest copy string (step 2's with-companion variant) and must not clip or scroll at 360 px. |
| **fewerChoices** | The welcome card shows **one** button — "Show me". "I've played before" moves to the parent panel. Two buttons is a choice, and this profile exists to remove them. **Invariant:** `fewerChoices` caps `trackedObjectives` at 1 and `abilitySlots` at `"earned"` at **both** depths, so `depthOpenLines` never emits the `objectives` or `abilities` line for such a hero — the flip card cannot promise a surface the profile has capped away. Covered by a test. |
| **readAloud** | Every step has a `spoken` variant written for the ear, not the eye (§3.5): no braces read aloud, no "W A S D" as letters where a phrase reads better, full sentences. Spoken through the existing `speak()` helper behind a last-spoken ref so re-renders do not stutter it, and behind `duck(2500)` so cues do not bury it. The banner text is *also* set on slice 1's `aria-live` lane regardless of `readAloud`, so a screen-reader hero gets every step without the profile flag. |
| **inputMode / showStick** | All step copy branches on `settings.showStick` — the same boolean, computed the same way, that `helpGroups(touch, ceremony)` already branches on. Touch copy names the stick and the Talk button; keyboard copy names WASD, Enter, `1` and Space. `inputMode: "keyboard"` on a touch device gets the keyboard copy, because the parent said so. |
| **soundEnabled** | The master switch. `false` → `renderSettingsFor` sets `sound: false` → `useRealmAudio` builds a `silentCuePlayer`, no `AudioContext` is ever constructed, and the mute button is not rendered. `true` (the default) → cues play, softened by `calmCue` where the profile asks. |
| **predictableRoutine** | The step order is fixed and identical for every hero on every run — there is no branching, no randomisation and no A/B. A hero who replays the walkthrough gets the same eight steps in the same order. |
| **untimed / sessionMinutes** | Untouched. The tutorial adds no timer a child can see and no countdown; the only clock is the Realm's own, and step 4 has no ceiling at all. |

### The complexity axis

This slice **consumes** `surfacesFor(depth, profile)` from `src/lib/realm/depth.ts` and invents no rule of its own. What it changes is *what feeds the depth*: slice 1 ships `realmDepth({ tutorialComplete, override })` with `tutorialComplete` sourced from `bundle.helpSeen`, the only signal available at slice 1; from here it is sourced from `bundle.tutorialDone`. The signature does not change.

| Surface | Simple depth | Full depth |
|---|---|---|
| The welcome card | Identical | Identical |
| Step banners 1–4, 6, 7 | Identical | Identical |
| Step 5's `{progress}` | `surfaces.numerals === false` → **"●●○○○"** | `true` → **"2 of 5"** |
| Step 7's ability bar unlock | `surfaces.abilitySlots` decides how many slots fill — this slice unlocks the bar, it does not choose its width | same |
| Step 6's `{troubleName}` | `surfaces.troubleNames === false` → the unnamed fallback copy | named |
| The flip card | Not reachable at simple depth (finishing *is* the flip) | The card itself |
| The mute button | Identical at both depths | Identical |

**Three invariants, none broken here.** (1) `fewerChoices` caps `trackedObjectives` at 1 and `abilitySlots` at `"earned"` at both depths — enforced in `depth.ts`, relied on by `depthOpenLines`, tested. (2) Depth is never a word or a label a child reads: the flip card says *"The Realm opens up"* and lists surfaces; the parent panel says *"What the Realm shows"*; the words "simple", "full", "depth" and "beginner" appear in no child-facing string in this slice. (3) Every simple-depth surface is a substitution, never a removal: pips *for* numerals, a fallback noun *for* a name, a shorter bar *for* a longer one. Nothing a child can do at full depth is impossible at simple depth.

**The anti-patronising guarantees, written down.**

1. **Depth is never named on screen.** See invariant (2).
2. **"Show me everything" (slice 1's gate control) skips straight to full depth and is remembered** — it writes `depth_override = 'full'`, which survives the visit and every visit after. It does **not** skip the tutorial: an older child still walks, talks, finishes a side quest and casts, because that content is under a minute and gates on doing, so there is nothing there to condescend to. When they finish, the flip beat is suppressed and the lane says *"That's the walkthrough done."*
3. **A parent can set the override** in the Realm settings panel (§3.10), including pinning a hero at Simple for a young reader whose sibling is at Everything.

---

## 7. Testing

### Unit-testable, and therefore mandatory

**`src/lib/realm/tutorial.test.ts`**

- `TUTORIAL_STEPS` has 8 entries with indices 0..7 and unique ids.
- Exactly one step has `pausesClock: true`, and it is `welcome`.
- Exactly one step has `ceilingMs: null`, and it is `quest`.
- `tutorialBudgetSeconds() + DEPTH_OPEN_MS / 1000 <= 45` — the metered-clock ceiling, asserted so it cannot drift.
- `stepAdvances` per step: the true case, the just-short false case (`distanceMoved: 1.99`, `nearestTroubleDistance: 8.01`, `msInStep: RISE_HOLD_MS - 1`), and the wrong-signal false case (a `reachId` that is not the objective).
- `advanceTutorial` moves at most one index per call even when three predicates are true.
- `advanceTutorial` returns `reason: "ceiling"` at exactly `ceilingMs` and `null` before it, and never a ceiling for `quest`.
- `objectiveVillagerId: null` self-advances `find`, `talk`, `quest`, `rise`, and does not self-advance `move`, `trouble` or `cast`.
- `tutorialUnlocked(n, "abilityBar")` is false for 0..6 and true for 7 and for `TUTORIAL_COMPLETE`; same shape for `"troubleSpawn"` at 6.
- `isTutorialComplete(null) === false`, `isTutorialComplete(8) === true`.
- Copy: every step's banner and spoken strings are non-empty at both `touch: true` and `touch: false`; no string contains an unsubstituted `{`; the companion-less variant of step 2 is produced when `companionLabel === null`; step 6's unnamed fallback is produced when `troubleName === null`.

**`src/lib/realm/depth-open.test.ts`**

- Every changed field produces exactly its line; an unchanged field produces none.
- A `fewerChoices` before/after pair (identical `trackedObjectives: 1`, identical `abilitySlots: "earned"`) never produces the `objectives` or `abilities` line. **This is the invariant test.**
- Identical `before` and `after` produce `[]`, and the card copy falls back to `DEPTH_OPEN_NONE`.
- `depthOpenSpoken` contains the hero's name and every line's spoken form, and no line's screen form.

**`src/lib/realm/audio-cues.test.ts`**

- Every `CueId` has an entry; `cueFor` is total; **`Object.keys(CUES).length === 24`** and the key set equals the union exactly, so a slice that reserves a fourteenth id without writing its row fails the build rather than shipping a silent promise.
- Every cue's `totalMs <= CUE_MAX_MS`; every tone and noise `peak <= CUE_MAX_PEAK`; every tone/noise ends within its cue's `totalMs`.
- `calmCue` never returns `"square"` or `"sawtooth"`; every frequency (including `toFreq`) is `<= CALM_MAX_HZ`; every peak is scaled by exactly `CALM_GAIN`; `calmCue` is idempotent-safe (applying it twice does not scale twice below a floor — asserted as monotonic, not exact).
- `admitCue` rejects the same id inside `CUE_MIN_GAP_MS`, admits it after, and rejects the ninth cue inside one second while admitting the first eight.
- `cueForSpellEvent` maps `cleared → "clear"`, `focusLost → "dazzle"`, `castState{casting:true} → "cast"`, `castState{casting:false} → null`, `mana → null`, `refused → null`.
- `cueForRecessEvent` maps `gleam → "gleam"` and `lapTick → null`.

**`src/lib/utils/realm-settings.test.ts`** — the seven rows of §4.3's table, one case each, plus a clamp case for `tutorial_step: 99` and `tutorial_step: -1`.

**`src/lib/realm/render-settings.test.ts`** — `sound` follows `soundEnabled`; `sound` is unchanged by `lowStimulus` and `reducedMotion`.

**`src/lib/realm/audio.test.ts`** — under jsdom there is no `AudioContext`, so: `createCuePlayer({ enabled: true, calm: false, muted: false })` returns a player whose `play`, `unlock`, `setMuted`, `duck` and `close` are all safe to call and construct nothing; `createCuePlayer({ enabled: false, … })` likewise. A stubbed constructor that throws is caught and yields a silent player.

**`src/components/realm/realm-shell.test.tsx`** — component-level, jsdom, no three (the scene is already dynamically imported and absent under test):

- A bundle with `tutorialStep: null, tutorialDone: false` renders the welcome card; one with `tutorialDone: true` does not.
- `isChildView: false` never renders the welcome card, never calls `saveTutorialStep`, and pressing `?` renders `RealmHelp`.
- **The economy test:** with the tutorial at any step, the side-quest panel opens and its Begin control is enabled. Nothing in the tutorial gates a side quest.
- **The clock test:** `usePlayClock` receives `paused: true` only while the welcome card is up and within the ceiling, and `paused: false` at every later step.
- The ability bar is mounted at step 0 and its Spellbook button is present at every step.
- `helpGroups()` returns no string containing `"protect the sites"`.

### What only the browser can judge, and the checkpoint

Unit tests can prove the cue table is short, soft and low. They cannot prove it is *pleasant*, that `buildingRises` feels like a building going up, or that `dazzle` reads as being hit rather than as an error. They cannot judge whether the flip card feels like a reward. And they cannot tell us whether a six-year-old understands "Drag the stick to walk."

The browser pass, on the documented port-3100 setup:

1. Every cue played in isolation from `/dev/figures` (slice 2's gallery, extended with a cue row), at full and at calm, on a laptop speaker and on a tablet.
2. The whole tutorial run cold on a keyboard, timed with a stopwatch against the 43 s budget.
3. The same on a touch device with `inputMode: "touch"`.
4. The same with `soundEnabled: false`, confirming no `AudioContext` is created (DevTools → no audio node graph).
5. The same with `lowStimulus: true` and `largerText: true`, confirming no clipping at 360 px and audibly softer cues.
6. `readAloud: true`, confirming cues duck under speech and no step's speech is cut off by the next step's.

**CHECKPOINT 3 — the one the user runs, before the last four slices start.** A child plays the whole first five minutes cold: a fresh hero, one five-minute earned grant, no coaching from an adult, once on a touch device and once on a keyboard. What we are watching for, in order: did they move without being told twice; did they find the beacon; did they open the panel themselves; did they come back into the world afterwards; did they notice the building rise; did they cast. If any of those needs an adult's hand, that step's copy is wrong, and the plan is allowed to change before slices 10–13 start.

---

## 8. Interfaces

### Produces

**Pure modules**

`src/lib/realm/tutorial.ts`
```ts
type TutorialStepId = "welcome" | "move" | "find" | "talk" | "quest" | "rise" | "trouble" | "cast"
type TutorialMarker = "none" | "hero" | "objectiveSite" | "objectiveVillager" | "nearestTrouble" | "abilityBar"
type TutorialUnlock = "abilityBar" | "troubleSpawn"
type TutorialStep = { id; index; marker; pausesClock; budgetSeconds; ceilingMs; unlocks }
type TutorialInput = { msInStep; acknowledged; distanceMoved; reachId; objectiveVillagerId; panelOpen;
                       panelOpenedCount; questsFinished; sitesAdvanced; nearestTroubleDistance; cleared }
type TutorialCopyOpts = { touch; heroName; villagerName; siteLabel; companionLabel; troubleName; progress }
const TUTORIAL_STEPS: readonly TutorialStep[]
const TUTORIAL_COMPLETE = 8
const TUTORIAL_START = 0
const TUTORIAL_MOVE_UNITS = 2
const TUTORIAL_TROUBLE_NEAR = 8
const RISE_HOLD_MS = 4000
const WELCOME_PAUSE_CEILING_MS = 20000
const TUTORIAL_WELCOME_TITLE: string
const TUTORIAL_PRIMARY: string
const TUTORIAL_SECONDARY: string
const TUTORIAL_CONTROLS_LINK: string
function tutorialStepAt(index: number): TutorialStep | null
function isTutorialComplete(index: number | null): boolean
function stepAdvances(step: TutorialStep, input: TutorialInput): boolean
function advanceTutorial(index: number, input: TutorialInput): { index: number; changed: boolean; reason: "done" | "ceiling" | null }
function tutorialUnlocked(index: number | null, unlock: TutorialUnlock): boolean
function tutorialBudgetSeconds(): number
function tutorialBanner(step: TutorialStep, opts: TutorialCopyOpts): string
function tutorialSpoken(step: TutorialStep, opts: TutorialCopyOpts): string
```

`src/lib/realm/depth-open.ts`
```ts
type DepthOpenLineId = "numbers" | "objectives" | "abilities" | "travel" | "troubleNames"
type DepthOpenLine = { id: DepthOpenLineId; text: string; spoken: string }
const DEPTH_OPEN_TITLE = "The Realm opens up."
const DEPTH_OPEN_BUTTON = "Let's go"
const DEPTH_OPEN_NONE = "That's everything there is. Go and raise a kingdom."
const DEPTH_OPEN_MS = 5000
function depthOpenLines(before: Surfaces, after: Surfaces): DepthOpenLine[]
function depthOpenSpoken(lines: DepthOpenLine[], heroName: string): string
```

`src/lib/realm/audio-cues.ts`
```ts
type CueId = // 24 ids; the full union is in §3.2. camelCase throughout.
  "talk" | "cast" | "impact" | "clear" | "dazzle" | "questDone"
           | "buildingRises" | "gleam" | "ride" | "oneMinute" | "step" | "open"
type CueWave = "sine" | "triangle" | "square" | "sawtooth"
type CueTone = { wave; freq; toFreq?; startMs; durMs; peak }
type CueNoise = { startMs; durMs; peak; filterHz }
type Cue = { id: CueId; totalMs: number; tones: CueTone[]; noise: CueNoise[] }
type CueGate = { lastAt: Partial<Record<CueId, number>>; recent: number[] }
const CUES: Readonly<Record<CueId, Cue>>
const MASTER_GAIN = 0.18, ATTACK_MS = 12, RELEASE_MS = 40, CUE_MAX_MS = 600, CUE_MAX_PEAK = 0.7
const CALM_GAIN = 0.55, CALM_MAX_HZ = 800, CUE_MIN_GAP_MS = 70, CUE_MAX_PER_SECOND = 8
function cueFor(id: CueId): Cue
function calmCue(cue: Cue): Cue
function newCueGate(): CueGate
function admitCue(gate: CueGate, id: CueId, nowMs: number): { gate: CueGate; play: boolean }
function cueForSpellEvent(e: SpellEvent): CueId | null
function cueForRecessEvent(e: RecessSimEvent): CueId | null
```

`src/lib/realm/audio.ts`
```ts
type CuePlayer = { unlock(): void; play(id: CueId): void; setMuted(muted: boolean): void; duck(ms: number): void; close(): void }
const DUCK_GAIN = 0.35
const MAX_VOICES = 4
function silentCuePlayer(): CuePlayer
function createCuePlayer(opts: { enabled: boolean; calm: boolean; muted: boolean }): CuePlayer
```

**Changed pure modules**

`src/lib/realm/render-settings.ts` — `RenderSettings.sound: boolean`, set by `renderSettingsFor` from `profile.soundEnabled`.
`src/lib/utils/realm-settings.ts` — `RealmTutorialState = { step: number | null; done: boolean }`, `tutorialStateFromRow(row): RealmTutorialState`.

**React**

`src/components/realm/use-realm-audio.ts` → `useRealmAudio({ enabled, calm, muted, rootRef }): { play(id: CueId): void; duck(ms: number): void }`
`src/components/realm/realm-tutorial.tsx` → `RealmTutorial({ step, opts, onAcknowledge, onSkipToEnd, onOpenControls, hidden })`
`src/components/realm/realm-depth-open.tsx` → `RealmDepthOpen({ lines, heroName, calm, readAloud, onClose })`

**Server actions** (`src/lib/actions/realm-settings.ts`, all `async`)
```ts
saveTutorialStep(childId: string, step: number): Promise<void>
replayRealmTutorial(childId: string): Promise<void>
setRealmSoundMuted(childId: string, muted: boolean): Promise<void>
```

**Bundle** (`RealmBundle`, `src/lib/actions/realm.ts`)
```ts
tutorialStep: number | null
tutorialDone: boolean
soundMuted: boolean
```

**Service** — `loadRealmFlags(childId)` return type gains `tutorialStep: number | null`, `tutorialDoneAt: Date | null`, `soundMuted: boolean`. The **full accumulated shape after this slice** is
```ts
loadRealmFlags(childId): Promise<{ helpSeenAt: Date | null; starterSpellAt: Date | null;
                                   tutorialStep: number | null; tutorialDoneAt: Date | null; soundMuted: boolean }>
```
Slice 10 adds `keepNoteSeenAt` and slice 13 adds `regradedAt` to this same object; neither removes a field.

**Schema columns** — `realm_settings.tutorial_step` (integer, nullable), `realm_settings.tutorial_done_at` (integer timestamp, nullable), `realm_settings.sound_muted` (integer boolean, NOT NULL DEFAULT false). Drizzle fields `tutorialStep`, `tutorialDoneAt`, `soundMuted`.

**Message-lane priority** — a new `tutorial` level in slice 1's priority ladder, immediately below `error` and above the one-minute banner.

**CSS classes** — `.realm-tutorial`, `.realm-tutorial-title`, `.realm-tutorial-text`, `.realm-tutorial-actions`, `.realm-tutorial-dots`, `.realm-tutorial-dot`, `.realm-tutorial-dot--done`, `.realm-depth-open`, `.realm-depth-open-line`, `.realm-sound-toggle`. Plus the extension of `.realm-root[data-larger-text="on"] .realm-panel` to include `.realm-tutorial` and `.realm-depth-open`.

**Routes** — none new. Changed surfaces: `/settings` (the Realm panel's depth rows and the walkthrough-replay button; the learning-profile panel's sound hint).

### Consumes

**From slice 1 `first-impression`** — `src/lib/realm/depth.ts`: `RealmDepth = "simple" | "full"`, **`DepthOverride = "auto" | "simple" | "full"`** (three values, not a nullable pair — the column is `text NOT NULL DEFAULT 'auto'` and `'auto'` is the explicit "follow the tutorial" state, which is exactly what this slice's parent control needs to offer as a selectable row), `Surfaces` — the closed thirteen-field table, of which this slice reads `numerals`, `trackedObjectives`, `abilitySlots`, `fastTravel` and `troubleNames` — `realmDepth({ tutorialComplete: boolean; override: DepthOverride }): RealmDepth`, `surfacesFor(depth: RealmDepth, profile: LearningProfile): Surfaces`, and `RealmBundle.depth`. Also `realm_settings.depth_override` and its handling in `validateRealmSettingsPatch`/`RealmSettings.depthOverride`; the centred message lane in `realm-messages.tsx` and its priority ladder; `pickObjective` from `objective.ts`; the beacon, the `!` marker and `edgeArrow`; the gate's "Show me everything" control; `clock.flushPending()` on unmount.

**From slice 3 `ability-bar-and-mount-slot`** — the ability bar component, its empty-socket presentation, the permanent Spellbook button, and `--realm-bar-height` for positioning the tutorial banner above the bar.

**From slice 6 `doors-and-the-tavern`** — the door list, so no tutorial banner ever obscures a door prompt.

**From slice 7 `fast-travel-and-the-companion`** — the companion (for step 2's copy and the "follow me" behaviour) and `Surfaces.fastTravel` for the flip card's `travel` line. Any companion movement across the map uses `roadPath()` from `village.ts`.

**From slice 8 `troubles-that-read-and-pay`** — trouble names for step 6 and 7's copy; the zone-based spawner's `enabled` gate; the extended `SpellEvent` union, specifically `{ kind: "hit"; … }` and `{ kind: "dying"; troubleId: string; troubleKind: TroubleKind }`, which slice 8 §8 publishes and `cueForSpellEvent` maps to `impact` and `clear` respectively; `castState` carrying `slot` and `castMs` (slice 3's widening, which slice 8 preserves); the rewritten Cast help string.

**From slice 4 `village-ground`** — `roadPath()` and `open-ground.ts`'s `SPAWN_ZONES`, both consumed, neither modified.

**Existing code, unchanged in shape** — `speak()` (`src/lib/utils/speech.ts`), `SIDE_QUEST_LOWER` (`src/lib/utils/side-quest-copy.ts`), `helpGroups`/`RealmHelp`, `markRealmHelpSeen`, `requireChildAccess`, `usePlayClock`.

### Contract note

Two names in "Consumes" are asserted rather than observed, because slice 1's spec is being written in parallel with this one: `realmDepth({ tutorialComplete, override })` and `Surfaces`' five field names. If slice 1 lands a different shape, the reconciliation is a rename in `depth-open.ts` and one line in the shell; nothing structural in this slice depends on the spelling.

---

## 9. Out of scope

**Music, ambience and a mixer.** No background music, no wind, no birds, no volume slider. The parent-facing hint is rewritten to say so (§3.3) rather than left promising music that does not exist. If music is ever wanted it is a new slice, not an addition to this one — it needs an asset pipeline, a loop point, a memory budget on tablets, and a duck-under-speech policy far more careful than `DUCK_GAIN`.

**Cues inside the side-quest panel.** Right and wrong answers make no sound. The panel is the schoolwork half of the app, it is shared with the 2D Side Quests page, and putting a wrong-answer sound on a child's maths practice is a decision that deserves its own conversation with the parent — not a side effect of shipping combat audio.

**The visual half of hit feedback** — the hurt flash, the death squash, the dazzle stars, the vignette, the trouble outline. That is slice 8 `troubles-that-read-and-pay`. This slice supplies the sound those moments have been missing and nothing else.

**Recess persistence, gleam counts and lap records.** The `gleam` cue is in the table and wired; making gleams and lap times survive the visit is slice 12 `recess-that-counts`. There is deliberately no `lap` cue here, because slice 12 owns what a lap is worth.

**The session summary.** `RealmClosed` still shows one sentence and a link. Turning it into a record of what the child did — side quests finished, buildings advanced, troubles cleared, and one forward hook — is slice 13 `record-of-the-work`, which also owns the `oneMinute` cue's companion copy ("Finish a quest in the Quest Log to earn more").

**Attribution.** "Raised by Emma · Spring 2026" is slice 13. Nothing here stamps a name into the world.

**The Tavern's sibling board.** Slice 6.

**Re-showing the tutorial on a stale visit.** The audit's fix suggested re-showing step 1 when `helpSeenAt` is older than ~30 days. This slice does not: an automatic re-run of onboarding on a child who has been ill for a month is the patronising failure again, and there is now an explicit parent control ("Play the walkthrough again") and an always-available `?`. If the checkpoint-3 pass shows children genuinely forgetting the controls, a staleness rule is a small follow-up on top of `tutorial_done_at`, which this slice already stores for exactly that reason.

**Any change to the world layout, colliders, spawn zones or the sprite kind count.** Stated explicitly against decision 2's four engineering objections: **(a)** this slice cannot starve enemy spawns — it holds slice 8's zone-based spawner behind a boolean during the first tutorial visit only, releases it through `SPAWN_ZONES` and never by rejection-sampling the world, and the hold does not apply to a resumed tutorial, so a bounced-out child can never leave the world permanently empty; **(b)** it cannot wedge the hero — it adds no prop, no solid and no footprint, so no new geometry grown by `HERO_RADIUS` can intersect a road corridor, and any companion movement it triggers in step 2 uses `roadPath()`; `unstickHero` is unaffected because there is nothing new to be stuck on; **(c)** it cannot re-block first paint — it adds **zero** new sprite kinds against the running total, the whole audio module is ~1.5 KB of JS, and no `AudioContext` exists until a gesture, which is after first paint by definition; if anything it hides first-paint cost behind the paused welcome banner; **(d)** it spawns no gleams and needs no open ground.
