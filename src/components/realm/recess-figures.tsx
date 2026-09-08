/** A gleam: the recess collectible. Gold four-point star with a soft core. */
export function GleamFigure({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure="gleam">
      <polygon points="18,10 21,21 32,24 21,27 18,38 15,27 4,24 15,21" fill="#fde68a" />
      <polygon points="18,16 20,22 26,24 20,26 18,32 16,26 10,24 16,22" fill="#fffbeb" />
      <circle cx="18" cy="24" r="2" fill="#fff" />
    </svg>
  );
}

/** The lap start banner at the gate. */
export function BannerFigure({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-figure="banner">
      <rect x="16" y="6" width="3" height="40" fill="#6b4226" />
      <path d="M19 8 L34 13 L19 18 Z" fill="#c0563d" />
      <path d="M19 10 L30 13 L19 16 Z" fill="#fde68a" />
      <rect x="12" y="44" width="11" height="2" fill="#4a3728" />
    </svg>
  );
}
