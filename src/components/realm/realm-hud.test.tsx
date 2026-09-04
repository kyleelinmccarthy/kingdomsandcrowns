import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RealmHud } from "./realm-hud";

afterEach(cleanup);

describe("RealmHud", () => {
  it("shows the hero's minutes and the one-minute banner", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={7} warning={false} preview={null} hudScale={1} error="" onRetry={() => {}} />);
    expect(screen.getByText("7 min left")).toBeInTheDocument();
    expect(screen.queryByText(/one minute left/i)).not.toBeInTheDocument();
    cleanup();
    render(<RealmHud heroName="Lily" minutesRemaining={1} warning={true} preview={null} hudScale={1} error="" onRetry={() => {}} />);
    expect(screen.getByText("One minute left in the Realm today.")).toBeInTheDocument();
  });
  it("shows the preview badge and hides minutes for a parent", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={null} warning={false} preview={{ note: "Closed for Lily: it's school time." }} hudScale={1} error="" onRetry={() => {}} />);
    expect(screen.getByText("Previewing Lily's Realm")).toBeInTheDocument();
    expect(screen.getByText("Closed for Lily: it's school time.")).toBeInTheDocument();
    expect(screen.queryByText(/min left/)).not.toBeInTheDocument();
  });
  it("links back to the Tavern", () => {
    render(<RealmHud heroName="Lily" minutesRemaining={3} warning={false} preview={null} hudScale={1.25} error="" onRetry={() => {}} />);
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
      />
    );
    expect(screen.queryByText("picker")).not.toBeInTheDocument();
  });
});
