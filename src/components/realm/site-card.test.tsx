import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SiteCard } from "./site-card";
import { VILLAGERS } from "@/lib/realm/villagers";

afterEach(cleanup);

const building = {
  id: "well", label: "Village Well", description: "Clean water for every doorstep.", icon: "box" as const,
  done: 2, total: 5, complete: false,
  deeds: [
    { id: "well-stones", title: "Count the Well Stones", story: "Old Bram's bucket keeps coming up dry.", area: "math" as const },
    { id: "well-signs", title: "Signs for the Well", story: "The well needs a sign every traveler can read.", area: "reading" as const },
  ],
};

describe("SiteCard", () => {
  it("shows the villager, progress, and each deed with a Begin button", () => {
    const onBegin = vi.fn();
    render(<SiteCard villager={VILLAGERS[0]} building={building} preview={false} busy={false} error="" onBegin={onBegin} onClearError={() => {}} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
    expect(screen.getByText("Old Bram's bucket keeps coming up dry.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Begin Signs for the Well" }));
    expect(onBegin).toHaveBeenCalledWith("well-signs");
  });

  it("says Built for a complete site and still lists its deeds", () => {
    render(<SiteCard villager={VILLAGERS[0]} building={{ ...building, done: 5, complete: true }} preview={false} busy={false} error="" onBegin={() => {}} onClearError={() => {}} onClose={() => {}} />);
    expect(screen.getByText("Built")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Begin / }).length).toBe(2);
  });

  it("hides Begin in preview and explains why", () => {
    render(<SiteCard villager={VILLAGERS[0]} building={building} preview={true} busy={false} error="" onBegin={() => {}} onClearError={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /^Begin / })).not.toBeInTheDocument();
    expect(screen.getByText("Side quests are for the hero to play.")).toBeInTheDocument();
  });

  it("closes on the Close button and on Escape", () => {
    const onClose = vi.fn();
    const onBegin = vi.fn();
    render(<SiteCard villager={VILLAGERS[0]} building={building} preview={false} busy={false} error="" onBegin={onBegin} onClearError={() => {}} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows an error with a Try again control that clears it", () => {
    const onClearError = vi.fn();
    const { rerender } = render(
      <SiteCard villager={VILLAGERS[0]} building={building} preview={false} busy={false} error="No side quests are ready for this hero yet." onBegin={() => {}} onClearError={onClearError} onClose={() => {}} />
    );
    expect(screen.getByText("No side quests are ready for this hero yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onClearError).toHaveBeenCalledTimes(1);
    // The button only clears the caller's `error` state; re-render with it emptied,
    // as the real DeedPanel does once `onClearError` runs.
    rerender(<SiteCard villager={VILLAGERS[0]} building={building} preview={false} busy={false} error="" onBegin={() => {}} onClearError={onClearError} onClose={() => {}} />);
    expect(screen.queryByText("No side quests are ready for this hero yet.")).not.toBeInTheDocument();
  });

  it("shows each side quest's subject", () => {
    render(<SiteCard villager={VILLAGERS[0]} building={building} preview={false} busy={false} error="" onBegin={() => {}} onClearError={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText("Subject: Math")).toBeInTheDocument();
    expect(screen.getByLabelText("Subject: Reading")).toBeInTheDocument();
  });
});
