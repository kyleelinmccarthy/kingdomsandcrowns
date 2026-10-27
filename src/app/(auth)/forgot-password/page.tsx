"use client";

import { useState } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await authClient.$fetch("/request-password-reset", {
        method: "POST",
        body: { email, redirectTo: "/reset-password" },
      });
    } catch {
      // Don't reveal whether the email exists
    }

    setSent(true);
    setLoading(false);
  }

  if (sent) {
    return (
      <>
        <div className="text-center">
          <h2 className="text-xl font-semibold">Check your email</h2>
          <p className="mt-2 text-sm font-serif text-muted-foreground">
            If an account exists for {email}, we&apos;ve sent a password reset link.
          </p>
        </div>
        <div className="mt-4 text-center">
          <Link href="/login" className="text-sm font-medium text-primary underline hover:text-primary/80">
            Return to the gates
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold">Reset your passphrase</h2>
        <p className="mt-1 text-sm font-serif text-muted-foreground">
          Enter your email and we&apos;ll send you a reset link
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </Button>
      </form>
      <div className="mt-4 text-center">
        <Link href="/login" className="text-sm font-medium text-primary underline hover:text-primary/80">
          Return to the gates
        </Link>
      </div>
    </>
  );
}
