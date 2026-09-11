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
    render(<VillagerPlate villager={bram({ status: "objective" })} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    const plate = screen.getByRole("button", { name: "Old Bram. Village Well, 2 of 5 side quests done. Waiting for you." });
    const badge = plate.querySelector(".realm-plate-badge");
    expect(badge).toHaveTextContent("!");
    expect(badge).toHaveClass("realm-plate-badge--quest");
    expect(badge).toHaveAttribute("aria-hidden", "true");
  });

  it("gives a working villager no badge", () => {
    render(<VillagerPlate villager={bram()} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    const plate = screen.getByRole("button", { name: "Old Bram. Village Well, 2 of 5 side quests done." });
    expect(plate.querySelector(".realm-plate-badge")).toBeNull();
  });

  it("marks a built site with a dim check", () => {
    render(<VillagerPlate villager={bram({ status: "built", done: 5 })} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    const plate = screen.getByRole("button", { name: "Old Bram. Village Well, built." });
    const badge = plate.querySelector(".realm-plate-badge");
    expect(badge).toHaveTextContent("✓");
    expect(badge).toHaveClass("realm-plate-badge--done");
    expect(badge).toHaveAttribute("aria-hidden", "true");
  });

  it("swaps numerals for pips without changing the accessible count", () => {
    render(<VillagerPlate villager={bram()} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    expect(screen.getByText("Village Well · 2 of 5")).toBeInTheDocument();
    expect(document.querySelector(".realm-pips")).toBeNull();
    cleanup();
    render(<VillagerPlate villager={bram()} surfaces={simple} calm={false} motion={true} onPick={() => {}} />);
    expect(screen.getByText("Village Well")).toBeInTheDocument();
    const pips = screen.getByRole("img", { name: "2 of 5 side quests done." });
    expect(pips).toHaveClass("realm-pips");
    expect(pips.querySelectorAll(".realm-pip").length).toBe(5);
    expect(pips.querySelectorAll(".realm-pip--on").length).toBe(2);
  });

  it("reads Built at both depths", () => {
    const built = bram({ status: "built", done: 5 });
    render(<VillagerPlate villager={built} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    expect(screen.getByText("Village Well · Built")).toBeInTheDocument();
    cleanup();
    render(<VillagerPlate villager={built} surfaces={simple} calm={false} motion={true} onPick={() => {}} />);
    expect(screen.getByText("Village Well · Built")).toBeInTheDocument();
    expect(document.querySelector(".realm-pips")).toBeNull();
  });

  it("substitutes an outline for the bob when motion is off", () => {
    const objective = bram({ status: "objective" });
    render(<VillagerPlate villager={objective} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    expect(document.querySelector(".realm-plate-badge")).toHaveClass("realm-plate-badge--bob");
    expect(document.querySelector(".realm-plate")).not.toHaveClass("realm-plate--outline");
    cleanup();
    render(<VillagerPlate villager={objective} surfaces={full} calm={false} motion={false} onPick={() => {}} />);
    expect(document.querySelector(".realm-plate-badge")).not.toHaveClass("realm-plate-badge--bob");
    expect(document.querySelector(".realm-plate")).toHaveClass("realm-plate--outline");
  });

  it("mutes the plate under a calm palette without dropping the badge", () => {
    render(<VillagerPlate villager={bram({ status: "objective" })} surfaces={full} calm={true} motion={true} onPick={() => {}} />);
    expect(document.querySelector(".realm-plate")).toHaveClass("realm-plate--calm");
    expect(document.querySelector(".realm-plate-badge--quest")).toBeInTheDocument();
  });

  it("is a real button in the tab order and picks its villager", () => {
    const onPick = vi.fn();
    render(<VillagerPlate villager={bram()} surfaces={full} calm={false} motion={true} onPick={onPick} />);
    const plate = screen.getByRole("button", { name: /^Old Bram\./ });
    expect(plate.tagName).toBe("BUTTON");
    expect(plate).toHaveAttribute("type", "button");
    expect(plate).not.toHaveAttribute("tabindex");
    expect(plate).not.toBeDisabled();
    fireEvent.click(plate);
    expect(onPick).toHaveBeenCalledWith("bram");
  });

  it("claims no progress when the kingdom's numbers never loaded", () => {
    render(<VillagerPlate villager={bram({ done: 0, total: 0 })} surfaces={full} calm={false} motion={true} onPick={() => {}} />);
    expect(screen.getByRole("button", { name: "Old Bram. Village Well." })).toBeInTheDocument();
    expect(screen.getByText("Village Well")).toBeInTheDocument();
    expect(document.querySelector(".realm-pips")).toBeNull();
  });
});
