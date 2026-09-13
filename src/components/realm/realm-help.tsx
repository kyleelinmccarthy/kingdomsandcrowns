"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import type { RealmDepth } from "@/lib/realm/depth";
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

/**
 * The number keys the ability bar really binds, written out the way a child reads a list.
 *
 * `spellSlots(level)` is `min(MAX, 4 + floor(level/10))`, so from level 10 a hero has a
 * fifth page, the bar draws its keycap and the handler binds `5` — while this card said
 * "1, 2, 3 or 4" from a literal. The count comes from `shownPages` in spell-bar.tsx, so the
 * sentence counts the control instead of remembering it.
 */
export function castKeyList(spellPages: number): string {
  const keys = Array.from({ length: Math.max(1, spellPages) }, (_, i) => String(i + 1));
  if (keys.length === 1) return keys[0];
  return `${keys.slice(0, -1).join(", ")} or ${keys[keys.length - 1]}`;
}

/** The controls, in the words the hero's input mode needs. Written for a reader of about eight. */
export function helpGroups(touch: boolean, ceremony: boolean, spellPages: number): HelpGroup[] {
  const groups: HelpGroup[] = [
    // Tapping the ground used to walk the hero there; Task 10 deleted that verb entirely, so
    // the only way to move, on either input mode, is the one the world still answers to.
    { icon: "compass", title: "Move", text: touch ? "Drag the stick to walk." : "Use W, A, S and D to walk." },
    // Second, because the card has never said what the world is for. The gold light is the
    // beacon over the objective site and the edge arrow that points at it when it is off-screen.
    { icon: "map", title: "Where to go", text: "Follow the gold light. Someone is waiting there." },
    { icon: "scroll", title: "Talk", text: touch ? "Stand close to someone and tap Talk." : "Stand close to someone and press E." },
    {
      // No stakes clause. Nothing a trouble does touches a site, a building, a villager or the
      // kingdom — the worst it does is a 1.5-second dazzle — so the card says nothing about
      // stakes, which is true, rather than something false. Slice 8 writes the replacement when
      // clearing a trouble actually earns Realm minutes.
      //
      // One verb, not two: a number key (or a tapped spell page) CASTS by itself — it does not
      // merely arm a page for a second press to fire — so the card no longer reads "pick a
      // page, then click where it should go", which is exactly the two-step model a reviewer
      // called out as still taught here after Task 9 made a single press enough.
      icon: "sparkles",
      title: "Cast",
      text: touch
        ? "Tap a spell page to cast it, or tap Cast to cast again. Tap Put away when you are done."
        : `Press ${castKeyList(spellPages)} — or click what you want to hit. Press Escape to put it away.`,
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
  onReplayTutorial,
  spellPages,
  onClose,
}: {
  touch: boolean;
  ceremony: boolean;
  readAloud: boolean;
  depth: RealmDepth;
  onSetDepth: ((d: RealmDepth) => void) | null;
  // A callback, not `setTutorialStep` itself: the card must stay testable without mocking a
  // "use server" file, and the shell already owns `childId` and the local tutorial state this
  // needs to reset. Typed `() => void` like `onSetDepth` above — the shell's real
  // implementation hands back the write's promise, wrapped in Promise.resolve below.
  onReplayTutorial: (() => void) | null;
  /** How many pages the ability bar draws, so the Cast line names the keys it really binds. */
  spellPages: number;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const depthButton = useRef<HTMLButtonElement>(null);
  const replayButton = useRef<HTMLButtonElement>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const groups = helpGroups(touch, ceremony, spellPages);
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
  // `aria-disabled` and an early return, never `disabled`: this is the escape hatch for a
  // hero who finds the simple view too small, and it is the focused element when they press
  // it. A browser blurs a disabled element to <body>, and Escape and the Tab trap both live
  // on the panel div's onKeyDown, so disabling it mid-save left the card keyboard-dead —
  // no Escape, no trap — until a pointer rescued it. Left enabled, focus never moves, and a
  // second press while the write is in flight is refused here instead.
  const onDepthPress = () => {
    if (!onSetDepth || saving) return;
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

  // The reset already happened, synchronously, inside `onReplayTutorial` itself — the shell
  // writes the local tutorial state back to step one before it ever calls `setTutorialStep`,
  // the same "state here, persist fire-and-forget" split `signal` and `skipTutorial` use in
  // realm-shell.tsx. So the card closes either way rather than reporting a save that missed:
  // there is nothing left for a failure to undo, and nothing a child could do about it anyway.
  // `aria-disabled` and an early return, never `disabled` — same reason as the view control
  // above: this is the focused element when it is pressed, and disabling it mid-write would
  // blur focus to <body> and strand a keyboard hero past both Escape and the Tab trap.
  const onReplayPress = () => {
    if (!onReplayTutorial || replaying) return;
    setReplaying(true);
    const settle = () => {
      setReplaying(false);
      onClose();
    };
    void Promise.resolve(onReplayTutorial()).then(settle, settle);
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
            // Tab cycles the card's own controls — Close, the view control and the replay
            // control, whichever of the last two are offered — and never wanders out into the
            // HUD behind the card.
            e.preventDefault();
            const stops = [closeButton.current, depthButton.current, replayButton.current].filter((el): el is HTMLButtonElement => el !== null);
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
            <Button ref={depthButton} variant="outline" size="lg" aria-disabled={saving} className={saving ? "opacity-60" : undefined} onClick={onDepthPress}>{control.label}</Button>
            <p className="text-sm text-muted-foreground">{control.hint}</p>
            {saveFailed && <p role="alert" className="text-sm text-destructive">{DEPTH_SAVE_FAILED}</p>}
          </div>
        )}
        {onReplayTutorial && (
          <div className="flex flex-col gap-1 border-t border-[var(--gold-dim)] pt-3">
            <Button ref={replayButton} variant="outline" size="lg" aria-disabled={replaying} className={replaying ? "opacity-60" : undefined} onClick={onReplayPress}>Show me the tutorial again</Button>
          </div>
        )}
      </div>
    </div>
  );
}
