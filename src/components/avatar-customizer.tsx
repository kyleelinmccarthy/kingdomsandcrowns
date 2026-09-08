"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/avatar";
import { updateAvatarConfig } from "@/lib/actions/avatar";
import {
  DEFAULT_AVATAR,
  SKIN_TONES,
  HAIR_STYLES,
  HAIR_COLORS,
  OUTFITS,
  OUTFIT_COLORS,
  LEGWEAR,
  LEGWEAR_COLORS,
  BOOTS,
  BOOTS_COLORS,
  ACCESSORIES,
  ACCESSORY_COLORS,
  COMPANIONS,
  BACKGROUNDS,
  BACKGROUND_COLORS,
  getCompanionColors,
  isUnlocked,
  getUnlockDescription,
  normalizeAvatarConfig,
  type AvatarConfig,
  type AvatarItem,
  type ColorOption,
} from "@/lib/utils/avatar-catalog";

type Tab = "skin" | "hair" | "outfit" | "legwear" | "boots" | "accessory" | "companion" | "background";

const TABS: { id: Tab; label: string }[] = [
  { id: "skin", label: "Skin" },
  { id: "hair", label: "Hair" },
  { id: "outfit", label: "Armor" },
  { id: "legwear", label: "Legs" },
  { id: "boots", label: "Boots" },
  { id: "accessory", label: "Flair" },
  { id: "background", label: "Crest" },
  { id: "companion", label: "Pet" },
];

function randomAvatarConfig(
  level: number,
  earnedBadgeIds: string[],
  questUnlockedSet: Set<string>,
): AvatarConfig {
  const pick = <T extends AvatarItem>(items: T[]) => {
    const unlocked = items.filter((i) => isUnlocked(i, level, earnedBadgeIds, questUnlockedSet));
    return unlocked[Math.floor(Math.random() * unlocked.length)];
  };
  const pickColor = (colors: ColorOption[]) =>
    colors[Math.floor(Math.random() * colors.length)];

  const acc = ACCESSORIES.filter((a) => isUnlocked(a, level, earnedBadgeIds, questUnlockedSet));
  const randomAcc = acc.length > 0 && Math.random() > 0.3
    ? acc[Math.floor(Math.random() * acc.length)].id
    : null;

  const comps = COMPANIONS.filter((c) => isUnlocked(c, level, earnedBadgeIds, questUnlockedSet));
  const randomComp = comps.length > 0 && Math.random() > 0.3
    ? comps[Math.floor(Math.random() * comps.length)].id
    : null;

  const companionPalette = randomComp ? getCompanionColors(randomComp) : [];
  return {
    skinTone: pick(SKIN_TONES).id,
    hairStyle: pick(HAIR_STYLES).id,
    hairColor: pickColor(HAIR_COLORS).hex,
    outfit: pick(OUTFITS).id,
    outfitColor: pickColor(OUTFIT_COLORS).hex,
    legwear: pick(LEGWEAR).id,
    legwearColor: pickColor(LEGWEAR_COLORS).hex,
    boots: pick(BOOTS).id,
    bootsColor: pickColor(BOOTS_COLORS).hex,
    accessory: randomAcc,
    accessoryColor: pickColor(ACCESSORY_COLORS).hex,
    companion: randomComp,
    companionColor: companionPalette.length > 0
      ? companionPalette[Math.floor(Math.random() * companionPalette.length)].hex
      : DEFAULT_AVATAR.companionColor,
    mount: DEFAULT_AVATAR.mount,
    mountColor: DEFAULT_AVATAR.mountColor,
    background: pick(BACKGROUNDS).id,
    backgroundColor: pickColor(BACKGROUND_COLORS).hex,
  };
}

type AvatarCustomizerProps = {
  childId: string;
  childName: string;
  currentConfig: AvatarConfig | null;
  level: number;
  earnedBadgeIds: string[];
  questUnlockedItems?: string[];
  open: boolean;
  onClose: () => void;
};

export function AvatarCustomizer({
  childId,
  childName,
  currentConfig,
  level,
  earnedBadgeIds,
  questUnlockedItems = [],
  open,
  onClose,
}: AvatarCustomizerProps) {
  const questUnlockedSet = new Set(questUnlockedItems);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [config, setConfig] = useState<AvatarConfig>(
    currentConfig
      ? normalizeAvatarConfig(currentConfig as unknown as Record<string, unknown>)
      : DEFAULT_AVATAR
  );
  const [tab, setTab] = useState<Tab>("skin");
  const [error, setError] = useState<string | null>(null);

  function update(partial: Partial<AvatarConfig>) {
    setConfig((prev) => ({ ...prev, ...partial }));
    setError(null);
  }

  function randomize() {
    setConfig(randomAvatarConfig(level, earnedBadgeIds, questUnlockedSet));
  }

  function save() {
    startTransition(async () => {
      try {
        await updateAvatarConfig(childId, config);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "The enchantment fizzled. Try once more.");
      }
    });
  }

  return (
    <Dialog open={open} onClose={onClose} className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Customize Your Hero</DialogTitle>
      </DialogHeader>

      {/* Live preview */}
      <div className="mb-4 flex flex-col items-center gap-2">
        <Avatar config={config} name={childName} size="xl" />
        <p className="text-sm font-medium">{childName}</p>
        <p className="text-xs text-muted-foreground">Level {level}</p>
      </div>

      {/* Tab bar */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-md border border-[var(--gold-dim)] bg-secondary/50 p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all whitespace-nowrap ${
              tab === t.id
                ? "bg-[rgba(201,168,76,0.12)] text-[var(--gold-bright)] border border-[var(--gold-border)] shadow-[0_0_8px_-2px_var(--glow-gold)]"
                : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-[rgba(201,168,76,0.06)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content: scrollable items + fixed color picker */}
      <div className="flex flex-col">
        {/* Scrollable item selection */}
        <div className="min-h-[100px] max-h-[180px] overflow-y-auto">
          {tab === "skin" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Skin Tone</p>
              <div className="flex flex-wrap gap-2">
                {SKIN_TONES.map((tone) => {
                  const unlocked = isUnlocked(tone, level, earnedBadgeIds, questUnlockedSet);
                  return (
                    <button
                      key={tone.id}
                      onClick={() => unlocked && update({ skinTone: tone.id })}
                      disabled={!unlocked}
                      className={`size-10 rounded-full border-2 transition-all ${
                        config.skinTone === tone.id
                          ? "border-[var(--gold-bright)] ring-2 ring-[var(--glow-gold)] scale-110"
                          : unlocked
                            ? "border-transparent hover:border-muted-foreground/30"
                            : "border-dashed border-border opacity-50 cursor-not-allowed"
                      }`}
                      style={{ backgroundColor: tone.hex }}
                      title={unlocked ? tone.label : getUnlockDescription(tone) ?? tone.label}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {tab === "hair" && (
            <ItemGrid
              items={HAIR_STYLES}
              selected={config.hairStyle}
              onSelect={(id) => update({ hairStyle: id })}
              level={level}
              earnedBadgeIds={earnedBadgeIds}
              questUnlockedItems={questUnlockedSet}
            />
          )}

          {tab === "outfit" && (
            <ItemGrid
              items={OUTFITS}
              selected={config.outfit}
              onSelect={(id) => update({ outfit: id })}
              level={level}
              earnedBadgeIds={earnedBadgeIds}
              questUnlockedItems={questUnlockedSet}
            />
          )}

          {tab === "legwear" && (
            <ItemGrid
              items={LEGWEAR}
              selected={config.legwear}
              onSelect={(id) => update({ legwear: id })}
              level={level}
              earnedBadgeIds={earnedBadgeIds}
              questUnlockedItems={questUnlockedSet}
            />
          )}

          {tab === "boots" && (
            <ItemGrid
              items={BOOTS}
              selected={config.boots}
              onSelect={(id) => update({ boots: id })}
              level={level}
              earnedBadgeIds={earnedBadgeIds}
              questUnlockedItems={questUnlockedSet}
            />
          )}

          {tab === "accessory" && (
            <NullableItemGrid
              items={ACCESSORIES}
              selected={config.accessory}
              onSelect={(id) => update({ accessory: id })}
              level={level}
              earnedBadgeIds={earnedBadgeIds}
              questUnlockedItems={questUnlockedSet}
            />
          )}

          {tab === "companion" && (
            <NullableItemGrid
              items={COMPANIONS}
              selected={config.companion}
              onSelect={(id) => {
                const palette = id ? getCompanionColors(id) : [];
                update({
                  companion: id,
                  companionColor: palette[0]?.hex ?? DEFAULT_AVATAR.companionColor,
                });
              }}
              level={level}
              earnedBadgeIds={earnedBadgeIds}
              questUnlockedItems={questUnlockedSet}
            />
          )}

          {tab === "background" && (
            <ItemGrid
              items={BACKGROUNDS}
              selected={config.background}
              onSelect={(id) => update({ background: id })}
              level={level}
              earnedBadgeIds={earnedBadgeIds}
              questUnlockedItems={questUnlockedSet}
            />
          )}
        </div>

        {/* Fixed color picker — always visible below items */}
        {tab === "hair" && (
          <div className="mt-3 border-t border-[var(--gold-dim)] pt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Hue</p>
            <ColorGrid colors={HAIR_COLORS} selected={config.hairColor} onSelect={(hex) => update({ hairColor: hex })} />
          </div>
        )}
        {tab === "outfit" && (
          <div className="mt-3 border-t border-[var(--gold-dim)] pt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Dye</p>
            <ColorGrid colors={OUTFIT_COLORS} selected={config.outfitColor} onSelect={(hex) => update({ outfitColor: hex })} />
          </div>
        )}
        {tab === "legwear" && (
          <div className="mt-3 border-t border-[var(--gold-dim)] pt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Dye</p>
            <ColorGrid colors={LEGWEAR_COLORS} selected={config.legwearColor} onSelect={(hex) => update({ legwearColor: hex })} />
          </div>
        )}
        {tab === "boots" && (
          <div className="mt-3 border-t border-[var(--gold-dim)] pt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Dye</p>
            <ColorGrid colors={BOOTS_COLORS} selected={config.bootsColor} onSelect={(hex) => update({ bootsColor: hex })} />
          </div>
        )}
        {tab === "accessory" && config.accessory && (
          <div className="mt-3 border-t border-[var(--gold-dim)] pt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Tint</p>
            <ColorGrid colors={ACCESSORY_COLORS} selected={config.accessoryColor} onSelect={(hex) => update({ accessoryColor: hex })} />
          </div>
        )}
        {tab === "companion" && config.companion && getCompanionColors(config.companion).length > 0 && (
          <div className="mt-3 border-t border-[var(--gold-dim)] pt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Coat</p>
            <ColorGrid colors={getCompanionColors(config.companion)} selected={config.companionColor} onSelect={(hex) => update({ companionColor: hex })} />
          </div>
        )}
        {tab === "background" && (
          <div className="mt-3 border-t border-[var(--gold-dim)] pt-3 space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Crest Color</p>
            <ColorGrid colors={BACKGROUND_COLORS} selected={config.backgroundColor} onSelect={(hex) => update({ backgroundColor: hex })} />
          </div>
        )}
      </div>

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={randomize}>
          Roll the Dice
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={() => {
          setConfig(
            currentConfig
              ? normalizeAvatarConfig(currentConfig as unknown as Record<string, unknown>)
              : DEFAULT_AVATAR
          );
          setError(null);
          onClose();
        }}>
          Withdraw
        </Button>
        <Button size="sm" onClick={save} disabled={isPending}>
          {isPending ? "Enchanting..." : "Save Hero Look"}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}

// ── Reusable sub-components ──────────────────────────────────

function ItemGrid({
  items,
  selected,
  onSelect,
  level,
  earnedBadgeIds,
  questUnlockedItems,
}: {
  items: AvatarItem[];
  selected: string;
  onSelect: (id: string) => void;
  level: number;
  earnedBadgeIds: string[];
  questUnlockedItems?: Set<string>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const unlocked = isUnlocked(item, level, earnedBadgeIds, questUnlockedItems);
        const desc = getUnlockDescription(item);
        return (
          <button
            key={item.id}
            onClick={() => unlocked && onSelect(item.id)}
            disabled={!unlocked}
            className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
              selected === item.id
                ? "border-[var(--gold-border)] bg-[rgba(201,168,76,0.1)] text-[var(--gold-bright)] shadow-[0_0_8px_-2px_var(--glow-gold)]"
                : unlocked
                  ? "border-border text-muted-foreground hover:bg-[rgba(201,168,76,0.06)] hover:border-[var(--gold-dim)]"
                  : "border-dashed border-border text-muted-foreground/50 cursor-not-allowed"
            }`}
            title={unlocked ? item.label : desc ?? undefined}
          >
            {item.label}
            {!unlocked && (
              <span className="ml-1 text-[10px] opacity-60">🔒</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function NullableItemGrid({
  items,
  selected,
  onSelect,
  level,
  earnedBadgeIds,
  questUnlockedItems,
}: {
  items: AvatarItem[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  level: number;
  earnedBadgeIds: string[];
  questUnlockedItems?: Set<string>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onSelect(null)}
        className={`rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
          selected === null || selected === undefined
            ? "border-[var(--gold-border)] bg-[rgba(201,168,76,0.1)] text-[var(--gold-bright)] shadow-[0_0_8px_-2px_var(--glow-gold)]"
            : "border-border text-muted-foreground hover:bg-[rgba(201,168,76,0.06)] hover:border-[var(--gold-dim)]"
        }`}
      >
        None
      </button>
      {items.map((item) => {
        const unlocked = isUnlocked(item, level, earnedBadgeIds, questUnlockedItems);
        const desc = getUnlockDescription(item);
        return (
          <button
            key={item.id}
            onClick={() => unlocked && onSelect(item.id)}
            disabled={!unlocked}
            className={`relative rounded-lg border px-3 py-2 text-xs font-medium transition-all ${
              selected === item.id
                ? "border-[var(--gold-border)] bg-[rgba(201,168,76,0.1)] text-[var(--gold-bright)] shadow-[0_0_8px_-2px_var(--glow-gold)]"
                : unlocked
                  ? "border-border text-muted-foreground hover:bg-[rgba(201,168,76,0.06)] hover:border-[var(--gold-dim)]"
                  : "border-dashed border-border text-muted-foreground/50 cursor-not-allowed"
            }`}
            title={unlocked ? item.label : desc ?? undefined}
          >
            {item.label}
            {!unlocked && (
              <span className="ml-1 text-[10px] opacity-60">🔒</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ColorGrid({
  colors,
  selected,
  onSelect,
}: {
  colors: ColorOption[];
  selected: string;
  onSelect: (hex: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {colors.map((color) => (
        <button
          key={color.id}
          onClick={() => onSelect(color.hex)}
          className={`size-8 rounded-full border-2 transition-all ${
            selected === color.hex
              ? "border-[var(--gold-bright)] ring-2 ring-[var(--glow-gold)] scale-110"
              : "border-transparent hover:border-muted-foreground/30"
          }`}
          style={{ backgroundColor: color.hex }}
          title={color.label}
        />
      ))}
    </div>
  );
}
