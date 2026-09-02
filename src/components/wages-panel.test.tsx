import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { WagesPanel } from "./wages-panel";

afterEach(cleanup);

describe("WagesPanel", () => {
  it("shows a hero their balance in coin", () => {
    render(<WagesPanel balanceCents={1250} isChildView />);
    expect(screen.getByText("12 gp 5 sp")).toBeInTheDocument();
  });

  it("shows a parent the balance in currency", () => {
    render(<WagesPanel balanceCents={1250} isChildView={false} />);
    expect(screen.getByText("$12.50")).toBeInTheDocument();
  });

  it("shows a zero balance rather than hiding the panel", () => {
    render(<WagesPanel balanceCents={0} isChildView />);
    expect(screen.getByText("0 gp")).toBeInTheDocument();
  });

  it("labels a negative balance as paid ahead", () => {
    render(<WagesPanel balanceCents={-500} isChildView={false} />);
    expect(screen.getByText(/paid ahead/i)).toBeInTheDocument();
  });
});
