"use client";

/**
 * RIDING, the frame half: the M key, the words, the Ride slot on the bar, and the fast-travel
 * sheet. No three.js — this is DOM, and it talks to the canvas only through the `RideBus`
 * (`lib/realm3d/riding.ts`), which it builds once and hands to the canvas as a prop.
 *
 * `useRiding` is the one hook `realm-game.tsx` calls. Everything it returns is stable or rare
 * state: the bus never changes identity, and `riding` / `line` change a handful of times a visit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HudBus, InteractTarget } from "@/lib/realm3d/hud-bus";
import {
  askStop,
  askTravel,
  castBlocked,
  CAST_FROM_SADDLE,
  isRiding,
  makeRideBus,
  parkNow,
  readVisited,
  rideAccess,
  rideRefusal,
  rideSpeed,
  setRideHandlers,
  toggleRide,
  visitedKey,
  waitingOutside,
  type RideAccess,
  type RideBus,
} from "@/lib/realm3d/riding";
import { postAt, travelDestinations, VILLAGE_ID, type Destination, type TravelGraph } from "@/lib/realm3d/travel";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { speak } from "@/lib/utils/speech";
import { keepFocusInWorld, Panel } from "./frame-hud";
import "./riding.css";

/** How long a riding line stays in the top lane. */
export const RIDE_LINE_MS = 4200;

function readStored(childId: string | null): string[] {
  if (!childId || typeof window === "undefined") return [];
  try {
    return readVisited(window.localStorage.getItem(visitedKey(childId)));
  } catch {
    return [];
  }
}

function store(childId: string | null, ids: Iterable<string>): void {
  if (!childId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(visitedKey(childId), JSON.stringify([...ids]));
  } catch {
    // A private window or blocked storage: the child walks there once more next visit.
  }
}

/** The place names, for the words. */
function nameOf(graph: TravelGraph, id: string): string {
  return graph.nodes.get(id)?.name ?? "there";
}

export type Riding = {
  bus: RideBus;
  access: RideAccess;
  /** In the saddle (or getting into it). */
  riding: boolean;
  /** A fast-travel ride is running: the name of where to. */
  travelling: string | null;
  /** The line in the top lane, or null. */
  line: string | null;
  clearLine: () => void;
  /** M, or the Ride slot. */
  toggle: () => void;
  /** A spell was asked for: true (and said why) when it must not go off. */
  refuseCast: () => boolean;
  /** Going through a door: a riding child is set down at it and the mount waits outside. */
  atDoor: () => void;
  /** E at a hitching post: true when the sheet should open. */
  atPost: (t: InteractTarget) => boolean;
  /** The sheet's rows from the post the child stands at. */
  destinations: (fromId: string, single: boolean, numerals: boolean) => Destination[];
  /** Ride to one. */
  go: (to: string) => void;
  stop: () => void;
};

export function useRiding({
  avatar,
  unlocked,
  viewer,
  heroName,
  childId,
  reducedMotion,
  readAloud,
  bus,
  graph,
  insideRef,
  onRode,
}: {
  avatar: AvatarConfig;
  unlocked: readonly string[];
  viewer: "child" | "parent";
  heroName: string;
  childId: string | null;
  reducedMotion: boolean;
  readAloud: boolean;
  bus: HudBus;
  graph: TravelGraph;
  /** Indoors, M says where the mount is instead. */
  insideRef: React.RefObject<unknown>;
  /** The first time the child is in the saddle this visit: the tutorial's "ride" lesson. */
  onRode?: () => void;
}): Riding {
  const access = useMemo(() => rideAccess(avatar, unlocked, viewer), [avatar, unlocked, viewer]);
  // Built once for the visit: the canvas is memoised on it.
  const [ride] = useState<RideBus>(() =>
    makeRideBus(
      access.ok ? { id: access.mount.id, label: access.mount.label, color: access.color, speed: access.mount.speed, tack: avatar.backgroundColor || avatar.outfitColor } : null,
      reducedMotion,
      viewer === "child" ? readStored(childId) : [],
    ),
  );
  const [riding, setRiding] = useState(false);
  const [travelling, setTravelling] = useState<string | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const lastSpoken = useRef<string | null>(null);
  const onRodeRef = useRef(onRode);
  useEffect(() => {
    onRodeRef.current = onRode;
  }, [onRode]);

  const say = useCallback(
    (text: string) => {
      setLine(text);
      if (readAloud && lastSpoken.current !== text) {
        lastSpoken.current = text;
        speak(text);
      }
    },
    [readAloud],
  );
  const clearLine = useCallback(() => {
    setLine(null);
    lastSpoken.current = null;
  }, []);

  useEffect(() => {
    setRideHandlers(ride, {
      onRiding: (r) => {
        setRiding(r);
        if (r) onRodeRef.current?.();
      },
      // Everything the scene says is a refusal (too deep to get down, no spells from the
      // saddle): it gets the refusal's soft tap as well as the words.
      onSay: (text) => {
        say(text);
        ride.sound.onRefuse();
      },
      onVisit: () => {
        if (viewer === "child") store(childId, ride.visited);
      },
      onTravel: (state, to) => {
        const where = nameOf(graph, to);
        if (state === "start") {
          // The banner says where to, with its Stop; read aloud, it is said as well.
          setTravelling(where);
          if (readAloud) speak(`Riding to ${where}. Press W, A, S or D to pull up.`);
        } else {
          setTravelling(null);
          say(state === "arrive" ? `You're at ${where}.` : "You pulled up on the road.");
        }
      },
    });
  }, [ride, say, viewer, childId, graph, readAloud]);

  // Development only: the ride bus, for a screenshot script to read and steer.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __realmRide?: RideBus };
    w.__realmRide = ride;
    return () => {
      if (w.__realmRide === ride) delete w.__realmRide;
    };
  }, [ride]);

  const toggle = useCallback(() => {
    if (!access.ok) {
      say(rideRefusal(access, heroName));
      ride.sound.onRefuse();
      return;
    }
    if (insideRef.current) {
      say(waitingOutside(access.mount.label));
      ride.sound.onRefuse();
      return;
    }
    if (ride.travelling) return;
    toggleRide(ride);
  }, [access, heroName, insideRef, ride, say]);

  // M: get on, get off. Heard here, where the words are, and never while typing or in a menu.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyM" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || t.closest("input, textarea, select, [role='dialog']"))) return;
      if (bus.paused && !insideRef.current) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bus, insideRef, toggle]);

  const refuseCast = useCallback(() => {
    if (!castBlocked(ride)) return false;
    say(CAST_FROM_SADDLE);
    ride.sound.onRefuse();
    return true;
  }, [ride, say]);

  // Through a door on a mount: set down at the door, and it waits a step to the side of it.
  const atDoor = useCallback(() => {
    if (parkNow(ride, 2.1, 1.2)) say(`Your ${ride.mount?.label ?? "mount"} will wait for you outside.`);
  }, [ride, say]);

  const atPost = useCallback(
    (t: InteractTarget) => {
      if (t.kind !== "post") return false;
      if (!access.ok) {
        say(access.reason === "visitor" ? `A hitching post. ${heroName} can ride from here to anywhere ${heroName} has been.` : rideRefusal(access, heroName));
        // A visitor is being told about the post, not refused anything.
        if (access.reason !== "visitor") ride.sound.onRefuse();
        return false;
      }
      if (!isRiding(ride) || ride.phase !== "on") {
        say(`Get on your ${access.mount.label} first. Press M.`);
        ride.sound.onRefuse();
        return false;
      }
      if (ride.travelling) return false;
      return true;
    },
    [access, heroName, ride, say],
  );

  const destinations = useCallback(
    (fromId: string, single: boolean, numerals: boolean) => {
      const speed = ride.mount ? rideSpeed(ride.mount) : 0;
      const rows = travelDestinations(graph, fromId, { x: ride.at.x, z: ride.at.z }, ride.visited, speed);
      const out = numerals ? rows : rows.map((r) => ({ ...r, seconds: null }));
      // Simple depth, or fewer choices: one row, home — where the objective always is on the island.
      return single ? out.filter((r) => r.id === VILLAGE_ID && r.state === "ready") : out;
    },
    [graph, ride],
  );

  const go = useCallback((to: string) => askTravel(ride, to), [ride]);
  const stop = useCallback(() => askStop(ride), [ride]);

  return { bus: ride, access, riding, travelling, line, clearLine, toggle, refuseCast, atDoor, atPost, destinations, go, stop };
}

/* ------------------------------------------------------------------ the words */

export function RideLine({ line, onDone }: { line: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!line) return;
    const id = window.setTimeout(onDone, RIDE_LINE_MS);
    return () => window.clearTimeout(id);
  }, [line, onDone]);
  if (!line) return null;
  return (
    <div className="r3-toast r3-ride-line" role="status">
      <HorseMark className="r3-ride-line-icon" />
      <span className="r3-toast-text">
        <span className="r3-toast-line">{line}</span>
      </span>
    </div>
  );
}

/** A horse's head: the Ride slot's mark and the riding lines'. */
export function HorseMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 22c-.6-3.4.2-6.1 2.3-8.3-1.6.2-3 .9-4.3 2.1-.9-.7-1.4-1.6-1.3-2.7l4.9-6.4c.5-1.8 1.7-3.1 3.6-3.9L11.4 1l2.3 1.5c3.9.6 6.4 3.6 7.1 8.4.4 3 .1 6.6-.9 11.1H7Zm6.1-15.6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ the Ride slot */

/**
 * The mount's slot, at the end of the spell bar after a divider — where the flat Realm put its
 * Ride button ("beside the ability bar"). It says Ride or Get off, carries the M keycap, and is
 * there for a child with no mount too, as an empty saddle that says how to get one.
 */
export function RideSlot({ riding, access, onPress }: { riding: boolean; access: RideAccess; onPress: () => void }) {
  if (!access.ok && access.reason === "visitor") return null;
  const label = !access.ok ? "No mount" : riding ? "Get off" : `Ride`;
  const aria = !access.ok ? "No mount yet. How do I get one?" : riding ? `Get off your ${access.mount.label}, key M` : `Ride your ${access.mount.label}, key M`;
  return (
    <>
      <span className="r3-ride-divider" aria-hidden="true" />
      <button
        type="button"
        className={`r3-slot r3-ride-slot${riding ? " r3-ride-slot--on" : ""}${access.ok ? "" : " r3-ride-slot--none"}`}
        aria-label={aria}
        aria-pressed={access.ok ? riding : undefined}
        onMouseDown={keepFocusInWorld}
        onClick={onPress}
      >
        <span className="r3-slot-key">M</span>
        <HorseMark className="r3-slot-icon r3-ride-icon" />
        <span className="r3-slot-name">{label}</span>
      </button>
    </>
  );
}

/* ------------------------------------------------------------------ fast travel */

/**
 * The sheet a hitching post opens: where to, and how long. A place never visited is shown, and
 * says how it opens ("Walk there once"); the one you are at says so. Pauses the world, like
 * every panel; Esc closes it.
 */
export function TravelSheet({
  rows,
  mountLabel,
  numerals,
  single = false,
  onGo,
  onClose,
}: {
  rows: Destination[];
  mountLabel: string;
  numerals: boolean;
  /** Simple depth or fewer choices: one row, home (the spec's "Ride to {district}?"). */
  single?: boolean;
  onGo: (id: string) => void;
  onClose: () => void;
}) {
  const ready = rows.filter((r) => r.state === "ready");
  // Places not yet found are counted, not listed: a sheet of fifteen greyed-out rows is a wall.
  const shown = rows.filter((r) => r.state !== "locked");
  const locked = rows.length - shown.length;
  return (
    <Panel title="Where to?" label="Fast travel" wide icon={<HorseMark className="r3-board-icon" />} onClose={onClose}>
      <p className="r3-board-sub">
        Your {mountLabel} knows the roads to anywhere you&rsquo;ve been. Walk to a new place once, and you can ride back any time.
      </p>
      {ready.length === 0 && (
        <p className="r3-travel-none">
          {single
            ? "You're home! From the hitching post at any place you find, your mount can bring you straight back here."
            : "Nowhere to ride to from here yet. Explore, and the places you find will show up here."}
        </p>
      )}
      <ul className="r3-travel">
        {shown.map((r) => (
          <li key={r.id}>
            <button type="button" className={`r3-travel-row r3-travel-row--${r.state}`} disabled={r.state !== "ready"} onClick={() => onGo(r.id)}>
              <span className="r3-travel-name">{r.name.replace(/^the /, "The ")}</span>
              <span className="r3-travel-time">
                {r.state === "here" ? "You're here" : numerals && r.seconds !== null ? `${r.words} · ${r.seconds.toFixed(1)} s` : r.words}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {locked > 0 && (
        <p className="r3-travel-more">
          {locked === 1 ? "1 more place" : `${locked} more places`} to find. Walk to one once, and it shows up here.
        </p>
      )}
      <div className="r3-board-foot">
        <button type="button" className="r3-menu-item" onClick={onClose}>
          Not now
        </button>
      </div>
    </Panel>
  );
}

/** On a ride: where to, and the Stop button a thumb or a mouse can reach. */
export function TravelBanner({ to, onStop }: { to: string | null; onStop: () => void }) {
  if (!to) return null;
  return (
    <div className="r3-travel-banner" role="status">
      <HorseMark className="r3-travel-banner-icon" />
      <span className="r3-travel-banner-text">Riding to {to}</span>
      <button type="button" className="r3-travel-stop" onMouseDown={keepFocusInWorld} onClick={onStop}>
        Stop
      </button>
    </div>
  );
}

/** The post the child stands at, from what E was pressed at. */
export function postFrom(graph: TravelGraph, t: InteractTarget, at: { x: number; z: number }): string {
  return t.kind === "post" ? t.id : (postAt(graph, at.x, at.z)?.id ?? VILLAGE_ID);
}
