"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  setChildEmail,
  setChildAuthMethod,
  recordChildConsent,
  sendChildQuestInvite,
} from "@/lib/actions/child-auth";

type HeroEmailChild = {
  id: string;
  displayName: string;
  email?: string | null;
  pinEnabled?: boolean;
  emailLoginEnabled?: boolean;
  googleLoginEnabled?: boolean;
  authUserId?: string | null;
};

const GMAIL_DOMAINS = ["gmail.com", "googlemail.com"];

function isGmail(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return GMAIL_DOMAINS.includes(domain);
}

/**
 * One clear way to email a hero their sign-in / starting-quest invite.
 *
 * - Hero already has an email AND a usable login (PIN, email, or Google)
 *   → sends immediately.
 * - Otherwise → reveals an inline prompt that collects whatever is missing
 *   (the email, and/or parental consent), turns it into a real login
 *   (email + password for everyone, plus Google one-tap for Gmail), then sends.
 *
 * This guarantees we never call the server action in a state it would reject
 * (which in prod surfaces only as an opaque 500).
 *
 * `compact` trims the helper copy for the list card. Stops click propagation so
 * it can live inside a clickable hero card without toggling it.
 */
export function SendHeroEmailButton({
  child,
  compact = false,
}: {
  child: HeroEmailChild;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const hasEmail = !!child.email;
  const hasLoginMethod =
    !!child.pinEnabled || !!child.emailLoginEnabled || !!child.googleLoginEnabled;
  const canSendNow = hasEmail && hasLoginMethod;
  const needsEmail = !hasEmail;

  function reset() {
    setError(null);
    setSent(false);
    setLink(null);
  }

  function applyResult(res: { emailSent: boolean; link: string }) {
    if (res.emailSent) setSent(true);
    else setLink(res.link);
  }

  // Hero already has an email + a login method → just send.
  async function sendNow() {
    setBusy(true);
    reset();
    try {
      applyResult(await sendChildQuestInvite(child.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the email.");
    } finally {
      setBusy(false);
    }
  }

  // Collect what's missing (email and/or consent), turn it into a real login,
  // then send the invite.
  async function saveAndSend() {
    const targetEmail = (needsEmail ? email.trim() : child.email) ?? "";
    if (!targetEmail) return;
    if (!consent) {
      setError("Please tick the consent box so this hero can sign in with their email.");
      return;
    }
    setBusy(true);
    reset();
    try {
      const gmail = isGmail(targetEmail);
      const methods: ("email" | "google")[] = ["email"];
      if (gmail) methods.push("google");

      if (needsEmail) await setChildEmail(child.id, targetEmail);
      await recordChildConsent(child.id, methods);
      // email + password for everyone (the invite becomes a set-password link),
      // plus Google one-tap when it's a Gmail address.
      await setChildAuthMethod(child.id, "email", true);
      if (gmail) await setChildAuthMethod(child.id, "google", true);

      applyResult(await sendChildQuestInvite(child.id));
      setPrompting(false);
      setEmail("");
      setConsent(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the email.");
    } finally {
      setBusy(false);
    }
  }

  function handleTrigger() {
    reset();
    if (canSendNow) {
      void sendNow();
    } else {
      setPrompting((p) => !p);
    }
  }

  const triggerLabel = canSendNow
    ? "Send sign-in email"
    : hasEmail
      ? "Set up sign-in & email this hero"
      : "Email this hero";

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-1.5">
      <Button size="sm" disabled={busy} onClick={handleTrigger}>
        ✉️ {busy ? "Sending…" : triggerLabel}
      </Button>

      {!compact && canSendNow && (
        <p className="text-xs text-muted-foreground">
          Emails {child.email} a branded invite with a link to{" "}
          {child.emailLoginEnabled
            ? child.authUserId
              ? "sign in"
              : "set up their login"
            : child.googleLoginEnabled
              ? "sign in with Google"
              : "play with the family code"}
          .
        </p>
      )}

      {prompting && !canSendNow && (
        <div className="space-y-2 pt-1">
          {needsEmail && (
            <Input
              type="email"
              autoFocus
              value={email}
              placeholder="hero@example.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && email.trim() && consent && !busy) saveAndSend();
              }}
            />
          )}
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              I authorize {child.displayName} to sign in with this email and consent to data
              collection for this parent-managed profile.
            </span>
          </label>
          <Button
            size="sm"
            disabled={busy || (needsEmail && !email.trim()) || !consent}
            onClick={saveAndSend}
          >
            {busy ? "Sending…" : "Save & send invite"}
          </Button>
          <p className="text-xs text-muted-foreground">
            {hasEmail ? `${child.displayName} has` : "Saves this email and gives them"} a way to sign
            in: a link to set a password
            {isGmail(needsEmail ? email : child.email ?? "")
              ? " — or sign in with Google, since it's a Gmail address"
              : ""}
            .
          </p>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
      {sent && <p className="text-xs text-[var(--gold-bright)]">✓ Email sent!</p>}
      {link && (
        <p className="break-all text-xs text-[var(--gold-bright)]">
          Email not configured — share this link: {link}
        </p>
      )}
    </div>
  );
}
