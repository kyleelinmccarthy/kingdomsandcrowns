/**
 * Pixel figures for the world: castles by tier, the eight kingdom buildings,
 * the foundation a site shows until it is built, and decorations. Drawn on a
 * 64×64 grid so roofs and towers have room; rasterised by SpriteSource like
 * the heroes. Each figure carries data-figure and data-figure-id.
 */

export const CASTLE_TIERS = ["campsite", "cottage", "watchtower", "keep", "manor", "castle", "fortress", "citadel"] as const;
export type CastleTier = (typeof CASTLE_TIERS)[number];
export const DECOR_KINDS = ["oak", "pine", "bush", "rock", "fence", "lantern"] as const;
export type DecorKind = (typeof DECOR_KINDS)[number];
/** Rasterisation scale per figure family: the citadel is 512 px, a bush 256 px. */
export const WORLD_SPRITE_SCALE = { castle: 8, building: 6, foundation: 4, decor: 4 } as const;

const STONE = "#9a9aa8";
const STONE_DARK = "#6f6f7c";
const ROOF = "#7b3f3f";
const ROOF_DARK = "#5a2d2d";
const WOOD = "#6b4226";
const PLASTER = "#d8cfc0";
const FLAG = "#c0563d";
const GOLD = "#fde68a";
const LEAF = "#2f7a3d";
const LEAF_LIGHT = "#4a9a55";
const PINE = "#1f5f30";

function Frame({ figure, id, children, size = 96 }: { figure: string; id?: string; children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure={figure} data-figure-id={id}>
      {children}
    </svg>
  );
}

/** Square battlements along a wall top: alternating merlons. */
function Merlons({ x, y, width, color = STONE }: { x: number; y: number; width: number; color?: string }) {
  const teeth: React.ReactNode[] = [];
  for (let i = 0; i * 6 + 3 <= width; i++) teeth.push(<rect key={i} x={x + i * 6} y={y} width={3} height={3} fill={color} />);
  return <>{teeth}</>;
}

function Flag({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y} width={1} height={8} fill={WOOD} />
      <polygon points={`${x + 1},${y} ${x + 6},${y + 2} ${x + 1},${y + 4}`} fill={FLAG} />
    </>
  );
}

export function CastleFigure({ tier }: { tier: string }) {
  let body: React.ReactNode;
  switch (tier) {
    case "cottage":
      body = (
        <>
          <rect x={14} y={30} width={36} height={26} fill={PLASTER} />
          <polygon points="8,32 32,10 56,32" fill={ROOF} />
          <polygon points="12,32 32,14 52,32" fill={ROOF_DARK} />
          <rect x={42} y={14} width={6} height={10} fill={STONE_DARK} />
          <rect x={28} y={42} width={8} height={14} fill={WOOD} />
          <rect x={18} y={36} width={6} height={6} fill={GOLD} />
          <rect x={40} y={36} width={6} height={6} fill={GOLD} />
        </>
      );
      break;
    case "watchtower":
      body = (
        <>
          <rect x={22} y={14} width={20} height={42} fill={STONE} />
          <rect x={22} y={14} width={4} height={42} fill={STONE_DARK} />
          <Merlons x={20} y={10} width={24} />
          <rect x={20} y={13} width={24} height={2} fill={STONE_DARK} />
          <rect x={29} y={24} width={6} height={8} fill={GOLD} />
          <rect x={28} y={44} width={8} height={12} fill={WOOD} />
          <Flag x={31} y={2} />
        </>
      );
      break;
    case "keep":
      body = (
        <>
          <rect x={10} y={30} width={44} height={26} fill={STONE} />
          <rect x={6} y={18} width={12} height={38} fill={STONE_DARK} />
          <rect x={46} y={18} width={12} height={38} fill={STONE_DARK} />
          <Merlons x={6} y={14} width={12} color={STONE_DARK} />
          <Merlons x={46} y={14} width={12} color={STONE_DARK} />
          <Merlons x={18} y={26} width={28} />
          <rect x={28} y={42} width={8} height={14} fill={WOOD} />
          <rect x={20} y={34} width={4} height={6} fill={GOLD} />
          <rect x={40} y={34} width={4} height={6} fill={GOLD} />
          <Flag x={11} y={6} />
        </>
      );
      break;
    case "manor":
      body = (
        <>
          <rect x={8} y={26} width={48} height={30} fill={PLASTER} />
          <polygon points="4,28 32,8 60,28" fill={ROOF} />
          <polygon points="10,28 32,13 54,28" fill={ROOF_DARK} />
          <rect x={46} y={12} width={6} height={12} fill={STONE_DARK} />
          <rect x={14} y={32} width={6} height={6} fill={GOLD} />
          <rect x={44} y={32} width={6} height={6} fill={GOLD} />
          <rect x={14} y={44} width={6} height={6} fill={GOLD} />
          <rect x={44} y={44} width={6} height={6} fill={GOLD} />
          <rect x={28} y={42} width={8} height={14} fill={WOOD} />
          <rect x={8} y={40} width={48} height={2} fill={WOOD} />
        </>
      );
      break;
    case "castle":
      body = (
        <>
          <rect x={8} y={32} width={48} height={24} fill={STONE} />
          <Merlons x={8} y={28} width={48} />
          <rect x={4} y={16} width={12} height={40} fill={STONE_DARK} />
          <rect x={48} y={16} width={12} height={40} fill={STONE_DARK} />
          <Merlons x={4} y={12} width={12} color={STONE_DARK} />
          <Merlons x={48} y={12} width={12} color={STONE_DARK} />
          <rect x={26} y={40} width={12} height={16} fill={WOOD} />
          <rect x={26} y={40} width={12} height={4} fill={STONE_DARK} />
          <rect x={8} y={24} width={4} height={6} fill={GOLD} />
          <rect x={52} y={24} width={4} height={6} fill={GOLD} />
          <Flag x={9} y={4} />
          <Flag x={53} y={4} />
        </>
      );
      break;
    case "fortress":
      body = (
        <>
          <rect x={4} y={30} width={56} height={26} fill={STONE} />
          <Merlons x={4} y={26} width={56} />
          <rect x={4} y={14} width={12} height={42} fill={STONE_DARK} />
          <rect x={26} y={10} width={12} height={46} fill={STONE_DARK} />
          <rect x={48} y={14} width={12} height={42} fill={STONE_DARK} />
          <Merlons x={4} y={10} width={12} color={STONE_DARK} />
          <Merlons x={26} y={6} width={12} color={STONE_DARK} />
          <Merlons x={48} y={10} width={12} color={STONE_DARK} />
          <rect x={16} y={44} width={8} height={12} fill={WOOD} />
          <rect x={40} y={44} width={8} height={12} fill={WOOD} />
          <rect x={30} y={20} width={4} height={6} fill={GOLD} />
          <Flag x={31} y={0} />
        </>
      );
      break;
    case "citadel":
      body = (
        <>
          <rect x={4} y={34} width={56} height={22} fill={STONE} />
          <Merlons x={4} y={30} width={56} />
          <rect x={4} y={18} width={10} height={38} fill={STONE_DARK} />
          <rect x={50} y={18} width={10} height={38} fill={STONE_DARK} />
          <rect x={20} y={8} width={10} height={48} fill={STONE_DARK} />
          <rect x={34} y={8} width={10} height={48} fill={STONE_DARK} />
          <rect x={28} y={14} width={8} height={42} fill={STONE} />
          <polygon points="26,14 32,2 38,14" fill={ROOF} />
          <Merlons x={4} y={14} width={10} color={STONE_DARK} />
          <Merlons x={50} y={14} width={10} color={STONE_DARK} />
          <Merlons x={20} y={4} width={10} color={STONE_DARK} />
          <Merlons x={34} y={4} width={10} color={STONE_DARK} />
          <rect x={28} y={44} width={8} height={12} fill={WOOD} />
          <rect x={30} y={24} width={4} height={6} fill={GOLD} />
          <Flag x={6} y={6} />
          <Flag x={52} y={6} />
        </>
      );
      break;
    default: // campsite
      body = (
        <>
          <polygon points="8,56 32,20 56,56" fill="#c9b27a" />
          <polygon points="20,56 32,34 44,56" fill="#8f7d55" />
          <rect x={30} y={18} width={4} height={4} fill={WOOD} />
          <rect x={48} y={50} width={10} height={4} fill={WOOD} />
          <rect x={51} y={44} width={4} height={6} fill="#f97316" />
          <rect x={52} y={40} width={2} height={4} fill={GOLD} />
        </>
      );
  }
  return (
    <Frame figure="castle" id={tier}>
      {body}
      <rect x={4} y={56} width={56} height={4} fill="#24492e" />
    </Frame>
  );
}

export function BuildingFigure({ id }: { id: string }) {
  let body: React.ReactNode;
  switch (id) {
    case "well":
      body = (
        <>
          <rect x={20} y={22} width={4} height={20} fill={WOOD} />
          <rect x={40} y={22} width={4} height={20} fill={WOOD} />
          <polygon points="14,24 32,10 50,24" fill={ROOF} />
          <rect x={30} y={30} width={6} height={6} fill={STONE_DARK} />
          <rect x={18} y={40} width={28} height={16} fill="#7d7d7d" />
          <rect x={18} y={40} width={28} height={3} fill="#5c5c5c" />
          <rect x={26} y={46} width={12} height={10} fill="#1e3a8a" />
        </>
      );
      break;
    case "mill":
      body = (
        <>
          <rect x={22} y={30} width={20} height={26} fill="#b08a5a" />
          <polygon points="18,32 32,20 46,32" fill={ROOF} />
          <rect x={30} y={4} width={4} height={26} fill={PLASTER} />
          <rect x={12} y={28} width={40} height={4} fill={PLASTER} />
          <rect x={18} y={6} width={14} height={4} fill={PLASTER} />
          <rect x={32} y={44} width={14} height={4} fill={PLASTER} />
          <circle cx={32} cy={30} r={3} fill={WOOD} />
          <rect x={28} y={44} width={8} height={12} fill={WOOD} />
        </>
      );
      break;
    case "bridge":
      body = (
        <>
          <rect x={4} y={36} width={56} height={12} fill="#8c7a6b" />
          <polygon points="22,48 32,40 42,48" fill="#1e3a8a" />
          <rect x={4} y={30} width={56} height={4} fill={WOOD} />
          <rect x={8} y={24} width={4} height={12} fill={WOOD} />
          <rect x={30} y={24} width={4} height={12} fill={WOOD} />
          <rect x={52} y={24} width={4} height={12} fill={WOOD} />
          <rect x={4} y={48} width={56} height={8} fill="#1e3a8a" />
        </>
      );
      break;
    case "chapel":
      body = (
        <>
          <rect x={14} y={30} width={36} height={26} fill={PLASTER} />
          <polygon points="10,32 32,16 54,32" fill={ROOF} />
          <rect x={28} y={10} width={8} height={20} fill={PLASTER} />
          <polygon points="26,12 32,2 38,12" fill={ROOF_DARK} />
          <rect x={30} y={16} width={4} height={6} fill={GOLD} />
          <rect x={28} y={42} width={8} height={14} fill={WOOD} />
          <rect x={18} y={38} width={4} height={8} fill="#3b82f6" />
          <rect x={42} y={38} width={4} height={8} fill="#3b82f6" />
        </>
      );
      break;
    case "market":
      body = (
        <>
          <rect x={8} y={26} width={48} height={8} fill={FLAG} />
          <rect x={16} y={26} width={8} height={8} fill={GOLD} />
          <rect x={32} y={26} width={8} height={8} fill={GOLD} />
          <rect x={48} y={26} width={8} height={8} fill={GOLD} />
          <rect x={10} y={34} width={4} height={22} fill={WOOD} />
          <rect x={50} y={34} width={4} height={22} fill={WOOD} />
          <rect x={12} y={40} width={40} height={16} fill="#b08a5a" />
          <rect x={16} y={34} width={8} height={6} fill="#ef4444" />
          <rect x={28} y={34} width={8} height={6} fill="#22c55e" />
          <rect x={40} y={34} width={8} height={6} fill="#f97316" />
        </>
      );
      break;
    case "library":
      body = (
        <>
          <rect x={10} y={28} width={44} height={28} fill="#6f5a8a" />
          <polygon points="6,28 32,14 58,28" fill={PLASTER} />
          <rect x={14} y={32} width={4} height={24} fill={PLASTER} />
          <rect x={46} y={32} width={4} height={24} fill={PLASTER} />
          <rect x={26} y={42} width={12} height={14} fill={WOOD} />
          <rect x={20} y={34} width={4} height={6} fill="#ef4444" />
          <rect x={24} y={34} width={4} height={6} fill="#3b82f6" />
          <rect x={36} y={34} width={4} height={6} fill="#22c55e" />
          <rect x={40} y={34} width={4} height={6} fill={GOLD} />
        </>
      );
      break;
    case "watchtower":
      body = (
        <>
          <rect x={24} y={12} width={16} height={44} fill="#7d7d7d" />
          <rect x={24} y={12} width={4} height={44} fill="#5c5c5c" />
          <Merlons x={22} y={8} width={20} color="#7d7d7d" />
          <rect x={22} y={11} width={20} height={2} fill="#5c5c5c" />
          <rect x={30} y={22} width={4} height={6} fill={GOLD} />
          <rect x={29} y={46} width={6} height={10} fill={WOOD} />
        </>
      );
      break;
    default: // garden
      body = (
        <>
          <rect x={8} y={40} width={48} height={16} fill="#5aa55a" />
          <rect x={8} y={46} width={48} height={2} fill="#3d8a4a" />
          <rect x={12} y={36} width={4} height={4} fill="#ec4899" />
          <rect x={22} y={36} width={4} height={4} fill={GOLD} />
          <rect x={32} y={36} width={4} height={4} fill="#ef4444" />
          <rect x={42} y={36} width={4} height={4} fill="#ec4899" />
          <rect x={6} y={30} width={2} height={26} fill={WOOD} />
          <rect x={56} y={30} width={2} height={26} fill={WOOD} />
          <circle cx={48} cy={24} r={8} fill={LEAF} />
          <rect x={46} y={30} width={4} height={10} fill={WOOD} />
        </>
      );
  }
  return (
    <Frame figure="building" id={id}>
      {body}
      <rect x={4} y={56} width={56} height={4} fill="#24492e" />
    </Frame>
  );
}

/** Staked dirt with a sign: the site a hero is still raising. Drawn flat on the ground. */
export function FoundationFigure() {
  return (
    <Frame figure="foundation">
      <rect x={4} y={20} width={56} height={36} fill="#6b665a" />
      <rect x={8} y={24} width={48} height={28} fill="#7a7464" />
      <rect x={4} y={18} width={4} height={8} fill={WOOD} />
      <rect x={56} y={18} width={4} height={8} fill={WOOD} />
      <rect x={4} y={50} width={4} height={8} fill={WOOD} />
      <rect x={56} y={50} width={4} height={8} fill={WOOD} />
      <rect x={26} y={8} width={12} height={8} fill={PLASTER} />
      <rect x={31} y={16} width={2} height={6} fill={WOOD} />
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
          <polygon points="32,18 8,50 56,50" fill={PINE} />
          <polygon points="32,4 14,34 50,34" fill={LEAF} />
        </>
      );
      break;
    case "bush":
      body = (
        <>
          <ellipse cx={32} cy={46} rx={20} ry={12} fill="#3d8a4a" />
          <ellipse cx={26} cy={42} rx={8} ry={6} fill={LEAF_LIGHT} />
          <rect x={38} y={40} width={3} height={3} fill="#ec4899" />
        </>
      );
      break;
    case "rock":
      body = (
        <>
          <polygon points="10,54 20,34 40,30 56,50 50,58 14,58" fill="#7d7d7d" />
          <polygon points="22,38 38,34 44,44 26,46" fill="#9a9aa8" />
          <rect x={14} y={56} width={40} height={2} fill="#5c5c5c" />
        </>
      );
      break;
    case "fence":
      body = (
        <>
          <rect x={4} y={30} width={56} height={4} fill="#a07b4a" />
          <rect x={4} y={42} width={56} height={4} fill="#a07b4a" />
          <rect x={8} y={22} width={6} height={34} fill={WOOD} />
          <rect x={30} y={22} width={6} height={34} fill={WOOD} />
          <rect x={52} y={22} width={6} height={34} fill={WOOD} />
        </>
      );
      break;
    case "lantern":
      body = (
        <>
          <rect x={30} y={20} width={4} height={38} fill={WOOD} />
          <rect x={24} y={8} width={16} height={14} fill={STONE_DARK} />
          <rect x={27} y={11} width={10} height={8} fill={GOLD} />
          <rect x={24} y={56} width={16} height={4} fill={STONE_DARK} />
        </>
      );
      break;
    default: // oak
      body = (
        <>
          <rect x={29} y={40} width={6} height={18} fill={WOOD} />
          <circle cx={22} cy={32} r={10} fill={LEAF} />
          <circle cx={42} cy={32} r={10} fill={LEAF} />
          <circle cx={32} cy={24} r={14} fill={LEAF_LIGHT} />
          <circle cx={28} cy={20} r={4} fill="#7cc27c" />
        </>
      );
  }
  return <Frame figure="decor" id={kind}>{body}</Frame>;
}
