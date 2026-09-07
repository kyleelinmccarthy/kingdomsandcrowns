import type { TroubleKind, TroubleSkin } from "@/lib/realm/spells/troubles";

export const TROUBLE_KINDS: TroubleKind[] = ["fog", "cursed-stone", "shadow-blob"];

function Fog() {
  return (
    <g fill="#cbd5e1" opacity="0.85">
      <ellipse cx="12" cy="30" rx="9" ry="6" />
      <ellipse cx="22" cy="26" rx="10" ry="7" />
      <ellipse cx="18" cy="34" rx="12" ry="6" />
    </g>
  );
}
function MistWisp() {
  return (
    <g>
      <path d="M8 40 Q4 22 18 14 Q32 22 28 40 L24 36 L20 40 L16 36 L12 40 Z" fill="#e2e8f0" />
      <circle cx="14" cy="24" r="2" fill="#1e293b" />
      <circle cx="22" cy="24" r="2" fill="#1e293b" />
      <path d="M13 31 Q18 34 23 31" stroke="#1e293b" strokeWidth="1.5" fill="none" />
    </g>
  );
}
function CursedStone() {
  return (
    <g>
      <path d="M6 40 L10 20 L20 14 L30 22 L30 40 Z" fill="#6b7280" />
      <path d="M16 20 L19 28 L15 33 L20 40" stroke="#7c3aed" strokeWidth="1.5" fill="none" />
      <path d="M24 24 L22 31 L26 36" stroke="#7c3aed" strokeWidth="1.5" fill="none" />
    </g>
  );
}
function Gargoyle() {
  return (
    <g>
      <path d="M4 22 L12 26 L10 14 Z" fill="#9ca3af" />
      <path d="M32 22 L24 26 L26 14 Z" fill="#9ca3af" />
      <rect x="11" y="18" width="14" height="22" rx="4" fill="#6b7280" />
      <circle cx="15" cy="26" r="2" fill="#fbbf24" />
      <circle cx="21" cy="26" r="2" fill="#fbbf24" />
      <path d="M13 34 L23 34" stroke="#374151" strokeWidth="2" />
    </g>
  );
}
function Shadow() {
  return (
    <g>
      <ellipse cx="18" cy="30" rx="12" ry="10" fill="#312e81" opacity="0.9" />
      <circle cx="14" cy="28" r="2.2" fill="#c7d2fe" />
      <circle cx="22" cy="28" r="2.2" fill="#c7d2fe" />
    </g>
  );
}
function Blob() {
  return (
    <g>
      <path d="M6 38 Q6 18 18 16 Q30 18 30 38 Z" fill="#22c55e" />
      <circle cx="14" cy="27" r="2.5" fill="#052e16" />
      <circle cx="22" cy="27" r="2.5" fill="#052e16" />
      <path d="M12 33 L15 36 L18 33 L21 36 L24 33" stroke="#052e16" strokeWidth="1.5" fill="none" />
    </g>
  );
}

const FIGURES: Record<TroubleKind, Record<TroubleSkin, () => React.JSX.Element>> = {
  fog: { gentle: Fog, monsters: MistWisp },
  "cursed-stone": { gentle: CursedStone, monsters: Gargoyle },
  "shadow-blob": { gentle: Shadow, monsters: Blob },
};

/** A trouble drawn in the hero's tone, on the same 36×48 canvas as every other Realm sprite. */
export function TroubleFigure({ kind, skin, size = 96 }: { kind: TroubleKind; skin: TroubleSkin; size?: number }) {
  const Figure = FIGURES[kind][skin];
  return (
    <svg width={size} height={size} viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" style={{ imageRendering: "pixelated" }} aria-hidden="true" data-figure="trouble" data-figure-id={`${kind}:${skin}`}>
      <Figure />
    </svg>
  );
}
