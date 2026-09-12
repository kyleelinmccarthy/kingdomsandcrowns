"use client";

import { useEffect, useRef, useState } from "react";
import { GameIcon } from "@/components/game-icon";
import { getSchoolDays, getScheduleBlocks } from "@/lib/actions/student-schedule";
import { getSubjects } from "@/lib/actions/subjects";
import type { DayOfWeek } from "@/lib/utils/schedule-days";
import { findBoundaryCrossings, type ScheduleBlockLite, type ScheduleCrossing } from "@/lib/utils/schedule-notifications";

const POLL_MS = 30_000;
const AUTO_DISMISS_MS = 8_000;

type Toast = { id: string; text: string };

function todayKey() {
  return new Date().toDateString();
}

function seenKey() {
  return `schedule-notified-${todayKey()}`;
}

function loadSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(seenKey());
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>) {
  try {
    sessionStorage.setItem(seenKey(), JSON.stringify([...seen]));
  } catch {
    /* sessionStorage unavailable — notifications just may repeat this session */
  }
}

function crossingKey(crossing: ScheduleCrossing): string {
  return `${crossing.block.id}:${crossing.kind}`;
}

function messageFor(crossing: ScheduleCrossing, subjectName: string): string {
  return crossing.kind === "start"
    ? `${subjectName} is starting now!`
    : `${subjectName} just ended.`;
}

export function ScheduleNotificationPopup({ childId }: { childId: string }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const blocksRef = useRef<(ScheduleBlockLite & { subjectName: string })[]>([]);
  const schoolDaysRef = useRef<DayOfWeek[]>([]);
  const lastCheckedRef = useRef<Date>(new Date());
  const seenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    seenRef.current = loadSeen();

    async function loadSchedule() {
      const [schoolDays, blocks, subjects] = await Promise.all([
        getSchoolDays(childId),
        getScheduleBlocks(childId),
        getSubjects(childId),
      ]);
      if (cancelled) return;
      schoolDaysRef.current = schoolDays;
      blocksRef.current = blocks.map((b) => ({
        ...b,
        subjectName: subjects.find((s) => s.id === b.subjectId)?.name ?? "Class",
      }));
    }

    loadSchedule();
    lastCheckedRef.current = new Date();

    const interval = setInterval(() => {
      const now = new Date();
      const crossings = findBoundaryCrossings(
        blocksRef.current,
        schoolDaysRef.current,
        lastCheckedRef.current,
        now
      );
      lastCheckedRef.current = now;

      const fresh = crossings.filter((c) => !seenRef.current.has(crossingKey(c)));
      if (fresh.length === 0) return;

      fresh.forEach((c) => seenRef.current.add(crossingKey(c)));
      saveSeen(seenRef.current);

      setToasts((prev) => [
        ...prev,
        ...fresh.map((c) => {
          const subject = blocksRef.current.find((b) => b.id === c.block.id);
          return {
            id: crossingKey(c),
            text: messageFor(c, subject?.subjectName ?? "Class"),
          };
        }),
      ]);
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [childId]);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, AUTO_DISMISS_MS)
    );
    return () => timers.forEach(clearTimeout);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="schedule-notification-popup fixed right-4 top-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="flex items-center gap-2 rounded-xl border-2 border-[var(--gold-border)] bg-[linear-gradient(180deg,rgba(17,26,46,0.97)_0%,rgba(10,16,30,1)_100%)] px-4 py-3 shadow-[0_0_40px_-10px_rgba(201,168,76,0.2),0_8px_30px_rgba(0,0,0,0.5)] animate-in fade-in slide-in-from-right-4"
        >
          <GameIcon name="bell" className="size-4 shrink-0 text-[var(--gold-bright)]" />
          <span className="text-sm text-foreground">{toast.text}</span>
          <button
            type="button"
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== toast.id))}
            className="ml-2 text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
