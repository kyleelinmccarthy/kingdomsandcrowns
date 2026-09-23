import fs from "fs";
import path from "path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePages, withEmptyPages } from "@/lib/realm/spells/pages";
import { hideTroublePlate, makeTroubleBus, paintTroubleLabel, paintTroubleMark, paintTroublePips, paintTroublePlate } from "@/lib/realm3d/trouble-bus";
import { TROUBLE_POOL, type TroubleEvent } from "@/lib/realm3d/troubles3d";
import { BountyGain, GAIN_MS, NOTICE_MS, TroubleMapMarks, TroubleNotices, TroublePlates } from "./troubles-hud";

afterEach(cleanup);

const pages = withEmptyPages(
  resolvePages([{ slot: 1, elementId: "ember", formId: "bolt", modifierId: null, adjective: "Ember", noun: "Bolt" }] as never, 4),
  4,
);
const ev = (kind: TroubleEvent["kind"], trouble: TroubleEvent["trouble"] = "fog", count = 1): TroubleEvent => ({ kind, trouble, home: 0, x: 0, z: 0, count });

describe("the markers and the map", () => {
  it("puts one hidden plate and one hidden map dot per trouble slot in the page, and hands each to the bus", () => {
    const tbus = makeTroubleBus();
    const { container } = render(
      <>
        <TroublePlates tbus={tbus} />
        <svg>
          <TroubleMapMarks tbus={tbus} />
        </svg>
      </>,
    );
    expect(container.querySelectorAll(".r3t-plate")).toHaveLength(TROUBLE_POOL);
    expect(tbus.plates.every((p) => p !== null && p.style.display === "none")).toBe(true);
    expect(tbus.marks.every((m) => m !== null && m.style.display === "none")).toBe(true);
  });

  it("writes a plate's name, kind and pips only when they change", () => {
    const tbus = makeTroubleBus();
    render(<TroublePlates tbus={tbus} />);
    paintTroubleLabel(tbus, 0, "cursed-stone", "gentle", "Cursed stone");
    paintTroublePips(tbus, 0, 2, 2);
    paintTroublePlate(tbus, 0, "translate3d(10px,20px,0)", "1.00");
    const plate = tbus.plates[0]!;
    expect(plate.style.display).toBe("");
    expect(plate.dataset.kind).toBe("cursed-stone");
    expect(tbus.names[0]!.textContent).toBe("Cursed stone");
    expect(tbus.pips[0]!.dataset.left).toBe("2");
    paintTroublePips(tbus, 0, 1, 2);
    expect(tbus.pips[0]!.dataset.left).toBe("1");
    // A skin change forgets the label so the other tone's name is written.
    tbus.setSkin("monsters");
    paintTroubleLabel(tbus, 0, "cursed-stone", "monsters", "Gargoyle");
    expect(tbus.names[0]!.textContent).toBe("Gargoyle");
    hideTroublePlate(tbus, 0);
    expect(plate.style.display).toBe("none");
  });

  it("moves a map dot in world units and hides it with an empty transform", () => {
    const tbus = makeTroubleBus();
    render(
      <svg>
        <TroubleMapMarks tbus={tbus} />
      </svg>,
    );
    paintTroubleMark(tbus, 2, "translate(40.0 -12.0)");
    expect(tbus.marks[2]!.getAttribute("transform")).toBe("translate(40.0 -12.0)");
    expect(tbus.marks[2]!.style.display).toBe("");
    paintTroubleMark(tbus, 2, "");
    expect(tbus.marks[2]!.style.display).toBe("none");
  });
});

describe("the notices, in the top lane", () => {
  it("says the flat Realm's clearing line in the chosen tone, and where", () => {
    vi.useFakeTimers();
    const tbus = makeTroubleBus();
    render(<TroubleNotices tbus={tbus} skin="monsters" pages={pages} paused={false} />);
    act(() => tbus.onEvent(ev("cleared", "fog", 2), "Cloudfoot"));
    expect(screen.getByRole("status")).toHaveTextContent("The mist-wisp scatters!");
    expect(screen.getByRole("status")).toHaveTextContent("Cloudfoot is clear. 2 cleared today.");
    act(() => void vi.advanceTimersByTime(NOTICE_MS + 10));
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });

  it("follows the grown-up's tone: gentle words by default", () => {
    const tbus = makeTroubleBus();
    render(<TroubleNotices tbus={tbus} skin="gentle" pages={pages} paused={false} />);
    expect(tbus.skin).toBe("gentle");
    act(() => tbus.onEvent(ev("cleared", "shadow-blob"), null));
    expect(screen.getByRole("status")).toHaveTextContent("The shadow slips away.");
  });

  it("names the key that casts the first time a trouble is near", () => {
    const tbus = makeTroubleBus();
    render(<TroubleNotices tbus={tbus} skin="gentle" pages={pages} paused={false} />);
    act(() => tbus.onEvent(ev("sighted", "cursed-stone"), null));
    expect(screen.getByRole("status")).toHaveTextContent("A cursed stone is near!");
    expect(screen.getByRole("status")).toHaveTextContent("Press 1 to cast at it.");
  });

  it("stays out of the way under a menu", () => {
    const tbus = makeTroubleBus();
    render(<TroubleNotices tbus={tbus} skin="gentle" pages={pages} paused />);
    act(() => tbus.onEvent(ev("bounced", "shadow-blob"), null));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("clearing pays", () => {
  /** A bounty that pays the first `n` clears, as the purse would predict them. */
  function bountyPaying(n: number) {
    let clears = 0;
    const claim = vi.fn((homeId: string | null) => {
      clears += 1;
      return { paid: clears <= n && homeId !== null, capped: clears > n, already: false, clearsToday: 10 + clears };
    });
    return { enabled: true, claim, flush: vi.fn(async () => {}), gained: 0 };
  }

  it("says +1 minute on a paid clear, claims it by the trouble's home, and counts the day, not the visit", () => {
    const tbus = makeTroubleBus();
    const bounty = bountyPaying(1);
    render(<TroubleNotices tbus={tbus} skin="gentle" pages={pages} paused={false} bounty={bounty} />);
    act(() => tbus.onEvent(ev("cleared", "fog", 1), "Cloudfoot", "place-summit-6"));
    expect(bounty.claim).toHaveBeenCalledWith("place-summit-6");
    expect(screen.getByRole("status")).toHaveTextContent("+1 minute of Realm time!");
    expect(screen.getByRole("status")).toHaveTextContent("Cloudfoot is clear. 11 cleared today.");
  });

  it("says the day's minutes are all had once a visit, then just counts", () => {
    const tbus = makeTroubleBus();
    render(<TroubleNotices tbus={tbus} skin="gentle" pages={pages} paused={false} bounty={bountyPaying(0)} />);
    act(() => tbus.onEvent(ev("cleared", "fog"), null, "rim-0"));
    expect(screen.getByRole("status")).toHaveTextContent("You've had all today's minutes from clearing troubles.");
    expect(screen.getByRole("status")).not.toHaveTextContent("+1 minute");
    act(() => tbus.onEvent(ev("cleared", "fog"), null, "rim-1"));
    expect(screen.getByRole("status")).toHaveTextContent("The fields are clear. 12 cleared today.");
  });

  it("claims nothing for a bump or a sighting", () => {
    const tbus = makeTroubleBus();
    const bounty = bountyPaying(5);
    render(<TroubleNotices tbus={tbus} skin="gentle" pages={pages} paused={false} bounty={bounty} />);
    act(() => tbus.onEvent(ev("bounced", "shadow-blob"), null, "rim-2"));
    act(() => tbus.onEvent(ev("sighted", "fog"), null, "rim-0"));
    expect(bounty.claim).not.toHaveBeenCalled();
  });

  it("puts +1 by the clock for a while when a clear pays", () => {
    vi.useFakeTimers();
    const { rerender } = render(<BountyGain gained={0} />);
    expect(screen.queryByRole("status")).toBeNull();
    rerender(<BountyGain gained={1} />);
    act(() => void vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveTextContent("+1 minute for clearing a trouble");
    act(() => void vi.advanceTimersByTime(GAIN_MS + 10));
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });
});

describe("what may import three", () => {
  it.each(["lib/realm3d/troubles3d.ts", "lib/realm3d/trouble-bus.ts", "components/realm3d/troubles-hud.tsx"])("%s does not", (rel) => {
    const src = fs.readFileSync(path.join(__dirname, "../..", rel), "utf8");
    expect(src).not.toMatch(/from\s+"three"/);
    expect(src).not.toMatch(/@react-three/);
  });
});
