import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CrownsPanel } from "./crowns-panel";
import type { SeasonWithCeremony } from "@/lib/utils/seasons";

afterEach(cleanup);

const done = (id: string, ordinal: number, seen: string | null): SeasonWithCeremony => ({
  id, grade: String(ordinal), ordinal, startDate: `${2020 + ordinal}-08-15`, endDate: `${2021 + ordinal}-06-01`, crownId: ordinal === 1 ? "crown-copper" : "crown-iron",
  completedAt: `${2021 + ordinal}-06-01T00:00:00.000Z`, ceremonySeenAt: seen,
});

describe("CrownsPanel", () => {
  it("says whether each crown's ceremony has been held", () => {
    render(<CrownsPanel history={[done("s1", 1, "2022-06-02T00:00:00.000Z"), done("s2", 2, null)]} />);
    expect(screen.getByText("Ceremony held")).toBeInTheDocument();
    expect(screen.getByText("Ceremony awaits")).toBeInTheDocument();
  });
});
