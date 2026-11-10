"use client";

/**
 * THE RIDDLE STONES, drawn: a low-poly standing stone at each named place (`lib/realm/riddle-stones.ts`)
 * with a carved face of runes on the side turned to its place. The runes glow when something the
 * hero has learned is due for review (`due`), so a child walking past can see a stone has riddles
 * waiting.
 *
 * Two shared geometries and three shared materials for all five, made once. The glow is which of
 * two rune materials the face wears, lit or dark, swapped when `due` changes — never per frame,
 * and nothing moves.
 */

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { RealmWorld } from "@/lib/realm3d/worldgen";
import { placeById } from "@/lib/realm/layout";
import { RIDDLE_STONE_HEIGHT, RIDDLE_STONE_RADIUS, RIDDLE_STONE_SPOTS } from "@/lib/realm/riddle-stones";

const STONE = "#9d9a90";
const RUNES = "#5d6a78";
const GLOW = "#9fd8ff";
/** The runes' glow, lit and dark: dark still reads as carving, lit reads from across the place. */
const LIT = 1.6;
const DARK = 0;
/** Sunk a little, so a stone on a slope never shows daylight under its downhill side. */
const SINK = 0.25;

export function RiddleStones({ world, due }: { world: RealmWorld; due: boolean }) {
  const stones = useMemo(
    () =>
      RIDDLE_STONE_SPOTS.map((s) => {
        const place = placeById(s.placeId);
        // The carved face is turned to the place's centre, the way a child walks in.
        const yaw = place ? Math.atan2(place.position.x - s.x, place.position.z - s.z) : 0;
        return { id: s.placeId, x: s.x, y: world.heightAt(s.x, s.z) - SINK, z: s.z, yaw };
      }),
    [world],
  );
  const kit = useMemo(() => {
    const h = RIDDLE_STONE_HEIGHT + SINK;
    // Five sides and a narrower top: hewn, not turned. Flattened front to back, a slab rather than a post.
    const stone = new THREE.CylinderGeometry(RIDDLE_STONE_RADIUS * 0.72, RIDDLE_STONE_RADIUS, h, 5).scale(1.15, 1, 0.7).translate(0, h / 2, 0);
    const runes = new THREE.BoxGeometry(0.5, 0.95, 0.06).translate(0, SINK + RIDDLE_STONE_HEIGHT * 0.55, RIDDLE_STONE_RADIUS * 0.62);
    return {
      stone,
      runes,
      rock: new THREE.MeshStandardMaterial({ color: STONE, flatShading: true, roughness: 0.95 }),
      lit: new THREE.MeshStandardMaterial({ color: RUNES, emissive: GLOW, emissiveIntensity: LIT, flatShading: true, roughness: 0.6 }),
      dark: new THREE.MeshStandardMaterial({ color: RUNES, emissive: GLOW, emissiveIntensity: DARK, flatShading: true, roughness: 0.6 }),
    };
  }, []);
  useEffect(
    () => () => {
      kit.stone.dispose();
      kit.runes.dispose();
      kit.rock.dispose();
      kit.lit.dispose();
      kit.dark.dispose();
    },
    [kit],
  );
  const runes = due ? kit.lit : kit.dark;
  return (
    <>
      {stones.map((s) => (
        <group key={s.id} position={[s.x, s.y, s.z]} rotation={[0, s.yaw, 0]}>
          <mesh geometry={kit.stone} material={kit.rock} castShadow receiveShadow />
          <mesh geometry={kit.runes} material={runes} />
        </group>
      ))}
    </>
  );
}
