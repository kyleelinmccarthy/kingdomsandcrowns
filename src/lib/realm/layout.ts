import { findBuilding } from "@/lib/utils/kingdom";

/** Units are abstract; the camera zoom maps them to pixels. The ground is WORLD_SIZE² centered on the origin. */
export const WORLD_SIZE = 40;

export type Vec2 = { x: number; z: number };
export type PropKind = "castle" | "building" | "path";

export type Prop = {
  id: string;
  kind: PropKind;
  label: string;
  position: Vec2; // center
  size: { w: number; d: number; h: number }; // footprint width (x), depth (z), height (y)
  color: string;
  solid: boolean; // walkable props (paths) are not colliders
};

export type WorldLayout = { props: Prop[]; spawn: Vec2; colliders: Prop[] };

export const CASTLE_POSITION: Vec2 = { x: 0, z: -14 };
export const SPAWN: Vec2 = { x: 0, z: 15 };
const GATE_Z = 17;

/** Eight castle tiers, tent-sized to towering. Order matches CASTLE_TYPES in the avatar catalog. */
export const CASTLE_FOOTPRINTS: Record<string, { w: number; d: number; h: number }> = {
  campsite: { w: 2, d: 2, h: 1.5 },
  cottage: { w: 3, d: 3, h: 2.5 },
  watchtower: { w: 2.5, d: 2.5, h: 5 },
  keep: { w: 5, d: 4, h: 4 },
  manor: { w: 6, d: 5, h: 4.5 },
  castle: { w: 8, d: 6, h: 6 },
  fortress: { w: 9, d: 7, h: 7 },
  citadel: { w: 10, d: 8, h: 8 },
};

/** Where each kingdom building stands once its deeds are done. Alternating sides of the path. */
export const BUILDING_SLOTS: Record<string, Vec2> = {
  well: { x: -5, z: 8 },
  mill: { x: 6, z: 6 },
  bridge: { x: -7, z: 0 },
  chapel: { x: 7, z: -2 },
  market: { x: -5, z: -6 },
  library: { x: 6, z: -8 },
  watchtower: { x: -9, z: -12 },
  garden: { x: 9, z: -13 },
};

export const BUILDING_COLORS: Record<string, string> = {
  well: "#5b8fb9",
  mill: "#b08a5a",
  bridge: "#8c7a6b",
  chapel: "#d8cfc0",
  market: "#c0563d",
  library: "#6f5a8a",
  watchtower: "#7d7d7d",
  garden: "#5aa55a",
};

const BUILDING_SIZE = { w: 3, d: 3, h: 2.5 };
const WATCHTOWER_SIZE = { w: 2, d: 2, h: 5 };
const CASTLE_COLOR = "#9a9aa8";
const PATH_COLOR = "#c9b27a";

export function buildWorldLayout(input: { castleType: string; builtBuildingIds: string[] }): WorldLayout {
  const castleSize = CASTLE_FOOTPRINTS[input.castleType] ?? CASTLE_FOOTPRINTS.campsite;
  const props: Prop[] = [
    { id: "castle", kind: "castle", label: "Castle", position: CASTLE_POSITION, size: castleSize, color: CASTLE_COLOR, solid: true },
  ];

  // A row of flat tiles from the south gate to the castle's south face.
  const castleSouth = CASTLE_POSITION.z + castleSize.d / 2 + 1;
  for (let z = GATE_Z; z >= castleSouth; z -= 2) {
    props.push({ id: `path-${z}`, kind: "path", label: "Path", position: { x: 0, z }, size: { w: 2, d: 2, h: 0.05 }, color: PATH_COLOR, solid: false });
  }

  const seen = new Set<string>();
  for (const id of input.builtBuildingIds) {
    const slot = BUILDING_SLOTS[id];
    const building = findBuilding(id);
    if (!slot || !building || seen.has(id)) continue;
    seen.add(id);
    props.push({
      id,
      kind: "building",
      label: building.label,
      position: slot,
      size: id === "watchtower" ? WATCHTOWER_SIZE : BUILDING_SIZE,
      color: BUILDING_COLORS[id] ?? "#888888",
      solid: true,
    });
  }

  return { props, spawn: SPAWN, colliders: props.filter((p) => p.solid) };
}
