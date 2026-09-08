import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AvatarCustomizer } from "./avatar-customizer";
import { DEFAULT_AVATAR } from "@/lib/utils/avatar-catalog";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/actions/avatar", () => ({ updateAvatarConfig: vi.fn().mockResolvedValue(undefined) }));

afterEach(cleanup);

describe("AvatarCustomizer mount tab", () => {
  it("lists mounts, gates locked ones by level, and allows none", () => {
    render(<AvatarCustomizer childId="c1" childName="Lily" currentConfig={DEFAULT_AVATAR} level={1} earnedBadgeIds={[]} questUnlockedItems={[]} open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Mount" }));
    expect(screen.getByRole("button", { name: /Pony/ })).toBeEnabled();
    const goat = screen.getByRole("button", { name: /Goat/ });
    expect(goat).toBeDisabled();
    expect(goat.textContent).toContain("Reach Level 3");
    expect(screen.getByRole("button", { name: "None" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Pony/ }));
    expect(screen.getByText("Coat")).toBeInTheDocument();
  });
});

describe("AvatarCustomizer crown tab", () => {
  const copper = { id: "crown-copper", label: "Copper Circlet", color: "#b87333", seasonLabel: "2024–25" };
  it("explains when no crown has been earned", () => {
    render(<AvatarCustomizer childId="c1" childName="Lily" currentConfig={DEFAULT_AVATAR} level={1} earnedBadgeIds={[]} questUnlockedItems={[]} crowns={[]} open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Crown" }));
    expect(screen.getByText("Finish a season to earn your first crown.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "None" })).not.toBeInTheDocument();
  });
  it("lists earned crowns only, with None, and selects one", () => {
    render(<AvatarCustomizer childId="c1" childName="Lily" currentConfig={DEFAULT_AVATAR} level={1} earnedBadgeIds={[]} questUnlockedItems={[]} crowns={[copper]} open={true} onClose={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Crown" }));
    const chip = screen.getByRole("button", { name: /Copper Circlet/ });
    expect(chip.textContent).toContain("2024–25");
    expect(screen.queryByRole("button", { name: /Iron Crown/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "None" })).toBeInTheDocument();
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-pressed")).toBe("true");
  });
});
