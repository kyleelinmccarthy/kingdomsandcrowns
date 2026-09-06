import { BUILDINGS } from "@/lib/utils/kingdom";
import { VILLAGERS, villagerPosition } from "./villagers";

/** Units are abstract; the camera zoom maps them to pixels. The ground is WORLD_SIZE² centered on the origin. */
export const WORLD_SIZE = 40;

export type Vec2 = { x: number; z: number };
export type PropKind = "castle" | "building" | "foundation" | "path" | "villager";

export type Prop = {
  id: string;
  kind: PropKind;
  label: string;
  tag?: string; // a second line under the label: "Built" or "2 of 5"
  position: Vec2; // center
  size: { w: number; d: number; h: number }; // footprint width (x), depth (z), height (y)
  color: string;
  solid: boolean; // walkable props (paths, foundations, villagers) are not colliders
};

/** Progress for one kingdom building, as the deeds overview reports it. */
export type SiteProgress = { id: string; done: number; total: number; complete: boolean };
export type VillagerPlacement = { id: string; buildingId: string; position: Vec2 };

export type WorldLayout = { props: Prop[]; spawn: Vec2; colliders: Prop[]; villagers: VillagerPlacement[] };

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
export const FOUNDATION_COLOR = "#6b665a";
const FOUNDATION_H = 0.2;
const VILLAGER_SIZE = { w: 0.9, d: 0.9, h: 1.8 };

export function buildingFootprint(id: string): { w: number; d: number; h: number } {
  return id === "watchtower" ? WATCHTOWER_SIZE : BUILDING_SIZE;
}

export function buildWorldLayout(input: { castleType: string; buildings: SiteProgress[]; villagers?: boolean }): WorldLayout {
  const showVillagers = input.villagers ?? true;
  const castleSize = CASTLE_FOOTPRINTS[input.castleType] ?? CASTLE_FOOTPRINTS.campsite;
  const props: Prop[] = [
    { id: "castle", kind: "castle", label: "Castle", position: CASTLE_POSITION, size: castleSize, color: CASTLE_COLOR, solid: true },
  ];

  // A row of flat tiles from the south gate to the castle's south face.
  const castleSouth = CASTLE_POSITION.z + castleSize.d / 2 + 1;
  for (let z = GATE_Z; z >= castleSouth; z -= 2) {
    props.push({ id: `path-${z}`, kind: "path", label: "Path", position: { x: 0, z }, size: { w: 2, d: 2, h: 0.05 }, color: PATH_COLOR, solid: false });
  }

  // Every building has a site: the building once complete, a foundation until then. Missing progress means none yet.
  const progress = new Map(input.buildings.map((b) => [b.id, b]));
  const villagers: VillagerPlacement[] = [];
  for (const building of BUILDINGS) {
    const slot = BUILDING_SLOTS[building.id];
    if (!slot) continue;
    const footprint = buildingFootprint(building.id);
    const p = progress.get(building.id) ?? { id: building.id, done: 0, total: building.deedsToBuild, complete: false };
    if (p.complete) {
      props.push({ id: building.id, kind: "building", label: building.label, tag: showVillagers ? "Built" : undefined, position: slot, size: footprint, color: BUILDING_COLORS[building.id] ?? "#888888", solid: true });
    } else {
      props.push({ id: building.id, kind: "foundation", label: building.label, tag: showVillagers ? `${p.done} of ${p.total}` : undefined, position: slot, size: { ...footprint, h: FOUNDATION_H }, color: FOUNDATION_COLOR, solid: false });
    }
    if (showVillagers) {
      const villager = VILLAGERS.find((v) => v.buildingId === building.id);
      if (villager) {
        const position = villagerPosition(slot, footprint);
        villagers.push({ id: villager.id, buildingId: building.id, position });
        props.push({ id: `villager-${villager.id}`, kind: "villager", label: villager.name, position, size: VILLAGER_SIZE, color: "#000000", solid: false });
      }
    }
  }

  return { props, spawn: SPAWN, colliders: props.filter((p) => p.solid), villagers };
}
