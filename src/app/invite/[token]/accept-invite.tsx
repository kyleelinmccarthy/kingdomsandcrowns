"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { acceptInvite } from "@/lib/actions/guardians";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleAccept() {
    setBusy(true);
    setError("");
    try {
      await acceptInvite(token);
      router.push("/settings");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Button onClick={handleAccept} disabled={busy} className="w-full">
        {busy ? "Joining..." : "Accept Invitation"}
      </Button>
    </div>
  );
}
