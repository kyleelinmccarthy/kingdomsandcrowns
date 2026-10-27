// @vitest-environment node
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "@/lib/db/schema";

/**
 * The public "Request access" form, against a real Postgres database: it stores the request,
 * emails the owner with the visitor's opt-ins, and holds back bots and repeat submissions.
 */
const SCHEMA = "test_access_request";
const client = new Client({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/kingdomsandcrowns",
});
const testDb = drizzle(client, { schema });

let ip = "203.0.113.7";
type Mail = { to: string; subject: string; text: string; replyTo?: string };
const sendEmail = vi.fn<(mail: Mail) => Promise<boolean>>(async () => true);
vi.mock("@/lib/db", () => ({ db: testDb }));
vi.mock("@/lib/email", () => ({
  sendEmail: (a: Parameters<typeof sendEmail>[0]) => sendEmail(a),
  appBaseUrl: () => "http://localhost:3000",
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "cf-connecting-ip": ip }) }));

const { requestAccess } = await import("./access-request");

beforeAll(async () => {
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.query(`CREATE SCHEMA "${SCHEMA}"`);
  await client.query(`SET search_path TO "${SCHEMA}"`);
  await client.query(`CREATE TABLE access_request (
    id text PRIMARY KEY, name text NOT NULL, email text NOT NULL, message text,
    wants_beta boolean NOT NULL DEFAULT false, notify_free boolean NOT NULL DEFAULT false,
    notify_paid boolean NOT NULL DEFAULT false, ip_hash text, status text NOT NULL DEFAULT 'new',
    created_at timestamptz NOT NULL)`);
});
beforeEach(async () => {
  await client.query("DELETE FROM access_request");
  sendEmail.mockClear();
  ip = "203.0.113.7";
  process.env.FEEDBACK_NOTIFY_EMAIL = "owner@example.com";
});
afterAll(async () => {
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.end();
});

const base = { name: "Pat Parent", email: "Pat@Example.com", wantsBeta: true, notifyFree: false, notifyPaid: true };
const rows = async () => (await client.query("SELECT * FROM access_request ORDER BY created_at")).rows;

describe("requestAccess", () => {
  it("stores the request and emails the owner with the visitor's opt-ins, replying to the visitor", async () => {
    expect(await requestAccess({ ...base, message: "Two kids, 7 and 10" })).toEqual({ ok: true });
    const [r] = await rows();
    expect(r).toMatchObject({ name: "Pat Parent", email: "pat@example.com", wants_beta: true, notify_free: false, notify_paid: true, message: "Two kids, 7 and 10" });
    expect(r.ip_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(r.ip_hash).not.toContain("203.0.113.7");
    expect(sendEmail).toHaveBeenCalledOnce();
    const mail = sendEmail.mock.calls[0][0];
    expect(mail.to).toBe("owner@example.com");
    expect(mail.replyTo).toBe("pat@example.com");
    expect(mail.subject).toContain("beta tester");
    expect(mail.text).toContain("wants to beta test now");
    expect(mail.text).toContain("notify when paid plans open");
    expect(mail.text).not.toContain("free accounts");
  });

  it("keeps the request even when the email can't be sent", async () => {
    sendEmail.mockRejectedValueOnce(new Error("Resend 500"));
    expect(await requestAccess(base)).toEqual({ ok: true });
    expect(await rows()).toHaveLength(1);
  });

  it("returns readable errors for a missing name or a bad email, storing nothing", async () => {
    expect(await requestAccess({ ...base, name: "  " })).toEqual({ error: expect.stringMatching(/name/) });
    expect(await requestAccess({ ...base, email: "not-an-email" })).toEqual({ error: expect.stringMatching(/valid email/) });
    expect(await rows()).toHaveLength(0);
  });

  it("quietly thanks a bot that fills the hidden field, without storing or emailing", async () => {
    expect(await requestAccess({ ...base, website: "http://spam.example" })).toEqual({ ok: true });
    expect(await rows()).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("stops the same email after three requests in a day", async () => {
    for (let i = 0; i < 3; i++) {
      ip = `198.51.100.${i}`;
      expect(await requestAccess(base)).toEqual({ ok: true });
    }
    ip = "198.51.100.99";
    expect(await requestAccess(base)).toEqual({ error: expect.stringMatching(/already have your request/) });
    expect(await rows()).toHaveLength(3);
  });

  it("stops one address after ten requests in an hour, whatever the emails", async () => {
    for (let i = 0; i < 10; i++) expect(await requestAccess({ ...base, email: `p${i}@example.com` })).toEqual({ ok: true });
    expect(await requestAccess({ ...base, email: "p10@example.com" })).toEqual({ error: expect.stringMatching(/Too many/) });
    ip = "192.0.2.1";
    expect(await requestAccess({ ...base, email: "p10@example.com" })).toEqual({ ok: true });
  });
});
