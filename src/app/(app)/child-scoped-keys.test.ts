import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Next's App Router keeps client-component state across a navigation to the same route with
 * different search params. So on a page that switches heroes by `?child=`, a client component
 * that seeds useState from a child-specific prop keeps the PREVIOUS hero's values after a
 * switch — and a Save then writes them onto the hero now selected. That is how a sibling's
 * name was overwritten and how a stale grade would have promoted a hero and awarded a crown.
 *
 * The rule this enforces: on any page that resolves an active child, an element handed that
 * child's id is child-scoped, so it must also be keyed to it and remount on a switch.
 *
 * This reads source rather than rendering, because these are async server components that
 * jsdom cannot render. "Is this JSX element keyed" is a structural property of the source,
 * so the check is honest about what it can see.
 */

const APP = join(process.cwd(), "src/app/(app)");

function pagesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return pagesUnder(full);
    return name === "page.tsx" ? [full] : [];
  });
}

/** Every JSX opening tag, with its full attribute text, even when it spans lines. */
function openingTags(source: string): { name: string; attrs: string }[] {
  const tags: { name: string; attrs: string }[] = [];
  const re = /<([A-Z][A-Za-z0-9]*)\b([^<>]*?)\/?>/g; // [^<>] already spans newlines
  for (let m = re.exec(source); m; m = re.exec(source)) tags.push({ name: m[1], attrs: m[2] });
  return tags;
}

const childPages = pagesUnder(APP).filter((p) => readFileSync(p, "utf8").includes("resolveActiveChild"));

describe("child-switching pages remount their child-scoped components", () => {
  it("finds the pages that switch heroes, so the rule below is not vacuous", () => {
    expect(childPages.length).toBeGreaterThanOrEqual(8);
  });

  it.each(childPages.map((p) => [p.slice(APP.length + 1), p]))(
    "%s keys every element it hands the active child's id",
    (_label, path) => {
      const unkeyed = openingTags(readFileSync(path, "utf8"))
        .filter((t) => /\bchildId=\{activeChild\.id\}/.test(t.attrs))
        .filter((t) => !/\bkey=\{activeChild\.id\}/.test(t.attrs))
        .map((t) => `<${t.name}>`);
      expect(unkeyed, `unkeyed child-scoped elements: ${unkeyed.join(", ")}`).toEqual([]);
    }
  );
});
