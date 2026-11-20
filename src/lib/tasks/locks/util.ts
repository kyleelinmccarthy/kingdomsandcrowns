/**
 * Small seeded helpers the lock generators share (`k4.ts`, `g58.ts`, `g912.ts`). Pure: the `Rng`
 * only, never `Math.random`.
 */
import { shuffle, type Rng } from "@/lib/utils/drill-generators";

/** A mastery level as a rung 0-4: rounded down and clamped; anything not a number is 0. */
export const clampLevel = (level: number): number => (Number.isFinite(level) ? Math.min(4, Math.max(0, Math.floor(level))) : 0);

/** One of `xs`, at random. */
export const pick = <T>(rng: Rng, xs: readonly T[]): T => xs[Math.floor(rng() * xs.length)];

/** `n` distinct picks from `xs`, in a random order. */
export const sample = <T>(rng: Rng, xs: readonly T[], n: number): T[] => shuffle([...xs], rng).slice(0, n);

/** Roll one of `options`, each with its weight. */
export function weighted<T>(rng: Rng, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((a, [, w]) => a + w, 0);
  let roll = rng() * total;
  for (const [value, w] of options) if ((roll -= w) < 0) return value;
  return options[options.length - 1][0];
}

/** 0, 1, …, n − 1. */
export const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
