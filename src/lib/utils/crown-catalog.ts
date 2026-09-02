/** Crowns ascend by season ordinal, so a returning learner always earns a grander one. */
export type CrownTier = {
  ordinal: number;
  id: string;
  label: string;
  description: string;
  icon: "crown" | "fireCrown"; // GameIcon registry names
  color: string;
};

export const CROWNS: CrownTier[] = [
  { ordinal: 1, id: "crown-copper", label: "Copper Circlet", description: "A first crown, humble and hard-won.", icon: "crown", color: "#b87333" },
  { ordinal: 2, id: "crown-iron", label: "Iron Crown", description: "Forged by a second year of learning.", icon: "crown", color: "#8a8f98" },
  { ordinal: 3, id: "crown-silver", label: "Silver Crown", description: "Three seasons bright.", icon: "crown", color: "#c0c0c0" },
  { ordinal: 4, id: "crown-gold", label: "Gold Crown", description: "Four years of steady rule.", icon: "crown", color: "#d4a843" },
  { ordinal: 5, id: "crown-jeweled", label: "Jeweled Crown", description: "Set with the gems of five seasons.", icon: "crown", color: "#3ecfff" },
  { ordinal: 6, id: "crown-emerald", label: "Emerald Crown", description: "Green as a kingdom in full growth.", icon: "crown", color: "#22c55e" },
  { ordinal: 7, id: "crown-sapphire", label: "Sapphire Crown", description: "Deep as seven years of wisdom.", icon: "crown", color: "#3b82f6" },
  { ordinal: 8, id: "crown-ruby", label: "Ruby Crown", description: "Eight seasons burning bright.", icon: "crown", color: "#ef4444" },
  { ordinal: 9, id: "crown-amethyst", label: "Amethyst Crown", description: "Royal purple for a ninth year.", icon: "crown", color: "#a855f7" },
  { ordinal: 10, id: "crown-diamond", label: "Diamond Crown", description: "Ten seasons, unbreakable.", icon: "crown", color: "#e0f2fe" },
  { ordinal: 11, id: "crown-starlight", label: "Starlight Crown", description: "Lit by eleven years of quests.", icon: "crown", color: "#fde68a" },
  { ordinal: 12, id: "crown-sunfire", label: "Sunfire Crown", description: "Twelve seasons ablaze.", icon: "fireCrown", color: "#f97316" },
  { ordinal: 13, id: "crown-radiant", label: "Radiant Crown", description: "The legendary crown of a full journey, K through 12.", icon: "fireCrown", color: "#fff7cc" },
];

/** Ordinals past the last tier keep earning the last tier. */
export function crownForOrdinal(ordinal: number): CrownTier {
  const clamped = Math.min(Math.max(1, Math.floor(ordinal)), CROWNS.length);
  return CROWNS[clamped - 1];
}

export function crownById(id: string): CrownTier | null {
  return CROWNS.find((c) => c.id === id) ?? null;
}
