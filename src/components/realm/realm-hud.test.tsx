import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RealmHud } from "./realm-hud";

afterEach(cleanup);

describe("RealmHud", () => {
  it("shows the hero's minutes and the one-minute banner", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} />);
    expect(screen.getByText("7 min left")).toBeInTheDocument();
    expect(screen.queryByText(/one minute left/i)).not.toBeInTheDocument();
    cleanup();
    render(<RealmHud heroName="Lily" minutesRemaining={1} warning={true} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} />);
    expect(screen.getByText("One minute left in the Realm today.")).toBeInTheDocument();
  });
  it("shows the preview badge and hides minutes for a parent", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={null} warning={false} preview={{ note: "Closed for Lily: it's school time." }} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} />);
    expect(screen.getByText("Previewing Lily's Realm")).toBeInTheDocument();
    expect(screen.getByText("Closed for Lily: it's school time.")).toBeInTheDocument();
    expect(screen.queryByText(/min left/)).not.toBeInTheDocument();
  });
  it("links back to the Tavern", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={3} warning={false} preview={null} hudScale={1.25} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} />);
    expect(screen.getByRole("link", { name: "Leave the Realm" })).toHaveAttribute("href", "/tavern");
  });
  it("shows the selector only in the preview HUD", () => {
    render(
      <RealmHud
        heroName="Lily"
        minutesRemaining={null}
        warning={false}
        preview={{ note: null }}
        hudScale={1}
        error=""
        selector={<span>picker</span>}
        onRetry={() => {}}
        paused={false}
        toast={null}
        calm={false}
        kingdomError=""
        onKingdomRetry={() => {}}
        mana={null}
        cleared={null}
        notice={null} recess={null} ride={null}
      />
    );
    expect(screen.getByText("picker")).toBeInTheDocument();
    cleanup();
    render(
      <RealmHud
        heroName="Lily"
        minutesRemaining={3}
        warning={false}
        preview={null}
        hudScale={1}
        error=""
        selector={<span>picker</span>}
        onRetry={() => {}}
        paused={false}
        toast={null}
        calm={false}
        kingdomError=""
        onKingdomRetry={() => {}}
        mana={null}
        cleared={null}
        notice={null} recess={null} ride={null}
      />
    );
    expect(screen.queryByText("picker")).not.toBeInTheDocument();
  });
  it("marks the counter paused and shows a toast", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={true} toast="The Village Well stands." calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} />);
    expect(screen.getByText("7 min left · paused")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("The Village Well stands.");
    expect(screen.getByRole("status")).not.toHaveClass("realm-hud-toast--plain");
  });

  it("renders a plain, non-animated toast when the profile is calm", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={true} toast="The Village Well stands." calm={true} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} />);
    expect(screen.getByRole("status")).toHaveClass("realm-hud-toast--plain");
  });

  it("shows the kingdom error with its own retry", () => {
    const onKingdomRetry = vi.fn();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="The villagers are resting. Try again." onKingdomRetry={onKingdomRetry} mana={null} cleared={null} notice={null} recess={null} ride={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Wake the villagers" }));
    expect(onKingdomRetry).toHaveBeenCalled();
  });

  it("logs no console errors when a preview selector is shown", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <RealmHud
        heroName="Lily"
        minutesRemaining={null}
        warning={false}
        preview={{ note: null }}
        hudScale={1}
        error=""
        selector={<span>picker</span>}
        onRetry={() => {}}
        paused={false}
        toast={null}
        calm={false}
        kingdomError=""
        onKingdomRetry={() => {}}
        mana={null}
        cleared={null}
        notice={null} recess={null} ride={null}
      />
    );
    const keyWarning = spy.mock.calls.some((args) => typeof args[0] === "string" && args[0].includes('unique "key"'));
    expect(keyWarning).toBe(false);
    spy.mockRestore();
  });

  it("shows mana, the cleared count, and a notice", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={42} cleared={3} notice="The fog thins." recess={null} ride={null} />);
    const bar = screen.getByRole("progressbar", { name: "Mana" });
    expect(bar).toHaveAttribute("aria-valuenow", "42");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
    expect(screen.getByText("Cleared: 3")).toBeInTheDocument();
    expect(screen.getByText("The fog thins.")).toBeInTheDocument();
  });
  it("hides mana and the count in preview", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={null} warning={false} preview={{ note: null }} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByText(/Cleared:/)).not.toBeInTheDocument();
  });

  it("shows recess tallies and the ride button", () => {
    const onToggle = vi.fn();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={50} cleared={0} notice={null} recess={{ gleams: 3, laps: 1, bestLapMs: 40_300, lapMs: 12_000 }} ride={{ riding: false, disabled: false, onToggle }} />);
    expect(screen.getByText("Gleams: 3")).toBeInTheDocument();
    expect(screen.getByText(/Laps: 1/)).toBeInTheDocument();
    expect(screen.getByText(/Best 40\.3 s/)).toBeInTheDocument();
    expect(screen.getByText(/12\.0 s/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ride" }));
    expect(onToggle).toHaveBeenCalled();
    cleanup();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={50} cleared={0} notice={null} recess={null} ride={{ riding: true, disabled: true, onToggle }} />);
    expect(screen.getByRole("button", { name: "Dismount" })).toBeDisabled();
    expect(screen.queryByText(/Gleams:/)).not.toBeInTheDocument();
  });

  it("shows the worn crown and the ceremony's Skip button", () => {
    const onSkip = vi.fn();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={true} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} crown={{ label: "Copper Circlet", color: "#b87333" }} ceremony={{ onSkip }} />);
    expect(screen.getByText("Copper Circlet")).toBeInTheDocument();
    const skip = screen.getByRole("button", { name: "Skip" });
    expect(skip.className).toContain("realm-hud-skip");
    fireEvent.click(skip);
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
  it("offers a retry when the ceremony could not be recorded", () => {
    const onCeremonyRetry = vi.fn();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} ceremonyError="The crown could not be recorded." onCeremonyRetry={onCeremonyRetry} />);
    expect(screen.getByText(/The crown could not be recorded\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onCeremonyRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
  });

  it("tells a parent what the preview leaves out, then the closed reason", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={null} warning={false} preview={{ intro: "You're looking at Lily's grounds. Spells, side quests and recess are theirs to play.", note: "Closed for Lily: it's school time." }} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} calm={false} kingdomError="" onKingdomRetry={() => {}} mana={null} cleared={null} notice={null} recess={null} ride={null} />);
    expect(screen.getByText("You're looking at Lily's grounds. Spells, side quests and recess are theirs to play.")).toBeInTheDocument();
    expect(screen.getByText("Closed for Lily: it's school time.")).toBeInTheDocument();
  });
});
