import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { VillagerPlate } from "./villager-plate";
import { surfacesFor } from "@/lib/realm/depth";
import { DEFAULT_LEARNING_PROFILE } from "@/lib/utils/learning-profile";
import type { VillagerPlacement } from "@/lib/realm/layout";

afterEach(cleanup);

const full = surfacesFor("full", DEFAULT_LEARNING_PROFILE);
const simple = surfacesFor("simple", DEFAULT_LEARNING_PROFILE);

/** Old Bram at the Village Well, two side quests in. */
function bram(over: Partial<VillagerPlacement> = {}): VillagerPlacement {
  return { id: "bram", buildingId: "well", position: { x: -5, z: 9.5 }, status: "work", label: "Village Well", done: 2, total: 5, ...over };
}

describe("VillagerPlate", () => {
  it("names the objective villager with a gold, aria-hidden ! badge", () => {
    render(<VillagerPlate villager={bram({ status: "objective" })} surfaces={full} detail="full" calm={false} motion={true} inReach={true} onPick={() => {}} />);
    const plate = screen.getByRole("button", { name: "Old Bram. Village Well, 2 of 5 side quests done. Waiting for you." });
    const badge = plate.querySelector(".realm-plate-badge");
    expect(badge).toHaveTextContent("!");
    expect(badge).toHaveClass("realm-plate-badge--quest");
    expect(badge).toHaveAttribute("aria-hidden", "true");
  });

  it("gives a working villager no badge", () => {
    render(<VillagerPlate villager={bram()} surfaces={full} detail="full" calm={false} motion={true} inReach={true} onPick={() => {}} />);
    const plate = screen.getByRole("button", { name: "Old Bram. Village Well, 2 of 5 side quests done." });
    expect(plate.querySelector(".realm-plate-badge")).toBeNull();
  });

  it("marks a built site with a dim check", () => {
    render(<VillagerPlate villager={bram({ status: "built", done: 5 })} surfaces={full} detail="full" calm={false} motion={true} inReach={true} onPick={() => {}} />);
    const plate = screen.getByRole("button", { name: "Old Bram. Village Well, built." });
    const badge = plate.querySelector(".realm-plate-badge");
    expect(badge).toHaveTextContent("✓");
    expect(badge).toHaveClass("realm-plate-badge--done");
    expect(badge).toHaveAttribute("aria-hidden", "true");
  });

  it("swaps numerals for pips without changing the accessible count", () => {
    render(<VillagerPlate villager={bram()} surfaces={full} detail="full" calm={false} motion={true} inReach={true} onPick={() => {}} />);
    expect(screen.getByText("Village Well · 2 of 5")).toBeInTheDocument();
    expect(document.querySelector(".realm-pips")).toBeNull();
    cleanup();
    render(<VillagerPlate villager={bram()} surfaces={simple} detail="full" calm={false} motion={true} inReach={true} onPick={() => {}} />);
    expect(screen.getByText("Village Well")).toBeInTheDocument();
    const pips = screen.getByRole("img", { name: "2 of 5 side quests done." });
    expect(pips).toHaveClass("realm-pips");
    expect(pips.querySelectorAll(".realm-pip").length).toBe(5);
    expect(pips.querySelectorAll(".realm-pip--on").length).toBe(2);
  });

  it("reads Built at both depths", () => {
    const built = bram({ status: "built", done: 5 });
    render(<VillagerPlate villager={built} surfaces={full} detail="full" calm={false} motion={true} inReach={true} onPick={() => {}} />);
    expect(screen.getByText("Village Well · Built")).toBeInTheDocument();
    cleanup();
    render(<VillagerPlate villager={built} surfaces={simple} detail="full" calm={false} motion={true} inReach={true} onPick={() => {}} />);
    expect(screen.getByText("Village Well · Built")).toBeInTheDocument();
    expect(document.querySelector(".realm-pips")).toBeNull();
  });

  it("substitutes an outline for the bob when motion is off", () => {
    const objective = bram({ status: "objective" });
    render(<VillagerPlate villager={objective} surfaces={full} detail="full" calm={false} motion={true} inReach={true} onPick={() => {}} />);
    expect(document.querySelector(".realm-plate-badge")).toHaveClass("realm-plate-badge--bob");
    expect(document.querySelector(".realm-plate")).not.toHaveClass("realm-plate--outline");
    cleanup();
    render(<VillagerPlate villager={objective} surfaces={full} detail="full" calm={false} motion={false} inReach={true} onPick={() => {}} />);
    expect(document.querySelector(".realm-plate-badge")).not.toHaveClass("realm-plate-badge--bob");
    expect(document.querySelector(".realm-plate")).toHaveClass("realm-plate--outline");
  });

  it("mutes the plate under a calm palette without dropping the badge", () => {
    render(<VillagerPlate villager={bram({ status: "objective" })} surfaces={full} detail="full" calm={true} motion={true} inReach={true} onPick={() => {}} />);
    expect(document.querySelector(".realm-plate")).toHaveClass("realm-plate--calm");
    expect(document.querySelector(".realm-plate-badge--quest")).toBeInTheDocument();
  });

  it("is a real button in the tab order and picks its villager", () => {
    const onPick = vi.fn();
    render(<VillagerPlate villager={bram()} surfaces={full} detail="full" calm={false} motion={true} inReach={true} onPick={onPick} />);
    const plate = screen.getByRole("button", { name: /^Old Bram\./ });
    expect(plate.tagName).toBe("BUTTON");
    expect(plate).toHaveAttribute("type", "button");
    expect(plate).not.toHaveAttribute("tabindex");
    expect(plate).not.toBeDisabled();
    fireEvent.click(plate);
    expect(onPick).toHaveBeenCalledWith("bram");
  });

  it("stops offering a talk it cannot give once the hero is out of reach, but stays in the tab order", () => {
    const onPick = vi.fn();
    const { rerender } = render(<VillagerPlate villager={bram()} surfaces={full} detail="full" calm={false} motion={true} inReach={true} onPick={onPick} />);
    const plate = screen.getByRole("button", { name: "Old Bram. Village Well, 2 of 5 side quests done." });
    expect(plate).not.toHaveAttribute("aria-disabled");
    rerender(<VillagerPlate villager={bram()} surfaces={full} detail="full" calm={false} motion={true} inReach={false} onPick={onPick} />);
    // Still a landmark a child can Tab to, and still named: who keeps which site is the one
    // thing the plate exists to say, and a child who cannot see the world hears it nowhere else.
    expect(plate).not.toHaveAttribute("tabindex");
    expect(plate).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Old Bram. Village Well, 2 of 5 side quests done." })).toBe(plate);
    // But no longer announced as something to do, and pressing it is an honest nothing rather
    // than a silent one — the flag that says "unavailable" is the flag that holds the handler.
    expect(plate).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(plate);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("claims no progress when the kingdom's numbers never loaded", () => {
    render(<VillagerPlate villager={bram({ done: 0, total: 0 })} surfaces={full} detail="full" calm={false} motion={true} inReach={true} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: "Old Bram. Village Well." })).toBeInTheDocument();
    expect(screen.getByText("Village Well")).toBeInTheDocument();
    expect(document.querySelector(".realm-pips")).toBeNull();
  });

  // ── Tiers ────────────────────────────────────────────────────────────────────────────
  // Collapsing is done with `data-detail` and CSS, never by dropping content: jsdom has no
  // stylesheet, so these tests assert the contract the stylesheet keys off (the attribute,
  // and every string still being in the DOM under it) rather than what is painted.
  it("carries the tier as an attribute the stylesheet can key off", () => {
    for (const detail of ["pin", "name", "full"] as const) {
      render(<VillagerPlate villager={bram()} surfaces={full} detail={detail} calm={false} motion={true} inReach={false} onPick={() => {}} />);
      expect(document.querySelector(".realm-plate")).toHaveAttribute("data-detail", detail);
      cleanup();
    }
  });

  it("keeps the name, the site and the count in the DOM at every tier", () => {
    // The point of collapsing with CSS: a hover, a Tab or a walk brings the whole plate back
    // without React, and a screen reader never lost it in the first place.
    for (const detail of ["pin", "name", "full"] as const) {
      render(<VillagerPlate villager={bram()} surfaces={full} detail={detail} calm={false} motion={true} inReach={false} onPick={() => {}} />);
      const plate = screen.getByRole("button", { name: "Old Bram. Village Well, 2 of 5 side quests done." });
      expect(plate.querySelector(".realm-plate-who")).toHaveTextContent("Old Bram");
      expect(plate.querySelector(".realm-plate-tag")).toHaveTextContent("Village Well · 2 of 5");
      cleanup();
    }
  });

  it("gives a villager with no marker a dot to stand under when collapsed", () => {
    // `markerFor` is null for a plain working villager, so a collapsed plate would otherwise be
    // an empty box and the village would be anonymous again — the bug the plate was built for.
    render(<VillagerPlate villager={bram()} surfaces={full} detail="pin" calm={false} motion={true} inReach={false} onPick={() => {}} />);
    const plate = screen.getByRole("button", { name: /^Old Bram\./ });
    expect(plate.querySelector(".realm-plate-dot")).toHaveAttribute("aria-hidden", "true");
    expect(plate.querySelector(".realm-plate-badge")).toBeNull();
  });

  it("gives a marked villager their marker and no second dot", () => {
    for (const status of ["objective", "built"] as const) {
      render(<VillagerPlate villager={bram({ status })} surfaces={full} detail="pin" calm={false} motion={true} inReach={false} onPick={() => {}} />);
      const plate = screen.getByRole("button", { name: /^Old Bram\./ });
      expect(plate.querySelector(".realm-plate-badge")).toBeInTheDocument();
      expect(plate.querySelector(".realm-plate-dot")).toBeNull();
      cleanup();
    }
  });

  it("hands its node to the frame loop that refines the tier", () => {
    const seen: (HTMLButtonElement | null)[] = [];
    const { unmount } = render(<VillagerPlate villager={bram()} surfaces={full} detail="pin" calm={false} motion={true} inReach={false} onPick={() => {}} plateRef={(el) => seen.push(el)} />);
    expect(seen[0]).toBe(screen.getByRole("button", { name: /^Old Bram\./ }));
    unmount();
    // And gives it back, so realm-scene's map cannot grow a node that left the world.
    expect(seen.at(-1)).toBeNull();
  });
});
