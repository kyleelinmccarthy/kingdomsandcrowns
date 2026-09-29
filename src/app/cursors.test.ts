import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The site's cursors: a gilded arrow everywhere, a gold gauntlet over anything that can be pressed.
 * jsdom never loads a stylesheet, so this reads the stylesheets' text, as `hud-panel-wrappers.test.ts` does.
 */
const SRC = join(process.cwd(), "src");
const PUBLIC = join(process.cwd(), "public");
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

function cssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return cssFiles(p);
    return p.endsWith(".css") ? [p] : [];
  });
}

describe("the site's cursors", () => {
  const globals = strip(readFileSync(join(SRC, "app/globals.css"), "utf8"));

  it("draws every themed cursor from a file that exists, with a hotspot and a keyword to fall back on", () => {
    const uses = [...globals.matchAll(/url\(["']?(\/cursors\/[^"')]+)["']?\)\s*(\d+)\s+(\d+)\s*,\s*([a-z-]+)/g)];
    expect(uses.map((u) => u[1]).sort()).toEqual(["/cursors/arrow.svg", "/cursors/gauntlet.svg"]);
    for (const [, path, , , fallback] of uses) {
      expect(existsSync(join(PUBLIC, path)), path).toBe(true);
      expect(["auto", "default", "pointer"]).toContain(fallback);
    }
  });

  it("gives the gauntlet to links, enabled buttons and Tailwind's cursor-pointer, and the caret to text fields", () => {
    expect(globals).toMatch(/a\[href\][^{]*\{\s*cursor:\s*var\(--cursor-hand\)/);
    expect(globals).toMatch(/button:not\(:disabled\)[^{]*\{\s*cursor:\s*var\(--cursor-hand\)/);
    expect(globals).toMatch(/\.cursor-pointer\s*\{\s*cursor:\s*var\(--cursor-hand\)/);
    expect(globals).toMatch(/textarea[^{]*\{\s*cursor:\s*text/);
  });

  it("gives the caret only to fields that take typed text, and the gauntlet to the colour and file pickers", () => {
    const caret = globals.match(/input:not\([^{]*\{\s*cursor:\s*text/)![0];
    for (const type of ["checkbox", "radio", "range", "button", "submit", "date", "time", "color", "file"]) {
      expect(caret, type).toContain(`:not([type="${type}"])`);
    }
    const hand = globals.match(/a\[href\][^{]*\{[^}]*\}/)![0];
    expect(hand).toContain('input[type="color"]:not(:disabled)');
    expect(hand).toContain('input[type="file"]:not(:disabled)');
  });

  it("does not give the gauntlet to a disabled switch, tab, option or menu item", () => {
    const rule = globals.match(/a\[href\][^{]*\{[^}]*\}/)![0];
    for (const role of ["menuitem", "tab", "option", "switch"]) {
      expect(rule, role).toContain(`[role="${role}"]:not([aria-disabled="true"]):not(:disabled)`);
    }
  });

  it("keeps Tailwind's grab cursors, which the reorder handle uses", () => {
    expect(globals).toMatch(/\.cursor-grab,[^{]*button\.cursor-grab\s*\{\s*cursor:\s*grab/);
    expect(globals).toMatch(/\.cursor-grabbing,[^{]*button\.active\\:cursor-grabbing:active\s*\{\s*cursor:\s*grabbing/);
  });

  it("leaves no bare `cursor: pointer` in any stylesheet, so no corner of the site falls back to the system hand", () => {
    for (const file of cssFiles(SRC)) {
      expect(strip(readFileSync(file, "utf8")), file).not.toMatch(/cursor:\s*pointer\s*[;}]/);
    }
  });
});
