"use client";

/**
 * THE BIG MAP: the whole island at once, opened with the map key (M by default) from play and
 * closed with it again or Esc. It is a panel like any other, so the world is paused while it is
 * open, which makes it a still picture: everything on it is read once, as it opens — the hero's
 * spot and facing, and the marks the features registered on the HUD bus (`addMapMarks`).
 *
 * It draws the same layers as the corner minimap (`map-layers.tsx`) over a fixed viewBox that
 * covers the island, with glyphs scaled for that window so they stay legible at the larger size.
 */

import { useLayoutEffect, useMemo } from "react";
import { GameIcon } from "@/components/game-icon";
import type { Goal } from "@/lib/realm3d/guide";
import type { MapMark } from "@/lib/realm3d/hud-bus";
import { glyphScaleFor, headingDegrees } from "@/lib/realm3d/minimap";
import { WORLD_HALF, type RealmWorld } from "@/lib/realm3d/worldgen";
import { Panel } from "./frame-hud";
import { MapLayers, useBakedLand, YOU_GLYPH } from "./map-layers";
import "./world-map.css";

export const WORLD_MAP_TITLE = "Map of the island";

/** The whole island, edge to edge. */
const WINDOW = 2 * WORLD_HALF;
const GLYPH = glyphScaleFor(WINDOW);

/** A tenth of a world unit is finer than a pixel here; rounding keeps the attributes short. */
const r1 = (n: number) => Math.round(n * 10) / 10;

/** One registered mark, by kind: the same shapes the minimap draws for them. */
function Mark({ mark }: { mark: MapMark }) {
  return (
    <g data-mark={mark.id} transform={`translate(${r1(mark.x)} ${r1(mark.z)}) scale(${GLYPH})`}>
      {mark.kind === "trouble" ? <path className="r3t-map-mark" d="M0,-3.2 L3.2,0 L0,3.2 L-3.2,0 Z" /> : <circle r="2.6" className="r3-recess-map-arch" />}
    </g>
  );
}

export function WorldMap({
  world,
  found,
  castle,
  goal,
  marks,
  hero,
  onClose,
}: {
  world: RealmWorld;
  found: ReadonlySet<string>;
  castle: boolean;
  goal: Goal;
  /** Every feature's marks, read as the map opened (`bus.mapMarks()`). */
  marks: readonly MapMark[];
  /** Where the hero stands on the island and faces (`atan2(dx, dz)`); indoors, the door they went in by. */
  hero: { x: number; z: number; facing: number };
  onClose: () => void;
}) {
  const land = useBakedLand(world);
  const foundNames = useMemo(() => world.landmarks.filter((l) => found.has(l.id)).map((l) => ({ id: l.id, name: l.name })), [world, found]);

  // Focus goes back where it was when the map closes. A layout effect, so it reads the focus
  // before the panel's own effect moves it onto the board.
  useLayoutEffect(() => {
    const was = document.activeElement;
    return () => {
      if (was instanceof HTMLElement && was.isConnected) was.focus();
    };
  }, []);

  return (
    <Panel
      title={WORLD_MAP_TITLE}
      label={WORLD_MAP_TITLE}
      icon={<GameIcon name="compass" className="r3-board-icon" />}
      onClose={onClose}
      className="r3-worldmap"
    >
      <p className="r3-board-sub">The gold arrow is you. Places you have found are filled in.</p>
      <div className="r3-worldmap-frame" aria-hidden="true">
        <svg viewBox={`${-WORLD_HALF} ${-WORLD_HALF} ${WINDOW} ${WINDOW}`}>
          <rect className="r3-map-void" x={-WORLD_HALF} y={-WORLD_HALF} width={WINDOW} height={WINDOW} />
          <MapLayers world={world} land={land} found={found} castle={castle} goal={goal} glyphScale={GLYPH}>
            {marks.map((m) => (
              <Mark key={m.id} mark={m} />
            ))}
          </MapLayers>
          <g className="r3-worldmap-you" transform={`translate(${r1(hero.x)} ${r1(hero.z)}) rotate(${headingDegrees(hero.facing)}) scale(${GLYPH})`}>
            <path className="r3-map-you" d={YOU_GLYPH} />
          </g>
        </svg>
      </div>
      {/* The picture is hidden from a screen reader; what it says is here instead. */}
      <ul className="sr-only" aria-label="Places found">
        {foundNames.map((p) => (
          <li key={p.id}>{p.name}</li>
        ))}
      </ul>
      <button type="button" className="r3-menu-item r3-worldmap-close" onClick={onClose}>
        Close the map
      </button>
    </Panel>
  );
}
