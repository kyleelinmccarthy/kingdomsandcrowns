import { createHmac, timingSafeEqual } from "crypto";

/**
 * Lightweight signed session for PIN-authenticated children.
 *
 * PIN children are intentionally NOT Better Auth users (no email; they often
 * share a device). After a PIN is verified server-side we issue this signed
 * cookie; `getActor()` verifies it and re-reads the child row, trusting only
 * the verified payload — never client-supplied ids.
 */

export const CHILD_SESSION_COOKIE = "kc_child_session";
// Shared-device sessions are short-lived; a kid re-enters their PIN after this.
export const CHILD_SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12h

export type ChildSessionPayload = {
  childId: string;
  familyId: string;
  iat: number; // epoch ms
};

function secret(): string {
  const s = process.env.CHILD_SESSION_SECRET ?? process.env.BETTER_AUTH_SECRET;
  if (!s) throw new Error("CHILD_SESSION_SECRET / BETTER_AUTH_SECRET is not set");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function hmac(data: string): Buffer {
  return createHmac("sha256", secret()).update(data).digest();
}

export function signChildSession(payload: ChildSessionPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(hmac(body));
  return `${body}.${sig}`;
}

/**
 * Verify a cookie value. Returns the payload if the signature is valid and the
 * session has not exceeded the max age, else null. Never throws on bad input.
 */
export function verifyChildSession(value: string | undefined | null): ChildSessionPayload | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = hmac(body);
    provided = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  let payload: ChildSessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (
    !payload ||
    typeof payload.childId !== "string" ||
    typeof payload.familyId !== "string" ||
    typeof payload.iat !== "number"
  ) {
    return null;
  }
  if (Date.now() - payload.iat > CHILD_SESSION_MAX_AGE_MS) return null;

  return payload;
}
