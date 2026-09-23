"use client";

/**
 * What the room says back. Using a room's one thing — ringing the bell, reading the great book,
 * sitting on the throne — gets a line in the top lane, where the village's other news goes, and
 * it goes away by itself. No panel, no pause: a child indoors is still playing.
 */

import { useEffect } from "react";

/** How long a room's line stays up. Long enough to read twice at eight. */
export const ROOM_LINE_MS = 5600;

export function RoomLine({ line, onDone }: { line: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!line) return;
    const id = window.setTimeout(onDone, ROOM_LINE_MS);
    return () => window.clearTimeout(id);
  }, [line, onDone]);
  if (!line) return null;
  return (
    <div className="r3-toast r3-room-line" role="status">
      <span className="r3-toast-text">
        <span className="r3-toast-line">{line}</span>
      </span>
    </div>
  );
}
