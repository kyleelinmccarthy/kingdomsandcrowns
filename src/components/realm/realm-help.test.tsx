import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
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
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="full" onSetDepth={null} onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    expect(dialog).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("offers everything on the simple view and simplicity on the full one, naming no axis", async () => {
    const onSetDepth = vi.fn();
    const { rerender } = render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={onSetDepth} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Show me everything" })).toBeInTheDocument();
    expect(screen.getByText("More numbers, more to do. You can change it back.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
    });
    expect(onSetDepth).toHaveBeenCalledWith("full");
    rerender(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="full" onSetDepth={onSetDepth} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Keep it simple" })).toBeInTheDocument();
    expect(screen.getByText("Fewer numbers, one thing at a time.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Keep it simple" }));
    });
    expect(onSetDepth).toHaveBeenLastCalledWith("simple");
    // "Depth", "simple mode" and "advanced" are never words a child reads.
    expect(document.body.textContent).not.toMatch(/depth|simple mode|advanced/i);
  });

  it("shows no view control when the card is not allowed to offer one", () => {
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={null} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Show me everything" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Keep it simple" })).not.toBeInTheDocument();
    expect(screen.queryByText("More numbers, more to do. You can change it back.")).not.toBeInTheDocument();
  });

  it("says so when the write does not land, and keeps offering the same swap", async () => {
    const onSetDepth = vi.fn(() => Promise.reject(new Error("offline")));
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={onSetDepth} onClose={vi.fn()} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Show me everything" }));
    });
    expect(screen.getByRole("alert")).toHaveTextContent("That didn't save. Try again.");
    expect(screen.getByRole("button", { name: "Show me everything" })).toBeEnabled();
  });

  it("keeps Tab inside the card, cycling its own two controls", () => {
    render(<RealmHelp touch={false} ceremony={false} readAloud={false} depth="simple" onSetDepth={vi.fn()} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog", { name: "How to play" });
    const close = screen.getByRole("button", { name: "Close" });
    const control = screen.getByRole("button", { name: "Show me everything" });
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab" });
    expect(control).toHaveFocus();
    fireEvent.keyDown(control, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(control).toHaveFocus();
  });
});
