"use client";

/**
 * THE COMPOSITION ROOT of the 3D Realm. It builds every long-lived object the canvas and the
 * HUD share — the generated island, the village layout, the child's spell pages, the nameplate
 * anchors, the HUD bus, the caster and the effect pool — once, and hands the same references
 * to both sides for the life of the page. And it owns the game around the world: the play
 * clock, the overlay (pause menu, panels) that pauses the scene, the E prompt, Esc.
 *
 * It never imports `three`. The canvas is behind a `next/dynamic` boundary, so this file, the
 * HUD and every menu around the game stay loadable under Vitest and on the server.
 *
 * Ownership line: the canvas (`spike-scene.tsx` and everything it imports) is the world and the
 * child's body in it; this file and the HUD are everything drawn over it. They meet only through
 * `RealmCanvasProps` and the `HudBus`.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getRealmKingdom } from "@/lib/actions/realm";
import { markRealmHelpSeen, setRealmDepth, setTutorialStep, updateRealmSettings } from "@/lib/actions/realm-settings";
import { markCeremonySeen } from "@/lib/actions/seasons";
import { getSpellbook } from "@/lib/actions/spells";
import { surfacesFor, type RealmDepth } from "@/lib/realm/depth";
import { applyDeedResult, type KingdomState } from "@/lib/realm/kingdom-state";
import { buildWorldLayout } from "@/lib/realm/layout";
import { objectiveSpeech, objectiveState } from "@/lib/realm/objective";
import { renderSettingsFor } from "@/lib/realm/render-settings";
import { resolvePages, withEmptyPages } from "@/lib/realm/spells/pages";
import { villagerById, villagerForBuilding } from "@/lib/realm/villagers";
import { makeCaster, makeCastQueue, pushCast } from "@/lib/realm3d/casting";
import { clockLine, escapeFrom, spellbookHref, visitClockLine, type AccessSource, type Overlay } from "@/lib/realm3d/frame";
import { goalFor, spellHelp, type SpellbookFacts } from "@/lib/realm3d/guide";
import { makeHudBus, type InteractTarget } from "@/lib/realm3d/hud-bus";
import { deedToast, type DeedToast } from "@/lib/realm3d/talk";
import { roomFor, type RoomVisit } from "@/lib/realm3d/doorways";
import { fixtureLine, roomPlan } from "@/lib/realm3d/interiors";
import {
  advanceLesson,
  currentLesson,
  LESSONS,
  CORE_LESSONS,
  lessonCopy,
  lessonsFromStored,
  settle,
  skipLesson,
  STEP_ESCAPE_MS,
  storedFromLessons,
  TUTORIAL_DONE,
  type LessonContext,
  type LessonSignal,
} from "@/lib/realm3d/tutorial";
import { speak } from "@/lib/utils/speech";
import { buildAnchors } from "@/lib/realm3d/plate-anchors";
import { FX_POOL, makeFxPool } from "@/lib/realm3d/spell-fx";
import { makeTroubleBus } from "@/lib/realm3d/trouble-bus";
import { TroubleMapMarks, TroubleNotices, TroublePlates } from "./troubles-hud";
import { BountyGain } from "./troubles-hud";
import { useTroubleBounty } from "./use-trouble-bounty";
import { realmWorld } from "@/lib/realm3d/worldgen";
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import { DEFAULT_LEARNING_PROFILE, type LearningProfile } from "@/lib/utils/learning-profile";
import type { SpellPage } from "@/lib/services/spells";
import { usePlayClock, type CloseReason } from "@/components/realm/use-play-clock";
import { DeedBoard, type DeedResult } from "./deed-board";
import { CeremonyCard, Coach, DeedToastBanner, TimerFinished, WelcomeCard, type CeremonyInfo } from "./guide-hud";
import {
  ClockCorner,
  EmptyPagePanel,
  HowToPlay,
  InteractPanel,
  InteractPrompt,
  LastMinute,
  ObjectiveCard,
  PauseMenu,
  VillagePlank,
  VisitorRibbon,
  type PauseSettings,
} from "./frame-hud";
import { RealmHud } from "./hud";
import { RoomLine } from "./room-hud";
import { RideLine, RideSlot, TravelBanner, TravelSheet, useRiding } from "./riding-hud";
import { travelGraphFor } from "@/lib/realm3d/travel";
import { SoundControls, useRealmSound } from "./realm-sound";
import type { SoundSettings } from "@/lib/realm3d/sound/settings";

const RealmCanvas = dynamic(() => import("./spike-scene"), {
  ssr: false,
  loading: () => <p className="r3-loading">Raising the hills…</p>,
});
/** Indoors: its own little canvas, mounted on the way in (`interior-scene.tsx`). */
const RoomCanvas = dynamic(() => import("./interior-scene"), { ssr: false, loading: () => <div className="r3-room r3-room--loading" /> });

/**
 * The child's real kingdom and settings, straight off `getRealmBundle`: the same bundle the
 * flat Realm reads, so the 3D village a child walks is the one their side quests raised.
 */
export type RealmData = {
  childId: string | null;
  /** The actor is the child themselves. False is a grown-up visiting: no clock, no spending. */
  isChildView: boolean;
  kingdom: KingdomState;
  kingdomError?: string;
  castleType: string;
  banners: number;
  profile: LearningProfile;
  depth: RealmDepth;
  toneMode: "gentle" | "monsters";
  /**
   * Tutorial progress as stored (`lib/realm3d/tutorial.ts` reads it). Absent means "nothing to
   * teach here" — a test, or the old spike route — and the tutorial stays off.
   */
  tutorialStep?: number;
  /** Whether the child has had their first-visit welcome. Absent counts as seen. */
  helpSeen?: boolean;
  /** A crown waiting for its ceremony. Always null for a grown-up: the bundle never sends one. */
  ceremony?: CeremonyInfo | null;
  /** Sound settings for whoever is looking: the hero's own, or a visiting grown-up's own. */
  sound?: SoundSettings;
};

/** What the access check decided, for an open gate. */
export type OpenEntry = {
  minutes: number;
  visit: { minutes: number | null; closedBecause: string | null } | null;
  source: AccessSource | null;
};

/**
 * No kingdom at all. Only a test, or the old spike route before its redirect, renders without
 * a bundle; a Realm with no buildings shows no objective card and no village plank rather than
 * a made-up village, because a made-up village is exactly what the owner asked to be rid of.
 */
const NO_REALM: RealmData = {
  childId: null,
  isChildView: true,
  kingdom: { tone: "gentle", buildings: [] },
  castleType: "campsite",
  banners: 0,
  profile: DEFAULT_LEARNING_PROFILE,
  depth: "full",
  toneMode: "gentle",
};

const NO_ENTRY: OpenEntry = { minutes: 0, visit: null, source: null };
const NO_MOUNTS: readonly string[] = [];

const SAVE_FAILED = "That didn't save. Try again.";
const VILLAGERS_RESTING = "The villagers are resting. Try again.";
const CEREMONY_FAILED = "The crown could not be recorded.";
/** How long the village's answer to a side quest stays over the world. */
const TOAST_MS = 5200;
/**
 * How far over a villager's head the gold ! floats: its words hang under it, and the villager's
 * own nameplate is at 2.9, so this keeps the two from sitting on one another.
 */
const GOAL_Y = 5.6;
const MOVE_KEYS: Record<string, string> = { KeyW: "w", ArrowUp: "w", KeyA: "a", ArrowLeft: "a", KeyS: "s", ArrowDown: "s", KeyD: "d", ArrowRight: "d" };

/** The dev-only handle a screenshot script uses to play the scene's half of the bus. */
declare global {
  interface Window {
    __realmBus?: unknown;
    /** Development only: how long the last raised side quest took to reach the screen, in ms. */
    __realmRebuild?: { commitMs: number; frameMs: number; at: string }[];
    __realmRaise?: (buildingId: string, result: { label: string; done: number; total: number; complete: boolean }) => void;
    /** Development only: go straight into a room, as if through its door ("chapel", "castle"…). */
    __realmEnter?: (site: string) => void;
  }
}

export function RealmGame({
  avatar,
  close = false,
  heroName = "Hero",
  spellbook,
  viewer = "child",
  castleUnlocked = true,
  realm = NO_REALM,
  entry = NO_ENTRY,
  onClose,
  selector,
  mounts = NO_MOUNTS,
}: {
  avatar?: AvatarConfig | null;
  close?: boolean;
  heroName?: string;
  /** The child's own spellbook rows and slot count, straight off `getRealmBundle`. */
  spellbook?: { spells: SpellPage[]; slots: number } | null;
  viewer?: "child" | "parent";
  castleUnlocked?: boolean;
  realm?: RealmData;
  entry?: OpenEntry;
  /** The play clock ran out, or the gate shut mid-visit. */
  onClose?: (reason: CloseReason) => void;
  /** A grown-up's child selector, for the pause menu. */
  selector?: ReactNode;
  /** The mounts this child has earned (`bundle.mounts.unlocked`): what M may ride. */
  mounts?: readonly string[];
}) {
  const world = useMemo(() => realmWorld(), []);

  /* ---- the real kingdom ----------------------------------------------- */
  // Held as state from the bundle, not read from props on every render: the deed flow (the
  // next wave) will raise buildings mid-visit, and a server refresh must not move the village
  // out from under a child. `depth` is snapshotted the same way — a surface never flips mid-play
  // unless the child asked for it in the pause menu.
  const [kingdom, setKingdom] = useState(realm.kingdom);
  const kingdomRef = useRef(kingdom);
  const [kingdomError, setKingdomError] = useState(realm.kingdomError ?? "");
  const [depth, setDepth] = useState<RealmDepth>(realm.depth);
  const [tone, setTone] = useState(realm.toneMode);
  const [depthError, setDepthError] = useState("");
  const [toneError, setToneError] = useState("");
  const profile = realm.profile;
  const surfaces = useMemo(() => surfacesFor(depth, profile), [depth, profile]);
  const render = useMemo(() => renderSettingsFor(profile, false), [profile]);
  // One objective state for the whole render: the card reads it and the layout marks its sites
  // from it, so the card and the world can never disagree about what to do next — the same
  // rule, and the same two calls, as `realm-shell.tsx`.
  const objective = useMemo(() => objectiveState(kingdom.buildings, surfaces.trackedObjectives), [kingdom.buildings, surfaces.trackedObjectives]);
  const objectiveKey = objective.kind === "next" ? objective.objectives.map((o) => o.buildingId).join(",") : "";
  const layout = useMemo(
    () =>
      buildWorldLayout({
        castleType: realm.castleType,
        buildings: kingdom.buildings,
        villagers: !kingdomError,
        banners: realm.banners,
        decor: !render.calmPalette,
        objectiveIds: objectiveKey ? objectiveKey.split(",") : [],
      }),
    // Keyed on the objective ids as a string, not the array: `objective` is rebuilt whenever
    // `surfaces` is, and a new array with the same ids must not hand the memoised World a new
    // layout — that is 20,000 props rebuilt for nothing.
    [realm.castleType, kingdom.buildings, kingdomError, realm.banners, render.calmPalette, objectiveKey],
  );
  const raised = kingdom.buildings.filter((b) => b.complete).length;

  /**
   * The child's REAL spells. `resolvePages` turns their saved rows into castable definitions
   * and `withEmptyPages` pads the book out to the slot count their level has earned — the same
   * two calls `realm-shell.tsx` makes, so the 3D bar and the flat Realm's bar can never
   * disagree about what a child owns.
   */
  const pages = useMemo(() => {
    const slots = spellbook?.slots ?? 4;
    return withEmptyPages(resolvePages(spellbook?.spells ?? [], slots), slots);
  }, [spellbook]);

  /**
   * The plate over the walker's own head. A visiting parent walks as the Quest Giver, so that
   * is the name that hangs over the wizard — not the child's, which would say the grown-up IS
   * the child.
   */
  const walkerName = viewer === "parent" ? "Quest Giver" : heroName;
  const anchors = useMemo(
    () => buildAnchors({ heroName: walkerName, villagers: layout.villagers, landmarks: world.landmarks, heightAt: world.heightAt, castle: castleUnlocked }),
    [walkerName, layout, world, castleUnlocked],
  );

  /**
   * Who the objective card sends the child to, standing where the layout put them: the gold !
   * over the world, the mark on the map, and the name in the tutorial's "Find Old Bram" all read
   * this one answer.
   */
  const goal = useMemo(() => goalFor(objective, layout.villagers, (id) => villagerById(id)?.name ?? null), [objective, layout.villagers]);

  // Built once, mutated for ever, shared across the canvas boundary. None of these is React
  // state and none of them can re-render anything.
  const bus = useMemo(() => makeHudBus(pages.length, anchors.length), [pages.length, anchors.length]);
  const caster = useMemo(() => makeCaster(pages.length), [pages.length]);
  const fxPool = useMemo(() => makeFxPool(FX_POOL), []);
  const casts = useMemo(() => makeCastQueue(), []);
  const troubleBus = useMemo(() => makeTroubleBus(), []);
  const hero = avatar ?? DEFAULT_AVATAR;


  const childId = realm.childId;
  const isChild = realm.isChildView && childId !== null;
  const readAloud = realm.isChildView && profile.readAloud;
  const calm = profile.reducedMotion || profile.lowStimulus;

  /* ---- the first things a child sees ---------------------------------- */
  // Snapshotted, like the flat Realm's: a refresh mid-visit must not bring the welcome back or
  // take a crown away. A grown-up gets neither — no welcome, no tutorial, no ceremony.
  const [ceremony] = useState<CeremonyInfo | null>(() => (isChild ? realm.ceremony ?? null : null));
  const [welcomeFirst] = useState(() => isChild && realm.helpSeen === false);

  /* ---- the overlay, and pausing -------------------------------------- */
  const [overlay, setOverlayState] = useState<Overlay | null>(() => (welcomeFirst ? { kind: "welcome" } : ceremony ? { kind: "ceremony" } : null));
  const overlayRef = useRef(overlay);
  const [near, setNear] = useState<InteractTarget | null>(null);
  const paused = overlay !== null;

  /* ---- indoors ---------------------------------------------------------- */
  // Which room the child is in, if any. Not an overlay: indoors is PLAYING — the clock runs, the
  // tutorial and the E prompt work — it is only the island that stops (see `frozen` below).
  const [inside, setInside] = useState<RoomVisit | null>(null);
  const insideRef = useRef<RoomVisit | null>(null);
  const [roomLine, setRoomLine] = useState<string | null>(null);
  const [roomUses, setRoomUses] = useState(0);
  const roomUsesRef = useRef(0);
  const clearRoomLine = useCallback(() => setRoomLine(null), []);
  /** Bumped on the way out of a room: a moment of dark over the island's first frame back. */
  const [outCount, setOutCount] = useState(0);
  /** What was in E's reach outside when the child went in, handed back when they come out. */
  const nearOutside = useRef<InteractTarget | null>(null);

  /* ---- riding ------------------------------------------------------------ */
  // M, the Ride slot, the words, and fast travel's sheet (`riding-hud.tsx`); the canvas gets the bus.
  const travelGraph = useMemo(() => travelGraphFor(world), [world]);
  const onRodeRef = useRef<() => void>(() => {});
  const onRode = useCallback(() => onRodeRef.current(), []);
  const riding = useRiding({
    avatar: hero,
    unlocked: mounts,
    viewer,
    heroName,
    childId: realm.isChildView ? realm.childId : null,
    reducedMotion: profile.reducedMotion,
    readAloud,
    bus,
    graph: travelGraph,
    insideRef,
    onRode,
  });

  // The ONE writer of `bus.paused`. Every panel is an overlay, so every panel pauses the
  // scene, and nothing can open a panel that forgets to. Indoors pauses the ISLAND too (its keys,
  // its casting, its E), because the child's hands belong to the room; the room reads `paused`.
  useEffect(() => {
    bus.setPaused(paused || inside !== null);
  }, [bus, paused, inside]);

  // Where the gold ! points, for the driver. Written when the objective moves — a handful of
  // times a visit — and read every frame.
  useEffect(() => {
    bus.setGoal(goal.on, goal.x, world.heightAt(goal.x, goal.z) + GOAL_Y, goal.z);
  }, [bus, goal, world]);

  /* ---- the tutorial --------------------------------------------------- */
  const tutorialOn = isChild && realm.tutorialStep !== undefined;
  const firstSpell = useMemo(() => {
    const page = pages.find((p) => p.spell);
    return page ? { name: page.name, key: page.slot } : null;
  }, [pages]);
  const lessonCtx: LessonContext = useMemo(
    () => ({
      waiting: goal.on ? goal.name : null,
      villagers: !kingdomError && layout.villagers.length > 0,
      spell: firstSpell,
      emptyPage: pages.some((p) => !p.spell),
      mount: riding.access.ok ? riding.access.mount.label : null,
    }),
    [goal.on, goal.name, kingdomError, layout.villagers.length, firstSpell, pages, riding.access],
  );
  const ctxRef = useRef(lessonCtx);
  useEffect(() => {
    ctxRef.current = lessonCtx;
  }, [lessonCtx]);
  const [lessons, setLessons] = useState(() => (tutorialOn ? lessonsFromStored(realm.tutorialStep!) : LESSONS.length));
  const lessonsRef = useRef(lessons);
  // The coach waits behind the welcome card; everything else is live from the first frame.
  const [coachReady, setCoachReady] = useState(!welcomeFirst);
  const [doneLine, setDoneLine] = useState<string | null>(null);
  const [stuck, setStuck] = useState(-1);

  // Who is in reach right now. A lesson that asks the child to find Old Bram while they are
  // already standing beside him must not wait for them to walk away and come back.
  const nearRef = useRef<InteractTarget | null>(null);
  const goalRef = useRef(goal);
  useEffect(() => {
    goalRef.current = goal;
  }, [goal]);
  const nearSignal = (t: InteractTarget): LessonSignal => ({ kind: "near", villager: t.kind === "villager", waiting: t.kind === "villager" && t.id === goalRef.current.id });

  /** Writes a new lesson count, here and on the server. Fire-and-forget, as the flat tutorial's was. */
  const commitLessons = useCallback(
    (asked: number) => {
      if (!childId) return;
      let next = asked;
      if (nearRef.current) next = advanceLesson(next, nearSignal(nearRef.current), ctxRef.current);
      lessonsRef.current = next;
      setLessons(next);
      if (next >= LESSONS.length) setDoneLine(TUTORIAL_DONE);
      void setTutorialStep(childId, storedFromLessons(next)).catch(() => {});
    },
    [childId],
  );

  /**
   * The one door every lesson signal comes through. `advanceLesson` owns the rule; this only
   * feeds it and writes down what it says, and returns at once when nothing changed — which is
   * what lets the key, pointer and walking listeners call it freely.
   */
  const signal = useCallback(
    (s: LessonSignal) => {
      if (!tutorialOn) return;
      const prev = lessonsRef.current;
      if (prev >= LESSONS.length) return;
      const next = advanceLesson(prev, s, ctxRef.current);
      if (next === prev) return;
      commitLessons(next);
    },
    [tutorialOn, commitLessons],
  );
  const skipTutorial = useCallback(() => commitLessons(LESSONS.length), [commitLessons]);
  useEffect(() => {
    onRodeRef.current = () => signal({ kind: "rode" });
  }, [signal]);
  const skipStep = useCallback(() => commitLessons(skipLesson(lessonsRef.current, ctxRef.current)), [commitLessons]);

  // A lesson that has sat on screen a long while offers "Skip this step" too: never trapped.
  useEffect(() => {
    if (!tutorialOn || lessons >= LESSONS.length) return;
    const id = window.setTimeout(() => setStuck(lessons), STEP_ESCAPE_MS);
    return () => window.clearTimeout(id);
  }, [tutorialOn, lessons]);
  useEffect(() => {
    if (!doneLine) return;
    const id = window.setTimeout(() => setDoneLine(null), 6000);
    return () => window.clearTimeout(id);
  }, [doneLine]);

  const lessonShown = tutorialOn && coachReady ? settle(lessons, lessonCtx) : LESSONS.length;
  const lesson = lessonShown < LESSONS.length ? currentLesson(lessonShown, lessonCtx) : null;
  const coachCopy = lesson ? lessonCopy(lessonShown, lessonCtx) : null;

  /* ---- what the child's hands are doing, for the lessons -------------- */
  // Which movement keys, how much mouse drag on the world, and Space. Listened for here, not in
  // the scene: the scene's input is the scene's, and these only ever feed `signal`, which does
  // nothing unless the lesson on screen is waiting for exactly this.
  const hands = useRef({ keys: new Set<string>(), drag: 0 });
  useEffect(() => {
    if (!tutorialOn) return;
    const onKey = (e: KeyboardEvent) => {
      if (bus.paused || e.repeat) return;
      const k = MOVE_KEYS[e.code];
      if (k) hands.current.keys.add(k);
      else if (e.code === "Space") signal({ kind: "jumped" });
    };
    const onMove = (e: PointerEvent) => {
      if (bus.paused || (e.buttons & 3) === 0 || !(e.target instanceof HTMLCanvasElement)) return;
      hands.current.drag += Math.abs(e.movementX) + Math.abs(e.movementY);
      signal({ kind: "looked", px: hands.current.drag });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointermove", onMove);
    };
  }, [tutorialOn, bus, signal]);

  /* ---- a finished side quest ------------------------------------------ */
  const [toast, setToast] = useState<DeedToast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);
  // The server's answer, held until the panel closes: the building then rises while the child
  // is looking at it, not behind a board they are still reading.
  const pendingDeed = useRef<{ buildingId: string; result: DeedResult } | null>(null);
  const trackedRef = useRef(surfaces.trackedObjectives);
  useEffect(() => {
    trackedRef.current = surfaces.trackedObjectives;
  }, [surfaces.trackedObjectives]);

  /** `realm-shell.tsx`'s `onDeedFinished`, verbatim in its rule: `applyDeedResult`, then say so. */
  const raise = useCallback(
    (buildingId: string, result: DeedResult) => {
      const before = kingdomRef.current.buildings.find((b) => b.id === buildingId);
      const applied = applyDeedResult(kingdomRef.current, buildingId, result);
      if (!before || applied.state === kingdomRef.current) return;
      kingdomRef.current = applied.state;
      const t0 = performance.now();
      setKingdom(applied.state);
      const next = objectiveState(applied.state.buildings, trackedRef.current);
      const words = deedToast({ site: before, after: result, rose: applied.rose, villagerName: villagerForBuilding(buildingId)?.name ?? null, next });
      setToast(words);
      if (readAloud) speak(words.spoken);
      // Development only: how long raising a building takes to reach the screen. `commitMs` is
      // the React commit (the memoised World re-rendering on the new layout) and `frameMs` is
      // that plus the next frame the canvas draws with it.
      if (process.env.NODE_ENV !== "production") {
        requestAnimationFrame(() => {
          const commitMs = performance.now() - t0;
          requestAnimationFrame(() => {
            (window.__realmRebuild ??= []).push({ commitMs: Math.round(commitMs), frameMs: Math.round(performance.now() - t0), at: buildingId });
          });
        });
      }
    },
    [readAloud],
  );

  /* ---- the ceremony ---------------------------------------------------- */
  const [ceremonySaving, setCeremonySaving] = useState(false);
  const [ceremonyError, setCeremonyError] = useState("");
  const ceremonyRecorded = useRef(false);

  /* ---- moving between overlays ---------------------------------------- */
  const helpMarked = useRef(!welcomeFirst);
  /**
   * EVERY change of overlay comes through here — a button, Esc, a click on the dim — so what has
   * to happen on the way OUT of a panel happens whichever way the child left it: a finished side
   * quest raises its building, the welcome is written down as seen and hands on to the ceremony
   * or the coach, and a ceremony left by Esc is recorded as the flat Realm's Skip recorded it.
   */
  const go = useCallback(
    (asked: Overlay | null) => {
      let next = asked;
      const from = overlayRef.current;
      if (from?.kind === "interact" && next?.kind !== "interact" && pendingDeed.current) {
        const { buildingId, result } = pendingDeed.current;
        pendingDeed.current = null;
        raise(buildingId, result);
      }
      if (from?.kind === "welcome" && next?.kind !== "welcome") {
        if (!helpMarked.current && childId) {
          helpMarked.current = true;
          void markRealmHelpSeen(childId).catch(() => {});
        }
        setCoachReady(true);
        if (next === null && ceremony && !ceremonyRecorded.current) next = { kind: "ceremony" };
      }
      if (from?.kind === "ceremony" && next?.kind !== "ceremony" && ceremony && !ceremonyRecorded.current && childId) {
        ceremonyRecorded.current = true;
        void markCeremonySeen(childId, ceremony.seasonId).catch(() => {});
      }
      overlayRef.current = next;
      setOverlayState(next);
    },
    [raise, childId, ceremony],
  );

  const hail = useCallback(() => {
    if (!ceremony || !childId || ceremonySaving) return;
    setCeremonySaving(true);
    setCeremonyError("");
    markCeremonySeen(childId, ceremony.seasonId)
      .then(() => {
        ceremonyRecorded.current = true;
        go(null);
      })
      .catch(() => setCeremonyError(CEREMONY_FAILED))
      .finally(() => setCeremonySaving(false));
  }, [ceremony, childId, ceremonySaving, go]);

  /* ---- going in and coming out ---------------------------------------- */
  const { atDoor } = riding;
  const enter = useCallback((visit: RoomVisit) => {
    if (insideRef.current || overlayRef.current !== null) return;
    // On a mount: set down at the door, and it waits outside.
    atDoor();
    nearOutside.current = nearRef.current;
    nearRef.current = null;
    setNear(null);
    insideRef.current = visit;
    setInside(visit);
    setRoomLine(null);
  }, [atDoor]);
  const leave = useCallback(() => {
    const was = insideRef.current;
    if (!was) return;
    // The island's doorstep puts the child outside this door, facing away, on its next frame.
    bus.setLeaving(was.site);
    insideRef.current = null;
    setInside(null);
    setOutCount((n) => n + 1);
    setRoomLine(null);
    nearRef.current = nearOutside.current;
    setNear(nearOutside.current);
  }, [bus]);

  const { atPost, refuseCast } = riding;
  /** Pressing E at something, or clicking the prompt. A person, or their site, is a conversation. */
  const openTarget = useCallback(
    (t: InteractTarget) => {
      if (overlayRef.current !== null) return;
      // Indoors: the door goes back out, and the room's one thing is used where it stands.
      if (t.kind === "door") {
        leave();
        return;
      }
      // A hitching post: the fast-travel sheet, if the child is riding (otherwise it says how).
      if (t.kind === "post") {
        if (atPost(t)) go({ kind: "travel", from: t.id });
        return;
      }
      if (t.kind === "fixture") {
        const room = insideRef.current;
        if (!room) return;
        const n = roomUsesRef.current++;
        setRoomUses(roomUsesRef.current);
        setRoomLine(fixtureLine(roomPlan(room.room), n, heroName));
        return;
      }
      // A raised building, or the child's own castle, is a door now.
      const visit = insideRef.current ? null : roomFor(t, kingdomRef.current.buildings, castleUnlocked);
      if (visit) {
        enter(visit);
        return;
      }
      go({ kind: "interact", target: t });
      const v = t.kind === "villager" ? villagerById(t.id) : t.kind === "site" ? villagerForBuilding(t.id) : null;
      if (v && kingdomRef.current.buildings.some((b) => b.id === v.buildingId)) signal({ kind: "talked" });
    },
    [go, signal, leave, enter, castleUnlocked, heroName, atPost],
  );

  // What the scene tells the frame: what is in reach, that E was pressed at it, that a spell
  // went off, and how far the child has walked.
  useEffect(() => {
    bus.setHandlers({
      onNear: (t) => {
        nearRef.current = t;
        setNear(t);
        if (t) signal(nearSignal(t));
      },
      onInteract: (t) => openTarget(t),
      onCast: () => signal({ kind: "cast" }),
      onWalked: (distance) => signal({ kind: "walked", keys: hands.current.keys.size, distance }),
      // Walking into a doorway: the same door E opens, if it has an inside.
      onDoor: (site) => {
        const visit = roomFor(site === "castle" ? { kind: "castle", id: site } : { kind: "site", id: site }, kingdomRef.current.buildings, castleUnlocked);
        if (visit) enter(visit);
      },
    });
    return () => bus.setHandlers({ onNear: () => {}, onInteract: () => {}, onCast: () => {}, onWalked: () => {}, onDoor: () => {} });
  }, [bus, signal, openTarget, enter, castleUnlocked]);

  // Esc: pause from play, back a step from a panel. The frame owns this key; the scene does not
  // listen for it.
  useEffect(() => {
    if (close) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.repeat) return;
      e.preventDefault();
      go(escapeFrom(overlayRef.current));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, go]);

  // Development only: hand the bus to the window, so a screenshot script can fire `onNear` and
  // `onInteract` the way the scene will, and check the frame's half of the contract on its own.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__realmBus = bus;
    // And the rise itself, so the cost of a building going up can be measured without playing a
    // whole side quest per sample. Client state only: nothing is written anywhere.
    window.__realmRaise = raise;
    const enterSite = (site: string) => enter({ room: site === "castle" ? "castle" : (site as RoomVisit["room"]), site });
    window.__realmEnter = enterSite;
    return () => {
      if (window.__realmBus === bus) delete window.__realmBus;
      if (window.__realmRaise === raise) delete window.__realmRaise;
      if (window.__realmEnter === enterSite) delete window.__realmEnter;
    };
  }, [bus, raise, enter]);

  /* ---- read-aloud ------------------------------------------------------ */
  // A lesson is read as it arrives; otherwise the objective, once, when the world is first the
  // child's — the flat Realm's one spoken line outside its message lane.
  const spokenLesson = useRef<string | null>(null);
  const spokenObjective = useRef(false);
  useEffect(() => {
    if (!readAloud || paused) return;
    if (coachCopy) {
      if (spokenLesson.current === coachCopy.spoken) return;
      spokenLesson.current = coachCopy.spoken;
      speak(coachCopy.spoken);
      return;
    }
    if (spokenObjective.current) return;
    const line = objectiveSpeech(objective);
    if (!line) return;
    spokenObjective.current = true;
    speak(line);
  }, [readAloud, paused, coachCopy, objective]);

  /* ---- the play clock ------------------------------------------------- */
  const clockOn = realm.isChildView && childId !== null;
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  const onClockClose = useCallback((reason: CloseReason) => closeRef.current?.(reason), []);
  // The flat Realm's own hook: it ticks visible seconds, writes a minute to the ledger every
  // sixty, re-checks the gate after each, warns at the last minute and closes at zero. Paused
  // whenever the world is — a child reading the pause menu is not spending their minutes.
  const clock = usePlayClock({
    enabled: clockOn,
    childId: childId ?? "",
    initialMinutes: entry.minutes,
    onClose: onClockClose,
    paused,
    initialSource: entry.source,
  });
  // Every way out — Leave, a link in a panel, the browser's back, the clock closing — unmounts
  // this component, so the part-minute is charged here, where no exit can skip it.
  const { flushPending } = clock;
  useEffect(() => () => void flushPending(), [flushPending]);
  // Clearing troubles earns Realm minutes — the child's own visit only; a grown-up's writes nothing.
  const bounty = useTroubleBounty({ enabled: clockOn, childId: childId ?? "", onAwarded: clock.refresh });

  /* ---- the HUD's clicks ------------------------------------------------ */
  const [spellFacts, setSpellFacts] = useState<SpellbookFacts | null>(null);
  const askedSpellbook = useRef(false);
  // No spells indoors: a click on the bar would otherwise wait in the queue and go off outside.
  const onCast = useCallback((slot: number) => {
    // And none from the saddle: the flat Realm's "Dismount to cast."
    if (!insideRef.current && !refuseCast()) pushCast(casts, slot);
  }, [casts, refuseCast]);
  const onEmptyPage = useCallback(
    (slot: number) => {
      go({ kind: "page", slot });
      signal({ kind: "page" });
      // What THIS child can write and is closest to earning — asked once, when first wanted.
      if (!askedSpellbook.current && childId) {
        askedSpellbook.current = true;
        getSpellbook(childId)
          .then((b) => setSpellFacts({ level: b.level, unlocked: b.unlocked, schoolCounts: b.schoolCounts, subjectNamesBySchool: b.subjectNamesBySchool }))
          .catch(() => {
            askedSpellbook.current = false;
          });
      }
    },
    [go, signal, childId],
  );
  const closeOverlay = useCallback(() => go(null), [go]);
  const help = useMemo(() => (spellFacts ? spellHelp(spellFacts) : null), [spellFacts]);

  const retryKingdom = useCallback(() => {
    if (!childId) return;
    getRealmKingdom(childId)
      .then((k) => {
        kingdomRef.current = k;
        setKingdom(k);
        setKingdomError("");
      })
      .catch(() => setKingdomError(VILLAGERS_RESTING));
  }, [childId]);

  /* ---- settings ------------------------------------------------------- */
  const canSetDepth = childId !== null && !(realm.isChildView && profile.fewerChoices);
  const onDepth = canSetDepth
    ? (next: RealmDepth) => {
        setDepthError("");
        setRealmDepth(childId!, next)
          .then(() => setDepth(next))
          .catch(() => setDepthError(SAVE_FAILED));
      }
    : null;
  const settings: PauseSettings = {
    depth,
    onDepth,
    depthError,
    // Troubles are a grown-up's choice, made in Settings; a visiting grown-up can make it here.
    tone,
    onTone:
      !realm.isChildView && childId
        ? (next) => {
            setToneError("");
            updateRealmSettings(childId, { toneMode: next })
              .then(() => setTone(next))
              .catch(() => setToneError(SAVE_FAILED));
          }
        : null,
    toneError,
    calm: !render.motion,
  };

  const numerals = surfaces.numerals || !realm.isChildView;
  const visiting = viewer === "parent";
  const line = realm.isChildView
    ? clockLine(clock.minutesRemaining, { paused, recess: clock.source === "recess" })
    : visitClockLine(heroName, entry.visit);
  const bookHref = spellbookHref(realm.isChildView ? "child" : "parent", childId);
  const who: "child" | "parent" = realm.isChildView ? "child" : "parent";

  /** What an interact overlay opens: a conversation for a person or their site, a card for anything else. */
  const talkTo =
    overlay?.kind === "interact" && (overlay.target.kind === "villager" || overlay.target.kind === "site")
      ? (() => {
          const v = overlay.target.kind === "villager" ? villagerById(overlay.target.id) : villagerForBuilding(overlay.target.id);
          const site = v ? kingdom.buildings.find((b) => b.id === v.buildingId) : undefined;
          return v && site ? { villager: v, site } : null;
        })()
      : null;

  // The sound: it listens on the buses and follows the overlay, the room, a rising building and
  // the lessons (`realm-sound.tsx`). A child's grown-up can switch it off in their learning
  // profile; a visiting grown-up hears it on their own settings.
  const soundStore = useRealmSound({
    bus,
    tbus: troubleBus,
    world,
    layout,
    pages,
    initial: realm.sound,
    enabled: !realm.isChildView || profile.soundEnabled,
    calm,
    childId,
    overlay: overlay?.kind ?? null,
    room: inside?.room ?? null,
    roomUses,
    toast,
    lessons,
    lessonsTotal: LESSONS.length,
    close,
  });

  const room = useMemo(() => (inside ? roomPlan(inside.room) : null), [inside]);
  const roomColors = useMemo(() => ({ field: hero.backgroundColor || hero.outfitColor, charge: hero.accessoryColor || "#f4d27a" }), [hero]);

  return (
    <div className={`r3-game${inside ? " r3-game--indoors" : ""}`}>
      <RealmCanvas
        frozen={inside !== null}
        avatar={hero}
        close={close}
        world={world}
        layout={layout}
        anchors={anchors}
        pages={pages}
        bus={bus}
        caster={caster}
        fxPool={fxPool}
        casts={casts}
        viewer={viewer}
        castleUnlocked={castleUnlocked}
        calm={calm}
        troubles={troubleBus}
        ride={riding.bus}
      />
      {outCount > 0 && !inside && <div key={outCount} className="r3-fade" aria-hidden="true" />}
      {inside && (
        <RoomCanvas visit={inside} avatar={hero} viewer={viewer} bus={bus} paused={paused} colors={roomColors} used={roomUses} onLeave={leave} />
      )}
      {!close && (
        <>
          <RealmHud
            bus={bus}
            world={world}
            anchors={anchors}
            pages={pages}
            heroName={heroName}
            portrait={hero}
            viewer={viewer}
            castle={castleUnlocked}
            onCast={onCast}
            onEmptyPage={onEmptyPage}
            goal={goal}
            inside={room ? room.where : null}
            mapExtras={<TroubleMapMarks tbus={troubleBus} />}
            barExtra={viewer === "child" ? <RideSlot riding={riding.riding} access={riding.access} onPress={riding.toggle} /> : undefined}
            mountKey={riding.access.ok}
          />
          <TroublePlates tbus={troubleBus} />
          <div className={`r3-frame${paused ? " r3-frame--paused" : ""}`}>
            <ObjectiveCard
              objective={objective}
              heroName={heroName}
              visiting={visiting}
              numerals={numerals}
              kingdomError={kingdomError || undefined}
              onRetry={childId ? retryKingdom : undefined}
            />
            <VillagePlank heroName={heroName} done={raised} total={kingdom.buildings.length} numerals={numerals} />
            {visiting && <VisitorRibbon heroName={heroName} />}
            <div className="r3-top-lane">
              {realm.isChildView && clock.warning && <LastMinute />}
              {tutorialOn && !paused && (
                <Coach
                  copy={coachCopy}
                  keys={lesson?.keys ?? []}
                  step={lessonShown + 1}
                  steps={lessonCtx.mount ? LESSONS.length : CORE_LESSONS}
                  done={doneLine}
                  onSkip={skipTutorial}
                  onSkipStep={stuck === lessons ? skipStep : null}
                />
              )}
              {!paused && <DeedToastBanner toast={toast} numerals={numerals} />}
              {!paused && inside && <RoomLine line={roomLine} onDone={clearRoomLine} />}
              <TroubleNotices tbus={troubleBus} skin={tone} pages={pages} paused={paused} bounty={bounty} />
              {!paused && <RideLine line={riding.line} onDone={riding.clearLine} />}
            </div>
            {!paused && <TravelBanner to={riding.travelling} onStop={riding.stop} />}
            {!paused && <InteractPrompt target={near} onPress={openTarget} />}
            <ClockCorner
              line={line}
              warning={realm.isChildView && clock.warning}
              error={clock.error}
              notice={realm.isChildView ? <><TimerFinished hidden={clock.warning} /><BountyGain gained={bounty.gained} /></> : null}
              onRetry={() => {
                clock.clearError();
                void clock.flushPending();
              }}
              onHelp={() => go({ kind: "howto", back: false })}
              onMenu={() => go({ kind: "pause" })}
              leaveHref="/tavern"
            />
          </div>
          {overlay?.kind === "pause" && (
            <PauseMenu
              heroName={heroName}
              viewer={who}
              onResume={closeOverlay}
              onControls={() => go({ kind: "howto", back: true })}
              leaveHref="/tavern"
              settings={settings}
              selector={selector}
              sound={<SoundControls store={soundStore} enabled={!realm.isChildView || profile.soundEnabled} calm={calm} viewer={who} heroName={heroName} />}
            />
          )}
          {overlay?.kind === "howto" && (
            <HowToPlay
              slots={pages.length}
              mount={viewer === "child" ? riding.access.ok : undefined}
              back={overlay.back}
              onClose={() => go(escapeFrom(overlay))}
              onReplay={
                tutorialOn
                  ? () => {
                      commitLessons(0);
                      hands.current.drag = 0;
                      setDoneLine(null);
                      go(null);
                    }
                  : null
              }
            />
          )}
          {overlay?.kind === "travel" && riding.access.ok && (
            <TravelSheet
              rows={riding.destinations(overlay.from, !surfaces.fastTravel || profile.fewerChoices, numerals)}
              single={!surfaces.fastTravel || profile.fewerChoices}
              mountLabel={riding.access.mount.label}
              numerals={numerals}
              onGo={(id) => {
                go(null);
                riding.go(id);
              }}
              onClose={closeOverlay}
            />
          )}
          {overlay?.kind === "page" && (
            <EmptyPagePanel slot={overlay.slot} viewer={who} heroName={heroName} spellbookHref={bookHref} help={help} onClose={closeOverlay} />
          )}
          {overlay?.kind === "interact" && talkTo && (
            <DeedBoard
              childId={childId}
              villager={talkTo.villager}
              site={talkTo.site}
              viewer={who}
              heroName={heroName}
              waiting={goal.on && goal.id === talkTo.villager.id}
              numerals={numerals}
              profile={{ readAloud, untimed: profile.untimed }}
              calm={calm}
              onResult={(buildingId, result) => {
                pendingDeed.current = { buildingId, result };
              }}
              onClose={closeOverlay}
            />
          )}
          {overlay?.kind === "interact" && !talkTo && (
            <InteractPanel
              target={overlay.target}
              kingdom={kingdom}
              world={world}
              castleType={realm.castleType}
              heroName={heroName}
              viewer={who}
              onClose={closeOverlay}
            />
          )}
          {overlay?.kind === "welcome" && (
            <WelcomeCard
              heroName={heroName}
              waiting={goal.on ? goal.name : null}
              total={kingdom.buildings.length}
              depth={depth}
              onDepth={onDepth}
              depthError={depthError}
              tutorialDone={lessons >= LESSONS.length}
              onStart={closeOverlay}
              onKnow={() => {
                if (lessonsRef.current < LESSONS.length) skipTutorial();
                closeOverlay();
              }}
            />
          )}
          {overlay?.kind === "ceremony" && ceremony && (
            <CeremonyCard info={ceremony} heroName={heroName} calm={calm} saving={ceremonySaving} error={ceremonyError} onHail={hail} />
          )}
        </>
      )}
    </div>
  );
}
