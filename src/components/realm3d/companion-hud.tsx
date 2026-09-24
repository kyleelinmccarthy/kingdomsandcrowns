"use client";

/**
 * THE COMPANION LEADS YOU, the frame half: the F key, the pet's slot on the bar, the words, and
 * the pet's way drawn on the map. No three.js — this is DOM, and it talks to the canvas only
 * through the `LeadBus` (`lib/realm3d/lead.ts`), which it builds once and hands to the canvas.
 *
 * `useCompanionLead` is the one hook `realm-game.tsx` calls. Everything it returns is stable or
 * rare state: the bus never changes identity, and the words change a handful of times a visit.
 *
 * Who has one: a child with a companion on their avatar. A visiting grown-up walks alone — the
 * pet is the child's (`spike-scene.tsx` draws none for the wizard) — so they get none of this.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import type { Goal } from "@/lib/realm3d/guide";
import { askLead, askStopLead, chooseLead, makeLeadBus, setLeadBreakOff, setLeadNews, type ErrandKind, type LeadBus, type LeadMode, type LeadNews, type LeadTarget } from "@/lib/realm3d/lead";
import type { Vec2 } from "@/lib/realm3d/travel";
import type { RealmWorld } from "@/lib/realm3d/worldgen";
import { COMPANIONS, type AvatarConfig } from "@/lib/utils/avatar-catalog";
import { realmCue } from "@/lib/realm3d/sound/store";
import { MAP_WINDOW } from "@/lib/realm3d/minimap";
import { speak } from "@/lib/utils/speech";
import { keepFocusInWorld } from "./frame-hud";
import "./companion.css";

/** The map's viewBox is 100 across and shows MAP_WINDOW world units: a glyph is counter-scaled by this. */
const GLYPH = MAP_WINDOW / 100;

/** How long a line from the pet stays in the top lane. */
export const LEAD_LINE_MS = 4200;

/** What the pet is called in the words: "Fox", "Baby Dragon". */
export function petLabel(avatar: Pick<AvatarConfig, "companion"> | null | undefined): string | null {
  const id = avatar?.companion;
  if (!id) return null;
  return COMPANIONS.find((c) => c.id === id)?.label ?? "companion";
}

/* ------------------------------------------------------------------ the words */

/** Every line the pet's leading says, in one place, so the tests and the game read the same words. */
export const leadWords = {
  start(pet: string, t: LeadTarget): string {
    if (t.kind === "villager") return `Your ${pet} knows the way to ${t.name}. Follow!`;
    if (t.kind === "place") return `Your ${pet} has sniffed out somewhere new. Follow!`;
    return `Your ${pet} knows the way home. Follow!`;
  },
  arrive(pet: string, t: LeadTarget): string {
    if (t.kind === "villager") return `Here's ${t.name}! Press E to talk.`;
    if (t.kind === "place") return `Your ${pet} found it: ${t.name}!`;
    return `Home again! Your ${pet} knew the way.`;
  },
  stopped: (pet: string) => `Your ${pet} comes back to you.`,
  lost: (pet: string) => `Your ${pet} lost you, so it came back. Press F to ask again.`,
  noway: (pet: string) => `Your ${pet} can't find a way from here. Try from a road.`,
  here: (name: string) => `${name} is right here! Press E to talk.`,
  nothing: (pet: string) => `You've found every place, and nobody is waiting. Your ${pet} is happy just to walk with you.`,
  indoors: (pet: string) => `Outside, your ${pet} will show you the way.`,
  /** The pet's own small jobs, said once a visit (sit, sniff) or each time (a trouble): never the only marker. */
  sniff: (pet: string) => `Your ${pet} can smell gleams! Follow its nose.`,
  sit: (pet: string) => `Your ${pet} is waiting at the door. Walk in, or press E.`,
  trouble: (pet: string) => `Your ${pet} spotted a trouble near the road!`,
  /** Added to the objective as it is read aloud (the spec's objective announcement, §3.7). */
  objective: (pet: string) => `Your ${pet} will show you the way: press F.`,
  none: "You don't have a companion yet. In the Tavern, open your hero's look and pick one on the Companion tab. The Cat and the Dog are free.",
};

/* ------------------------------------------------------------------ the hook */

export type CompanionLead = {
  bus: LeadBus;
  /** The child has a pet to lead them. */
  has: boolean;
  /** "Fox", or null. */
  pet: string | null;
  /** Leading (or about to): the slot reads Stop. */
  leading: boolean;
  /** What the pet is doing, for the slot's caption. */
  mode: LeadMode | "heel";
  /** The pet's own small job, if it is on one (sit, sniff, trouble). */
  errand: ErrandKind | null;
  /** Where it is taking the child, and the way it will go (the map draws both), or null. */
  target: LeadTarget | null;
  route: readonly Vec2[] | null;
  line: string | null;
  clearLine: () => void;
  /** F, or the pet's slot: ask for a lead, or stop one. */
  toggle: () => void;
};

export function useCompanionLead({
  avatar,
  viewer,
  calm,
  readAloud,
  bus,
  goal,
  world,
  found,
  insideRef,
  breakOff = false,
}: {
  avatar: Pick<AvatarConfig, "companion">;
  viewer: "child" | "parent";
  /** Reduced motion or low stimulus: a gentler pet. */
  calm: boolean;
  readAloud: boolean;
  /** For where the child is (`bus.ear`, written every frame) and whether the game is theirs. */
  bus: HudBus;
  /** Whoever is waiting: the gold !'s villager (`goalFor`). */
  goal: Goal;
  world: Pick<RealmWorld, "landmarks">;
  /** The places found: an unfound one is somewhere to lead to. */
  found: ReadonlySet<string>;
  /** Indoors, a lead waits for the door. */
  insideRef: React.RefObject<unknown>;
  /** Full depth and not `fewerChoices`: a leading pet may break off toward a trouble (spec §3.6). */
  breakOff?: boolean;
}): CompanionLead {
  const pet = viewer === "child" ? petLabel(avatar) : null;
  const has = pet !== null;
  // Built once for the visit: the canvas is memoised on it.
  const [lead] = useState<LeadBus>(() => makeLeadBus(calm));
  const [leading, setLeading] = useState(false);
  const [mode, setMode] = useState<LeadMode | "heel">("heel");
  const [target, setTarget] = useState<LeadTarget | null>(null);
  const [route, setRoute] = useState<readonly Vec2[] | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const [errand, setErrand] = useState<ErrandKind | null>(null);
  /** Sit and sniff are explained once a visit; after that the pet simply does them. */
  const told = useRef({ sit: false, sniff: false });
  const lastSpoken = useRef<string | null>(null);

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

  // What the canvas says back: set off, arrived, lost the child, stopped, or found no way.
  useEffect(() => {
    if (!pet) return;
    const hear = (n: LeadNews) => {
      switch (n.kind) {
        case "start":
          setLeading(true);
          setTarget(n.target);
          setRoute(n.route);
          // Development only: the way, for a screenshot script to walk the child along.
          if (process.env.NODE_ENV !== "production") (window as unknown as { __realmLeadRoute?: readonly Vec2[] }).__realmLeadRoute = n.route;
          // Taken up again after a ride: the child already knows; no second "Follow!".
          if (!n.again) {
            say(leadWords.start(pet, n.target));
            realmCue("pet-lead");
          }
          return;
        case "arrive":
          say(leadWords.arrive(pet, n.target));
          realmCue("pet-arrive");
          return;
        case "lost":
          say(leadWords.lost(pet));
          return;
        case "stopped":
          say(leadWords.stopped(pet));
          return;
        case "noway":
          setLeading(false);
          say(leadWords.noway(pet));
          realmCue("refuse");
          return;
        case "errand":
          setErrand(n.errand);
          if (n.errand === "trouble") say(leadWords.trouble(pet));
          else if (n.errand === "sit" && !told.current.sit) {
            told.current.sit = true;
            say(leadWords.sit(pet));
          } else if (n.errand === "sniff" && !told.current.sniff) {
            told.current.sniff = true;
            say(leadWords.sniff(pet));
          }
          return;
        case "mode":
          setMode(n.mode);
          if (n.mode === "heel") {
            setLeading(false);
            setTarget(null);
            setRoute(null);
          }
          return;
      }
    };
    setLeadNews(lead, hear);
    return () => setLeadNews(lead, null);
  }, [lead, pet, say]);

  // The frame's say on the trouble break-off: the canvas reads it every frame.
  useEffect(() => {
    setLeadBreakOff(lead, has && breakOff);
  }, [lead, has, breakOff]);

  // Read at the moment F is pressed, not captured at render.
  const live = useRef({ goal, found, world });
  useEffect(() => {
    live.current = { goal, found, world };
  }, [goal, found, world]);

  const toggle = useCallback(() => {
    if (viewer !== "child") return;
    if (!pet) {
      say(leadWords.none);
      realmCue("refuse");
      return;
    }
    // Leading, or asked to: stop, and come back to heel.
    if (lead.active || lead.ask) {
      const wasAsked = !lead.active;
      askStopLead(lead);
      setLeading(false);
      if (wasAsked) say(leadWords.stopped(pet));
      return;
    }
    const { goal: g, found: f, world: w } = live.current;
    const choice = chooseLead({ x: bus.ear.x, z: bus.ear.z }, g, w.landmarks, f);
    if (!choice.ok) {
      say(choice.reason === "here" ? leadWords.here(g.name) : leadWords.nothing(pet));
      return;
    }
    askLead(lead, choice.target);
    setLeading(true);
    // Indoors the island is frozen: the pet takes the child from the door when they come out.
    if (insideRef.current) say(leadWords.indoors(pet));
  }, [viewer, pet, lead, bus, say, insideRef]);

  // F: ask the pet the way, or stop it. Never while typing or in a menu.
  useEffect(() => {
    if (viewer !== "child") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "KeyF" || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.isContentEditable || t.closest("input, textarea, select, [role='dialog']"))) return;
      if (bus.paused && !insideRef.current) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer, bus, insideRef, toggle]);

  // Development only: the lead bus, for a screenshot script to read and steer.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __realmLead?: LeadBus };
    w.__realmLead = lead;
    return () => {
      if (w.__realmLead === lead) delete w.__realmLead;
    };
  }, [lead]);

  return { bus: lead, has, pet, leading, mode, errand, target, route, line, clearLine, toggle };
}

/* ------------------------------------------------------------------ on screen */

/** A paw: the pet's slot's mark, its lines', and its place on the map. */
export function PawMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 12.2c-3 0-6.1 3.6-6.1 6.3 0 1.7 1.3 2.5 2.7 2.5 1.3 0 2.2-.8 3.4-.8s2.1.8 3.4.8c1.4 0 2.7-.8 2.7-2.5 0-2.7-3.1-6.3-6.1-6.3ZM5.1 11.9c1.3-.3 2-1.9 1.6-3.5-.4-1.6-1.8-2.6-3.1-2.3-1.3.3-2 1.9-1.6 3.5.4 1.6 1.8 2.6 3.1 2.3Zm13.8 0c1.3.3 2.7-.7 3.1-2.3.4-1.6-.3-3.2-1.6-3.5-1.3-.3-2.7.7-3.1 2.3-.4 1.6.3 3.2 1.6 3.5ZM9 8.4c1.5 0 2.6-1.5 2.6-3.4S10.5 1.6 9 1.6 6.4 3.1 6.4 5 7.5 8.4 9 8.4Zm6 0c1.5 0 2.6-1.5 2.6-3.4S16.5 1.6 15 1.6s-2.6 1.5-2.6 3.4 1.1 3.4 2.6 3.4Z"
      />
    </svg>
  );
}

/** What the slot says under the paw: ask ("Show me"), or, while it leads, stop it. */
export function slotCaption(leading: boolean): string {
  return leading ? "Stop" : "Show me";
}

/** What the pet is doing, in a child's words, for the slot's tooltip and its spoken name. */
export function modeWords(mode: LeadMode | "heel"): string {
  if (mode === "wait") return "waiting for you";
  if (mode === "back") return "coming back for you";
  if (mode === "arrived") return "there";
  if (mode === "lead") return "leading";
  return "by your side";
}

/** The pet's own small job, in a child's words, for the slot's tooltip and its spoken name. */
export function errandWords(errand: ErrandKind): string {
  if (errand === "sit") return "sitting by the door";
  if (errand === "sniff") return "sniffing out a gleam";
  return "watching a trouble";
}

/**
 * The pet's slot, after the Ride slot at the end of the bar. It carries the F keycap and a paw,
 * says "Follow" (ask the pet the way) or "Stop" while it leads, and is there for a child with no
 * pet too, as an empty one that says how to get one. A visitor has none.
 */
export function CompanionSlot({ lead, onPress, calm = false }: { lead: CompanionLead; onPress: () => void; calm?: boolean }) {
  const { has, pet, leading, mode, errand } = lead;
  const label = !has ? "No pet" : slotCaption(leading);
  const doing = errand ? errandWords(errand) : modeWords(mode);
  const aria = !has
    ? "No companion yet. How do I get one?"
    : leading
      ? `Your ${pet} is ${doing}. Stop, key F`
      : errand
        ? `Your ${pet} is ${doing}. Ask it to show you the way, key F`
        : `Ask your ${pet} to show you the way, key F`;
  return (
    <>
      <button
        type="button"
        className={`r3-slot r3-pet-slot${leading ? " r3-pet-slot--on" : ""}${has ? "" : " r3-pet-slot--none"}${calm ? " r3-pet-slot--calm" : ""}`}
        aria-label={aria}
        aria-pressed={has ? leading : undefined}
        title={has ? (leading ? `Your ${pet} is ${doing}. F to stop.` : errand ? `Your ${pet} is ${doing}. F: show me the way.` : `Your ${pet} shows you the way. F.`) : undefined}
        onMouseDown={keepFocusInWorld}
        onClick={onPress}
      >
        <span className="r3-slot-key">F</span>
        <PawMark className="r3-slot-icon r3-pet-icon" />
        <span className="r3-slot-name">{label}</span>
      </button>
    </>
  );
}

/** The pet's words, in the top lane. */
export function LeadLine({ line, onDone }: { line: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!line) return;
    const id = window.setTimeout(onDone, LEAD_LINE_MS);
    return () => window.clearTimeout(id);
  }, [line, onDone]);
  if (!line) return null;
  return (
    <div className="r3-toast r3-pet-line" role="status">
      <PawMark className="r3-pet-line-icon" />
      <span className="r3-toast-text">
        <span className="r3-toast-line">{line}</span>
      </span>
    </div>
  );
}

/**
 * On the map, in world units (it pans with the land): the way the pet is taking the child, as
 * a line of paw dots, and a paw where it ends — unless that is the waiting villager, whom the
 * gold ! already marks. One map, one set of marks: the pet's way never hides the !.
 */
export function LeadMapMarks({ route, target }: { route: readonly Vec2[] | null; target: LeadTarget | null }) {
  const d = useMemo(() => (route && route.length > 1 ? route.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(" ") : null), [route]);
  if (!d || !route) return null;
  const end = route[route.length - 1];
  return (
    <g className="r3-map-lead">
      <path className="r3-map-lead-way" d={d} />
      {target && target.kind !== "villager" && (
        <g transform={`translate(${end.x} ${end.z}) scale(${GLYPH})`}>
          <circle className="r3-map-lead-end" r={4.2} />
          <g transform="translate(-3.4 -3.4) scale(0.28)">
            <path
              className="r3-map-lead-paw"
              d="M12 12.2c-3 0-6.1 3.6-6.1 6.3 0 1.7 1.3 2.5 2.7 2.5 1.3 0 2.2-.8 3.4-.8s2.1.8 3.4.8c1.4 0 2.7-.8 2.7-2.5 0-2.7-3.1-6.3-6.1-6.3ZM5.1 11.9c1.3-.3 2-1.9 1.6-3.5-.4-1.6-1.8-2.6-3.1-2.3-1.3.3-2 1.9-1.6 3.5.4 1.6 1.8 2.6 3.1 2.3Zm13.8 0c1.3.3 2.7-.7 3.1-2.3.4-1.6-.3-3.2-1.6-3.5-1.3-.3-2.7.7-3.1 2.3-.4 1.6.3 3.2 1.6 3.5ZM9 8.4c1.5 0 2.6-1.5 2.6-3.4S10.5 1.6 9 1.6 6.4 3.1 6.4 5 7.5 8.4 9 8.4Zm6 0c1.5 0 2.6-1.5 2.6-3.4S16.5 1.6 15 1.6s-2.6 1.5-2.6 3.4 1.1 3.4 2.6 3.4Z"
            />
          </g>
        </g>
      )}
    </g>
  );
}

