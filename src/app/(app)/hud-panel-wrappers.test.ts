import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A `.foo > *` rule restyles EVERY direct child of `.foo`. The HUD layout classes use that
 * shape to stretch the one panel a wrapper holds, so they only make sense on a wrapper.
 *
 * Put one on a `<GameFrame>` instead and it lands on the frame's own parts: the header turns
 * into a flex column (icon, title and action each on their own line) and grows to `flex: 1`,
 * which is how the Tavern's "Assigned Quests" panel came to show a stacked title above a tall
 * empty gap, with the quest list squeezed past the frame's bottom edge.
 *
 * jsdom never loads globals.css, so the cascade is asserted against the stylesheet's text and
 * the markup against the source — "which element carries this class" is a structural property
 * that reading the source can answer honestly, and these are async server components that
 * jsdom cannot render anyway.
 */

const SRC = join(process.cwd(), "src");
const GLOBALS_CSS = readFileSync(join(SRC, "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Classes whose `.class > *` rule re-lays-out every direct child. */
function wrapperOnlyClasses(): string[] {
  const found = new Set<string>();
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = rule.exec(GLOBALS_CSS); m; m = rule.exec(GLOBALS_CSS)) {
    const declarations = m[2];
    if (!/(^|;)\s*(display|flex|flex-direction)\s*:/.test(declarations)) continue;
    for (const selector of m[1].split(",")) {
      const direct = /^\s*\.([a-z0-9-]+)\s*>\s*\*\s*$/.exec(selector);
      if (direct) found.add(direct[1]);
    }
  }
  return [...found];
}

/** The attribute text of every `<Name ...>` opening tag — brace- and quote-aware, so an
 *  attribute holding nested JSX (`icon={<GameIcon />}`) does not cut the tag short. */
function openingTagAttrs(source: string, name: string): string[] {
  const tags: string[] = [];
  const re = new RegExp(`<${name}\\b`, "g");
  for (let m = re.exec(source); m; m = re.exec(source)) {
    const start = m.index + m[0].length;
    let depth = 0;
    let quote = "";
    let i = start;
    for (; i < source.length; i++) {
      const c = source[i];
      if (quote) {
        if (c === quote) quote = "";
      } else if (c === '"' || c === "'" || c === "`") {
        quote = c;
      } else if (c === "{") {
        depth++;
      } else if (c === "}") {
        depth--;
      } else if (c === ">" && depth === 0) {
        break;
      }
    }
    tags.push(source.slice(start, i));
  }
  return tags;
}

/** The tag's own `className=`, ignoring any nested in an attribute like `icon={<GameIcon />}`. */
function ownClassNameAt(attrs: string): number {
  let depth = 0;
  let quote = "";
  for (let i = 0; i < attrs.length; i++) {
    const c = attrs[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
    } else if (c === "{") {
      depth++;
    } else if (c === "}") {
      depth--;
    } else if (depth === 0 && attrs.startsWith("className=", i)) {
      return i;
    }
  }
  return -1;
}

/** Every class name a tag's own `className` attribute can put on the element. */
function classNamesOf(attrs: string): string[] {
  const at = ownClassNameAt(attrs);
  if (at < 0) return [];
  const value = attrs.slice(at + "className=".length);
  if (value.startsWith('"')) return value.slice(1, value.indexOf('"', 1)).split(/\s+/);
  if (!value.startsWith("{")) return [];
  let depth = 0;
  let end = 0;
  for (; end < value.length; end++) {
    if (value[end] === "{") depth++;
    else if (value[end] === "}" && --depth === 0) break;
  }
  return [...value.slice(0, end).matchAll(/["'`]([^"'`]*)["'`]/g)].flatMap((m) => m[1].split(/\s+/));
}

function tsxUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return tsxUnder(full);
    return name.endsWith(".tsx") && !name.endsWith(".test.tsx") ? [full] : [];
  });
}

const wrapperOnly = wrapperOnlyClasses();
const frameUsages = tsxUnder(SRC).flatMap((path) =>
  openingTagAttrs(readFileSync(path, "utf8"), "GameFrame").map((attrs) => ({
    path: path.slice(SRC.length + 1),
    classes: classNamesOf(attrs),
  })),
);

describe("HUD wrapper-only classes stay off GameFrame", () => {
  it("finds the `.class > *` layout rules, so the rule below is not vacuous", () => {
    expect(wrapperOnly).toEqual(expect.arrayContaining(["hud-panel-left", "hud-panel-right", "hud-panel-center"]));
  });

  it("finds the GameFrame usages, so the rule below is not vacuous", () => {
    expect(frameUsages.filter((u) => u.classes.length > 0).length).toBeGreaterThanOrEqual(5);
  });

  it("puts no wrapper-only class on a GameFrame", () => {
    const misplaced = frameUsages
      .flatMap((u) => u.classes.filter((c) => wrapperOnly.includes(c)).map((c) => `${u.path}: ${c}`))
      .sort();
    expect(misplaced, `these belong on a wrapper around the frame: ${misplaced.join(", ")}`).toEqual([]);
  });
});
