"use client";

import dynamic from "next/dynamic";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getRealmKingdom, type RealmBundle } from "@/lib/actions/realm";
import { getRealmAccess } from "@/lib/actions/realm-play";
import { useQuestTimer } from "@/hooks/use-quest-timer";
import { getAssignmentQuestInfo } from "@/lib/actions/quest-assignments";
import { markCeremonySeen } from "@/lib/actions/seasons";
import { markRealmHelpSeen, setRealmDepth, setTutorialStep } from "@/lib/actions/realm-settings";
import { buildWorldLayout } from "@/lib/realm/layout";
import { applyDeedResult, type KingdomState } from "@/lib/realm/kingdom-state";
import { renderSettingsFor } from "@/lib/realm/render-settings";
import { VILLAGERS, villagerById } from "@/lib/realm/villagers";
import { gateCopy, type GateCopy } from "@/lib/realm/play-clock";
import { disposeSpriteTextures } from "@/lib/realm/sprite-texture";
import { resolvePages, withEmptyPages } from "@/lib/realm/spells/pages";
import { TROUBLE_COPY, type TroubleSkin } from "@/lib/realm/spells/troubles";
import { MANA_MAX } from "@/lib/realm/spells/mana";
import { minimapView } from "@/lib/realm/minimap";
import { formatLap } from "@/lib/realm/recess/recess";
import { hudRecessFor, recessPillText } from "@/lib/realm/recess/hud";
import { objectiveSpeech, objectiveState, riseToast } from "@/lib/realm/objective";
import { pickProblem, pickSpeech, type MessageInput } from "@/lib/realm/messages";
import { HERO_SPEED } from "@/lib/realm/movement";
import { advanceTutorial, tutorialPrompt, TUTORIAL_STEPS, type TutorialSignal, type TutorialState } from "@/lib/realm/tutorial";
import { ceremonyNotice, type CeremonyEvent } from "@/lib/realm/ceremony/ceremony";
import { DEFAULT_AVATAR, findMount } from "@/lib/utils/avatar-catalog";
import { readingAttributes } from "@/lib/utils/learning-profile";
import { currentTimeOfDay, localDateOf } from "@/lib/utils/schedule-days";
import { crownById, CROWNS } from "@/lib/utils/crown-catalog";
import { speak } from "@/lib/utils/speech";
import { SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";
import { SpriteSource, type SpriteTextures } from "./sprite-source";
import { RealmHud, RealmMountButton, RealmCastButton, RealmPutAwayButton } from "./realm-hud";
import { RealmLegend } from "./realm-legend";
import { RealmMinimap } from "./realm-minimap";
import { surfacesFor, type RealmDepth } from "@/lib/realm/depth";
import { RealmMessages } from "./realm-messages";
import { RealmHelp } from "./realm-help";
import { RealmTutorial } from "./realm-tutorial";
import { RealmGate } from "./realm-gate";
import { RealmClosed } from "./realm-closed";
import { DeedPanel } from "./deed-panel";
import { TouchStick } from "./touch-stick";
import { SpellBar } from "./spell-bar";
import { useRealmInput } from "./use-realm-input";
import { usePlayClock, type AccessSource, type CloseReason } from "./use-play-clock";
import type { SpellEvent } from "./use-spell-sim";
import type { RecessSimEvent } from "./use-recess-sim";

const VILLAGERS_RESTING = "The villagers are resting. Try again.";
const NOT_ENOUGH_MANA = "Not enough mana yet.";
// The other half of a refusal (§4.2). It must not be the mana line: a cast that had
// nothing in range spent nothing, and telling a child they are out of mana when their
// strip is full teaches them to distrust the strip.
const NOTHING_IN_RANGE = "Nothing close enough yet. Move closer.";
const LOST_FOCUS = "You lost focus for a moment.";
const CEREMONY_FAILED = "The crown could not be recorded.";
const CAST_HINT = "Tap or click where the spell should go.";
const CAST_HINT_TOUCH = "Tap where the spell should go.";

const RealmScene = dynamic(() => import("./realm-scene"), { ssr: false, loading: () => <p className="p-6 text-center text-muted-foreground">Opening the Realm…</p> });

type Phase = { kind: "checking" } | { kind: "gated"; copy: GateCopy } | { kind: "open"; minutes: number; note: string | null; source: AccessSource | null } | { kind: "closed"; body: string } | { kind: "unsupported" };

const UNSUPPORTED = "This device can't open the Realm yet. Try a newer browser or another device.";

/** True unless the browser clearly has WebGL support and refuses a context (jsdom has neither, and passes). */
function webglSupported(): boolean {
  if (typeof document === "undefined") return true;
  const hasApi = typeof window.WebGL2RenderingContext !== "undefined" || typeof window.WebGLRenderingContext !== "undefined";
  if (!hasApi) return true;
  const canvas = document.createElement("canvas");
  return canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
}

export function RealmShell({
  bundle,
  childId,
  isChildView,
  selector,
}: {
  bundle: RealmBundle;
  childId: string;
  isChildView: boolean;
  selector?: React.ReactNode;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "checking" });
  const [isTouch, setIsTouch] = useState(false);

  // The access check is async, so the state updates below are not synchronous effect writes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const touch = typeof navigator !== "undefined" && navigator.maxTouchPoints > 0;
      const result = await getRealmAccess(childId, localDateOf(new Date()), currentTimeOfDay());
      if (cancelled) return;
      setIsTouch(touch);
      if (!webglSupported()) {
        setPhase({ kind: "unsupported" });
        return;
      }
      const copy = gateCopy(result);
      if (!isChildView) {
        // Parents look, never spend: the gate becomes an information line.
        setPhase({ kind: "open", minutes: 0, note: copy ? `Closed for ${bundle.heroName}: ${copy.title}` : null, source: null });
        return;
      }
      // `copy` is non-null exactly when access is denied.
      if (copy) {
        setPhase({ kind: "gated", copy });
        return;
      }
      setPhase({ kind: "open", minutes: result.allowed ? result.minutesRemaining : 0, note: null, source: result.allowed ? result.source : null });
    })().catch((err: unknown) => {
      if (!cancelled) setPhase({ kind: "gated", copy: { title: "The Realm is out of reach right now.", body: err instanceof Error ? err.message : "Try again in a moment." } });
    });
    return () => {
      cancelled = true;
    };
  }, [childId, isChildView, bundle.heroName]);

  useEffect(() => () => disposeSpriteTextures(), []);

  const onClose = useCallback((reason: CloseReason) => {
    setPhase({ kind: "closed", body: gateCopy({ allowed: false, reason })!.body });
  }, []);

  if (phase.kind === "checking") return <p className="p-6 text-center text-muted-foreground">Checking the gate…</p>;
  if (phase.kind === "unsupported") return <p className="p-6 text-center text-muted-foreground">{UNSUPPORTED}</p>;
  if (phase.kind === "gated") return <RealmGate copy={phase.copy} heroName={bundle.heroName} />;
  if (phase.kind === "closed") return <RealmClosed heroName={bundle.heroName} body={phase.body} />;

  // The open world is its own component so the play clock mounts with the real
  // minute count, not a placeholder from before the access check resolved.
  return (
    <RealmOpen
      bundle={bundle}
      childId={childId}
      isChildView={isChildView}
      isTouch={isTouch}
      minutes={phase.minutes}
      note={phase.note}
      source={phase.source}
      onClose={onClose}
      selector={selector}
    />
  );
}

function RealmOpen({
  bundle,
  childId,
  isChildView,
  isTouch,
  minutes,
  note,
  source,
  onClose,
  selector,
}: {
  bundle: RealmBundle;
  childId: string;
  isChildView: boolean;
  isTouch: boolean;
  minutes: number;
  note: string | null;
  source: AccessSource | null;
  onClose: (reason: CloseReason) => void;
  selector?: React.ReactNode;
}) {
  const [textures, setTextures] = useState<SpriteTextures | null>(null);
  const [spriteError, setSpriteError] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const [kingdom, setKingdom] = useState<KingdomState>(bundle.kingdom);
  const [kingdomError, setKingdomError] = useState(bundle.kingdomError ?? "");
  const [reachId, setReachId] = useState<string | null>(null);
  // The reach line lives beside `notice` rather than inside it: an ordinary notice clears
  // itself after two seconds, and this one must hold for as long as the hero is standing
  // next to someone. The lanes merge them (`notice ?? reachNotice`), so a spell notice
  // borrows the lane for its two seconds and the reach line comes back underneath.
  const [reachNotice, setReachNotice] = useState<string | null>(null);
  const [openVillagerId, setOpenVillagerId] = useState<string | null>(null);
  const [risingId, setRisingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [mana, setMana] = useState(MANA_MAX);
  const [notice, setNotice] = useState<string | null>(null);
  const [riding, setRiding] = useState(false);
  const [recess, setRecess] = useState<{ gleams: number; laps: number }>({ gleams: 0, laps: 0 });
  const [seed] = useState(() => Date.now() >>> 0);
  // The visit's complexity depth, snapshotted once (§3.1): a surface must never flip
  // mid-play. The server computed it from helpSeen + depthOverride; task 18 adds the
  // setter so the help card's "Show me everything" can raise it for this visit.
  const [depth, setDepth] = useState(() => bundle.depth);
  // A refused cast paints the mana strip red for 600 ms. The counter is what makes a
  // second refusal restart the window rather than ride out the first one's timer.
  const refusals = useRef(0);
  const [refusedAt, setRefusedAt] = useState(0);
  // The ceremony waits for textures ("waiting"), plays ("running"), records itself ("finishing"), then is over ("done").
  // Snapshotted once: a bundle refresh from any source (e.g. router revalidation after
  // markCeremonySeen) must not change the ceremony mid-visit and unmount the crown sprite.
  const [ceremonyPending] = useState(() => (isChildView ? bundle.ceremony : null));
  const [ceremonyStage, setCeremonyStage] = useState<"waiting" | "running" | "finishing" | "done">(ceremonyPending ? "waiting" : "done");
  const [ceremonyNoticeText, setCeremonyNoticeText] = useState<string | null>(null);
  const [ceremonyError, setCeremonyError] = useState("");
  const [crown, setCrown] = useState<{ label: string; color: string } | null>(bundle.wornCrown ? { label: bundle.wornCrown.label, color: bundle.wornCrown.color } : null);
  const ceremonySkipRef = useRef(false);
  const ceremonyRunning = ceremonyStage === "running" || ceremonyStage === "finishing";
  const [helpOpen, setHelpOpen] = useState(false);
  // A first visit shows the card once, before anything else; the record is sent once.
  const helpPending = useRef(isChildView && !bundle.helpSeen);
  const helpMarked = useRef(bundle.helpSeen);
  const ceremonyStageRef = useRef(ceremonyStage);
  useEffect(() => {
    ceremonyStageRef.current = ceremonyStage;
  }, [ceremonyStage]);
  // Mirrored into a ref (rather than a dependency of `onReady`) so a manually opened card
  // — a returning hero clicking "How to play" before textures finish loading — also holds
  // the ceremony, without giving `onReady` a changing identity that would re-fire SpriteSource's effect.
  const helpOpenRef = useRef(helpOpen);
  useEffect(() => {
    helpOpenRef.current = helpOpen;
  }, [helpOpen]);
  const rootRef = useRef<HTMLDivElement>(null);
  // Held here, rendered by RealmMessages, written per frame by the scene (task 16).
  const arrowRef = useRef<HTMLDivElement>(null);
  // The same contract for the minimap's hero dot: held here, rendered inside RealmMinimap in
  // the HUD's upper-right corner, and written per frame by the scene. A ref rather than state
  // because the hero's position and facing move sixty times a second and the HUD must not.
  const minimapRef = useRef<SVGGElement>(null);
  const router = useRouter();
  // Only the stopped half (`stoppedResult`/`clearStoppedResult`) is read here — but the
  // hook doesn't split by field: while a chore timer is running, its own 1 Hz interval
  // still re-renders this whole component too, exactly as it re-renders `RealmTimerChip`'s
  // own separate call. That's strictly less than the ~5 re-renders a second mana regen
  // already causes, and `settings` and `layout` are useMemo'd, so the memoised `World`
  // still never re-renders from it.
  const { stoppedResult, clearStoppedResult } = useQuestTimer();
  // The timer stores an assignment id, not a subject, so the sentence needs one lookup.
  const [timerSubject, setTimerSubject] = useState<{ assignmentId: string; subject: string } | null>(null);
  useEffect(() => {
    if (!stoppedResult) return;
    let cancelled = false;
    getAssignmentQuestInfo(stoppedResult.assignmentId)
      .then((info) => {
        if (cancelled || !info) return;
        setTimerSubject({ assignmentId: stoppedResult.assignmentId, subject: info.subjectName });
      })
      .catch(() => {
        // The assignment behind a stopped timer can be gone by the time this runs — a
        // parent deleted the quest between the timer stopping and this lookup — and
        // `requireAssignmentAccess` throws "Assignment not found." in that case. There is
        // nothing to say about a quest that no longer exists, so the stopped result is
        // cleared rather than left to surface as an unhandled rejection over the game.
        if (!cancelled) clearStoppedResult();
      });
    return () => {
      cancelled = true;
    };
  }, [stoppedResult, clearStoppedResult]);
  // Derived, never stored: when the stopped result goes away — the child pressed
  // "Go to it →", or finished the quest in another tab — the sentence goes with it, and
  // no effect writes state synchronously (react-hooks/set-state-in-effect).
  const questTimerDone =
    stoppedResult && timerSubject?.assignmentId === stoppedResult.assignmentId
      ? `Your ${timerSubject.subject} timer finished.`
      : null;
  // `.game-content` (the page's <main>) is `position: relative; z-index: 10`,
  // which traps `.realm-root`'s z-index inside its own stacking context —
  // the app banner (30) and bottom nav (40) would sit on top of the world
  // no matter how high `.realm-root`'s z-index goes. Portal all the way to
  // `document.body`, which has no z-index of its own (not a stacking
  // context), so `.realm-root { z-index: 60 }` is compared against the
  // banner and nav directly. `.realm-root` no longer sits inside
  // `.game-shell`, so it carries its own `readingAttributes` below instead of
  // relying on that ancestor's scoping. Resolved once, client-side only:
  // this component never renders during SSR (it mounts after the
  // client-side access check resolves).
  const [portalTarget] = useState<Element | null>(() => (typeof document === "undefined" ? null : document.body));
  const settings = useMemo(() => renderSettingsFor(bundle.profile, isTouch), [bundle.profile, isTouch]);
  const surfaces = useMemo(() => surfacesFor(depth, bundle.profile), [depth, bundle.profile]);
  // One objective state for the whole render: the card reads it and the layout marks its
  // sites from it, so the card and the world can never disagree about what to do next.
  const objective = useMemo(() => objectiveState(kingdom.buildings, surfaces.trackedObjectives), [kingdom.buildings, surfaces.trackedObjectives]);
  const objectiveIds = useMemo(() => (objective.kind === "next" ? objective.objectives.map((o) => o.buildingId) : []), [objective]);
  const layout = useMemo(
    () => buildWorldLayout({ castleType: bundle.castleType, buildings: kingdom.buildings, villagers: !kingdomError, banners: bundle.banners, decor: !settings.calmPalette, objectiveIds }),
    [bundle.castleType, kingdom.buildings, kingdomError, bundle.banners, settings.calmPalette, objectiveIds]
  );
  // Everything on the map except the hero: the bounds, the eight sites with their raised/
  // unraised state, and the objective ring, all read off the same `layout` the world is built
  // from and filtered by the same `surfaces` (objectiveOnly drops the rest at simple depth).
  // It re-computes only when one of those changes — never on a mana tick, and never per frame.
  // `hero` and `facing` here are the resting values the dot is FIRST drawn at; from the first
  // frame onward the scene owns that element's transform and React never writes it again,
  // which is why neither the hero's position nor their facing is a dependency of anything here.
  // PARKED, not forgotten: `troubles` is empty on purpose. A trouble's position exists only in
  // the spell sim's per-frame ref inside the memoised scene — `SpellEvent` reports kinds and
  // counts, never places — so the only way to get one here is to put a moving position into
  // React state, which is the per-frame re-render this whole ref-based wiring exists to
  // prevent. `minimapView` already takes and tests `troubles`; slice 8, which owns how
  // enemies read, wires them with the same DOM-write treatment the hero dot has below.
  const minimap = useMemo(
    () => minimapView({ layout, hero: layout.spawn, facing: "s", troubles: [], surfaces }),
    [layout, surfaces]
  );
  // All eight kingdom buildings are rasterised up front (see SpriteSource), so this only
  // changes with the castle tier or the calm-palette decor toggle — never mid-visit as
  // buildings complete, which is what keeps a completing building's rise on its sprite
  // the whole way up instead of swapping from a fallback box partway through.
  const world = useMemo(
    () => ({ castleType: bundle.castleType, decor: !settings.calmPalette }),
    [bundle.castleType, settings.calmPalette]
  );
  // Computed before `panelOpen` so a Talk whose building data never loaded (or has since
  // gone missing) cannot pause the world behind a panel that has nothing to show.
  const openVillager = openVillagerId ? villagerById(openVillagerId) : null;
  const openBuilding = openVillager ? kingdom.buildings.find((b) => b.id === openVillager.buildingId) ?? null : null;
  const panelOpen = openVillager !== null && openBuilding !== null;
  // The one predicate for "the world is not the hero's to drive right now". It governs
  // input, the E and M keys, the spoken objective, the paused chip, scene
  // interactivity, the stick and the ability bar — nine sites that were nine copies of
  // the same three flags. The one deliberate exception is the `?` button's `disabled`
  // below, which omits ceremonyRunning on purpose; it says so there.
  const worldBusy = panelOpen || ceremonyRunning || helpOpen;
  const pages = useMemo(() => withEmptyPages(resolvePages(bundle.spellbook.spells, bundle.spellbook.slots), bundle.spellbook.slots), [bundle.spellbook]);
  const castHintShown = useRef(false);
  const selectedPage = selectedSlot === null ? null : pages.find((p) => p.slot === selectedSlot) ?? null;
  const selectedSpell = selectedPage?.spell ?? null;
  // What the touch Put away button names. Null while nothing is armed, which is also what
  // makes the button absent: a control for putting away nothing has nothing to teach.
  const armedName = selectedPage && selectedSpell ? selectedPage.name : null;
  const troubleSkin: TroubleSkin = kingdom.tone === "monsters" ? "monsters" : "gentle";
  const { axisRef, setStick, castRef, requestCast } = useRealmInput({ enabled: !worldBusy });
  const config = bundle.avatarConfig ?? DEFAULT_AVATAR;
  const clock = usePlayClock({ enabled: isChildView, childId, initialMinutes: minutes, onClose, paused: worldBusy, initialSource: source });
  // Every exit path — the `Leave the Realm` link, a router navigation, the gate
  // closing, the clock running out, a browser back — unmounts this component, so
  // hanging the flush off its cleanup is the one place that cannot be bypassed:
  // no later slice can add an exit that skips it. `flushPending` is a
  // `useCallback` on `[settle]` and `settle` on `[childId]`, so the identity is
  // stable and this runs exactly once, on the real unmount. `settle` catches its
  // own errors and only sets state, and a set on an unmounted component is a
  // no-op in React 19; the `void` keeps the floating promise lint-clean.
  // Destructured (rather than `clock.flushPending` inline) so exhaustive-deps
  // can track the dependency directly: eslint-plugin-react-hooks widens a
  // dependency to the whole base object whenever the member expression is
  // called (`clock.flushPending()`), since a method call can read other
  // properties of its receiver via `this` — it does not narrow to the callee
  // path the way it does for a plain property read. `clock` itself is a new
  // object every render, so depending on it directly would run this cleanup
  // on every render instead of once, on the real unmount.
  const { flushPending } = clock;
  useEffect(() => () => { void flushPending(); }, [flushPending]);
  const recessActive = isChildView && clock.source === "recess";
  const mountItem = bundle.avatarConfig?.mount ? findMount(bundle.avatarConfig.mount) : null;
  const canRide = mountItem !== null && bundle.mounts.unlocked.includes(mountItem.id) && isChildView;
  const mountSpeed = mountItem?.speed ?? HERO_SPEED;
  const mountTexture = useMemo(
    () => (canRide && mountItem && bundle.avatarConfig ? { id: mountItem.id, color: bundle.avatarConfig.mountColor } : null),
    [canRide, mountItem, bundle.avatarConfig]
  );
  const crownSprite = useMemo(
    () => (ceremonyPending ? { id: ceremonyPending.crownId, color: crownById(ceremonyPending.crownId)?.color ?? CROWNS[0].color } : null),
    [ceremonyPending]
  );
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
    if (helpOpenRef.current) return; // a manually opened card holds the ceremony too; onHelpClose starts it
    beginCeremonyIfWaiting();
  }, [beginCeremonyIfWaiting]);
  const onError = useCallback((e: Error) => setSpriteError(e.message), []);
  // Set whether or not read-aloud is on: the speech lane is an aria-live region, so a
  // screen reader announces the arrival for free, and everyone else reads it.
  const onReachChange = useCallback((id: string | null) => {
    setReachId(id);
    const villager = id ? villagerById(id) : null;
    if (!villager) {
      setReachNotice(null);
      return;
    }
    setReachNotice(settings.showStick ? `${villager.name} is here. Tap Talk.` : `${villager.name} is here. Press E to talk.`);
  }, [settings.showStick]);
  const onToggleRide = useCallback(() => {
    if (!canRide) return;
    setRiding((r) => !r);
    setSelectedSlot(null);
  }, [canRide]);
  // "1" is one verb, not two: it selects the page AND casts it, and a second press casts
  // again. The request cannot be written here, though — the scene's frame loop reads and
  // clears `castRef` every frame and drops a request it has no selected spell for, so a
  // write beside `setSelectedSlot` races the render that carries the new spell. Bumping a
  // counter and writing the request from an effect puts it after that commit, every time.
  const [castSeq, setCastSeq] = useState(0);
  // Stable across renders so the bar's window key listener isn't torn down and re-added every render.
  const onSelectSpell = useCallback(
    (slot: number | null) => {
      if (riding && slot !== null) {
        setNotice("Dismount to cast.");
        return;
      }
      setSelectedSlot(slot);
      if (slot !== null) setCastSeq((n) => n + 1);
      if (slot !== null && !castHintShown.current) {
        castHintShown.current = true; // once per visit; the toast holds four seconds
        setToast(settings.showStick ? CAST_HINT_TOUCH : CAST_HINT);
      }
    },
    [riding, settings.showStick]
  );
  useEffect(() => {
    if (castSeq === 0) return; // nothing has been picked yet; the world must not open with a cast
    requestCast({ nearest: true });
  }, [castSeq, requestCast]);
  // Cast, for a thumb. The selection is already committed by the time this can be tapped —
  // it is `disabled` until one exists — so this writes the request straight onto the ref
  // rather than going the long way round `castSeq`, which exists only for the select-and-cast
  // race a number key opens. Nothing here judges the target: task 9's rule in the spell sim
  // refuses a cast with nothing in range, with red pips and no mana spent.
  const onCastTap = useCallback(() => requestCast({ nearest: true }), [requestCast]);
  // And the way back out of aiming, which a tablet had no key for.
  const onPutAway = useCallback(() => setSelectedSlot(null), []);

  // ── The tutorial: four verbs, each finished by DOING it (§ task 13) ───────────────────
  // `bundle.tutorialStep` is how many steps the hero finished on an earlier visit, so a
  // reload mid-tutorial resumes on the same prompt rather than starting the child over.
  // Snapshotted once, like `depth` and the ceremony: a bundle refresh must not move the
  // prompt out from under a child halfway through a step.
  const [tutorial, setTutorial] = useState<TutorialState>(() => ({ completed: bundle.tutorialStep }));
  // The latest tutorial state, readable from a handler without a stale closure — the same
  // treatment `kingdomRef` below gets, and for two reasons. First, `signal` is handed to the
  // memoised scene and must never change identity, so it cannot close over `tutorial`.
  // Second, the write below is deliberately EAGER rather than mirrored from an effect: two
  // signals can land in the same microtask drain (a `walked` and a `reachedObjective` from one
  // frame), and the second must judge itself against the first's result, not against the state
  // React has not re-rendered with yet. An effect mirror would run too late for that.
  const tutorialRef = useRef(tutorial);
  // The one door every signal comes through. `advanceTutorial` owns the rule — including
  // step one's two halves, a real distance AND more than one movement key — and nothing
  // here re-decides any of it; this only feeds it and writes down what it says.
  //
  // The early return on an unchanged count is load-bearing, not tidiness: it is what lets the
  // scene re-send a signal the model is not listening for — a `walked` that was one key short,
  // an arrival the hero reached before they had learned to walk — for the price of a function
  // call, with no render and no round trip.
  //
  // Both the state change and the persist happen HERE, in the handler, and not inside a
  // `setTutorial` updater. An updater is not the place for a server round trip: StrictMode
  // double-invokes updaters in development and React may replay one during a concurrent
  // render, so the write could go twice. It is idempotent, so nothing would break — but a
  // request is a much heavier thing to double than the cheap boolean writes elsewhere in
  // this file, and there is no reason to.
  //
  // Persisting is fire-and-forget: a failed write costs the child a repeated step next
  // visit, which is far better than an error thrown over a running world. A child is never
  // told that a save missed, because there is nothing they could do about it.
  //
  // A parent's preview signals nothing at all: they are not the one learning the keys, and
  // their walking has no business being written to the hero's row.
  const signal = useCallback((s: TutorialSignal) => {
    if (!isChildView) return;
    const prev = tutorialRef.current;
    const next = advanceTutorial(prev, s);
    if (next.completed === prev.completed) return;
    tutorialRef.current = next;
    setTutorial(next);
    void setTutorialStep(childId, next.completed).catch(() => {});
  }, [childId, isChildView]);
  // A grown-up's way out. It goes PAST the last step and writes that down, so the tutorial
  // does not come back next visit — a skip that returned tomorrow would not be a skip.
  const skipTutorial = useCallback(() => {
    const skipped = { completed: TUTORIAL_STEPS.length };
    tutorialRef.current = skipped;
    setTutorial(skipped);
    if (isChildView) void setTutorialStep(childId, TUTORIAL_STEPS.length).catch(() => {});
  }, [childId, isChildView]);

  // The latest kingdom, readable from event handlers without a stale closure and without side effects in an updater.
  const kingdomRef = useRef(kingdom);
  useEffect(() => {
    kingdomRef.current = kingdom;
  }, [kingdom]);

  const onTalk = useCallback((id: string) => {
    const villager = villagerById(id);
    if (!villager) return;
    if (!kingdomRef.current.buildings.some((b) => b.id === villager.buildingId)) return; // no data for this site yet
    setOpenVillagerId(id);
    // Tutorial step three is "Stand close and press E", and this is the one function every
    // way of doing it runs through — the E key below, the Talk bubble and the villager's own
    // plate — so the signal is sent once from here instead of from three call sites. It is
    // sent only where the panel really opens: a Talk at a site whose data never loaded
    // returned above, and teaching a child that E worked when nothing appeared is how they
    // learn to distrust the key.
    signal({ kind: "interacted" });
  }, [signal]);

  // `E` interacts with whatever is in reach — today that is the villager standing by, and
  // later slices give doors, hitching posts and signboards the same key; M mounts or dismounts.
  useEffect(() => {
    if (worldBusy) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target;
      const onInteractiveElement = t instanceof Element && t.closest("a, button, input, textarea, select, [role='dialog']");
      if (e.code === "KeyM" && !e.repeat) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const inTextControlOrDialog = t instanceof Element && t.closest("input, textarea, select, [role='dialog']");
        if (inTextControlOrDialog) return;
        e.preventDefault();
        onToggleRide();
        return;
      }
      if (e.code !== "KeyE" || e.repeat) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!reachId) return;
      if (onInteractiveElement) return;
      e.preventDefault();
      // Through `onTalk`, not straight to `setOpenVillagerId`: it is the one place that
      // checks the site's data really arrived, and the one place the tutorial hears an
      // interaction. Pressing E is step three's own instruction, so the key that the prompt
      // names has to be the key the prompt can see.
      onTalk(reachId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [worldBusy, reachId, onToggleRide, onTalk]);

  // Escape skips the ceremony; nothing else listens for it while the ceremony runs (the deed panel cannot open).
  // While the help card is open, its own Escape handler closes the card first (it stops propagation).
  useEffect(() => {
    if (!ceremonyRunning || helpOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      ceremonySkipRef.current = true;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ceremonyRunning, helpOpen]);

  // The rise toast clears itself; the timer is the only place that clears it.
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(id);
  }, [toast]);

  // A spell notice (a clear, a refusal, lost focus) clears itself the same way.
  // `reachNotice` is deliberately not in this effect: it holds while the hero is in reach
  // and is cleared by `onReachChange` on the way out, never by a timer.
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 2000);
    return () => clearTimeout(id);
  }, [notice]);

  // The refusal flash clears itself, exactly like the toast and the notice.
  useEffect(() => {
    if (!refusedAt) return;
    const id = setTimeout(() => setRefusedAt(0), 600);
    return () => clearTimeout(id);
  }, [refusedAt]);

  const onSpellEvent = useCallback((e: SpellEvent) => {
    if (!isChildView) return;
    switch (e.kind) {
      case "mana": setMana(e.current); break;
      case "cleared": setNotice(TROUBLE_COPY[e.troubleKind][troubleSkin]); break;
      case "refused":
        refusals.current += 1;
        setRefusedAt(refusals.current);
        // A refusal RETIRES the once-per-visit cast hint. A toast outranks a notice in the
        // speech lane, so without this the very first refusal of a visit flashes the pips red
        // while the lane still reads "Tap or click where the spell should go." — the one
        // refusal that most needs its own words showing someone else's. The hint has done its
        // job by then: the child has demonstrably found the cast key. Only the hint is retired
        // (a functional updater, so `onSpellEvent` keeps the stable identity the memoised
        // World requires) — a rise toast, "Recess!" or the crowning line still hold the lane.
        // Un-burning the once-per-visit flag belongs INSIDE the updater, gated on the toast
        // really being the hint at this moment. A first cast that refuses nulls the hint about
        // a frame after raising it, so the child never read it and the visit still owes them
        // the lesson — but an unrelated refusal much later, with "Recess!" or a rise toast in
        // the lane, retires nothing and so must un-burn nothing, or the "once per visit" hint
        // shows twice. Writing a ref in an updater is safe only because `= false` is
        // idempotent: StrictMode may run this twice, and nothing here accumulates.
        setToast((t) => {
          const isHint = t === CAST_HINT || t === CAST_HINT_TOUCH;
          if (isHint) castHintShown.current = false;
          return isHint ? null : t;
        });
        setNotice(e.reason === "range" ? NOTHING_IN_RANGE : NOT_ENOUGH_MANA);
        break;
      case "focusLost": setNotice(LOST_FOCUS); break;
      case "castState":
        // Tutorial step four, "Press 1.", finishes on a cast that was NOT refused — and
        // `casting: true` is exactly that event: the sim emits it only after aiming found a
        // target and the mana was really spent. The wind-up's other half (`casting: false`)
        // would read more literally as "landed", but it can be lost to a dazzle between the
        // press and the release, and a child who did the thing correctly must not have the
        // step taken back off them by a monster. Nothing else changes here: the cast state
        // itself still drives nothing in the shell.
        if (e.casting) signal({ kind: "castLanded" });
        break;
    }
  }, [isChildView, troubleSkin, signal]);

  const onRecessEvent = useCallback((e: RecessSimEvent) => {
    if (!isChildView) return;
    switch (e.kind) {
      case "recessStart": setToast("Recess!"); break;
      case "gleam": setRecess((r) => ({ ...r, gleams: e.count })); setNotice(`A gleam! ${e.count} so far.`); break;
      case "lap": setRecess((r) => ({ ...r, laps: e.laps })); setNotice(`Lap done: ${formatLap(e.lapMs)} s!`); break;
    }
  }, [isChildView]);

  // The panel can close via Close/Escape or a finished deed; either way, focus lands back
  // on the Talk bubble if the hero is still in reach of it, otherwise on the world itself
  // so keyboard input keeps working instead of falling into the page body.
  const returnFocus = useCallback(() => {
    requestAnimationFrame(() => {
      (document.querySelector<HTMLElement>(".realm-bubble-talk") ?? rootRef.current)?.focus();
    });
  }, []);

  const openHelp = useCallback(() => setHelpOpen(true), []);
  const onHelpClose = useCallback(() => {
    setHelpOpen(false);
    // Only a hero's own visit records "seen": a parent opening the card from the
    // ? button is just reading it, not marking anything on the hero's behalf.
    if (isChildView && !helpMarked.current) {
      helpMarked.current = true;
      markRealmHelpSeen(childId).catch(() => {}); // the next visit simply shows the card again
    }
    beginCeremonyIfWaiting();
    returnFocus();
  }, [childId, isChildView, beginCeremonyIfWaiting, returnFocus]);

  // The hero's own escape hatch (§3.15). A parent never presses it — they change the same
  // column in Settings, under the child's name — and fewerChoices removes the choice rather
  // than offering it. `setDepth` runs only after the write resolves, so the visit never shows
  // a view the column does not hold; the card renders "That didn't save. Try again." when the
  // promise rejects. `surfaces` re-derives from `depth`, and nothing else in the world moves.
  const canSetDepth = isChildView && !bundle.profile.fewerChoices;
  const onSetDepth = useCallback((next: RealmDepth) => setRealmDepth(childId, next).then(() => setDepth(next)), [childId]);

  // Focus the world once it opens (it never moves focus while the card is showing). Keyed on
  // the first `textures` arrival only: `world` (see above) no longer changes mid-visit, so a
  // later `onReady` is a sprite retry, and re-focusing then would yank focus away from
  // whatever the hero is doing while the help card is closed.
  const focusedOnce = useRef(false);
  useEffect(() => {
    if (textures && !helpOpen && !focusedOnce.current) {
      focusedOnce.current = true;
      rootRef.current?.focus();
    }
  }, [textures, helpOpen]);

  const onPanelClose = useCallback(() => {
    setOpenVillagerId(null);
    returnFocus();
  }, [returnFocus]);

  const onDeedFinished = useCallback((buildingId: string, result: { done: number; total: number; complete: boolean }) => {
    const applied = applyDeedResult(kingdomRef.current, buildingId, result);
    kingdomRef.current = applied.state;
    setKingdom(applied.state);
    if (applied.rose) {
      const label = applied.state.buildings.find((b) => b.id === buildingId)?.label ?? "building";
      setRisingId(buildingId);
      // One toast, not two queued: the rise and what comes next travel together (§3.18).
      setToast(riseToast(label, objectiveState(applied.state.buildings, 1)));
    }
    setOpenVillagerId(null);
    returnFocus();
  }, [returnFocus]);

  const onKingdomRetry = useCallback(() => {
    if (ceremonyRunning) return; // the plaza is mid-ceremony; villagers stand at their sites, not their buildings
    getRealmKingdom(childId)
      .then((k) => {
        setKingdom(k);
        setKingdomError("");
      })
      .catch(() => setKingdomError(VILLAGERS_RESTING));
  }, [childId, ceremonyRunning]);

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
    // The narration is spoken by the one read-aloud wiring point below, off the speech
    // lane it already owns — never from here, or a re-render would stutter it.
    if (text) setCeremonyNoticeText(text);
    if (e.step === "hail") setToast(`Season ${ceremonyPending.ordinal} complete`);
    if (e.step === "done") recordCeremony();
  }, [ceremonyPending, ceremonyCrown, bundle.heroName, recordCeremony]);

  const onSkip = useCallback(() => {
    ceremonySkipRef.current = true;
  }, []);

  // The portal is the top of the stack while it is open (`.realm-root` is z-index 60).
  // This attribute is the second half of the rule that keeps the app's floating chrome —
  // the hero-switch pill, the quest-timer popup, the schedule notifications — behind it:
  // browsers match `body:has(.realm-root)`, and anything that cannot evaluate `:has()`
  // (jsdom included) matches this. Cleared on unmount, so every exit path — the Tavern
  // link, a route change, the gate closing — hands the chrome straight back.
  useEffect(() => {
    document.body.setAttribute("data-realm-open", "true");
    return () => {
      document.body.removeAttribute("data-realm-open");
    };
  }, []);

  const calm = bundle.profile.reducedMotion || bundle.profile.lowStimulus;
  const hudRecess = isChildView ? hudRecessFor(recess, recessActive) : null;
  // Gleams and laps collapse into one pill while recess runs; best lap is deleted (D6.4).
  const recessPill = hudRecess ? recessPillText(hudRecess.gleams, hudRecess.laps) : null;
  const kingdomDone = kingdom.buildings.filter((b) => b.complete).length;
  const kingdomTotal = kingdom.buildings.length; // 0 when the load failed: the plate drops the line
  const hudRide = isChildView
    ? (canRide ? { riding, disabled: ceremonyRunning, onToggle: onToggleRide } : null)
    : (mountItem && bundle.mounts.unlocked.includes(mountItem.id) ? { riding: false, disabled: true, onToggle: () => {} } : null);

  // The parent's intro carries the gate note as one message in the problem lane (§3.17).
  const previewText = isChildView
    ? null
    : `You're looking at ${bundle.heroName}'s grounds. Spells, ${SIDE_QUESTS_LOWER} and recess are theirs to play.${note ? ` ${note}` : ""}`;
  // Two lanes, one message each, and `ceremonyNoticeText` and `notice` stay two states:
  // a spell notice fired during the ceremony loses the lane, it does not erase the
  // crowning line, and the crown does not erase "Not enough mana yet." (§3.6, §5).
  const messageInput: MessageInput = {
    spriteError: spriteError || clock.error,
    kingdomError,
    ceremonyError,
    lastMinute: isChildView && clock.warning,
    // Gated on `isChildView`: the shared-device hand-off means a child's stopped timer
    // sits in the same localStorage a parent's preview then reads, and this sentence —
    // with a button that navigates away — has no business replacing the preview's intro.
    // Gated on `!clock.warning` too: the "complete or discard?" card that would normally
    // clear this is `display:none` behind the portal, so without an exit of its own this
    // message would otherwise never yield its lane, and a child who doesn't tap "Go to
    // it →" would never see "One minute left in the Realm today." before the gate closes
    // on them. The one-minute banner reclaims the lane instead; the sentence itself is
    // untouched in storage, so it returns the moment the banner clears.
    questTimerDone: isChildView && !clock.warning ? questTimerDone : null,
    preview: previewText,
    ceremonyNotice: ceremonyNoticeText,
    toast,
    notice: notice ?? reachNotice,
    calm,
  };
  // The one line spoken outside the lane: the objective, once per visit, when the world
  // first becomes interactive — textures loaded, help card closed, no panel, no ceremony.
  // Declared before the lane effect so that if both fire in one commit the lane's
  // higher-priority message takes the voice last (speak() cancels what is still playing).
  const spokenObjective = useRef(false);
  useEffect(() => {
    if (spokenObjective.current) return;
    if (!isChildView || !bundle.profile.readAloud) return; // a parent's preview never speaks
    if (!textures || worldBusy) return;
    const line = objectiveSpeech(objective);
    if (!line) return; // an unknown kingdom says nothing; a successful retry can still speak it
    spokenObjective.current = true;
    speak(line);
  }, [textures, worldBusy, isChildView, bundle.profile.readAloud, objective]);

  const problem = pickProblem(messageInput);
  const speech = pickSpeech(messageInput);

  // Read-aloud has exactly one wiring point: whatever the speech lane is showing is what
  // is read. Ceremony narration, the rise toast, the reach line, gleams, laps and every
  // notice are spoken once each, in the lane's own priority order, because speak()'s
  // cancel() hands the voice to the message that won. `lastSpoken` stops a re-render
  // stuttering the same sentence.
  const spokenText = speech?.text ?? null;
  const lastSpoken = useRef<string | null>(null);
  useEffect(() => {
    if (!isChildView || !bundle.profile.readAloud) return;
    if (!spokenText || spokenText === lastSpoken.current) return;
    lastSpoken.current = spokenText;
    speak(spokenText);
  }, [spokenText, isChildView, bundle.profile.readAloud]);

  if (!portalTarget) return null;

  return createPortal(
    <div
      ref={rootRef}
      className={`realm-root${selectedSpell ? " realm-root--aiming" : ""}`}
      tabIndex={-1}
      style={{ "--realm-hud-scale": String(settings.hudScale), "--realm-bar-bottom": settings.showStick ? "9.5rem" : "1.25rem" } as React.CSSProperties}
      onContextMenu={(e) => e.preventDefault()}
      {...readingAttributes(bundle.profile)}
    >
      <SpriteSource key={retryKey} config={config} villagers={VILLAGERS} troubleSkin={troubleSkin} mount={mountTexture} recess={isChildView} crown={crownSprite} castleBanner={bundle.banners > 0} world={world} onReady={onReady} onError={onError} />
      <RealmHud
        heroName={bundle.heroName}
        minutesRemaining={isChildView ? clock.minutesRemaining : null}
        preview={!isChildView}
        hudScale={settings.hudScale}
        selector={selector}
        paused={worldBusy}
        objective={objective}
        surfaces={surfaces}
        kingdomDone={kingdomDone}
        kingdomTotal={kingdomTotal}
        recessPill={recessPill}
        crown={crown}
        ceremony={ceremonyStage === "running" ? { onSkip } : null}
        // NOT `worldBusy`: this one omits ceremonyRunning on purpose, so a hero can still
        // open the card while the ceremony plays (the card holds the ceremony; see onHelpClose).
        help={{ onOpen: openHelp, disabled: panelOpen || helpOpen }}
        // The map fills the upper-right corner (§3.2). The dots come from state that changes
        // when a building goes up; the hero dot is the scene's to move, through `minimapRef`.
        minimap={<RealmMinimap view={minimap} heroRef={minimapRef} />}
        // Mana rides in the identity corner beside the hero's name. `mana === null` is the
        // single gate: a parent spends nothing, so a parent sees nothing.
        mana={isChildView ? mana : null}
        manaRefused={refusedAt !== 0}
      />
      {/* Ride sits beside the ability bar, where slice 3's real bar will find it. The mount
          button stays visible in preview and merely disabled. */}
      <RealmMountButton ride={hudRide} showStick={settings.showStick} />
      {/* The two verbs a keyboard already had and a thumb did not: `1` and left click cast,
          and `Escape` puts the spell away. Both render only when the stick is up. Cast is
          disabled rather than hidden while nothing is armed; Put away is absent instead,
          because there is nothing for it to act on and nothing for it to teach. */}
      <RealmCastButton onCast={onCastTap} disabled={selectedSlot === null || riding || worldBusy} showStick={settings.showStick} />
      <RealmPutAwayButton spellName={armedName} onPutAway={onPutAway} showStick={settings.showStick} />
      <RealmLegend showStick={settings.showStick} />
      {/* Four prompts, one at a time, above the speech lane and clear of every corner. A
          parent's preview has none: nothing they do is being taught or written down.
          The prompt is also dropped whenever there is no live objective, because three of the
          four steps are then impossible to obey and the child would be told to do something
          the world cannot let them do. `complete` is the permanent case and the one that
          matters: `tutorialStep` defaults to 0, so every hero who finished their kingdom
          before this shipped starts at step 0, and step two ("Go where the light is") has no
          light to go to — no site carries `focus: "objective"` once `objectiveIds` is empty —
          while step four has no troubles to cast at, since those only spawn at unfinished
          sites. `deedsDone` never goes down, so that would never have resolved itself: they
          would have read an impossible instruction every visit forever, with only a grown-up's
          Skip as a way out. `unknown` is the same trap while it lasts — a kingdom that failed
          to load has no sites, no villagers and no troubles either — but it is transient, the
          problem lane explains it, and the prompt comes back with the retry.
          Clamped HERE and not in the state: `tutorial` is what the child has really finished
          and must survive a kingdom that is briefly unreadable, and seeding from `objective`
          would bake in whatever it happened to say on the first render. */}
      {isChildView && (
        <RealmTutorial
          prompt={objective.kind === "next" ? tutorialPrompt(tutorial) : null}
          onSkip={skipTutorial}
        />
      )}
      <RealmMessages
        problem={problem}
        speech={speech}
        arrowRef={arrowRef}
        hudScale={settings.hudScale}
        onAction={() => {
          if (!problem) return;
          if (problem.kind === "spriteError") {
            setSpriteError("");
            clock.clearError();
            setRetryKey((k) => k + 1);
            void clock.flushPending();
            return;
          }
          if (problem.kind === "kingdomError") {
            onKingdomRetry();
            return;
          }
          if (problem.kind === "questTimer") {
            // Out of the Realm the ordinary way. The unmount cleanup task 7 added runs on
            // the route change and flushes the part-minute, so the visit is charged (§3.16).
            clearStoppedResult();
            router.push("/quests");
            return;
          }
          if (problem.kind === "ceremonyError") recordCeremony();
        }}
      />
      {textures && (
        <RealmScene
          layout={layout}
          textures={textures}
          settings={settings}
          surfaces={surfaces}
          axisRef={axisRef}
          arrowRef={arrowRef}
          minimapRef={minimapRef}
          interactive={!worldBusy}
          reachId={reachId}
          onReachChange={onReachChange}
          onTalk={onTalk}
          risingId={risingId}
          selectedSpell={selectedSpell}
          selectedSlot={selectedSlot}
          castRef={castRef}
          troubleSkin={troubleSkin}
          spellsEnabled={isChildView}
          onSpellEvent={onSpellEvent}
          seed={seed}
          riding={riding}
          mountSpeed={mountSpeed}
          recessActive={recessActive}
          onRecessEvent={onRecessEvent}
          ceremonyActive={ceremonyStage === "running"}
          ceremonySkipRef={ceremonySkipRef}
          onCeremonyEvent={onCeremonyEvent}
          onTutorialSignal={signal}
        />
      )}
      {settings.showStick && !worldBusy && <TouchStick onChange={setStick} />}
      {isChildView && !worldBusy && (
        <SpellBar
          pages={pages}
          selectedSlot={selectedSlot}
          mana={mana}
          fewerChoices={bundle.profile.fewerChoices}
          onSelect={onSelectSpell}
          raised={settings.showStick}
          hudScale={settings.hudScale}
          refused={refusedAt !== 0}
        />
      )}
      {openVillager && openBuilding && (
        <DeedPanel
          childId={childId}
          villager={openVillager}
          building={openBuilding}
          profile={bundle.profile}
          calm={calm}
          preview={!isChildView}
          onFinished={onDeedFinished}
          onClose={onPanelClose}
        />
      )}
      {helpOpen && (
        <RealmHelp
          touch={settings.showStick}
          ceremony={ceremonyRunning}
          readAloud={bundle.profile.readAloud}
          depth={depth}
          onSetDepth={canSetDepth ? onSetDepth : null}
          onClose={onHelpClose}
        />
      )}
    </div>,
    portalTarget
  );
}
