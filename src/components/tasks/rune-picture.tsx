/**
 * What needs the rune, as a picture (R-I11, RI-d): one small drawing per effect, in a broken and a
 * mended form. It is how the stone shows the effect, never as text: at the youngest bands a word
 * can be its effect's own name ("mend", "light"), so printing the effect would hand the word over.
 * The drawing is decorative (`aria-hidden`); the object's label beside it is what a screen reader
 * hears. Nothing in its markup names the effect or the word: no class, id or title.
 */
import type { ReactNode } from "react";
import type { RuneEffect } from "@/lib/realm/rune-objects";
import "./rune.css";

const INK = "#3a2412";
const WOOD = "#9a6a3c";
const WOOD_DARK = "#6e4724";
const STONE = "#a59c8e";
const GREEN = "#5f9e45";
const GREEN_DARK = "#3f7a2e";
const DRY = "#b59a5a";
const GOLD = "#ffd75e";

const line = { stroke: INK, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function Wheel({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g {...line}>
      <circle cx={x} cy={y} r={r} fill={WOOD_DARK} />
      <path d={`M${x - r} ${y}H${x + r}M${x} ${y - r}V${y + r}`} fill="none" />
      <circle cx={x} cy={y} r={r / 4} fill={WOOD} />
    </g>
  );
}

/** Each effect's drawing, broken (`false`) or mended (`true`). */
const DRAWINGS: Readonly<Record<RuneEffect, (mended: boolean) => ReactNode>> = {
  // A cart: a wheel off and the bed tipped, then whole on two wheels.
  mend: (mended) =>
    mended ? (
      <>
        <rect x={22} y={38} width={70} height={20} rx={3} fill={WOOD} {...line} />
        <path d="M92 48 L108 44" fill="none" {...line} />
        <Wheel x={38} y={64} r={11} />
        <Wheel x={78} y={64} r={11} />
      </>
    ) : (
      <>
        <polygon points="22,44 92,32 94,52 24,64" fill={WOOD} {...line} />
        <path d="M50 38 L56 48 L52 58" fill="none" {...line} />
        <Wheel x={38} y={66} r={10} />
        <ellipse cx={92} cy={74} rx={13} ry={4} fill={WOOD_DARK} {...line} />
      </>
    ),
  // A lantern on a post: dark glass, then lit and glowing.
  light: (mended) => (
    <>
      {mended && <circle cx={60} cy={34} r={26} fill={GOLD} opacity={0.35} />}
      <rect x={57} y={46} width={6} height={32} fill={WOOD_DARK} {...line} />
      <polygon points="46,22 74,22 60,12" fill={WOOD} {...line} />
      <rect x={48} y={22} width={24} height={24} rx={2} fill={mended ? GOLD : "#3b3b4a"} {...line} />
      <path d="M60 22V46M48 34H72" fill="none" {...line} />
      {mended && <path d="M34 34H40M80 34H86M42 14L46 18M78 14L74 18" fill="none" stroke={GOLD} strokeWidth={3} strokeLinecap="round" />}
    </>
  ),
  // A flower bed: cracked earth and drooping stems, then dark earth, upright stems and flowers.
  water: (mended) =>
    mended ? (
      <>
        <rect x={18} y={58} width={84} height={16} rx={3} fill="#6b4a2b" {...line} />
        {[32, 50, 68, 86].map((x) => (
          <g key={x}>
            <path d={`M${x} 58V36`} fill="none" stroke={GREEN_DARK} strokeWidth={3} strokeLinecap="round" />
            <circle cx={x} cy={32} r={6} fill={x % 36 === 32 ? "#e86a8c" : "#f2b23a"} {...line} />
          </g>
        ))}
        <path d="M24 20 q3 -6 6 0 q-3 5 -6 0M92 16 q3 -6 6 0 q-3 5 -6 0" fill="#7cc4ef" stroke={INK} strokeWidth={1.5} />
      </>
    ) : (
      <>
        <rect x={18} y={58} width={84} height={16} rx={3} fill={DRY} {...line} />
        <path d="M30 62l6 6l-2 6M64 60l-4 7l5 5M86 62l4 5" fill="none" {...line} />
        {[32, 50, 68, 86].map((x) => (
          <path key={x} d={`M${x} 58 Q${x} 42 ${x + 10} 48`} fill="none" stroke={DRY} strokeWidth={3} strokeLinecap="round" />
        ))}
      </>
    ),
  // A hatch in a wall: boarded shut, then swung wide on a warm doorway.
  open: (mended) => (
    <>
      <rect x={20} y={14} width={80} height={64} fill={STONE} {...line} />
      <path d="M20 34H100M20 56H100M44 14V34M76 34V56M52 56V78" fill="none" stroke={INK} strokeWidth={1} opacity={0.5} />
      {mended ? (
        <>
          <rect x={44} y={30} width={32} height={48} fill={GOLD} {...line} />
          <polygon points="76,30 92,24 92,84 76,78" fill={WOOD} {...line} />
        </>
      ) : (
        <>
          <rect x={44} y={30} width={32} height={48} fill={WOOD} {...line} />
          <path d="M40 36L80 70M80 36L40 70" fill="none" stroke={WOOD_DARK} strokeWidth={6} strokeLinecap="round" />
          <rect x={56} y={50} width={8} height={10} rx={1} fill="#c8c8c8" {...line} />
        </>
      )}
    </>
  ),
  // A tree: bare and drooping over fallen leaves, then full and green.
  grow: (mended) =>
    mended ? (
      <>
        <rect x={55} y={46} width={10} height={32} fill={WOOD_DARK} {...line} />
        <circle cx={60} cy={34} r={20} fill={GREEN} {...line} />
        <circle cx={44} cy={44} r={12} fill={GREEN} {...line} />
        <circle cx={76} cy={44} r={12} fill={GREEN} {...line} />
      </>
    ) : (
      <>
        <path d="M60 78V44" fill="none" stroke={WOOD_DARK} strokeWidth={6} strokeLinecap="round" />
        <path d="M60 50 Q48 38 40 50M60 46 Q72 34 82 48M60 44 Q60 30 54 26" fill="none" stroke={WOOD_DARK} strokeWidth={3} strokeLinecap="round" />
        <ellipse cx={44} cy={78} rx={4} ry={2} fill={DRY} />
        <ellipse cx={78} cy={77} rx={4} ry={2} fill={DRY} />
      </>
    ),
};

export function RunePicture({ effect, fixed }: { effect: RuneEffect; fixed: boolean }) {
  const draw = DRAWINGS[effect];
  return (
    <svg className="rune-pic" viewBox="0 0 120 90" aria-hidden="true" focusable="false">
      <ellipse cx={60} cy={80} rx={52} ry={6} fill="#000" opacity={0.15} />
      {draw ? draw(fixed) : null}
    </svg>
  );
}
