import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StarRow } from "./star-row";

afterEach(cleanup);

describe("StarRow", () => {
  it("draws one star per possible star, lights the earned ones, and names the count", () => {
    const { container } = render(<StarRow stars={2} className="row" starClass="star" onClass="on" offClass="off" />);
    expect(screen.getByRole("img", { name: "2 of 3 stars" })).toHaveClass("row");
    expect(container.querySelectorAll(".star")).toHaveLength(3);
    expect(container.querySelectorAll(".star.on")).toHaveLength(2);
    expect(container.querySelectorAll(".star.off")).toHaveLength(1);
  });
});
