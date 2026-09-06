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
    render(<SiteCard villager={VILLAGERS[0]} building={building} preview={false} busy={false} error="" onBegin={onBegin} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Old Bram" })).toBeInTheDocument();
    expect(screen.getByText("2 of 5")).toBeInTheDocument();
    expect(screen.getByText("Old Bram's bucket keeps coming up dry.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Begin Signs for the Well" }));
    expect(onBegin).toHaveBeenCalledWith("well-signs");
  });

  it("says Built for a complete site and still lists its deeds", () => {
    render(<SiteCard villager={VILLAGERS[0]} building={{ ...building, done: 5, complete: true }} preview={false} busy={false} error="" onBegin={() => {}} onClose={() => {}} />);
    expect(screen.getByText("Built")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Begin / }).length).toBe(2);
  });

  it("hides Begin in preview and explains why", () => {
    render(<SiteCard villager={VILLAGERS[0]} building={building} preview={true} busy={false} error="" onBegin={() => {}} onClose={() => {}} />);
    expect(screen.queryByRole("button", { name: /^Begin / })).not.toBeInTheDocument();
    expect(screen.getByText("Deeds are for the hero to play.")).toBeInTheDocument();
  });

  it("closes on the Close button and on Escape, and shows an error with retry", () => {
    const onClose = vi.fn();
    const onBegin = vi.fn();
    render(<SiteCard villager={VILLAGERS[0]} building={building} preview={false} busy={false} error="No deeds are ready for this hero yet." onBegin={onBegin} onClose={onClose} />);
    expect(screen.getByText("No deeds are ready for this hero yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
