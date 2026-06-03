"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  setChildEmail,
  setChildAuthMethod,
  setChildPin,
  recordChildConsent,
  sendChildLoginSetup,
} from "@/lib/actions/child-auth";

type Props = {
  child: {
    id: string;
    displayName: string;
    email?: string | null;
    pinEnabled?: boolean;
    emailLoginEnabled?: boolean;
    googleLoginEnabled?: boolean;
    authUserId?: string | null;
  };
};

export function ChildLoginAccess({ child }: Props) {
  const router = useRouter();
  const [email, setEmail] = useState(child.email ?? "");
  const [consent, setConsent] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [setupLink, setSetupLink] = useState<string | null>(null);

  const emailDirty = email !== (child.email ?? "");

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleSelfService(method: "email" | "google", enabled: boolean) {
    if (enabled && !consent) {
      setError("Tick the consent box before enabling self-service login.");
      return;
    }
    await run(async () => {
      if (enabled) await recordChildConsent(child.id, [method]);
      await setChildAuthMethod(child.id, method, enabled);
    });
  }

  return (
    <div className="space-y-4 border-t pt-4">
      <h4 className="text-sm font-medium">Login & Access</h4>
      {error && (
        <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>
      )}

      {/* PIN */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs">Secret PIN (4–6 digits)</Label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={child.pinEnabled ?? true}
              disabled={busy}
              onChange={(e) => run(() => setChildAuthMethod(child.id, "pin", e.target.checked))}
            />
            PIN login enabled
          </label>
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Set / reset PIN"
            maxLength={6}
          />
          <Button
            size="sm"
            disabled={busy || pin.length < 4}
            onClick={() =>
              run(async () => {
                await setChildPin(child.id, pin);
                setPin("");
              })
            }
          >
            Save PIN
          </Button>
        </div>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label className="text-xs">Email (for the hero&apos;s own login)</Label>
        <div className="flex gap-2">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="hero@example.com"
          />
          {emailDirty && (
            <Button size="sm" disabled={busy} onClick={() => run(() => setChildEmail(child.id, email))}>
              Save
            </Button>
          )}
        </div>
      </div>

      {/* Consent + self-service toggles */}
      <label className="flex items-start gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          I authorize this hero to use self-service login (email / Google) and consent to data
          collection for this parent-managed profile.
        </span>
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={child.emailLoginEnabled ?? false}
            disabled={busy || !child.email}
            onChange={(e) => toggleSelfService("email", e.target.checked)}
          />
          Email + password
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={child.googleLoginEnabled ?? false}
            disabled={busy || !child.email}
            onChange={(e) => toggleSelfService("google", e.target.checked)}
          />
          Google (if a gmail)
        </label>
      </div>

      {child.emailLoginEnabled && child.email && !child.authUserId && (
        <div className="space-y-1">
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const res = await sendChildLoginSetup(child.id);
                if (!res.emailSent) setSetupLink(res.link);
              })
            }
          >
            Send login setup email
          </Button>
          {setupLink && (
            <p className="break-all text-xs text-[var(--gold-bright)]">
              Email not configured — share this link: {setupLink}
            </p>
          )}
        </div>
      )}
      {child.authUserId && (
        <p className="text-xs text-muted-foreground">✓ This hero has set up their own login.</p>
      )}
    </div>
  );
}
