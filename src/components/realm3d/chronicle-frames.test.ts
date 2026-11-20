import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Chronicle Hall's pictures dim with the day like the walls they hang on: at night they must not
 * glow as lit panes. The scene imports `three`, which nothing under Vitest may load, so this holds
 * the line on its source (as `camera-rules.test.ts` does).
 */
const source = readFileSync(join(process.cwd(), "src/components/realm3d/chronicle-frames.tsx"), "utf8");

describe("the Chronicle Hall's pictures", () => {
  it("are lit like the walls, never unlit or outside tone mapping", () => {
    expect(source).toMatch(/new THREE\.MeshStandardMaterial\(\{[^}]*\bmap: texture\b[^}]*\broughness: 0\.9\b/);
    expect(source).not.toMatch(/MeshBasicMaterial/);
    expect(source).not.toMatch(/toneMapped:\s*false/);
  });

  it("still disposes every texture, material and geometry it makes", () => {
    expect(source).toMatch(/for \(const t of built\.textures\) t\.dispose\(\)/);
    expect(source).toMatch(/for \(const m of built\.materials\) m\.dispose\(\)/);
    expect(source).toMatch(/built\.wood\.dispose\(\)/);
    expect(source).toMatch(/built\.plane\.dispose\(\)/);
    expect(source).toMatch(/woodMaterial\.dispose\(\)/);
  });
});
