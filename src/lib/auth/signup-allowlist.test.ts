// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { testDatabase } from "@/test/libsql-test-db";

/**
 * Who may get a NEW account while sign-ups are closed, against a real libsql database: only
 * emails a family has provisioned (a pending invite, or a hero with email/Google login on).
 */
const client = testDatabase("signup-allowlist");
const testDb = client.db;
vi.mock("@/lib/db", () => ({ db: testDb }));

const { mayCreateAccount } = await import("./signup-allowlist");

const HOUR = 3_600_000;

beforeAll(async () => {
  await client.query(`CREATE TABLE family_invite (
    id text PRIMARY KEY, email text NOT NULL, status text NOT NULL, expires_at integer NOT NULL)`);
  await client.query(`CREATE TABLE child (
    id text PRIMARY KEY, email text, auth_user_id text, banished_at integer,
    email_login_enabled integer NOT NULL DEFAULT false, google_login_enabled integer NOT NULL DEFAULT false)`);
});
beforeEach(async () => {
  await client.query("DELETE FROM family_invite");
  await client.query("DELETE FROM child");
});
afterAll(async () => {
  client.close();
});

const invite = (id: string, email: string, status: string, expiresIn: number) =>
  client.query("INSERT INTO family_invite VALUES (?1, ?2, ?3, ?4)", [id, email, status, new Date(Date.now() + expiresIn)]);
const hero = (id: string, email: string, opts: { emailLogin?: boolean; google?: boolean; linked?: boolean; banished?: boolean }) =>
  client.query("INSERT INTO child VALUES (?1, ?2, ?3, ?4, ?5, ?6)", [
    id, email, opts.linked ? "user-1" : null, opts.banished ? new Date() : null, !!opts.emailLogin, !!opts.google,
  ]);

describe("mayCreateAccount", () => {
  it("refuses a stranger, and an empty email", async () => {
    expect(await mayCreateAccount("stranger@example.com")).toBe(false);
    expect(await mayCreateAccount("")).toBe(false);
    expect(await mayCreateAccount(null)).toBe(false);
  });

  it("admits a pending, unexpired guardian invite, whatever the case of the typed email", async () => {
    await invite("i1", "grandma@example.com", "pending", HOUR);
    expect(await mayCreateAccount("  Grandma@Example.com ")).toBe(true);
  });

  it("refuses an invite that has expired, been revoked, or already been accepted", async () => {
    await invite("i1", "late@example.com", "pending", -HOUR);
    await invite("i2", "revoked@example.com", "revoked", HOUR);
    await invite("i3", "done@example.com", "accepted", HOUR);
    for (const e of ["late@example.com", "revoked@example.com", "done@example.com"]) {
      expect(await mayCreateAccount(e), e).toBe(false);
    }
  });

  it("admits a hero's email once a grown-up turns on email or Google login", async () => {
    await hero("c1", "kid-email@example.com", { emailLogin: true });
    await hero("c2", "kid-google@example.com", { google: true });
    expect(await mayCreateAccount("kid-email@example.com")).toBe(true);
    expect(await mayCreateAccount("kid-google@example.com")).toBe(true);
  });

  it("refuses a hero email with no login method on, one already linked, or a banished hero", async () => {
    await hero("c1", "off@example.com", {});
    await hero("c2", "linked@example.com", { emailLogin: true, linked: true });
    await hero("c3", "banished@example.com", { google: true, banished: true });
    for (const e of ["off@example.com", "linked@example.com", "banished@example.com"]) {
      expect(await mayCreateAccount(e), e).toBe(false);
    }
  });
});
