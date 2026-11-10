/**
 * Typed numeric answers. Turns text such as "3/4", "0.75", ".75" or "1 1/2" into an
 * exact rational so equivalent forms compare equal. Pure, no I/O.
 *
 * Accepted (after trimming surrounding whitespace, at most 50 characters): an optional
 * leading "-", then one of
 *   - an integer, with optional thousands commas in valid groups of three ("1,000")
 *   - a decimal ("0.75", ".75", "1,000.5"; a bare trailing point such as "5." is rejected)
 *   - a fraction "a/b" (b nonzero)
 *   - a mixed number "w a/b": a single space, a proper fraction (a < b)
 * No "+" sign, no expressions, no exponents.
 *
 * The tsconfig target is ES2017, so bigint literals (1n) are unavailable; this file
 * builds its constants with BigInt().
 */

export type Rational = { n: bigint; d: bigint };

const MAX_LENGTH = 50;

const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const FIVE = BigInt(5);
const TEN = BigInt(10);
const DECIMAL_PLACES = 4;

const INT = "(\\d+|\\d{1,3}(?:,\\d{3})+)"; // plain digits, or comma-grouped thousands
const PLAIN_INT_RE = new RegExp(`^(-)?${INT}$`);
const DECIMAL_RE = new RegExp(`^(-)?${INT}?\\.(\\d+)$`);
const FRACTION_RE = /^(-)?(\d+)\/(\d+)$/;
const MIXED_RE = /^(-)?(\d+) (\d+)\/(\d+)$/;

function abs(x: bigint): bigint {
  return x < ZERO ? -x : x;
}

function gcd(a: bigint, b: bigint): bigint {
  let x = abs(a);
  let y = abs(b);
  while (y !== ZERO) {
    [x, y] = [y, x % y];
  }
  return x;
}

function make(n: bigint, d: bigint): Rational | null {
  if (d === ZERO) return null;
  if (d < ZERO) {
    n = -n;
    d = -d;
  }
  if (n === ZERO) return { n: ZERO, d: ONE };
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function signed(negative: string | undefined, magnitude: bigint): bigint {
  return negative ? -magnitude : magnitude;
}

function digits(s: string): bigint {
  return BigInt(s.replace(/,/g, ""));
}

export function parseAnswer(text: string): Rational | null {
  const s = text.trim();
  if (s.length === 0 || s.length > MAX_LENGTH) return null;

  let m = PLAIN_INT_RE.exec(s);
  if (m) return make(signed(m[1], digits(m[2])), ONE);

  m = DECIMAL_RE.exec(s);
  if (m) {
    const whole = m[2] ? digits(m[2]) : ZERO;
    const frac = m[3];
    const scale = TEN ** BigInt(frac.length);
    return make(signed(m[1], whole * scale + BigInt(frac)), scale);
  }

  m = FRACTION_RE.exec(s);
  if (m) return make(signed(m[1], BigInt(m[2])), BigInt(m[3]));

  m = MIXED_RE.exec(s);
  if (m) {
    const whole = BigInt(m[2]);
    const num = BigInt(m[3]);
    const den = BigInt(m[4]);
    if (den === ZERO || num >= den) return null;
    return make(signed(m[1], whole * den + num), den);
  }

  return null;
}

/** True when |a - b| <= tolerance (inclusive). Tolerance defaults to exact equality. */
export function sameValue(a: Rational, b: Rational, tolerance?: Rational): boolean {
  const diff = abs(a.n * b.d - b.n * a.d);
  const scale = a.d * b.d;
  if (!tolerance) return diff === ZERO;
  return diff * tolerance.d <= abs(tolerance.n) * scale;
}

function decimalString(r: Rational): string {
  const negative = r.n < ZERO;
  const n = abs(r.n);
  const d = r.d;

  // Exact when the reduced denominator has only the factors 2 and 5.
  let rest = d;
  let twos = 0;
  let fives = 0;
  while (rest % TWO === ZERO) {
    rest /= TWO;
    twos++;
  }
  while (rest % FIVE === ZERO) {
    rest /= FIVE;
    fives++;
  }
  const places = rest === ONE ? Math.max(twos, fives) : DECIMAL_PLACES;
  const scale = TEN ** BigInt(places);

  // Round half up on the magnitude (a no-op when the expansion is exact).
  const scaled = (n * scale * TWO + d) / (d * TWO);
  const intPart = scaled / scale;
  const fracDigits = (scaled % scale).toString().padStart(places, "0").replace(/0+$/, "");

  const body = fracDigits ? `${intPart}.${fracDigits}` : `${intPart}`;
  return negative && scaled !== ZERO ? `-${body}` : body;
}

export function formatRational(input: Rational, as: "fraction" | "mixed" | "decimal"): string {
  // Hand-built values may be unreduced; the formats below assume lowest terms.
  const r = make(input.n, input.d);
  if (!r) throw new RangeError("formatRational: zero denominator");
  if (as === "decimal") return decimalString(r);

  const sign = r.n < ZERO ? "-" : "";
  const n = abs(r.n);
  if (as === "fraction") return r.d === ONE ? `${sign}${n}` : `${sign}${n}/${r.d}`;

  const whole = n / r.d;
  const rem = n % r.d;
  if (rem === ZERO) return `${sign}${whole}`;
  if (whole === ZERO) return `${sign}${rem}/${r.d}`;
  return `${sign}${whole} ${rem}/${r.d}`;
}
