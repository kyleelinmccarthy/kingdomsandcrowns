import Link from "next/link";
import { requireSession } from "@/lib/auth/session";
import { resolveActiveChild } from "@/lib/actions/resolve-child";
import { getCastle } from "@/lib/actions/castle";
import { ChildSelector } from "@/components/child-selector";
import { GameFrame } from "@/components/game-frame";
import { GameIcon, CASTLE_ICONS } from "@/components/game-icon";
import { CASTLE_TYPES } from "@/lib/utils/avatar-catalog";
import { CastleActions } from "./castle-actions";

export default async function CastlePage({
  searchParams,
}: {
  searchParams: Promise<{ child?: string }>;
}) {
  await requireSession();
  const { child: selectedChildId } = await searchParams;
  const { child: activeChild, allChildren, isChildView } = await resolveActiveChild(selectedChildId);

  if (!activeChild) {
    return (
      <div className="space-y-6">
        <h1 className="page-title text-4xl" style={{ fontFamily: "var(--font-cinzel)" }}>
          The Castle
        </h1>
        <GameFrame>
          <div className="py-8 text-center">
            <GameIcon name="castle" className="mx-auto size-10 text-[var(--gold-bright)] drop-shadow-[0_0_6px_var(--glow-gold)]" />
            <p className="mt-4 text-lg font-medium">No heroes found</p>
            <p className="mt-2 text-sm text-muted-foreground">
              <Link href="/settings" className="text-primary hover:underline">
                Summon a hero
              </Link>{" "}
              to begin building.
            </p>
          </div>
        </GameFrame>
      </div>
    );
  }

  const level = Math.floor(activeChild.currentXp / 100) + 1;
  const castle = await getCastle(activeChild.id);

  // Castle not yet unlocked
  if (level < 50 && !castle) {
    return (
      <div className="space-y-6">
        <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="page-title text-4xl" style={{ fontFamily: "var(--font-cinzel)" }}>
              {isChildView ? "My Castle" : "The Castle"}
            </h1>
            <p className="mt-1 text-muted-foreground">
              A stronghold awaits the worthy...
            </p>
          </div>
          {!isChildView && allChildren.length > 1 && (
            <ChildSelector children={allChildren} selectedId={activeChild.id} />
          )}
        </div>

        <GameFrame>
          <div className="py-12 text-center">
            <GameIcon name="castle" className="mx-auto size-16 text-[var(--gold-bright)] drop-shadow-[0_0_6px_var(--glow-gold)]" />
            <p className="mt-4 text-xl font-bold font-brand" style={{ color: "var(--gold-bright)" }}>
              Castle Locked
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Reach <span className="font-bold text-foreground">Level 50</span> to unlock your castle.
            </p>
            <div className="mt-4 inline-flex items-center gap-3 rounded-lg border border-[var(--gold-dim)] bg-[rgba(201,168,76,0.06)] px-4 py-3">
              <span className="text-2xl font-bold" style={{ color: "var(--gold-bright)" }}>{level}</span>
              <div className="text-left">
                <p className="text-xs text-muted-foreground">Current Level</p>
                <div className="xp-bar-track mt-1" style={{ width: "8rem" }}>
                  <div className="xp-bar-fill" style={{ width: `${((level - 1) / 49) * 100}%` }} />
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground">{50 - level} levels to go</p>
              </div>
            </div>
            <div className="mt-6 text-left max-w-sm mx-auto space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Castle Upgrades</p>
              {CASTLE_TYPES.map((ct) => (
                <div key={ct.id} className={`flex items-center gap-2 text-xs ${level >= ct.levelRequired ? "" : "opacity-40"}`}>
                  <GameIcon name={level >= ct.levelRequired ? "check" : "lock"} className="size-4 text-[var(--gold-bright)]" />
                  <span className="font-medium">Lv.{ct.levelRequired}:</span>
                  <span className="text-muted-foreground">{ct.label} — {ct.description}</span>
                </div>
              ))}
            </div>
          </div>
        </GameFrame>
      </div>
    );
  }

  // Castle available or already exists
  const castleType = castle
    ? CASTLE_TYPES.find((t) => t.id === castle.type) ?? CASTLE_TYPES[0]
    : CASTLE_TYPES[0];

  const availableUpgrades = CASTLE_TYPES.filter(
    (t) => level >= t.levelRequired && t.id !== castle?.type
  );

  return (
    <div className="space-y-6">
      <div className="page-banner flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title text-4xl" style={{ fontFamily: "var(--font-cinzel)" }}>
            {isChildView ? "My Castle" : "The Castle"}
          </h1>
          <p className="mt-1 text-muted-foreground">
            {isChildView
              ? "Your mighty stronghold!"
              : `${activeChild.displayName}'s stronghold`}
          </p>
        </div>
        {!isChildView && allChildren.length > 1 && (
          <ChildSelector children={allChildren} selectedId={activeChild.id} />
        )}
      </div>

      {/* Castle Display */}
      <GameFrame>
        <div className="py-8 text-center">
          <GameIcon name={CASTLE_ICONS[castle?.type ?? "campsite"] ?? "castle"} className="mx-auto size-24 text-[var(--gold-bright)] drop-shadow-[0_0_12px_var(--glow-gold)]" />
          <p className="mt-4 text-2xl font-bold font-brand" style={{ color: "var(--gold-bright)" }}>
            {castle?.name ?? `${activeChild.displayName}'s Castle`}
          </p>
          <p className="mt-1 text-lg font-medium">{castleType.label}</p>
          <p className="mt-1 text-sm text-muted-foreground">{castleType.description}</p>
        </div>
      </GameFrame>

      {/* Castle Actions (client component) */}
      <CastleActions
        childId={activeChild.id}
        castle={castle}
        level={level}
        availableUpgrades={availableUpgrades}
        isChildView={isChildView}
      />

      {/* Future upgrades */}
      {CASTLE_TYPES.filter((t) => level < t.levelRequired).length > 0 && (
        <GameFrame title="Future Upgrades" icon={<GameIcon name="crystalBall" className="size-5 text-[var(--gold-bright)]" />}>
          <div className="space-y-2">
            {CASTLE_TYPES.filter((t) => level < t.levelRequired).map((ct) => (
              <div key={ct.id} className="flex items-center gap-2 text-xs opacity-50">
                <GameIcon name="lock" className="size-4 text-[var(--gold-bright)]" />
                <span className="font-medium">Level {ct.levelRequired}:</span>
                <span className="text-muted-foreground">{ct.label} — {ct.description}</span>
              </div>
            ))}
          </div>
        </GameFrame>
      )}
    </div>
  );
}
