import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { emptyRecessRecord, type RecessRecord } from "@/lib/realm/recess/record";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
const getRecessRecord = vi.fn();
vi.mock("@/lib/actions/realm-recess", () => ({ getRecessRecord: (...a: unknown[]) => getRecessRecord(...a) }));

import { loadHeroRings, RecessTavernCard, RecessTavernCardView, RING_EMPTY, RING_RESTING, RING_SUB, RING_TITLE, type HeroRing } from "./recess-tavern-card";

const C = "island-ring-1";
const rec = (o: Partial<RecessRecord>): RecessRecord => ({ ...emptyRecessRecord(C), ...o });
const ring = (name: string, record: RecessRecord | null, failed = false): HeroRing => ({ id: name.toLowerCase(), name, record, failed });

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("the Ring's Tavern card", () => {
  it("is headed The Ring, with the spec's sub-line, in a GameFrame like the Tavern's other panels", () => {
    const { container } = render(<RecessTavernCardView rings={[ring("Emma", rec({ bestLapMs: 38400, totalGleams: 147, laps: 9 }))]} className="hud-panel-ring" />);
    expect(screen.getByText(RING_TITLE)).toBeInTheDocument();
    expect(screen.getByText(RING_SUB)).toBeInTheDocument();
    expect(RING_SUB).toBe("Gleams and lap times from the Realm.");
    expect(container.querySelector(".game-frame.hud-panel-ring .game-frame-title")).toHaveTextContent("The Ring");
  });

  it("gives one sentence per hero who has a lap — foot first, the ride when there is only a ride", () => {
    render(
      <RecessTavernCardView
        rings={[ring("Emma", rec({ bestLapMs: 38400, bestMountedLapMs: 20000, totalGleams: 147, laps: 9 })), ring("Noah", rec({ bestMountedLapMs: 24100, totalGleams: 60, laps: 2 }))]}
      />,
    );
    expect(screen.getByText("Emma ran the Ring in 38.4 s.")).toBeInTheDocument();
    expect(screen.getByText("Noah ran the Ring riding in 24.1 s.")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows each hero's jar and how far their light has got along the road", () => {
    render(<RecessTavernCardView rings={[ring("Emma", rec({ bestLapMs: 38400, totalGleams: 147, laps: 9 }))]} />);
    expect(screen.getByText(/147 gleams in the jar · 5 of 12 lamps lit along the road\./)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Gleam jar" })).toBeInTheDocument();
  });

  it("leaves out a hero with no record at all, and names one with gleams but no lap without a time", () => {
    render(<RecessTavernCardView rings={[ring("Emma", rec({})), ring("Noah", rec({ totalGleams: 1 }))]} />);
    expect(screen.queryByText(/Emma/)).not.toBeInTheDocument();
    expect(screen.getByText(/Noah has no lap yet\. 1 gleam in the jar/)).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it("says so when nobody has run it yet, and never claims a zero", () => {
    render(<RecessTavernCardView rings={[ring("Emma", rec({})), ring("Noah", null)]} />);
    expect(screen.getByText(RING_EMPTY)).toBeInTheDocument();
    expect(screen.queryByText(/0 gleams/)).not.toBeInTheDocument();
  });

  it("when no record could be read, says the records are resting and offers Try again", () => {
    render(<RecessTavernCardView rings={[ring("Emma", null, true)]} />);
    expect(screen.getByText(RING_RESTING)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("shows the heroes that loaded when only some failed", () => {
    render(<RecessTavernCardView rings={[ring("Emma", null, true), ring("Noah", rec({ bestLapMs: 41000, totalGleams: 30, laps: 1 }))]} />);
    expect(screen.queryByText(RING_RESTING)).not.toBeInTheDocument();
    expect(screen.getByText("Noah ran the Ring in 41.0 s.")).toBeInTheDocument();
  });

  it("says a full jar is full", () => {
    render(<RecessTavernCardView rings={[ring("Emma", rec({ bestLapMs: 38400, totalGleams: 1200, laps: 90 }))]} />);
    expect(screen.getByText(/Every lamp on the road is lit\. The jar is full\./)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "The jar is full." })).toBeInTheDocument();
  });
});

describe("reading the records", () => {
  it("reads every hero's record, by id, and marks one that fails rather than throwing", async () => {
    getRecessRecord.mockImplementation(async (id: string) => {
      if (id === "noah") throw new Error("nope");
      return rec({ bestLapMs: 38400, totalGleams: 10, laps: 1 });
    });
    const rings = await loadHeroRings([
      { id: "emma", displayName: "Emma" },
      { id: "noah", displayName: "Noah" },
    ]);
    expect(getRecessRecord).toHaveBeenCalledWith("emma");
    expect(getRecessRecord).toHaveBeenCalledWith("noah");
    expect(rings.map((r) => [r.name, r.failed])).toEqual([
      ["Emma", false],
      ["Noah", true],
    ]);
  });

  it("renders from the server as the view does", async () => {
    getRecessRecord.mockResolvedValue(rec({ bestLapMs: 38400, totalGleams: 147, laps: 9 }));
    render(await RecessTavernCard({ heroes: [{ id: "emma", displayName: "Emma" }] }));
    expect(screen.getByText("Emma ran the Ring in 38.4 s.")).toBeInTheDocument();
  });
});
