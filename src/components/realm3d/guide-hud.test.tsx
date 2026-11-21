import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The toast banner needs none of the timer's reach into the server.
vi.mock("@/lib/actions/quest-assignments", () => ({ getAssignmentQuestInfo: vi.fn() }));
vi.mock("@/hooks/use-quest-timer", () => ({ useQuestTimer: () => ({ stoppedResult: null, clearStoppedResult: vi.fn() }) }));

import { GameIcon } from "@/components/game-icon";
import { fragmentToast, type DeedToast } from "@/lib/realm3d/talk";
import { DeedToastBanner } from "./guide-hud";

afterEach(cleanup);

/** The paths a named icon draws, to tell which icon the banner chose. */
const iconPaths = (name: "map" | "house" | "castle") => render(<GameIcon name={name} />).container.querySelector("svg")!.innerHTML;
const bannerIcon = () => screen.getByRole("status").querySelector("svg")!.innerHTML;

const SIDE_QUEST: DeedToast = { title: "The Village Well is rising!", line: "Old Bram says thank you.", done: 1, total: 5, rose: false, spoken: "x" };

describe("the toast banner", () => {
  it("shows a map toast with the map icon, and no progress pips", () => {
    const mapIcon = iconPaths("map");
    cleanup();
    render(<DeedToastBanner toast={fragmentToast("Thunder Head")} numerals />);
    expect(screen.getByRole("status")).toHaveTextContent("You found a map to Thunder Head!");
    expect(screen.getByRole("status")).toHaveTextContent("Look for it on your map.");
    expect(bannerIcon()).toBe(mapIcon);
    expect(screen.queryByRole("img", { name: /done/ })).toBeNull();
    expect(screen.queryByText("0 of 0")).toBeNull();
  });

  it("shows no progress for any toast with a total of 0", () => {
    render(<DeedToastBanner toast={{ ...SIDE_QUEST, done: 0, total: 0 }} numerals />);
    expect(screen.queryByRole("img", { name: /done/ })).toBeNull();
  });

  it("still shows a side quest's progress, and its house or castle icon, as before", () => {
    const house = iconPaths("house");
    const castle = iconPaths("castle");
    cleanup();
    const view = render(<DeedToastBanner toast={SIDE_QUEST} numerals />);
    expect(screen.getByRole("img", { name: "1 of 5 side quests done." })).toBeInTheDocument();
    expect(screen.getByText("1 of 5")).toBeInTheDocument();
    expect(bannerIcon()).toBe(house);
    view.rerender(<DeedToastBanner toast={{ ...SIDE_QUEST, rose: true }} numerals />);
    expect(bannerIcon()).toBe(castle);
  });

  it("is nothing without a toast", () => {
    const { container } = render(<DeedToastBanner toast={null} numerals />);
    expect(container).toBeEmptyDOMElement();
  });
});
