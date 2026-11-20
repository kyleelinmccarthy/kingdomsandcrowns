/**
 * The small fixed vocabulary the youngest locks draw from (F2), named once so the generators, the
 * test solver and the lock's face (F4) agree on it. A subset of `LOCK_SHAPES` / `LOCK_COLORS`:
 * five shapes, four colours, two sizes. Pure; the words are the child's own ("Red", "Circles").
 */
import type { LockShape } from "../lock-rules";

export const SHAPE_VOCAB = ["circle", "square", "triangle", "star", "heart"] as const satisfies readonly LockShape["shape"][];
export const COLOR_VOCAB = ["red", "blue", "yellow", "green"] as const satisfies readonly LockShape["color"][];
export const SIZE_VOCAB = ["big", "small"] as const;

export type ShapeId = (typeof SHAPE_VOCAB)[number];
export type ColorId = (typeof COLOR_VOCAB)[number];
export type SizeId = (typeof SIZE_VOCAB)[number];
/** What a shape sort can be sorted by. */
export type Attr = "color" | "shape" | "size";

export const ATTRS: readonly Attr[] = ["color", "shape", "size"];
export const VALUES: Record<Attr, readonly string[]> = { color: COLOR_VOCAB, shape: SHAPE_VOCAB, size: SIZE_VOCAB };
/** How an attribute is named in a prompt. */
export const ATTR_WORD: Record<Attr, string> = { color: "colour", shape: "shape", size: "size" };

const SHAPE_LABEL: Record<ShapeId, string> = { circle: "Circles", square: "Squares", triangle: "Triangles", star: "Stars", heart: "Hearts" };
const COLOR_LABEL: Record<ColorId, string> = { red: "Red", blue: "Blue", yellow: "Yellow", green: "Green" };
const SIZE_LABEL: Record<SizeId, string> = { big: "Big", small: "Small" };

/** The bin label for one value of an attribute: "Red", "Circles", "Big". */
export function valueLabel(attr: Attr, value: string): string {
  const table: Record<string, string> = attr === "color" ? COLOR_LABEL : attr === "shape" ? SHAPE_LABEL : SIZE_LABEL;
  return table[value];
}

/** The value of one attribute a shape has, or undefined (a shape with no size). */
export function attrOf(s: LockShape, attr: Attr): string | undefined {
  return attr === "color" ? s.color : attr === "shape" ? s.shape : s.size;
}

/** A shape from its attributes; `size` is left off when the puzzle doesn't sort by it. */
export function makeShape(shape: ShapeId, color: ColorId, size?: SizeId): LockShape {
  return size === undefined ? { shape, color } : { shape, color, size };
}

/** A compact code for ids: shape index, colour index, then `b` or `s` for a size. "01" is the first shape in the second colour. */
export function tokenCode(s: LockShape): string {
  const size = s.size === undefined ? "" : s.size === "big" ? "b" : "s";
  return `${SHAPE_VOCAB.indexOf(s.shape as ShapeId)}${COLOR_VOCAB.indexOf(s.color as ColorId)}${size}`;
}

/** "red circle", "big blue star": for an explanation read aloud. */
export function tokenName(s: LockShape): string {
  return [s.size, s.color, s.shape].filter(Boolean).join(" ");
}

/** Two shapes with one key are the same shape. */
export const tokenKey = (s: LockShape): string => `${s.shape}/${s.color}/${s.size ?? ""}`;
