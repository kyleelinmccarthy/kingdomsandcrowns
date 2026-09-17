/**
 * Pixel figures for the world: castles by tier, the eight kingdom buildings,
 * the five stages a site climbs through as its deeds are done, the plot it
 * stands on, and decorations. Drawn on a 64×64 grid so roofs and towers have
 * room; rasterised by SpriteSource like the heroes. Each figure carries
 * data-figure and data-figure-id.
 *
 * House rules, so that eight buildings read as one village:
 * - Whole-pixel coordinates, no gradients and no blur. These are rasterised
 *   with smoothing off; a half-pixel edge turns to mud at any zoom.
 * - The light comes from the upper LEFT. A left face takes the lit tone, a
 *   right face the dark one, and an underside takes the deepest. That single
 *   rule is what gives a flat rectangle depth, and it is cheaper than detail.
 * - Everything stands on the same ground line (y 56) over the same strip of
 *   dark grass, so a row of figures shares one horizon.
 * - Roofs overhang their walls. An eave is the cheapest silhouette there is,
 *   and silhouette is all a child has from across the field.
 */

export const CASTLE_TIERS = ["campsite", "cottage", "watchtower", "keep", "manor", "castle", "fortress", "citadel"] as const;
export type CastleTier = (typeof CASTLE_TIERS)[number];
export const DECOR_KINDS = ["oak", "pine", "bush", "rock", "fence", "lantern"] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];
/**
 * The stages a site shows before it is built, one per deed still owed. A site
 * needs five deeds, so a child sees a different picture after EVERY deed: the
 * staked plot, the stone footing, the timber frame, the walls, the roof going
 * on — and then the building itself. `SITE_STAGES` is that count, not the deed
 * total; `SiteFigure` clamps anything outside it.
 */
export const SITE_STAGES = 5;
/** Rasterisation scale per figure family: the citadel is 512 px, a bush 256 px. */
export const WORLD_SPRITE_SCALE = { castle: 8, building: 6, site: 6, foundation: 4, decor: 4 } as const;

const STONE_LIT = "#b6b6c4";
const STONE = "#9a9aa8";
const STONE_DARK = "#6f6f7c";
const STONE_DEEP = "#4e4e59";
const ROOF_LIT = "#9a5450";
const ROOF = "#7b3f3f";
const ROOF_DARK = "#5a2d2d";
const ROOF_DEEP = "#3d1e1e";
const WOOD_LIT = "#8d5c33";
const WOOD = "#6b4226";
const WOOD_DARK = "#472a17";
const PLASTER_LIT = "#efe7d9";
const PLASTER = "#d8cfc0";
const PLASTER_DARK = "#b0a491";
const THATCH = "#c9a55a";
const THATCH_DARK = "#997a3c";
const FLAG = "#c0563d";
const GOLD = "#fde68a";
const GOLD_DEEP = "#e0a93c";
const GLASS = "#5fa8f5";
const GLASS_DARK = "#1e4fa8";
const WATER = "#2f63b4";
const WATER_DARK = "#1c3f7d";
const LEAF = "#2f7a3d";
const LEAF_LIGHT = "#4a9a55";
const PINE = "#1f5f30";
const DIRT = "#7b6a4e";
const DIRT_DARK = "#574a35";
const SHADE = "#3a3340"; // an opening with nothing behind it yet
const GRASS = "#24492e";
const SMOKE = "#cfd3d8";
const ROPE = "#d9c9a0";

function Frame({ figure, id, children, size = 96 }: { figure: string; id?: string; children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure={figure} data-figure-id={id}>
      {children}
    </svg>
  );
}

/** Square battlements along a wall top: alternating merlons, with the shadow they cast on the wall. */
function Merlons({ x, y, width, color = STONE, shade = STONE_DEEP }: { x: number; y: number; width: number; color?: string; shade?: string }) {
  const teeth: React.ReactNode[] = [];
  for (let i = 0; i * 6 + 3 <= width; i++) {
    teeth.push(<rect key={i} x={x + i * 6} y={y} width={3} height={3} fill={color} />);
    teeth.push(<rect key={`s${i}`} x={x + i * 6 + 2} y={y} width={1} height={3} fill={shade} />);
  }
  return <>{teeth}</>;
}

function Flag({ x, y, color = FLAG, height = 8 }: { x: number; y: number; color?: string; height?: number }) {
  return (
    <>
      <rect x={x} y={y} width={1} height={height} fill={WOOD_DARK} />
      <polygon points={`${x + 1},${y} ${x + 6},${y + 2} ${x + 1},${y + 4}`} fill={color} />
      <rect x={x + 1} y={y + 3} width={4} height={1} fill={ROOF_DARK} />
    </>
  );
}

/**
 * A stepped gable, drawn as courses rather than a polygon so every edge lands
 * on a pixel. Left slope lit, right slope shaded, the last course overhangs by
 * `eave`, and a dark line under it reads as the shadow the eave throws.
 */
function Roof({ cx, top, rows, dx = 3, dy = 2, eave = 3, lit = ROOF_LIT, mid = ROOF, dark = ROOF_DARK, deep = ROOF_DEEP }: {
  cx: number; top: number; rows: number; dx?: number; dy?: number; eave?: number; lit?: string; mid?: string; dark?: string; deep?: string;
}) {
  const out: React.ReactNode[] = [];
  let half = dx;
  for (let i = 0; i < rows; i++) {
    half = (i + 1) * dx + (i === rows - 1 ? eave : 0);
    const y = top + i * dy;
    out.push(<rect key={`l${i}`} x={cx - half} y={y} width={half} height={dy} fill={i === 0 ? lit : mid} />);
    out.push(<rect key={`r${i}`} x={cx} y={y} width={half} height={dy} fill={i === 0 ? mid : dark} />);
    if (i > 0 && i % 2 === 0) out.push(<rect key={`c${i}`} x={cx - half} y={y + dy - 1} width={half * 2} height={1} fill={deep} />);
  }
  out.push(<rect key="eave" x={cx - half} y={top + rows * dy} width={half * 2} height={1} fill={deep} />);
  return <>{out}</>;
}

/** A stone wall or tower shaft: lit left edge, shaded right face, and courses. */
function Stone({ x, y, w, h, lit = STONE_LIT, mid = STONE, dark = STONE_DARK, course = 5 }: {
  x: number; y: number; w: number; h: number; lit?: string; mid?: string; dark?: string; course?: number;
}) {
  const lines: React.ReactNode[] = [];
  for (let cy = y + course; cy < y + h; cy += course) lines.push(<rect key={cy} x={x} y={cy} width={w} height={1} fill={dark} />);
  return (
    <>
      <rect x={x} y={y} width={w} height={h} fill={mid} />
      <rect x={x} y={y} width={2} height={h} fill={lit} />
      <rect x={x + w - 3} y={y} width={3} height={h} fill={dark} />
      {lines}
    </>
  );
}

/**
 * A masonry span with a stepped arch cut through it, ringed with lighter
 * voussoirs. The steps are what keep the curve on whole pixels; a circle here
 * would rasterise to a grey smear.
 */
function ArchSpan({ x, y, w, openTop, lit, mid, dark, hole }: {
  x: number; y: number; w: number; openTop: number; lit: string; mid: string; dark: string; hole: string;
}) {
  const cx = x + Math.floor(w / 2);
  // Half-widths of the opening, top course down; the last repeats to the water line.
  const halves = [6, 9, 11, 12, 13, 14];
  const ring: React.ReactNode[] = [];
  const holes: React.ReactNode[] = [];
  for (let i = 0; i < 12; i++) {
    const half = halves[Math.min(i, halves.length - 1)];
    const ry = openTop + i * 2;
    ring.push(<rect key={`v${i}`} x={cx - half - 3} y={ry - 3} width={half * 2 + 6} height={3} fill={lit} />);
    holes.push(<rect key={`h${i}`} x={cx - half} y={ry} width={half * 2} height={2} fill={hole} />);
  }
  const rows = [...ring, ...holes];
  return (
    <>
      <rect x={x} y={y} width={w} height={60 - y} fill={mid} />
      <rect x={x} y={y} width={w} height={2} fill={lit} />
      <rect x={x} y={y + 10} width={w} height={1} fill={dark} />
      <rect x={x} y={y + 18} width={w} height={1} fill={dark} />
      {rows}
    </>
  );
}

/** A plank door with an arched head, planking and a ring. */
function Door({ x, y, w, h, wood = WOOD, dark = WOOD_DARK }: { x: number; y: number; w: number; h: number; wood?: string; dark?: string }) {
  return (
    <>
      <rect x={x - 1} y={y} width={w + 2} height={2} fill={dark} />
      <rect x={x} y={y + 1} width={w} height={h - 1} fill={wood} />
      <rect x={x + w - 2} y={y + 1} width={2} height={h - 1} fill={dark} />
      <rect x={x + Math.floor(w / 3)} y={y + 2} width={1} height={h - 3} fill={dark} />
      <rect x={x + 2} y={y + Math.floor(h / 2)} width={1} height={1} fill={GOLD} />
    </>
  );
}

/** A lit window with a frame and glazing bars. Warm by default, glass when asked. */
function Window({ x, y, w, h, fill = GOLD, bars = true }: { x: number; y: number; w: number; h: number; fill?: string; bars?: boolean }) {
  return (
    <>
      <rect x={x - 1} y={y - 1} width={w + 2} height={h + 2} fill={WOOD_DARK} />
      <rect x={x} y={y} width={w} height={h} fill={fill} />
      {bars && <rect x={x + Math.floor(w / 2)} y={y} width={1} height={h} fill={WOOD_DARK} />}
      {bars && <rect x={x} y={y + Math.floor(h / 2)} width={w} height={1} fill={WOOD_DARK} />}
    </>
  );
}

function Shutters({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return (
    <>
      <rect x={x - 4} y={y - 1} width={3} height={h + 2} fill={WOOD_LIT} />
      <rect x={x + w + 1} y={y - 1} width={3} height={h + 2} fill={WOOD} />
    </>
  );
}

/** Diagonal timber bracing: the tell of a half-timbered wall. */
function Brace({ x, y, steps, dx = 2, dy = -2, color = WOOD }: { x: number; y: number; steps: number; dx?: number; dy?: number; color?: string }) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < steps; i++) out.push(<rect key={i} x={x + i * dx} y={y + i * dy} width={2} height={2} fill={color} />);
  return <>{out}</>;
}

/** The dark grass every figure stands on, so a row of them shares a horizon. */
function Base({ x = 4, w = 56 }: { x?: number; w?: number }) {
  return <rect x={x} y={56} width={w} height={4} fill={GRASS} />;
}

function Smoke({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y + 4} width={4} height={3} fill={SMOKE} />
      <rect x={x + 3} y={y + 1} width={3} height={3} fill={SMOKE} />
      <rect x={x + 5} y={y} width={2} height={2} fill={SMOKE} />
    </>
  );
}

export function CastleFigure({ tier }: { tier: string }) {
  let body: React.ReactNode;
  switch (tier) {
    case "cottage":
      body = (
        <>
          {/* Half-timbered walls under a deep thatch, a chimney drawing smoke, and a window box. */}
          <rect x={12} y={32} width={40} height={24} fill={PLASTER} />
          <rect x={44} y={32} width={8} height={24} fill={PLASTER_DARK} />
          <rect x={12} y={32} width={3} height={24} fill={WOOD} />
          <rect x={49} y={32} width={3} height={24} fill={WOOD_DARK} />
          <rect x={12} y={43} width={40} height={2} fill={WOOD} />
          <rect x={12} y={53} width={40} height={3} fill={WOOD_DARK} />
          <Brace x={17} y={51} steps={4} />
          <Brace x={39} y={45} steps={4} dy={2} />
          <rect x={42} y={6} width={9} height={18} fill={STONE_DARK} />
          <rect x={42} y={6} width={2} height={18} fill={STONE} />
          <rect x={41} y={4} width={11} height={3} fill={STONE} />
          <Smoke x={44} y={0} />
          <Roof cx={32} top={14} rows={6} dx={4} dy={3} eave={4} lit={THATCH} mid={THATCH} dark={THATCH_DARK} deep="#8a6d35" />
          <rect x={27} y={11} width={10} height={4} fill={THATCH_DARK} />
          <rect x={29} y={9} width={6} height={2} fill={THATCH} />
          <Window x={17} y={36} w={8} h={7} />
          <Shutters x={17} y={36} w={8} h={7} />
          <Window x={39} y={36} w={8} h={7} />
          <rect x={16} y={44} width={10} height={3} fill={WOOD_DARK} />
          <rect x={17} y={42} width={2} height={2} fill="#ec4899" />
          <rect x={20} y={42} width={2} height={2} fill={GOLD} />
          <rect x={23} y={42} width={2} height={2} fill="#ef4444" />
          <Door x={29} y={42} w={9} h={14} />
          <rect x={27} y={55} width={13} height={2} fill={STONE} />
        </>
      );
      break;
    case "watchtower":
      body = (
        <>
          {/* A round shaft with a battlement that oversails it: the overhang is the whole silhouette. */}
          <rect x={20} y={50} width={24} height={6} fill={STONE_DARK} />
          <rect x={20} y={50} width={24} height={1} fill={STONE_LIT} />
          <Stone x={24} y={16} w={16} h={34} />
          <rect x={19} y={12} width={26} height={4} fill={STONE_LIT} />
          <rect x={19} y={16} width={26} height={1} fill={STONE_DEEP} />
          <rect x={21} y={16} width={2} height={2} fill={STONE_DARK} />
          <rect x={27} y={16} width={2} height={2} fill={STONE_DARK} />
          <rect x={35} y={16} width={2} height={2} fill={STONE_DARK} />
          <rect x={41} y={16} width={2} height={2} fill={STONE_DARK} />
          <Merlons x={19} y={8} width={26} />
          <rect x={19} y={11} width={26} height={2} fill={STONE_DARK} />
          <Window x={29} y={22} w={6} h={7} />
          <rect x={31} y={34} width={2} height={7} fill={SHADE} />
          <Door x={28} y={44} w={9} h={12} />
          <Flag x={32} y={0} />
        </>
      );
      break;
    case "keep":
      body = (
        <>
          {/* A square keep between two corner turrets, with a gate arch cut into its face. */}
          <Stone x={12} y={28} w={40} h={28} />
          <Merlons x={12} y={24} width={40} />
          <rect x={12} y={27} width={40} height={2} fill={STONE_DARK} />
          <Stone x={4} y={16} w={13} h={40} mid={STONE_DARK} lit={STONE} dark={STONE_DEEP} />
          <Stone x={47} y={16} w={13} h={40} mid={STONE_DARK} lit={STONE} dark={STONE_DEEP} />
          <Merlons x={4} y={12} width={13} color={STONE_DARK} />
          <Merlons x={47} y={12} width={13} color={STONE_DARK} />
          <rect x={4} y={15} width={13} height={2} fill={STONE_DEEP} />
          <rect x={47} y={15} width={13} height={2} fill={STONE_DEEP} />
          <rect x={26} y={38} width={12} height={18} fill={STONE_DEEP} />
          <rect x={27} y={36} width={10} height={3} fill={STONE_LIT} />
          <Door x={28} y={41} w={8} h={15} />
          <Window x={20} y={33} w={4} h={6} />
          <Window x={41} y={33} w={4} h={6} />
          <rect x={8} y={24} width={3} height={5} fill={SHADE} />
          <rect x={52} y={24} width={3} height={5} fill={SHADE} />
          <Flag x={10} y={4} />
          <Flag x={53} y={4} />
        </>
      );
      break;
    case "manor":
      body = (
        <>
          {/* Two storeys with the upper one jettied out over the lower: the overhang says "manor". */}
          <rect x={12} y={40} width={40} height={16} fill={PLASTER} />
          <rect x={44} y={40} width={8} height={16} fill={PLASTER_DARK} />
          <rect x={12} y={54} width={40} height={2} fill={STONE_DARK} />
          <rect x={8} y={26} width={48} height={14} fill={PLASTER_LIT} />
          <rect x={47} y={26} width={9} height={14} fill={PLASTER_DARK} />
          <rect x={8} y={38} width={48} height={3} fill={WOOD_DARK} />
          <rect x={8} y={41} width={48} height={1} fill={STONE_DEEP} />
          <rect x={8} y={26} width={3} height={14} fill={WOOD} />
          <rect x={53} y={26} width={3} height={14} fill={WOOD_DARK} />
          <rect x={30} y={26} width={3} height={14} fill={WOOD} />
          <Brace x={13} y={34} steps={4} />
          <Brace x={35} y={28} steps={4} dy={2} />
          <Roof cx={32} top={10} rows={6} dx={4} dy={3} eave={4} />
          <rect x={45} y={4} width={8} height={12} fill={STONE_DARK} />
          <rect x={45} y={4} width={2} height={12} fill={STONE} />
          <rect x={44} y={2} width={10} height={3} fill={STONE} />
          <Smoke x={47} y={0} />
          <rect x={18} y={16} width={7} height={8} fill={STONE_DARK} />
          <rect x={18} y={16} width={2} height={8} fill={STONE} />
          <rect x={17} y={14} width={9} height={3} fill={STONE} />
          <rect x={20} y={16} width={10} height={8} fill={ROOF_DARK} />
          <rect x={22} y={14} width={6} height={3} fill={ROOF_LIT} />
          <Window x={22} y={18} w={6} h={5} />
          <Window x={14} y={29} w={7} h={7} />
          <Window x={36} y={29} w={7} h={7} />
          <Window x={16} y={44} w={7} h={7} />
          <Window x={41} y={44} w={7} h={7} />
          <Door x={28} y={42} w={10} h={14} />
        </>
      );
      break;
    case "castle":
      body = (
        <>
          {/* A curtain wall with a gatehouse and a raised portcullis, flanked by drum towers under cones. */}
          <Stone x={10} y={32} w={44} h={24} />
          <Merlons x={10} y={28} width={44} />
          <rect x={10} y={31} width={44} height={2} fill={STONE_DARK} />
          <Stone x={2} y={18} w={14} h={38} mid={STONE_DARK} lit={STONE} dark={STONE_DEEP} />
          <Stone x={48} y={18} w={14} h={38} mid={STONE_DARK} lit={STONE} dark={STONE_DEEP} />
          <Merlons x={2} y={14} width={14} color={STONE_DARK} />
          <Merlons x={48} y={14} width={14} color={STONE_DARK} />
          <Roof cx={9} top={2} rows={4} dx={2} dy={3} eave={1} />
          <Roof cx={55} top={2} rows={4} dx={2} dy={3} eave={1} />
          <rect x={22} y={24} width={20} height={32} fill={STONE} />
          <rect x={36} y={24} width={6} height={32} fill={STONE_DARK} />
          <rect x={22} y={24} width={2} height={32} fill={STONE_LIT} />
          <Merlons x={22} y={20} width={20} />
          <rect x={22} y={23} width={20} height={2} fill={STONE_DARK} />
          <rect x={26} y={38} width={12} height={18} fill={STONE_DEEP} />
          <rect x={27} y={36} width={10} height={3} fill={STONE_LIT} />
          <rect x={27} y={38} width={10} height={5} fill={WOOD_DARK} />
          <rect x={29} y={38} width={1} height={5} fill={GOLD_DEEP} />
          <rect x={33} y={38} width={1} height={5} fill={GOLD_DEEP} />
          <Window x={29} y={28} w={6} h={5} />
          <rect x={6} y={26} width={3} height={6} fill={SHADE} />
          <rect x={54} y={26} width={3} height={6} fill={SHADE} />
          <Window x={15} y={38} w={4} h={6} />
          <Window x={45} y={38} w={4} h={6} />
          <Flag x={31} y={12} color={GOLD_DEEP} height={9} />
        </>
      );
      break;
    case "fortress":
      body = (
        <>
          {/* Three towers over a wall walk, a drawbridge down across a moat. */}
          <Stone x={6} y={30} w={52} h={20} />
          <Merlons x={6} y={26} width={52} />
          <rect x={6} y={29} width={52} height={2} fill={STONE_DARK} />
          <Stone x={2} y={16} w={13} h={34} mid={STONE_DARK} lit={STONE} dark={STONE_DEEP} />
          <Stone x={49} y={16} w={13} h={34} mid={STONE_DARK} lit={STONE} dark={STONE_DEEP} />
          <Merlons x={2} y={12} width={13} color={STONE_DARK} />
          <Merlons x={49} y={12} width={13} color={STONE_DARK} />
          <Roof cx={8} top={3} rows={3} dx={2} dy={3} eave={1} />
          <Roof cx={55} top={3} rows={3} dx={2} dy={3} eave={1} />
          <Stone x={24} y={10} w={16} h={40} />
          <Merlons x={24} y={6} width={16} />
          <rect x={24} y={9} width={16} height={2} fill={STONE_DARK} />
          <rect x={26} y={34} width={12} height={16} fill={STONE_DEEP} />
          <rect x={27} y={32} width={10} height={3} fill={STONE_LIT} />
          <rect x={26} y={50} width={12} height={6} fill={WOOD} />
          <rect x={26} y={55} width={12} height={1} fill={WOOD_DARK} />
          <rect x={31} y={50} width={1} height={6} fill={WOOD_DARK} />
          <Window x={29} y={14} w={6} h={5} />
          <rect x={31} y={24} width={2} height={7} fill={SHADE} />
          <rect x={7} y={22} width={3} height={6} fill={SHADE} />
          <rect x={54} y={22} width={3} height={6} fill={SHADE} />
          <Window x={16} y={36} w={4} h={6} />
          <Window x={44} y={36} w={4} h={6} />
          <Flag x={31} y={0} color={GOLD_DEEP} height={7} />
        </>
      );
      break;
    case "citadel":
      body = (
        <>
          {/* The last tier, and the prize: five towers, a gold spire, and banners on every roof. */}
          <Stone x={2} y={36} w={60} h={20} />
          <Merlons x={2} y={32} width={60} />
          <rect x={2} y={35} width={60} height={2} fill={STONE_DARK} />
          <Stone x={0} y={22} w={12} h={34} mid={STONE_DARK} lit={STONE} dark={STONE_DEEP} />
          <Stone x={52} y={22} w={12} h={34} mid={STONE_DARK} lit={STONE} dark={STONE_DEEP} />
          <Merlons x={0} y={18} width={12} color={STONE_DARK} />
          <Merlons x={52} y={18} width={12} color={STONE_DARK} />
          <Roof cx={6} top={10} rows={3} dx={2} dy={2} eave={0} lit={GOLD_DEEP} mid={ROOF} dark={ROOF_DARK} />
          <Roof cx={58} top={10} rows={3} dx={2} dy={2} eave={0} lit={GOLD_DEEP} mid={ROOF} dark={ROOF_DARK} />
          <Stone x={14} y={20} w={12} h={36} />
          <Stone x={38} y={20} w={12} h={36} />
          <Merlons x={14} y={16} width={12} />
          <Merlons x={38} y={16} width={12} />
          <Stone x={26} y={12} w={12} h={44} lit={PLASTER_LIT} mid={STONE_LIT} dark={STONE} />
          <rect x={25} y={10} width={14} height={3} fill={GOLD_DEEP} />
          <Roof cx={32} top={0} rows={6} dx={1} dy={2} eave={0} lit={GOLD} mid={GOLD_DEEP} dark={ROOF_DARK} deep={ROOF_DEEP} />
          <Window x={29} y={16} w={6} h={6} />
          <Window x={17} y={24} w={6} h={6} />
          <Window x={41} y={24} w={6} h={6} />
          <rect x={26} y={40} width={12} height={16} fill={STONE_DEEP} />
          <rect x={27} y={38} width={10} height={3} fill={GOLD_DEEP} />
          <rect x={27} y={40} width={10} height={5} fill={WOOD_DARK} />
          <rect x={29} y={40} width={1} height={5} fill={GOLD} />
          <rect x={33} y={40} width={1} height={5} fill={GOLD} />
          <Window x={7} y={40} w={4} h={6} />
          <Window x={53} y={40} w={4} h={6} />
          <Flag x={20} y={8} color={GOLD_DEEP} height={8} />
          <Flag x={44} y={8} color={GOLD_DEEP} height={8} />
        </>
      );
      break;
    default: // campsite
      body = (
        <>
          {/* Where every kingdom starts: one tent, one fire. */}
          <rect x={4} y={53} width={4} height={3} fill={WOOD_DARK} />
          <rect x={8} y={50} width={2} height={2} fill={ROPE} />
          <rect x={6} y={52} width={2} height={2} fill={ROPE} />
          <rect x={24} y={12} width={3} height={10} fill={WOOD_DARK} />
          <Roof cx={26} top={20} rows={9} dx={2} dy={4} eave={0} lit="#e2d2a6" mid="#c9b27a" dark="#9c8757" deep="#7d6a43" />
          <rect x={20} y={40} width={12} height={16} fill="#6b5b38" />
          <rect x={22} y={44} width={8} height={12} fill="#4b3f27" />
          <rect x={24} y={40} width={4} height={4} fill="#4b3f27" />
          <Flag x={26} y={10} height={4} />
          <rect x={42} y={52} width={4} height={4} fill={STONE_DARK} />
          <rect x={58} y={52} width={4} height={4} fill={STONE_DARK} />
          <rect x={44} y={51} width={16} height={4} fill={WOOD_DARK} />
          <rect x={44} y={48} width={7} height={3} fill={WOOD} />
          <rect x={53} y={48} width={7} height={3} fill={WOOD} />
          <rect x={48} y={45} width={8} height={4} fill={WOOD_LIT} />
          <rect x={45} y={41} width={14} height={6} fill="#f97316" />
          <rect x={43} y={44} width={2} height={3} fill="#f97316" />
          <rect x={59} y={43} width={2} height={4} fill="#f97316" />
          <rect x={47} y={36} width={10} height={6} fill={GOLD_DEEP} />
          <rect x={50} y={32} width={5} height={5} fill={GOLD} />
          <rect x={51} y={29} width={2} height={4} fill={PLASTER_LIT} />
          <rect x={34} y={50} width={8} height={6} fill={STONE_DARK} />
          <rect x={35} y={51} width={6} height={4} fill={STONE} />
        </>
      );
  }
  return (
    <Frame figure="castle" id={tier}>
      {body}
      <Base />
    </Frame>
  );
}

export function BuildingFigure({ id }: { id: string }) {
  let body: React.ReactNode;
  switch (id) {
    case "well":
      body = (
        <>
          {/* Read from across the field by its shingled cap, its winch, and the bucket on the grass. */}
          <rect x={31} y={2} width={2} height={5} fill={WOOD_DARK} />
          <Roof cx={32} top={6} rows={8} dx={3} dy={2} eave={2} />
          <rect x={20} y={24} width={4} height={16} fill={WOOD} />
          <rect x={40} y={24} width={4} height={16} fill={WOOD_DARK} />
          <rect x={18} y={28} width={28} height={3} fill={WOOD_LIT} />
          <rect x={18} y={28} width={2} height={3} fill={WOOD_DARK} />
          <rect x={44} y={28} width={2} height={3} fill={WOOD_DARK} />
          <rect x={46} y={29} width={4} height={2} fill={STONE_DARK} />
          <rect x={48} y={31} width={2} height={6} fill={STONE_DARK} />
          <rect x={31} y={31} width={2} height={8} fill={ROPE} />
          <rect x={15} y={38} width={34} height={4} fill={STONE_LIT} />
          <rect x={22} y={39} width={20} height={2} fill="#152a52" />
          <rect x={15} y={42} width={34} height={2} fill={STONE_DEEP} />
          <Stone x={17} y={43} w={30} h={13} course={4} />
          <rect x={26} y={43} width={1} height={4} fill={STONE_DARK} />
          <rect x={36} y={47} width={1} height={4} fill={STONE_DARK} />
          <rect x={22} y={51} width={1} height={5} fill={STONE_DARK} />
          <rect x={32} y={51} width={1} height={5} fill={STONE_DARK} />
          <rect x={4} y={40} width={11} height={1} fill={STONE_DARK} />
          <rect x={4} y={41} width={1} height={4} fill={STONE_DARK} />
          <rect x={14} y={41} width={1} height={4} fill={STONE_DARK} />
          <rect x={3} y={45} width={13} height={2} fill={WOOD_DARK} />
          <rect x={4} y={47} width={11} height={9} fill={WOOD_LIT} />
          <rect x={12} y={47} width={3} height={9} fill={WOOD} />
          <rect x={4} y={51} width={11} height={1} fill={WOOD_DARK} />
        </>
      );
      break;
    case "mill":
      body = (
        <>
          {/* Four sails on a tapering tower. Nothing else in the village is an X. */}
          <rect x={23} y={24} width={18} height={2} fill={ROOF_DEEP} />
          <rect x={25} y={20} width={14} height={4} fill={ROOF} />
          <rect x={27} y={17} width={10} height={3} fill={ROOF_LIT} />
          <rect x={30} y={15} width={4} height={2} fill={ROOF_LIT} />
          <rect x={24} y={26} width={16} height={10} fill={PLASTER} />
          <rect x={23} y={36} width={18} height={10} fill={PLASTER} />
          <rect x={22} y={46} width={20} height={10} fill={PLASTER} />
          <rect x={35} y={26} width={5} height={10} fill={PLASTER_DARK} />
          <rect x={35} y={36} width={6} height={10} fill={PLASTER_DARK} />
          <rect x={35} y={46} width={7} height={10} fill={PLASTER_DARK} />
          <rect x={23} y={36} width={18} height={1} fill={WOOD_DARK} />
          <rect x={22} y={46} width={20} height={1} fill={WOOD_DARK} />
          <Window x={26} y={40} w={4} h={4} />
          <Door x={28} y={45} w={8} h={11} />
          <Sails cx={32} cy={30} />
          <rect x={30} y={28} width={4} height={4} fill={WOOD_DARK} />
          <rect x={30} y={28} width={2} height={2} fill={WOOD_LIT} />
        </>
      );
      break;
    case "bridge":
      body = (
        <>
          {/* A stone arch over the river. Two things make it a bridge and not a wall:
              the sky showing between the balusters, and the water showing under the arch. */}
          <rect x={0} y={38} width={64} height={22} fill={WATER} />
          <rect x={0} y={48} width={64} height={12} fill={WATER_DARK} />
          <rect x={2} y={44} width={11} height={1} fill={GLASS} />
          <rect x={47} y={52} width={13} height={1} fill={GLASS} />
          <rect x={16} y={57} width={10} height={1} fill={GLASS} />
          <rect x={0} y={32} width={12} height={8} fill={LEAF} />
          <rect x={52} y={32} width={12} height={8} fill={LEAF} />
          <rect x={0} y={38} width={12} height={8} fill={DIRT_DARK} />
          <rect x={52} y={38} width={12} height={8} fill={DIRT_DARK} />
          <ArchSpan x={8} y={32} w={48} openTop={36} lit={STONE_LIT} mid={STONE} dark={STONE_DARK} hole="#152c52" />
          <rect x={20} y={48} width={24} height={12} fill={WATER} />
          <rect x={20} y={48} width={24} height={2} fill={WATER_DARK} />
          <rect x={24} y={52} width={14} height={1} fill={GLASS} />
          <rect x={27} y={56} width={9} height={1} fill={GLASS} />
          <rect x={2} y={29} width={60} height={4} fill={STONE_LIT} />
          <rect x={2} y={33} width={60} height={1} fill={STONE_DEEP} />
          <rect x={2} y={19} width={60} height={3} fill={STONE_LIT} />
          <rect x={2} y={22} width={60} height={1} fill={STONE_DARK} />
          <rect x={2} y={22} width={5} height={7} fill={STONE} />
          <rect x={13} y={22} width={5} height={7} fill={STONE} />
          <rect x={24} y={22} width={5} height={7} fill={STONE} />
          <rect x={35} y={22} width={5} height={7} fill={STONE} />
          <rect x={46} y={22} width={5} height={7} fill={STONE} />
          <rect x={57} y={22} width={5} height={7} fill={STONE} />
          <rect x={5} y={9} width={2} height={10} fill={WOOD_DARK} />
          <rect x={2} y={2} width={9} height={7} fill={STONE_DARK} />
          <rect x={3} y={4} width={7} height={4} fill={GOLD} />
          <rect x={5} y={5} width={3} height={2} fill={PLASTER_LIT} />
          <rect x={1} y={0} width={11} height={3} fill={STONE} />
        </>
      );
      break;
    case "chapel":
      body = (
        <>
          {/* A nave with a bell tower off to one side: the only asymmetric roofline in the village. */}
          <rect x={16} y={30} width={32} height={26} fill={PLASTER} />
          <rect x={40} y={30} width={8} height={26} fill={PLASTER_DARK} />
          <Roof cx={30} top={18} rows={6} dx={3} dy={2} eave={3} />
          <rect x={14} y={52} width={36} height={4} fill={STONE_DARK} />
          <rect x={14} y={52} width={36} height={1} fill={STONE} />
          <rect x={16} y={32} width={3} height={3} fill={STONE} />
          <rect x={16} y={40} width={3} height={3} fill={STONE} />
          <rect x={16} y={48} width={3} height={3} fill={STONE} />
          <rect x={20} y={33} width={7} height={7} fill={GLASS_DARK} />
          <rect x={22} y={35} width={3} height={3} fill={GOLD} />
          <rect x={19} y={42} width={7} height={10} fill={STONE_DARK} />
          <rect x={20} y={44} width={5} height={8} fill={GLASS_DARK} />
          <rect x={21} y={46} width={3} height={5} fill={GLASS} />
          <rect x={21} y={41} width={3} height={2} fill={STONE} />
          <rect x={30} y={42} width={7} height={10} fill={STONE_DARK} />
          <rect x={31} y={44} width={5} height={8} fill={GLASS_DARK} />
          <rect x={32} y={46} width={3} height={5} fill={GLASS} />
          <rect x={32} y={41} width={3} height={2} fill={STONE} />
          <rect x={42} y={14} width={15} height={42} fill={PLASTER_LIT} />
          <rect x={51} y={14} width={6} height={42} fill={PLASTER_DARK} />
          <rect x={41} y={12} width={17} height={3} fill={STONE} />
          <Roof cx={49} top={4} rows={4} dx={2} dy={2} eave={2} />
          <rect x={48} y={0} width={2} height={5} fill={GOLD} />
          <rect x={46} y={1} width={6} height={2} fill={GOLD} />
          <rect x={45} y={20} width={9} height={11} fill={SHADE} />
          <rect x={47} y={22} width={5} height={6} fill={GOLD_DEEP} />
          <rect x={46} y={28} width={7} height={2} fill={GOLD} />
          <rect x={49} y={30} width={1} height={2} fill={GOLD_DEEP} />
          <Door x={45} y={42} w={9} h={14} />
        </>
      );
      break;
    case "market":
      body = (
        <>
          {/* A striped awning with a scalloped edge, a loaded counter, and bunting. */}
          <rect x={8} y={26} width={4} height={30} fill={WOOD} />
          <rect x={52} y={26} width={4} height={30} fill={WOOD_DARK} />
          <rect x={4} y={22} width={56} height={10} fill={PLASTER_LIT} />
          <rect x={8} y={22} width={5} height={10} fill={FLAG} />
          <rect x={19} y={22} width={5} height={10} fill={FLAG} />
          <rect x={30} y={22} width={5} height={10} fill={FLAG} />
          <rect x={41} y={22} width={5} height={10} fill={FLAG} />
          <rect x={52} y={22} width={5} height={10} fill={FLAG} />
          <rect x={4} y={20} width={56} height={3} fill={WOOD_DARK} />
          <rect x={4} y={32} width={56} height={1} fill="#8a8072" />
          <rect x={6} y={33} width={5} height={3} fill={PLASTER_LIT} />
          <rect x={17} y={33} width={5} height={3} fill={FLAG} />
          <rect x={28} y={33} width={5} height={3} fill={PLASTER_LIT} />
          <rect x={39} y={33} width={5} height={3} fill={FLAG} />
          <rect x={50} y={33} width={5} height={3} fill={PLASTER_LIT} />
          <rect x={31} y={12} width={2} height={8} fill={WOOD_DARK} />
          <polygon points="33,12 40,15 33,18" fill={GOLD_DEEP} />
          <rect x={10} y={42} width={44} height={14} fill={WOOD} />
          <rect x={8} y={40} width={48} height={3} fill={WOOD_LIT} />
          <rect x={10} y={48} width={44} height={1} fill={WOOD_DARK} />
          <rect x={10} y={52} width={44} height={1} fill={WOOD_DARK} />
          <rect x={13} y={35} width={6} height={5} fill={WOOD_DARK} />
          <rect x={14} y={36} width={4} height={3} fill="#ef4444" />
          <rect x={22} y={36} width={4} height={4} fill="#ef4444" />
          <rect x={27} y={36} width={4} height={4} fill="#ef4444" />
          <rect x={24} y={34} width={1} height={2} fill={LEAF} />
          <rect x={34} y={35} width={9} height={5} fill={GOLD_DEEP} />
          <rect x={35} y={34} width={7} height={2} fill={GOLD} />
          <rect x={46} y={34} width={6} height={6} fill={LEAF_LIGHT} />
          <rect x={47} y={35} width={4} height={4} fill={LEAF} />
        </>
      );
      break;
    case "library":
      body = (
        <>
          {/* A columned front under a pediment, with three book spines set in the gable. */}
          <rect x={12} y={26} width={40} height={26} fill="#6f5a8a" />
          <rect x={44} y={26} width={8} height={26} fill="#4e3d63" />
          <Roof cx={32} top={12} rows={4} dx={4} dy={3} eave={2} lit={PLASTER_LIT} mid={PLASTER} dark={PLASTER_DARK} deep="#8a7f6c" />
          <rect x={27} y={19} width={3} height={6} fill="#ef4444" />
          <rect x={31} y={18} width={3} height={7} fill={GLASS_DARK} />
          <rect x={35} y={20} width={3} height={5} fill={LEAF} />
          <rect x={10} y={24} width={44} height={3} fill={PLASTER_LIT} />
          <rect x={10} y={27} width={44} height={1} fill="#8a7f6c" />
          <rect x={14} y={28} width={6} height={22} fill={PLASTER_LIT} />
          <rect x={18} y={28} width={2} height={22} fill={PLASTER_DARK} />
          <rect x={22} y={28} width={6} height={22} fill={PLASTER_LIT} />
          <rect x={26} y={28} width={2} height={22} fill={PLASTER_DARK} />
          <rect x={37} y={28} width={6} height={22} fill={PLASTER_LIT} />
          <rect x={41} y={28} width={2} height={22} fill={PLASTER_DARK} />
          <rect x={45} y={28} width={6} height={22} fill={PLASTER_LIT} />
          <rect x={49} y={28} width={2} height={22} fill={PLASTER_DARK} />
          <rect x={13} y={50} width={38} height={2} fill={PLASTER} />
          <rect x={8} y={52} width={48} height={2} fill={PLASTER_LIT} />
          <rect x={6} y={54} width={52} height={2} fill={PLASTER} />
          <Window x={31} y={30} w={6} h={5} bars={false} />
          <Door x={29} y={38} w={10} h={14} />
        </>
      );
      break;
    case "watchtower":
      body = (
        <>
          {/* A slim shaft with a battlement that oversails it, and a lantern burning up top. */}
          <rect x={21} y={50} width={22} height={6} fill={STONE_DARK} />
          <rect x={21} y={50} width={22} height={1} fill={STONE_LIT} />
          <Stone x={25} y={18} w={14} h={32} />
          <rect x={20} y={14} width={24} height={4} fill={STONE_LIT} />
          <rect x={20} y={18} width={24} height={1} fill={STONE_DEEP} />
          <rect x={22} y={18} width={2} height={2} fill={STONE_DARK} />
          <rect x={28} y={18} width={2} height={2} fill={STONE_DARK} />
          <rect x={34} y={18} width={2} height={2} fill={STONE_DARK} />
          <rect x={40} y={18} width={2} height={2} fill={STONE_DARK} />
          <Merlons x={20} y={10} width={24} />
          <rect x={20} y={13} width={24} height={2} fill={STONE_DARK} />
          <rect x={28} y={22} width={8} height={9} fill={SHADE} />
          <rect x={29} y={23} width={6} height={7} fill={GOLD} />
          <rect x={30} y={24} width={4} height={5} fill={PLASTER_LIT} />
          <rect x={31} y={35} width={2} height={7} fill={SHADE} />
          <Door x={28} y={45} w={8} h={11} />
          <Flag x={32} y={2} />
        </>
      );
      break;
    default: // garden
      body = (
        <>
          {/* A rose arch over the path, a bed either side, a sunflower and a bee skep. */}
          <rect x={2} y={40} width={22} height={16} fill={DIRT_DARK} />
          <rect x={40} y={40} width={22} height={16} fill={DIRT_DARK} />
          <rect x={2} y={40} width={22} height={2} fill={DIRT} />
          <rect x={40} y={40} width={22} height={2} fill={DIRT} />
          <rect x={24} y={42} width={16} height={14} fill="#c9b27a" />
          <rect x={26} y={38} width={12} height={4} fill="#b8a271" />
          <rect x={24} y={47} width={16} height={1} fill="#9c8757" />
          <rect x={26} y={41} width={12} height={1} fill="#9c8757" />
          <rect x={24} y={52} width={16} height={1} fill="#9c8757" />
          <rect x={3} y={36} width={6} height={5} fill={LEAF} />
          <rect x={11} y={37} width={6} height={4} fill={LEAF_LIGHT} />
          <rect x={18} y={36} width={5} height={5} fill={LEAF} />
          <rect x={4} y={45} width={5} height={3} fill="#f97316" />
          <rect x={12} y={46} width={5} height={3} fill="#ef4444" />
          <rect x={19} y={45} width={4} height={3} fill="#f97316" />
          <rect x={41} y={36} width={6} height={5} fill={LEAF_LIGHT} />
          <rect x={49} y={37} width={5} height={4} fill={LEAF} />
          <rect x={56} y={36} width={6} height={5} fill={LEAF_LIGHT} />
          <rect x={42} y={45} width={5} height={3} fill={LEAF} />
          <rect x={50} y={46} width={4} height={3} fill="#ef4444" />
          <rect x={16} y={20} width={5} height={36} fill={WOOD} />
          <rect x={43} y={20} width={5} height={36} fill={WOOD_DARK} />
          <rect x={16} y={17} width={7} height={3} fill={WOOD_LIT} />
          <rect x={20} y={14} width={7} height={3} fill={WOOD_LIT} />
          <rect x={25} y={12} width={7} height={3} fill={WOOD_LIT} />
          <rect x={32} y={12} width={7} height={3} fill={WOOD} />
          <rect x={37} y={14} width={7} height={3} fill={WOOD} />
          <rect x={41} y={17} width={7} height={3} fill={WOOD} />
          <rect x={21} y={24} width={22} height={2} fill={WOOD_LIT} />
          <rect x={21} y={33} width={22} height={2} fill={WOOD} />
          <rect x={18} y={15} width={4} height={3} fill={LEAF} />
          <rect x={26} y={9} width={5} height={3} fill={LEAF_LIGHT} />
          <rect x={34} y={9} width={5} height={3} fill={LEAF} />
          <rect x={42} y={15} width={4} height={3} fill={LEAF_LIGHT} />
          <rect x={19} y={13} width={2} height={2} fill="#ec4899" />
          <rect x={28} y={7} width={2} height={2} fill="#ec4899" />
          <rect x={36} y={7} width={2} height={2} fill="#f472b6" />
          <rect x={23} y={22} width={2} height={2} fill="#ec4899" />
          <rect x={39} y={31} width={2} height={2} fill="#f472b6" />
          <rect x={17} y={28} width={3} height={2} fill={LEAF} />
          <rect x={44} y={38} width={3} height={2} fill={LEAF} />
          <rect x={7} y={26} width={2} height={14} fill={LEAF} />
          <rect x={3} y={30} width={4} height={2} fill={LEAF_LIGHT} />
          <rect x={9} y={34} width={4} height={2} fill={LEAF_LIGHT} />
          <rect x={6} y={18} width={4} height={4} fill={WOOD_DARK} />
          <rect x={6} y={14} width={4} height={3} fill={GOLD} />
          <rect x={6} y={23} width={4} height={3} fill={GOLD} />
          <rect x={2} y={18} width={3} height={4} fill={GOLD_DEEP} />
          <rect x={11} y={18} width={3} height={4} fill={GOLD_DEEP} />
          <rect x={3} y={15} width={3} height={3} fill={GOLD} />
          <rect x={10} y={22} width={3} height={3} fill={GOLD_DEEP} />
          <rect x={50} y={30} width={12} height={5} fill={THATCH} />
          <rect x={50} y={34} width={12} height={1} fill={THATCH_DARK} />
          <rect x={51} y={26} width={10} height={4} fill={THATCH} />
          <rect x={51} y={29} width={10} height={1} fill={THATCH_DARK} />
          <rect x={52} y={22} width={8} height={4} fill={THATCH} />
          <rect x={52} y={25} width={8} height={1} fill={THATCH_DARK} />
          <rect x={54} y={32} width={4} height={3} fill={SHADE} />
          <rect x={48} y={19} width={2} height={2} fill={GOLD_DEEP} />
          <rect x={45} y={24} width={2} height={2} fill={GOLD_DEEP} />
        </>
      );
  }
  return (
    <Frame figure="building" id={id}>
      {body}
      {/* The bridge is the one thing here not standing on grass: its own banks ground it. */}
      {id === "bridge" ? <><Base x={0} w={11} /><Base x={53} w={11} /></> : <Base />}
    </Frame>
  );
}

/**
 * Four sails in an X: the one shape in the village that says "windmill" on its
 * own, so it is worth the pixels. Each arm is a dark spar stepping out from the
 * hub with its cloth hung on the TRAILING side — the same side for all four,
 * which is what makes it read as a pinwheel rather than a splat.
 */
function Sails({ cx, cy }: { cx: number; cy: number }) {
  const out: React.ReactNode[] = [];
  const arms = [{ dx: -1, dy: -1 }, { dx: 1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: 1 }];
  arms.forEach((a, n) => {
    for (let i = 1; i <= 6; i++) {
      const x = cx + a.dx * 3 * i - (a.dx < 0 ? 3 : 0);
      const y = cy + a.dy * 3 * i - (a.dy < 0 ? 3 : 0);
      if (i >= 2 && i <= 6) {
        // Perpendicular to the spar, the same way round on every arm.
        const sx = x + a.dy * 3;
        const sy = y - a.dx * 3;
        out.push(<rect key={`c${n}-${i}`} x={sx} y={sy} width={3} height={3} fill={i % 2 === 0 ? PLASTER_LIT : PLASTER} />);
      }
      out.push(<rect key={`s${n}-${i}`} x={x} y={y} width={3} height={3} fill={WOOD_DARK} />);
    }
  });
  return <>{out}</>;
}

/**
 * The plot a site stands on, drawn FLAT on the ground (the scene lays it down
 * rather than standing it up), so it carries only what reads from above: turned
 * earth, the string lines between the corner stakes, and the spoil heaped at one
 * end. Everything with a height belongs to `SiteFigure`, which stands on top of it.
 */
export function FoundationFigure() {
  return (
    <Frame figure="foundation">
      <rect x={2} y={12} width={60} height={48} fill={DIRT} />
      <rect x={8} y={10} width={48} height={2} fill={DIRT} />
      <rect x={2} y={54} width={60} height={6} fill={DIRT_DARK} />
      <rect x={6} y={14} width={16} height={8} fill="#93805f" />
      <rect x={38} y={16} width={14} height={6} fill="#93805f" />
      <rect x={42} y={38} width={16} height={8} fill="#93805f" />
      <rect x={8} y={44} width={12} height={6} fill="#93805f" />
      <rect x={24} y={26} width={18} height={4} fill="#6a5a41" />
      <rect x={20} y={44} width={22} height={4} fill="#6a5a41" />
      <rect x={4} y={16} width={4} height={4} fill={WOOD_LIT} />
      <rect x={56} y={16} width={4} height={4} fill={WOOD_LIT} />
      <rect x={4} y={50} width={4} height={4} fill={WOOD} />
      <rect x={56} y={50} width={4} height={4} fill={WOOD} />
      <rect x={6} y={17} width={52} height={1} fill={ROPE} />
      <rect x={6} y={52} width={52} height={1} fill={ROPE} />
      <rect x={5} y={18} width={1} height={33} fill={ROPE} />
      <rect x={58} y={18} width={1} height={33} fill={ROPE} />
    </Frame>
  );
}

/**
 * What stands on the plot while the deeds are still owed. Stage 0 is a staked
 * site with the timber delivered, 4 is a roof going on; the building itself
 * takes over at 5. One deed, one visible change — which is the whole point:
 * before this, four fifths of a child's time at a site was spent looking at an
 * empty lot.
 *
 * These are deliberately GENERIC rather than eight part-built wells and mills.
 * A frame is a frame at 64 px, the site keeps its name on the foreman's board
 * and its villager's plate, and eight ids × five stages of textures is a cost
 * no eleven-year-old's laptop should pay for a difference it cannot see.
 */
export function SiteFigure({ stage }: { stage: number }) {
  const s = Math.min(SITE_STAGES - 1, Math.max(0, Math.floor(stage)));
  const sign = (
    <>
      <rect x={4} y={38} width={3} height={18} fill={WOOD} />
      <rect x={14} y={38} width={3} height={18} fill={WOOD_DARK} />
      <rect x={0} y={22} width={21} height={17} fill={PLASTER} />
      <rect x={0} y={22} width={21} height={3} fill={WOOD_DARK} />
      <rect x={0} y={36} width={21} height={3} fill={WOOD_DARK} />
      <rect x={0} y={25} width={2} height={11} fill={WOOD} />
      <rect x={19} y={25} width={2} height={11} fill={WOOD_DARK} />
      <rect x={4} y={27} width={13} height={2} fill="#8a7f6c" />
      <rect x={4} y={31} width={9} height={2} fill="#8a7f6c" />
      <rect x={15} y={31} width={2} height={2} fill={FLAG} />
    </>
  );
  const claim = (
    <>
      <rect x={56} y={14} width={3} height={42} fill={WOOD} />
      <rect x={58} y={14} width={1} height={42} fill={WOOD_DARK} />
      <rect x={53} y={12} width={9} height={3} fill={WOOD_DARK} />
      <rect x={50} y={16} width={6} height={10} fill={FLAG} />
      <rect x={50} y={24} width={6} height={2} fill={ROOF_DARK} />
      <rect x={51} y={18} width={4} height={2} fill={GOLD} />
    </>
  );
  const scaffold = (
    <>
      <rect x={50} y={20} width={2} height={34} fill={WOOD_LIT} />
      <rect x={60} y={20} width={2} height={34} fill={WOOD} />
      <rect x={49} y={30} width={14} height={2} fill={WOOD_LIT} />
      <rect x={49} y={42} width={14} height={2} fill={WOOD_LIT} />
      <rect x={52} y={24} width={8} height={1} fill={WOOD_DARK} />
      <rect x={52} y={36} width={8} height={1} fill={WOOD_DARK} />
      <rect x={54} y={26} width={5} height={4} fill={STONE_DARK} />
      <rect x={54} y={25} width={5} height={1} fill={STONE_LIT} />
    </>
  );
  const footing = (
    <>
      <rect x={12} y={48} width={40} height={8} fill={STONE_DARK} />
      <rect x={12} y={46} width={40} height={2} fill={STONE} />
      <rect x={12} y={46} width={2} height={10} fill={STONE_LIT} />
      <rect x={20} y={48} width={1} height={8} fill={STONE_DEEP} />
      <rect x={31} y={48} width={1} height={8} fill={STONE_DEEP} />
      <rect x={42} y={48} width={1} height={8} fill={STONE_DEEP} />
      <rect x={12} y={52} width={40} height={1} fill={STONE_DEEP} />
    </>
  );
  const timber = (
    <>
      <rect x={18} y={50} width={22} height={3} fill={WOOD_LIT} />
      <rect x={18} y={53} width={22} height={3} fill={WOOD} />
      <rect x={20} y={47} width={18} height={3} fill={WOOD_LIT} />
      <rect x={18} y={52} width={22} height={1} fill={WOOD_DARK} />
      <rect x={20} y={49} width={18} height={1} fill={WOOD_DARK} />
      <rect x={18} y={50} width={3} height={3} fill={THATCH} />
      <rect x={37} y={50} width={3} height={3} fill={THATCH_DARK} />
      <rect x={18} y={53} width={3} height={3} fill={THATCH_DARK} />
      <rect x={37} y={53} width={3} height={3} fill={WOOD_DARK} />
      <rect x={20} y={47} width={3} height={3} fill={THATCH} />
      <rect x={35} y={47} width={3} height={3} fill={THATCH_DARK} />
    </>
  );
  const truss = (
    <>
      {Array.from({ length: 10 }, (_, i) => <rect key={`tl${i}`} x={13 + i * 2} y={28 - i} width={2} height={2} fill={WOOD} />)}
      {Array.from({ length: 10 }, (_, i) => <rect key={`tr${i}`} x={49 - i * 2} y={28 - i} width={2} height={2} fill={WOOD_DARK} />)}
      <rect x={29} y={16} width={6} height={3} fill={WOOD_DARK} />
      <rect x={31} y={19} width={2} height={9} fill={WOOD} />
      <rect x={12} y={26} width={40} height={3} fill={WOOD_LIT} />
      <rect x={12} y={29} width={40} height={1} fill={WOOD_DARK} />
    </>
  );
  const posts = (
    <>
      <rect x={13} y={30} width={4} height={16} fill={WOOD} />
      <rect x={24} y={30} width={3} height={16} fill={WOOD} />
      <rect x={37} y={30} width={3} height={16} fill={WOOD_DARK} />
      <rect x={47} y={30} width={4} height={16} fill={WOOD_DARK} />
      <rect x={12} y={44} width={40} height={2} fill={WOOD_DARK} />
    </>
  );
  let body: React.ReactNode;
  switch (s) {
    case 0: // staked out, and the first load delivered
      body = (
        <>
          <rect x={10} y={48} width={44} height={8} fill={DIRT_DARK} />
          <rect x={10} y={48} width={44} height={2} fill={DIRT} />
          <rect x={12} y={38} width={3} height={18} fill={WOOD_LIT} />
          <rect x={49} y={38} width={3} height={18} fill={WOOD} />
          <rect x={12} y={39} width={40} height={1} fill={ROPE} />
          {timber}
          <rect x={12} y={44} width={40} height={3} fill={DIRT_DARK} />
          <rect x={42} y={50} width={7} height={6} fill={WOOD_DARK} />
          <rect x={43} y={51} width={5} height={4} fill={SHADE} />
          <rect x={41} y={44} width={16} height={6} fill={STONE_DARK} />
          <rect x={41} y={44} width={16} height={1} fill={STONE_LIT} />
          <rect x={44} y={46} width={4} height={3} fill={STONE} />
          <rect x={50} y={46} width={4} height={3} fill={STONE} />
          {claim}
          {sign}
        </>
      );
      break;
    case 1: // the footing course is laid and the sole plates are down
      body = (
        <>
          <rect x={10} y={52} width={44} height={4} fill={DIRT_DARK} />
          {footing}
          <rect x={12} y={44} width={40} height={2} fill={WOOD} />
          <rect x={12} y={38} width={3} height={8} fill={WOOD_LIT} />
          <rect x={49} y={38} width={3} height={8} fill={WOOD} />
          <rect x={12} y={39} width={40} height={1} fill={ROPE} />
          <rect x={20} y={38} width={7} height={6} fill={STONE_DARK} />
          <rect x={20} y={38} width={7} height={1} fill={STONE} />
          <rect x={28} y={40} width={6} height={4} fill={STONE_DEEP} />
          <rect x={35} y={39} width={6} height={5} fill={STONE_DARK} />
          <rect x={35} y={39} width={6} height={1} fill={STONE} />
          {claim}
          {sign}
        </>
      );
      break;
    case 2: // the frame is up and the roof truss is raised
      body = (
        <>
          <rect x={10} y={52} width={44} height={4} fill={DIRT_DARK} />
          {footing}
          {posts}
          {truss}
          {scaffold}
          <rect x={6} y={30} width={2} height={26} fill={WOOD_LIT} />
          <rect x={11} y={30} width={2} height={26} fill={WOOD_LIT} />
          <rect x={6} y={34} width={7} height={1} fill={WOOD_DARK} />
          <rect x={6} y={40} width={7} height={1} fill={WOOD_DARK} />
          <rect x={6} y={46} width={7} height={1} fill={WOOD_DARK} />
        </>
      );
      break;
    case 3: // the walls go in, the openings are still holes
      body = (
        <>
          <rect x={10} y={52} width={44} height={4} fill={DIRT_DARK} />
          {footing}
          <rect x={16} y={30} width={9} height={16} fill={PLASTER} />
          <rect x={27} y={30} width={10} height={16} fill={PLASTER} />
          <rect x={40} y={30} width={8} height={16} fill={PLASTER_DARK} />
          {posts}
          <rect x={18} y={34} width={6} height={6} fill={SHADE} />
          <rect x={29} y={36} width={7} height={10} fill={SHADE} />
          <rect x={41} y={34} width={6} height={6} fill={SHADE} />
          {truss}
          <rect x={16} y={22} width={32} height={1} fill={WOOD_DARK} />
          <rect x={19} y={18} width={26} height={1} fill={WOOD_DARK} />
          {scaffold}
        </>
      );
      break;
    default: // 4: the roof goes on from the eaves up, with a bough tied to the ridge
      body = (
        <>
          <rect x={10} y={52} width={44} height={4} fill={DIRT_DARK} />
          {footing}
          <rect x={16} y={30} width={9} height={16} fill={PLASTER} />
          <rect x={27} y={30} width={10} height={16} fill={PLASTER} />
          <rect x={40} y={30} width={8} height={16} fill={PLASTER_DARK} />
          {posts}
          <Window x={19} y={34} w={5} h={5} />
          <Window x={42} y={34} w={5} h={5} />
          <Door x={29} y={35} w={8} h={11} />
          {truss}
          <rect x={16} y={22} width={32} height={1} fill={WOOD_DARK} />
          <rect x={19} y={18} width={26} height={1} fill={WOOD_DARK} />
          <rect x={10} y={26} width={44} height={4} fill={ROOF} />
          <rect x={32} y={26} width={22} height={4} fill={ROOF_DARK} />
          <rect x={10} y={29} width={44} height={1} fill={ROOF_DEEP} />
          <rect x={14} y={22} width={36} height={4} fill={ROOF} />
          <rect x={32} y={22} width={18} height={4} fill={ROOF_DARK} />
          <rect x={14} y={25} width={36} height={1} fill={ROOF_DEEP} />
          <rect x={29} y={13} width={6} height={3} fill={LEAF} />
          <rect x={31} y={10} width={3} height={3} fill={LEAF_LIGHT} />
          <Flag x={35} y={10} height={6} />
          {scaffold}
        </>
      );
  }
  return (
    <Frame figure="site" id={String(s)}>
      {body}
      <Base x={2} w={60} />
    </Frame>
  );
}

export function DecorFigure({ kind }: { kind: string }) {
  let body: React.ReactNode;
  switch (kind) {
    case "pine":
      body = (
        <>
          <rect x={29} y={46} width={6} height={12} fill={WOOD} />
          <rect x={33} y={46} width={2} height={12} fill={WOOD_DARK} />
          <polygon points="32,18 8,50 56,50" fill={PINE} />
          <polygon points="32,20 32,50 56,50" fill="#164a24" />
          <polygon points="32,4 14,34 50,34" fill={LEAF} />
          <polygon points="32,6 32,34 50,34" fill={PINE} />
        </>
      );
      break;
    case "bush":
      body = (
        <>
          <ellipse cx={32} cy={46} rx={20} ry={12} fill="#2f6f3c" />
          <ellipse cx={28} cy={43} rx={14} ry={9} fill="#3d8a4a" />
          <ellipse cx={25} cy={40} rx={7} ry={5} fill={LEAF_LIGHT} />
          <rect x={38} y={40} width={3} height={3} fill="#ec4899" />
          <rect x={20} y={48} width={3} height={3} fill={GOLD} />
        </>
      );
      break;
    case "rock":
      body = (
        <>
          <polygon points="10,54 20,34 40,30 56,50 50,58 14,58" fill="#6e6e78" />
          <polygon points="20,34 40,30 44,44 26,46" fill="#9a9aa8" />
          <polygon points="26,46 44,44 50,58 20,56" fill="#5a5a64" />
          <rect x={22} y={36} width={6} height={2} fill="#b6b6c4" />
          <rect x={14} y={56} width={40} height={2} fill="#4e4e59" />
        </>
      );
      break;
    case "fence":
      body = (
        <>
          <rect x={4} y={30} width={56} height={4} fill="#a07b4a" />
          <rect x={4} y={33} width={56} height={1} fill={WOOD_DARK} />
          <rect x={4} y={42} width={56} height={4} fill="#a07b4a" />
          <rect x={4} y={45} width={56} height={1} fill={WOOD_DARK} />
          <rect x={8} y={22} width={6} height={34} fill={WOOD} />
          <rect x={12} y={22} width={2} height={34} fill={WOOD_DARK} />
          <rect x={30} y={22} width={6} height={34} fill={WOOD} />
          <rect x={34} y={22} width={2} height={34} fill={WOOD_DARK} />
          <rect x={52} y={22} width={6} height={34} fill={WOOD} />
          <rect x={56} y={22} width={2} height={34} fill={WOOD_DARK} />
        </>
      );
      break;
    case "lantern":
      body = (
        <>
          <rect x={30} y={20} width={4} height={38} fill={WOOD} />
          <rect x={32} y={20} width={2} height={38} fill={WOOD_DARK} />
          <rect x={24} y={8} width={16} height={14} fill={STONE_DARK} />
          <rect x={27} y={11} width={10} height={8} fill={GOLD} />
          <rect x={29} y={13} width={6} height={4} fill={PLASTER_LIT} />
          <rect x={23} y={6} width={18} height={3} fill={STONE_DEEP} />
          <rect x={30} y={3} width={4} height={3} fill={STONE_DARK} />
          <rect x={22} y={54} width={20} height={4} fill={STONE_DARK} />
          <rect x={22} y={54} width={20} height={1} fill={STONE} />
        </>
      );
      break;
    default: // oak
      body = (
        <>
          <rect x={29} y={40} width={6} height={18} fill={WOOD} />
          <rect x={33} y={40} width={2} height={18} fill={WOOD_DARK} />
          <circle cx={22} cy={32} r={10} fill={LEAF} />
          <circle cx={42} cy={32} r={10} fill="#25672f" />
          <circle cx={32} cy={24} r={14} fill={LEAF} />
          <circle cx={27} cy={20} r={8} fill={LEAF_LIGHT} />
          <circle cx={24} cy={17} r={4} fill="#7cc27c" />
        </>
      );
  }
  return <Frame figure="decor" id={kind}>{body}</Frame>;
}
