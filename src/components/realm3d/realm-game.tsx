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
import { setRealmDepth, updateRealmSettings } from "@/lib/actions/realm-settings";
import { surfacesFor, type RealmDepth } from "@/lib/realm/depth";
import type { KingdomState } from "@/lib/realm/kingdom-state";
import { buildWorldLayout } from "@/lib/realm/layout";
import { objectiveState } from "@/lib/realm/objective";
import { renderSettingsFor } from "@/lib/realm/render-settings";
import { resolvePages, withEmptyPages } from "@/lib/realm/spells/pages";
import { makeCaster, makeCastQueue, pushCast } from "@/lib/realm3d/casting";
import { clockLine, escapeFrom, spellbookHref, visitClockLine, type AccessSource, type Overlay } from "@/lib/realm3d/frame";
import { makeHudBus, type InteractTarget } from "@/lib/realm3d/hud-bus";
import { buildAnchors } from "@/lib/realm3d/plate-anchors";
import { FX_POOL, makeFxPool } from "@/lib/realm3d/spell-fx";
import { realmWorld } from "@/lib/realm3d/worldgen";
import { DEFAULT_AVATAR, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import { DEFAULT_LEARNING_PROFILE, type LearningProfile } from "@/lib/utils/learning-profile";
import type { SpellPage } from "@/lib/services/spells";
import { usePlayClock, type CloseReason } from "@/components/realm/use-play-clock";
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

const RealmCanvas = dynamic(() => import("./spike-scene"), {
  ssr: false,
  loading: () => <p className="r3-loading">Raising the hills…</p>,
});

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

const SAVE_FAILED = "That didn't save. Try again.";

/** The dev-only handle a screenshot script uses to play the scene's half of the bus. */
declare global {
  interface Window {
    __realmBus?: unknown;
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
}) {
  const world = useMemo(() => realmWorld(), []);

  /* ---- the real kingdom ----------------------------------------------- */
  // Held as state from the bundle, not read from props on every render: the deed flow (the
  // next wave) will raise buildings mid-visit, and a server refresh must not move the village
  // out from under a child. `depth` is snapshotted the same way — a surface never flips mid-play
  // unless the child asked for it in the pause menu.
  const [kingdom] = useState(realm.kingdom);
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
        villagers: !realm.kingdomError,
        banners: realm.banners,
        decor: !render.calmPalette,
        objectiveIds: objectiveKey ? objectiveKey.split(",") : [],
      }),
    // Keyed on the objective ids as a string, not the array: `objective` is rebuilt whenever
    // `surfaces` is, and a new array with the same ids must not hand the memoised World a new
    // layout — that is 20,000 props rebuilt for nothing.
    [realm.castleType, kingdom.buildings, realm.kingdomError, realm.banners, render.calmPalette, objectiveKey],
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

  // Built once, mutated for ever, shared across the canvas boundary. None of these is React
  // state and none of them can re-render anything.
  const bus = useMemo(() => makeHudBus(pages.length, anchors.length), [pages.length, anchors.length]);
  const caster = useMemo(() => makeCaster(pages.length), [pages.length]);
  const fxPool = useMemo(() => makeFxPool(FX_POOL), []);
  const casts = useMemo(() => makeCastQueue(), []);
  const hero = avatar ?? DEFAULT_AVATAR;

  /* ---- the overlay, and pausing -------------------------------------- */
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [near, setNear] = useState<InteractTarget | null>(null);
  const paused = overlay !== null;

  // The ONE writer of `bus.paused`. Every panel is an overlay, so every panel pauses the
  // scene, and nothing can open a panel that forgets to.
  useEffect(() => {
    bus.setPaused(paused);
  }, [bus, paused]);

  // The two things the scene tells the frame: what is in reach, and that E was pressed at it.
  useEffect(() => {
    bus.setHandlers({
      onNear: (t) => setNear(t),
      onInteract: (t) => setOverlay((o) => (o === null ? { kind: "interact", target: t } : o)),
    });
    return () => bus.setHandlers({ onNear: () => {}, onInteract: () => {} });
  }, [bus]);

  // Esc: pause from play, back a step from a panel. The frame owns this key; the scene does not
  // listen for it.
  useEffect(() => {
    if (close) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.repeat) return;
      e.preventDefault();
      setOverlay((o) => escapeFrom(o));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  // Development only: hand the bus to the window, so a screenshot script can fire `onNear` and
  // `onInteract` the way the scene will, and check the frame's half of the contract on its own.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    window.__realmBus = bus;
    return () => {
      if (window.__realmBus === bus) delete window.__realmBus;
    };
  }, [bus]);

  /* ---- the play clock ------------------------------------------------- */
  const childId = realm.childId;
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

  /* ---- the HUD's clicks ------------------------------------------------ */
  const onCast = useCallback((slot: number) => pushCast(casts, slot), [casts]);
  const onEmptyPage = useCallback((slot: number) => setOverlay({ kind: "page", slot }), []);
  const onPrompt = useCallback((t: InteractTarget) => setOverlay({ kind: "interact", target: t }), []);
  const closeOverlay = useCallback(() => setOverlay(null), []);

  /* ---- settings ------------------------------------------------------- */
  const canSetDepth = childId !== null && !(realm.isChildView && profile.fewerChoices);
  const settings: PauseSettings = {
    depth,
    onDepth: canSetDepth
      ? (next) => {
          setDepthError("");
          setRealmDepth(childId!, next)
            .then(() => setDepth(next))
            .catch(() => setDepthError(SAVE_FAILED));
        }
      : null,
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

  return (
    <div className="r3-game">
      <RealmCanvas
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
      />
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
          />
          <div className={`r3-frame${paused ? " r3-frame--paused" : ""}`}>
            <ObjectiveCard objective={objective} heroName={heroName} visiting={visiting} numerals={numerals} kingdomError={realm.kingdomError} />
            <VillagePlank heroName={heroName} done={raised} total={kingdom.buildings.length} numerals={numerals} />
            {visiting && <VisitorRibbon heroName={heroName} />}
            {realm.isChildView && clock.warning && <LastMinute />}
            {!paused && <InteractPrompt target={near} onPress={onPrompt} />}
            <ClockCorner
              line={line}
              warning={realm.isChildView && clock.warning}
              error={clock.error}
              onRetry={() => {
                clock.clearError();
                void clock.flushPending();
              }}
              onHelp={() => setOverlay({ kind: "howto", back: false })}
              onMenu={() => setOverlay({ kind: "pause" })}
              leaveHref="/tavern"
            />
          </div>
          {overlay?.kind === "pause" && (
            <PauseMenu
              heroName={heroName}
              viewer={realm.isChildView ? "child" : "parent"}
              onResume={closeOverlay}
              onControls={() => setOverlay({ kind: "howto", back: true })}
              leaveHref="/tavern"
              settings={settings}
              selector={selector}
            />
          )}
          {overlay?.kind === "howto" && (
            <HowToPlay slots={pages.length} back={overlay.back} onClose={() => setOverlay(escapeFrom(overlay))} />
          )}
          {overlay?.kind === "page" && (
            <EmptyPagePanel
              slot={overlay.slot}
              viewer={realm.isChildView ? "child" : "parent"}
              heroName={heroName}
              spellbookHref={bookHref}
              onClose={closeOverlay}
            />
          )}
          {overlay?.kind === "interact" && (
            <InteractPanel
              target={overlay.target}
              kingdom={kingdom}
              world={world}
              castleType={realm.castleType}
              heroName={heroName}
              viewer={realm.isChildView ? "child" : "parent"}
              onClose={closeOverlay}
            />
          )}
        </>
      )}
    </div>
  );
}
