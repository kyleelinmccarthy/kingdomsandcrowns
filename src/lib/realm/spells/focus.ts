export const DAZZLE_MS = 1500;
export type FocusState = { dazzledUntil: number };

export function startFocus(): FocusState {
  return { dazzledUntil: 0 };
}

/** Losing focus is the only thing a trouble can do to the hero: a short dazzle, nothing lost. */
export function stepFocus(state: FocusState, focusLost: boolean, now: number): FocusState {
  return focusLost ? { dazzledUntil: now + DAZZLE_MS } : state;
}

export function isDazzled(state: FocusState, now: number): boolean {
  return now < state.dazzledUntil;
}
