/** The ceremony crown, in its tier's colour. Rasterised once per crown id. */
export function CrownFigure({ id, color, size = 96 }: { id: string; color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure="crown" data-figure-id={id}>
      <rect x="6" y="26" width="24" height="9" fill={color} />
      <rect x="6" y="32" width="24" height="3" fill="#000000" opacity="0.25" />
      <polygon points="6,26 10,14 14,26" fill={color} />
      <polygon points="14,26 18,9 22,26" fill={color} />
      <polygon points="22,26 26,14 30,26" fill={color} />
      <circle cx="18" cy="25" r="2.2" fill="#fff7cc" />
      <circle cx="10" cy="28" r="1.5" fill="#fff7cc" opacity="0.8" />
      <circle cx="26" cy="28" r="1.5" fill="#fff7cc" opacity="0.8" />
    </svg>
  );
}

/** A plain white pennant; the scene tints it with a season's crown colour. */
export function CastleBannerFigure({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure="castle-banner">
      <path d="M3 10 L33 20 L3 30 Z" fill="#ffffff" />
      <path d="M3 14 L24 20 L3 26 Z" fill="#e5e7eb" />
    </svg>
  );
}
