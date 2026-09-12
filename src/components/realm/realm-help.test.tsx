import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { RealmHelp, helpGroups } from "./realm-help";

afterEach(cleanup);

describe("helpGroups", () => {
  it("speaks keys to a keyboard hero and taps to a touch hero", () => {
    const keys = helpGroups(false, false);
    expect(keys.map((g) => g.title)).toEqual(["Move", "Where to go", "Talk", "Cast", "Ride and recess"]);
    expect(keys[0].text).toBe("WASD or the arrow keys, or click where you want to go.");
    expect(keys[1].text).toBe("Follow the gold light. Someone is waiting there.");
    expect(keys[2].text).toBe("Walk up to a villager and press Enter, or tap Talk. They'll give you a side quest.");
    expect(keys[3].text).toBe("Pick a spell page (1, 2, 3, 4) or tap it, then click where the spell should go. Space aims at the nearest trouble.");
    expect(keys[4].text).toBe("Press M or tap Ride to get on your mount. At recess, collect gleams and run the lap ring.");
    const touch = helpGroups(true, false);
    expect(touch.map((g) => g.title)).toEqual(["Move", "Where to go", "Talk", "Cast", "Ride and recess"]);
    expect(touch[0].text).toBe("Drag the stick, or tap where you want to go.");
    expect(touch[1].text).toBe("Follow the gold light. Someone is waiting there.");
    expect(touch[2].text).toBe("Walk up to a villager and tap Talk. They'll give you a side quest.");
    expect(touch[3].text).toBe("Tap a spell page, then tap where the spell should go.");
    expect(touch[4].text).toBe("Tap Ride to get on your mount. At recess, collect gleams and run the lap ring.");
    // `.map` first: joining the group objects themselves compares "[object Object]" and asserts nothing.
    expect(touch.map((g) => g.text).join(" ")).not.toMatch(/WASD|Enter|Space|Press M|\(1, 2, 3, 4\)/);
  });

  it("promises nothing that clearing a trouble does not do", () => {
    for (const touch of [false, true]) {
      for (const ceremony of [false, true]) {
        for (const g of helpGroups(touch, ceremony)) expect(g.text).not.toMatch(/protect the sites/);
      }
    }
  });

  it("adds the ceremony line only during a ceremony", () => {
    expect(helpGroups(false, true).at(-1)?.text).toBe("Skip the ceremony with Escape or the Skip button.");
    expect(helpGroups(false, false).some((g) => g.title === "Ceremony")).toBe(false);
  });
});

describe("RealmHelp", () => {
  it("is a dialog named How to play that closes on Close and on Escape", () => {
    const onClose = vi.fn();
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    expect(dialog).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
