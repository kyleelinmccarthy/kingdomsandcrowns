"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import { SIDE_QUEST_LOWER } from "@/lib/utils/side-quest-copy";
import { speak } from "@/lib/utils/speech";

export type HelpGroup = { icon: GameIconName; title: string; text: string };

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
export function RealmHelp({ touch, ceremony, readAloud, onClose }: { touch: boolean; ceremony: boolean; readAloud: boolean; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const groups = helpGroups(touch, ceremony);

  useEffect(() => {
    panel.current?.focus();
  }, []);

  // Read-aloud speaks the whole card once; the effect only starts speech, it sets no state.
  useEffect(() => {
    if (readAloud) speak(groups.map((g) => `${g.title}. ${g.text}`).join(" "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readAloud]);

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
            e.preventDefault(); // the only control is Close; Tab must not wander into the HUD
            closeButton.current?.focus();
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
      </div>
    </div>
  );
}
