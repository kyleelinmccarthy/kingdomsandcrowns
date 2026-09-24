"use client";

/**
 * THE REALM'S DOOR. What `/realm` renders: it asks the gate whether this child may play now,
 * and then shows the gate, the game, or the end of the day's play — full bleed, over the app's
 * own banner and bottom bar, with Leave as the way out.
 *
 * The decisions are the flat Realm's, called rather than copied: `getRealmAccess` asks, the
 * pure `entryPhase` (which calls `gateCopy`) decides, the play clock's own hook counts, and
 * `closedPhase` words the goodbye. A grown-up is never gated and never charged — that is the
 * preview the owner asked for, "a way to test the realm without having to complete quests as
 * Emma or Noah", and it carries over unchanged.
 *
 * Why a portal: the app's `<main>` is its own stacking context, so nothing inside it can rise
 * above the banner and the bottom bar however high its z-index goes. `document.body` is not a
 * stacking context, so a root portalled there at z-index 60 covers both. The body also gets
 * `data-realm-open`, which is how the app's floating popups (the quest-timer card, the hero
 * switcher, schedule toasts) know to stand down — the same contract the flat Realm set up.
 */

import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getRealmAccess, getTroubleBounty } from "@/lib/actions/realm-play";
import { earningLines, type BountyStatus } from "@/lib/realm/spells/bounty";
import type { AccessDenied } from "@/lib/utils/realm-access";
import { closedPhase, entryPhase, type EntryPhase } from "@/lib/realm3d/frame";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { readingAttributes } from "@/lib/utils/learning-profile";
import { currentTimeOfDay, localDateOf } from "@/lib/utils/schedule-days";
import type { SpellPage } from "@/lib/services/spells";
import type { CloseReason } from "@/components/realm/use-play-clock";
import { ClosedScreen, GateScreen, RealmScreen } from "./frame-hud";
import { RealmGame, type RealmData } from "./realm-game";
import "./realm-frame.css";

const UNSUPPORTED = "This computer can't open the 3D Realm yet. Try a newer browser, or turn on hardware acceleration.";

/** True unless the browser has WebGL and refuses a context. jsdom has neither, and passes. */
function webglSupported(): boolean {
  if (typeof document === "undefined") return true;
  const hasApi = typeof window.WebGL2RenderingContext !== "undefined" || typeof window.WebGLRenderingContext !== "undefined";
  if (!hasApi) return true;
  const canvas = document.createElement("canvas");
  return canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
}

const noSubscribe = () => () => {};

export type RealmFrameProps = {
  realm: RealmData;
  heroName: string;
  avatar: AvatarConfig | null;
  spellbook: { spells: SpellPage[]; slots: number } | null;
  viewer: "child" | "parent";
  castleUnlocked: boolean;
  close?: boolean;
  selector?: ReactNode;
  /** The mounts this child has earned (`bundle.mounts.unlocked`). */
  mounts?: readonly string[];
};

export function RealmFrame(props: RealmFrameProps) {
  /**
   * Snapshotted once. The page is a server component, and a refresh from anywhere hands this a
   * new avatar object, a new spellbook object and a new kingdom — every one of which is a prop
   * the memoised World checks by identity. A child's Realm is keyed by the child on the page, so
   * a different child is a different mount; the same child's visit keeps what it opened with.
   */
  const [snap] = useState(props);
  const childId = snap.realm.childId;
  const isChildView = snap.realm.isChildView;
  const [phase, setPhase] = useState<EntryPhase>({ kind: "checking" });
  /** Why the gate is shut, when it is: the earning line is said only when minutes are what is missing. */
  const [denied, setDenied] = useState<AccessDenied | null>(null);
  /** Today's bounty, for the earning line: undefined until asked and answered, null if the ask failed. */
  const [bounty, setBounty] = useState<BountyStatus | null | undefined>(undefined);

  useEffect(() => {
    if (!childId) {
      // Nothing to ask the gate about; only the old spike path renders without a child.
      queueMicrotask(() => setPhase({ kind: "open", minutes: 0, visit: null, source: null }));
      return;
    }
    let cancelled = false;
    getRealmAccess(childId, localDateOf(new Date()), currentTimeOfDay())
      .then((result) => {
        if (cancelled) return;
        if (!webglSupported()) {
          setPhase({ kind: "unsupported" });
          return;
        }
        if (!result.allowed) setDenied(result.reason);
        setPhase(entryPhase(result, isChildView));
      })
      .catch((err: unknown) => {
        if (!cancelled) setPhase({ kind: "gated", copy: { title: "The Realm is out of reach right now.", body: err instanceof Error ? err.message : "Try again in a moment." } });
      });
    return () => {
      cancelled = true;
    };
  }, [childId, isChildView]);

  const onClose = useCallback((reason: CloseReason) => {
    setDenied(reason);
    setPhase(closedPhase(reason));
  }, []);

  // Shut for want of minutes: say how they are earned, from the one source (`earningLines`),
  // with today's bounty so the number is the day's own.
  const earning = snap.realm.earning;
  const wantsEarning = isChildView && !!childId && !!earning && denied === "no_minutes" && (phase.kind === "gated" || phase.kind === "closed");
  useEffect(() => {
    if (!wantsEarning || !childId) return;
    let live = true;
    getTroubleBounty(childId, localDateOf(new Date()))
      .then((s) => live && setBounty(s))
      .catch(() => live && setBounty(null));
    return () => {
      live = false;
    };
  }, [wantsEarning, childId]);
  const earningExtra = wantsEarning && earning && bounty !== undefined ? earningLines(earning, bounty, earning.accessMode).join(" ") || undefined : undefined;

  // The app's floating chrome stands down while the Realm is up, and comes back on every exit.
  useEffect(() => {
    document.body.setAttribute("data-realm-open", "true");
    return () => document.body.removeAttribute("data-realm-open");
  }, []);

  // Portalled only once hydrated: the server has no body to portal into and renders nothing, so
  // the client's first render must render nothing too, or React reports a hydration mismatch.
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  if (!hydrated) return null;
  const target = document.body;

  let content: ReactNode;
  if (phase.kind === "checking") content = <RealmScreen icon="castle" title="Opening the gates…" />;
  else if (phase.kind === "unsupported") content = <RealmScreen icon="castle" title="The Realm can't open here" body={UNSUPPORTED} />;
  else if (phase.kind === "gated") content = <GateScreen copy={phase.copy} heroName={snap.heroName} portrait={snap.avatar} extra={earningExtra} />;
  else if (phase.kind === "closed") content = <ClosedScreen heroName={snap.heroName} body={phase.body} portrait={snap.avatar} extra={earningExtra} />;
  else
    content = (
      <RealmGame
        avatar={snap.avatar}
        close={snap.close}
        heroName={snap.heroName}
        spellbook={snap.spellbook}
        viewer={snap.viewer}
        castleUnlocked={snap.castleUnlocked}
        realm={snap.realm}
        mounts={snap.mounts}
        entry={{ minutes: phase.minutes, visit: phase.visit, source: phase.source }}
        onClose={onClose}
        // The selector is live, not snapshotted: it is how a grown-up moves to another child.
        selector={props.selector}
      />
    );

  return createPortal(
    <div className="r3-root" onContextMenu={(e) => e.preventDefault()} {...readingAttributes(snap.realm.profile)}>
      {content}
    </div>,
    target,
  );
}
