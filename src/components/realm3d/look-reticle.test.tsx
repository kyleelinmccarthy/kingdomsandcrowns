import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LookReticle, type LockDoc } from "./look-reticle";

afterEach(cleanup);

function fakeDoc() {
  const fns = new Set<() => void>();
  const doc: LockDoc & { lock(el: unknown): void } = {
    pointerLockElement: null,
    addEventListener: (_type, fn) => void fns.add(fn),
    removeEventListener: (_type, fn) => void fns.delete(fn),
    lock(el) {
      doc.pointerLockElement = el;
      for (const fn of fns) fn();
    },
  };
  return doc;
}

describe("the look reticle", () => {
  it("shows while the mouse is captured, and goes the moment it is let go", () => {
    const doc = fakeDoc();
    render(<LookReticle paused={false} doc={doc} />);
    expect(screen.queryByTestId("look-reticle")).toBeNull();
    act(() => doc.lock({}));
    expect(screen.getByTestId("look-reticle")).toBeInTheDocument();
    act(() => doc.lock(null));
    expect(screen.queryByTestId("look-reticle")).toBeNull();
  });

  it("hides under a panel, even while the mouse is still captured", () => {
    const doc = fakeDoc();
    doc.pointerLockElement = {};
    render(<LookReticle paused doc={doc} />);
    expect(screen.queryByTestId("look-reticle")).toBeNull();
  });
});
