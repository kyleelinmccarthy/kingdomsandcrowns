"use client";

/**
 * THE HUD. Plain DOM and SVG, outside the `<Canvas>`, and it never imports `three`.
 *
 * Five things, because the owner named five: a map, a spell bar, a mana bar, the child's own
 * name, and nameplates. The design brief was the harder half of it — the standing complaint
 * about the flat Realm was that it was "too ugly and uninteresting and kids aren't going to
 * enjoy playing this", and a HUD of grey boxes over a warm low-poly island reads exactly the
 * same way. So every panel here is drawn from the world's own palette: the plaster and timber
 * of the village houses, the cobble tan of the road, the lantern gold that is already the only
 * light source in the picture. Chunky borders, big type, no hairlines, no grey.
 *
 * Nothing in this file runs per frame. It renders once per real event — a place found, a slot
 * refused — and hands its own DOM nodes to `bus`, which the scene's driver writes directly.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { GameIcon } from "@/components/game-icon";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { keyHints } from "@/lib/realm3d/frame";
import { castAction, defaultKeymap, primaryLabel, type Keymap } from "@/lib/realm3d/keymap";
import { keepFocusInWorld } from "./frame-hud";
import type { SpellPageView } from "@/lib/realm/spells/pages";
import { MANA_MAX, REFUSAL_MS } from "@/lib/realm3d/casting";
import type { HudBus } from "@/lib/realm3d/hud-bus";
import { NO_GOAL, type Goal } from "@/lib/realm3d/guide";
import { glyphScaleFor, MAP_VIEW, MAP_WINDOW } from "@/lib/realm3d/minimap";
import type { PlateAnchor } from "@/lib/realm3d/plate-anchors";
import { PlateStars } from "./plate-stars";
import type { RealmWorld } from "@/lib/realm3d/worldgen";
import { MapLayers, useBakedLand, YOU_GLYPH } from "./map-layers";

/* ------------------------------------------------------------------ the map */

/** The map's own viewBox, 100 units square (`MAP_VIEW`), so the compass and the rim sit in it. */
const MAP = MAP_VIEW;

/** The four points of the compass, just inside the rim. */
const COMPASS = [
  { letter: "N", x: MAP / 2, y: 7 },
  { letter: "E", x: MAP - 7, y: MAP / 2 },
  { letter: "S", x: MAP / 2, y: MAP - 7 },
  { letter: "W", x: 7, y: MAP / 2 },
] as const;

/** An arrow pinned to the rim for home when it is off the window. */
const RIM_GLYPH = "M0,-4.6 L3.4,2.6 L-3.4,2.6 Z";
/** Which way the camera is looking: a wedge out of the middle of the map. */
const CONE_GLYPH = "M0,0 L-13,-26 A29,29 0 0,1 13,-26 Z";

function Minimap({
  bus,
  world,
  found,
  castle,
  goal,
  extras,
}: {
  bus: HudBus;
  world: RealmWorld;
  found: ReadonlySet<string>;
  /** More marks in world units, panning with the land: the troubles' dots. */
  extras?: ReactNode;
  /** Whether the child's castle stands. No castle, no home mark and no arrow pointing home. */
  castle: boolean;
  /** Who the objective card sends the child to: a gold ! on the map, and a rim arrow past it. */
  goal: Goal;
}) {
  const land = useBakedLand(world);

  return (
    <div className="r3-map" aria-hidden="true">
      <svg viewBox={`0 0 ${MAP} ${MAP}`}>
        <defs>
          <clipPath id="r3-map-clip">
            <circle cx={MAP / 2} cy={MAP / 2} r={MAP / 2 - 1} />
          </clipPath>
        </defs>
        <circle className="r3-map-void" cx={MAP / 2} cy={MAP / 2} r={MAP / 2 - 1} />
        <g clipPath="url(#r3-map-clip)">
          {/*
            One group, one transform, written once a frame by the driver. Everything inside is
            in WORLD units, which is what makes that possible: the land bitmap, the roads and
            every place mark pan together for the cost of a single attribute write, where
            positioning twenty marks individually would be twenty writes a frame.
          */}
          <g ref={(el) => bus.setNode("mapWorld", el)}>
            <MapLayers world={world} land={land} found={found} castle={castle} goal={goal} glyphScale={glyphScaleFor(MAP_WINDOW)}>
              {extras}
            </MapLayers>
          </g>
          {/* Fixed to the middle of the map, because the child is always the middle of it. */}
          <g ref={(el) => bus.setNode("mapCone", el)} transform={`translate(${MAP / 2} ${MAP / 2})`}>
            <path className="r3-map-cone" d={CONE_GLYPH} />
          </g>
          <g ref={(el) => bus.setNode("mapYou", el)} transform={`translate(${MAP / 2} ${MAP / 2})`}>
            <path className="r3-map-you" d={YOU_GLYPH} />
          </g>
          {/* Never mounted without a castle: the driver writes a null node as nothing at all. */}
          {castle && (
            <g ref={(el) => bus.setNode("mapHome", el)} className="r3-map-rim" style={{ display: "none" }}>
              <path d={RIM_GLYPH} />
            </g>
          )}
          {/* The goal past the edge of the window: a gold arrow on the rim, written by the driver. */}
          <g ref={(el) => bus.setNode("mapGoal", el)} className="r3-map-rim r3-map-rim--goal" style={{ display: "none" }}>
            <path d={RIM_GLYPH} />
          </g>
        </g>
        <circle className="r3-map-rim-ring" cx={MAP / 2} cy={MAP / 2} r={MAP / 2 - 1} />
        {/*
          All four, on the rim. The map is north-up and never turns — the view cone turns
          instead — so the letters are fixed, and a child who can see N but not W, E or S has
          been told a quarter of a compass. North is gold and bigger, the one a child finds
          first; the other three are there to be read against it.
        */}
        {COMPASS.map((c) => (
          <g key={c.letter} transform={`translate(${c.x} ${c.y})`}>
            <circle className={`r3-map-compass-dot${c.letter === "N" ? " r3-map-compass-dot--north" : ""}`} r={c.letter === "N" ? 5.6 : 4.8} />
            <text className={`r3-map-north${c.letter === "N" ? "" : " r3-map-compass"}`} y={c.letter === "N" ? 2.6 : 2.2} textAnchor="middle">
              {c.letter}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------- the spell bar */

/**
 * The bar, and the keys it binds. Four pages for a new hero, five from level 10 —
 * `withEmptyPages` has already padded the book to the child's real slot count, so the number
 * of keycaps drawn is the number of keys the scene listens for, and neither can drift from the
 * other. Each keycap is the key the child has bound to that page (`keymap`), 1 to 9 until they
 * move one.
 *
 * An empty page is drawn, not hidden. A bar with one tile on it says "this game has one
 * spell"; a bar with one tile and three waiting pages says "there are more, go and earn them",
 * which is true and is the whole point of a spellbook a child fills in.
 */
function SpellBar({
  bus,
  pages,
  shake,
  onCast,
  onEmptyPage,
  extra,
  keymap,
}: {
  bus: HudBus;
  pages: SpellPageView[];
  keymap: Keymap;
  shake: number;
  onCast: (slot: number) => void;
  onEmptyPage: (slot: number) => void;
  /** More slots after the pages — the mount's Ride slot (`riding-hud.tsx`). */
  extra?: ReactNode;
}) {
  return (
    <div className="r3-bar" role="toolbar" aria-label="Spells" style={{ ["--r3-slots" as string]: String(pages.length) }}>
      {pages.map((page, i) => {
        const key = i + 1;
        // The page's own key, as the child has bound it ("1", or "Q" if they moved it).
        const cap = primaryLabel(keymap, castAction(key) ?? "cast1");
        if (!page.spell) {
          /*
            A button, not a picture of one. "The other spells having a plus icon on them but
            not being clickable feels wrong" — so the plus now does what a plus says: it opens a
            card that says how a spell is earned and takes the child to where one is written.
            A faded page (a part gone from the catalog) is the same case to a child — nothing
            to cast here yet — and goes to the same place.
          */
          return (
            <button
              type="button"
              key={page.slot}
              className="r3-slot r3-slot--empty"
              aria-label={`Page ${key} is empty. How do I get a spell?`}
              onMouseDown={keepFocusInWorld}
              onClick={() => onEmptyPage(page.slot)}
            >
              <span className="r3-slot-key">{cap}</span>
              <span className="r3-slot-seal">+</span>
              <span className="r3-slot-name">{page.empty ? "Get a spell" : "Faded"}</span>
            </button>
          );
        }
        return (
          <button
            type="button"
            key={page.slot}
            ref={(el) => bus.setSlot(i, "root", el)}
            className={`r3-slot${shake === key ? " r3-slot--refused" : ""}`}
            style={{ ["--r3-ink" as string]: page.color }}
            aria-label={`${page.name}, ${page.spell.manaCost} mana, key ${cap}`}
            // A click casts, exactly as the number key does: the same queue, the same frame,
            // the same refusal if the page is resting or the mana is short.
            onMouseDown={keepFocusInWorld}
            onClick={() => onCast(key)}
          >
            <span className="r3-slot-key">{cap}</span>
            {page.icon && <GameIcon name={page.icon} className="r3-slot-icon" />}
            <span className="r3-slot-name">{page.name}</span>
            <span className="r3-slot-cost">{page.spell.manaCost}</span>
            {/* The wipe. `scaleY` from the top, written straight onto the node every frame. */}
            <span
              className="r3-slot-cool"
              ref={(el) => bus.setSlot(i, "cool", el)}
            />
          </button>
        );
      })}
      {extra}
    </div>
  );
}

/* -------------------------------------------------------------- the nameplates */

const MARK_TEXT: Record<PlateAnchor["mark"], string> = {
  quest: "!",
  done: "✓",
  work: "·",
  place: "◆",
  home: "★",
  you: "★",
};

function Nameplates({ bus, anchors, numerals }: { bus: HudBus; anchors: readonly PlateAnchor[]; numerals: boolean }) {
  return (
    <div className="r3-plates" aria-hidden="true">
      {anchors.map((a, i) => (
        <div
          key={a.id}
          ref={(el) => bus.setPlate(i, el)}
          className={`r3-plate r3-plate--${a.tier}`}
          style={{ ["--r3-ink" as string]: a.accent, display: "none" }}
        >
          <span className={`r3-plate-mark r3-plate-mark--${a.mark}`}>{MARK_TEXT[a.mark]}</span>
          <span className="r3-plate-text">
            <span className="r3-plate-name">{a.name}</span>
            {a.sub && <span className="r3-plate-sub">{a.sub}</span>}
            {/* A villager's site, as pips: the one place in the world a finished side quest shows. */}
            {a.progress && (
              <span className="r3-plate-pips" aria-hidden="true">
                {Array.from({ length: a.progress.total }, (_, k) => (
                  <span key={k} className={k < a.progress!.done ? "r3-plate-pip r3-plate-pip--on" : "r3-plate-pip"} />
                ))}
              </span>
            )}
            {a.stars && <PlateStars have={a.stars.have} max={a.stars.max} numerals={numerals} />}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ the gold ! */

/**
 * The marker that answers "where do I go?". Positioned every frame by the driver — over the
 * waiting villager's head when they are in view, pinned to the screen's edge with its arrow
 * turned toward them when they are not — and gone once the child is close enough for the
 * villager's own plate and the E prompt to take over. It says who, and how far.
 */
function GoalMarker({ bus, goal }: { bus: HudBus; goal: Goal }) {
  if (!goal.on) return null;
  return (
    <div className="r3-goal-layer" aria-hidden="true">
      <div ref={(el) => bus.setNode("goalMark", el)} className="r3-goal" data-state="off">
        <span ref={(el) => bus.setNode("goalArrow", el)} className="r3-goal-arrow">
          <svg viewBox="-10 -10 20 20">
            <path d="M0,-9 L6,-1 L2,-1 L2,4 L-2,4 L-2,-1 L-6,-1 Z" />
          </svg>
        </span>
        <span className="r3-goal-bang">!</span>
        <span className="r3-goal-text">
          <span className="r3-goal-name">{goal.name}</span>
          <span ref={(el) => bus.setNode("goalDist", el)} className="r3-goal-dist" />
        </span>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------- the HUD */

const noop = () => {};

export function RealmHud({
  bus,
  world,
  anchors,
  pages,
  heroName,
  portrait = null,
  viewer = "child",
  castle = true,
  onCast = noop,
  onEmptyPage = noop,
  goal = NO_GOAL,
  inside = null,
  mapExtras,
  barExtra,
  mountKey = false,
  petKey = false,
  found: foundKept,
  onFound,
  numerals = false,
  keymap = defaultKeymap(),
}: {
  bus: HudBus;
  world: RealmWorld;
  anchors: readonly PlateAnchor[];
  pages: SpellPageView[];
  heroName: string;
  /** The child's own look, drawn as the pixel portrait the Tavern's hero card draws. */
  portrait?: AvatarConfig | null;
  /**
   * A parent visiting walks as the Quest Giver, so the plaque is theirs — the wizard, not the
   * child's face — and says whose Realm this is.
   */
  viewer?: "child" | "parent";
  castle?: boolean;
  /** A filled page was clicked: cast it, as its number key would. */
  onCast?: (slot: number) => void;
  /** An empty page was clicked: say how to earn one. */
  onEmptyPage?: (slot: number) => void;
  /** Who the objective card sends the child to, and where they stand. */
  goal?: Goal;
  /** Indoors, where: "Inside the Chapel". Takes the plaque's second line while it lasts. */
  inside?: string | null;
  /** Extra marks for the map's panning world group, in world units (the troubles' dots). */
  mapExtras?: ReactNode;
  /** Extra slots at the end of the spell bar: the Ride slot. */
  barExtra?: ReactNode;
  /** Whether the mount key rides: the key strip names it. */
  mountKey?: boolean;
  /** The strip shows F (follow your pet) for a child with a companion. */
  petKey?: boolean;
  /**
   * The places found, kept by the frame (`use-places-found.ts`): the saved record, so the count
   * and the map's filled marks survive a reload and match fast travel. Absent, the HUD keeps its
   * own for the visit, as it always did.
   */
  found?: ReadonlySet<string>;
  /** A place was found; with `found`, this is how it reaches the record. */
  onFound?: (id: string) => void;
  /** Full depth: the plates' stars say "7 of 9"; simple depth draws the marks alone. */
  numerals?: boolean;
  /** The keys the child has bound: the spell keycaps and the key strip name them. */
  keymap?: Keymap;
}) {
  const [foundHere, setFound] = useState<ReadonlySet<string>>(() => new Set<string>());
  const found = foundKept ?? foundHere;
  const onFoundRef = useRef(onFound);
  useEffect(() => {
    onFoundRef.current = onFound;
  }, [onFound]);
  const [place, setPlace] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const shakeTimer = useRef(0);

  const names = useMemo(() => new Map(world.landmarks.map((l) => [l.id, l.name])), [world]);

  // The three discrete events. Installed once; the driver calls them a handful of times a
  // session, and each one is the only thing in this file that re-renders anything.
  useEffect(() => {
    const timer = shakeTimer;
    bus.setHandlers({
      onFound: (id) => {
        if (onFoundRef.current) onFoundRef.current(id);
        else setFound((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
      },
      onPlace: (id) => setPlace(id),
      onRefuse: (slot) => {
        setShake(slot);
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setShake(0), REFUSAL_MS);
      },
    });
    return () => {
      window.clearTimeout(timer.current);
      bus.setHandlers({ onFound: () => {}, onPlace: () => {}, onRefuse: () => {} });
    };
  }, [bus]);

  const here = place ? names.get(place) ?? null : null;
  const total = world.landmarks.length;

  return (
    <>
      <Nameplates bus={bus} anchors={anchors} numerals={numerals} />
      <GoalMarker bus={bus} goal={goal} />
      <div className="r3-hud">
        {/*
          The child's name, top left, on the biggest plaque on the screen and under a crown.
          "Shown as theirs" is the requirement, and a name in a status line is not that: this is
          the same shape as the title on a trophy, which is what it is for.
        */}
        <div className={`r3-who${viewer === "parent" ? " r3-who--visitor" : ""}`}>
          {/*
            The child's own face, not a crown: "the player bar in the top left should show the
            player icon rather than a crown". The same pixel avatar the Tavern's hero card
            draws, cropped to head and shoulders, so the child sees the hero they dressed.
          */}
          <span className="r3-who-portrait" aria-hidden="true">
            {viewer === "parent" ? (
              <GameIcon name="mage" className="r3-who-wizard" />
            ) : (
              <Avatar config={portrait} name={heroName} size="lg" className="r3-who-avatar" />
            )}
          </span>
          <span className="r3-who-text">
            <span className="r3-who-name">{viewer === "parent" ? "Quest Giver" : heroName}</span>
            <span className="r3-who-where" aria-live="polite">
              {inside ?? (viewer === "parent" ? `Visiting ${heroName}'s Realm` : here ?? `${found.size} of ${total} places found`)}
            </span>
          </span>
        </div>
        <Minimap bus={bus} world={world} found={found} castle={castle} goal={goal} extras={mapExtras} />
        <div className="r3-bottom">
          <div className="r3-mana" aria-label="Mana">
            {/*
              Sparkles, so "the blue bar" is magic a child has a word for. It was a cut gem, and
              "not sure why mana has a diamond icon by it, that makes no sense" — a gem reads as
              treasure, and this bar is the power the spells below it spend.
            */}
            <GameIcon name="mana" className="r3-mana-gem" />
            <span className="r3-mana-track">
              <span className="r3-mana-fill" ref={(el) => bus.setNode("manaFill", el)} />
            </span>
            <span className="r3-mana-text" ref={(el) => bus.setNode("manaText", el)}>
              {MANA_MAX} / {MANA_MAX}
            </span>
          </div>
          <SpellBar bus={bus} pages={pages} shake={shake} onCast={onCast} onEmptyPage={onEmptyPage} extra={barExtra} keymap={keymap} />
          <p className="r3-keys">
            {keyHints(keymap, pages.length, { mount: mountKey, pet: petKey }).map((h, i) => (
              <span key={h.what}>
                {i > 0 && " · "}
                <b>{h.key}</b> {h.what}
              </span>
            ))}
          </p>
        </div>
      </div>
    </>
  );
}
