"use client";

/**
 * RECESS, for the frame: when a run starts and ends, what the child is told, what is heard, and
 * what is written down. The scene runs the Ring (`recess-scene.tsx`); this owns everything around
 * it, and hands the composition root a handful of values and callbacks.
 *
 *   - **Two doors** (spec D12.3). The grown-up's scheduled recess — the play clock's
 *     `source === "recess"` — starts a run the moment the world opens or the block begins, and
 *     ends it when the block does ("Recess is over. Your gleams are kept."). And any time the Realm
 *     is open, E at the arch opens the Ring's board, where a child can run it once.
 *   - **Boards, not chips** (D12.11): the start board for 3 s, the finish board for 4 s; a run strip
 *     while a run is going (the pips, the next post, the time at full depth); nothing recess-shaped
 *     otherwise. A lap's board says the server's answer to "was that a best": shown at once from
 *     the same merge, and corrected if the server disagrees.
 *   - **Written down** (§3.8) by `lib/realm3d/recess/writer.ts`: laps at once, gleams in tens, and
 *     everything waiting when the tab hides, the page goes or the Realm closes.
 *   - **Only the hero writes.** A grown-up's visit never runs the Ring: their arch shows the child's
 *     record and nothing else, and nothing is written.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { recordRecessResult } from "@/lib/actions/realm-recess";
import type { InteractTarget } from "@/lib/realm3d/hud-bus";
import type { RideBus } from "@/lib/realm3d/riding";
import { makeRecessBus, type RecessBus, type RecessCue } from "@/lib/realm3d/recess/bus";
import { COURSE_ID, minLapMs, ringCourse } from "@/lib/realm3d/recess/course";
import type { RecessEvent, RunKind } from "@/lib/realm3d/recess/sim";
import { makeRecessWriter, type RecessWriter } from "@/lib/realm3d/recess/writer";
import { archPrompt, COURSE_CHANGED, gleamLine, lapLine, LAMP_LIT, LAST_LAMP_LIT, OFF_COURSE, RECESS_OVER, RING, startLine, VOIDED, type RecessDepth } from "@/lib/realm/recess/copy";
import { emptyRecessRecord, lampsLitFor, mergeRecess, validateRecessResult, type RecessRecord } from "@/lib/realm/recess/record";
import { LAMP_COUNT } from "@/lib/realm3d/recess/lamps";
import { speak } from "@/lib/utils/speech";

/** How long the start board stays up, and the finish (and every ending) board. */
export const START_BOARD_MS = 3000;
export const FINISH_BOARD_MS = 4000;
/** A gleam's line, and the off-course nudge. */
export const POP_MS = 1200;
export const NUDGE_MS = 2600;

export type RunView = {
  kind: RunKind;
  /** Through the arch: the lap clock is running. */
  started: boolean;
  nextPost: number;
  /** Gleams this run. */
  collected: number;
  laps: number;
};

export type RecessBoardView = { id: number; variant: "start" | "finish" | "end"; title: string; text: string };
export type RecessPopView = { id: number; text: string; ms: number };

export type RecessApi = {
  bus: RecessBus;
  record: RecessRecord | null;
  running: RunView | null;
  board: RecessBoardView | null;
  pop: RecessPopView | null;
  error: string;
  retry: () => void;
  clearError: () => void;
  /** The E prompt, re-worded at the arch: a grown-up sees the child's laps; a child mid-run sees none (it is the finish line). */
  prompt: (near: InteractTarget | null) => InteractTarget | null;
  /** A child asked to run the Ring from its board. */
  runRing: () => void;
  /** Whether E at the arch opens the Ring's board now. */
  archOpens: () => boolean;
};

const browserTimers = {
  set: (fn: () => void, ms: number) => window.setTimeout(fn, ms),
  clear: (id: unknown) => window.clearTimeout(id as number),
};

export function useRecess(o: {
  childId: string | null;
  /** The hero on their own Realm: only they run the Ring, and only theirs is written down. */
  writer: boolean;
  viewer: "child" | "parent";
  heroName: string;
  /** Why the gate is open, as the play clock last heard: `recess` is the grown-up's scheduled break. */
  source: string | null;
  depth: RecessDepth;
  lowStimulus: boolean;
  readAloud: boolean;
  /** `bundle.recess`: the stored record, or null when it failed to load. */
  initial: RecessRecord | null | undefined;
  seed: number;
  ride: RideBus | null;
}): RecessApi {
  const { writer, childId, depth, readAloud, ride } = o;
  const [bus] = useState(() => makeRecessBus({ seed: o.seed, runs: writer, lowStimulus: o.lowStimulus, showTime: depth === "full" }));
  const [record, setRecord] = useState<RecessRecord | null>(o.initial ?? null);
  const recordRef = useRef(record);
  const [running, setRunning] = useState<RunView | null>(null);
  const runningRef = useRef<RunView | null>(null);
  const [board, setBoard] = useState<RecessBoardView | null>(null);
  const [pop, setPop] = useState<RecessPopView | null>(null);
  const [error, setError] = useState("");
  const seq = useRef(0);
  const depthRef = useRef(depth);
  const readRef = useRef(readAloud);
  /** The course moved since the bests were set: said once, before the first run's board. */
  const courseMoved = useRef(!!o.initial && o.initial.courseId !== COURSE_ID && o.initial.laps > 0);

  const keepRecord = useCallback((r: RecessRecord) => {
    recordRef.current = r;
    setRecord(r);
  }, []);
  const keepRunning = useCallback((r: RunView | null) => {
    runningRef.current = r;
    setRunning(r);
  }, []);

  const [write] = useState<RecessWriter | null>(() => {
    if (!writer || !childId) return null;
    const w: RecessWriter = makeRecessWriter({
      save: (r) => recordRecessResult(childId, r),
      course: { id: COURSE_ID, minLapMs: minLapMs(ringCourse()) },
      timers: browserTimers,
      // The server's record, plus any gleams still waiting to be sent: the jar and the road's
      // lamps never go dark for a moment while a batch is in flight. `recordRef` follows the state
      // in the effect below.
      onRecord: (r) => {
        const unsent = w.pending().gleams;
        setRecord(unsent > 0 ? { ...r, totalGleams: r.totalGleams + unsent } : r);
      },
      onError: setError,
    });
    return w;
  });
  useEffect(() => {
    recordRef.current = record;
  }, [record]);

  useEffect(() => {
    depthRef.current = depth;
    readRef.current = readAloud;
    bus.setShowTime(depth === "full");
  }, [bus, depth, readAloud]);
  useEffect(() => {
    bus.setBests(record?.bestLapMs ?? null, record?.bestMountedLapMs ?? null);
    // The road's lamps (D12.2), from the stored record: they are lit again on every visit.
    bus.setGleamsTotal(record?.totalGleams ?? 0);
  }, [bus, record]);

  /* ---- boards, lines, sounds ---------------------------------------------------------- */
  const cue = useCallback((c: RecessCue) => bus.sound.onCue(c), [bus]);
  const say = useCallback((speech: string) => {
    if (readRef.current) speak(speech);
  }, []);
  const showBoard = useCallback((b: Omit<RecessBoardView, "id">): number => {
    const id = ++seq.current;
    setBoard({ ...b, id });
    return id;
  }, []);
  const showPop = useCallback((text: string, ms: number) => {
    setPop({ id: ++seq.current, text, ms });
  }, []);
  useEffect(() => {
    if (!board) return;
    const id = window.setTimeout(() => setBoard((b) => (b?.id === board.id ? null : b)), board.variant === "start" ? START_BOARD_MS : FINISH_BOARD_MS);
    return () => window.clearTimeout(id);
  }, [board]);
  useEffect(() => {
    if (!pop) return;
    const id = window.setTimeout(() => setPop((p) => (p?.id === pop.id ? null : p)), pop.ms);
    return () => window.clearTimeout(id);
  }, [pop]);

  const mounted = useCallback(() => !!ride && ride.phase !== "off", [ride]);

  /* ---- starting and ending ------------------------------------------------------------ */
  const start = useCallback(
    (kind: RunKind) => {
      if (!bus.runs) return;
      const was = runningRef.current;
      bus.ask(kind);
      if (was) {
        // A child's own run becomes recess when recess arrives; nothing else changes.
        if (kind === "recess") keepRunning({ ...was, kind });
        return;
      }
      keepRunning({ kind, started: false, nextPost: 0, collected: 0, laps: 0 });
      if (courseMoved.current) {
        courseMoved.current = false;
        showPop(COURSE_CHANGED.text, FINISH_BOARD_MS);
      }
      const line = startLine({ kind, depth: depthRef.current, record: recordRef.current, mounted: mounted() });
      showBoard({ variant: "start", title: line.title, text: line.text });
      cue(kind === "recess" ? "bell" : "post");
      say(line.speech);
    },
    [bus, keepRunning, showBoard, showPop, cue, say, mounted],
  );

  const recessOver = useCallback(() => {
    bus.ask("stop");
    const had = runningRef.current !== null;
    keepRunning(null);
    if (had) {
      showBoard({ variant: "end", title: "Recess", text: RECESS_OVER.text });
      cue("over");
      say(RECESS_OVER.speech);
    }
    void write?.flush();
  }, [bus, keepRunning, showBoard, cue, say, write]);

  // The grown-up's schedule: recess starts a run and ends it. Deferred a tick, so the frame's own
  // first paint is not held up by the board it opens with.
  const wasRecess = useRef(false);
  useEffect(() => {
    if (!writer) return;
    const now = o.source === "recess";
    const was = wasRecess.current;
    wasRecess.current = now;
    if (now === was) return;
    queueMicrotask(() => (now ? start("recess") : recessOver()));
  }, [writer, o.source, start, recessOver]);

  /* ---- what the scene tells us -------------------------------------------------------- */
  const onLap = useCallback(
    (lapMs: number, isMounted: boolean) => {
      const d = depthRef.current;
      const run = runningRef.current;
      const next: RunView | null = run && bus.run.active ? { ...run, started: true, nextPost: 0, laps: run.laps + 1 } : null;
      // A lap the server would refuse (a clock that jumped) is said so, never shown as a time.
      const refused = validateRecessResult({ gleams: 0, lapMs, mounted: isMounted, courseId: COURSE_ID }, { id: COURSE_ID, minLapMs: minLapMs(ringCourse()) });
      if (refused) {
        showBoard({ variant: "end", title: RING, text: refused });
        cue("void");
        say(refused);
        keepRunning(next);
        return;
      }
      const before = recordRef.current ?? emptyRecessRecord(COURSE_ID);
      // At once, from the same merge the server makes; corrected below if the server disagrees.
      const local = mergeRecess(before, { gleams: 0, lapMs, mounted: isMounted, courseId: COURSE_ID }, new Date());
      keepRecord(local.record);
      const line = lapLine(local, lapMs, isMounted, d);
      const id = showBoard({ variant: "finish", title: line.title, text: line.text });
      cue(local.best ? "best" : "lap");
      say(line.speech);
      keepRunning(next);
      void write?.addLap(lapMs, isMounted).then((out) => {
        if (!out || (out.best === local.best && out.first === local.first)) return;
        const fixed = lapLine(out, lapMs, isMounted, depthRef.current);
        setBoard((b) => (b?.id === id ? { ...b, title: fixed.title, text: fixed.text } : b));
      });
    },
    [bus, keepRecord, keepRunning, showBoard, cue, say, write],
  );

  useEffect(() => {
    bus.setHandler((e: RecessEvent) => {
      // The event is the scene's pooled object: read it now, never later.
      const n = e.n;
      const run = runningRef.current;
      switch (e.kind) {
        case "started":
          if (run) keepRunning({ ...run, started: true, nextPost: 0 });
          break;
        case "gleam": {
          write?.addGleams(1);
          if (run) keepRunning({ ...run, collected: n });
          // Counted at once toward the jar and the lamps. Only onto a record that loaded: a failed
          // read is never turned into a claimed count.
          const had = recordRef.current;
          const before = had?.totalGleams ?? 0;
          if (had) keepRecord({ ...had, totalGleams: before + 1 });
          const lamp = had !== null && lampsLitFor(before + 1, LAMP_COUNT) > lampsLitFor(before, LAMP_COUNT);
          const line = lamp ? (lampsLitFor(before + 1, LAMP_COUNT) >= LAMP_COUNT ? LAST_LAMP_LIT : LAMP_LIT) : gleamLine(n, depthRef.current);
          showPop(line.text, lamp ? NUDGE_MS : POP_MS);
          cue("gleam");
          say(line.speech);
          break;
        }
        case "post":
          if (run) keepRunning({ ...run, nextPost: n + 1 });
          cue("post");
          break;
        case "offCourse":
          showPop(OFF_COURSE.text, NUDGE_MS);
          cue("nudge");
          say(OFF_COURSE.speech);
          break;
        case "lap":
          onLap(e.lapMs, e.mounted);
          break;
        case "voided":
          keepRunning(bus.run.active && run ? { ...run, started: false, nextPost: 0 } : null);
          showBoard({ variant: "end", title: "The Ring", text: VOIDED.text });
          cue("void");
          say(VOIDED.speech);
          break;
      }
    });
    return () => bus.setHandler(() => {});
  }, [bus, keepRunning, keepRecord, showPop, showBoard, cue, say, onLap, write]);

  /* ---- writing it down --------------------------------------------------------------- */
  useEffect(() => {
    if (!write) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") void write.flush();
    };
    const onGone = () => void write.flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onGone);
    window.addEventListener("online", onGone);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onGone);
      window.removeEventListener("online", onGone);
      // Every way out of the Realm unmounts this: what is waiting goes now. The writer is not
      // disposed: a write that fails on the way out keeps retrying rather than dropping a lap.
      void write.flush();
    };
  }, [write]);

  /* ---- the arch ---------------------------------------------------------------------- */
  const prompt = useCallback(
    (near: InteractTarget | null): InteractTarget | null => {
      if (!near || near.kind !== "arch") return near;
      if (o.viewer === "parent") return { ...near, ...archPrompt({ viewer: "parent", heroName: o.heroName }) };
      return runningRef.current ? null : near;
    },
    [o.viewer, o.heroName],
  );
  // Read from state, not the ref: the prompt must re-render when a run starts or ends.
  const promptNow = useCallback((near: InteractTarget | null) => (running && near?.kind === "arch" && o.viewer !== "parent" ? null : prompt(near)), [running, prompt, o.viewer]);
  const archOpens = useCallback(() => o.viewer === "parent" || runningRef.current === null, [o.viewer]);
  const runRing = useCallback(() => start("arch"), [start]);
  const retry = useCallback(() => {
    setError("");
    void write?.flush();
  }, [write]);
  const clearError = useCallback(() => setError(""), []);

  return { bus, record, running, board, pop, error, retry, clearError, prompt: promptNow, runRing, archOpens };
}
