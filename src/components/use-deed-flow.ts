"use client";

/**
 * The server calls around one run's questions, wired to `flowReducer`: answer, retry,
 * show me. Both the Realm board and the page's player use it, so a second chance behaves the same.
 */
import { useReducer, useRef, useState } from "react";
import { answerDeedQuestion, resolveDeedQuestion, retryDeedQuestion, type AttemptResult, type RunStart } from "@/lib/actions/deeds";
import { flowReducer, initialFlow } from "@/lib/utils/deed-run-flow";

const FAILED = "The enchantment failed.";

export function useDeedFlow(run: RunStart, onAttempt?: (result: AttemptResult) => void) {
  const [flow, dispatch] = useReducer(flowReducer, run, initialFlow);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
    if (flow.phase === "resolved" || flow.ruledOut.includes(choice)) return Promise.resolve();
    const call = flow.phase === "second-chance" ? retryDeedQuestion : answerDeedQuestion;
    return guarded(async () => {
      const result = await call(run.runId, flow.index, choice);
      dispatch({ type: "answered", choice, result });
      onAttempt?.(result);
    });
  }

  function showMe() {
    if (flow.phase !== "second-chance") return Promise.resolve();
    return guarded(async () => dispatch({ type: "gave-up", result: await resolveDeedQuestion(run.runId, flow.index) }));
  }

  return { flow, busy, error, setError, guarded, choose, showMe, next: () => dispatch({ type: "next" }) };
}
