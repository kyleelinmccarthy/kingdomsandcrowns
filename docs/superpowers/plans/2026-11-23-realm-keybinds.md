# Realm keybinds, big map, free look and casting from the saddle: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Every Realm keyboard action becomes rebindable, saved per hero and per visiting grown-up.
- M opens a pausing map of the whole island, and mounting moves to Z.
- A left-drag orbits the camera without turning the hero.
- A spell key in the saddle dismounts, then casts.

**Architecture:**
- **Keys.** A pure action table (`keymap.ts`) is the single source of truth for keys. One
  framework-free input router (`input-router.ts`) turns physical key codes into named actions and
  applies the shared guards. It delivers each action by scope: `island`, `room`, `play` or
  `always`. Every listener, label, hint and line of copy reads the router or the keymap.
  - Scenes inside the R3F `<Canvas>` take the router as a prop, as they already take `bus`.
  - DOM components get it from a React context.
- **Storage.** Keybinds are stored as a JSON diff from the defaults. The child's go in
  `realm_settings.keybinds`; a visiting grown-up's go in `realm_visitor_keybinds`. This mirrors
  the existing sound settings exactly.

**Tech stack:** Next.js App Router, React 19, @react-three/fiber, Drizzle + libSQL, Vitest with
Testing Library.

**Spec:** [`docs/superpowers/specs/2026-11-23-realm-keybinds-design.md`](../specs/2026-11-23-realm-keybinds-design.md).
Read it first. This plan argues from it and does not repeat its reasoning.

## Global Constraints

- **Where the work happens.** Work in the worktree `.claude/worktrees/realm-keybinds` on branch
  `realm-keybinds`, cut from `dev`. Stage only this work's files: the main checkout has another
  session's uncommitted changes.
- **Default keys:**

  | Action | Keys |
  |--------|------|
  | walkForward | `KeyW`, `ArrowUp` |
  | walkBack | `KeyS`, `ArrowDown` |
  | strafeLeft | `KeyA`, `ArrowLeft` |
  | strafeRight | `KeyD`, `ArrowRight` |
  | jump | `Space` |
  | interact | `KeyE` |
  | cast1 to cast9 | `Digit1` to `Digit9` |
  | pause | `KeyP` |
  | map | `KeyM` |
  | mount | `KeyZ` |
  | follow | `KeyF` |

- **At most two keys per action** (`MAX_KEYS = 2`).
- **Bindable codes:**
  - letters and digits: `KeyA`–`KeyZ`, `Digit0`–`Digit9`, `Numpad0`–`Numpad9`;
  - `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Space`, `ShiftLeft`, `ShiftRight`;
  - punctuation: `Backquote`, `Minus`, `Equal`, `BracketLeft`, `BracketRight`, `Semicolon`,
    `Quote`, `Comma`, `Period`, `Slash`, `Backslash`;
  - `Enter`, `Backspace`.

  Everything else is refused. That includes `Escape`, `Tab`, `Control*`, `Alt*`, `Meta*` and
  `F1`–`F12`.
- **Esc is never in the keymap.** It stays the frame's fixed back key (`escapeFrom`). Board-local
  Esc handlers are untouched.
- **Router guards:**
  - Ctrl, Alt or Meta held: the key is ignored.
  - Typing into a field (`typingInto`): ignored, in every scope.
  - Focus inside `[role='dialog']`: ignored in every scope except `always`.
  - Auto-repeat: dropped for actions with `hold: false`.
  - Key up: always delivered.
  - `preventDefault`: only for bound keys, only when no overlay is open.
- **"use server" files export only async functions.** Shared values go in plain modules.
- **After editing `src/lib/db/schema.ts`:** run `npm run db:generate`, then `npm run db:migrate`,
  then check that the migration applied. Never hand-edit `src/lib/db/migrations/`.
- **Tests** sit next to the file they test.
- **The gate for every task:** `npm run lint && npm run typecheck && npm test` passes.
- **Copy** is written for an eight-year-old and names the bound key's label (`keyLabel`), never a
  literal key.
- **Commits** end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

These are the failures most likely to bite a child at play that the spec implies but doesn't
spell out. Each one is pinned by a test in the task that owns it.

1. **A walk key held through a door or a menu and released while paused** must not leave the hero
   walking. The key up is always delivered (Task 2).
2. **Rebinding a key that is held down**, for example moving Walk forward off W while holding W,
   must not leave the action stuck held. `setKeymap` releases every held action whose keys
   changed (Task 2).
3. **A stored keymap that no longer fits the table:** an override that now clashes with a newer
   action's default, an unknown action id, or a code that is now reserved. It must load without
   error. Stored overrides win over defaults. An action left with no keys shows `—` and can be
   rebound (Task 1).
4. **A left-drag that starts on the world and is released over a HUD button** must neither
   capture the mouse nor click the button (Task 8).
5. **A spell key pressed while the hero is already getting down (`"down"`)** must queue the cast
   and fire it once on foot, without asking for a second dismount (Task 5).

---

### Task 0: Branch, worktree, and the docs

**Files:**
- Copy in: `docs/superpowers/specs/2026-11-23-realm-keybinds-design.md` and
  `docs/superpowers/plans/2026-11-23-realm-keybinds.md`. Both are untracked in the main checkout.

- [ ] **Step 1:** Create the worktree and branch:
  `git worktree add .claude/worktrees/realm-keybinds -b realm-keybinds dev`.
- [ ] **Step 2:** Copy the spec and plan into the worktree. Then run `npm install` there.
- [ ] **Step 3:** In the worktree, run `npm run typecheck && npm test`.
  Expected: green baseline.
- [ ] **Step 4: Commit.**

  ```bash
  git add docs/superpowers/specs/2026-11-23-realm-keybinds-design.md docs/superpowers/plans/2026-11-23-realm-keybinds.md
  git commit -m "docs(realm): keybinds, big map, free look and saddle casting - design and plan"
  ```

---

### Task 1: The action table, `keymap.ts`

**Files:**
- Create: `src/lib/realm3d/keymap.ts` and `src/lib/realm3d/keymap.test.ts`.

**Interfaces:**
- Produces:

  ```ts
  export type CastAction = "cast1" | "cast2" | "cast3" | "cast4" | "cast5" | "cast6" | "cast7" | "cast8" | "cast9";
  export type ActionId = "walkForward" | "walkBack" | "strafeLeft" | "strafeRight" | "jump" | "interact"
    | CastAction | "pause" | "map" | "mount" | "follow";
  export type ActionGroup = "move" | "act" | "spells" | "menus";
  export type ActionDef = { id: ActionId; label: string; group: ActionGroup; defaults: readonly string[]; hold: boolean };
  export const ACTIONS: readonly ActionDef[];             // table order = precedence order
  export const MAX_KEYS = 2;
  export type Keymap = Readonly<Record<ActionId, readonly string[]>>;
  export const WALK_ACTIONS: readonly ["walkForward", "walkBack", "strafeLeft", "strafeRight"];
  export function defaultKeymap(): Keymap;
  export function isBindable(code: string): boolean;
  export function keymapFrom(raw: unknown): Keymap;        // object, JSON string, null or garbage
  export function keymapToStored(k: Keymap): string | null; // null when every action is default
  export type BindResult = { ok: true; keymap: Keymap; displaced: ActionId | null } | { ok: false; reason: "reserved" };
  export function bind(k: Keymap, action: ActionId, slot: 0 | 1, code: string): BindResult;
  export function actionIndex(k: Keymap): ReadonlyMap<string, ActionId>; // memoised per keymap object (WeakMap)
  export function castAction(slot: number): CastAction | null;  // 1..9
  export function castSlotOf(action: ActionId): number;         // 0 if not a cast
  export function keyLabel(code: string): string;
  export function primaryLabel(k: Keymap, action: ActionId): string; // first key's label, or "—"
  export function keysLabels(k: Keymap, action: ActionId): string[];
  ```

- `hold: true` only for the four walk actions.

- **Labels** (the controls panel shows these):

  | Action | Label |
  |--------|-------|
  | walkForward | "Walk forward" |
  | walkBack | "Walk back" |
  | strafeLeft | "Step left" |
  | strafeRight | "Step right" |
  | jump | "Jump" |
  | interact | "Talk or look" |
  | castN | "Cast spell N" |
  | pause | "Pause" |
  | map | "Open the map" |
  | mount | "Get on or off your mount" |
  | follow | "Follow your companion" |

- **Groups:**
  - `move`: the walks and jump;
  - `act`: interact, mount, follow;
  - `spells`: the casts;
  - `menus`: pause and map.

- [ ] **Step 1: Write the failing tests** in `keymap.test.ts`:

  ```ts
  it("defaults are bindable and unique", () => {
    const k = defaultKeymap();
    const all = ACTIONS.flatMap((a) => k[a.id]);
    expect(new Set(all).size).toBe(all.length);
    expect(all.every(isBindable)).toBe(true);
    expect(k.mount).toEqual(["KeyZ"]);
    expect(k.map).toEqual(["KeyM"]);
  });
  it("refuses reserved codes", () => {
    for (const c of ["Escape", "Tab", "ControlLeft", "AltLeft", "MetaLeft", "F5", "F12"]) expect(isBindable(c)).toBe(false);
    expect(isBindable("ShiftLeft")).toBe(true);
  });
  it("keymapFrom survives garbage", () => {
    for (const raw of [null, "", "{", "[]", 42, { jump: "Space" }, { nope: ["KeyQ"] }]) expect(keymapFrom(raw)).toEqual(defaultKeymap());
  });
  it("drops reserved and excess codes from an override", () => {
    expect(keymapFrom({ jump: ["Escape", "KeyJ", "KeyK", "KeyL"] }).jump).toEqual(["KeyJ", "KeyK"]);
  });
  it("an override wins a clash with a default; the loser keeps what is left", () => {
    const k = keymapFrom({ jump: ["KeyW"] });
    expect(k.jump).toEqual(["KeyW"]);
    expect(k.walkForward).toEqual(["ArrowUp"]);
  });
  it("two overrides clash: first in table order wins, the other may end up unbound", () => {
    const k = keymapFrom({ jump: ["KeyQ"], interact: ["KeyQ"] });
    expect(k.jump).toEqual(["KeyQ"]);
    expect(k.interact).toEqual([]);
    expect(primaryLabel(k, "interact")).toBe("—");
  });
  it("stores only the diff, and round-trips", () => {
    expect(keymapToStored(defaultKeymap())).toBeNull();
    const k = keymapFrom({ mount: ["KeyM"], map: ["KeyN"] });
    expect(JSON.parse(keymapToStored(k)!)).toEqual({ mount: ["KeyM"], map: ["KeyN"] });
    expect(keymapFrom(keymapToStored(k))).toEqual(k);
  });
  it("bind swaps a taken key and says who moved", () => {
    const r = bind(defaultKeymap(), "mount", 0, "KeyM");
    expect(r).toMatchObject({ ok: true, displaced: "map" });
    if (r.ok) { expect(r.keymap.mount).toEqual(["KeyM"]); expect(r.keymap.map).toEqual(["KeyZ"]); }
  });
  it("bind into slot 1 adds a second key; reserved is refused", () => {
    const r = bind(defaultKeymap(), "jump", 1, "KeyJ");
    expect(r.ok && r.keymap.jump).toEqual(["Space", "KeyJ"]);
    expect(bind(defaultKeymap(), "jump", 0, "Escape")).toEqual({ ok: false, reason: "reserved" });
  });
  it("binding a key to the action that already has it changes nothing", () => {
    const r = bind(defaultKeymap(), "jump", 0, "Space");
    expect(r).toMatchObject({ ok: true, displaced: null });
  });
  it("labels", () => {
    expect([keyLabel("KeyZ"), keyLabel("Digit3"), keyLabel("ArrowUp"), keyLabel("Space"), keyLabel("ShiftLeft"), keyLabel("Numpad4")])
      .toEqual(["Z", "3", "↑", "Space", "Left Shift", "Num 4"]);
  });
  it("index and casts", () => {
    expect(actionIndex(defaultKeymap()).get("KeyZ")).toBe("mount");
    expect(castAction(3)).toBe("cast3");
    expect(castAction(0)).toBeNull();
    expect(castSlotOf("cast7")).toBe(7);
    expect(castSlotOf("jump")).toBe(0);
  });
  ```

- [ ] **Step 2:** Run `npx vitest run src/lib/realm3d/keymap.test.ts`.
  Expected: FAIL, module not found.
- [ ] **Step 3: Implement `keymap.ts`.**
  - **`keymapFrom`:** parse the input. Then, for each action in table order, take the stored
    override if it is a valid array, otherwise the defaults. Filter with `isBindable`, dedupe, and
    cap at `MAX_KEYS`. Resolve clashes in two passes:
    1. overrides claim their codes, in table order;
    2. defaults take only codes still free.
  - **`bind`:** if `code` sits on another action's key, that action takes the code being replaced
    in its own slot. If there is none (slot 1 was empty), it just loses the key.
  - Write a module doc comment in the file's established voice: what it is, and why Esc and Ctrl
    are excluded.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit.**
  `git commit -m "feat(realm): the action table - every Realm key in one rebindable keymap"`

---

### Task 2: The input router

**Files:**
- Create: `src/lib/realm3d/input-router.ts` and `src/lib/realm3d/input-router.test.ts`.

**Interfaces:**
- Consumes: Task 1's `Keymap`, `ActionId`, `ACTIONS`, `actionIndex` and `WALK_ACTIONS`; and
  `typingInto` from `./typing`.
- Produces:

  ```ts
  export type Scope = "island" | "room" | "play" | "always";
  export type ActionEvent = { action: ActionId; down: boolean; repeat: boolean };
  export type RouterTarget = {
    addEventListener(type: string, fn: (e: any) => void, capture?: boolean): void;
    removeEventListener(type: string, fn: (e: any) => void, capture?: boolean): void;
  };
  export type InputRouter = {
    readonly keymap: Keymap;
    on(actions: ActionId | readonly ActionId[], fn: (e: ActionEvent) => void, scope: Scope): () => void;
    setKeymap(k: Keymap): void;
    onKeymap(fn: (k: Keymap) => void): () => void;
    setState(s: { overlay: boolean; inside: boolean }): void;
    held(action: ActionId): boolean;
    /** While true (a rebind is listening), no key reaches a subscriber and none is prevented. */
    suspend(on: boolean): void;
    dispose(): void;
  };
  export function createInputRouter(target: RouterTarget, keymap: Keymap, blocked?: (t: EventTarget | null, scope: Scope) => boolean): InputRouter;
  export function blockedTarget(t: EventTarget | null, scope: Scope): boolean; // typingInto(t) || (scope !== "always" && inside [role='dialog'])
  export function seedMoves(r: InputRouter, k: { f: boolean; b: boolean; l: boolean; r: boolean }): void; // only turns keys ON
  ```

- **Which scopes hear a key down:**

  | Scope | Delivered when |
  |-------|----------------|
  | `island` | no overlay and not inside |
  | `room` | no overlay and inside |
  | `play` | no overlay |
  | `always` | any time |

- **Held state** is tracked per physical code across all scopes, on capture-phase
  `keydown`/`keyup`. It is updated even while suspended or blocked, because it is the truth about
  the keyboard. `held(action)` is true if any of the action's codes is held.
- **On window `blur`:** clear the held codes and send `down: false` to every subscriber of each
  action that was held.

- [ ] **Step 1: Write the failing tests.** Use a fake target like `target()` in
  `look-input.test.ts`; events are `{ code, repeat, ctrlKey, altKey, metaKey, target, preventDefault }`.
  Write one `it` per line:
  - a bound key down in scope `island` with state `{ overlay: false, inside: false }` reaches the
    subscriber as `{ action, down: true, repeat: false }`, and `preventDefault` is called;
  - an unbound key is never prevented and reaches nobody;
  - with `inside: true`, `island` subscribers get nothing, and `room` and `play` subscribers do;
  - with `overlay: true`, only `always` subscribers get the key down, and `preventDefault` is not
    called;
  - a key up is delivered to every subscriber of the action whatever the scope and state
    (**Review Focus 1**): key down W while playing, then `setState({ overlay: true })`, then key
    up W reaches the `island` subscriber with `down: false`;
  - `ctrlKey`, `altKey` or `metaKey` true: no delivery;
  - with a target for which `typingInto` is true: no delivery in any scope, `always` included;
  - with a target inside `[role='dialog']`: `always` gets the key, `play` does not (use a real
    jsdom element);
  - `repeat: true`: dropped for `jump`, delivered for `walkForward`;
  - `setKeymap(bind(...).keymap)` that moves `walkForward` off `KeyW` while W is held: the
    subscriber gets `down: false` for `walkForward`, and `held("walkForward")` becomes false
    (**Review Focus 2**);
  - `onKeymap` fires on `setKeymap`;
  - `suspend(true)`: nothing is delivered or prevented, but `held` still tracks;
  - `blur`: every held action gets `down: false`;
  - `seedMoves` sets `k.f` while `ArrowUp` is held, and never clears a key;
  - `dispose` removes every listener (`listeners()` is 0).
- [ ] **Step 2:** Run `npx vitest run src/lib/realm3d/input-router.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement it.**
  - One `keydown`, one `keyup` and one `blur` listener, on capture.
  - Subscribers live in `Map<ActionId, Set<{ fn, scope }>>`.
  - The code lookup goes through `actionIndex(keymap)`.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Commit.**
  `git commit -m "feat(realm): one input router - keys become actions, with the guards in one place"`

---

### Task 3: The scenes listen to the router; `held-keys.ts` goes

**Files:**
- Create: `src/components/realm3d/realm-input.tsx`, holding the context, `useRealmInput`,
  `useAction` and `useKeymap`.
- Modify:
  - `src/components/realm3d/realm-game.tsx`: create the router, provide it, call `setState`
    beside `bus.setPaused`, and pass `router` to the scenes;
  - `src/components/realm3d/spike-scene.tsx:1131-1175`;
  - `src/components/realm3d/interior-scene.tsx:194-225`;
  - `src/components/realm3d/riding-scene.tsx:254,261`;
  - the tutorial's hands listener in `src/components/realm3d/realm-game.tsx:566-590`.
- Delete: `src/lib/realm3d/held-keys.ts` and `src/lib/realm3d/held-keys.test.ts`.
- Test: `src/components/realm3d/realm-input.test.tsx`; also update `realm-rooms.test.tsx` and
  `realm-game.test.tsx` where they fire raw keys.

**Interfaces:**
- Consumes: Task 2's `createInputRouter`, `InputRouter`, `seedMoves` and `blockedTarget`.
- Produces:

  ```ts
  export function RealmInputProvider(p: { router: InputRouter; children: React.ReactNode }): JSX.Element;
  export function useRealmInput(): InputRouter;   // throws outside the provider
  /** Subscribes for the component's life; `fn` is read through a ref, so it may change every render. */
  export function useAction(router: InputRouter, actions: ActionId | readonly ActionId[], fn: (e: ActionEvent) => void, scope: Scope, enabled?: boolean): void;
  export function useKeymap(router: InputRouter): Keymap; // useSyncExternalStore over onKeymap
  ```

- **Inside `<Canvas>`,** scenes take `router: InputRouter` as a prop, as they take `bus`.
  React context does not cross the R3F reconciler.

**Steps:**

- [ ] **Step 1: Write the failing test** `realm-input.test.tsx`:
  - `useAction` receives a key down for its scope, and stops receiving after unmount;
  - a changed `fn` prop is used without re-subscribing;
  - `useKeymap` re-renders after `router.setKeymap`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement `realm-input.tsx`.**
- [ ] **Step 4: Wire the router through the game.**
  - **`realm-game.tsx`:** create the router once with `useState(() => createInputRouter(window,
    defaultKeymap(), blockedTarget))` and dispose it on unmount. Wherever the frame writes
    `bus.setPaused`, also call `router.setState({ overlay: overlay !== null, inside })`.
  - **Island scene:** subscribe `WALK_ACTIONS`, `jump`, `interact` and `cast1`–`cast9` with scope
    `island`, then delete its `keydown`/`keyup`/`blur` effect. Casts keep today's
    `castBlocked`/`pushCast` path for now; Task 5 changes it.
  - **Room scene:** the same, with scope `room`, and `seedMoves(router, keys.current)` on mount.
  - **`riding-scene.tsx`:** call `seedMoves(router, keys.current)` where `seedMoves` was called,
    and drop `holdKeys`.
  - **Tutorial listener:** subscribe `WALK_ACTIONS` and `jump` with scope `island`. Map the walk
    actions to the lesson's `MOVE_KEYS` letters through a fixed record:
    `walkForward → "W"`, `walkBack → "S"`, `strafeLeft → "A"`, `strafeRight → "D"`.
  - Delete `held-keys.ts` and its test.
- [ ] **Step 5:** Run `npm run lint && npm run typecheck && npm test`. Expected: PASS. Tests that
  fire `keydown` on `window` still pass, because the router listens on `window`.
- [ ] **Step 6: Commit.**
  `git commit -m "refactor(realm): the scenes hear keys as actions from the router; held-keys folded into it"`

---

### Task 4: Riding, the companion and pause listen to the router (mount moves to Z)

**Files:**
- Modify:
  - `src/components/realm3d/riding-hud.tsx:220-232`;
  - `src/components/realm3d/companion-hud.tsx:250-262`;
  - `src/components/realm3d/use-pause.ts:121-128`.
- Test: update `realm-riding.test.tsx` (M becomes Z), the companion tests, and
  `realm-pause.test.tsx`.

**Interfaces:**
- Consumes: Task 3's `useRealmInput` and `useAction`.

**Steps:**

- [ ] **Step 1:** Update the tests first:
  - `realm-riding.test.tsx` presses `KeyZ` where it pressed `KeyM`;
  - add one test: `KeyM` no longer mounts;
  - add one test: a remapped mount key (`router.setKeymap(bind(defaultKeymap(), "mount", 0, "KeyG").keymap)`) mounts on G.
- [ ] **Step 2:** Run them. Expected: FAIL (Z does nothing yet).
- [ ] **Step 3: Switch the listeners to the router.**
  - **Riding:** `useAction(router, "mount", e => e.down && toggle(), "play")`.
  - **Companion:** `useAction(router, "follow", ..., "play")`.
  - **Pause:** `useAction(router, "pause", ..., "always")`. It keeps today's body: open from
    play, resume from `pause`, nothing under any other overlay.
  - Delete the three raw `keydown` effects and their per-listener guards. The router does that
    now.
- [ ] **Step 4:** Run the full suite. Expected: PASS.
- [ ] **Step 5: Commit.**
  `git commit -m "feat(realm): mount moves to Z; riding, follow and pause hear their actions from the router"`

---

### Task 5: A spell in the saddle gets you down, then casts

**Files:**
- Modify:
  - `src/lib/realm3d/riding.ts`: `RideBus`, `makeRideBus`, `castBlocked`, `stepRide`, `parkNow`
    and the travel start; delete `CAST_FROM_SADDLE`;
  - `src/components/realm3d/riding-scene.tsx:291-307`;
  - `src/components/realm3d/riding-hud.tsx:234-239`;
  - `src/components/realm3d/spike-scene.tsx` (the cast subscription from Task 3);
  - `src/components/realm3d/realm-game.tsx:976-979`.
- Test: `src/lib/realm3d/riding.test.ts` and `realm-riding.test.tsx`.

**Interfaces:**
- Consumes: `pushCast` and `CastQueue` from `casting.ts`.
- Produces, in `riding.ts`:

  ```ts
  // RideBus gains: castAfter: number   (0 = none; a spell slot 1..9 waiting for the ground)
  export type CastAsk = "cast" | "dismounting" | "travelling";
  export function requestCast(ride: RideBus | null | undefined, q: CastQueue, slot: number): CastAsk;
  export function takeCastAfter(ride: RideBus): number;   // returns and clears
  export function dropCastAfter(ride: RideBus): void;
  export const CAST_ON_THE_ROAD = "Spells wait until the ride is over.";
  ```

- **`castBlocked(ride)`** now means `!!ride && ride.travelling`.
- **`requestCast` rules:**
  - travelling: returns `"travelling"`;
  - phase `"off"` or no ride: `pushCast(q, slot)` and returns `"cast"`;
  - otherwise: sets `castAfter = slot`; if the phase is `"on"`, also sets `want = false`;
    returns `"dismounting"`.
- **`stepRide`:**
  - on the `up → on` transition, if `castAfter > 0`, set `want = false`, so the next step begins
    getting down;
  - when it returns `"refused-deep"`, clear `castAfter`.
- **`parkNow`** and the travel start each call `dropCastAfter`.

**Steps:**

- [ ] **Step 1: Write the failing tests** in `riding.test.ts`:
  - `requestCast` on foot pushes onto the queue and returns `"cast"`;
  - on `"on"`: returns `"dismounting"`, `castAfter` is the slot, `want` is false, and the queue is
    empty;
  - run `stepRide` until it returns `"dismounted"`: `takeCastAfter` returns the slot, then 0;
  - **Review Focus 5:** on `"down"`, `requestCast` returns `"dismounting"` without touching
    `want`, and the dismount completes once with `castAfter` kept;
  - on `"up"`, `requestCast` keeps the slot; stepping through `"on"` starts the dismount with no
    further input;
  - deep water: `stepRide` returns `"refused-deep"` and `castAfter` is 0;
  - a newer `requestCast` replaces the older slot;
  - travelling returns `"travelling"` and queues nothing;
  - `parkNow` clears `castAfter`.
- [ ] **Step 2:** Run `npx vitest run src/lib/realm3d/riding.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement the `riding.ts` changes.**
- [ ] **Step 4: Wire it in.**
  - **Island scene and HUD click:** the island scene's cast subscription and `realm-game`'s
    `onCast` both call `requestCast(ride, casts, slot)`. On `"travelling"`, say
    `CAST_ON_THE_ROAD` and play `ride.sound.onRefuse()`.
  - **`riding-scene.tsx`:** on `"dismounted"`, `const n = takeCastAfter(ride); if (n) pushCast(casts, n);`.
    Pass `casts` into `RidingScene` as a prop.
  - **`riding-hud.tsx`:** call `dropCastAfter(ride)` when `bus.paused` turns true (an effect
    keyed on the overlay), and delete `refuseCast`.
- [ ] **Step 5: Add a component test** to `realm-riding.test.tsx`: mounted, press `Digit1`. The
  hero gets down, and the cast handler fires once after the dismount moment. Advance the frame
  loop the way the file's existing tests do.
- [ ] **Step 6:** Run the full suite. Expected: PASS.
- [ ] **Step 7: Commit.**
  `git commit -m "feat(realm): a spell from the saddle gets you down and then casts"`

---

### Task 6: The big map (M)

**Files:**
- Create:
  - `src/components/realm3d/map-layers.tsx`: the shared SVG layers and `useBakedLand`, moved out
    of `hud.tsx`;
  - `src/components/realm3d/world-map.tsx`: the panel;
  - `src/components/realm3d/world-map.css`.
- Modify:
  - `src/components/realm3d/hud.tsx:30-200`: `Minimap` renders `MapLayers`;
  - `src/lib/realm3d/minimap.ts`: gains `glyphScaleFor`;
  - `src/lib/realm3d/frame.ts:129`: `Overlay` gains `{ kind: "map" }`;
  - `src/lib/realm3d/hud-bus.ts`: `MapMarks`;
  - `src/components/realm3d/troubles-hud.tsx` and `src/components/realm3d/recess-hud.tsx`:
    register mark sources;
  - `src/components/realm3d/realm-game.tsx`: render the panel and subscribe `map`.
- Test:
  - `src/components/realm3d/world-map.test.tsx`;
  - `src/lib/realm3d/minimap.test.ts`;
  - `src/lib/realm3d/hud-bus.test.ts`;
  - `src/lib/realm3d/frame.test.ts`.

**Interfaces:**
- Produces:

  ```ts
  // minimap.ts
  export const MAP_VIEW = 100;                                   // moved from hud.tsx's `MAP`
  export function glyphScaleFor(window: number): number;          // window / MAP_VIEW; glyphScaleFor(MAP_WINDOW) equals hud.tsx's old GLYPH_SCALE
  // hud-bus.ts
  export type MapMark = { id: string; x: number; z: number; kind: "trouble" | "ring"; label: string };
  // HudBus gains:
  addMapMarks(source: () => readonly MapMark[]): () => void;
  mapMarks(): MapMark[];                                         // every source, concatenated, read now
  // map-layers.tsx
  export function useBakedLand(world: RealmWorld): string | null;
  export function MapLayers(p: { world: RealmWorld; land: string | null; found: ReadonlySet<string>; castle: boolean; goal: Goal; glyphScale: number; children?: ReactNode }): JSX.Element;
  // world-map.tsx
  export function WorldMap(p: { world: RealmWorld; found: ReadonlySet<string>; castle: boolean; goal: Goal; marks: readonly MapMark[];
    hero: { x: number; z: number; facing: number }; onClose: () => void }): JSX.Element;
  ```

- **The panel:**
  - uses the existing `Panel` (`frame-hud.tsx:388`), titled "Map of the island";
  - SVG `viewBox` is `-WORLD_HALF -WORLD_HALF 2*WORLD_HALF 2*WORLD_HALF`;
  - the hero arrow is rotated by `headingDegrees(facing)`;
  - a visually hidden `<ul>` lists the found places' names.
- **The hero:** `realm-game` reads `heroRef.current` and `facingRef.current` once, when the
  overlay opens. When inside a building, use the door's island position, the one the frame
  already keeps to set the hero down on the way out.
- **The `map` subscription** in `realm-game`, scope `always`:
  - from play, open `{ kind: "map" }`;
  - with `overlay?.kind === "map"`, close to `null`;
  - under any other overlay, do nothing.
- **Esc** closes it through the existing `escapeFrom`, whose default branch returns null.

**Steps:**

- [ ] **Step 1: Write the failing tests.**
  - `minimap.test.ts`: `glyphScaleFor(MAP_WINDOW)` equals `MAP_WINDOW / 100`, and
    `glyphScaleFor(2 * WORLD_HALF) > glyphScaleFor(MAP_WINDOW)`.
  - `hud-bus.test.ts`: two sources concatenate; the remover drops its source; `mapMarks()`
    calls each source at the time of the call.
  - `frame.test.ts`: `escapeFrom({ kind: "map" })` is `null`.
  - `world-map.test.tsx`:
    - it renders a dialog named "Map of the island";
    - found landmarks are listed by name, unfound ones are not;
    - a mark from `marks` is drawn;
    - the hero arrow's transform contains the expected rotation.
  - `realm-game.test.tsx`:
    - `KeyM` opens the map and pauses (`bus.paused` true);
    - `KeyM` again closes it;
    - `Escape` closes it;
    - `KeyM` under the pause menu does nothing.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Move `useBakedLand` and the layers into `map-layers.tsx`. `Minimap` renders
  `<MapLayers glyphScale={glyphScaleFor(MAP_WINDOW)}>{extras}</MapLayers>` inside its existing
  panning group. It must look exactly the same as before.
- [ ] **Step 4: Register the mark sources.**
  - `troubles-hud.tsx` and `recess-hud.tsx` each call `bus.addMapMarks(...)` in an effect.
  - Each source returns the positions those components already compute to place their
    per-frame minimap marks. Use the same data source; do not read the DOM.
- [ ] **Step 5:** Build `WorldMap` and wire up the overlay and the subscription.
- [ ] **Step 6:** Run the full suite. Expected: PASS.
- [ ] **Step 7: Check it by eye.**
  - Start a dev server with `NEXT_DIST_DIR=.next-agent`. See the
    `reference_local_screenshot_setup` memory: kill it by process group, and never capture the
    mouse in headless Chromium.
  - Use the `.superpowers/tools` screenshot tooling to shoot `/realm` with the map open.
  - Expected: the whole island, legible glyphs, the hero arrow pointing the right way.
- [ ] **Step 8: Commit.**
  `git commit -m "feat(realm): M opens a map of the whole island"`

---

### Task 7: Every surface names the bound key

**Files:**
- Modify:
  - `src/lib/realm3d/frame.ts:185-240`: `controlRows` and `keyHints`;
  - `src/lib/realm3d/tutorial.ts:60-71,190-221`;
  - `src/lib/realm3d/riding.ts`;
  - `src/components/realm3d/riding-hud.tsx:170,261,341`;
  - `src/components/realm3d/companion-hud.tsx:53-69,339`;
  - `src/components/realm3d/frame-hud.tsx:75,121,543,561`;
  - `src/components/realm3d/hud.tsx:312,331,567`;
  - `src/components/realm3d/guide-hud.tsx:72`.
- Test: `src/lib/realm3d/frame.test.ts`, `src/lib/realm3d/tutorial.test.ts`, and the affected
  component tests.

**Interfaces:**
- Consumes: Task 1's `primaryLabel`, `keysLabels` and `ACTIONS`; Task 3's `useKeymap`.
- Produces:

  ```ts
  // frame.ts — the keymap is the first argument now
  export type ControlRow = { keys: string[]; what: string; action?: ActionId }; // action set on keyboard rows; Task 10 makes those editable
  export function controlRows(k: Keymap, slots: number, opts?: { mount?: boolean; pet?: string | false }): ControlRow[];
  export function keyHints(k: Keymap, slots: number, opts?: { mount?: boolean; pet?: boolean }): { key: string; what: string }[];
  // tutorial.ts
  export function lessonCopy(done: number, ctx: LessonContext, k: Keymap): LessonCopy | null;
  export function tutorialDone(k: Keymap): string;      // replaces TUTORIAL_DONE: `Press ${pause} or Esc any time to pause.`
  export function lessonKeys(lesson: Lesson, k: Keymap): string[]; // replaces the literal `keys` labels for walk/jump/talk/cast
  // companion and riding copy: the constants that name a key become functions taking the label, e.g.
  export function mountFirstLine(label: string, key: string): string; // `Get on your ${label} first. Press ${key}.`
  ```

- **`controlRows` order:**
  1. one Walk row (keys = the four walk primaries; `what` unchanged);
  2. Jump;
  3. the mouse rows: Click, Left drag, Right drag, Wheel. `Left drag`'s `what` is
     "Swing the camera round to see your hero's face.";
  4. Interact;
  5. Cast: the label shows `primaryLabel(cast1)` to `primaryLabel(castN)` when they are
     consecutive digits; otherwise each is listed;
  6. **Map: always shown**, `what` "Open the map of the island.";
  7. Mount and Follow, with today's copy, both always shown. For a visitor (`mount` and `pet`
     undefined): "Your hero gets on or off their mount." and "Your hero's companion shows the
     way.";
  8. Pause and Esc.
- **`keyHints`:**
  - Map is always shown, `what` "map";
  - Mount is shown when `opts.mount`;
  - Follow is shown when `opts.pet`.

**Steps:**

- [ ] **Step 1: Write the failing tests.**
  - `frame.test.ts`:
    - with `bind(defaultKeymap(), "jump", 0, "KeyJ")`, the Jump row's keys are `["J"]`;
    - a visitor's rows include a Map row, a Mount row with keys `["Z"]`, and a Follow row with
      keys `["F"]`;
    - `keyHints(defaultKeymap(), 3, {})` includes `{ key: "M", what: "map" }` and no `"Z"`.
  - `tutorial.test.ts`:
    - the ride lesson reads "Press Z to get on, and Z again to get off.";
    - with jump on J, the jump lesson says "Press J.";
    - `tutorialDone(defaultKeymap())` is "You know the Realm! Press P or Esc any time to pause."
  - In a component test, a spell slot's keycap shows `primaryLabel(k, "castN")`.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - Each component gets the keymap via `useKeymap(useRealmInput())` and passes labels into the
    copy functions.
  - Remove every literal key name listed in this task's Files.
  - Run `grep -rnE '"(Press|press) [A-Z]\b|>M<|>F<|"M"|"F"' src/components/realm3d src/lib/realm3d`.
    Expected: only test files.
- [ ] **Step 4:** Run the full suite. Expected: PASS.
- [ ] **Step 5: Commit.**
  `git commit -m "feat(realm): every control list, hint and line names the key you actually have"`

---

### Task 8: Left-drag free look

**Files:**
- Modify:
  - `src/lib/realm3d/look-input.ts:200-245`: left button handling, the `sink` mode, `orbiting`;
  - `src/lib/realm3d/controls.ts`: `LookState`, `looking`, and new `walkYaw`;
  - `src/components/realm3d/mouse-look.tsx:44-85`;
  - `src/components/realm3d/spike-scene.tsx:687,717`;
  - `src/components/realm3d/interior-scene.tsx:590,616`;
  - `src/components/realm3d/doorstep.tsx:135`;
  - `src/lib/realm3d/tutorial.ts` `countsAsLook`, so a left-drag counts toward the look lesson.
- Test: `src/lib/realm3d/look-input.test.ts`, `src/lib/realm3d/controls.test.ts` and
  `src/lib/realm3d/tutorial.test.ts`.

**Interfaces:**
- Produces:

  ```ts
  // look-input.ts
  export type LookMode = "turn" | "orbit";
  export type LookSink = (dxPx: number, dyPx: number, mode: LookMode) => void;
  export const CLICK_SLOP = 4; // px of movement before a left press is a drag, not a click
  // MouseLook gains: readonly orbiting: boolean
  // controls.ts
  // LookState gains: orbiting: boolean   (orbit looks do NOT update lastLookAt)
  export function walkYaw(cameraYaw: number, facing: number, orbiting: boolean, riding: boolean): number;
  // orbiting && !riding → wrapAngle(facing + Math.PI), so cameraFacing(walkYaw(...)) === facing; else cameraYaw
  export function countsAsLook(buttons: number, captured: boolean): boolean; // now (buttons & 3) !== 0 || captured
  ```

- **Mouse rules** (spec §4.7):

  | Input | Result |
  |-------|--------|
  | Left down, mouse free | start a pending press (pointer capture) |
  | Moved more than `CLICK_SLOP`, mouse free | it is a drag: every move is sent as `"orbit"`, and `orbiting` is true |
  | Left up after a drag | end it, no capture request |
  | Left up with no drag | `request()` (capture) |
  | Left held while captured | captured moves are `"orbit"` |
  | Right drag | `"turn"`, as today |
  | Captured with no button held | `"turn"`, as today |

- **`mouse-look.tsx`:**
  - the sink applies `lookBy` for both modes;
  - it sets `v.lastLookAt` only for `"turn"`;
  - `tick` writes `view.current.orbiting = l.orbiting`;
  - `markHeld` uses `l.captured && !l.orbiting || l.dragging`, where `dragging` means a right drag
    only.
- **Scenes:** `moveIntent(intent, walkYaw(yawRef.current, facingRef.current, view.current.orbiting, isRiding(ride)), k)`.
  The room scene and the doorstep pass `riding = false`.

**Steps:**

- [ ] **Step 1: Write the failing tests.**
  - `look-input.test.ts`, one `it` each:
    - a left down, a 10 px move, then up: the sink gets `"orbit"`, and `requestPointerLock` is
      never called;
    - a left down, a 2 px move, then up: `requestPointerLock` is called once, on up, not on down;
    - **Review Focus 4:** a left drag released elsewhere calls neither `requestPointerLock` nor
      `preventDefault` on a `click`. Assert there is no capture request, and that `orbiting` is
      false after up;
    - while captured, a `pointerdown` with button 0 followed by `mousemove` sends `"orbit"`;
      after `pointerup` it sends `"turn"`;
    - a right drag still sends `"turn"`.
  - `controls.test.ts`:
    - `cameraFacing(walkYaw(0.3, 1.2, true, false))` is close to `1.2`;
    - `walkYaw(0.3, 1.2, true, true)` is `0.3`;
    - `walkYaw(0.3, 1.2, false, false)` is `0.3`;
    - `looking({ ..., held: false, lastLookAt: -1e9, orbiting: true }, 5)` is false.
  - `tutorial.test.ts`: `countsAsLook(1, false)` is true.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.** Update each existing `LookState` literal to include
  `orbiting: false`.
- [ ] **Step 4:** Run the full suite. Expected: PASS.
- [ ] **Step 5: Check by hand in Chrome and Firefox on the dev server.** This needs a real mouse;
  per the memory note, never use pointer lock in headless Chromium.
  - A click captures the mouse.
  - A drag orbits to the hero's face and the hero does not turn.
  - W during a drag walks the hero toward the camera.
  - On a mount, a drag only orbits.
  - Record the result in the commit message body.
- [ ] **Step 6: Commit.**
  `git commit -m "feat(realm): left-drag swings the camera round the hero without turning them"`

---

### Task 9: Saving keybinds, per hero and per visitor

**Files:**
- Modify:
  - `src/lib/db/schema.ts`: `realmSettings.keybinds` and a new `realmVisitorKeybinds`;
  - `src/lib/actions/realm.ts:75,185`: the `RealmBundle` field and the read.
- Create:
  - `src/lib/services/realm-keybinds.ts`;
  - `src/lib/actions/realm-keybinds.ts`;
  - `src/lib/actions/realm-keybinds.test.ts`.
- Generated: a new migration under `src/lib/db/migrations/`.

**Interfaces:**
- Consumes: Task 1's `keymapFrom`, `keymapToStored`, `Keymap` and `defaultKeymap`.
- Produces:

  ```ts
  // schema.ts
  //   realmSettings: keybinds: text("keybinds")        — nullable; JSON overrides; null = defaults
  export const realmVisitorKeybinds = sqliteTable("realm_visitor_keybinds", {
    userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
    keybinds: text("keybinds"),                           // null = defaults (reset)
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  });
  // services/realm-keybinds.ts
  export async function loadRealmKeybinds(childId: string, visitorUserId: string | null): Promise<Keymap>;
  // actions/realm-keybinds.ts ("use server"; async exports only)
  export async function saveRealmKeybinds(childId: string, raw: unknown): Promise<void>;
  // RealmBundle gains: keybinds?: Keymap
  ```

- **The visitor's `keybinds` column is nullable,** unlike `sound`. A reset stores null rather
  than deleting the row.
- **`saveRealmKeybinds` follows `saveRealmSound` line for line:**
  1. clean the input: `stored = keymapToStored(keymapFrom(raw))`;
  2. call `requireChildAccess(childId)`;
  3. not the child: upsert the visitor's row;
  4. the child: call `requireChildAccess(childId, { write: true })` and `loadRealmSettings`, then
     update `realm_settings.keybinds`.
- **The bundle** reads keybinds in parallel beside `soundRead`. A failed read falls back to
  `defaultKeymap()`.

**Steps:**

- [ ] **Step 1: Write the failing tests.** Copy the structure and fixtures of
  `realm-sound.test.ts`:
  - a child saving writes `realm_settings.keybinds`, and `loadRealmKeybinds(child, null)` returns
    it;
  - a parent saving writes `realm_visitor_keybinds` and leaves the child's row null;
  - a view-only member can save their own;
  - garbage input (`{ jump: ["Escape"], hack: 1 }`) is stored cleaned: `null`, all defaults;
  - a user with no access is refused.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Change the schema and migrate.**
  - Edit the schema.
  - Run `npm run db:generate`, then `npm run db:migrate`.
  - Check with `sqlite3 local.db ".schema realm_visitor_keybinds"`: the table exists, and
    `realm_settings` has a `keybinds` column.
- [ ] **Step 4:** Implement the service, the action and the bundle field.
- [ ] **Step 5:** Run the full suite. Expected: PASS.
- [ ] **Step 6: Commit.** Include the generated migration and its journal.
  `git commit -m "feat(realm): keybinds saved per hero, and per visiting grown-up"`

---

### Task 10: Rebinding in the Controls panel

**Files:**
- Create:
  - `src/components/realm3d/keybind-list.tsx`;
  - `src/components/realm3d/keybind-list.test.tsx`.
- Modify:
  - `src/components/realm3d/frame-hud.tsx:512-575`: `HowToPlay` renders `KeybindList` for its
    keyboard rows;
  - `src/components/realm3d/realm-game.tsx`: start the router from `realm.keybinds`, and save
    changes through a debounced hook.
- Test: `keybind-list.test.tsx` and `realm-game.test.tsx`.

**Interfaces:**
- Consumes:
  - Task 1's `bind`, `defaultKeymap`, `keyLabel` and `ACTIONS`;
  - Task 2's `InputRouter.suspend` and `setKeymap`;
  - Task 7's `controlRows` (rows that have an `action`);
  - Task 9's `saveRealmKeybinds`.
- Produces:

  ```ts
  export function KeybindList(p: { rows: ControlRow[]; keymap: Keymap; onChange: (k: Keymap) => void; editable: boolean }): JSX.Element;
  // realm-game.tsx (local hook)
  function useKeybindSaver(router: InputRouter, childId: string | null): (k: Keymap) => void; // router.setKeymap at once; saveRealmKeybinds debounced like SoundControls
  ```

- **The rows:**
  - Rows with an `action` render each key as a `<button className="r3-kbd r3-kbd--edit">`, with
    `aria-label={`${label}: ${keyLabel}. Press to change.`}`.
  - The walk row expands to its four actions when editing; each gets its own chip.
  - A row with fewer than `MAX_KEYS` keys shows an empty chip, "+", that binds into slot 1.
- **Listening:**
  - Clicking a chip enters listening mode: the chip reads "Press a key…", and `router.suspend(true)`.
  - The list catches the next `keydown` on `window`, in the capture phase, and stops it
    propagating.
  - **Esc** cancels.
  - **Tab** is not caught, so focus moves as normal and listening is cancelled.
  - **A reserved key** shows "That key can't be used. Try another." in an `aria-live="polite"`
    line, and keeps listening.
  - **Anything else** calls `bind`. If something was displaced, the live line says
    `${keyLabel(code)} was ${displacedLabel}. ${displacedLabel} is now ${keyLabel(oldCode)}.`.
  - Listening always ends with `router.suspend(false)`.
- **"Reset to defaults"** calls `onChange(defaultKeymap())`.
- **Mouse rows** are plain `<kbd>`, as today.
- **`editable` is false** only when `childId` is missing, a preview with nowhere to save. Visitors
  are editable: they save their own.
- **A failed save** keeps the keys for the visit. The live line shows
  "Your keys work for now, but weren't saved."

**Steps:**

- [ ] **Step 1: Write the failing tests** in `keybind-list.test.tsx`:
  - clicking the Mount chip then pressing G calls `onChange` with `mount: ["KeyG"]`;
  - pressing M while rebinding Mount swaps the keys and announces
    "M was Open the map. Open the map is now Z.";
  - Escape cancels without calling `onChange`;
  - Tab cancels and is not prevented;
  - Ctrl shows the can't-be-used line and keeps listening;
  - while listening, the router is suspended, so a subscriber to `jump` gets nothing when Space
    is pressed to rebind;
  - Reset calls `onChange(defaultKeymap())`.

  In `realm-game.test.tsx`, with a bundle carrying `keybinds: bind(defaultKeymap(), "mount", 0, "KeyG").keymap`,
  G mounts, and the Controls panel shows G on the Mount row.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3:** Implement `KeybindList`, the saver hook, and the router's initial keymap
  (`keymapFrom(realm.keybinds)`).
- [ ] **Step 4:** Run `npm run lint && npm run typecheck && npm test`. Expected: PASS.
- [ ] **Step 5: Check the panel by eye** with the screenshot tooling: open the pause menu, then
  Controls, then rebind Mount.
- [ ] **Step 6: Commit.**
  `git commit -m "feat(realm): rebind any key from the Controls panel"`

---

### Task 11: Finish

- [ ] **Step 1:** Run the whole gate one last time:
  `npm run lint && npm run typecheck && npm test`. Paste the summary lines into the hand-off.
- [ ] **Step 2:** Update the doc comments that describe the scheme so they match:
  - `controls.ts`, the "## The scheme" block: add the left drag, and that keys are the router's;
  - `frame.ts` `controlRows`;
  - `look-input.ts`'s header.
- [ ] **Step 3:** Update the `project_realm_program` memory with one line on the keymap and
  router.
- [ ] **Step 4:** Use superpowers:finishing-a-development-branch to merge `realm-keybinds` into
  `dev`.
