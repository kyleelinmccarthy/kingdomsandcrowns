import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RealmGate } from "./realm-gate";
import { gateCopy } from "@/lib/realm/play-clock";

afterEach(cleanup);

describe("RealmGate", () => {
  it("shows the reason in the hero's terms", () => {
    render(<RealmGate copy={gateCopy({ allowed: false, reason: "no_minutes" })!} heroName="Lily" />);
    expect(screen.getByRole("heading", { name: "The Realm is resting for now." })).toBeInTheDocument();
    expect(screen.getByText("Side quests earn play time, and you get free minutes every day.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Quest Log/ })).toHaveAttribute("href", "/quests");
  });
});
