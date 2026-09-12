import type { Prop, Vec2, WorldLayout } from "./layout";
import type { Facing } from "./movement";
import type { Surfaces } from "./depth";
import { facingAngle } from "./markers";

export type MinimapBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type MinimapDot = { id: string; kind: "site" | "trouble" | "objective"; x: number; y: number; filled: boolean };
export type MinimapView = { bounds: MinimapBounds; hero: { x: number; y: number; angle: number }; dots: MinimapDot[] };

export type MinimapInput = {
  layout: WorldLayout;
  hero: Vec2;
  facing: Facing;
  troubles: { id: string; position: Vec2 }[];
  surfaces: Surfaces;
};

/** A little air around the outermost prop so nothing is drawn against the frame. */
const PAD = 2;
/** A world with one prop would otherwise divide by zero when projected. */
const MIN_SPAN = 1;

/** A site on the map is a kingdom building, raised or not. Nothing else is mapped. */
const isSite = (p: Prop) => p.kind === "building" || p.kind === "foundation";

export function worldBounds(layout: WorldLayout): MinimapBounds {
  const xs = [layout.spawn.x, ...layout.props.map((p) => p.position.x)];
  const zs = [layout.spawn.z, ...layout.props.map((p) => p.position.z)];
  let [minX, maxX] = [Math.min(...xs) - PAD, Math.max(...xs) + PAD];
  let [minZ, maxZ] = [Math.min(...zs) - PAD, Math.max(...zs) + PAD];
  if (maxX - minX < MIN_SPAN) { minX -= MIN_SPAN / 2; maxX += MIN_SPAN / 2; }
  if (maxZ - minZ < MIN_SPAN) { minZ -= MIN_SPAN / 2; maxZ += MIN_SPAN / 2; }
  return { minX, maxX, minZ, maxZ };
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export function projectToMap(p: Vec2, bounds: MinimapBounds): { x: number; y: number } {
  return {
    x: clamp01((p.x - bounds.minX) / (bounds.maxX - bounds.minX)),
    y: clamp01((p.z - bounds.minZ) / (bounds.maxZ - bounds.minZ)),
  };
}

export function minimapView({ layout, hero, facing, troubles, surfaces }: MinimapInput): MinimapView {
  const bounds = worldBounds(layout);
  const dots: MinimapDot[] = [];

  for (const p of layout.props) {
    if (!isSite(p)) continue;
    const objective = p.focus === "objective";
    // Under objectiveOnly the map keeps the one place the child is meant to go and drops the rest.
    if (!objective && surfaces.minimap !== "full") continue;
    const { x, y } = projectToMap(p.position, bounds);
    dots.push({ id: p.id, kind: objective ? "objective" : "site", x, y, filled: p.kind === "building" });
  }

  if (surfaces.minimap === "full") {
    for (const t of troubles) {
      const { x, y } = projectToMap(t.position, bounds);
      dots.push({ id: t.id, kind: "trouble", x, y, filled: true });
    }
  }

  return { bounds, hero: { ...projectToMap(hero, bounds), angle: facingAngle(facing) }, dots };
}
