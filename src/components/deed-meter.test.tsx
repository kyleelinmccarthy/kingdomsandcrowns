import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeedMeter } from "./deed-meter";

afterEach(cleanup);
const meter = { skillLabel: "Multiplication facts", filled: 3, needed: 7 };

describe("DeedMeter", () => {
  it("shows the skill and one pip per step needed, the earned ones lit", () => {
    const { container } = render(<DeedMeter meter={meter} streak={0} calm={false} numerals />);
    expect(screen.getByText("Multiplication facts")).toBeInTheDocument();
    expect(container.querySelectorAll(".deed-meter-pip")).toHaveLength(7);
    expect(container.querySelectorAll(".deed-meter-pip--lit")).toHaveLength(3);
  });

  it("shows no digits and no level word", () => {
    const { container } = render(<DeedMeter meter={meter} streak={0} calm={false} numerals />);
    expect(container.textContent).not.toMatch(/\d|level|rung/i);
  });

  it("shows the flame only from two first tries in a row", () => {
    const { rerender } = render(<DeedMeter meter={meter} streak={1} calm={false} numerals />);
    expect(screen.queryByTestId("deed-streak")).toBeNull();
    rerender(<DeedMeter meter={meter} streak={2} calm={false} numerals />);
    expect(screen.getByTestId("deed-streak")).toHaveTextContent("2");
    rerender(<DeedMeter meter={meter} streak={5} calm={false} numerals />);
    expect(screen.getByTestId("deed-streak")).toHaveTextContent("5");
  });

  it("keeps the flame and count in calm mode, with no animation class", () => {
    const { container } = render(<DeedMeter meter={meter} streak={3} calm numerals />);
    expect(screen.getByTestId("deed-streak")).toHaveTextContent("3");
    expect(container.querySelector(".deed-meter-flame--live")).toBeNull();
    const live = render(<DeedMeter meter={meter} streak={3} calm={false} numerals />);
    expect(live.container.querySelector(".deed-meter-flame--live")).not.toBeNull();
  });

  it("draws no pips without a meter, but still shows a streak; nothing at all with neither", () => {
    const { container, rerender } = render(<DeedMeter meter={null} streak={0} calm={false} numerals />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DeedMeter meter={null} streak={2} calm={false} numerals />);
    expect(container.querySelector(".deed-meter-pip")).toBeNull();
    expect(screen.getByTestId("deed-streak")).toBeInTheDocument();
  });

  it("at simple depth shows the flame with no digit, and says so without a number", () => {
    const { container } = render(<DeedMeter meter={meter} streak={4} calm={false} numerals={false} />);
    expect(screen.getByTestId("deed-streak")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d/);
    expect(screen.getByTestId("deed-streak").getAttribute("aria-label")).not.toMatch(/\d/);
  });
});
