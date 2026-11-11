"use client";

/**
 * Stands in for the bench until its surface lands (C10 replaces it). No skill is benched yet, so no
 * run presents a measure task; if one ever reached a player, it would read as a note, not a crash.
 */
import type { PresenterProps } from "./presenters";

export function MeasurePresenterPlaceholder({ variant }: PresenterProps<"measure">) {
  return <p className={variant === "board" ? "r3-nudge-hint" : "text-sm text-muted-foreground"}>Coming soon</p>;
}
