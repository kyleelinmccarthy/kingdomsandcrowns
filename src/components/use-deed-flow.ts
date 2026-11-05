"use client";

/**
 * The server calls around one run's questions, wired to `flowReducer`: answer, retry,
 * show me, and the skill meter they last reported. Both the Realm board and the page's player use it,
 * so a second chance behaves the same.
 */
import { useReducer, useRef, useState } from "react";
import { answerDeedQuestion, resolveDeedQuestion, retryDeedQuestion } from "@/lib/actions/deeds";
import type { AttemptResult, RunStart } from "@/lib/utils/deed-run-types";
import { flowReducer, initialFlow, type FlowEvent } from "@/lib/utils/deed-run-flow";
import type { SkillMeter } from "@/lib/utils/mastery";

const FAILED = "The enchantment failed.";

export function useDeedFlow(run: RunStart, onAttempt?: (result: AttemptResult) => void) {
  const [flow, dispatch] = useReducer(flowReducer, run, initialFlow);
  // The flow as of the last event, kept in step synchronously: a key pressed after a call returns
  // but before React re-renders still reads the phase that call left, never a stale closure's.
  const current = useRef(flow);
  function send(event: FlowEvent) {
    current.current = flowReducer(current.current, event);
    dispatch(event);
  }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [meter, setMeter] = useState<SkillMeter | null>(null);
  const inFlight = useRef(false);

  /** One server call at a time; a failure is said plainly and changes nothing. */
  async function guarded(work: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (err) {
      setError(err instanceof Error ? err.message : FAILED);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  /** The first try goes to `answerDeedQuestion`, a second try only ever to `retryDeedQuestion`. */
  function choose(choice: string) {
    const { phase, index, ruledOut } = current.current;
    if (phase === "resolved" || ruledOut.includes(choice)) return Promise.resolve();
    const call = phase === "second-chance" ? retryDeedQuestion : answerDeedQuestion;
    return guarded(async () => {
      const result = await call(run.runId, index, choice);
      send({ type: "answered", choice, result });
      // A first answer always says where its skill stands: no meter means a skill already at the
      // top (or a challenge), so the last skill's pips go. A retry brings none and leaves them up.
      if (phase === "asking") setMeter(result.meter ?? null);
      onAttempt?.(result);
    });
  }

  function showMe() {
    const { phase, index } = current.current;
    if (phase !== "second-chance") return Promise.resolve();
    return guarded(async () => send({ type: "gave-up", result: await resolveDeedQuestion(run.runId, index) }));
  }

  return { flow, meter, busy, error, setError, guarded, choose, showMe, next: () => send({ type: "next" }) };
}
