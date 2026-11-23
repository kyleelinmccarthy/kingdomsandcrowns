// Marketing screenshots are captured from the app in demo mode by
// scripts/capture-screens.mjs at a 1280×800 viewport (16:10).
//
// They live in a versioned folder: the version is part of the path so
// re-captures get a fresh URL and never serve a stale, cached optimized image.
// Bump SCREENS_REV (here and in the capture script) when re-running the capture.
export const SCREENS_REV = "r3";

const SHOT_W = 1280;
const SHOT_H = 800;

export type Screenshot = { src: string; alt: string; width: number; height: number };

/** A captured screenshot by its file name (without extension) in the current screens folder. */
export function screenshot(name: string, alt: string, width = SHOT_W, height = SHOT_H): Screenshot {
  return { src: `/marketing/screens/${SCREENS_REV}/${name}.jpg`, alt, width, height };
}
