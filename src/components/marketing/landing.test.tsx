import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { Landing } from "./landing";

afterEach(cleanup);

const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("Landing", () => {
  it("shows the Realm after the features and before Built for parents", () => {
    const { container } = render(<Landing />);
    const features = screen.getByRole("heading", { name: "Everything your homeschool needs" });
    const realm = container.querySelector("#realm");
    const parents = screen.getByRole("heading", { name: "Built for parents" });
    expect(realm).not.toBeNull();
    expect(follows(features, realm!)).toBe(true);
    expect(follows(realm!, parents)).toBe(true);
  });
});
