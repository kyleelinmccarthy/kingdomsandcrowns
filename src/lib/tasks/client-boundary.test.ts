import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The task registry is server-side: it will hold bench generators (answers and all) that must
 * never reach the browser bundle. A client component may import a codec, the kinds list or types,
 * but never a value from the server-only task modules.
 */
const SRC = join(process.cwd(), "src");
const COMPONENTS = join(SRC, "components");
const SERVER_ONLY = ["registry", "draw", "measure", "bench", "lock", "locks", "trail", "trails"].map((m) => join(SRC, "lib/tasks", m));

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

/** The first statement is the "use client" directive (comments and blank lines may precede it). */
const isUseClient = (src: string) => /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/.test(src);

/** Where an import specifier lands on disk (alias or relative), without an extension. */
function target(spec: string, file: string): string | null {
  if (spec.startsWith("@/")) return join(SRC, spec.slice(2));
  if (spec.startsWith(".")) return resolve(dirname(file), spec);
  return null;
}

const isServerOnly = (path: string) => SERVER_ONLY.some((m) => path === m || path.startsWith(m + "/"));

/** Specifiers a file imports (or re-exports) as values from a server-only task module. */
export function serverOnlyValueImports(src: string, file: string): string[] {
  const re = /^[ \t]*(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']|^[ \t]*import\s*["']([^"']+)["']/gm;
  const hits: string[] = [];
  for (const m of src.matchAll(re)) {
    const spec = m[3] ?? m[4];
    if (m[1]) continue; // `import type …`
    const braces = m[2]?.match(/^\{([\s\S]*)\}$/);
    // `import { type A, type B }` carries nothing at runtime.
    if (braces && braces[1].split(",").map((x) => x.trim()).filter(Boolean).every((x) => x.startsWith("type "))) continue;
    const to = target(spec, file);
    if (to && isServerOnly(to)) hits.push(spec);
  }
  return hits;
}

describe("client boundary", () => {
  const at = join(COMPONENTS, "tasks/x.tsx");

  it("the scan flags value imports of server-only task modules and spares type imports", () => {
    expect(serverOnlyValueImports(`import { TASK_KINDS } from "@/lib/tasks/registry";`, at)).toEqual(["@/lib/tasks/registry"]);
    expect(serverOnlyValueImports(`import { x } from "@/lib/tasks/bench/index";`, at)).toEqual(["@/lib/tasks/bench/index"]);
    expect(serverOnlyValueImports(`import x from "../../lib/tasks/draw";`, at)).toEqual(["../../lib/tasks/draw"]);
    expect(serverOnlyValueImports(`export { y } from "@/lib/tasks/measure";`, at)).toEqual(["@/lib/tasks/measure"]);
    expect(serverOnlyValueImports(`import type { Task } from "@/lib/tasks/registry";`, at)).toEqual([]);
    expect(serverOnlyValueImports(`import { type Task } from "@/lib/tasks/registry";`, at)).toEqual([]);
    expect(serverOnlyValueImports(`import { TASK_CODECS } from "@/lib/tasks/codecs";`, at)).toEqual([]);
    expect(serverOnlyValueImports(`import type { ClientTask } from "@/lib/tasks/types";`, at)).toEqual([]);
    // The lock's definition and generators are server-only; its rules and words are client-safe.
    expect(serverOnlyValueImports(`import { lockKind } from "@/lib/tasks/lock";`, at)).toEqual(["@/lib/tasks/lock"]);
    expect(serverOnlyValueImports(`import { LOCKS } from "@/lib/tasks/locks";`, at)).toEqual(["@/lib/tasks/locks"]);
    expect(serverOnlyValueImports(`import { x } from "@/lib/tasks/locks/k4";`, at)).toEqual(["@/lib/tasks/locks/k4"]);
    expect(serverOnlyValueImports(`import { checkLock } from "@/lib/tasks/lock-rules";`, at)).toEqual([]);
    expect(serverOnlyValueImports(`import { LOCK_MISS_LINE } from "@/lib/tasks/lock-copy";`, at)).toEqual([]);
    expect(serverOnlyValueImports(`import { tokenName } from "@/lib/tasks/lock-shapes";`, at)).toEqual([]);
    expect(serverOnlyValueImports(`import { lockBoard } from "@/lib/tasks/lock-board";`, at)).toEqual([]);
    // The trail's definition and pools are server-only (they hold the answers); its words are client-safe.
    expect(serverOnlyValueImports(`import { trailKind } from "@/lib/tasks/trail";`, at)).toEqual(["@/lib/tasks/trail"]);
    expect(serverOnlyValueImports(`import { trailPoolFor } from "@/lib/tasks/trails";`, at)).toEqual(["@/lib/tasks/trails"]);
    expect(serverOnlyValueImports(`import { x } from "@/lib/tasks/trails/draw";`, at)).toEqual(["@/lib/tasks/trails/draw"]);
    expect(serverOnlyValueImports(`import { TRAIL_RETRY_LEAD } from "@/lib/tasks/trail-copy";`, at)).toEqual([]);
    // A sibling file that merely shares a name is not the server module.
    expect(serverOnlyValueImports(`import { x } from "./registry";`, at)).toEqual([]);
    expect(serverOnlyValueImports(`import { x } from "./registry";`, join(SRC, "lib/tasks/x.ts"))).toEqual(["./registry"]);
  });

  it("no \"use client\" module under src/components imports a value from registry, draw, measure, bench, lock, locks, trail or trails", () => {
    const offenders = walk(COMPONENTS)
      .map((f) => ({ f, src: readFileSync(f, "utf8") }))
      .filter(({ src }) => isUseClient(src))
      .flatMap(({ f, src }) => serverOnlyValueImports(src, f).map((spec) => `${f.slice(COMPONENTS.length + 1)} -> ${spec}`));
    expect(offenders).toEqual([]);
  });

  it("the client half of /dev/content imports no trail pool, drawer or kind (the pools hold every answer)", () => {
    const FORBIDDEN = ["lib/tasks/trails", "lib/tasks/trail", "lib/content/trail-pools", "lib/content/trail-blind-pass"].map((m) => join(SRC, m));
    for (const name of ["sample.ts", "content-review.tsx"]) {
      const file = join(SRC, "app/dev/content", name);
      const src = readFileSync(file, "utf8");
      const specs = [...src.matchAll(/^[ \t]*(?:import|export)\s+(?!type\b)[^;]*?from\s*["']([^"']+)["']/gm)].map((m) => m[1]);
      for (const spec of specs) {
        const to = target(spec, file);
        expect(to !== null && FORBIDDEN.some((m) => to === m || to.startsWith(m + "/")), `${name} imports ${spec}`).toBe(false);
      }
    }
    // The server half is where the pools are read.
    expect(readFileSync(join(SRC, "app/dev/content/sample-trails.ts"), "utf8")).toContain("@/lib/tasks/trails");
  });

  it("really walks the client modules", () => {
    const clients = walk(COMPONENTS).filter((f) => isUseClient(readFileSync(f, "utf8")));
    expect(clients.length).toBeGreaterThan(10);
  });
});
