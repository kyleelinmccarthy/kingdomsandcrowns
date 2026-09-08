import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { CrownCard } from "./crown-card";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const markCeremonySeen = vi.fn();
vi.mock("@/lib/actions/seasons", () => ({ markCeremonySeen: (...a: unknown[]) => markCeremonySeen(...a) }));

const season = { id: "s1", crownId: "crown-copper", grade: "3", startDate: "2025-08-15" };

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("CrownCard", () => {
  it("announces the crown to the hero with both actions", () => {
    render(<CrownCard childId="c1" childName="Emma" season={season} isChildView={true} />);
    expect(screen.getByText("A crown awaits, Emma!")).toBeInTheDocument();
    expect(screen.getByText(/2025–26 · Grade 3/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See the ceremony" })).toHaveAttribute("href", "/realm");
    expect(screen.getByRole("button", { name: "Hail!" })).toBeInTheDocument();
  });
  it("gives a parent only Hail!, which records the ceremony and refreshes", async () => {
    markCeremonySeen.mockResolvedValue(undefined);
    render(<CrownCard childId="c1" childName="Emma" season={season} isChildView={false} />);
    expect(screen.queryByRole("link", { name: "See the ceremony" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hail!" }));
    await waitFor(() => expect(markCeremonySeen).toHaveBeenCalledWith("c1", "s1"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
  it("shows the failure and keeps the card", async () => {
    markCeremonySeen.mockRejectedValue(new Error("The Realm is out of reach."));
    render(<CrownCard childId="c1" childName="Emma" season={season} isChildView={true} />);
    fireEvent.click(screen.getByRole("button", { name: "Hail!" }));
    expect(await screen.findByText("The Realm is out of reach.")).toBeInTheDocument();
    expect(screen.getByText("A crown awaits, Emma!")).toBeInTheDocument();
  });
  it("borrows the copper look for an unknown crown id", () => {
    render(<CrownCard childId="c1" childName="Emma" season={{ ...season, crownId: "crown-mystery" }} isChildView={true} />);
    expect(screen.getByText(/· Crown$/)).toBeInTheDocument();
  });
});
