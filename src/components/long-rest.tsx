"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { saveLearningLog, markLogCopied } from "@/lib/actions/chronicles";
import { createSchoolBreak, deleteSchoolBreak } from "@/lib/actions/school-breaks";

type SchoolBreak = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
};

// ── Week Navigation ─────────────────────────────────────────

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function formatRange(startDate: string, endDate: string): string {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const s = new Date(startDate + "T12:00:00");
  const e = new Date(endDate + "T12:00:00");
  const fmt = (d: Date) => `${months[d.getMonth()]} ${d.getDate()}`;
  if (s.getFullYear() === e.getFullYear()) {
    return `${fmt(s)} – ${fmt(e)}, ${s.getFullYear()}`;
  }
  return `${fmt(s)}, ${s.getFullYear()} – ${fmt(e)}, ${e.getFullYear()}`;
}

function isWeekInBreak(weekStart: string, weekEnd: string, breaks: SchoolBreak[]): boolean {
  return breaks.some((b) => weekStart >= b.startDate && weekEnd <= b.endDate);
}

function getOverlappingBreak(weekStart: string, weekEnd: string, breaks: SchoolBreak[]): SchoolBreak | null {
  return breaks.find((b) => weekStart <= b.endDate && weekEnd >= b.startDate) ?? null;
}

function getThisWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

// ── Main Component ──────────────────────────────────────────

export function LongRest({
  generatedText,
  savedEditedText,
  summaryId,
  childId,
  startDate,
  endDate,
  breaks,
  familyId,
  isChildView,
}: {
  generatedText: string;
  savedEditedText: string | null;
  summaryId: string | null;
  childId: string;
  startDate: string;
  endDate: string;
  breaks: SchoolBreak[];
  familyId: string;
  isChildView: boolean;
}) {
  const [text, setText] = useState(savedEditedText ?? generatedText);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const isModified = text !== generatedText;

  // ── Week navigation ──

  function navigate(newStart: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("week", newStart);
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  function goWeek(direction: -1 | 1) {
    let candidate = addDays(startDate, direction * 7);
    for (let i = 0; i < 52; i++) {
      const candidateEnd = addDays(candidate, 6);
      if (!isWeekInBreak(candidate, candidateEnd, breaks)) break;
      candidate = addDays(candidate, direction * 7);
    }
    navigate(candidate);
  }

  const overlapping = getOverlappingBreak(startDate, endDate, breaks);
  const thisWeekStart = getThisWeekStart();
  const isThisWeek = startDate === thisWeekStart;

  // ── Copy / Save ──

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);

    startTransition(async () => {
      const result = await saveLearningLog(childId, startDate, endDate, generatedText, text);
      await markLogCopied(result.id);
    });
  }

  function handleSave() {
    startTransition(async () => {
      await saveLearningLog(childId, startDate, endDate, generatedText, text);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  const isEmpty = generatedText.includes("No assignments recorded");

  // ── School Break Manager (parent only) ──

  const [showBreakForm, setShowBreakForm] = useState(false);
  const [breakName, setBreakName] = useState("");
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");

  function handleAddBreak() {
    if (!breakName.trim() || !breakStart || !breakEnd) return;
    startTransition(async () => {
      await createSchoolBreak(familyId, breakName.trim(), breakStart, breakEnd);
      setBreakName("");
      setBreakStart("");
      setBreakEnd("");
      setShowBreakForm(false);
      router.refresh();
    });
  }

  function handleDeleteBreak(breakId: string) {
    startTransition(async () => {
      await deleteSchoolBreak(breakId);
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Learning log — main panel (2/3 width on desktop) */}
      <GameFrame title="Learning Log" icon={<GameIcon name="scroll" className="size-5 text-[var(--gold-bright)]" />} className="lg:col-span-2">
        <div className="space-y-4">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={isEmpty ? 8 : Math.min(14, Math.max(10, text.split("\n").length + 2))}
            className="w-full rounded-lg border border-input bg-muted/50 px-4 py-3 font-mono text-base leading-relaxed transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/60"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={handleCopy} disabled={isPending}>
              {copied ? "Copied!" : "Copy to Clipboard"}
            </Button>
            <Button variant="outline" size="lg" onClick={handleSave} disabled={isPending}>
              {saved ? "Saved!" : "Save"}
            </Button>
            {isModified && (
              <Button variant="ghost" onClick={() => setText(generatedText)}>
                Reset to Generated
              </Button>
            )}
          </div>
        </div>
      </GameFrame>

      {/* Sidebar — week nav + school calendar (1/3 width on desktop) */}
      <div className="space-y-6">
        <GameFrame title="Week" icon={<GameIcon name="calendar" className="size-5 text-[var(--gold-bright)]" />}>
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-xl font-bold" style={{ fontFamily: "var(--font-brand)" }}>
                {formatRange(startDate, endDate)}
              </h3>
              {overlapping && (
                <p className="mt-1 text-sm text-muted-foreground">{overlapping.name}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => goWeek(-1)}>
                ← Prev
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => goWeek(1)}>
                Next →
              </Button>
            </div>
            {!isThisWeek && (
              <Button variant="ghost" className="w-full" onClick={() => navigate(thisWeekStart)}>
                Back to This Week
              </Button>
            )}
          </div>
        </GameFrame>

        {/* School calendar — parent only */}
        {!isChildView && (
          <GameFrame title="School Calendar" icon={<GameIcon name="calendar" className="size-5 text-[var(--gold-bright)]" />}>
            <div className="space-y-3">
              {breaks.length === 0 && !showBreakForm && (
                <p className="text-sm text-muted-foreground">
                  No breaks configured. Week navigation will skip break weeks automatically.
                </p>
              )}

              {breaks.map((b) => (
                <div key={b.id} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">
                    <span className="font-medium">{b.name}</span>
                    <span className="text-muted-foreground">
                      {" "}({formatBreakDate(b.startDate)} – {formatBreakDate(b.endDate)})
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => handleDeleteBreak(b.id)}
                    disabled={isPending}
                    aria-label={`Remove ${b.name}`}
                  >
                    &times;
                  </Button>
                </div>
              ))}

              {showBreakForm ? (
                <div className="space-y-2 rounded-lg border border-input p-3">
                  <div>
                    <Label htmlFor="break-name">Break Name</Label>
                    <Input
                      id="break-name"
                      value={breakName}
                      onChange={(e) => setBreakName(e.target.value)}
                      placeholder="e.g. Winter Break"
                    />
                  </div>
                  <div>
                    <Label htmlFor="break-start">Start</Label>
                    <Input
                      id="break-start"
                      type="date"
                      value={breakStart}
                      onChange={(e) => setBreakStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="break-end">End</Label>
                    <Input
                      id="break-end"
                      type="date"
                      value={breakEnd}
                      onChange={(e) => setBreakEnd(e.target.value)}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleAddBreak}
                      disabled={isPending || !breakName.trim() || !breakStart || !breakEnd}
                    >
                      Add Break
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowBreakForm(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="xs" onClick={() => setShowBreakForm(true)}>
                  + Add Break
                </Button>
              )}
            </div>
          </GameFrame>
        )}
      </div>
    </div>
  );
}

function formatBreakDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
