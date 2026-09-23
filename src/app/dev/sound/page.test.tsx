import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ALL_SOUNDS } from "@/lib/realm3d/sound/recipes";

const notFound = vi.fn(() => {
  // The real `notFound()` throws to abort the render; a mock that returned would let the page
  // carry on, and this test would pass on a broken gate.
  throw new Error("NEXT_HTTP_ERROR_FALLBACK;404");
});
vi.mock("next/navigation", () => ({ notFound: () => notFound() }));

import DevSoundPage from "./page";
import { BOARD_SOUNDS } from "./sound-board";

beforeEach(() => {
  notFound.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  cleanup();
});

describe("/dev/sound", () => {
  it("is not reachable in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => DevSoundPage()).toThrow(/404/);
    expect(notFound).toHaveBeenCalled();
  });

  it("puts every sound in the game on a button", () => {
    expect([...BOARD_SOUNDS].sort()).toEqual([...ALL_SOUNDS].sort());
    render(<DevSoundPage />);
    for (const id of ALL_SOUNDS) expect(document.querySelector(`[data-sound="${id}"]`)).not.toBeNull();
    expect(screen.getByRole("button", { name: /Phrase 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "village" })).toBeInTheDocument();
  });
});
