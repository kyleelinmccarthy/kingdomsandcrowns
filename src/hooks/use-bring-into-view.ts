"use client";

import { useEffect, type RefObject } from "react";

/**
 * Brings `ref`'s element into its scrolling panel's view, the least distance (`block: "nearest"`),
 * whenever `line` changes to a line to show: a board's feedback after a cast, so on a short phone a
 * miss line and its Show me are never left below the fold (smoke I12). Nothing for no line.
 */
export function useBringIntoView(ref: RefObject<HTMLElement | null>, line: string | null | undefined) {
  useEffect(() => {
    if (line) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [ref, line]);
}
