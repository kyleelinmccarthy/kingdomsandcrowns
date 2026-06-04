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
  emailLoginEnabled?: boolean;
  authUserId?: string | null;
};

const GMAIL_DOMAINS = ["gmail.com", "googlemail.com"];

function isGmail(email: string) {
  const domain = email.trim().toLowerCase().split("@")[1] ?? "";
  return GMAIL_DOMAINS.includes(domain);
}

/**
 * One clear way to email a hero their sign-in / starting-quest invite.
 * - Hero already has an email on file → sends immediately.
 * - No email yet → reveals an inline field. On send we save the email to the
 *   hero's account AND enable a self-service login so the invite is usable:
 *   email + password (a "set your password" link) for everyone, plus Google
 *   one-tap when it's a Gmail address. Enabling self-service requires the
 *   parent's consent, so the prompt includes the consent check.
 *
 * `compact` trims the helper copy for the list card; the expanded panel uses
 * the full version. Stops click propagation so it can live inside a clickable
 * hero card without toggling it.
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
  const gmail = isGmail(email);

  function reset() {
    setError(null);
    setSent(false);
    setLink(null);
  }

  // Send to a hero who already has an email + a login method on file.
  async function sendExisting() {
    setBusy(true);
    reset();
    try {
      const res = await sendChildQuestInvite(child.id);
      if (res.emailSent) setSent(true);
      else setLink(res.link);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send the email.");
    } finally {
      setBusy(false);
    }
  }

  // Save a brand-new email, turn it into a real login, then send the invite.
  async function saveAndSend() {
    const clean = email.trim();
    if (!clean) return;
    if (!consent) {
      setError("Please tick the consent box so this hero can sign in with their email.");
      return;
    }
    setBusy(true);
    reset();
    try {
      const methods: ("email" | "google")[] = ["email"];
      if (isGmail(clean)) methods.push("google");

      await setChildEmail(child.id, clean);
      await recordChildConsent(child.id, methods);
      // email + password for everyone (the invite becomes a set-password link),
      // plus Google one-tap when it's a Gmail address.
      await setChildAuthMethod(child.id, "email", true);
      if (isGmail(clean)) await setChildAuthMethod(child.id, "google", true);

      const res = await sendChildQuestInvite(child.id);
      if (res.emailSent) setSent(true);
      else setLink(res.link);
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
    if (hasEmail) {
      void sendExisting();
    } else {
      setPrompting((p) => !p);
    }
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-1">
      <Button size="sm" variant="outline" disabled={busy} onClick={handleTrigger}>
        ✉️ {hasEmail ? "Send sign-in email" : "Email this hero"}
      </Button>

      {!compact && hasEmail && (
        <p className="text-xs text-muted-foreground">
          Emails {child.email} a branded invite with a link to{" "}
          {child.emailLoginEnabled
            ? child.authUserId
              ? "sign in"
              : "set up their login"
            : "play with the family code"}
          .
        </p>
      )}

      {prompting && !hasEmail && (
        <div className="space-y-2 pt-1">
          <div className="flex gap-2">
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
            <Button size="sm" disabled={busy || !email.trim() || !consent} onClick={saveAndSend}>
              Send
            </Button>
          </div>
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
          <p className="text-xs text-muted-foreground">
            Saves this email to {child.displayName} and emails them a link to set a password
            {gmail ? " — or sign in with Google, since it's a Gmail address" : ""}.
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
