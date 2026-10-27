"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

// The emailed link goes through /api/auth/reset-password/<token>, which lands here with
// ?token=… when it's valid, or ?error=INVALID_TOKEN when it has expired or been used.
function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const linkError = searchParams.get("error");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token || linkError) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-xl font-semibold">This link has expired</h2>
        <p className="text-sm font-serif text-muted-foreground">
          Reset links work once, for one hour. Ask for a fresh one and use it right away.
        </p>
        <Link href="/forgot-password" className="text-sm font-medium text-primary underline hover:text-primary/80">
          Send a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-xl font-semibold">Passphrase set</h2>
        <p className="text-sm font-serif text-muted-foreground">
          You can now sign in with your email and new passphrase — and Google still works too, if you used it.
        </p>
        <Link href="/login?method=email" className="text-sm font-medium text-primary underline hover:text-primary/80">
          Return to the gates
        </Link>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("The passphrases do not match.");
      return;
    }
    setLoading(true);
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token: token! });
    setLoading(false);
    if (resetError) {
      setError(resetError.message || "That didn't work. Try sending a new link.");
      return;
    }
    setDone(true);
  }

  return (
    <>
      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold">Choose a new passphrase</h2>
        <p className="mt-1 text-sm font-serif text-muted-foreground">At least 8 characters.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="space-y-2">
          <Label htmlFor="password">New passphrase</Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm passphrase</Label>
          <Input
            id="confirm"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Setting…" : "Set passphrase"}
        </Button>
      </form>
    </>
  );
}
