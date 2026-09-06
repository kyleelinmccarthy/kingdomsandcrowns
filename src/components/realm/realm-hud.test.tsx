import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RealmHud } from "./realm-hud";

afterEach(cleanup);

describe("RealmHud", () => {
  it("shows the hero's minutes and the one-minute banner", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} kingdomError="" onKingdomRetry={() => {}} />);
    expect(screen.getByText("7 min left")).toBeInTheDocument();
    expect(screen.queryByText(/one minute left/i)).not.toBeInTheDocument();
    cleanup();
    render(<RealmHud heroName="Lily" minutesRemaining={1} warning={true} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} kingdomError="" onKingdomRetry={() => {}} />);
    expect(screen.getByText("One minute left in the Realm today.")).toBeInTheDocument();
  });
  it("shows the preview badge and hides minutes for a parent", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={null} warning={false} preview={{ note: "Closed for Lily: it's school time." }} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} kingdomError="" onKingdomRetry={() => {}} />);
    expect(screen.getByText("Previewing Lily's Realm")).toBeInTheDocument();
    expect(screen.getByText("Closed for Lily: it's school time.")).toBeInTheDocument();
    expect(screen.queryByText(/min left/)).not.toBeInTheDocument();
  });
  it("links back to the Tavern", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={3} warning={false} preview={null} hudScale={1.25} error="" onRetry={() => {}} paused={false} toast={null} kingdomError="" onKingdomRetry={() => {}} />);
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
        kingdomError=""
        onKingdomRetry={() => {}}
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
        kingdomError=""
        onKingdomRetry={() => {}}
      />
    );
    expect(screen.queryByText("picker")).not.toBeInTheDocument();
  });
  it("marks the counter paused and shows a toast", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={true} toast="The Village Well stands." kingdomError="" onKingdomRetry={() => {}} />);
    expect(screen.getByText("7 min left · paused")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("The Village Well stands.");
  });

  it("shows the kingdom error with its own retry", () => {
    const onKingdomRetry = vi.fn();
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} paused={false} toast={null} kingdomError="The villagers are resting. Try again." onKingdomRetry={onKingdomRetry} />);
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
        kingdomError=""
        onKingdomRetry={() => {}}
      />
    );
    const keyWarning = spy.mock.calls.some((args) => typeof args[0] === "string" && args[0].includes('unique "key"'));
    expect(keyWarning).toBe(false);
    spy.mockRestore();
  });
});
