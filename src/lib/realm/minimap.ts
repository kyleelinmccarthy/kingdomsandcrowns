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

/**
 * Air around the outermost prop so nothing is drawn against the frame. Applied unconditionally,
 * this is also what keeps the bounds non-degenerate: even a single prop gets a span of `2 * PAD`
 * in each axis, so `projectToMap`'s division is never by zero.
 */
const PAD = 2;

/** A site on the map is a kingdom building, raised or not. Nothing else is mapped. */
const isSite = (p: Prop) => p.kind === "building" || p.kind === "foundation";

export function worldBounds(layout: WorldLayout): MinimapBounds {
  const xs = [layout.spawn.x, ...layout.props.map((p) => p.position.x)];
  const zs = [layout.spawn.z, ...layout.props.map((p) => p.position.z)];
  const [minX, maxX] = [Math.min(...xs) - PAD, Math.max(...xs) + PAD];
  const [minZ, maxZ] = [Math.min(...zs) - PAD, Math.max(...zs) + PAD];
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
