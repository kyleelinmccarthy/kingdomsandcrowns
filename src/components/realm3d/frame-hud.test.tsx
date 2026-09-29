import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { objectiveState } from "@/lib/realm/objective";
import type { RealmWorld } from "@/lib/realm3d/worldgen";
import {
  ClockCorner,
  ClosedScreen,
  EmptyPagePanel,
  GateScreen,
  HowToPlay,
  InteractPanel,
  InteractPrompt,
  ObjectiveCard,
  PauseMenu,
  VillagePlank,
  VisitorRibbon,
  type PauseSettings,
} from "./frame-hud";

afterEach(cleanup);

const fresh = ["well", "mill", "bridge", "chapel", "market", "library", "watchtower", "garden"].map((id) => ({ id, done: 0, total: 5, complete: false }));

const noSettings: PauseSettings = { depth: null, onDepth: null, depthError: "", tone: null, onTone: null, toneError: "", calm: false };

describe("the objectives card", () => {
  it("reads as the owner's 2D screenshot did: the Well first, Old Bram waiting, then the Mill and the Bridge", () => {
    render(<ObjectiveCard objective={objectiveState(fresh, 3)} heroName="Emma" visiting={false} numerals />);
    expect(screen.getByText("Village Well")).toBeInTheDocument();
    expect(screen.getByText("Old Bram is waiting.")).toBeInTheDocument();
    expect(screen.getByText("0 of 5")).toBeInTheDocument();
    expect(screen.getByText(/Grain Mill · 0 of 5/)).toBeInTheDocument();
    expect(screen.getByText(/River Bridge · 0 of 5/)).toBeInTheDocument();
  });

  it("draws pips without numerals at simple depth, and still says the count to a screen reader", () => {
    const { container } = render(<ObjectiveCard objective={objectiveState(fresh, 1)} heroName="Emma" visiting={false} numerals={false} />);
    expect(container.querySelectorAll(".r3-pip")).toHaveLength(5);
    expect(screen.queryByText("0 of 5")).toBeNull();
    expect(screen.getByRole("img", { name: "0 of 5 side quests done." })).toBeInTheDocument();
  });

  it("tells a visiting parent who the villager is waiting for", () => {
    render(<ObjectiveCard objective={objectiveState(fresh, 1)} heroName="Emma" visiting numerals />);
    expect(screen.getByText("Old Bram is waiting for Emma.")).toBeInTheDocument();
  });

  it("says a finished village is finished", () => {
    render(<ObjectiveCard objective={objectiveState(fresh.map((b) => ({ ...b, done: 5, complete: true })), 3)} heroName="Emma" visiting={false} numerals />);
    expect(screen.getByText("Every building is built.")).toBeInTheDocument();
  });

  it("never tells a child their village is finished because it failed to load", () => {
    const { container } = render(<ObjectiveCard objective={objectiveState([], 3)} heroName="Emma" visiting={false} numerals />);
    expect(container).toBeEmptyDOMElement();
    render(<ObjectiveCard objective={objectiveState([], 3)} heroName="Emma" visiting={false} numerals kingdomError="The villagers are resting. Try again." />);
    expect(screen.getByText("The villagers are resting. Try again.")).toBeInTheDocument();
  });
});

describe("the village plank", () => {
  it("says how much stands, as the flat Realm's corner did", () => {
    render(<VillagePlank heroName="Emma" done={0} total={8} numerals />);
    expect(screen.getByText("Emma’s village")).toBeInTheDocument();
    expect(screen.getByText("0 of 8 built")).toBeInTheDocument();
  });

  it("is absent rather than showing a zero when the kingdom did not load", () => {
    const { container } = render(<VillagePlank heroName="Emma" done={0} total={0} numerals />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the clock corner", () => {
  const corner = (over: Partial<React.ComponentProps<typeof ClockCorner>> = {}) =>
    render(<ClockCorner line="240 min left" warning={false} error="" onRetry={() => {}} onHelp={() => {}} onMenu={() => {}} leaveHref="/tavern" {...over} />);

  it("shows the clock, a help button, a plain Pause button with its key, and a way out", () => {
    corner();
    expect(screen.getByText("240 min left")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "How to play" })).toBeInTheDocument();
    const pause = screen.getByRole("button", { name: /^Pause/ });
    expect(pause.querySelector("svg")).not.toBeNull();
    expect(pause.querySelector(".r3-button-key")).toHaveTextContent("P");
    expect(screen.queryByRole("button", { name: /Menu/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Leave/ })).toHaveAttribute("href", "/tavern");
  });

  it("opens help, and pauses", () => {
    const onHelp = vi.fn();
    const onMenu = vi.fn();
    corner({ onHelp, onMenu });
    fireEvent.click(screen.getByRole("button", { name: "How to play" }));
    fireEvent.click(screen.getByRole("button", { name: /^Pause/ }));
    expect(onHelp).toHaveBeenCalledOnce();
    expect(onMenu).toHaveBeenCalledOnce();
  });

  it("turns red on the last minute", () => {
    const { container } = corner({ warning: true, line: "1 min left!" });
    expect(container.querySelector(".r3-clock--warning")).toHaveTextContent("1 min left!");
  });

  it("says when the clock lost track, and offers to try again", () => {
    const onRetry = vi.fn();
    corner({ error: "The Realm lost track of time for a moment.", onRetry });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe("the E prompt", () => {
  it("names who is in reach, and opens them on a click too", () => {
    const onPress = vi.fn();
    render(<InteractPrompt target={{ kind: "villager", id: "bram", label: "Old Bram" }} onPress={onPress} />);
    const prompt = screen.getByRole("button", { name: /Talk to Old Bram/ });
    expect(prompt).toHaveTextContent("E");
    fireEvent.click(prompt);
    expect(onPress).toHaveBeenCalledWith({ kind: "villager", id: "bram", label: "Old Bram" });
  });

  it("is not there when nothing is in reach", () => {
    const { container } = render(<InteractPrompt target={null} onPress={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the pause menu", () => {
  it("offers Resume, Controls and Leave the Realm", () => {
    const onResume = vi.fn();
    const onControls = vi.fn();
    render(<PauseMenu heroName="Emma" viewer="child" onResume={onResume} onControls={onControls} leaveHref="/tavern" settings={noSettings} />);
    expect(screen.getByRole("dialog", { name: "Paused" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Resume/ }));
    fireEvent.click(screen.getByRole("button", { name: /Controls/ }));
    expect(onResume).toHaveBeenCalledOnce();
    expect(onControls).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: /Leave the Realm/ })).toHaveAttribute("href", "/tavern");
  });

  it("puts Resume under the child's finger the moment it opens", () => {
    render(<PauseMenu heroName="Emma" viewer="child" onResume={() => {}} onControls={() => {}} leaveHref="/tavern" settings={noSettings} />);
    expect(screen.getByRole("button", { name: /Resume/ })).toHaveFocus();
  });

  it("says why it paused when it paused by itself, and keeps the honest line", () => {
    render(<PauseMenu heroName="Emma" viewer="child" why="away" onResume={() => {}} onControls={() => {}} leaveHref="/tavern" settings={noSettings} />);
    const board = screen.getByRole("dialog", { name: "Paused" });
    expect(board).toHaveTextContent("Paused while you were away — your minutes stopped too.");
    expect(board).toHaveTextContent("The world waits for you. Your minutes are not ticking.");
  });

  it("asks 'Still there?' after two minutes untouched, with one friendly button back", () => {
    const onResume = vi.fn();
    render(<PauseMenu heroName="Emma" viewer="child" why="idle" onResume={onResume} onControls={() => {}} leaveHref="/tavern" settings={noSettings} />);
    expect(screen.getByRole("dialog", { name: "Still there?" })).toHaveTextContent("your minutes stopped too");
    expect(screen.getByRole("button", { name: /I'm here!/ })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /I'm here!/ }));
    expect(onResume).toHaveBeenCalledOnce();
  });

  it("offers the flat Realm's one in-game setting, how much to show", () => {
    const onDepth = vi.fn();
    render(
      <PauseMenu heroName="Emma" viewer="child" onResume={() => {}} onControls={() => {}} leaveHref="/tavern" settings={{ ...noSettings, depth: "simple", onDepth }} />,
    );
    expect(screen.getByRole("button", { name: "Keep it simple" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
    expect(onDepth).toHaveBeenCalledWith("full");
  });

  it("offers a visiting grown-up the troubles' look, and says when calm motion is on", () => {
    const onTone = vi.fn();
    render(
      <PauseMenu
        heroName="Emma"
        viewer="parent"
        onResume={() => {}}
        onControls={() => {}}
        leaveHref="/tavern"
        settings={{ ...noSettings, tone: "gentle", onTone, calm: true }}
        selector={<span>Noah</span>}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Monsters" }));
    expect(onTone).toHaveBeenCalledWith("monsters");
    expect(screen.getByText(/Calm motion is on for Emma/)).toBeInTheDocument();
    expect(screen.getByText("Visit another hero")).toBeInTheDocument();
  });
});

describe("how to play", () => {
  it("lists every control, with E to talk and Esc to pause", () => {
    render(<HowToPlay slots={4} back onClose={() => {}} />);
    expect(screen.getByText(/Talk to someone/)).toBeInTheDocument();
    expect(screen.getByText("1–4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeInTheDocument();
  });
});

describe("an empty page", () => {
  it("says how a spell is earned and links to the Spellbook", () => {
    render(<EmptyPagePanel slot={2} viewer="child" heroName="Emma" spellbookHref="/spellbook" onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Page 2 is empty" })).toBeInTheDocument();
    expect(screen.getByText(/Finish quests and side quests/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open my Spellbook/ })).toHaveAttribute("href", "/spellbook");
  });
});

describe("the interact panel", () => {
  const world = { landmarks: [{ id: "summit-1", name: "Cloudfoot", line: "The whole realm, from up here." }] } as unknown as RealmWorld;
  const kingdom = { tone: "gentle" as const, buildings: fresh.map((b) => ({ ...b, label: b.id === "well" ? "Village Well" : b.id, description: "", icon: "box" as const, deeds: [] })) };

  it("names a villager, says what they said, and how their site stands", () => {
    render(<InteractPanel target={{ kind: "villager", id: "bram", label: "Old Bram" }} kingdom={kingdom} world={world} castleType="campsite" heroName="Emma" viewer="child" onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
    expect(screen.getByText(/The bucket's dry again/)).toBeInTheDocument();
    expect(screen.getByText("Village Well: 0 of 5 side quests done.")).toBeInTheDocument();
  });

  it("names a place by its own line", () => {
    render(<InteractPanel target={{ kind: "landmark", id: "summit-1", label: "Cloudfoot" }} kingdom={kingdom} world={world} castleType="campsite" heroName="Emma" viewer="child" onClose={() => {}} />);
    expect(screen.getByText("The whole realm, from up here.")).toBeInTheDocument();
  });
});

describe("the whole screens", () => {
  it("keeps a child at the gate with the gate's own words and the way to earn minutes", () => {
    render(<GateScreen copy={{ title: "It's school time.", body: "The Realm opens after your last class." }} heroName="Emma" portrait={null} />);
    expect(screen.getByRole("heading", { name: "It's school time." })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quest Log/ })).toHaveAttribute("href", "/quests");
  });

  it("says well played when the day's minutes are spent", () => {
    render(<ClosedScreen heroName="Noah" body="Every quest you complete banks minutes here." portrait={null} />);
    expect(screen.getByRole("heading", { name: "Well played, Noah!" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to the Tavern/ })).toHaveAttribute("href", "/tavern");
  });

  it("tells a visiting grown-up whose Realm this is", () => {
    render(<VisitorRibbon heroName="Emma" />);
    expect(screen.getByText(/as the Quest Giver/)).toBeInTheDocument();
  });
});
