"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import type { RealmDepth } from "@/lib/realm/depth";
import { SIDE_QUEST_LOWER } from "@/lib/utils/side-quest-copy";
import { speak } from "@/lib/utils/speech";

export type HelpGroup = { icon: GameIconName; title: string; text: string };

/** The write did not land, so the card says so rather than showing a view the column does not hold. */
const DEPTH_SAVE_FAILED = "That didn't save. Try again.";

/**
 * The hero's own escape hatch. The button names the outcome, never the axis: "depth",
 * "simple mode" and "advanced" are words no child reads. Slice 9 moves this control onto
 * the real opening gate and off the card.
 */
const DEPTH_CONTROL: Record<RealmDepth, { next: RealmDepth; label: string; hint: string }> = {
  simple: { next: "full", label: "Show me everything", hint: "More numbers, more to do. You can change it back." },
  full: { next: "simple", label: "Keep it simple", hint: "Fewer numbers, one thing at a time." },
};

/** The controls, in the words the hero's input mode needs. Written for a reader of about eight. */
export function helpGroups(touch: boolean, ceremony: boolean): HelpGroup[] {
  const groups: HelpGroup[] = [
    { icon: "compass", title: "Move", text: touch ? "Drag the stick, or tap where you want to go." : "WASD or the arrow keys, or click where you want to go." },
    // Second, because the card has never said what the world is for. The gold light is the
    // beacon over the objective site and the edge arrow that points at it when it is off-screen.
    { icon: "map", title: "Where to go", text: "Follow the gold light. Someone is waiting there." },
    {
      icon: "scroll",
      title: "Talk",
      text: touch
        ? `Walk up to a villager and tap Talk. They'll give you a ${SIDE_QUEST_LOWER}.`
        : `Walk up to a villager and press Enter, or tap Talk. They'll give you a ${SIDE_QUEST_LOWER}.`,
    },
    {
      // No stakes clause. Nothing a trouble does touches a site, a building, a villager or the
      // kingdom — the worst it does is a 1.5-second dazzle — so the card says nothing about
      // stakes, which is true, rather than something false. Slice 8 writes the replacement when
      // clearing a trouble actually earns Realm minutes.
      icon: "sparkles",
      title: "Cast",
      text: touch
        ? "Tap a spell page, then tap where the spell should go."
        : "Pick a spell page (1, 2, 3, 4) or tap it, then click where the spell should go. Space aims at the nearest trouble.",
    },
    {
      icon: "map",
      title: "Ride and recess",
      text: touch ? "Tap Ride to get on your mount. At recess, collect gleams and run the lap ring." : "Press M or tap Ride to get on your mount. At recess, collect gleams and run the lap ring.",
    },
  ];
  if (ceremony) groups.push({ icon: "crown", title: "Ceremony", text: "Skip the ceremony with Escape or the Skip button." });
  return groups;
}

/** The how-to-play card: a dialog inside .realm-root; the world's controls are disabled while it is open. */
export function RealmHelp({
  touch,
  ceremony,
  readAloud,
  depth,
  onSetDepth,
  onClose,
}: {
  touch: boolean;
  ceremony: boolean;
  readAloud: boolean;
  depth: RealmDepth;
  onSetDepth: ((d: RealmDepth) => void) | null;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const depthButton = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const groups = helpGroups(touch, ceremony);
  const control = DEPTH_CONTROL[depth];

  useEffect(() => {
    panel.current?.focus();
  }, []);

  // Read-aloud speaks the whole card once; the effect only starts speech, it sets no state.
  useEffect(() => {
    if (readAloud) speak(groups.map((g) => `${g.title}. ${g.text}`).join(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readAloud]);

  // The prop is typed `(d: RealmDepth) => void` — the frozen interface — but the shell's
  // implementation hands back the write's promise. Wrapping the call in Promise.resolve is
  // what lets the card wait for the column: on a rejection the view does not move and the
  // card says so, so the control never lies about what was stored.
  const onDepthPress = () => {
    if (!onSetDepth) return;
    setSaving(true);
    setSaveFailed(false);
    void Promise.resolve(onSetDepth(control.next)).then(
      () => setSaving(false),
      () => {
        setSaving(false);
        setSaveFailed(true);
      }
    );
  };

  return (
    <div className="realm-overlay" onPointerDown={(e) => e.stopPropagation()}>
      <div
        ref={panel}
        className="realm-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="realm-help-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          } else if (e.key === "Tab") {
            // Tab cycles the card's own controls — Close, and the view control when it is
            // offered — and never wanders out into the HUD behind the card.
            e.preventDefault();
            const stops = [closeButton.current, depthButton.current].filter((el): el is HTMLButtonElement => el !== null);
            if (stops.length === 0) return;
            const at = stops.indexOf(document.activeElement as HTMLButtonElement);
            const step = e.shiftKey ? stops.length - 1 : 1;
            stops[at === -1 ? (e.shiftKey ? stops.length - 1 : 0) : (at + step) % stops.length].focus();
          }
        }}
      >
        <div className="realm-panel-head">
          <GameIcon name="book" className="size-6 text-[var(--gold-bright)]" />
          <h2 id="realm-help-title" className="text-lg font-bold">How to play</h2>
          <Button ref={closeButton} size="sm" variant="ghost" className="ml-auto" onClick={onClose}>Close</Button>
        </div>
        <ul className="realm-help-list">
          {groups.map((g) => (
            <li key={g.title} className="realm-help-item">
              <GameIcon name={g.icon} className="size-6 shrink-0 text-[var(--gold-bright)]" />
              <div>
                <p className="font-medium">{g.title}</p>
                <p className="text-sm text-muted-foreground">{g.text}</p>
              </div>
            </li>
          ))}
        </ul>
        {onSetDepth && (
          <div className="flex flex-col gap-1 border-t border-[var(--gold-dim)] pt-3">
            <Button ref={depthButton} variant="outline" size="lg" disabled={saving} onClick={onDepthPress}>{control.label}</Button>
            <p className="text-sm text-muted-foreground">{control.hint}</p>
            {saveFailed && <p role="alert" className="text-sm text-destructive">{DEPTH_SAVE_FAILED}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
