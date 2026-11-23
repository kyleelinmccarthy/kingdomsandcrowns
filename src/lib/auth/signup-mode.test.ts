import { describe, it, expect } from "vitest";
import { joinLink, signupMode } from "./signup-mode";

describe("signupMode", () => {
  it("opens only when SIGNUP_MODE says open, in any case or spacing", () => {
    expect(signupMode("open")).toBe("open");
    expect(signupMode(" OPEN ")).toBe("open");
  });

  it("fails closed: unset, empty, invite_only or a typo all mean invite_only", () => {
    for (const raw of [undefined, "", "invite_only", "opne", "true", "1", "public"]) {
      expect(signupMode(raw), String(raw)).toBe("invite_only");
    }
  });
});

describe("joinLink", () => {
  it("sends visitors to request access during the beta, and to sign up once open", () => {
    expect(joinLink("invite_only")).toEqual({ href: "/request-access", label: "Request access" });
    expect(joinLink("open")).toEqual({ href: "/signup", label: "Create account" });
  });
});
