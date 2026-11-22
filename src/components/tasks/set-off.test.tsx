import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetOff } from "./set-off";

afterEach(cleanup);

const LINE = "Two things in the village need a rune: the broken wagon and the dark lantern. Walk to each one and cast it there.";

describe("SetOff: the one Set off card, for trails and runes (RI-a / S13)", () => {
  it("shows its line, and Set off takes the focus", () => {
    render(<SetOff line={LINE} onWalk={() => {}} />);
    expect(screen.getByText(LINE)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set off" })).toHaveFocus();
  });

  it("a click hands the run to the walk once", () => {
    const onWalk = vi.fn();
    render(<SetOff line={LINE} onWalk={onWalk} />);
    fireEvent.click(screen.getByRole("button", { name: "Set off" }));
    expect(onWalk).toHaveBeenCalledTimes(1);
  });

  it("Enter and Space never reach the Realm behind the board; Esc does", () => {
    const heard = vi.fn();
    window.addEventListener("keydown", heard);
    try {
      render(<SetOff line={LINE} onWalk={() => {}} />);
      const go = screen.getByRole("button", { name: "Set off" });
      fireEvent.keyDown(go, { key: "Enter" });
      fireEvent.keyDown(go, { key: " " });
      expect(heard).not.toHaveBeenCalled();
      fireEvent.keyDown(go, { key: "Escape" });
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("keydown", heard);
    }
  });
});
