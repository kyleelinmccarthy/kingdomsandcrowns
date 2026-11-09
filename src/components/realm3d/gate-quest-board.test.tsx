import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/deeds", () => ({
  startDeedRun: vi.fn(),
  answerDeedQuestion: vi.fn(),
  retryDeedQuestion: vi.fn(),
  resolveDeedQuestion: vi.fn(),
  completeDeedRun: vi.fn(),
}));
vi.mock("@/lib/utils/speech", () => ({ canSpeak: () => true, speak: vi.fn(), stopSpeaking: vi.fn() }));

import type { BuildingOverview } from "@/lib/services/deeds";
import { GateQuestBoard } from "./gate-quest-board";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  (window as unknown as { speechSynthesis: { cancel: () => void } }).speechSynthesis = { cancel: () => {} };
});

const building = (id: string, label: string, deeds: { id: string; title: string }[]): BuildingOverview => ({
  id,
  label,
  description: "",
  icon: "box",
  done: 0,
  total: 5,
  complete: false,
  stars: 0,
  maxStars: 15,
  deeds: deeds.map((d) => ({ ...d, story: "A story.", area: "math" as const, bestStars: 0 as const, crowned: false })),
});

const buildings = [
  building("well", "Village Well", [
    { id: "well-stones", title: "Count the Well Stones" },
    { id: "well-rope", title: "Measure the Rope" },
  ]),
  building("mill", "Mill", [{ id: "mill-sacks", title: "Sort the Sacks" }]),
  // A building with nothing to play is left off the board.
  building("bridge", "Bridge", []),
];

function board(onClose = () => {}) {
  return render(
    <GateQuestBoard
      childId="demo-child-1"
      buildings={buildings}
      heroName="Emma"
      numerals
      profile={{ readAloud: false, untimed: true }}
      calm={false}
      onResult={() => {}}
      onClose={onClose}
    />,
  );
}

describe("the gate's quest board", () => {
  it("lists every building's side quests, under the villager who asks for them", () => {
    board();
    expect(screen.getByRole("dialog", { name: "Side Quests" })).toBeInTheDocument();
    for (const title of ["Count the Well Stones", "Measure the Rope", "Sort the Sacks"]) expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Talk to Old Bram" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Talk to Miller Tessa" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Talk to Carpenter Aldo" })).toBeNull();
  });

  it("opens the villager's own board, where a side quest begins, and comes back to the list", async () => {
    board();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Talk to Old Bram" })));
    expect(screen.getByRole("button", { name: "Begin Count the Well Stones" })).toBeInTheDocument();
    expect(screen.queryByText("Sort the Sacks")).toBeNull();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Goodbye" })));
    expect(screen.getByRole("button", { name: "Talk to Miller Tessa" })).toBeInTheDocument();
  });

  it("goes back to the gate", () => {
    const onClose = vi.fn();
    board(onClose);
    fireEvent.click(screen.getByRole("button", { name: "Back to the gate" }));
    expect(onClose).toHaveBeenCalled();
  });
});
