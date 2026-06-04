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
} from "@/lib/actions/child-auth";

type Props = {
  child: {
    id: string;
    displayName: string;
    email?: string | null;
    pinEnabled?: boolean;
    hasPin?: boolean;
    emailLoginEnabled?: boolean;
    googleLoginEnabled?: boolean;
    authUserId?: string | null;
  };
};

export function ChildLoginAccess({ child }: Props) {
  const router = useRouter();
  // Enabling email/Google login requires recorded consent, so an already-enabled
  // self-service method means consent is on file. Reflect that so the box doesn't
  // appear unchecked (and reset on every refresh) after the parent has authorized.
  const consentOnFile = !!child.emailLoginEnabled || !!child.googleLoginEnabled;
  const [email, setEmail] = useState(child.email ?? "");
  const [consent, setConsent] = useState(consentOnFile);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

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

      {/* Family Code + PIN */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs font-medium">Family Code + PIN</Label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={child.pinEnabled ?? true}
              disabled={busy || !child.hasPin}
              onChange={(e) => run(() => setChildAuthMethod(child.id, "pin", e.target.checked))}
            />
            PIN login enabled
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          The default way in. On the Young Hero login this hero enters your family code, taps their
          character, and types this PIN — on any device.
        </p>
        {!child.hasPin ? (
          <div className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            ⚠ No PIN yet — this hero won&apos;t appear on the Family Code login. Set one below so they
            always have a way in.
          </div>
        ) : (
          !child.pinEnabled && (
            <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              PIN login is turned off — this hero won&apos;t appear on the Family Code login until you
              re-enable it.
            </div>
          )
        )}
        <div className="flex gap-2">
          <Input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="Set / reset PIN — 4 to 6 digits"
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
        <p className="text-xs text-muted-foreground">
          Numbers only, 4 to 6 digits.
        </p>
      </div>

      {/* Self-service login (optional) */}
      <div className="space-y-1 border-t pt-4">
        <Label className="text-xs font-medium">Sign in on their own (optional)</Label>
        <p className="text-xs text-muted-foreground">
          For an older hero with their own device — they sign in directly, no family code needed. The
          PIN above still works as a backup.
        </p>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground">Hero&apos;s email</Label>
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
          collection for this parent-managed profile. Required before either method can be turned on.
          {consentOnFile && (
            <span className="ml-1 text-[var(--gold-bright)]">✓ on file</span>
          )}
        </span>
      </label>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={child.emailLoginEnabled ?? false}
            disabled={busy || !child.email}
            onChange={(e) => toggleSelfService("email", e.target.checked)}
          />
          <span>
            Email + password{" "}
            <span className="text-xs text-muted-foreground">— signs in with their own password</span>
          </span>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={child.googleLoginEnabled ?? false}
            disabled={busy || !child.email}
            onChange={(e) => toggleSelfService("google", e.target.checked)}
          />
          <span>
            Google{" "}
            <span className="text-xs text-muted-foreground">— one tap, needs a Gmail address</span>
          </span>
        </label>
        {!child.email && (
          <p className="text-xs text-muted-foreground">Add an email above to enable these.</p>
        )}
      </div>

      {child.authUserId && (
        <p className="text-xs text-muted-foreground">✓ This hero has set up their own login.</p>
      )}
    </div>
  );
}
