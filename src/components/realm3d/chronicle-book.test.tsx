import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/chronicle", () => ({ getChronicle: vi.fn() }));
// A grown-up who may seal presses (or lifts) seals from the book through these actions.
vi.mock("@/lib/actions/chronicle-seals", () => ({ sealEntry: vi.fn(), unsealEntry: vi.fn() }));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { getChronicle } from "@/lib/actions/chronicle";
import { sealEntry, unsealEntry } from "@/lib/actions/chronicle-seals";
import type { ChronicleEntry, ChronicleWeek } from "@/lib/services/realm-chronicle";
import { ChronicleBook, weekLabel } from "./chronicle-book";

afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());

const NOW = new Date("2026-11-19T12:00:00Z");

function entry(over: Partial<ChronicleEntry> = {}): ChronicleEntry {
  return { assignmentId: "a1", date: "2026-11-18", title: "Fractions", subject: "Math", materialColor: "#7a8a99", notes: "I did the hard ones.", drawing: null, seal: null, ...over };
}
const THIS_WEEK: ChronicleWeek = { weekStart: "2026-11-16", entries: [entry(), entry({ assignmentId: "a2", title: "Map of the farm", subject: null, notes: null })] };
const LAST_WEEK: ChronicleWeek = { weekStart: "2026-11-09", entries: [entry({ assignmentId: "a3", title: "Decimals", subject: "Math", notes: "Hard." })] };
const OLDER: ChronicleWeek = { weekStart: "2025-12-29", entries: [entry({ assignmentId: "a4", title: "Latin chant", notes: "Ave." })] };

/** What `getChronicle` answers: the weeks, and whether this reader may seal (a hero never). */
function pages(weeks: ChronicleWeek[], canSeal = false) {
  return { weeks, canSeal };
}

function book(over: Partial<React.ComponentProps<typeof ChronicleBook>> = {}) {
  const onClose = vi.fn();
  render(<ChronicleBook childId="c1" heroName="Emma" isHero now={NOW} onClose={onClose} {...over} />);
  return { onClose };
}

describe("weekLabel", () => {
  it("names the week by its Monday, with no year in the current year", () => {
    expect(weekLabel("2026-11-16", NOW)).toBe("Week of 16 November");
    expect(weekLabel("2026-01-05", NOW)).toBe("Week of 5 January");
  });

  it("adds the year when it is not the current one", () => {
    expect(weekLabel("2025-12-29", NOW)).toBe("Week of 29 December 2025");
  });
});

describe("the Chronicle book", () => {
  it("says it is opening while the pages load, then shows the newest week", async () => {
    let finish!: (w: ReturnType<typeof pages>) => void;
    vi.mocked(getChronicle).mockReturnValue(new Promise((r) => (finish = r)));
    book();
    expect(screen.getByRole("dialog", { name: "Your Chronicle" })).toBeInTheDocument();
    expect(screen.getByText("Opening the Chronicle…")).toBeInTheDocument();
    // A screen reader hears it as a status, not just a line of text.
    expect(screen.getByRole("status")).toHaveTextContent("Opening the Chronicle…");
    expect(getChronicle).toHaveBeenCalledWith("c1");
    finish(pages([THIS_WEEK]));
    expect(await screen.findByText("Week of 16 November")).toBeInTheDocument();
    expect(screen.queryByText("Opening the Chronicle…")).toBeNull();
  });

  it("titles the book for a visiting grown-up with the hero's name", async () => {
    vi.mocked(getChronicle).mockResolvedValue(pages([THIS_WEEK]));
    book({ isHero: false });
    expect(screen.getByRole("dialog", { name: "Emma's Chronicle" })).toBeInTheDocument();
    await screen.findByText("Week of 16 November");
  });

  it("pages one week at a time, newest first, with earlier and later buttons", async () => {
    vi.mocked(getChronicle).mockResolvedValue(pages([THIS_WEEK, LAST_WEEK, OLDER]));
    book();
    await screen.findByText("Week of 16 November");
    expect(screen.getByText("Fractions")).toBeInTheDocument();
    expect(screen.queryByText("Decimals")).toBeNull();
    expect(screen.getByRole("button", { name: "Later week" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Earlier week" }));
    expect(screen.getByText("Week of 9 November")).toBeInTheDocument();
    expect(screen.getByText("Decimals")).toBeInTheDocument();
    expect(screen.queryByText("Fractions")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Earlier week" }));
    expect(screen.getByText("Week of 29 December 2025")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Earlier week" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Later week" }));
    fireEvent.click(screen.getByRole("button", { name: "Later week" }));
    expect(screen.getByText("Week of 16 November")).toBeInTheDocument();
  });

  it("shows an entry's title, subject with its material dot, notes, drawing and seal", async () => {
    const drawing = { v: 1 as const, strokes: [{ c: 2, w: 1, p: [10, 10, 50, 60] }] };
    const seal = { phrase: 1, by: "Mama", at: 1_700_000_000 };
    vi.mocked(getChronicle).mockResolvedValue(pages([{ weekStart: "2026-11-16", entries: [entry({ drawing, seal, materialColor: "#123456" })] }]));
    book();
    const item = (await screen.findByText("Fractions")).closest("li")!;
    expect(within(item).getByText("Math")).toBeInTheDocument();
    const dot = item.querySelector(".r3-chron-dot") as HTMLElement;
    expect(dot.style.backgroundColor).toBe("rgb(18, 52, 86)");
    expect(within(item).getByText("I did the hard ones.")).toBeInTheDocument();
    expect(within(item).getByRole("img", { name: /drawing/i })).toBeInTheDocument();
    expect(item.querySelectorAll("svg path")).toHaveLength(1);
    expect(within(item).getByTestId("chronicle-seal")).toHaveTextContent("I'm proud of you.");
    expect(within(item).getByTestId("chronicle-seal")).toHaveTextContent("Mama");
  });

  it("leaves out what an entry does not have, and offers the hero no seal control", async () => {
    vi.mocked(getChronicle).mockResolvedValue(pages([{ weekStart: "2026-11-16", entries: [...THIS_WEEK.entries, entry({ assignmentId: "a9", title: "Sealed one", seal: { phrase: 0, by: "Mama", at: 1 } })] }]));
    book();
    const bare = (await screen.findByText("Map of the farm")).closest("li")!;
    expect(bare.querySelector(".r3-chron-dot")).toBeNull();
    expect(bare.querySelector("svg")).toBeNull();
    expect(within(bare).queryByTestId("chronicle-seal")).toBeNull();
    expect(screen.queryByRole("button", { name: /seal/i })).toBeNull();
  });

  it("lets a grown-up who may seal press a seal from the book, and shows it once the pages are read again", async () => {
    const sealed = { phrase: 2, by: "Mama", at: 1_700_000_000 };
    vi.mocked(getChronicle)
      .mockResolvedValueOnce(pages([THIS_WEEK, LAST_WEEK], true))
      .mockResolvedValueOnce(pages([THIS_WEEK, { weekStart: "2026-11-09", entries: [entry({ assignmentId: "a3", title: "Decimals", notes: "Hard.", seal: sealed })] }], true));
    vi.mocked(sealEntry).mockResolvedValue(undefined);
    book({ isHero: false });
    await screen.findByText("Week of 16 November");
    // Last week's page: the card for it is long gone from the quest board, so the book is the place.
    fireEvent.click(screen.getByRole("button", { name: "Earlier week" }));
    const item = screen.getByText("Decimals").closest("li")!;
    expect(within(item).queryByTestId("chronicle-seal")).toBeNull();
    fireEvent.click(within(item).getByRole("button", { name: "Seal it" }));
    fireEvent.click(within(item).getByRole("button", { name: "You kept going!" }));
    fireEvent.click(within(item).getByRole("button", { name: "Press the seal" }));
    await waitFor(() => expect(sealEntry).toHaveBeenCalledWith("a3", { phrase: 2 }));
    // The book reads its pages again (staying on the same week), not the whole route.
    const badge = await screen.findByTestId("chronicle-seal");
    expect(badge).toHaveTextContent("You kept going!");
    expect(getChronicle).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Week of 9 November")).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(within(badge.closest("li")!).getByRole("button", { name: "Remove seal" })).toBeInTheDocument();
  });

  it("lets a grown-up who may seal lift a seal from the book", async () => {
    const seal = { phrase: 1, by: "Mama", at: 1_700_000_000 };
    vi.mocked(getChronicle)
      .mockResolvedValueOnce(pages([{ weekStart: "2026-11-16", entries: [entry({ seal })] }], true))
      .mockResolvedValueOnce(pages([{ weekStart: "2026-11-16", entries: [entry()] }], true));
    vi.mocked(unsealEntry).mockResolvedValue(undefined);
    book({ isHero: false });
    await screen.findByTestId("chronicle-seal");
    fireEvent.click(screen.getByRole("button", { name: "Remove seal" }));
    await waitFor(() => expect(screen.queryByTestId("chronicle-seal")).toBeNull());
    expect(unsealEntry).toHaveBeenCalledWith("a1");
    expect(screen.getByRole("button", { name: "Seal it" })).toBeInTheDocument();
  });

  it("says so on the entry when the seal cannot be lifted", async () => {
    vi.mocked(getChronicle).mockResolvedValue(pages([{ weekStart: "2026-11-16", entries: [entry({ seal: { phrase: 1, by: "Mama", at: 1 } })] }], true));
    vi.mocked(unsealEntry).mockRejectedValue(new Error("Read-only access"));
    book({ isHero: false });
    fireEvent.click(await screen.findByRole("button", { name: "Remove seal" }));
    expect(await screen.findByText("Read-only access")).toBeInTheDocument();
    expect(screen.getByTestId("chronicle-seal")).toBeInTheDocument();
  });

  it("offers a visitor who may not seal no seal control, and never the hero, even on a sealed page", async () => {
    const sealedWeek = pages([{ weekStart: "2026-11-16", entries: [entry({ seal: { phrase: 1, by: "Mama", at: 1 } }), entry({ assignmentId: "a2" })] }]);
    vi.mocked(getChronicle).mockResolvedValue(sealedWeek);
    book({ isHero: false });
    await screen.findByTestId("chronicle-seal");
    expect(screen.queryByRole("button", { name: /seal/i })).toBeNull();
    cleanup();
    book();
    await screen.findByTestId("chronicle-seal");
    expect(screen.queryByRole("button", { name: /seal/i })).toBeNull();
  });

  it("renders notes as text, never as markup", async () => {
    vi.mocked(getChronicle).mockResolvedValue(pages([{ weekStart: "2026-11-16", entries: [entry({ notes: "<b>bold</b><img src=x onerror=alert(1)>" })] }]));
    book();
    const item = (await screen.findByText("Fractions")).closest("li")!;
    expect(item.querySelector("b")).toBeNull();
    expect(item.querySelector("img")).toBeNull();
    expect(item).toHaveTextContent("<b>bold</b><img src=x onerror=alert(1)>");
  });

  it("tells the hero how a first page comes", async () => {
    vi.mocked(getChronicle).mockResolvedValue(pages([]));
    book();
    expect(await screen.findByText("Your Chronicle is waiting. Tell the Scribe about a quest: write it or draw it, and it will appear here.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Earlier week" })).toBeNull();
  });

  it("tells a visitor the hero's Chronicle is waiting", async () => {
    vi.mocked(getChronicle).mockResolvedValue(pages([]));
    book({ isHero: false });
    expect(await screen.findByText("Emma's Chronicle is waiting for its first page.")).toBeInTheDocument();
  });

  it("says so on the page when it cannot open, and tries again", async () => {
    vi.mocked(getChronicle).mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(pages([THIS_WEEK]));
    book();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The Chronicle would not open.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("Opening the Chronicle…")).toBeInTheDocument();
    expect(await screen.findByText("Week of 16 November")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(getChronicle).toHaveBeenCalledTimes(2);
  });

  it("closes from the foot", async () => {
    vi.mocked(getChronicle).mockResolvedValue(pages([]));
    const { onClose } = book();
    await waitFor(() => expect(screen.queryByText("Opening the Chronicle…")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Back to the Realm" }));
    expect(onClose).toHaveBeenCalled();
  });
});
