"use client";

/**
 * THE FRAME. Everything drawn over the 3D world that a game needs and a spike did not: what to
 * do next, how much of the village stands, how long is left, the ways out, the E prompt, and
 * every panel that pauses the world — the pause menu, how to play, the empty-page card and the
 * interact card. Plus the two whole screens that stand in front of it: the shut gate and the
 * end of the day's play.
 *
 * It is presentational. Every word it says comes from a pure rule — `frame.ts` for what is new
 * here, `objective.ts`, `depth.ts` and the play clock for what the flat Realm already decided —
 * and every panel is told what to show and what to call when a button is pressed. The state
 * lives in `realm-game.tsx`, which owns the overlay and writes `bus.setPaused` from it.
 *
 * The look is the HUD's: timber planks with a dark edge and a lit top, parchment type, lantern
 * gold. Nothing grey, no hairlines, nothing smaller than a child can read from a metre back.
 * No `three` anywhere in it.
 */

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { Avatar, VillagerFigure } from "@/components/avatar";
import { GameIcon, SPELLBOOK_ICON, type GameIconName } from "@/components/game-icon";
import { formatElapsed, useQuestTimer } from "@/hooks/use-quest-timer";
import type { RealmDepth } from "@/lib/realm/depth";
import type { KingdomState } from "@/lib/realm/kingdom-state";
import type { Objective, ObjectiveState } from "@/lib/realm/objective";
import { villagerById, villagerForBuilding } from "@/lib/realm/villagers";
import type { GateCopy } from "@/lib/realm/play-clock";
import { controlRows, emptyPageCopy, interactVerb, type Viewer } from "@/lib/realm3d/frame";
import { listWords, type SpellHelp } from "@/lib/realm3d/guide";
import type { InteractTarget } from "@/lib/realm3d/hud-bus";
import { pauseCopy, type PauseWhy } from "@/lib/realm3d/pause";
import type { RealmWorld } from "@/lib/realm3d/worldgen";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";
import { CASTLE_TYPES } from "@/lib/utils/avatar-catalog";
import { findBuilding } from "@/lib/utils/kingdom";
import { SIDE_QUEST_LOWER, SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";

/**
 * A button on the HUD must never take focus from a mouse click. The scene listens for Space
 * on the window, and a focused button turns Space into a click — so without this, clicking a
 * spell and then jumping would cast it a second time. Keyboard focus (Tab) is untouched.
 */
export const keepFocusInWorld = (e: React.MouseEvent) => e.preventDefault();

/* ------------------------------------------------------------------ progress */

/**
 * One progress row in the one vocabulary the whole programme uses: pips at simple depth, "2 of
 * 5" at full depth, and the count in the accessible name at both, because a pip is not a
 * substitution for a screen reader.
 */
export function Progress({ done, total, numerals, text, label }: { done: number; total: number; numerals: boolean; text: string; label: string }) {
  return (
    <span className="r3-progress" role="img" aria-label={label}>
      <span className="r3-pips" aria-hidden="true">
        {Array.from({ length: Math.max(0, total) }, (_, i) => (
          <span key={i} className={i < done ? "r3-pip r3-pip--on" : "r3-pip"} />
        ))}
      </span>
      {numerals && <span className="r3-progress-text">{text}</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ objectives */

function ObjectiveRows({ objectives, heroName, visiting, numerals, pet = null }: { objectives: Objective[]; heroName: string; visiting: boolean; numerals: boolean; pet?: string | null }) {
  const [first, ...rest] = objectives;
  if (!first) return null;
  return (
    <>
      <p className="r3-quest-title">
        <GameIcon name={findBuilding(first.buildingId)?.icon ?? "box"} className="r3-quest-icon" />
        {first.label}
      </p>
      {first.villagerName && (
        <p className="r3-quest-line">{visiting ? `${first.villagerName} is waiting for ${heroName}.` : `${first.villagerName} is waiting.`}</p>
      )}
      {first.villagerName && !visiting && (
        <p className="r3-quest-lead">
          <span className="r3-quest-bang" aria-hidden="true">
            !
          </span>
          <span>
            Follow the gold ! and press <b>E</b> to talk.
            {/* The companion leads (`companion-hud.tsx`): the other way to find them, said where the ! is. */}
            {pet && (
              <>
                {" "}
                Or press <b>F</b>, and your {pet} will show you the way.
              </>
            )}
          </span>
        </p>
      )}
      <Progress
        done={first.done}
        total={first.total}
        numerals={numerals}
        text={`${first.done} of ${first.total}`}
        label={`${first.done} of ${first.total} ${SIDE_QUESTS_LOWER} done.`}
      />
      {rest.map((o) => (
        <p key={o.buildingId} className="r3-quest-extra">
          <GameIcon name={findBuilding(o.buildingId)?.icon ?? "box"} className="r3-quest-extra-icon" />
          {o.label} · {o.done} of {o.total}
        </p>
      ))}
    </>
  );
}

/**
 * What to do next — the flat Realm's objective card, driven by the same `objectiveState`, so
 * the card and the glowing site in the world can never disagree. A suggestion, never a gate.
 * A kingdom that failed to load is not a finished kingdom: the card says the villagers are
 * resting rather than telling a child there is nothing to do.
 */
export function ObjectiveCard({
  objective,
  heroName,
  visiting,
  numerals,
  kingdomError,
  onRetry,
  pet = null,
}: {
  objective: ObjectiveState;
  heroName: string;
  visiting: boolean;
  numerals: boolean;
  kingdomError?: string;
  /** Ask for the kingdom again, after a load that failed. */
  onRetry?: () => void;
  /** The child's companion ("Fox"), which can lead them to whoever is waiting (F). */
  pet?: string | null;
}) {
  if (objective.kind === "unknown") {
    if (!kingdomError) return null;
    return (
      <section className="r3-quest r3-plank" aria-label="What to do next">
        <p className="r3-quest-tab">Next {SIDE_QUEST_LOWER}</p>
        <p className="r3-quest-line">{kingdomError}</p>
        {onRetry && (
          <button type="button" className="r3-button r3-quest-retry" onMouseDown={keepFocusInWorld} onClick={onRetry}>
            Try again
          </button>
        )}
      </section>
    );
  }
  return (
    <section className="r3-quest r3-plank" aria-label="What to do next">
      <p className="r3-quest-tab">{objective.kind === "complete" ? "Your village" : `Next ${SIDE_QUEST_LOWER}`}</p>
      {objective.kind === "complete" ? (
        <>
          <p className="r3-quest-title">Every building is built.</p>
          <p className="r3-quest-line">Nothing is waiting. Walk where you like.</p>
        </>
      ) : (
        <ObjectiveRows objectives={objective.objectives} heroName={heroName} visiting={visiting} numerals={numerals} pet={pet} />
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ the village */

/**
 * How much of the village stands: "Emma — 0 of 8 built", bottom left, as in the flat Realm.
 * Absent when the kingdom did not load — a zero there would be a lie.
 */
export function VillagePlank({ heroName, done, total, numerals }: { heroName: string; done: number; total: number; numerals: boolean }) {
  if (total <= 0) return null;
  return (
    <div className="r3-village r3-plank">
      <GameIcon name="house" className="r3-village-icon" />
      <span className="r3-village-text">
        <span className="r3-village-name">{heroName}&rsquo;s village</span>
        <Progress done={done} total={total} numerals={numerals} text={`${done} of ${total} built`} label={`${done} of ${total} buildings built.`} />
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ the clock and the ways out */

/**
 * A running chore timer, re-admitted to the Realm: every other app popup is hidden while the
 * Realm is open, and this is the one whose whole purpose is to tell a child their chore ran
 * out. Its own component, so its 1 Hz tick re-renders a chip and nothing else.
 */
function QuestTimerChip() {
  const { activeTimer, elapsedSeconds, isPaused } = useQuestTimer();
  if (!activeTimer) return null;
  const elapsed = formatElapsed(elapsedSeconds);
  return (
    <span className="r3-chip" role="img" aria-label={`${isPaused ? "Quest timer paused" : "Quest timer"}: ${elapsed}`}>
      <GameIcon name="timer" className="r3-chip-icon" />
      {elapsed}
    </span>
  );
}

export function ClockCorner({
  line,
  warning,
  error,
  notice = null,
  onRetry,
  onHelp,
  onMenu,
  leaveHref,
}: {
  line: string;
  /** The last minute: the plank turns ember red, and says so. */
  warning: boolean;
  error: string;
  /** A line from outside the game that a child must still hear, like a chore timer finishing. */
  notice?: ReactNode;
  onRetry: () => void;
  onHelp: () => void;
  onMenu: () => void;
  leaveHref: string;
}) {
  return (
    <div className="r3-corner">
      {notice}
      {error && (
        <p className="r3-trouble r3-plank" role="alert">
          {error}{" "}
          <button type="button" className="r3-link-button" onMouseDown={keepFocusInWorld} onClick={onRetry}>
            Try again
          </button>
        </p>
      )}
      <div className="r3-corner-row">
        <QuestTimerChip />
        <div className={`r3-clock r3-plank${warning ? " r3-clock--warning" : ""}`} role="timer" aria-live={warning ? "assertive" : "off"}>
          <GameIcon name="hourglass" className="r3-clock-icon" />
          <span className="r3-clock-text">{line}</span>
        </div>
      </div>
      <div className="r3-corner-row">
        <button type="button" className="r3-round" aria-label="How to play" title="How to play" onMouseDown={keepFocusInWorld} onClick={onHelp}>
          ?
        </button>
        {/* A plain Pause a child can find: the glyph every player knows, the word, and its key. */}
        <button type="button" className="r3-button" title="Pause (P or Esc)" onMouseDown={keepFocusInWorld} onClick={onMenu}>
          <GameIcon name="pause" className="r3-button-icon" /> Pause <span className="r3-button-key">P</span>
        </button>
        {/* A link, so every way out is the ordinary way out: the unmount flushes the clock. */}
        <Link href={leaveHref} className="r3-button r3-button--leave">
          <GameIcon name="door" className="r3-button-icon" /> Leave
        </Link>
      </div>
    </div>
  );
}

/** Top middle, for a grown-up walking a child's Realm: whose it is, and that nothing is spent. */
export function VisitorRibbon({ heroName, children }: { heroName: string; children?: ReactNode }) {
  return (
    <div className="r3-ribbon">
      <GameIcon name="mage" className="r3-ribbon-icon" />
      <span>
        Visiting <b>{heroName}&rsquo;s Realm</b> as the Quest Giver · none of {heroName}&rsquo;s minutes are spent
      </span>
      {children}
    </div>
  );
}

/** "One minute left in the Realm today." — the flat Realm's last-minute line, as a banner. */
export function LastMinute({ text = "One minute left in the Realm today." }: { text?: string } = {}) {
  return (
    <p className="r3-banner" role="alert">
      {text}
    </p>
  );
}

/* ------------------------------------------------------------------ the E prompt */

/**
 * "E Talk to Old Bram". Low in the middle of the screen, above the spell bar, where the eye
 * already is. A button as well as a hint: a child who reaches for the mouse gets the same
 * thing the key gives.
 */
export function InteractPrompt({ target, onPress }: { target: InteractTarget | null; onPress: (t: InteractTarget) => void }) {
  if (!target) return null;
  return (
    <button type="button" className="r3-prompt" onMouseDown={keepFocusInWorld} onClick={() => onPress(target)}>
      <span className="r3-prompt-key">E</span>
      <span className="r3-prompt-text">{interactVerb(target)}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ panels */

/**
 * Where the keyboard lands when a panel opens: a control marked `data-autofocus`, else the first
 * button or link that is NOT one of a setting's choices (`role="group"`). A stray Enter or Space
 * on a setting writes it — "Keep it simple" on the welcome stuck a child in simple view — while
 * on the panel's own action it only does what the child meant.
 */
export function firstFocus(root: HTMLElement): HTMLElement | null {
  const marked = root.querySelector<HTMLElement>("[data-autofocus]");
  if (marked) return marked;
  for (const el of root.querySelectorAll<HTMLElement>("button, a")) {
    if (!el.closest('[role="group"]')) return el;
  }
  return root.querySelector<HTMLElement>("button, a");
}

/**
 * The frame every panel sits in: a dim over the world, a timber board in the middle, focus on
 * the first button so Enter does the obvious thing. Clicking the dim closes it; Esc is the
 * game's own handler, one level up, so it can go back a step instead of closing everything.
 */
export function Panel({
  title,
  icon,
  onClose,
  children,
  wide = false,
  label,
  className = "",
}: {
  title: ReactNode;
  icon?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  label: string;
  className?: string;
}) {
  const board = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (board.current) firstFocus(board.current)?.focus();
  }, []);
  return (
    <div className="r3-dim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={board} className={`r3-board${wide ? " r3-board--wide" : ""}${className ? ` ${className}` : ""}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="r3-board-head">
          {icon}
          <h2 className="r3-board-title">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

export type PauseSettings = {
  depth: RealmDepth | null;
  onDepth: ((next: RealmDepth) => void) | null;
  depthError: string;
  tone: "gentle" | "monsters" | null;
  onTone: ((next: "gentle" | "monsters") => void) | null;
  toneError: string;
  calm: boolean;
};

export function PauseMenu({
  heroName,
  viewer,
  why = "you",
  onResume,
  onControls,
  onWardrobe,
  leaveHref,
  settings,
  selector,
  sound,
  look,
}: {
  heroName: string;
  viewer: Viewer;
  /** Why it paused (`pause.ts`): said on the board when the game paused by itself. */
  why?: PauseWhy;
  /** The Mouse section (`look-controls.tsx`): look speed and Invert up/down, beside Sound. */
  look?: ReactNode;
  onResume: () => void;
  onControls: () => void;
  /** The child's own Realm only: the wardrobe (`wardrobe.tsx`). */
  onWardrobe?: () => void;
  leaveHref: string;
  settings: PauseSettings;
  /** A grown-up's way to visit another child's Realm without leaving first. */
  selector?: ReactNode;
  /** The Sound section (`realm-sound.tsx`): volume, effects, music, mute. */
  sound?: ReactNode;
}) {
  const copy = pauseCopy(why, viewer, heroName);
  return (
    <Panel title={copy.title} label={copy.title} icon={<GameIcon name="hourglass" className="r3-board-icon" />} onClose={onResume}>
      {copy.reason && <p className="r3-board-sub r3-pause-why">{copy.reason}</p>}
      <p className="r3-board-sub">{copy.line}</p>
      <div className="r3-menu">
        <button type="button" className="r3-menu-item r3-menu-item--go" onClick={onResume}>
          <GameIcon name="journey" className="r3-menu-icon" /> {copy.resume}
        </button>
        <button type="button" className="r3-menu-item" onClick={onControls}>
          <GameIcon name="compass" className="r3-menu-icon" /> Controls
        </button>
        {onWardrobe && (
          <button type="button" className="r3-menu-item" onClick={onWardrobe}>
            <GameIcon name="person" className="r3-menu-icon" /> Wardrobe
          </button>
        )}
        <Link href={leaveHref} className="r3-menu-item r3-menu-item--leave">
          <GameIcon name="door" className="r3-menu-icon" /> Leave the Realm
        </Link>
      </div>
      {(settings.onDepth || settings.onTone || settings.calm) && (
        <div className="r3-settings">
          <p className="r3-settings-title">Settings</p>
          {settings.onDepth && settings.depth && (
            <div className="r3-setting">
              <span className="r3-setting-name">How much to show</span>
              <span className="r3-toggle" role="group" aria-label="How much to show">
                <button type="button" aria-pressed={settings.depth === "simple"} onClick={() => settings.onDepth!("simple")}>
                  Keep it simple
                </button>
                <button type="button" aria-pressed={settings.depth === "full"} onClick={() => settings.onDepth!("full")}>
                  Show me everything
                </button>
              </span>
              {settings.depthError && <span className="r3-setting-error">{settings.depthError}</span>}
            </div>
          )}
          {settings.onTone && settings.tone && (
            <div className="r3-setting">
              <span className="r3-setting-name">Troubles look like</span>
              <span className="r3-toggle" role="group" aria-label="Troubles look like">
                <button type="button" aria-pressed={settings.tone === "gentle"} onClick={() => settings.onTone!("gentle")}>
                  Gentle
                </button>
                <button type="button" aria-pressed={settings.tone === "monsters"} onClick={() => settings.onTone!("monsters")}>
                  Monsters
                </button>
              </span>
              {settings.toneError && <span className="r3-setting-error">{settings.toneError}</span>}
            </div>
          )}
          {settings.calm && (
            <p className="r3-setting-note">
              <GameIcon name="moon" className="r3-setting-note-icon" /> Calm motion is on{viewer === "parent" ? " for " + heroName : ""}. A grown-up can change it in Settings.
            </p>
          )}
        </div>
      )}
      {look}
      {sound}
      {selector && (
        <div className="r3-settings">
          <p className="r3-settings-title">Visit another hero</p>
          <div className="r3-selector">{selector}</div>
        </div>
      )}
    </Panel>
  );
}

/** How to play: every control, from the one list the key strip also reads. */
export function HowToPlay({
  slots,
  back,
  onClose,
  onReplay = null,
  mount,
  earning,
  pet,
  ring,
}: {
  slots: number;
  /** A child's F row: their pet's name ("Fox"), or false without one; absent for a visitor. */
  pet?: string | false;
  /** Where the Ring is run, for a child (`recess/copy.ts`'s `ringHelp`); absent for a visitor. */
  ring?: string;
  /**
   * How this child's Realm minutes are earned, from `earningLines` (`lib/realm/spells/bounty.ts`):
   * the one source every surface reads. Absent for a visitor, who earns nothing.
   */
  earning?: readonly string[];
  /** A child's M row: true with a mount to ride, false without one; absent for a visitor. */
  mount?: boolean;
  back: boolean;
  onClose: () => void;
  /** A child's "show me the tutorial again". Absent for a visiting grown-up, who has none. */
  onReplay?: (() => void) | null;
}) {
  return (
    <Panel title="How to play" label="How to play" wide icon={<GameIcon name="scroll" className="r3-board-icon" />} onClose={onClose}>
      <ul className="r3-controls">
        {controlRows(slots, { mount, pet }).map((row) => (
          <li key={row.what} className="r3-control">
            <span className="r3-control-keys">
              {row.keys.map((k) => (
                <kbd key={k} className="r3-kbd">
                  {k}
                </kbd>
              ))}
            </span>
            <span className="r3-control-what">{row.what}</span>
          </li>
        ))}
      </ul>
      <p className="r3-board-sub">
        Follow the gold <b>!</b> — over a villager&rsquo;s head, at the edge of the screen, and on your map. That is who is waiting for you.
        {pet && (
          <>
            {" "}
            Or press <b>F</b>: your {pet} runs ahead to show you the way, and waits for you. Already there? It finds you somewhere new.
          </>
        )}
      </p>
      {ring && <p className="r3-board-sub">{ring}</p>}
      {earning && earning.length > 0 && (
        <p className="r3-board-sub r3-earning">
          <GameIcon name="hourglass" className="r3-earning-icon" /> {earning.join(" ")}
        </p>
      )}
      <div className="r3-board-foot">
        <button type="button" className="r3-menu-item r3-menu-item--go" onClick={onClose}>
          {back ? "Back" : "Play"}
        </button>
        {onReplay && (
          <button type="button" className="r3-menu-item" onClick={onReplay}>
            Show me the tutorial again
          </button>
        )}
      </div>
    </Panel>
  );
}

/** An empty spell page, clicked: how a spell is earned, and the way to the Spellbook. */
export function EmptyPagePanel({
  slot,
  viewer,
  heroName,
  spellbookHref,
  help = null,
  onClose,
}: {
  slot: number;
  viewer: Viewer;
  heroName: string;
  spellbookHref: string;
  /**
   * What THIS child can write today and what they are closest to earning, from the Spellbook's
   * own unlock rules. Null while it loads, or if it could not: the general words stand alone.
   */
  help?: SpellHelp | null;
  onClose: () => void;
}) {
  const copy = emptyPageCopy(slot, viewer, heroName);
  const you = viewer === "parent" ? `${heroName} can` : "You can";
  return (
    <Panel title={copy.title} label={copy.title} icon={<GameIcon name={SPELLBOOK_ICON} className="r3-board-icon" />} onClose={onClose}>
      <div className="r3-page-demo" aria-hidden="true">
        <span className="r3-page-part" style={{ ["--r3-ink" as string]: "#f97316" }}>
          <GameIcon name="fire" className="r3-page-part-icon" />
          Element
        </span>
        <span className="r3-page-plus">+</span>
        <span className="r3-page-part" style={{ ["--r3-ink" as string]: "#f5c04a" }}>
          <GameIcon name="thunderbolt" className="r3-page-part-icon" />
          Shape
        </span>
        <span className="r3-page-plus">=</span>
        <span className="r3-page-part r3-page-part--spell" style={{ ["--r3-ink" as string]: "#f97316" }}>
          <GameIcon name="fire" className="r3-page-part-icon" />
          Spell
        </span>
      </div>
      {copy.lines.map((l) => (
        <p key={l} className="r3-board-line">
          {l}
        </p>
      ))}
      {help && help.elements.length > 0 && help.shapes.length > 0 && (
        <div className="r3-spell-help">
          <p className="r3-spell-help-have">
            <GameIcon name="sparkles" className="r3-spell-help-icon" /> {you} write one now: <b>{listWords(help.elements, "or")}</b> with <b>{listWords(help.shapes, "or")}</b>.
          </p>
          {help.next.length > 0 && (
            <ul className="r3-spell-help-next" aria-label="Next to unlock">
              {help.next.map((n) => (
                <li key={n.name}>
                  <GameIcon name="lock" className="r3-spell-help-lock" /> <b>{n.name}</b> — {n.how}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="r3-board-foot">
        <Link href={spellbookHref} className="r3-menu-item r3-menu-item--go">
          <GameIcon name={SPELLBOOK_ICON} className="r3-menu-icon" /> {copy.cta}
        </Link>
        <button type="button" className="r3-menu-item" onClick={onClose}>
          Keep playing
        </button>
      </div>
    </Panel>
  );
}

/**
 * Pressing E at something that is not a conversation: a named place, the castle, or a villager
 * whose site's side quests did not load. A person with their site in hand opens `DeedBoard`
 * instead. It names what the child is standing at and what is true about it, from the real
 * kingdom — and pauses the world, like every panel.
 */
export function InteractPanel({
  target,
  kingdom,
  world,
  castleType,
  heroName,
  viewer,
  onClose,
}: {
  target: InteractTarget;
  kingdom: KingdomState;
  world: RealmWorld;
  castleType: string;
  heroName: string;
  viewer: Viewer;
  onClose: () => void;
}) {
  const siteLine = (buildingId: string) => {
    const b = kingdom.buildings.find((x) => x.id === buildingId);
    if (!b) return null;
    if (b.complete) return `The ${b.label} stands. ${b.done} of ${b.total} ${SIDE_QUESTS_LOWER} done.`;
    return `${b.label}: ${b.done} of ${b.total} ${SIDE_QUESTS_LOWER} done.`;
  };

  let icon: ReactNode = <GameIcon name="map" className="r3-board-icon" />;
  let lines: string[] = [];
  let portrait: ReactNode = null;
  if (target.kind === "villager") {
    const v = villagerById(target.id);
    if (v) {
      portrait = <VillagerFigure villager={v} size="lg" className="r3-talk-figure" />;
      // Reached only when this villager's site did not load: the conversation needs its side quests.
      lines = [`“${v.greeting}”`, siteLine(v.buildingId) ?? "", `${v.name}'s ${SIDE_QUESTS_LOWER} did not load. Try again in a moment.`];
    }
    icon = <GameIcon name="person" className="r3-board-icon" />;
  } else if (target.kind === "site") {
    const b = findBuilding(target.id);
    const v = villagerForBuilding(target.id);
    if (b) icon = <GameIcon name={b.icon as GameIconName} className="r3-board-icon" />;
    lines = [b?.description ?? "", siteLine(target.id) ?? "", v ? `${v.name} works here.` : ""];
  } else if (target.kind === "castle") {
    const type = CASTLE_TYPES.find((t) => t.id === castleType);
    icon = <GameIcon name="castle" className="r3-board-icon" />;
    lines = [type ? `${type.label}. ${type.description}.` : "", viewer === "parent" ? `${heroName}'s home.` : "Your home in the Realm."];
  } else {
    const l = world.landmarks.find((x) => x.id === target.id);
    lines = [l?.line ?? ""];
  }
  const title = target.kind === "castle" ? "Your Castle" : target.label.replace(/^the /, "The ");

  return (
    <Panel title={title} label={title} icon={icon} onClose={onClose}>
      <div className={portrait ? "r3-talk" : undefined}>
        {portrait && <div className="r3-talk-portrait">{portrait}</div>}
        <div>
          {lines.filter(Boolean).map((l) => (
            <p key={l} className="r3-board-line">
              {l}
            </p>
          ))}
        </div>
      </div>
      <div className="r3-board-foot">
        <button type="button" className="r3-menu-item r3-menu-item--go" onClick={onClose}>
          {target.kind === "villager" ? "Goodbye" : "Back to the Realm"}
        </button>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ whole screens */

/**
 * The screens that stand in front of the world: the gate a child cannot pass yet, the end of
 * the day's play, and "just a moment". A painted sky and one timber board, so a child who is
 * turned away still feels they are at the Realm's door, not on an error page.
 */
export function RealmScreen({
  icon,
  title,
  body,
  children,
  portrait,
  heroName,
  extra,
}: {
  icon: GameIconName;
  title: string;
  body?: string;
  /** A further line under the body: how minutes are earned (`earningLines`). */
  extra?: string;
  children?: ReactNode;
  portrait?: AvatarConfig | null;
  heroName?: string;
}) {
  return (
    <div className="r3-screen">
      <div className="r3-screen-board">
        <div className="r3-screen-seal">
          {portrait !== undefined && heroName ? (
            <Avatar config={portrait} name={heroName} size="lg" className="r3-screen-avatar" />
          ) : (
            <GameIcon name={icon} className="r3-screen-icon" />
          )}
        </div>
        <h1 className="r3-screen-title">{title}</h1>
        {body && <p className="r3-screen-body">{body}</p>}
        {extra && <p className="r3-screen-body r3-screen-extra">{extra}</p>}
        {children && <div className="r3-screen-foot">{children}</div>}
      </div>
    </div>
  );
}

export function GateScreen({ copy, heroName, portrait, extra }: { copy: GateCopy; heroName: string; portrait: AvatarConfig | null; extra?: string }) {
  return (
    <RealmScreen icon="lock" title={copy.title} body={copy.body} portrait={portrait} heroName={heroName} extra={extra}>
      <Link href="/quests" className="r3-menu-item r3-menu-item--go">
        <GameIcon name="scroll" className="r3-menu-icon" /> Open {heroName}&rsquo;s Quest Log
      </Link>
      <Link href="/tavern" className="r3-menu-item">
        Back to the Tavern
      </Link>
    </RealmScreen>
  );
}

export function ClosedScreen({ heroName, body, portrait, extra }: { heroName: string; body: string; portrait: AvatarConfig | null; extra?: string }) {
  return (
    <RealmScreen icon="star" title={`Well played, ${heroName}!`} body={body} portrait={portrait} heroName={heroName} extra={extra}>
      <Link href="/tavern" className="r3-menu-item r3-menu-item--go">
        <GameIcon name="tavern" className="r3-menu-icon" /> Back to the Tavern
      </Link>
    </RealmScreen>
  );
}
