"use client";

import { useState } from "react";
import Link from "next/link";
import { requestAccess } from "@/lib/actions/access-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RequestAccessPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [wantsBeta, setWantsBeta] = useState(false);
  const [notifyFree, setNotifyFree] = useState(false);
  const [notifyPaid, setNotifyPaid] = useState(false);
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await requestAccess({ name, email, message, wantsBeta, notifyFree, notifyPaid, website });
      if ("error" in result) setError(result.error);
      else setSent(true);
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <h2 className="text-xl font-semibold">Your request is on its way</h2>
        <p className="text-sm font-serif text-muted-foreground">
          Thanks, {name.split(" ")[0] || "traveler"}! We&apos;ll write to {email} when there&apos;s a place for your family.
        </p>
        <Link href="/" className="text-sm font-medium text-primary underline hover:text-primary/80">
          Back to the realm
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="mb-6 text-center">
        <h2 className="text-lg font-semibold">Request access</h2>
        <p className="mt-1 text-sm font-serif text-muted-foreground">
          Kingdoms &amp; Crowns is in beta and open by invitation. Tell us a little about your family and how you&apos;d
          like to hear from us.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <div className="space-y-2">
          <Label htmlFor="name">Your name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" maxLength={100} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="message">About your family (optional)</Label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="How many kids, their ages, how you homeschool…"
            className="w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/60"
          />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Keep me posted</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={wantsBeta} onChange={(e) => setWantsBeta(e.target.checked)} className="mt-1" />
            <span>I&apos;d like to be a beta tester and try it now</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={notifyFree} onChange={(e) => setNotifyFree(e.target.checked)} className="mt-1" />
            <span>Email me when free accounts open</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={notifyPaid} onChange={(e) => setNotifyPaid(e.target.checked)} className="mt-1" />
            <span>Email me when the paid Kingdom plan launches</span>
          </label>
        </fieldset>
        {/* Honeypot: hidden from people and screen readers; bots tend to fill every field. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Website</label>
          <input id="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending your raven…" : "Request access"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already part of a family here?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
