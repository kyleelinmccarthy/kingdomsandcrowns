"use client";

import { useRouter } from "next/navigation";

/** "Try again" under a Ring card whose records did not load: asks the page for them afresh. */
export function RecessTavernRetry() {
  const router = useRouter();
  return (
    <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => router.refresh()}>
      Try again
    </button>
  );
}
