import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FamilySetup } from "./family-setup";

vi.mock("@/lib/actions/family", () => ({
  createFamily: vi.fn(),
  updateFamily: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

function familyWith(timezone: string) {
  return { id: "f1", familyName: "The Smiths", timezone };
}

describe("FamilySetup timezone picker", () => {
  it("is a picker, not a free-text field", () => {
    // The free-text field is how "Denver" reached the database in the first place.
    render(<FamilySetup family={familyWith("America/Denver")} />);
    expect(screen.getByLabelText(/realm timezone/i).tagName).toBe("SELECT");
  });

  it("preselects the family's stored zone", () => {
    render(<FamilySetup family={familyWith("Pacific/Auckland")} />);
    expect(screen.getByLabelText(/realm timezone/i)).toHaveValue("Pacific/Auckland");
  });

  it("keeps an unrecognized stored zone selected instead of silently rewriting it", () => {
    // Landing on this screen must not change the family's setting. If the
    // option were dropped, the select would fall to its first entry and the
    // next save would store that instead.
    render(<FamilySetup family={familyWith("Denver")} />);
    expect(screen.getByLabelText(/realm timezone/i)).toHaveValue("Denver");
  });

  it("labels an unrecognized zone so a parent can see what is wrong", () => {
    render(<FamilySetup family={familyWith("Denver")} />);
    expect(
      screen.getByRole("group", { name: /not a recognized timezone/i })
    ).toBeInTheDocument();
  });

  it("offers real zones from other regions, not just the Americas", () => {
    render(<FamilySetup family={familyWith("America/Denver")} />);
    expect(screen.getByRole("option", { name: "Asia/Tokyo" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Pacific/Kiritimati" })).toBeInTheDocument();
  });

  it("warns inline when the stored zone is unrecognized, without opening the dropdown", () => {
    // The flagged label lives on an <optgroup>, which a parent only sees after
    // opening the select. Collapsed it just reads "Denver", so the problem is
    // invisible at a glance — which is exactly when it needs to be visible.
    render(<FamilySetup family={familyWith("Denver")} />);
    expect(screen.getByText(/Denver.*isn't a timezone we recognize/i)).toBeInTheDocument();
  });

  it("shows no such warning for a valid zone", () => {
    render(<FamilySetup family={familyWith("America/Denver")} />);
    expect(screen.queryByText(/isn't a timezone we recognize/i)).not.toBeInTheDocument();
  });
});
