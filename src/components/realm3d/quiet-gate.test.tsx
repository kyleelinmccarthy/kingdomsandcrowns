import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
import type { AccessResult } from "@/lib/utils/realm-access";
import type { KingdomState } from "@/lib/realm/kingdom-state";

/**
 * The gate a child at 0 minutes meets (spec §4.5). The quest board is a stub that finishes a run
 * on a click — its own test covers the list — so this is the gate's rules alone: what it offers,
 * how a paying run wakes it, and that the world it opens has the village the gate's runs raised.
 */
const server = vi.hoisted(() => ({ access: null as AccessResult | null, kingdom: null as KingdomState | null, kingdomFails: false }));
vi.mock("@/lib/actions/realm-play", () => ({ getRealmAccess: vi.fn(async () => server.access) }));
vi.mock("@/lib/actions/realm", () => ({
  getRealmKingdom: vi.fn(async () => {
    if (server.kingdomFails) throw new Error("offline");
    return server.kingdom;
  }),
}));
vi.mock("./gate-quest-board", () => ({
  GateQuestBoard: (p: { onResult: (id: string, r: unknown) => void; onClose: () => void }) => (
    <div role="dialog" aria-label="Side Quests">
      <button type="button" onClick={() => p.onResult("well", { done: 5, total: 5, complete: true, minutesEarned: 3 })}>
        finish a run
      </button>
      <button type="button" onClick={p.onClose}>
        Back to the gate
      </button>
    </div>
  ),
}));

import { getRealmAccess } from "@/lib/actions/realm-play";
import { getRealmKingdom } from "@/lib/actions/realm";
import { QuietGate } from "./quiet-gate";

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  server.access = { allowed: true, minutesRemaining: 3, source: "earned" };
  server.kingdom = null;
  server.kingdomFails = false;
});

const well = { id: "well", label: "Village Well", description: "", icon: "box" as const, done: 4, total: 5, complete: false, stars: 0, maxStars: 15, deeds: [] };
const kingdom: KingdomState = { tone: "gentle", buildings: [well] };

function gate(onEnter = vi.fn()) {
  render(
    <QuietGate
      childId="demo-child-1"
      heroName="Emma"
      portrait={null}
      earning="You get 10 free minutes every day."
      kingdom={kingdom}
      profile={DEFAULT_LEARNING_PROFILE}
      depth="full"
      onEnter={onEnter}
    />,
  );
  return onEnter;
}

describe("the quiet gate", () => {
  it("invites the child to earn, with the earning lines and both ways on", () => {
    gate();
    expect(screen.getByRole("heading", { name: "Earn play time with a side quest" })).toBeInTheDocument();
    expect(screen.getByText("You get 10 free minutes every day.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Side quests here" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Walk in the quiet Realm" })).toBeInTheDocument();
  });

  it("walks into the quiet world, with nothing re-fetched, when no run was played", async () => {
    const onEnter = gate();
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Walk in the quiet Realm" })));
    expect(onEnter).toHaveBeenCalledWith(null, null);
    expect(getRealmKingdom).not.toHaveBeenCalled();
  });

  it("opens the side quests on the gate, and back", () => {
    gate();
    fireEvent.click(screen.getByRole("button", { name: "Side quests here" }));
    expect(screen.getByRole("dialog", { name: "Side Quests" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to the gate" }));
    expect(screen.queryByRole("dialog", { name: "Side Quests" })).toBeNull();
  });

  it("finishing a paying run re-asks the gate, and the second button becomes Enter the Realm", async () => {
    gate();
    fireEvent.click(screen.getByRole("button", { name: "Side quests here" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "finish a run" })));
    expect(getRealmAccess).toHaveBeenCalledWith("demo-child-1");
    expect(screen.getByRole("button", { name: "Enter the Realm" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Walk in the quiet Realm" })).toBeNull();
    expect(screen.getByRole("heading", { name: "+3 minutes — the Realm wakes up!" })).toBeInTheDocument();
  });

  it("stays quiet when the run paid nothing (the gate still says quiet)", async () => {
    server.access = { allowed: true, minutesRemaining: 0, source: "quiet" };
    gate();
    fireEvent.click(screen.getByRole("button", { name: "Side quests here" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "finish a run" })));
    expect(screen.getByRole("button", { name: "Walk in the quiet Realm" })).toBeInTheDocument();
  });

  it("enters with the new access answer and the re-fetched village, so a building raised at the gate stands", async () => {
    const raised: KingdomState = { tone: "gentle", buildings: [{ ...well, done: 5, complete: true }] };
    server.kingdom = raised;
    const onEnter = gate();
    fireEvent.click(screen.getByRole("button", { name: "Side quests here" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "finish a run" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Enter the Realm" })));
    expect(getRealmKingdom).toHaveBeenCalledWith("demo-child-1");
    expect(onEnter).toHaveBeenCalledWith({ allowed: true, minutesRemaining: 3, source: "earned" }, raised);
  });

  it("keeps what the gate's runs raised when the village cannot be re-fetched", async () => {
    server.kingdomFails = true;
    const onEnter = gate();
    fireEvent.click(screen.getByRole("button", { name: "Side quests here" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "finish a run" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Enter the Realm" })));
    const [, entered] = onEnter.mock.calls[0] as [AccessResult, KingdomState];
    expect(entered.buildings[0]).toMatchObject({ id: "well", done: 5, complete: true });
  });

  it("closing the board puts focus back on Side quests here", () => {
    gate();
    fireEvent.click(screen.getByRole("button", { name: "Side quests here" }));
    fireEvent.click(screen.getByRole("button", { name: "Back to the gate" }));
    expect(screen.getByRole("button", { name: "Side quests here" })).toHaveFocus();
  });

  it("both ways wait while the gate is asked again after a run, then open on its answer", async () => {
    let answer!: (a: AccessResult) => void;
    vi.mocked(getRealmAccess).mockReturnValueOnce(new Promise<AccessResult>((r) => (answer = r)));
    gate();
    fireEvent.click(screen.getByRole("button", { name: "Side quests here" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "finish a run" })));
    fireEvent.click(screen.getByRole("button", { name: "Back to the gate" }));
    expect(screen.getByRole("button", { name: "Side quests here" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Walk in the quiet Realm" })).toBeDisabled();
    await act(async () => answer({ allowed: true, minutesRemaining: 3, source: "earned" }));
    expect(screen.getByRole("button", { name: "Side quests here" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Enter the Realm" })).toBeEnabled();
  });

  it("only the latest re-check's answer counts", async () => {
    let first!: (a: AccessResult) => void;
    let second!: (a: AccessResult) => void;
    vi.mocked(getRealmAccess)
      .mockReturnValueOnce(new Promise<AccessResult>((r) => (first = r)))
      .mockReturnValueOnce(new Promise<AccessResult>((r) => (second = r)));
    gate();
    fireEvent.click(screen.getByRole("button", { name: "Side quests here" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "finish a run" })));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "finish a run" })));
    await act(async () => second({ allowed: true, minutesRemaining: 6, source: "earned" }));
    await act(async () => first({ allowed: true, minutesRemaining: 3, source: "earned" }));
    expect(screen.getByRole("heading", { name: "+6 minutes — the Realm wakes up!" })).toBeInTheDocument();
  });

  it("both ways wait while the village is fetched on the way in", async () => {
    vi.mocked(getRealmKingdom).mockReturnValueOnce(new Promise<KingdomState>(() => {}));
    gate();
    fireEvent.click(screen.getByRole("button", { name: "Side quests here" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "finish a run" })));
    fireEvent.click(screen.getByRole("button", { name: "Back to the gate" }));
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Enter the Realm" })));
    expect(screen.getByRole("button", { name: "Side quests here" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Enter the Realm" })).toBeDisabled();
  });
});
