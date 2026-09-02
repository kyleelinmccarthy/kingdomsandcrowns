import { GameIcon } from "@/components/game-icon";
import { crownById } from "@/lib/utils/crown-catalog";

const SIZE = { sm: "size-5", md: "size-8", lg: "size-12" } as const;

/** One earned crown: tier icon in its tier color, optional label. */
export function CrownBadge({
  crownId,
  size = "md",
  showLabel = false,
}: {
  crownId: string;
  size?: keyof typeof SIZE;
  showLabel?: boolean;
}) {
  const crown = crownById(crownId);
  if (!crown) return null;
  return (
    <span className="inline-flex items-center gap-2" title={crown.description}>
      {/* GameIcon takes only name and className; the tier color is inherited via currentColor. */}
      <span className="inline-flex" style={{ color: crown.color }}>
        <GameIcon name={crown.icon} className={`${SIZE[size]} drop-shadow-[0_0_6px_var(--glow-gold)]`} />
      </span>
      {showLabel && <span className="text-sm font-medium">{crown.label}</span>}
    </span>
  );
}
