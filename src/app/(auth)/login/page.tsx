"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HeroLogin } from "@/components/hero-login";

function safeRedirect(value: string | null): string {
  // Only allow internal paths to avoid open-redirects.
  if (value && value.startsWith("/") && !value.startsWith("//")) return value;
  return "/tavern";
}

type Mode = "parent" | "kid";
type KidMethod = "pin" | "email";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect"));
  const prefillCode = searchParams.get("code") ?? "";
  // A family code (or ?mode=kid) means a kid arrived here — start on the Young Hero tab.
  const initialMode: Mode =
    searchParams.get("mode") === "kid" || prefillCode ? "kid" : "parent";

  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <>
      <SegToggle
        value={mode}
        onChange={setMode}
        options={[
          { value: "parent", label: "Parent" },
          { value: "kid", label: "Young Hero" },
        ]}
      />
      {mode === "parent" ? (
        <ParentPanel redirectTo={redirectTo} />
      ) : (
        <KidPanel redirectTo={redirectTo} prefillCode={prefillCode} />
      )}
    </>
  );
}

function ParentPanel({ redirectTo }: { redirectTo: string }) {
  return (
    <>
      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold">Welcome back, hero of homeschool</h2>
        <p className="mt-1 text-sm font-serif text-muted-foreground">
          Sign in to manage your family and young adventurers
        </p>
      </div>
      <EmailForm redirectTo={redirectTo} />
      <div className="mt-4 text-center">
        <p className="text-sm text-muted-foreground">
          New to these lands?{" "}
          <Link
            href={`/signup?redirect=${encodeURIComponent(redirectTo)}`}
            className="font-medium text-primary hover:underline"
          >
            Start your journey
          </Link>
        </p>
      </div>
    </>
  );
}

function KidPanel({
  redirectTo,
  prefillCode,
}: {
  redirectTo: string;
  prefillCode: string;
}) {
  const [method, setMethod] = useState<KidMethod>("pin");

  return (
    <>
      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold">Welcome back, Young Hero</h2>
        <p className="mt-1 text-sm font-serif text-muted-foreground">
          {method === "pin"
            ? "Enter your family code and tap your hero"
            : "Sign in with your own email"}
        </p>
      </div>
      <SegToggle
        value={method}
        onChange={setMethod}
        options={[
          { value: "pin", label: "Family code + PIN" },
          { value: "email", label: "Email" },
        ]}
      />
      {method === "pin" ? (
        <HeroLogin mode="standalone" prefillCode={prefillCode} />
      ) : (
        <>
          <EmailForm redirectTo={redirectTo} />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            No email login yet? Ask a grown-up to set one up, or use your family
            code and PIN.
          </p>
        </>
      )}
    </>
  );
}

/** Shared email/password + Google sign-in, used by both parents and email-enabled heroes. */
function EmailForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await signIn.email({
      email,
      password,
      callbackURL: redirectTo,
    });

    if (signInError) {
      setError(
        signInError.message ||
          "The arcane seal rejects those credentials. Try again, adventurer!",
      );
      setLoading(false);
      return;
    }

    router.push(redirectTo);
  }

  return (
    <>
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
            placeholder="hero@realm.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Secret Passphrase</Label>
            <Link
              href="/forgot-password"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Lost your passphrase?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            minLength={8}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Opening the gates..." : "Enter the Realm"}
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
    </>
  );
}

/** Gold-themed segmented control matching the avatar customizer tabs. */
function SegToggle<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="mb-6 flex gap-1 rounded-md border border-[var(--gold-dim)] bg-secondary/50 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
            value === o.value
              ? "bg-[rgba(201,168,76,0.12)] text-[var(--gold-bright)] border border-[var(--gold-border)] shadow-[0_0_8px_-2px_var(--glow-gold)]"
              : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-[rgba(201,168,76,0.06)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
