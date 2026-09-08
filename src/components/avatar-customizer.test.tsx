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
