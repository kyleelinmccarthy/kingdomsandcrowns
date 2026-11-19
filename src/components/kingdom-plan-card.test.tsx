import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/actions/improvements", () => ({ pinPlan: vi.fn().mockResolvedValue(undefined) }));

import { pinPlan } from "@/lib/actions/improvements";
import { KingdomPlanCard } from "./kingdom-plan-card";
import { BUILDINGS } from "@/lib/utils/kingdom";
import type { MaterialId } from "@/lib/realm/materials";

beforeEach(() => {
  refresh.mockClear();
  vi.mocked(pinPlan).mockClear();
  vi.mocked(pinPlan).mockResolvedValue(undefined);
});
afterEach(cleanup);

const bal = (over: Partial<Record<MaterialId, number>> = {}): Record<MaterialId, number> => ({ stone: 0, ink: 0, herbs: 0, thread: 0, dye: 0, timber: 0, ...over });
const allBuildings = BUILDINGS.map((b) => b.id);

const base = {
  childId: "c1",
  canPin: true,
  realmEnabled: true,
  materialsPerQuest: 1,
  built: {} as Record<string, number>,
  raised: [] as string[],
  pinned: null as string | null,
  balance: bal(),
};

describe("KingdomPlanCard", () => {
  it("shows the pinned plan: its name, host, level, line, progress and the way to the Realm", () => {
    render(<KingdomPlanCard {...base} raised={allBuildings} pinned="library-reading-wing" balance={bal({ ink: 1, thread: 2, stone: 5 })} />);
    expect(screen.getByText("Reading Wing")).toBeInTheDocument();
    expect(screen.getByText("Library")).toBeInTheDocument();
    expect(screen.getByText("Level 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("Needs 3 more Ink")).toBeInTheDocument();
    // Level 1 costs 4 Ink and 2 Thread; have 1 and 2.
    expect(screen.getByRole("progressbar", { name: "Ink: 1 of 4" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("progressbar", { name: "Thread: 2 of 2" })).toHaveAttribute("aria-valuenow", "2");
    expect(screen.getByRole("link", { name: "Build it in the Realm" })).toHaveAttribute("href", "/realm");
  });

  it("shows the satchel counts", () => {
    render(<KingdomPlanCard {...base} balance={bal({ stone: 3, dye: 1 })} />);
    const satchel = screen.getByRole("list", { name: "Satchel" });
    expect(within(satchel).getByLabelText("3 Stone")).toBeInTheDocument();
    expect(within(satchel).getByLabelText("1 Dye")).toBeInTheDocument();
    expect(within(satchel).getByLabelText("0 Ink")).toBeInTheDocument();
  });

  it("falls back to the first plan that is ready or short when nothing is pinned", () => {
    // Nothing raised, so only the keep's and the village's plans are on offer; Banners need 4 Dye and 2 Thread and are ready.
    render(<KingdomPlanCard {...base} balance={bal({ dye: 4, thread: 2 })} />);
    expect(screen.getByText("Banners")).toBeInTheDocument();
    expect(screen.getByText("Ready to build")).toBeInTheDocument();
  });

  it("does not show a pin on a plan that is fully built, and never shows a plan that waits on its building or is done", () => {
    const built = Object.fromEntries(["chronicle-hall", "village-banners", "village-lamps", "village-fountain"].map((id) => [id, 3]));
    render(<KingdomPlanCard {...base} built={built} pinned="village-fountain" balance={bal({ stone: 9 })} />);
    // Only the Statue is left on offer.
    expect(screen.getByText("Statue")).toBeInTheDocument();
    expect(screen.queryByText("Fountain")).not.toBeInTheDocument();
    expect(screen.queryByText(/Raise the/)).not.toBeInTheDocument();
  });

  it("notes that timber fills a gap when a plan is ready only because of it", () => {
    // The Banners need 4 Dye and 2 Thread; 2 Dye, 2 Thread and 2 Timber make them.
    render(<KingdomPlanCard {...base} pinned="village-banners" balance={bal({ dye: 2, thread: 2, timber: 2 })} />);
    expect(screen.getByText("Ready to build")).toBeInTheDocument();
    expect(screen.getByText("Timber can fill any gap.")).toBeInTheDocument();
  });

  it("leaves the timber note out when there is no gap to fill, or no timber", () => {
    const { rerender } = render(<KingdomPlanCard {...base} pinned="village-banners" balance={bal({ dye: 4, thread: 2, timber: 2 })} />);
    expect(screen.queryByText("Timber can fill any gap.")).not.toBeInTheDocument();
    rerender(<KingdomPlanCard {...base} pinned="village-banners" balance={bal({ dye: 1 })} />);
    expect(screen.queryByText("Timber can fill any gap.")).not.toBeInTheDocument();
  });

  it("hides the way to the Realm from a hero while the Realm is resting, but not the plan or the Pin", () => {
    render(<KingdomPlanCard {...base} realmEnabled={false} balance={bal({ dye: 1 })} />);
    expect(screen.queryByRole("link", { name: "Build it in the Realm" })).not.toBeInTheDocument();
    expect(screen.getByText("Banners")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pin" })).toBeInTheDocument();
  });

  it("keeps a grown-up's link to the hero's Realm whatever the Realm's state", () => {
    render(<KingdomPlanCard {...base} canPin={false} realmEnabled={false} />);
    expect(screen.getByRole("link", { name: "Build it in the Realm" })).toHaveAttribute("href", "/realm?child=c1");
  });

  it("shows a pinned plan only when it is ready or short: one waiting on its building gives way to the first that is", () => {
    // The Reading Wing's Library has not been raised, so the pin cannot be built on yet.
    render(<KingdomPlanCard {...base} pinned="library-reading-wing" balance={bal({ dye: 1 })} />);
    expect(screen.queryByText("Reading Wing")).not.toBeInTheDocument();
    expect(screen.queryByText(/Raise the/)).not.toBeInTheDocument();
    expect(screen.getByText("Banners")).toBeInTheDocument();
    // The shown plan is not the pin, so it offers "Pin", not "Pinned".
    expect(screen.getByRole("button", { name: "Pin" })).toHaveAttribute("aria-pressed", "false");
  });

  it("pins an unpinned plan: calls the action with the plan, then refreshes", async () => {
    const user = userEvent.setup();
    render(<KingdomPlanCard {...base} balance={bal({ dye: 1 })} />);
    await user.click(screen.getByRole("button", { name: "Pin" }));
    expect(pinPlan).toHaveBeenCalledWith("c1", "village-banners");
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("unpins a pinned plan", async () => {
    const user = userEvent.setup();
    render(<KingdomPlanCard {...base} pinned="village-banners" />);
    const toggle = screen.getByRole("button", { name: "Pinned" });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    await user.click(toggle);
    expect(pinPlan).toHaveBeenCalledWith("c1", null);
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("says so when the pin could not be saved, and does not refresh", async () => {
    vi.mocked(pinPlan).mockRejectedValue(new Error("nope"));
    const user = userEvent.setup();
    render(<KingdomPlanCard {...base} />);
    await user.click(screen.getByRole("button", { name: "Pin" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not/i);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is read-only for a grown-up: the plan and progress, no Pin, and a link into that hero's Realm", () => {
    render(<KingdomPlanCard {...base} canPin={false} pinned="village-banners" balance={bal({ dye: 1 })} />);
    expect(screen.getByText("Banners")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pin/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Build it in the Realm" })).toHaveAttribute("href", "/realm?child=c1");
  });

  it("is hidden when quests bring nothing and nothing is in the satchel", () => {
    const { container } = render(<KingdomPlanCard {...base} materialsPerQuest={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows when quests bring nothing now but the satchel holds something", () => {
    render(<KingdomPlanCard {...base} materialsPerQuest={0} balance={bal({ stone: 2 })} />);
    expect(screen.getByRole("list", { name: "Satchel" })).toBeInTheDocument();
  });

  it("asks for quests when there is no plan to show", () => {
    const built = Object.fromEntries(["chronicle-hall", "village-banners", "village-lamps", "village-fountain", "village-statue"].map((id) => [id, 3]));
    render(<KingdomPlanCard {...base} built={built} />);
    expect(screen.getByText("Finish quests to bring materials to your kingdom.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Pin/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Build it in the Realm" })).not.toBeInTheDocument();
  });
});
