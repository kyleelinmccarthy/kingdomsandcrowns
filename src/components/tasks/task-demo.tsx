"use client";

/**
 * Demo-first, for every hands-on kind (R-C9, R-F10): the players' side of it. The server marks the
 * task a young hero meets a worked example before (`RunStart.demo`, from `demoAt`); `useTaskDemo`
 * shows it once, when the run reaches that task, and `TaskDemo` draws the one that task has
 * (`demoKeyOf`): Aldo at the bench, or Pip at a lock.
 */
import { useState } from "react";
import type { RunStart } from "@/lib/utils/deed-run-types";
import { demoKeyOf, isLockDemo, type DemoKey } from "@/lib/tasks/demos";
import { BenchDemo, demoCopy } from "./bench-demo";
import { LockDemo, lockDemoCopy } from "./lock-demo";

/** The demo's words, for read-aloud. */
export const taskDemoCopy = (key: DemoKey): string => (isLockDemo(key) ? lockDemoCopy(key) : demoCopy(key));

export function TaskDemo({ demo, onDone, calm, variant = "board" }: { demo: DemoKey; onDone(): void; calm: boolean; variant?: "board" | "page" }) {
  return isLockDemo(demo)
    ? <LockDemo mode={demo} calm={calm} variant={variant} onDone={onDone} />
    : <BenchDemo mode={demo} calm={calm} variant={variant} onDone={onDone} />;
}

/**
 * Whether a demo shows now, at task `index`, and which: the marked task's, once the run reaches it
 * (`run.demo.at`), never before. It shows once: after `finish` it is gone for the rest of the run,
 * through next questions and second chances.
 */
export function useTaskDemo(run: Pick<RunStart, "demo" | "questions">, index: number): { demo: DemoKey | null; finish(): void } {
  const [done, setDone] = useState(false);
  const at = run.demo?.at;
  const demo = !done && at !== undefined && index === at ? demoKeyOf(run.questions[at]) : null;
  return { demo, finish: () => setDone(true) };
}
