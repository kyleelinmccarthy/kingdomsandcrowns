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
import { markRealmHelpSeen, setRealmDepth } from "@/lib/actions/realm-settings";
import { buildWorldLayout } from "@/lib/realm/layout";
import { applyDeedResult, type KingdomState } from "@/lib/realm/kingdom-state";
import { renderSettingsFor } from "@/lib/realm/render-settings";
import { VILLAGERS, villagerById } from "@/lib/realm/villagers";
import { gateCopy, type GateCopy } from "@/lib/realm/play-clock";
import { disposeSpriteTextures } from "@/lib/realm/sprite-texture";
import { resolvePages, withEmptyPages } from "@/lib/realm/spells/pages";
import { TROUBLE_COPY, type TroubleSkin } from "@/lib/realm/spells/troubles";
import { MANA_MAX } from "@/lib/realm/spells/mana";
import { formatLap } from "@/lib/realm/recess/recess";
import { hudRecessFor, recessPillText } from "@/lib/realm/recess/hud";
import { objectiveSpeech, objectiveState, riseToast } from "@/lib/realm/objective";
import { pickProblem, pickSpeech, type MessageInput } from "@/lib/realm/messages";
import { HERO_SPEED } from "@/lib/realm/movement";
import { ceremonyNotice, type CeremonyEvent } from "@/lib/realm/ceremony/ceremony";
import { DEFAULT_AVATAR, findMount } from "@/lib/utils/avatar-catalog";
import { readingAttributes } from "@/lib/utils/learning-profile";
import { currentTimeOfDay, localDateOf } from "@/lib/utils/schedule-days";
import { crownById, CROWNS } from "@/lib/utils/crown-catalog";
import { speak } from "@/lib/utils/speech";
import { SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";
import { SpriteSource, type SpriteTextures } from "./sprite-source";
import { RealmHud, RealmManaPips, RealmMountButton } from "./realm-hud";
import { surfacesFor, type RealmDepth } from "@/lib/realm/depth";
import { RealmMessages } from "./realm-messages";
import { RealmHelp } from "./realm-help";
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
const LOST_FOCUS = "You lost focus for a moment.";
const CEREMONY_FAILED = "The crown could not be recorded.";
const CAST_HINT = "Tap or click where the spell should go, or press Space to aim at the nearest trouble.";
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
  const [recess, setRecess] = useState<{ gleams: number; laps: number; bestLapMs: number | null; lapMs: number | null }>({ gleams: 0, laps: 0, bestLapMs: null, lapMs: null });
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
  const pages = useMemo(() => withEmptyPages(resolvePages(bundle.spellbook.spells, bundle.spellbook.slots), bundle.spellbook.slots), [bundle.spellbook]);
  const castHintShown = useRef(false);
  const selectedSpell = selectedSlot === null ? null : pages.find((p) => p.slot === selectedSlot)?.spell ?? null;
  const troubleSkin: TroubleSkin = kingdom.tone === "monsters" ? "monsters" : "gentle";
  const { axisRef, setStick, castRef } = useRealmInput({ enabled: !panelOpen && !ceremonyRunning && !helpOpen, castEnabled: isChildView && !panelOpen && !ceremonyRunning && !helpOpen && !riding && selectedSpell !== null });
  const config = bundle.avatarConfig ?? DEFAULT_AVATAR;
  const clock = usePlayClock({ enabled: isChildView, childId, initialMinutes: minutes, onClose, paused: panelOpen || ceremonyRunning || helpOpen, initialSource: source });
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
    setReachNotice(settings.showStick ? `${villager.name} is here. Tap Talk.` : `${villager.name} is here. Press Enter to talk.`);
  }, [settings.showStick]);
  const onToggleRide = useCallback(() => {
    if (!canRide) return;
    setRiding((r) => !r);
    setSelectedSlot(null);
  }, [canRide]);
  // Stable across renders so the bar's window key listener isn't torn down and re-added every render.
  const onSelectSpell = useCallback(
    (slot: number | null) => {
      if (riding && slot !== null) {
        setNotice("Dismount to cast.");
        return;
      }
      setSelectedSlot(slot);
      if (slot !== null && !castHintShown.current) {
        castHintShown.current = true; // once per visit; the toast holds four seconds
        setToast(settings.showStick ? CAST_HINT_TOUCH : CAST_HINT);
      }
    },
    [riding, settings.showStick]
  );

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
  }, []);

  // Enter or Space talks to the villager in reach when no panel is open; M mounts or dismounts.
  useEffect(() => {
    if (panelOpen || ceremonyRunning || helpOpen) return;
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
      if (e.key !== "Enter" && e.key !== " ") return;
      if (e.key === " " && selectedSlot !== null) return; // a page is selected: Space casts, it does not talk
      if (!reachId) return;
      if (onInteractiveElement) return;
      e.preventDefault();
      setOpenVillagerId(reachId);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panelOpen, ceremonyRunning, helpOpen, reachId, selectedSlot, onToggleRide]);

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
      case "refused": refusals.current += 1; setRefusedAt(refusals.current); setNotice(NOT_ENOUGH_MANA); break;
      case "focusLost": setNotice(LOST_FOCUS); break;
      case "castState": break;
    }
  }, [isChildView, troubleSkin]);

  const onRecessEvent = useCallback((e: RecessSimEvent) => {
    if (!isChildView) return;
    switch (e.kind) {
      case "recessStart": setToast("Recess!"); break;
      case "gleam": setRecess((r) => ({ ...r, gleams: e.count })); setNotice(`A gleam! ${e.count} so far.`); break;
      case "lap": setRecess((r) => ({ ...r, laps: e.laps, bestLapMs: e.best ? e.lapMs : r.bestLapMs, lapMs: null })); setNotice(`Lap done: ${formatLap(e.lapMs)} s!`); break;
      case "lapTick": if (!settings.calmPalette) setRecess((r) => ({ ...r, lapMs: e.lapMs })); break;
    }
  }, [isChildView, settings.calmPalette]);

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
    if (!textures || panelOpen || ceremonyRunning || helpOpen) return;
    const line = objectiveSpeech(objective);
    if (!line) return; // an unknown kingdom says nothing; a successful retry can still speak it
    spokenObjective.current = true;
    speak(line);
  }, [textures, panelOpen, ceremonyRunning, helpOpen, isChildView, bundle.profile.readAloud, objective]);

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
        paused={panelOpen || ceremonyRunning || helpOpen}
        objective={objective}
        surfaces={surfaces}
        kingdomDone={kingdomDone}
        kingdomTotal={kingdomTotal}
        recessPill={recessPill}
        crown={crown}
        ceremony={ceremonyStage === "running" ? { onSkip } : null}
        help={{ onOpen: openHelp, disabled: panelOpen || helpOpen }}
      />
      {/* Mana sits above the bar and Ride beside it, where slice 3's real bar will find
          them. `mana === null` is the single gate: a parent spends nothing, so a parent
          sees nothing. The mount button stays visible in preview and merely disabled. */}
      <RealmManaPips mana={isChildView ? mana : null} surfaces={surfaces} refused={refusedAt !== 0} />
      <RealmMountButton ride={hudRide} showStick={settings.showStick} />
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
          interactive={!panelOpen && !ceremonyRunning && !helpOpen}
          reachId={reachId}
          onReachChange={onReachChange}
          onTalk={onTalk}
          onVillagerPick={onTalk}
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
        />
      )}
      {settings.showStick && !panelOpen && !ceremonyRunning && !helpOpen && <TouchStick onChange={setStick} />}
      {isChildView && !panelOpen && !ceremonyRunning && !helpOpen && (
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
