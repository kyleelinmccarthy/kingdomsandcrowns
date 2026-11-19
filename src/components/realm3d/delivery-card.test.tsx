import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Delivery } from "@/lib/realm/works-state";
import { DeliveryCard } from "./delivery-card";

/**
 * The carts on entry (R-D9): what came in since the hero last looked, and the quests it came from,
 * named. One button back to the kingdom. The card only says it; the frame decides when it shows and
 * writes it down as seen (`realm-game.tsx`'s `go`).
 */
afterEach(cleanup);

const row = (materialId: Delivery["rows"][number]["materialId"], title: string, amount = 1, origin: "quest" | "welcome" = "quest") => ({ materialId, amount, title, origin });

describe("the delivery card", () => {
  it("opens on the carts, names each material and its quests in their own type", () => {
    const delivery: Delivery = { rows: [row("stone", "Fractions p.12"), row("stone", "Times tables"), row("ink", "Volcanoes, part 2")], through: 100 };
    render(<DeliveryCard delivery={delivery} onClose={() => {}} />);
    const card = screen.getByRole("dialog", { name: "The carts are in!" });
    expect(card).toHaveTextContent("The carts are in!");
    const lines = [...card.querySelectorAll(".r3-delivery-line")];
    expect(lines.map((l) => l.textContent)).toEqual(["2 Stone from Fractions p.12 and Times tables", "1 Ink from Volcanoes, part 2"]);
    expect([...lines[0].querySelectorAll("em")].map((e) => e.textContent)).toEqual(["Fractions p.12", "Times tables"]);
  });

  it("joins three titles with commas, and counts the rest", () => {
    const delivery: Delivery = { rows: ["A", "B", "C", "D", "E"].map((t) => row("herbs", t)), through: 100 };
    const { container } = render(<DeliveryCard delivery={delivery} onClose={() => {}} />);
    const line = container.querySelector(".r3-delivery-line")!;
    expect(line).toHaveTextContent("5 Herbs from A, B, C and 2 more");
    expect([...line.querySelectorAll("em")].map((e) => e.textContent)).toEqual(["A", "B", "C"]);
    cleanup();
    render(<DeliveryCard delivery={{ rows: ["A", "B", "C"].map((t) => row("herbs", t)), through: 1 }} onClose={() => {}} />);
    expect(document.querySelector(".r3-delivery-line")).toHaveTextContent("3 Herbs from A, B and C");
  });

  it("carries the welcome title when the carts bring the four weeks before the Realm", () => {
    render(<DeliveryCard delivery={{ rows: [row("dye", "Painting", 3, "welcome")], through: 1 }} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "The carts arrived with four weeks of your work" })).toBeInTheDocument();
  });

  it("has one way on, to the kingdom, where the keyboard lands", () => {
    const onClose = vi.fn();
    render(<DeliveryCard delivery={{ rows: [row("stone", "Fractions p.12")], through: 1 }} onClose={onClose} />);
    const go = screen.getByRole("button", { name: "To the kingdom!" });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(go).toHaveFocus();
    fireEvent.click(go);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("writes every title as text, never as markup", () => {
    const { container } = render(<DeliveryCard delivery={{ rows: [row("ink", "<b>bold</b>")], through: 1 }} onClose={() => {}} />);
    expect(container.ownerDocument.querySelector(".r3-delivery-line em b")).toBeNull();
    expect(screen.getByText("<b>bold</b>")).toBeInTheDocument();
  });
});
