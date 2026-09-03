"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import { saveSpell, clearSpell, type Spellbook, type SpellRecord } from "@/lib/actions/spells";
import {
  SPELL_ELEMENTS,
  SPELL_FORMS,
  SPELL_MODIFIERS,
  describeSpell,
  findElement,
  spellUnlockHint,
  type SpellParts,
  type SpellUnlock,
} from "@/lib/utils/spell-catalog";
import { spellNameOptions, defaultSpellName, displaySpellName } from "@/lib/utils/spell-names";

type Props = { childId: string; heroName: string; book: Spellbook; canEdit: boolean };

type Draft = { elementId: string | null; formId: string | null; modifierId: string | null; adjective: string; noun: string };

function draftFromSpell(spell: SpellRecord | undefined, firstElement: string | null, firstForm: string | null): Draft {
  if (spell) {
    return { elementId: spell.elementId, formId: spell.formId, modifierId: spell.modifierId, adjective: spell.adjective, noun: spell.noun };
  }
  const parts = firstElement && firstForm ? { elementId: firstElement, formId: firstForm, modifierId: null } : null;
  const name = parts ? defaultSpellName(parts) : null;
  return { elementId: firstElement, formId: firstForm, modifierId: null, adjective: name?.adjective ?? "", noun: name?.noun ?? "" };
}

function partsOf(d: Draft): SpellParts | null {
  return d.elementId && d.formId ? { elementId: d.elementId, formId: d.formId, modifierId: d.modifierId } : null;
}

export function SpellbookBuilder({ childId, heroName, book, canEdit }: Props) {
  const router = useRouter();
  const unlocked = new Set(book.unlocked);
  const ctx = { level: book.level, earnedBadgeIds: [] as string[], questUnlockedIds: new Set<string>(), schoolCounts: book.schoolCounts };
  const spellsBySlot = new Map(book.spells.map((s) => [s.slot, s]));
  const firstElement = SPELL_ELEMENTS.find((p) => unlocked.has(p.id))?.id ?? null;
  const firstForm = SPELL_FORMS.find((p) => unlocked.has(p.id))?.id ?? null;
  const firstEmpty = Array.from({ length: book.slots }, (_, i) => i + 1).find((n) => !spellsBySlot.has(n)) ?? 1;

  const [slot, setSlot] = useState(firstEmpty);
  const [draft, setDraft] = useState<Draft>(() => draftFromSpell(spellsBySlot.get(firstEmpty), firstElement, firstForm));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const parts = partsOf(draft);
  const names = parts ? spellNameOptions(parts) : null;

  // The hint copy only needs level and school counts; badge and quest unlocks
  // are already folded into `book.unlocked`, so a sealed part with one of
  // those unlock kinds still gets the right sentence.
  function hintFor(unlock: SpellUnlock, id: string): string | null {
    if (unlocked.has(id)) return null;
    return spellUnlockHint(unlock, ctx, book.subjectNamesBySchool, id) ?? "Sealed for now.";
  }

  function choosePage(n: number) {
    setSlot(n);
    setDraft(draftFromSpell(spellsBySlot.get(n), firstElement, firstForm));
    setError("");
  }

  /** Changing a part resets the name to the bank's first words for the new parts. */
  function updateParts(patch: Partial<Pick<Draft, "elementId" | "formId" | "modifierId">>) {
    setDraft((d) => {
      const next = { ...d, ...patch };
      const p = partsOf(next);
      const name = p ? defaultSpellName(p) : null;
      return { ...next, adjective: name?.adjective ?? "", noun: name?.noun ?? "" };
    });
  }

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  const canSave = canEdit && !!parts && !!draft.adjective && !!draft.noun && !busy;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <GameFrame title={`${heroName}'s Pages`} icon={<GameIcon name="book" className="size-4 text-[var(--gold-bright)]" />}>
        <ul className="space-y-2">
          {Array.from({ length: book.slots }, (_, i) => i + 1).map((n) => {
            const spell = spellsBySlot.get(n);
            const spellParts = spell ? { elementId: spell.elementId, formId: spell.formId, modifierId: spell.modifierId } : null;
            return (
              <li key={n} className="flex items-start gap-2">
                <button
                  type="button"
                  aria-label={`Page ${n}`}
                  aria-pressed={slot === n}
                  onClick={() => choosePage(n)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-left ${slot === n ? "border-[var(--gold-border)] bg-muted/40" : "border-gold-dim bg-muted/20"}`}
                >
                  <p className="text-xs text-muted-foreground">Page {n}</p>
                  {spell && spellParts ? (
                    <>
                      <p className="font-medium" style={{ color: findElement(spell.elementId)?.color }}>
                        {displaySpellName(spellParts, spell.adjective, spell.noun)}
                      </p>
                      <p className="text-xs text-muted-foreground">{describeSpell(spellParts)}</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Empty page</p>
                  )}
                </button>
                {spell && canEdit && (
                  <Button size="xs" variant="ghost" aria-label={`Clear page ${n}`} disabled={busy} onClick={() => run(() => clearSpell(childId, n))}>
                    Clear
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </GameFrame>

      <GameFrame title="Weave a Spell" icon={<GameIcon name="crystalBall" className="size-4 text-[var(--gold-bright)]" />}>
        {error && <div className="mb-3 rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>}
        <div className="space-y-5">
          <PartGrid
            title="Elements"
            kind="Element"
            tiles={SPELL_ELEMENTS.map((p) => ({ id: p.id, label: p.label, color: p.color, icon: "sparkles" as GameIconName, hint: hintFor(p.unlock, p.id) }))}
            selectedId={draft.elementId}
            canEdit={canEdit}
            onSelect={(id) => updateParts({ elementId: id })}
          />
          <PartGrid
            title="Forms"
            kind="Form"
            tiles={SPELL_FORMS.map((p) => ({ id: p.id, label: p.label, color: "var(--gold-bright)", icon: p.icon, hint: hintFor(p.unlock, p.id) }))}
            selectedId={draft.formId}
            canEdit={canEdit}
            onSelect={(id) => updateParts({ formId: id })}
          />
          <PartGrid
            title="Modifiers"
            kind="Modifier"
            tiles={[
              { id: null, label: "None", color: "var(--muted-foreground)", icon: "check" as GameIconName, hint: null },
              ...SPELL_MODIFIERS.map((p) => ({ id: p.id as string | null, label: p.label, color: "var(--magic)", icon: p.icon, hint: hintFor(p.unlock, p.id) })),
            ]}
            selectedId={draft.modifierId}
            canEdit={canEdit}
            onSelect={(id) => updateParts({ modifierId: id })}
          />

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</p>
            {names && parts ? (
              <>
                <div className="flex flex-wrap gap-1.5">
                  {names.adjectives.map((w) => (
                    <button key={w} type="button" aria-label={`Adjective ${w}`} aria-pressed={draft.adjective === w} disabled={!canEdit}
                      onClick={() => setDraft((d) => ({ ...d, adjective: w }))}
                      className={`rounded-full border px-2.5 py-1 text-xs ${draft.adjective === w ? "border-[var(--gold-border)] bg-muted/40" : "border-gold-dim"}`}>
                      {w}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {names.nouns.map((w) => (
                    <button key={w} type="button" aria-label={`Noun ${w}`} aria-pressed={draft.noun === w} disabled={!canEdit}
                      onClick={() => setDraft((d) => ({ ...d, noun: w }))}
                      className={`rounded-full border px-2.5 py-1 text-xs ${draft.noun === w ? "border-[var(--gold-border)] bg-muted/40" : "border-gold-dim"}`}>
                      {w}
                    </button>
                  ))}
                </div>
                <p className="text-sm">
                  <span className="font-medium">{displaySpellName(parts, draft.adjective, draft.noun)}</span>
                  <span className="text-muted-foreground"> &middot; {describeSpell(parts)}</span>
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Choose an element and a form to name your spell.</p>
            )}
          </div>

          <Button aria-label="Save spell" disabled={!canSave} onClick={() => parts && run(() => saveSpell(childId, slot, { ...parts, adjective: draft.adjective, noun: draft.noun }))}>
            {busy ? "Weaving..." : `Save to page ${slot}`}
          </Button>
        </div>
      </GameFrame>
    </div>
  );
}

type Tile = { id: string | null; label: string; color: string; icon: GameIconName; hint: string | null };

function PartGrid({ title, kind, tiles, selectedId, canEdit, onSelect }: {
  title: string;
  kind: string;
  tiles: Tile[];
  selectedId: string | null;
  canEdit: boolean;
  onSelect: (id: string | null) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {tiles.map((t) => {
          const locked = t.hint !== null;
          const selected = selectedId === t.id;
          return (
            <button
              key={t.id ?? "none"}
              type="button"
              aria-label={`${kind} ${t.label}`}
              aria-pressed={selected}
              aria-disabled={locked}
              disabled={locked || !canEdit}
              onClick={() => onSelect(t.id)}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center ${selected ? "border-[var(--gold-border)] bg-muted/40" : "border-gold-dim bg-muted/20"} ${locked ? "opacity-50" : ""}`}
            >
              <span style={{ color: t.color }}>
                <GameIcon name={locked ? "lock" : t.icon} className="size-5" />
              </span>
              <span className="text-xs font-medium">{t.label}</span>
              {locked && <span className="text-[10px] leading-tight text-muted-foreground">{t.hint}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
