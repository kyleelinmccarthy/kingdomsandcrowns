import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { RealmShowcase } from "./realm-showcase";
import { REALM_SHOWCASE } from "./realm-showcase-data";
import { Landing } from "./landing";

afterEach(cleanup);

describe("RealmShowcase", () => {
  it("renders the eyebrow, title and subtitle", () => {
    render(<RealmShowcase />);
    const section = screen.getByRole("region", { name: "A kingdom built by learning" });
    expect(within(section).getByText("The Realm")).toBeInTheDocument();
    expect(within(section).getByText(REALM_SHOWCASE.subtitle)).toBeInTheDocument();
  });

  it("renders the four points", () => {
    render(<RealmShowcase />);
    const titles = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(titles).toEqual([
      "Learning is the game",
      "Schoolwork builds a kingdom",
      "Play time is earned",
      "Parents stay in control",
    ]);
  });

  it("every shot has distinct, non-empty alt text", () => {
    render(<RealmShowcase />);
    const alts = screen.getAllByRole("img").map((img) => img.getAttribute("alt") ?? "");
    expect(alts).toHaveLength(3);
    for (const alt of alts) expect(alt.trim().length).toBeGreaterThan(0);
    expect(new Set(alts).size).toBe(3);
  });

  it("every configured shot exists in public/", () => {
    for (const shot of REALM_SHOWCASE.shots) {
      expect(fs.existsSync(path.join(process.cwd(), "public", shot.src)), shot.src).toBe(true);
    }
  });
});

describe("Landing", () => {
  it("renders the Realm section between How it works and the features", () => {
    const { container } = render(<Landing />);
    const howItWorks = container.querySelector("#how-it-works")!;
    const realm = container.querySelector("#realm")!;
    const features = screen.getByRole("heading", { name: "Everything your homeschool needs" });
    expect(realm).not.toBeNull();
    expect(howItWorks.compareDocumentPosition(realm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(realm.compareDocumentPosition(features) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

