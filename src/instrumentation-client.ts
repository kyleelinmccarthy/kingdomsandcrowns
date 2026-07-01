// Dev-only guard against a Next.js/React RSC performance-tracking crash.
//
// In development, React's "Server Components ⚛" performance track replays
// server-sent component render timings onto the browser's performance timeline.
// It does this by adding (serverTimeOrigin - performance.timeOrigin) to each
// server timestamp (see react-server-dom-turbopack's flushComponentPerformance).
// Under WSL2 the Linux dev-server clock lags the Windows host/browser clock by
// a few milliseconds, so the earliest components map to a *negative* timestamp.
// React clamps the measure's `start` but not its `end`, so performance.measure()
// throws:
//   Failed to execute 'measure' on 'Performance':
//   '…HomePage' cannot have a negative time stamp.
// which pops the Next.js dev error overlay on every navigation.
//
// This installs the earliest available client hook to clamp negative timings
// (and swallow any residual throw) so the profiling track degrades gracefully
// instead of crashing. It is stripped in production builds — the offending React
// code only exists in development, and the guard is NODE_ENV-gated regardless.
if (
  process.env.NODE_ENV !== "production" &&
  typeof performance !== "undefined" &&
  typeof performance.measure === "function"
) {
  const original = performance.measure.bind(performance);

  performance.measure = function measure(
    measureName: string,
    startOrMeasureOptions?: string | PerformanceMeasureOptions,
    endMark?: string,
  ): PerformanceMeasure {
    // Only the options-object form carries numeric timestamps that can go
    // negative; the string-mark form references named marks and is left alone.
    if (startOrMeasureOptions && typeof startOrMeasureOptions === "object") {
      const opts = startOrMeasureOptions;
      if (typeof opts.start === "number" && opts.start < 0) opts.start = 0;
      if (typeof opts.end === "number" && opts.end < 0) opts.end = 0;
      if (
        typeof opts.start === "number" &&
        typeof opts.end === "number" &&
        opts.end < opts.start
      ) {
        opts.end = opts.start;
      }
    }

    try {
      return original(measureName, startOrMeasureOptions, endMark);
    } catch {
      // A residual bad measure must not crash the dev overlay.
      return undefined as unknown as PerformanceMeasure;
    }
  };
}
