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

  it("sends a child to the stars still to earn once every building stands", () => {
    const built = fresh.map((b) => ({ ...b, done: 5, complete: true, stars: b.id === "mill" ? 7 : 9, maxStars: 9 }));
    render(<ObjectiveCard objective={objectiveState(built, 3)} heroName="Emma" visiting={false} numerals />);
    expect(screen.getByText("Earn stars")).toBeInTheDocument();
    expect(screen.getByText("Grain Mill")).toBeInTheDocument();
    expect(screen.getByText("Miller Tessa is waiting.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "7 of 9 stars earned." })).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is waiting/)).toBeNull();
  });

  it("says the pinned plan is ready, and where the gold ! leads, in place of who is waiting (the plan beacon)", () => {
    render(<ObjectiveCard objective={objectiveState(fresh, 3)} heroName="Emma" visiting={false} numerals plan="Banners" pet="Fox" />);
    expect(screen.queryByText(/Old Bram is waiting/)).toBeNull();
    expect(screen.queryByText(/press E to talk/)).toBeNull();
    const lead = screen.getByText(/Everything for the Banners is ready/);
    // Agreement-free, so a plural plan ("Banners", "Stone Arches") reads right.
    expect(lead.closest("p")).toHaveTextContent("Everything for the Banners is ready. Follow the gold ! to the plans board. Or press F, and your Fox will show you the way.");
    // The objective's own rows stay as they are.
    expect(screen.getByText("Village Well")).toBeInTheDocument();
    expect(screen.getByText("0 of 5")).toBeInTheDocument();
    expect(screen.getByText(/Grain Mill · 0 of 5/)).toBeInTheDocument();
  });

  it("keeps the gold ! off the villager's row while the beacon is on the plans board: the plan line leads, the header follows bare", () => {
    const { container } = render(<ObjectiveCard objective={objectiveState(fresh, 3)} heroName="Emma" visiting={false} numerals plan="Banners" />);
    const card = container.querySelector(".r3-quest")!;
    const title = card.querySelector(".r3-quest-title")!;
    const bangs = [...card.querySelectorAll(".r3-quest-bang")];
    expect(title).toHaveTextContent("Village Well");
    expect(bangs).toHaveLength(1);
    // The one ! is the plan's, before the villager's header; nothing after the header carries one.
    expect(bangs[0].compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bangs[0].closest("p")).toHaveTextContent(/Everything for the Banners is ready/);
    // Without a plan, the villager's own line keeps its ! under the header, as before.
    cleanup();
    const plain = render(<ObjectiveCard objective={objectiveState(fresh, 3)} heroName="Emma" visiting={false} numerals />).container;
    const bang = plain.querySelector(".r3-quest-bang")!;
    expect(plain.querySelector(".r3-quest-title")!.compareDocumentPosition(bang) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("tells a visiting grown-up whose plan is ready, with no directions to follow", () => {
    render(<ObjectiveCard objective={objectiveState(fresh, 1)} heroName="Emma" visiting numerals plan="Banners" />);
    expect(screen.getByText("Everything for Emma's Banners is ready.")).toBeInTheDocument();
    expect(screen.queryByText(/Old Bram is waiting/)).toBeNull();
    expect(screen.queryByText(/Follow the gold/)).toBeNull();
  });

  it("follows a ready plan even when every building stands and every star is earned", () => {
    const allDone = fresh.map((b) => ({ ...b, done: 5, complete: true, stars: 9, maxStars: 9 }));
    render(<ObjectiveCard objective={objectiveState(allDone, 3)} heroName="Emma" visiting={false} numerals plan="Banners" />);
    expect(screen.getByText("Every building is built.")).toBeInTheDocument();
    expect(screen.getByText(/Everything for the Banners is ready/).closest("p")).toHaveTextContent("Everything for the Banners is ready. Follow the gold ! to the plans board.");
    expect(screen.queryByText(/Nothing is waiting/)).toBeNull();
    cleanup();
    render(<ObjectiveCard objective={objectiveState(allDone, 3)} heroName="Emma" visiting numerals plan="Banners" />);
    expect(screen.getByText("Everything for Emma's Banners is ready.")).toBeInTheDocument();
    expect(screen.queryByText(/Nothing is waiting/)).toBeNull();
    cleanup();
    // No plan: the finished village says so, as before.
    render(<ObjectiveCard objective={objectiveState(allDone, 3)} heroName="Emma" visiting={false} numerals />);
    expect(screen.getByText("Nothing is waiting. Walk where you like.")).toBeInTheDocument();
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

  it("steps back to a small chip when quiet (the hero's own view), keeping its pulse and its timer role", () => {
    corner({ quiet: true, warning: true, line: "1 min left!" });
    const clock = screen.getByRole("timer");
    expect(clock).toHaveClass("r3-clock", "r3-clock--quiet", "r3-clock--warning");
    expect(clock).toHaveAttribute("aria-live", "assertive");
    expect(clock).toHaveTextContent("1 min left!");
    cleanup();
    // A grown-up's visit line keeps today's size.
    corner({ line: "Emma has 30 min today" });
    expect(screen.getByRole("timer")).not.toHaveClass("r3-clock--quiet");
    expect(screen.getByRole("timer")).toHaveAttribute("aria-live", "off");
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

  it("offers the Wardrobe when given one, and nothing of it otherwise", () => {
    const onWardrobe = vi.fn();
    render(<PauseMenu heroName="Emma" viewer="child" onResume={() => {}} onControls={() => {}} leaveHref="/tavern" settings={noSettings} onWardrobe={onWardrobe} />);
    fireEvent.click(screen.getByRole("button", { name: /Wardrobe/ }));
    expect(onWardrobe).toHaveBeenCalledOnce();
    cleanup();
    render(<PauseMenu heroName="Emma" viewer="parent" onResume={() => {}} onControls={() => {}} leaveHref="/tavern" settings={noSettings} />);
    expect(screen.queryByRole("button", { name: /Wardrobe/ })).toBeNull();
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

  it("asks 'Are you there, {name}?' after two minutes untouched, says what it gave back, with one friendly button back", () => {
    const onResume = vi.fn();
    render(<PauseMenu heroName="Emma" viewer="child" why="idle" refunded={2} onResume={onResume} onControls={() => {}} leaveHref="/tavern" settings={noSettings} />);
    expect(screen.getByRole("dialog", { name: "Are you there, Emma?" })).toHaveTextContent("You stepped away, so the Realm paused and gave back 2 minutes.");
    expect(screen.getByRole("button", { name: /I'm back!/ })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /I'm back!/ }));
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
  const kingdom = { tone: "gentle" as const, buildings: fresh.map((b) => ({ ...b, label: b.id === "well" ? "Village Well" : b.id, description: "", icon: "box" as const, raisedBy: null, raisedAt: null, stars: 0, maxStars: 0, deeds: [] })) };

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
