"use client";

/**
 * The troubles' side of the HUD: a marker over each one, a dot for each on the map, and the
 * words when one is cleared or a blob bumps the child. Everything that MOVES is written by the
 * scene straight onto these nodes through the `TroubleBus`; the only React state here is the
 * notice, which changes a few times a minute.
 *
 * No `three`: this file mounts in the frame (`realm-game.tsx`) and is tested under Vitest.
 */

import { useEffect, useRef, useState } from "react";
import type { TroubleSkin } from "@/lib/realm/spells/troubles";
import type { SpellPageView } from "@/lib/realm/spells/pages";
import { TROUBLE_POOL, troubleNotice, type TroubleEventKind } from "@/lib/realm3d/troubles3d";
import type { TroubleBus } from "@/lib/realm3d/trouble-bus";
import { MAP_WINDOW } from "@/lib/realm3d/minimap";
import "./troubles.css";

/** How long a notice holds the lane. Long enough to read twice at eight. */
export const NOTICE_MS = 2800;

/**
 * The marker over each trouble: a glyph for its kind, its name in the grown-up's chosen tone,
 * and a pip for every hit it has left — so a child sees a cursed stone needs two, and watches
 * one go out when a bolt lands.
 */
export function TroublePlates({ tbus }: { tbus: TroubleBus }) {
  return (
    <div className="r3t-plates" aria-hidden="true">
      {Array.from({ length: TROUBLE_POOL }, (_, i) => (
        <div key={i} ref={(el) => tbus.setPlate(i, "plate", el)} className="r3t-plate" data-kind="fog" data-skin="gentle" style={{ display: "none" }}>
          <span className="r3t-plate-glyph" />
          <span className="r3t-plate-text">
            <span className="r3t-plate-name" ref={(el) => tbus.setPlate(i, "name", el)} />
            <span className="r3t-pips" ref={(el) => tbus.setPlate(i, "pips", el)} data-left="1" data-max="1">
              <span className="r3t-pip" />
              <span className="r3t-pip" />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The dots on the minimap, drawn in WORLD units inside the map's panning group so they pan with
 * the land for free; the scene writes each one's `translate(x z)`. Violet with a white edge:
 * nothing else on the map is that colour, so a child reads "trouble" without a legend.
 */
export function TroubleMapMarks({ tbus }: { tbus: TroubleBus }) {
  // The map's viewBox is 100 across and shows MAP_WINDOW world units: counter-scale to a fixed glyph.
  const glyphScale = MAP_WINDOW / 100;
  return (
    <g className="r3t-map">
      {Array.from({ length: TROUBLE_POOL }, (_, i) => (
        <g key={i} ref={(el) => tbus.setMark(i, el)} style={{ display: "none" }}>
          <g transform={`scale(${glyphScale})`}>
            <path className="r3t-map-mark" d="M0,-3.2 L3.2,0 L0,3.2 L-3.2,0 Z" />
          </g>
        </g>
      ))}
    </g>
  );
}

type Notice = { id: number; kind: TroubleEventKind; title: string; line: string };

/**
 * The words, in the top-centre lane under the lesson and the village's news: the flat Realm's
 * own clearing line ("The fog thins." / "The mist-wisp scatters!"), where it was cleared and how
 * many so far; a bump, never frightening; and once a visit, the first time a trouble is near,
 * what it is and which key casts at it.
 */
export function TroubleNotices({
  tbus,
  skin,
  pages,
  paused,
}: {
  tbus: TroubleBus;
  skin: TroubleSkin;
  pages: readonly SpellPageView[];
  paused: boolean;
}) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const seq = useRef(0);
  const castKey = pages.find((p) => p.spell)?.slot ?? null;

  useEffect(() => {
    tbus.setSkin(skin);
  }, [tbus, skin]);

  // Development only: the bus, so a screenshot can show the other tone without saving a setting.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const w = window as unknown as { __realmTroubleBus?: TroubleBus };
    w.__realmTroubleBus = tbus;
    return () => {
      if (w.__realmTroubleBus === tbus) delete w.__realmTroubleBus;
    };
  }, [tbus]);

  useEffect(() => {
    tbus.setHandler((e, placeName) => {
      const words = troubleNotice(e, tbus.skin, placeName, castKey);
      if (!words) return;
      seq.current += 1;
      setNotice({ id: seq.current, kind: e.kind, title: words.title, line: words.line });
    });
    return () => tbus.setHandler(() => {});
  }, [tbus, castKey]);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [notice]);

  if (!notice || paused) return null;
  return (
    <div key={notice.id} className={`r3t-notice r3t-notice--${notice.kind}`} role="status" aria-live="polite">
      <span className="r3t-notice-icon" aria-hidden="true" />
      <span className="r3t-notice-text">
        <span className="r3t-notice-title">{notice.title}</span>
        <span className="r3t-notice-line">{notice.line}</span>
      </span>
    </div>
  );
}
