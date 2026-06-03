/**
 * Minimal transactional email helper backed by Resend.
 * Returns `false` (without throwing) when email is not configured, so callers
 * can degrade gracefully; throws only when a configured send actually fails.
 */
export async function sendEmail(args: {
  to: string;
  subject: string;
  text: string;
  /** Optional branded HTML body. The plain `text` is always sent as a fallback. */
  html?: string;
  replyTo?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from =
    process.env.EMAIL_FROM ??
    process.env.FEEDBACK_FROM_EMAIL ??
    "raven@kingdomsandcrowns.com";
  if (!apiKey) return false;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: args.to,
      subject: args.subject,
      text: args.text,
      html: args.html ?? undefined,
      reply_to: args.replyTo ?? undefined,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
  return true;
}

/** Base URL for building links in emails. */
export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.BETTER_AUTH_URL ??
    "http://localhost:3000"
  );
}
