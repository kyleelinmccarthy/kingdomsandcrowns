import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { DeedMeter } from "./deed-meter";

afterEach(cleanup);
const meter = { skillLabel: "Multiplication facts", filled: 3, needed: 7 };

describe("DeedMeter", () => {
  it("shows the skill and one pip per step needed, the earned ones lit", () => {
    const { container } = render(<DeedMeter meter={meter} streak={0} calm={false} />);
    expect(screen.getByText("Multiplication facts")).toBeInTheDocument();
    expect(container.querySelectorAll(".deed-meter-pip")).toHaveLength(7);
    expect(container.querySelectorAll(".deed-meter-pip--lit")).toHaveLength(3);
  });

  it("shows no digits and no level word", () => {
    const { container } = render(<DeedMeter meter={meter} streak={0} calm={false} />);
    expect(container.textContent).not.toMatch(/\d|level|rung/i);
  });

  it("shows the flame only from two first tries in a row", () => {
    const { rerender } = render(<DeedMeter meter={meter} streak={1} calm={false} />);
    expect(screen.queryByTestId("deed-streak")).toBeNull();
    rerender(<DeedMeter meter={meter} streak={2} calm={false} />);
    expect(screen.getByTestId("deed-streak")).toHaveTextContent("2");
    rerender(<DeedMeter meter={meter} streak={5} calm={false} />);
    expect(screen.getByTestId("deed-streak")).toHaveTextContent("5");
  });

  it("keeps the flame and count in calm mode, with no animation class", () => {
    const { container } = render(<DeedMeter meter={meter} streak={3} calm />);
    expect(screen.getByTestId("deed-streak")).toHaveTextContent("3");
    expect(container.querySelector(".deed-meter-flame--live")).toBeNull();
    const live = render(<DeedMeter meter={meter} streak={3} calm={false} />);
    expect(live.container.querySelector(".deed-meter-flame--live")).not.toBeNull();
  });

  it("draws no pips without a meter, but still shows a streak; nothing at all with neither", () => {
    const { container, rerender } = render(<DeedMeter meter={null} streak={0} calm={false} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<DeedMeter meter={null} streak={2} calm={false} />);
    expect(container.querySelector(".deed-meter-pip")).toBeNull();
    expect(screen.getByTestId("deed-streak")).toBeInTheDocument();
  });
});
