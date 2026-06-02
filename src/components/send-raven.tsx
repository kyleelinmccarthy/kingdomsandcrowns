"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { submitFeedback } from "@/lib/actions/feedback";

const CATEGORIES = [
  { value: "bug", label: "Something's broken" },
  { value: "idea", label: "Idea or request" },
  { value: "praise", label: "Praise" },
  { value: "other", label: "Other" },
] as const;

type Status = "idle" | "sending" | "sent" | "error";

export function SendRavenDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const [category, setCategory] = useState<string>("idea");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    setError("");
    try {
      await submitFeedback({
        category,
        message,
        pageUrl: pathname,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        viewport:
          typeof window !== "undefined"
            ? `${window.innerWidth}x${window.innerHeight}`
            : undefined,
      });
      setStatus("sent");
      setMessage("");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function handleClose() {
    setStatus("idle");
    setMessage("");
    setError("");
    onClose();
  }

  return (
    <Dialog open={open} onClose={handleClose}>
      <DialogHeader>
        <DialogTitle>Send a Raven</DialogTitle>
        <p className="text-sm font-serif text-muted-foreground">
          Bugs, ideas, praise — your message flies straight to the keeper of the realm.
        </p>
      </DialogHeader>

      {status === "sent" ? (
        <div className="space-y-4">
          <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-300">
            The raven has taken flight. Thank you for helping shape the realm!
          </div>
          <DialogFooter>
            <Button type="button" onClick={handleClose}>
              Close
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="feedback-category">What kind of message?</Label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-md border px-3 py-2 text-sm transition-colors ${
                    category === c.value
                      ? "border-[var(--gold-border)] bg-[var(--gold-border)]/10 text-foreground"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  aria-pressed={category === c.value}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback-message">Your message</Label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              minLength={3}
              maxLength={5000}
              rows={6}
              placeholder="Tell us what happened, what you'd love to see, or what you enjoy..."
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll see your name, email, and the page you were on. No screen contents are captured.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={status === "sending"}>
              Cancel
            </Button>
            <Button type="submit" disabled={status === "sending" || message.length < 3}>
              {status === "sending" ? "Sending..." : "Send the Raven"}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
