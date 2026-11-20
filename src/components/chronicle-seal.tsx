"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sealEntry } from "@/lib/actions/chronicle-seals";
import { SEAL_NOTE_MAX, SEAL_PHRASES, sealText, type Seal } from "@/lib/utils/seals";

/**
 * A grown-up's seal as it sits on a finished quest: a small wax seal, the words, and who pressed
 * it. Shown to the hero and the grown-up alike. It says something kind; it is never a score.
 */
export function SealBadge({ seal }: { seal: Seal }) {
  return (
    <p data-testid="chronicle-seal" className="mt-1 flex items-start gap-1.5 text-xs text-foreground/90">
      <span
        aria-hidden="true"
        className="mt-0.5 inline-block size-3.5 shrink-0 rounded-full border border-[#5e1a1a] bg-[#9b2c2c] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.12)]"
      />
      <span className="min-w-0 wrap-anywhere">
        <span className="font-medium">{sealText(seal)}</span> <span className="text-muted-foreground">— {seal.by}</span>
      </span>
    </p>
  );
}

/**
 * The grown-up's small inline panel for pressing a seal: one of six phrases, or a short note
 * (never both: choosing one lets go of the other). The server checks it all again. Once pressed,
 * the page refreshes, or `onSealed` runs instead (the Chronicle book reads its own pages again).
 */
export function SealPanel({ assignmentId, onClose, onSealed }: { assignmentId: string; onClose: () => void; onSealed?: () => void }) {
  const router = useRouter();
  const [phrase, setPhrase] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

  const ready = phrase !== null || note.trim() !== "";

  async function press() {
    if (!ready) return;
    setActing(true);
    setError("");
    try {
      await sealEntry(assignmentId, phrase !== null ? { phrase } : { note });
      onClose();
      if (onSealed) onSealed();
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not press the seal");
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="mt-2 space-y-2 border-t border-border/30 pt-2">
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-1.5">
        {SEAL_PHRASES.map((text, i) => (
          <Button
            key={text}
            type="button"
            size="sm"
            variant={phrase === i ? "default" : "outline"}
            aria-pressed={phrase === i}
            disabled={acting}
            onClick={() => {
              setPhrase(i);
              setNote("");
            }}
          >
            {text}
          </Button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={note}
          maxLength={SEAL_NOTE_MAX}
          onChange={(e) => {
            setNote(e.target.value.replace(/[\r\n]+/g, " "));
            setPhrase(null);
          }}
          placeholder="Or write a few words"
          aria-label="A note for the seal"
          disabled={acting}
        />
        <span className="shrink-0 text-xs text-muted-foreground" aria-live="polite">
          {note.length}/{SEAL_NOTE_MAX}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={press} disabled={acting || !ready}>
          {acting ? "Pressing..." : "Press the seal"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={acting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
