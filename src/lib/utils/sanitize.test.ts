import { describe, it, expect } from "vitest";
import { sanitizeText, sanitizeName, sanitizeEmail, hasMeaningfulNotes } from "./sanitize";

describe("sanitizeText", () => {
  it("strips HTML tags", () => {
    expect(sanitizeText("<script>alert('xss')</script>Hello")).toBe(
      "alert('xss')Hello"
    );
    expect(sanitizeText("<b>bold</b>")).toBe("bold");
  });

  it("trims whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });

  it("truncates to max length", () => {
    const long = "a".repeat(200);
    expect(sanitizeText(long, 100)).toHaveLength(100);
  });

  it("handles empty string", () => {
    expect(sanitizeText("")).toBe("");
  });
});

describe("sanitizeName", () => {
  it("truncates to 100 characters", () => {
    const long = "a".repeat(200);
    expect(sanitizeName(long)).toHaveLength(100);
  });
});

describe("hasMeaningfulNotes", () => {
  it("rejects empty, null, and undefined input", () => {
    expect(hasMeaningfulNotes("")).toBe(false);
    expect(hasMeaningfulNotes(null)).toBe(false);
    expect(hasMeaningfulNotes(undefined)).toBe(false);
  });

  it("rejects whitespace-only input", () => {
    expect(hasMeaningfulNotes("   ")).toBe(false);
    expect(hasMeaningfulNotes("\t\n")).toBe(false);
  });

  it("rejects lone punctuation used to bypass the required-notes check", () => {
    expect(hasMeaningfulNotes("'")).toBe(false);
    expect(hasMeaningfulNotes(".")).toBe(false);
    expect(hasMeaningfulNotes("-")).toBe(false);
    expect(hasMeaningfulNotes("...")).toBe(false);
    expect(hasMeaningfulNotes("!!!")).toBe(false);
  });

  it("rejects digits-only or too-short input", () => {
    expect(hasMeaningfulNotes("123")).toBe(false);
    expect(hasMeaningfulNotes("hi")).toBe(false);
  });

  it("accepts real notes describing what was done", () => {
    expect(hasMeaningfulNotes("did math worksheet")).toBe(true);
    expect(hasMeaningfulNotes("Read ch. 4")).toBe(true);
  });
});

describe("sanitizeEmail", () => {
  it("lowercases email", () => {
    expect(sanitizeEmail("User@Example.COM")).toBe("user@example.com");
  });

  it("trims whitespace", () => {
    expect(sanitizeEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("truncates to 254 characters", () => {
    const long = "a".repeat(300) + "@example.com";
    expect(sanitizeEmail(long).length).toBeLessThanOrEqual(254);
  });
});
