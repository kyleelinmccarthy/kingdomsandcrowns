"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signUp, signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function safeRedirect(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/tavern";
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect"));
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassphraseInfo, setShowPassphraseInfo] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("The passphrases do not match. Speak them again with care!");
      return;
    }

    setLoading(true);

    const { error: signUpError } = await signUp.email({
      name,
      email,
      password,
      callbackURL: redirectTo,
    });

    if (signUpError) {
      setError(signUpError.message || "Something went wrong. Please try again.");
      setLoading(false);
      return;
    }

    router.push(redirectTo);
  }

  return (
    <>
      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold">Begin Your Legend</h2>
        <p className="mt-1 text-sm font-serif text-muted-foreground">
          Forge your oath and join the realm
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="name">Hero Name</Label>
          <Input
            id="name"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoComplete="name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="hero@realm.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="password">Secret Passphrase</Label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowPassphraseInfo(!showPassphraseInfo)}
                className="inline-flex size-4 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground transition-colors hover:bg-primary/20 hover:text-primary"
                aria-label="Password requirements"
              >
                i
              </button>
              {showPassphraseInfo && (
                <div className="absolute left-1/2 top-6 z-10 w-52 -translate-x-1/2 rounded-lg border bg-popover p-3 text-xs text-popover-foreground shadow-md">
                  <p className="font-medium">Passphrase requirements:</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-muted-foreground">
                    <li>At least 8 characters long</li>
                    <li>Mix of letters and numbers recommended</li>
                    <li>Something you can remember!</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm Passphrase</Label>
          <Input
            id="confirm-password"
            type="password"
            placeholder="Type it once more"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            minLength={8}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Forging your legend..." : "Begin the Adventure"}
        </Button>
      </form>
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">or</span>
        </div>
      </div>
      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={async () => {
            setError("");
            setLoading(true);
            // On success the better-auth redirect plugin navigates to Google, so
            // we intentionally leave `loading` true. Only surface/reset on error,
            // otherwise a rejected request (e.g. origin not trusted) silently
            // freezes the button with no feedback.
            const { error: socialError } = await signIn.social({
              provider: "google",
              callbackURL: redirectTo,
            });
            if (socialError) {
              setError(
                socialError.message ||
                  "The Google gateway turned us away. Try again, adventurer!",
              );
              setLoading(false);
            }
          }}
        >
          <svg className="mr-2 size-4" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </Button>
      </div>
      <div className="mt-4 text-center">
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href={`/login?redirect=${encodeURIComponent(redirectTo)}`}
            className="font-medium text-primary hover:underline"
          >
            Return to the gates
          </Link>
        </p>
      </div>
    </>
  );
}
