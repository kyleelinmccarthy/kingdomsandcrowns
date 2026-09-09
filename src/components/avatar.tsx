import {
  type AvatarConfig,
  SKIN_TONES,
  normalizeAvatarConfig,
} from "@/lib/utils/avatar-catalog";

type AvatarProps = {
  config: AvatarConfig | null;
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
};

const SIZE_MAP = { xs: 24, sm: 32, md: 48, lg: 80, xl: 128 } as const;

export function Avatar({ config, name, size = "md", className = "" }: AvatarProps) {
  const px = SIZE_MAP[size];

  if (!config) {
    return <FallbackAvatar name={name} px={px} className={className} />;
  }

  // Normalize to fill in any missing fields (backward compat)
  const c = normalizeAvatarConfig(config as unknown as Record<string, unknown>);
  const skinHex = SKIN_TONES.find((s) => s.id === c.skinTone)?.hex ?? "#d4956b";

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 36 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ imageRendering: "pixelated" }}
      role="img"
      aria-label={`${name}'s avatar`}
    >
      <g transform="translate(0, 8)">
        <BackgroundLayer bg={c.background} bgColor={c.backgroundColor ?? "#3b82f6"} />
        <BodyLayer outfit={c.outfit} outfitColor={c.outfitColor} />
        <ArmsLayer skinHex={skinHex} />
        <LegsLayer legwear={c.legwear} legwearColor={c.legwearColor} />
        <BootsLayer boots={c.boots} color={c.bootsColor} />
        <HeadLayer skinHex={skinHex} />
        <HairLayer style={c.hairStyle} color={c.hairColor} />
        <AccessoryLayer accessory={c.accessory} color={c.accessoryColor} />
        <g transform="translate(4, 8)">
          <CompanionLayer companion={c.companion ?? null} color={c.companionColor} />
        </g>
      </g>
    </svg>
  );
}

// ── Fallback: shield with initial ────────────────────────────

function FallbackAvatar({ name, px, className }: { name: string; px: number; className: string }) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 36 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label={`${name}'s avatar`}
    >
      <path
        d="M18 4 L32 10 L32 24 Q32 38 18 44 Q4 38 4 24 L4 10 Z"
        fill="var(--color-primary, #277093)"
        opacity="0.2"
      />
      <path
        d="M18 4 L32 10 L32 24 Q32 38 18 44 Q4 38 4 24 L4 10 Z"
        fill="none"
        stroke="var(--color-primary, #277093)"
        strokeWidth="1"
      />
      <text
        x="18"
        y="28"
        textAnchor="middle"
        fontSize="16"
        fontWeight="bold"
        fill="var(--color-primary, #277093)"
        fontFamily="sans-serif"
      >
        {initial}
      </text>
    </svg>
  );
}

// ── Background shapes ────────────────────────────────────────

function BackgroundLayer({ bg, bgColor }: { bg: string; bgColor: string }) {
  const fill = bgColor + "20";
  const stroke = bgColor + "40";

  switch (bg) {
    case "circle":
      return <ellipse cx="18" cy="24" rx="17" ry="23" fill={fill} stroke={stroke} strokeWidth="0.5" />;
    case "diamond":
      return <polygon points="18,1 35,24 18,47 1,24" fill={fill} stroke={stroke} strokeWidth="0.5" />;
    case "hexagon":
      return (
        <polygon
          points="18,1 32,8 32,36 18,47 4,36 4,8"
          fill={fill}
          stroke={stroke}
          strokeWidth="0.5"
        />
      );
    case "flame": {
      const o = bgColor;
      return (
        <g>
          <ellipse cx="18" cy="24" rx="17" ry="23" fill={fill} stroke={stroke} strokeWidth="0.5" />
          {/* Outer flame */}
          <rect x="13" y="0" width="1" height="1" fill={o} opacity="0.30" />
          <rect x="22" y="2" width="1" height="1" fill={o} opacity="0.25" />
          <rect x="14" y="1" width="2" height="1" fill={o} opacity="0.32" />
          <rect x="13" y="3" width="4" height="1" fill={o} opacity="0.34" />
          <rect x="12" y="4" width="6" height="1" fill={o} opacity="0.34" />
          <rect x="11" y="6" width="8" height="1" fill={o} opacity="0.30" />
          <rect x="6" y="8" width="18" height="1" fill={o} opacity="0.28" />
          <rect x="5" y="10" width="21" height="1" fill={o} opacity="0.26" />
          <rect x="3" y="13" width="26" height="1" fill={o} opacity="0.24" />
          <rect x="3" y="16" width="26" height="1" fill={o} opacity="0.24" />
          <rect x="3" y="20" width="26" height="1" fill={o} opacity="0.22" />
          <rect x="3" y="24" width="26" height="1" fill={o} opacity="0.20" />
          <rect x="4" y="28" width="24" height="1" fill={o} opacity="0.18" />
          <rect x="5" y="32" width="22" height="1" fill={o} opacity="0.16" />
          <rect x="7" y="36" width="18" height="1" fill={o} opacity="0.14" />
          <rect x="9" y="40" width="14" height="1" fill={o} opacity="0.12" />
          <rect x="11" y="43" width="10" height="1" fill={o} opacity="0.10" />
          {/* Inner core */}
          <rect x="14" y="12" width="4" height="1" fill={o} opacity="0.40" />
          <rect x="12" y="14" width="8" height="1" fill={o} opacity="0.42" />
          <rect x="11" y="18" width="10" height="1" fill={o} opacity="0.44" />
          <rect x="12" y="22" width="8" height="1" fill={o} opacity="0.38" />
          <rect x="13" y="26" width="6" height="1" fill={o} opacity="0.30" />
        </g>
      );
    }
    case "stars":
      return (
        <g>
          <ellipse cx="18" cy="24" rx="17" ry="23" fill={fill} stroke={stroke} strokeWidth="0.5" />
          <rect x="5" y="4" width="1" height="1" fill={bgColor} opacity="0.3" />
          <rect x="28" y="8" width="1" height="1" fill={bgColor} opacity="0.25" />
          <rect x="8" y="40" width="1" height="1" fill={bgColor} opacity="0.2" />
          <rect x="26" y="38" width="1" height="1" fill={bgColor} opacity="0.3" />
          <rect x="3" y="20" width="1" height="1" fill={bgColor} opacity="0.15" />
          <rect x="31" y="18" width="1" height="1" fill={bgColor} opacity="0.2" />
          <rect x="15" y="2" width="1" height="1" fill={bgColor} opacity="0.2" />
          <rect x="10" y="44" width="1" height="1" fill={bgColor} opacity="0.15" />
        </g>
      );
    case "crescent":
      return (
        <g>
          <ellipse cx="18" cy="24" rx="17" ry="23" fill={fill} stroke={stroke} strokeWidth="0.5" />
          <ellipse cx="22" cy="12" rx="8" ry="10" fill={bgColor} opacity="0.15" />
          <ellipse cx="26" cy="14" rx="6" ry="8" fill={fill} />
        </g>
      );
    case "crown-crest":
      return (
        <g>
          <path d="M18 4 L32 10 L32 24 Q32 38 18 44 Q4 38 4 24 L4 10 Z" fill={fill} stroke={stroke} strokeWidth="0.5" />
          <rect x="12" y="6" width="12" height="3" fill={bgColor} opacity="0.25" />
          <rect x="12" y="4" width="2" height="2" fill={bgColor} opacity="0.25" />
          <rect x="17" y="3" width="2" height="3" fill={bgColor} opacity="0.25" />
          <rect x="22" y="4" width="2" height="2" fill={bgColor} opacity="0.25" />
        </g>
      );
    case "dragon-crest":
      return (
        <g>
          <path d="M18 4 L32 10 L32 24 Q32 38 18 44 Q4 38 4 24 L4 10 Z" fill={fill} stroke={stroke} strokeWidth="0.5" />
          <rect x="8" y="6" width="4" height="3" fill={bgColor} opacity="0.2" />
          <rect x="24" y="6" width="4" height="3" fill={bgColor} opacity="0.2" />
          <rect x="14" y="38" width="8" height="4" fill={bgColor} opacity="0.15" />
        </g>
      );
    case "crossed-swords":
      return (
        <g>
          <ellipse cx="18" cy="24" rx="17" ry="23" fill={fill} stroke={stroke} strokeWidth="0.5" />
          <line x1="8" y1="6" x2="28" y2="42" stroke={bgColor} strokeWidth="1" opacity="0.2" />
          <line x1="28" y1="6" x2="8" y2="42" stroke={bgColor} strokeWidth="1" opacity="0.2" />
        </g>
      );
    case "crystal":
      return (
        <polygon points="18,1 30,12 34,28 24,46 12,46 2,28 6,12" fill={fill} stroke={stroke} strokeWidth="0.5" />
      );
    case "celestial":
      return (
        <g>
          <ellipse cx="18" cy="24" rx="17" ry="23" fill={fill} stroke={stroke} strokeWidth="0.5" />
          <rect x="5" y="4" width="1" height="1" fill={bgColor} opacity="0.4" />
          <rect x="28" y="8" width="2" height="2" fill={bgColor} opacity="0.3" />
          <rect x="8" y="40" width="1" height="1" fill={bgColor} opacity="0.35" />
          <rect x="26" y="38" width="2" height="2" fill={bgColor} opacity="0.25" />
          <rect x="3" y="20" width="2" height="2" fill={bgColor} opacity="0.2" />
          <rect x="31" y="18" width="1" height="1" fill={bgColor} opacity="0.35" />
          <rect x="15" y="2" width="2" height="2" fill={bgColor} opacity="0.3" />
          <ellipse cx="18" cy="24" rx="10" ry="14" fill="none" stroke={bgColor} strokeWidth="0.3" opacity="0.2" />
        </g>
      );
    case "rainbow":
      return (
        <g>
          <ellipse cx="18" cy="24" rx="17" ry="23" fill={fill} stroke={stroke} strokeWidth="0.5" />
          <rect x="4" y="8" width="28" height="2" fill="#ef4444" opacity="0.12" />
          <rect x="4" y="14" width="28" height="2" fill="#f97316" opacity="0.12" />
          <rect x="4" y="20" width="28" height="2" fill="#eab308" opacity="0.12" />
          <rect x="4" y="26" width="28" height="2" fill="#22c55e" opacity="0.12" />
          <rect x="4" y="32" width="28" height="2" fill="#3b82f6" opacity="0.12" />
          <rect x="4" y="38" width="28" height="2" fill="#8b5cf6" opacity="0.12" />
        </g>
      );
    case "castle":
      return (
        <g>
          <path d="M18 4 L32 10 L32 24 Q32 38 18 44 Q4 38 4 24 L4 10 Z" fill={fill} stroke={stroke} strokeWidth="0.5" />
          <rect x="10" y="34" width="16" height="8" fill={bgColor} opacity="0.12" />
          <rect x="10" y="32" width="3" height="2" fill={bgColor} opacity="0.12" />
          <rect x="16" y="32" width="3" height="2" fill={bgColor} opacity="0.12" />
          <rect x="23" y="32" width="3" height="2" fill={bgColor} opacity="0.12" />
          <rect x="15" y="38" width="6" height="4" fill={bgColor} opacity="0.15" />
        </g>
      );
    case "enchanted-forest":
      return (
        <g>
          <ellipse cx="18" cy="24" rx="17" ry="23" fill={fill} stroke={stroke} strokeWidth="0.5" />
          <rect x="8" y="32" width="2" height="12" fill={bgColor} opacity="0.15" />
          <rect x="6" y="28" width="6" height="4" fill={bgColor} opacity="0.1" />
          <rect x="26" y="30" width="2" height="14" fill={bgColor} opacity="0.15" />
          <rect x="24" y="26" width="6" height="4" fill={bgColor} opacity="0.1" />
          <rect x="16" y="36" width="2" height="8" fill={bgColor} opacity="0.12" />
          <rect x="14" y="32" width="6" height="4" fill={bgColor} opacity="0.08" />
        </g>
      );
    default: // shield
      return (
        <path
          d="M18 4 L32 10 L32 24 Q32 38 18 44 Q4 38 4 24 L4 10 Z"
          fill={fill}
          stroke={stroke}
          strokeWidth="0.5"
        />
      );
  }
}

// ── Body / outfit ────────────────────────────────────────────

function BodyLayer({ outfit, outfitColor }: { outfit: string; outfitColor: string }) {
  const darker = darken(outfitColor, 0.2);

  switch (outfit) {
    case "robe":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill={outfitColor} />
          <rect x="9" y="21" width="1" height="7" fill={outfitColor} />
          <rect x="22" y="21" width="1" height="7" fill={outfitColor} />
          <rect x="13" y="19" width="6" height="2" fill={darker} />
          <rect x="15" y="21" width="2" height="7" fill={darker} />
        </g>
      );
    case "vest":
      return (
        <g>
          <rect x="11" y="19" width="10" height="9" fill={outfitColor} />
          <rect x="11" y="19" width="3" height="9" fill={darker} />
          <rect x="18" y="19" width="3" height="9" fill={darker} />
        </g>
      );
    case "armor":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill="#8a8a8a" />
          <rect x="12" y="20" width="8" height="5" fill="#a0a0a0" />
          <rect x="10" y="26" width="12" height="2" fill={outfitColor} />
          <rect x="9" y="18" width="3" height="3" fill="#a0a0a0" />
          <rect x="20" y="18" width="3" height="3" fill="#a0a0a0" />
          <rect x="15" y="22" width="2" height="2" fill={outfitColor} />
        </g>
      );
    case "cloak":
      return (
        <g>
          <rect x="8" y="18" width="16" height="10" fill={darker} />
          <rect x="11" y="19" width="10" height="9" fill={outfitColor} />
          <rect x="15" y="18" width="2" height="2" fill="#d4a843" />
          <rect x="8" y="18" width="2" height="10" fill={outfitColor} opacity="0.5" />
          <rect x="22" y="18" width="2" height="10" fill={outfitColor} opacity="0.5" />
        </g>
      );
    case "cape":
      return (
        <g>
          <rect x="7" y="18" width="18" height="10" fill={outfitColor} />
          <rect x="11" y="19" width="10" height="9" fill={darker} />
          <rect x="14" y="18" width="4" height="2" fill="#d4a843" />
          <rect x="15" y="17" width="2" height="1" fill="#d4a843" />
        </g>
      );
    case "chain-mail":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill="#9a9a9a" />
          {/* Chain pattern */}
          <rect x="12" y="20" width="1" height="1" fill="#b0b0b0" />
          <rect x="14" y="20" width="1" height="1" fill="#b0b0b0" />
          <rect x="16" y="20" width="1" height="1" fill="#b0b0b0" />
          <rect x="18" y="20" width="1" height="1" fill="#b0b0b0" />
          <rect x="13" y="22" width="1" height="1" fill="#b0b0b0" />
          <rect x="15" y="22" width="1" height="1" fill="#b0b0b0" />
          <rect x="17" y="22" width="1" height="1" fill="#b0b0b0" />
          <rect x="12" y="24" width="1" height="1" fill="#b0b0b0" />
          <rect x="14" y="24" width="1" height="1" fill="#b0b0b0" />
          <rect x="16" y="24" width="1" height="1" fill="#b0b0b0" />
          <rect x="18" y="24" width="1" height="1" fill="#b0b0b0" />
          <rect x="10" y="26" width="12" height="2" fill={outfitColor} />
        </g>
      );
    case "ranger-coat":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill={outfitColor} />
          <rect x="9" y="19" width="2" height="9" fill={darker} />
          <rect x="21" y="19" width="2" height="9" fill={darker} />
          <rect x="14" y="19" width="4" height="1" fill={darker} />
          <rect x="11" y="25" width="10" height="2" fill="#8a6642" />
          {/* Buckle */}
          <rect x="15" y="25" width="2" height="2" fill="#d4a843" />
        </g>
      );
    case "knight-plate":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill="#a0a0a0" />
          <rect x="9" y="18" width="4" height="3" fill="#b0b0b0" />
          <rect x="19" y="18" width="4" height="3" fill="#b0b0b0" />
          <rect x="12" y="20" width="8" height="6" fill="#c0c0c0" />
          <rect x="14" y="21" width="4" height="3" fill={outfitColor} />
          <rect x="10" y="26" width="12" height="2" fill="#808080" />
        </g>
      );
    case "battle-dress":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill={outfitColor} />
          <rect x="12" y="19" width="8" height="3" fill={darker} />
          <rect x="14" y="19" width="4" height="1" fill="#d4a843" />
          <rect x="9" y="25" width="14" height="3" fill={outfitColor} />
          <rect x="8" y="27" width="16" height="1" fill={darker} />
        </g>
      );
    case "shadow-cloak":
      return (
        <g>
          <rect x="7" y="18" width="18" height="10" fill="#1a1a2e" />
          <rect x="11" y="19" width="10" height="9" fill="#2a2a3e" />
          <rect x="15" y="18" width="2" height="2" fill="#4a4a6e" />
          <rect x="8" y="22" width="2" height="6" fill="#1a1a2e" opacity="0.8" />
          <rect x="22" y="22" width="2" height="6" fill="#1a1a2e" opacity="0.8" />
        </g>
      );
    case "paladin-armor":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill="#f0f0f0" />
          <rect x="9" y="18" width="4" height="3" fill="#e0e0e0" />
          <rect x="19" y="18" width="4" height="3" fill="#e0e0e0" />
          <rect x="13" y="20" width="6" height="5" fill="#d4a843" opacity="0.3" />
          <rect x="15" y="21" width="2" height="3" fill="#d4a843" />
          <rect x="14" y="22" width="4" height="1" fill="#d4a843" />
          <rect x="10" y="26" width="12" height="2" fill="#d4a843" />
        </g>
      );
    case "mystic-robes":
      return (
        <g>
          <rect x="9" y="19" width="14" height="9" fill={outfitColor} />
          <rect x="8" y="20" width="1" height="8" fill={outfitColor} />
          <rect x="23" y="20" width="1" height="8" fill={outfitColor} />
          <rect x="13" y="19" width="6" height="2" fill={darker} />
          <rect x="15" y="21" width="2" height="7" fill={darker} />
          {/* Mystic runes */}
          <rect x="11" y="23" width="1" height="1" fill="#d4a843" opacity="0.6" />
          <rect x="20" y="23" width="1" height="1" fill="#d4a843" opacity="0.6" />
          <rect x="15" y="25" width="2" height="1" fill="#d4a843" opacity="0.4" />
        </g>
      );
    case "dragonscale":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill="#cc3333" />
          <rect x="9" y="18" width="3" height="3" fill="#aa2222" />
          <rect x="20" y="18" width="3" height="3" fill="#aa2222" />
          {/* Scale pattern */}
          <rect x="12" y="20" width="2" height="2" fill="#dd4444" />
          <rect x="15" y="20" width="2" height="2" fill="#dd4444" />
          <rect x="18" y="20" width="2" height="2" fill="#dd4444" />
          <rect x="13" y="23" width="2" height="2" fill="#dd4444" />
          <rect x="16" y="23" width="2" height="2" fill="#dd4444" />
          <rect x="10" y="26" width="12" height="2" fill="#d4a843" />
        </g>
      );
    case "phoenix-armor":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill="#ff6622" />
          <rect x="9" y="18" width="3" height="3" fill="#ff8833" />
          <rect x="20" y="18" width="3" height="3" fill="#ff8833" />
          <rect x="14" y="20" width="4" height="4" fill="#ffcc00" opacity="0.5" />
          <rect x="15" y="21" width="2" height="2" fill="#ffcc00" />
          <rect x="10" y="26" width="12" height="2" fill="#d4a843" />
        </g>
      );
    case "archmage-vestments":
      return (
        <g>
          <rect x="9" y="19" width="14" height="9" fill={outfitColor} />
          <rect x="8" y="20" width="1" height="8" fill={darker} />
          <rect x="23" y="20" width="1" height="8" fill={darker} />
          <rect x="13" y="19" width="6" height="2" fill="#d4a843" />
          <rect x="11" y="22" width="1" height="1" fill="#8b5cf6" opacity="0.8" />
          <rect x="14" y="24" width="1" height="1" fill="#3b82f6" opacity="0.8" />
          <rect x="17" y="22" width="1" height="1" fill="#ec4899" opacity="0.8" />
          <rect x="20" y="24" width="1" height="1" fill="#22c55e" opacity="0.8" />
        </g>
      );
    case "celestial-raiment":
      return (
        <g>
          <rect x="9" y="19" width="14" height="9" fill="#f0f0ff" />
          <rect x="8" y="20" width="1" height="8" fill="#e0e0ff" />
          <rect x="23" y="20" width="1" height="8" fill="#e0e0ff" />
          <rect x="13" y="19" width="6" height="2" fill="#d4a843" />
          <rect x="15" y="21" width="2" height="7" fill="#d0d0ff" />
          {/* Star accents */}
          <rect x="11" y="22" width="1" height="1" fill="#ffd700" opacity="0.6" />
          <rect x="19" y="21" width="1" height="1" fill="#ffd700" opacity="0.6" />
          <rect x="13" y="25" width="1" height="1" fill="#ffd700" opacity="0.5" />
          <rect x="18" y="24" width="1" height="1" fill="#ffd700" opacity="0.5" />
        </g>
      );
    case "titans-plate":
      return (
        <g>
          <rect x="9" y="19" width="14" height="9" fill="#707080" />
          <rect x="8" y="18" width="4" height="3" fill="#808090" />
          <rect x="20" y="18" width="4" height="3" fill="#808090" />
          <rect x="12" y="20" width="8" height="5" fill="#909098" />
          <rect x="14" y="21" width="4" height="3" fill="#ffd700" />
          <rect x="9" y="26" width="14" height="2" fill="#ffd700" opacity="0.6" />
        </g>
      );
    case "royal-garb":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill={outfitColor} />
          <rect x="13" y="19" width="6" height="2" fill="#d4a843" />
          <rect x="15" y="21" width="2" height="7" fill="#d4a843" opacity="0.3" />
          <rect x="10" y="26" width="12" height="2" fill="#d4a843" />
          <rect x="9" y="19" width="1" height="9" fill="#d4a843" opacity="0.4" />
          <rect x="22" y="19" width="1" height="9" fill="#d4a843" opacity="0.4" />
        </g>
      );
    case "wizard-robes":
      return (
        <g>
          <rect x="9" y="19" width="14" height="9" fill="#4a1a8a" />
          <rect x="8" y="20" width="1" height="8" fill="#3a0a7a" />
          <rect x="23" y="20" width="1" height="8" fill="#3a0a7a" />
          <rect x="13" y="19" width="6" height="2" fill="#6a3aaa" />
          <rect x="15" y="21" width="2" height="7" fill="#5a2a9a" />
          <rect x="15" y="23" width="2" height="1" fill="#ffd700" opacity="0.6" />
        </g>
      );
    case "nature-weave":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill="#2d5a1e" />
          <rect x="12" y="20" width="2" height="2" fill="#3d7a2e" />
          <rect x="18" y="21" width="2" height="2" fill="#3d7a2e" />
          <rect x="14" y="24" width="2" height="2" fill="#3d7a2e" />
          <rect x="14" y="19" width="4" height="1" fill="#4d8a3e" />
          <rect x="10" y="26" width="12" height="2" fill="#8a6642" />
        </g>
      );
    case "frost-mail":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill="#a0d0e8" />
          <rect x="9" y="18" width="3" height="3" fill="#b0e0f8" />
          <rect x="20" y="18" width="3" height="3" fill="#b0e0f8" />
          <rect x="12" y="20" width="8" height="5" fill="#c0e8ff" />
          <rect x="15" y="22" width="2" height="2" fill="#ffffff" opacity="0.6" />
          <rect x="10" y="26" width="12" height="2" fill="#80b0c8" />
        </g>
      );
    case "inferno-plate":
      return (
        <g>
          <rect x="10" y="19" width="12" height="9" fill="#8b0000" />
          <rect x="9" y="18" width="3" height="3" fill="#a01010" />
          <rect x="20" y="18" width="3" height="3" fill="#a01010" />
          <rect x="12" y="20" width="8" height="5" fill="#b02020" />
          <rect x="15" y="21" width="2" height="2" fill="#ff4400" />
          <rect x="14" y="23" width="4" height="1" fill="#ff6600" opacity="0.5" />
          <rect x="10" y="26" width="12" height="2" fill="#ff4400" opacity="0.4" />
        </g>
      );
    default: // tunic
      return (
        <g>
          <rect x="11" y="19" width="10" height="9" fill={outfitColor} />
          <rect x="11" y="25" width="10" height="2" fill={darker} />
          <rect x="14" y="19" width="4" height="1" fill={darker} />
        </g>
      );
  }
}

// ── Arms ─────────────────────────────────────────────────

function ArmsLayer({ skinHex }: { skinHex: string }) {
  const darker = darken(skinHex, 0.1);
  return (
    <g>
      <rect x="7" y="20" width="3" height="6" fill={skinHex} />
      <rect x="7" y="26" width="3" height="2" fill={darker} />
      <rect x="22" y="20" width="3" height="6" fill={skinHex} />
      <rect x="22" y="26" width="3" height="2" fill={darker} />
    </g>
  );
}

// ── Legs / legwear ──────────────────────────────────────────

function LegsLayer({ legwear, legwearColor }: { legwear: string; legwearColor: string }) {
  const darker = darken(legwearColor, 0.15);

  switch (legwear) {
    case "shorts":
      return (
        <g>
          <rect x="12" y="28" width="4" height="4" fill={legwearColor} />
          <rect x="16" y="28" width="4" height="4" fill={legwearColor} />
          <rect x="15" y="28" width="2" height="1" fill={darker} />
        </g>
      );
    case "skirt":
      return (
        <g>
          <rect x="10" y="28" width="12" height="5" fill={legwearColor} />
          <rect x="9" y="30" width="14" height="3" fill={legwearColor} />
          <rect x="15" y="28" width="2" height="1" fill={darker} />
          <rect x="10" y="32" width="12" height="1" fill={darker} />
        </g>
      );
    case "leather-pants":
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill="#6b4226" />
          <rect x="16" y="28" width="4" height="8" fill="#6b4226" />
          <rect x="15" y="28" width="2" height="1" fill="#5a3520" />
          <rect x="12" y="31" width="4" height="1" fill="#7c5236" />
          <rect x="16" y="31" width="4" height="1" fill="#7c5236" />
        </g>
      );
    case "armored-leggings":
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill="#8a8a8a" />
          <rect x="16" y="28" width="4" height="8" fill="#8a8a8a" />
          <rect x="15" y="28" width="2" height="1" fill="#707070" />
          <rect x="13" y="30" width="2" height="2" fill="#a0a0a0" />
          <rect x="17" y="30" width="2" height="2" fill="#a0a0a0" />
          <rect x="13" y="33" width="2" height="2" fill="#a0a0a0" />
          <rect x="17" y="33" width="2" height="2" fill="#a0a0a0" />
        </g>
      );
    case "chain-leggings":
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill="#9a9a9a" />
          <rect x="16" y="28" width="4" height="8" fill="#9a9a9a" />
          <rect x="15" y="28" width="2" height="1" fill="#808080" />
          <rect x="13" y="29" width="1" height="1" fill="#b0b0b0" />
          <rect x="15" y="30" width="1" height="1" fill="#b0b0b0" />
          <rect x="13" y="31" width="1" height="1" fill="#b0b0b0" />
          <rect x="17" y="29" width="1" height="1" fill="#b0b0b0" />
          <rect x="19" y="30" width="1" height="1" fill="#b0b0b0" />
          <rect x="17" y="31" width="1" height="1" fill="#b0b0b0" />
        </g>
      );
    case "plate-greaves":
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill="#a0a0a0" />
          <rect x="16" y="28" width="4" height="8" fill="#a0a0a0" />
          <rect x="15" y="28" width="2" height="1" fill="#808080" />
          <rect x="12" y="28" width="4" height="2" fill="#c0c0c0" />
          <rect x="16" y="28" width="4" height="2" fill="#c0c0c0" />
          <rect x="12" y="34" width="4" height="2" fill="#c0c0c0" />
          <rect x="16" y="34" width="4" height="2" fill="#c0c0c0" />
        </g>
      );
    case "ranger-leggings":
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill="#5a4a2a" />
          <rect x="16" y="28" width="4" height="8" fill="#5a4a2a" />
          <rect x="15" y="28" width="2" height="1" fill="#4a3a1a" />
          <rect x="12" y="33" width="4" height="1" fill="#7a6a4a" />
          <rect x="16" y="33" width="4" height="1" fill="#7a6a4a" />
          <rect x="14" y="35" width="1" height="1" fill="#7a6a4a" />
          <rect x="17" y="35" width="1" height="1" fill="#7a6a4a" />
        </g>
      );
    case "shadow-pants":
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill="#1a1a2e" />
          <rect x="16" y="28" width="4" height="8" fill="#1a1a2e" />
          <rect x="15" y="28" width="2" height="1" fill="#0a0a1e" />
          <rect x="13" y="31" width="2" height="1" fill="#2a2a4e" opacity="0.5" />
          <rect x="17" y="33" width="2" height="1" fill="#2a2a4e" opacity="0.5" />
        </g>
      );
    case "mystic-wraps":
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill={legwearColor} />
          <rect x="16" y="28" width="4" height="8" fill={legwearColor} />
          <rect x="15" y="28" width="2" height="1" fill={darker} />
          {/* Wrap bands */}
          <rect x="12" y="29" width="4" height="1" fill={darker} />
          <rect x="12" y="32" width="4" height="1" fill={darker} />
          <rect x="16" y="30" width="4" height="1" fill={darker} />
          <rect x="16" y="33" width="4" height="1" fill={darker} />
          <rect x="14" y="30" width="1" height="1" fill="#d4a843" opacity="0.5" />
          <rect x="18" y="31" width="1" height="1" fill="#d4a843" opacity="0.5" />
        </g>
      );
    case "dragon-greaves":
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill="#cc3333" />
          <rect x="16" y="28" width="4" height="8" fill="#cc3333" />
          <rect x="15" y="28" width="2" height="1" fill="#aa2222" />
          <rect x="13" y="29" width="2" height="2" fill="#dd4444" />
          <rect x="13" y="32" width="2" height="2" fill="#dd4444" />
          <rect x="17" y="30" width="2" height="2" fill="#dd4444" />
          <rect x="17" y="33" width="2" height="2" fill="#dd4444" />
        </g>
      );
    case "champion-greaves":
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill="#b0b0b0" />
          <rect x="16" y="28" width="4" height="8" fill="#b0b0b0" />
          <rect x="15" y="28" width="2" height="1" fill="#909090" />
          <rect x="12" y="28" width="4" height="2" fill="#d4a843" />
          <rect x="16" y="28" width="4" height="2" fill="#d4a843" />
          <rect x="14" y="32" width="1" height="1" fill="#d4a843" />
          <rect x="17" y="32" width="1" height="1" fill="#d4a843" />
        </g>
      );
    case "celestial-leggings":
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill="#e0e0ff" />
          <rect x="16" y="28" width="4" height="8" fill="#e0e0ff" />
          <rect x="15" y="28" width="2" height="1" fill="#c0c0ee" />
          <rect x="13" y="30" width="1" height="1" fill="#ffd700" opacity="0.5" />
          <rect x="18" y="32" width="1" height="1" fill="#ffd700" opacity="0.5" />
          <rect x="14" y="34" width="1" height="1" fill="#ffd700" opacity="0.4" />
        </g>
      );
    case "titan-greaves":
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill="#707080" />
          <rect x="16" y="28" width="4" height="8" fill="#707080" />
          <rect x="15" y="28" width="2" height="1" fill="#606070" />
          <rect x="12" y="28" width="4" height="2" fill="#ffd700" opacity="0.4" />
          <rect x="16" y="28" width="4" height="2" fill="#ffd700" opacity="0.4" />
          <rect x="13" y="32" width="2" height="2" fill="#909098" />
          <rect x="17" y="32" width="2" height="2" fill="#909098" />
          <rect x="14" y="34" width="1" height="1" fill="#ffd700" opacity="0.3" />
          <rect x="17" y="34" width="1" height="1" fill="#ffd700" opacity="0.3" />
        </g>
      );
    case "royal-leggings":
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill={legwearColor} />
          <rect x="16" y="28" width="4" height="8" fill={legwearColor} />
          <rect x="15" y="28" width="2" height="1" fill={darker} />
          <rect x="12" y="28" width="4" height="1" fill="#d4a843" />
          <rect x="16" y="28" width="4" height="1" fill="#d4a843" />
          <rect x="14" y="32" width="1" height="1" fill="#d4a843" opacity="0.5" />
          <rect x="17" y="32" width="1" height="1" fill="#d4a843" opacity="0.5" />
        </g>
      );
    case "battle-kilt":
      return (
        <g>
          <rect x="10" y="28" width="12" height="6" fill={legwearColor} />
          <rect x="9" y="30" width="14" height="4" fill={legwearColor} />
          <rect x="15" y="28" width="2" height="1" fill={darker} />
          <rect x="11" y="28" width="1" height="6" fill={darker} opacity="0.3" />
          <rect x="14" y="28" width="1" height="6" fill={darker} opacity="0.3" />
          <rect x="17" y="28" width="1" height="6" fill={darker} opacity="0.3" />
          <rect x="20" y="28" width="1" height="6" fill={darker} opacity="0.3" />
        </g>
      );
    default: // pants
      return (
        <g>
          <rect x="12" y="28" width="4" height="8" fill={legwearColor} />
          <rect x="16" y="28" width="4" height="8" fill={legwearColor} />
          <rect x="15" y="28" width="2" height="1" fill={darker} />
        </g>
      );
  }
}

// ── Boots ───────────────────────────────────────────────────

function BootsLayer({ boots, color }: { boots: string; color: string }) {
  const hi = lighten(color, 0.15);
  const lo = darken(color, 0.2);
  const accent = "#d4a843"; // gold trim for fancy boots

  switch (boots) {
    case "sandals":
      return (
        <g>
          <rect x="11" y="36" width="5" height="2" fill={color} />
          <rect x="16" y="36" width="5" height="2" fill={color} />
          <rect x="12" y="36" width="1" height="1" fill={lo} />
          <rect x="17" y="36" width="1" height="1" fill={lo} />
        </g>
      );
    case "cloth-shoes":
      return (
        <g>
          <rect x="11" y="36" width="5" height="2" fill={color} />
          <rect x="16" y="36" width="5" height="2" fill={color} />
          <rect x="11" y="36" width="5" height="1" fill={hi} />
          <rect x="16" y="36" width="5" height="1" fill={hi} />
        </g>
      );
    case "iron-boots":
      return (
        <g>
          <rect x="11" y="35" width="5" height="3" fill={color} />
          <rect x="16" y="35" width="5" height="3" fill={color} />
          <rect x="11" y="35" width="5" height="1" fill={hi} />
          <rect x="16" y="35" width="5" height="1" fill={hi} />
          <rect x="11" y="37" width="5" height="1" fill={lo} />
          <rect x="16" y="37" width="5" height="1" fill={lo} />
        </g>
      );
    case "traveler-boots":
      return (
        <g>
          <rect x="11" y="34" width="5" height="4" fill={color} />
          <rect x="16" y="34" width="5" height="4" fill={color} />
          <rect x="11" y="34" width="5" height="1" fill={hi} />
          <rect x="16" y="34" width="5" height="1" fill={hi} />
          <rect x="13" y="35" width="1" height="1" fill={lo} />
          <rect x="18" y="35" width="1" height="1" fill={lo} />
        </g>
      );
    case "plated-boots":
      return (
        <g>
          <rect x="11" y="34" width="5" height="4" fill={color} />
          <rect x="16" y="34" width="5" height="4" fill={color} />
          <rect x="11" y="34" width="5" height="1" fill={hi} />
          <rect x="16" y="34" width="5" height="1" fill={hi} />
          <rect x="12" y="36" width="3" height="1" fill={lighten(color, 0.08)} />
          <rect x="17" y="36" width="3" height="1" fill={lighten(color, 0.08)} />
        </g>
      );
    case "knight-sabatons":
      return (
        <g>
          <rect x="10" y="34" width="6" height="4" fill={color} />
          <rect x="16" y="34" width="6" height="4" fill={color} />
          <rect x="10" y="34" width="6" height="1" fill={hi} />
          <rect x="16" y="34" width="6" height="1" fill={hi} />
          <rect x="10" y="37" width="6" height="1" fill={lo} />
          <rect x="16" y="37" width="6" height="1" fill={lo} />
          <rect x="13" y="35" width="1" height="1" fill={accent} />
          <rect x="19" y="35" width="1" height="1" fill={accent} />
        </g>
      );
    case "ranger-boots":
      return (
        <g>
          <rect x="11" y="33" width="5" height="5" fill={color} />
          <rect x="16" y="33" width="5" height="5" fill={color} />
          <rect x="11" y="33" width="5" height="1" fill={hi} />
          <rect x="16" y="33" width="5" height="1" fill={hi} />
          <rect x="11" y="36" width="5" height="1" fill={lo} />
          <rect x="16" y="36" width="5" height="1" fill={lo} />
        </g>
      );
    case "shadow-steps":
      return (
        <g>
          <rect x="11" y="34" width="5" height="4" fill={color} />
          <rect x="16" y="34" width="5" height="4" fill={color} />
          <rect x="11" y="34" width="5" height="1" fill={hi} />
          <rect x="16" y="34" width="5" height="1" fill={hi} />
          <rect x="13" y="36" width="1" height="1" fill={lighten(color, 0.3)} opacity="0.5" />
          <rect x="18" y="36" width="1" height="1" fill={lighten(color, 0.3)} opacity="0.5" />
        </g>
      );
    case "dragon-boots":
      return (
        <g>
          <rect x="10" y="34" width="6" height="4" fill={color} />
          <rect x="16" y="34" width="6" height="4" fill={color} />
          <rect x="10" y="34" width="6" height="1" fill={hi} />
          <rect x="16" y="34" width="6" height="1" fill={hi} />
          <rect x="10" y="37" width="6" height="1" fill={lo} />
          <rect x="16" y="37" width="6" height="1" fill={lo} />
          <rect x="10" y="36" width="1" height="1" fill={accent} />
          <rect x="21" y="36" width="1" height="1" fill={accent} />
        </g>
      );
    case "arcane-slippers":
      return (
        <g>
          <rect x="11" y="35" width="5" height="3" fill={color} />
          <rect x="16" y="35" width="5" height="3" fill={color} />
          <rect x="11" y="35" width="5" height="1" fill={hi} />
          <rect x="16" y="35" width="5" height="1" fill={hi} />
          <rect x="13" y="36" width="1" height="1" fill="#ffd700" opacity="0.5" />
          <rect x="18" y="36" width="1" height="1" fill="#ffd700" opacity="0.5" />
        </g>
      );
    case "celestial-boots":
      return (
        <g>
          <rect x="10" y="34" width="6" height="4" fill={color} />
          <rect x="16" y="34" width="6" height="4" fill={color} />
          <rect x="10" y="34" width="6" height="1" fill={hi} />
          <rect x="16" y="34" width="6" height="1" fill={hi} />
          <rect x="12" y="36" width="1" height="1" fill="#ffd700" opacity="0.5" />
          <rect x="19" y="36" width="1" height="1" fill="#ffd700" opacity="0.5" />
        </g>
      );
    case "titan-boots":
      return (
        <g>
          <rect x="10" y="33" width="6" height="5" fill={color} />
          <rect x="16" y="33" width="6" height="5" fill={color} />
          <rect x="10" y="33" width="6" height="1" fill={hi} />
          <rect x="16" y="33" width="6" height="1" fill={hi} />
          <rect x="10" y="37" width="6" height="1" fill="#ffd700" opacity="0.4" />
          <rect x="16" y="37" width="6" height="1" fill="#ffd700" opacity="0.4" />
          <rect x="13" y="35" width="1" height="1" fill="#ffd700" opacity="0.3" />
          <rect x="19" y="35" width="1" height="1" fill="#ffd700" opacity="0.3" />
        </g>
      );
    case "winged-boots":
      return (
        <g>
          <rect x="11" y="34" width="5" height="4" fill={color} />
          <rect x="16" y="34" width="5" height="4" fill={color} />
          <rect x="11" y="34" width="5" height="1" fill={hi} />
          <rect x="16" y="34" width="5" height="1" fill={hi} />
          {/* Wings */}
          <rect x="9" y="33" width="2" height="2" fill={hi} opacity="0.7" />
          <rect x="8" y="32" width="1" height="2" fill={hi} opacity="0.5" />
          <rect x="21" y="33" width="2" height="2" fill={hi} opacity="0.7" />
          <rect x="23" y="32" width="1" height="2" fill={hi} opacity="0.5" />
        </g>
      );
    case "royal-boots":
      return (
        <g>
          <rect x="10" y="34" width="6" height="4" fill={color} />
          <rect x="16" y="34" width="6" height="4" fill={color} />
          <rect x="10" y="34" width="6" height="1" fill={hi} />
          <rect x="16" y="34" width="6" height="1" fill={hi} />
          <rect x="12" y="35" width="2" height="1" fill={accent} />
          <rect x="18" y="35" width="2" height="1" fill={accent} />
        </g>
      );
    default: // leather-boots
      return (
        <g>
          <rect x="11" y="35" width="5" height="3" fill={color} />
          <rect x="16" y="35" width="5" height="3" fill={color} />
          <rect x="11" y="35" width="5" height="1" fill={hi} />
          <rect x="16" y="35" width="5" height="1" fill={hi} />
        </g>
      );
  }
}

// ── Head ─────────────────────────────────────────────────────

function HeadLayer({ skinHex }: { skinHex: string }) {
  const darker = darken(skinHex, 0.1);
  return (
    <g>
      <rect x="11" y="8" width="10" height="10" fill={skinHex} />
      <rect x="14" y="18" width="4" height="2" fill={skinHex} />
      <rect x="13" y="12" width="2" height="2" fill="#1a1a2e" />
      <rect x="17" y="12" width="2" height="2" fill="#1a1a2e" />
      <rect x="13" y="12" width="1" height="1" fill="#ffffff" opacity="0.6" />
      <rect x="17" y="12" width="1" height="1" fill="#ffffff" opacity="0.6" />
      <rect x="14" y="15" width="4" height="1" fill={darker} />
      <rect x="10" y="11" width="1" height="3" fill={darker} />
      <rect x="21" y="11" width="1" height="3" fill={darker} />
    </g>
  );
}

// ── Hair styles ──────────────────────────────────────────────

function HairLayer({ style, color }: { style: string; color: string }) {
  const lighter = lighten(color, 0.15);

  switch (style) {
    case "long":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="9" y="8" width="2" height="20" fill={color} />
          <rect x="21" y="8" width="2" height="20" fill={color} />
          <rect x="9" y="27" width="2" height="2" fill={color} />
          <rect x="21" y="27" width="2" height="2" fill={color} />
          <rect x="13" y="6" width="2" height="1" fill={lighter} />
        </g>
      );
    case "cropped":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="9" y="8" width="2" height="7" fill={color} />
          <rect x="21" y="8" width="2" height="7" fill={color} />
          <rect x="9" y="14" width="3" height="2" fill={color} />
          <rect x="20" y="14" width="3" height="2" fill={color} />
          <rect x="11" y="6" width="3" height="1" fill={lighter} />
        </g>
      );
    case "shag":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="9" y="8" width="2" height="12" fill={color} />
          <rect x="21" y="8" width="2" height="12" fill={color} />
          <rect x="11" y="5" width="4" height="2" fill={color} />
          <rect x="17" y="5" width="4" height="2" fill={color} />
          <rect x="14" y="6" width="2" height="1" fill={lighter} />
        </g>
      );
    case "spiky":
      return (
        <g>
          <rect x="10" y="7" width="12" height="3" fill={color} />
          <rect x="11" y="5" width="2" height="2" fill={color} />
          <rect x="14" y="4" width="2" height="3" fill={color} />
          <rect x="17" y="3" width="2" height="4" fill={color} />
          <rect x="20" y="5" width="2" height="2" fill={color} />
          <rect x="15" y="4" width="1" height="1" fill={lighter} />
          <rect x="18" y="3" width="1" height="1" fill={lighter} />
        </g>
      );
    case "curly":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="9" y="8" width="2" height="4" fill={color} />
          <rect x="21" y="8" width="2" height="4" fill={color} />
          <rect x="10" y="12" width="2" height="2" fill={color} />
          <rect x="20" y="12" width="2" height="2" fill={color} />
          <rect x="12" y="5" width="2" height="2" fill={color} />
          <rect x="18" y="5" width="2" height="2" fill={color} />
          <rect x="14" y="6" width="1" height="1" fill={lighter} />
        </g>
      );
    case "braided":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="9" y="8" width="2" height="3" fill={color} />
          <rect x="8" y="11" width="2" height="2" fill={color} />
          <rect x="9" y="13" width="2" height="2" fill={color} />
          <rect x="8" y="15" width="2" height="2" fill={color} />
          <rect x="21" y="8" width="2" height="3" fill={color} />
          <rect x="22" y="11" width="2" height="2" fill={color} />
          <rect x="21" y="13" width="2" height="2" fill={color} />
          <rect x="22" y="15" width="2" height="2" fill={color} />
          <rect x="14" y="6" width="3" height="1" fill={lighter} />
        </g>
      );
    case "mohawk":
      return (
        <g>
          <rect x="10" y="8" width="12" height="2" fill={color} />
          <rect x="14" y="2" width="4" height="2" fill={color} />
          <rect x="14" y="4" width="4" height="2" fill={color} />
          <rect x="13" y="6" width="6" height="2" fill={color} />
          <rect x="15" y="2" width="1" height="1" fill={lighter} />
          <rect x="15" y="5" width="1" height="1" fill={lighter} />
        </g>
      );
    case "ponytail":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="21" y="7" width="2" height="3" fill={color} />
          <rect x="23" y="9" width="2" height="3" fill={color} />
          <rect x="24" y="12" width="2" height="3" fill={color} />
          <rect x="23" y="15" width="2" height="2" fill={color} />
          <rect x="14" y="6" width="2" height="1" fill={lighter} />
        </g>
      );
    case "bun":
      return (
        <g>
          <rect x="10" y="7" width="12" height="3" fill={color} />
          <rect x="13" y="3" width="6" height="2" fill={color} />
          <rect x="14" y="2" width="4" height="1" fill={color} />
          <rect x="14" y="5" width="4" height="2" fill={color} />
          <rect x="15" y="3" width="2" height="1" fill={lighter} />
        </g>
      );
    case "wavy":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="9" y="8" width="2" height="6" fill={color} />
          <rect x="21" y="8" width="2" height="6" fill={color} />
          <rect x="9" y="14" width="1" height="2" fill={color} />
          <rect x="22" y="14" width="1" height="2" fill={color} />
          <rect x="14" y="6" width="2" height="1" fill={lighter} />
        </g>
      );
    case "pigtails":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="8" y="8" width="3" height="3" fill={color} />
          <rect x="7" y="10" width="3" height="4" fill={color} />
          <rect x="8" y="14" width="2" height="2" fill={color} />
          <rect x="21" y="8" width="3" height="3" fill={color} />
          <rect x="22" y="10" width="3" height="4" fill={color} />
          <rect x="22" y="14" width="2" height="2" fill={color} />
          <rect x="14" y="6" width="2" height="1" fill={lighter} />
        </g>
      );
    case "afro":
      return (
        <g>
          <rect x="8" y="4" width="16" height="3" fill={color} />
          <rect x="7" y="7" width="18" height="3" fill={color} />
          <rect x="8" y="10" width="4" height="4" fill={color} />
          <rect x="20" y="10" width="4" height="4" fill={color} />
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="12" y="4" width="2" height="1" fill={lighter} />
        </g>
      );
    case "dreadlocks":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="9" y="8" width="2" height="4" fill={color} />
          <rect x="21" y="8" width="2" height="4" fill={color} />
          <rect x="8" y="12" width="2" height="4" fill={color} />
          <rect x="10" y="14" width="2" height="4" fill={color} />
          <rect x="20" y="12" width="2" height="4" fill={color} />
          <rect x="22" y="14" width="2" height="4" fill={color} />
          <rect x="14" y="6" width="2" height="1" fill={lighter} />
        </g>
      );
    case "side-shave":
      return (
        <g>
          <rect x="10" y="7" width="12" height="3" fill={color} />
          <rect x="10" y="6" width="8" height="4" fill={color} />
          <rect x="9" y="8" width="2" height="6" fill={color} />
          <rect x="14" y="6" width="1" height="1" fill={lighter} />
        </g>
      );
    case "topknot":
      return (
        <g>
          <rect x="10" y="7" width="12" height="3" fill={color} />
          <rect x="14" y="3" width="4" height="4" fill={color} />
          <rect x="15" y="2" width="2" height="1" fill={color} />
          <rect x="15" y="3" width="1" height="1" fill={lighter} />
        </g>
      );
    case "flowing":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="9" y="8" width="2" height="10" fill={color} />
          <rect x="21" y="8" width="2" height="10" fill={color} />
          <rect x="8" y="16" width="2" height="4" fill={color} />
          <rect x="22" y="16" width="2" height="4" fill={color} />
          <rect x="13" y="6" width="3" height="1" fill={lighter} />
        </g>
      );
    case "warrior-braid":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="9" y="8" width="2" height="3" fill={color} />
          <rect x="21" y="8" width="2" height="3" fill={color} />
          {/* Central braid going back */}
          <rect x="14" y="5" width="4" height="2" fill={color} />
          <rect x="20" y="7" width="3" height="2" fill={color} />
          <rect x="22" y="9" width="3" height="3" fill={color} />
          <rect x="23" y="12" width="2" height="4" fill={color} />
          <rect x="22" y="16" width="2" height="3" fill={color} />
          <rect x="15" y="5" width="1" height="1" fill={lighter} />
        </g>
      );
    case "phoenix-crest":
      return (
        <g>
          <rect x="10" y="7" width="12" height="3" fill={color} />
          {/* Tall crest */}
          <rect x="14" y="1" width="4" height="6" fill={color} />
          <rect x="13" y="3" width="6" height="4" fill={color} />
          <rect x="15" y="0" width="2" height="2" fill={lighter} />
          <rect x="14" y="2" width="1" height="1" fill={lighter} />
          <rect x="17" y="2" width="1" height="1" fill={lighter} />
        </g>
      );
    case "celestial-locks":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="9" y="8" width="2" height="10" fill={color} />
          <rect x="21" y="8" width="2" height="10" fill={color} />
          <rect x="8" y="14" width="2" height="6" fill={color} />
          <rect x="22" y="14" width="2" height="6" fill={color} />
          {/* Star-like highlights */}
          <rect x="14" y="6" width="1" height="1" fill="#ffd700" opacity="0.5" />
          <rect x="9" y="12" width="1" height="1" fill="#ffd700" opacity="0.4" />
          <rect x="22" y="11" width="1" height="1" fill="#ffd700" opacity="0.4" />
          <rect x="13" y="6" width="3" height="1" fill={lighter} />
        </g>
      );
    case "twin-tails":
      return (
        <g>
          <rect x="10" y="7" width="12" height="3" fill={color} />
          <rect x="8" y="8" width="3" height="3" fill={color} />
          <rect x="7" y="11" width="2" height="6" fill={color} />
          <rect x="8" y="17" width="2" height="3" fill={color} />
          <rect x="21" y="8" width="3" height="3" fill={color} />
          <rect x="23" y="11" width="2" height="6" fill={color} />
          <rect x="22" y="17" width="2" height="3" fill={color} />
          <rect x="14" y="7" width="2" height="1" fill={lighter} />
        </g>
      );
    case "battle-braids":
      return (
        <g>
          <rect x="10" y="6" width="12" height="4" fill={color} />
          <rect x="9" y="8" width="2" height="3" fill={color} />
          <rect x="21" y="8" width="2" height="3" fill={color} />
          {/* Left braid */}
          <rect x="8" y="11" width="2" height="2" fill={color} />
          <rect x="9" y="13" width="2" height="2" fill={color} />
          <rect x="8" y="15" width="2" height="2" fill={color} />
          <rect x="9" y="17" width="2" height="2" fill={color} />
          {/* Right braid */}
          <rect x="22" y="11" width="2" height="2" fill={color} />
          <rect x="21" y="13" width="2" height="2" fill={color} />
          <rect x="22" y="15" width="2" height="2" fill={color} />
          <rect x="21" y="17" width="2" height="2" fill={color} />
          {/* Braid ties */}
          <rect x="9" y="17" width="1" height="1" fill="#d4a843" />
          <rect x="22" y="17" width="1" height="1" fill="#d4a843" />
          <rect x="14" y="6" width="3" height="1" fill={lighter} />
        </g>
      );
    default: // short
      return (
        <g>
          <rect x="10" y="6" width="12" height="3" fill={color} />
          <rect x="9" y="8" width="2" height="3" fill={color} />
          <rect x="21" y="8" width="2" height="3" fill={color} />
          <rect x="12" y="5" width="2" height="1" fill={color} />
          <rect x="18" y="5" width="2" height="1" fill={color} />
          <rect x="14" y="6" width="3" height="1" fill={lighter} />
        </g>
      );
  }
}

// ── Accessories ──────────────────────────────────────────────

function AccessoryLayer({ accessory, color }: { accessory: string | null; color: string }) {
  if (!accessory) return null;
  const hi = lighten(color, 0.15);
  const lo = darken(color, 0.2);

  switch (accessory) {
    case "crown":
      return (
        <g>
          <rect x="11" y="4" width="10" height="3" fill={color} />
          <rect x="11" y="2" width="2" height="2" fill={color} />
          <rect x="15" y="1" width="2" height="3" fill={color} />
          <rect x="19" y="2" width="2" height="2" fill={color} />
          <rect x="12" y="2" width="1" height="1" fill="#ef4444" />
          <rect x="16" y="1" width="1" height="1" fill="#3b82f6" />
          <rect x="20" y="2" width="1" height="1" fill="#22c55e" />
        </g>
      );
    case "glasses":
      return (
        <g>
          <rect x="12" y="11" width="4" height="3" fill="none" stroke={color} strokeWidth="0.7" />
          <rect x="18" y="11" width="4" height="3" fill="none" stroke={color} strokeWidth="0.7" />
          <rect x="16" y="12" width="2" height="0.7" fill={color} />
          <rect x="10" y="12" width="2" height="0.7" fill={color} />
          <rect x="22" y="12" width="2" height="0.7" fill={color} />
        </g>
      );
    case "eyepatch":
      return (
        <g>
          <rect x="12" y="11" width="4" height="4" fill={color} />
          <rect x="10" y="10" width="2" height="1" fill={lo} />
          <rect x="16" y="9" width="6" height="1" fill={lo} />
        </g>
      );
    case "horns":
      return (
        <g>
          <rect x="9" y="6" width="2" height="2" fill={lo} />
          <rect x="8" y="4" width="2" height="2" fill={color} />
          <rect x="7" y="3" width="2" height="1" fill={hi} />
          <rect x="21" y="6" width="2" height="2" fill={lo} />
          <rect x="22" y="4" width="2" height="2" fill={color} />
          <rect x="23" y="3" width="2" height="1" fill={hi} />
        </g>
      );
    case "halo":
      return (
        <g>
          <rect x="10" y="3" width="12" height="1" fill={color} opacity="0.8" />
          <rect x="9" y="4" width="1" height="1" fill={color} opacity="0.6" />
          <rect x="22" y="4" width="1" height="1" fill={color} opacity="0.6" />
          <rect x="10" y="5" width="1" height="1" fill={color} opacity="0.4" />
          <rect x="21" y="5" width="1" height="1" fill={color} opacity="0.4" />
          <rect x="12" y="2" width="8" height="1" fill={color} opacity="0.3" />
        </g>
      );
    case "bandana":
      return (
        <g>
          <rect x="10" y="7" width="12" height="2" fill={color} />
          <rect x="22" y="8" width="2" height="1" fill={color} />
          <rect x="23" y="9" width="2" height="2" fill={color} />
          <rect x="13" y="7" width="1" height="1" fill="#ffffff" opacity="0.3" />
          <rect x="17" y="7" width="1" height="1" fill="#ffffff" opacity="0.3" />
        </g>
      );
    case "hood":
      return (
        <g>
          <rect x="15" y="3" width="3" height="2" fill={color} />
          <rect x="9" y="5" width="14" height="4" fill={color} />
          <rect x="8" y="8" width="3" height="11" fill={color} />
          <rect x="21" y="8" width="3" height="11" fill={color} />
          <rect x="11" y="6" width="3" height="1" fill={hi} opacity="0.4" />
          <rect x="12" y="8" width="8" height="1" fill={lo} opacity="0.3" />
        </g>
      );
    case "necklace":
      return (
        <g>
          <rect x="13" y="18" width="6" height="1" fill={color} />
          <rect x="15" y="19" width="2" height="1" fill={color} />
          <rect x="15" y="20" width="2" height="1" fill={hi} />
        </g>
      );
    case "cape-pin":
      return (
        <g>
          <rect x="14" y="19" width="4" height="2" fill={color} />
          <rect x="15" y="19" width="2" height="1" fill={hi} />
        </g>
      );
    case "monocle":
      return (
        <g>
          <circle cx="18.5" cy="12.5" r="2" fill="none" stroke={color} strokeWidth="0.6" />
          <rect x="20" y="13" width="3" height="0.5" fill={color} />
          <rect x="22" y="13" width="1" height="6" fill={color} opacity="0.5" />
        </g>
      );
    case "shoulder-guard":
      return (
        <g>
          <rect x="8" y="18" width="4" height="3" fill={color} />
          <rect x="9" y="17" width="2" height="1" fill={hi} />
          <rect x="8" y="18" width="1" height="1" fill={lighten(color, 0.25)} />
        </g>
      );
    case "war-paint":
      return (
        <g>
          <rect x="11" y="14" width="3" height="1" fill={color} opacity="0.7" />
          <rect x="18" y="14" width="3" height="1" fill={color} opacity="0.7" />
          <rect x="12" y="15" width="1" height="1" fill={color} opacity="0.5" />
          <rect x="19" y="15" width="1" height="1" fill={color} opacity="0.5" />
        </g>
      );
    case "face-mask":
      return (
        <g>
          <rect x="12" y="14" width="8" height="4" fill={color} />
          <rect x="14" y="14" width="4" height="1" fill={hi} />
        </g>
      );
    case "flower-crown":
      return (
        <g>
          <rect x="10" y="6" width="12" height="1" fill="#22c55e" />
          <rect x="11" y="5" width="2" height="2" fill={color} />
          <rect x="15" y="5" width="2" height="2" fill={hi} />
          <rect x="19" y="5" width="2" height="2" fill={lo} />
        </g>
      );
    case "enchanted-ring":
      return (
        <g>
          <rect x="7" y="25" width="2" height="1" fill={color} />
          <rect x="7" y="26" width="2" height="1" fill={hi} opacity="0.8" />
        </g>
      );
    case "dragon-fang":
      return (
        <g>
          <rect x="14" y="17" width="1" height="3" fill="#f0f0f0" />
          <rect x="15" y="18" width="1" height="2" fill="#e0e0e0" />
          <rect x="13" y="17" width="1" height="1" fill={color} />
          <rect x="16" y="17" width="1" height="1" fill={color} />
        </g>
      );
    case "angel-wings":
      return (
        <g>
          <rect x="5" y="19" width="3" height="6" fill={color} opacity="0.7" />
          <rect x="4" y="20" width="2" height="4" fill={hi} opacity="0.5" />
          <rect x="24" y="19" width="3" height="6" fill={color} opacity="0.7" />
          <rect x="26" y="20" width="2" height="4" fill={hi} opacity="0.5" />
        </g>
      );
    case "battle-scars":
      return (
        <g>
          <rect x="18" y="10" width="1" height="4" fill="#cc6666" opacity="0.6" />
          <rect x="19" y="11" width="1" height="2" fill="#cc6666" opacity="0.4" />
        </g>
      );
    case "wisdom-orb":
      return (
        <g>
          <circle cx="8" cy="24" r="2" fill={color} opacity="0.6" />
          <rect x="7" y="23" width="1" height="1" fill="#ffffff" opacity="0.4" />
        </g>
      );
    case "phoenix-feather":
      return (
        <g>
          <rect x="22" y="7" width="1" height="4" fill={color} />
          <rect x="23" y="6" width="1" height="3" fill={hi} />
          <rect x="24" y="5" width="1" height="2" fill={lighten(color, 0.35)} />
        </g>
      );
    case "champions-laurel":
      return (
        <g>
          <rect x="10" y="5" width="1" height="3" fill={color} />
          <rect x="9" y="6" width="1" height="2" fill={color} />
          <rect x="21" y="5" width="1" height="3" fill={color} />
          <rect x="22" y="6" width="1" height="2" fill={color} />
          <rect x="12" y="4" width="8" height="1" fill={hi} opacity="0.5" />
        </g>
      );
    case "titans-circlet":
      return (
        <g>
          <rect x="10" y="6" width="12" height="1" fill={color} />
          <rect x="15" y="5" width="2" height="1" fill={hi} />
          <rect x="12" y="5" width="1" height="1" fill="#8b5cf6" opacity="0.7" />
          <rect x="19" y="5" width="1" height="1" fill="#3b82f6" opacity="0.7" />
        </g>
      );
    case "shield-badge":
      return (
        <g>
          <rect x="14" y="21" width="4" height="4" fill={color} opacity="0.6" />
          <rect x="15" y="22" width="2" height="2" fill={hi} />
        </g>
      );
    case "scarf":
      return (
        <g>
          <rect x="12" y="18" width="8" height="2" fill={color} />
          <rect x="10" y="19" width="3" height="4" fill={color} />
          <rect x="10" y="23" width="2" height="2" fill={color} />
        </g>
      );
    case "tiara":
      return (
        <g>
          <rect x="11" y="6" width="10" height="1" fill={color} />
          <rect x="15" y="5" width="2" height="1" fill={color} />
          <rect x="16" y="4" width="1" height="1" fill={hi} />
        </g>
      );
    case "wings":
      return (
        <g>
          <rect x="4" y="19" width="4" height="8" fill={color} opacity="0.6" />
          <rect x="3" y="21" width="2" height="4" fill={hi} opacity="0.4" />
          <rect x="24" y="19" width="4" height="8" fill={color} opacity="0.6" />
          <rect x="27" y="21" width="2" height="4" fill={hi} opacity="0.4" />
        </g>
      );
    default:
      return null;
  }
}

// ── Companions ──────────────────────────────────────────────

function CompanionLayer({ companion, color }: { companion: string | null; color: string }) {
  if (!companion) return null;
  const hi = lighten(color, 0.2);
  const lo = darken(color, 0.15);
  const eye = "#1a1a2e";

  switch (companion) {
    case "cat":
      return (
        <g>
          <rect x="24" y="25" width="5" height="3" fill={color} />
          <rect x="24" y="23" width="3" height="2" fill={color} />
          <rect x="24" y="22" width="1" height="1" fill={color} />
          <rect x="26" y="22" width="1" height="1" fill={color} />
          <rect x="24" y="23" width="1" height="1" fill={eye} />
          <rect x="26" y="23" width="1" height="1" fill={eye} />
          <rect x="29" y="24" width="1" height="1" fill={color} />
          <rect x="30" y="23" width="1" height="1" fill={color} />
        </g>
      );
    case "dog":
      return (
        <g>
          <rect x="24" y="26" width="5" height="2" fill={color} />
          <rect x="24" y="23" width="4" height="3" fill={color} />
          <rect x="23" y="24" width="1" height="2" fill={lo} />
          <rect x="28" y="24" width="1" height="2" fill={lo} />
          <rect x="25" y="24" width="1" height="1" fill={eye} />
          <rect x="27" y="24" width="1" height="1" fill={eye} />
          <rect x="26" y="25" width="1" height="1" fill={eye} />
          <rect x="29" y="25" width="1" height="1" fill={color} />
          <rect x="30" y="24" width="1" height="1" fill={color} />
        </g>
      );
    case "owl":
      return (
        <g>
          <rect x="25" y="25" width="4" height="3" fill={lo} />
          <rect x="25" y="22" width="4" height="3" fill={color} />
          <rect x="25" y="21" width="1" height="1" fill={color} />
          <rect x="28" y="21" width="1" height="1" fill={color} />
          <rect x="25" y="23" width="2" height="1" fill="#ffd700" />
          <rect x="27" y="23" width="2" height="1" fill="#ffd700" />
          <rect x="26" y="23" width="1" height="1" fill={eye} />
          <rect x="28" y="23" width="1" height="1" fill={eye} />
          <rect x="27" y="24" width="1" height="1" fill="#d4a843" />
        </g>
      );
    case "fox":
      return (
        <g>
          <rect x="24" y="25" width="5" height="3" fill={color} />
          <rect x="24" y="23" width="4" height="2" fill={color} />
          <rect x="24" y="22" width="1" height="1" fill={color} />
          <rect x="27" y="22" width="1" height="1" fill={color} />
          <rect x="25" y="23" width="1" height="1" fill={eye} />
          <rect x="27" y="23" width="1" height="1" fill={eye} />
          <rect x="25" y="24" width="2" height="1" fill="#ffffff" />
          <rect x="29" y="23" width="2" height="2" fill={color} />
          <rect x="30" y="22" width="1" height="1" fill="#ffffff" />
        </g>
      );
    case "wolf":
      return (
        <g>
          <rect x="23" y="25" width="6" height="3" fill={lo} />
          <rect x="24" y="22" width="4" height="3" fill={color} />
          <rect x="24" y="21" width="1" height="1" fill={color} />
          <rect x="27" y="21" width="1" height="1" fill={color} />
          <rect x="25" y="23" width="1" height="1" fill="#ffd700" />
          <rect x="27" y="23" width="1" height="1" fill="#ffd700" />
          <rect x="25" y="24" width="2" height="1" fill={lo} />
          <rect x="29" y="24" width="1" height="2" fill={lo} />
          <rect x="30" y="23" width="1" height="1" fill={lo} />
        </g>
      );
    case "slime":
      return (
        <g>
          <rect x="25" y="25" width="4" height="3" fill={color} />
          <rect x="26" y="24" width="2" height="1" fill={color} />
          <rect x="24" y="26" width="1" height="1" fill={color} />
          <rect x="29" y="26" width="1" height="1" fill={color} />
          <rect x="26" y="24" width="1" height="1" fill={hi} />
          <rect x="26" y="26" width="1" height="1" fill={eye} />
          <rect x="28" y="26" width="1" height="1" fill={eye} />
        </g>
      );
    case "rabbit":
      return (
        <g>
          <rect x="25" y="25" width="4" height="3" fill={color} />
          <rect x="25" y="23" width="3" height="2" fill={color} />
          <rect x="25" y="20" width="1" height="3" fill={color} />
          <rect x="27" y="20" width="1" height="3" fill={color} />
          <rect x="25" y="20" width="1" height="1" fill={hi} />
          <rect x="27" y="20" width="1" height="1" fill={hi} />
          <rect x="26" y="23" width="1" height="1" fill={eye} />
          <rect x="27" y="24" width="1" height="1" fill="#ec4899" />
        </g>
      );
    case "frog":
      return (
        <g>
          <rect x="25" y="25" width="4" height="3" fill={color} />
          <rect x="25" y="23" width="4" height="2" fill={color} />
          <rect x="25" y="22" width="2" height="1" fill={hi} />
          <rect x="27" y="22" width="2" height="1" fill={hi} />
          <rect x="25" y="22" width="1" height="1" fill={eye} />
          <rect x="28" y="22" width="1" height="1" fill={eye} />
          <rect x="26" y="24" width="2" height="1" fill={hi} />
        </g>
      );
    case "hawk":
      return (
        <g>
          <rect x="25" y="24" width="4" height="3" fill={lo} />
          <rect x="25" y="22" width="3" height="2" fill={color} />
          <rect x="26" y="22" width="1" height="1" fill={eye} />
          <rect x="28" y="23" width="1" height="1" fill="#d4a843" />
          <rect x="23" y="23" width="2" height="3" fill={darken(color, 0.25)} />
          <rect x="29" y="23" width="2" height="3" fill={darken(color, 0.25)} />
        </g>
      );
    case "turtle":
      return (
        <g>
          <rect x="24" y="25" width="6" height="3" fill={color} />
          <rect x="25" y="25" width="4" height="2" fill={lo} />
          <rect x="23" y="26" width="2" height="2" fill={color} />
          <rect x="26" y="25" width="1" height="1" fill={darken(color, 0.3)} />
          <rect x="28" y="26" width="1" height="1" fill={darken(color, 0.3)} />
          <rect x="23" y="26" width="1" height="1" fill={eye} />
        </g>
      );
    case "snake":
      return (
        <g>
          <rect x="25" y="26" width="4" height="2" fill={color} />
          <rect x="24" y="25" width="2" height="1" fill={color} />
          <rect x="24" y="25" width="1" height="1" fill={eye} />
          <rect x="29" y="25" width="1" height="2" fill={color} />
          <rect x="30" y="24" width="1" height="2" fill={color} />
          <rect x="28" y="27" width="2" height="1" fill={color} />
          <rect x="25" y="26" width="1" height="1" fill={hi} />
        </g>
      );
    case "bear":
      return (
        <g>
          <rect x="23" y="24" width="6" height="4" fill={color} />
          <rect x="24" y="22" width="4" height="2" fill={color} />
          <rect x="23" y="21" width="2" height="2" fill={color} />
          <rect x="27" y="21" width="2" height="2" fill={color} />
          <rect x="25" y="23" width="1" height="1" fill={eye} />
          <rect x="27" y="23" width="1" height="1" fill={eye} />
          <rect x="26" y="24" width="1" height="1" fill={lo} />
        </g>
      );
    case "bat":
      return (
        <g>
          <rect x="26" y="24" width="2" height="2" fill={color} />
          <rect x="26" y="23" width="2" height="1" fill={lo} />
          <rect x="26" y="23" width="1" height="1" fill="#ff4444" />
          <rect x="27" y="23" width="1" height="1" fill="#ff4444" />
          <rect x="23" y="23" width="3" height="3" fill={color} opacity="0.7" />
          <rect x="28" y="23" width="3" height="3" fill={color} opacity="0.7" />
          <rect x="22" y="24" width="1" height="2" fill={lo} opacity="0.5" />
          <rect x="31" y="24" width="1" height="2" fill={lo} opacity="0.5" />
        </g>
      );
    case "dragon":
      return (
        <g>
          <rect x="24" y="24" width="5" height="4" fill={color} />
          <rect x="24" y="22" width="4" height="2" fill={color} />
          <rect x="24" y="21" width="1" height="1" fill="#d4a843" />
          <rect x="27" y="21" width="1" height="1" fill="#d4a843" />
          <rect x="25" y="22" width="1" height="1" fill="#ffd700" />
          <rect x="27" y="22" width="1" height="1" fill="#ffd700" />
          <rect x="22" y="23" width="2" height="3" fill={hi} />
          <rect x="29" y="23" width="2" height="3" fill={hi} />
          <rect x="25" y="25" width="3" height="2" fill={lighten(color, 0.1)} />
          <rect x="29" y="27" width="1" height="1" fill={color} />
          <rect x="30" y="26" width="1" height="1" fill={color} />
        </g>
      );
    case "unicorn":
      return (
        <g>
          <rect x="24" y="25" width="5" height="3" fill={color} />
          <rect x="24" y="23" width="4" height="2" fill={color} />
          <rect x="26" y="21" width="1" height="2" fill="#ffd700" />
          <rect x="26" y="20" width="1" height="1" fill="#ec4899" />
          <rect x="25" y="23" width="1" height="1" fill={eye} />
          <rect x="27" y="23" width="1" height="1" fill={eye} />
          <rect x="29" y="24" width="2" height="2" fill="#ec4899" opacity="0.5" />
          <rect x="23" y="26" width="1" height="1" fill={color} />
        </g>
      );
    case "griffin":
      return (
        <g>
          <rect x="24" y="24" width="5" height="4" fill={color} />
          <rect x="24" y="22" width="4" height="2" fill={lo} />
          <rect x="25" y="22" width="1" height="1" fill={eye} />
          <rect x="27" y="22" width="1" height="1" fill={eye} />
          <rect x="28" y="23" width="1" height="1" fill="#d4a843" />
          <rect x="22" y="23" width="2" height="4" fill={darken(color, 0.25)} />
          <rect x="29" y="23" width="2" height="4" fill={darken(color, 0.25)} />
        </g>
      );
    case "hydra":
      return (
        <g>
          <rect x="24" y="24" width="5" height="4" fill={color} />
          <rect x="23" y="21" width="3" height="3" fill={color} />
          <rect x="26" y="20" width="3" height="3" fill={color} />
          <rect x="29" y="21" width="2" height="3" fill={color} />
          <rect x="24" y="21" width="1" height="1" fill={eye} />
          <rect x="27" y="20" width="1" height="1" fill={eye} />
          <rect x="30" y="21" width="1" height="1" fill={eye} />
        </g>
      );
    case "celestial-dragon":
      return (
        <g>
          <rect x="23" y="24" width="6" height="4" fill={color} />
          <rect x="24" y="22" width="4" height="2" fill={lo} />
          <rect x="24" y="21" width="1" height="1" fill="#ffd700" />
          <rect x="27" y="21" width="1" height="1" fill="#ffd700" />
          <rect x="25" y="22" width="1" height="1" fill="#ffd700" />
          <rect x="27" y="22" width="1" height="1" fill="#ffd700" />
          <rect x="22" y="23" width="2" height="3" fill={hi} opacity="0.7" />
          <rect x="29" y="23" width="2" height="3" fill={hi} opacity="0.7" />
          <rect x="25" y="25" width="3" height="2" fill={lo} />
          <rect x="26" y="24" width="1" height="1" fill="#ffd700" opacity="0.5" />
        </g>
      );
    case "phoenix":
      return (
        <g>
          <rect x="25" y="24" width="4" height="3" fill={color} />
          <rect x="25" y="22" width="3" height="2" fill={hi} />
          <rect x="26" y="21" width="1" height="1" fill={lighten(color, 0.4)} />
          <rect x="27" y="20" width="1" height="1" fill={lighten(color, 0.4)} />
          <rect x="26" y="22" width="1" height="1" fill={eye} />
          <rect x="28" y="23" width="1" height="1" fill="#d4a843" />
          <rect x="23" y="23" width="2" height="3" fill={lo} />
          <rect x="29" y="23" width="2" height="3" fill={lo} />
          <rect x="25" y="27" width="1" height="1" fill={lighten(color, 0.4)} />
          <rect x="27" y="27" width="1" height="1" fill={lo} />
          <rect x="26" y="28" width="1" height="1" fill={lighten(color, 0.4)} />
        </g>
      );
    case "spirit-wolf":
      return (
        <g>
          <rect x="23" y="25" width="6" height="3" fill={color} opacity="0.7" />
          <rect x="24" y="22" width="4" height="3" fill={hi} opacity="0.7" />
          <rect x="24" y="21" width="1" height="1" fill={lighten(color, 0.3)} opacity="0.6" />
          <rect x="27" y="21" width="1" height="1" fill={lighten(color, 0.3)} opacity="0.6" />
          <rect x="25" y="23" width="1" height="1" fill="#ffffff" opacity="0.8" />
          <rect x="27" y="23" width="1" height="1" fill="#ffffff" opacity="0.8" />
        </g>
      );
    case "fairy":
      return (
        <g>
          <rect x="26" y="24" width="2" height="3" fill={color} />
          <rect x="26" y="22" width="2" height="2" fill="#fde0c4" />
          <rect x="24" y="22" width="2" height="3" fill={hi} opacity="0.7" />
          <rect x="28" y="22" width="2" height="3" fill={hi} opacity="0.7" />
          <rect x="25" y="21" width="1" height="1" fill="#ffdd55" opacity="0.6" />
          <rect x="29" y="21" width="1" height="1" fill="#ffdd55" opacity="0.6" />
          <rect x="27" y="20" width="1" height="1" fill="#ffdd55" opacity="0.4" />
        </g>
      );
    case "baby-dragon":
      return (
        <g>
          <rect x="25" y="25" width="4" height="3" fill={color} />
          <rect x="26" y="26" width="2" height="1" fill={lighten(color, 0.3)} opacity="0.8" />
          <rect x="25" y="22" width="3" height="2" fill={color} />
          <rect x="24" y="23" width="1" height="1" fill={lighten(color, 0.15)} />
          <rect x="25" y="21" width="1" height="1" fill="#d4a843" />
          <rect x="27" y="21" width="1" height="1" fill="#d4a843" />
          <rect x="26" y="23" width="1" height="1" fill={eye} />
          <rect x="28" y="22" width="1" height="1" fill={lo} />
          <rect x="29" y="24" width="1" height="2" fill={hi} opacity="0.6" />
          <rect x="30" y="25" width="1" height="1" fill={hi} opacity="0.4" />
          <rect x="29" y="26" width="1" height="1" fill={lo} opacity="0.5" />
        </g>
      );
    case "pegasus":
      return (
        <g>
          <rect x="24" y="25" width="5" height="3" fill={color} />
          <rect x="24" y="23" width="4" height="2" fill={color} />
          <rect x="25" y="23" width="1" height="1" fill={eye} />
          <rect x="27" y="23" width="1" height="1" fill={eye} />
          <rect x="22" y="22" width="2" height="4" fill={hi} opacity="0.6" />
          <rect x="29" y="22" width="2" height="4" fill={hi} opacity="0.6" />
          <rect x="21" y="23" width="1" height="2" fill={lighten(color, 0.3)} opacity="0.4" />
          <rect x="31" y="23" width="1" height="2" fill={lighten(color, 0.3)} opacity="0.4" />
        </g>
      );
    default:
      return null;
  }
}

// ── Color utilities ──────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("")
  );
}

function darken(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (255 - r) * amount, g + (255 - g) * amount, b + (255 - b) * amount);
}
