import { describe, it, expect } from "vitest";
import { defaultSchoolForSubject, isSubjectSchool, SCHOOL_LABELS, emptySchoolCounts } from "./spell-schools";

describe("defaultSchoolForSubject", () => {
  it("maps the default disciplines", () => {
    expect(defaultSchoolForSubject("Math")).toBe("form");
    expect(defaultSchoolForSubject("Reading")).toBe("element");
    expect(defaultSchoolForSubject("Science")).toBe("modifier");
    expect(defaultSchoolForSubject("History")).toBe("element");
    expect(defaultSchoolForSubject("Art")).toBe("modifier");
  });
  it("ignores case and matches whole words only", () => {
    expect(defaultSchoolForSubject("mathematics")).toBe("form");
    expect(defaultSchoolForSubject("ELA")).toBe("element");
    expect(defaultSchoolForSubject("Smarts")).toBe("none"); // "art" inside a word does not count
  });
  it("checks schools in the order element, form, modifier when a name spans two", () => {
    expect(defaultSchoolForSubject("Art History")).toBe("element");
    expect(defaultSchoolForSubject("Math Science")).toBe("form");
  });
  it("leaves unknown disciplines without a school", () => {
    expect(defaultSchoolForSubject("Piano")).toBe("none");
    expect(defaultSchoolForSubject("")).toBe("none");
  });
});

describe("isSubjectSchool", () => {
  it("accepts the four values and nothing else", () => {
    expect(isSubjectSchool("element")).toBe(true);
    expect(isSubjectSchool("none")).toBe(true);
    expect(isSubjectSchool("elements")).toBe(false);
    expect(isSubjectSchool(undefined)).toBe(false);
  });
});

describe("labels and counts", () => {
  it("has a label for every school", () => {
    expect(Object.keys(SCHOOL_LABELS).sort()).toEqual(["element", "form", "modifier", "none"]);
  });
  it("starts every school at zero", () => {
    expect(emptySchoolCounts()).toEqual({ element: 0, form: 0, modifier: 0 });
  });
});
