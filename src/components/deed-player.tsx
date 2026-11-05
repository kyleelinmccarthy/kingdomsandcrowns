"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { DeedResults } from "@/components/deed-results";
import { SubjectChip } from "@/components/subject-chip";
import { completeDeedRun, type RunStart, type RunSummary } from "@/lib/actions/deeds";
import { useDeedFlow } from "@/components/use-deed-flow";
import { attemptFeedback } from "@/lib/realm3d/talk";
import { choiceTone, type ChoiceTone } from "@/lib/utils/deed-run-flow";
import type { ProfileLike } from "@/lib/utils/deed-engine";
import { canSpeak, speak } from "@/lib/utils/speech";
import { SIDE_QUEST_LOWER } from "@/lib/utils/side-quest-copy";

const TONE_CLASS: Record<ChoiceTone, string> = {
  plain: "border-gold-dim bg-muted/20",
  answer: "border-[var(--gold-border)] bg-muted/40",
  "ruled-out": "border-dashed border-gold-dim bg-muted/10 opacity-50 line-through",
  "picked-wrong": "border-destructive/60 bg-destructive/10 opacity-70",
  faded: "opacity-60",
};

export function DeedPlayer({
  childId,
  run,
  profile,
  calm,
  doneLabel,
  onFinished,
}: {
  childId: string;
  run: RunStart;
  profile: ProfileLike;
  calm: boolean;
  doneLabel?: string;
  onFinished: (summary: RunSummary) => void;
}) {
  const { flow, busy, error, setError, guarded, choose, showMe, next } = useDeedFlow(run);
  const { index, phase } = flow;
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const speakable = canSpeak();
  const question = run.questions[index];
  const isLast = index === run.questions.length - 1;
  void childId;

  // Read-aloud is a side effect, not state: the profile asks for it, the effect obeys.
  useEffect(() => {
    if (profile.readAloud && question) speak(question.readAloud ?? question.prompt);
    return () => {
      if (canSpeak()) window.speechSynthesis.cancel();
    };
  }, [profile.readAloud, question]);

  // A soft elapsed-time chip when the hero hasn't asked for untimed play.
  useEffect(() => {
    if (profile.untimed) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [profile.untimed]);

  const nextRef = useRef<HTMLButtonElement>(null);
  const firstOpenChoice = useRef<HTMLButtonElement>(null);
  const firstOpen = question.choices.findIndex((c) => !flow.ruledOut.includes(c));
  const feedback = flow.result ? attemptFeedback(flow.result, flow.ruledOut.length > 0) : null;

  // The hint is read once, when the second chance opens.
  const hint = phase === "second-chance" ? flow.result?.hint : undefined;
  useEffect(() => {
    if (!profile.readAloud || !hint) return;
    speak(hint);
    return () => {
      if (canSpeak()) window.speechSynthesis.cancel();
    };
  }, [profile.readAloud, hint, index]);

  // Focus follows the question: the first open choice (a second chance skips the crossed-out
  // pick), Next once it is resolved.
  useEffect(() => {
    if (summary) return;
    (phase === "resolved" ? nextRef.current : firstOpenChoice.current)?.focus();
  }, [phase, index, summary]);

  function advance() {
    if (!isLast) return next();
    return guarded(async () => setSummary(await completeDeedRun(run.runId)));
  }

  if (summary) {
    return (
      <GameFrame title={run.deed.title} icon={<GameIcon name="map" className="size-4 text-[var(--gold-bright)]" />}>
        <DeedResults summary={summary} deedTitle={run.deed.title} area={run.deed.area} doneLabel={doneLabel} onDone={() => onFinished(summary)} />
      </GameFrame>
    );
  }

  const minutes = Math.floor((now - startedAt) / 60_000);

  return (
    <GameFrame
      title={run.deed.title}
      icon={<GameIcon name="map" className="size-4 text-[var(--gold-bright)]" />}
      action={!profile.untimed ? <span className="text-xs text-muted-foreground">{minutes} min</span> : undefined}
    >
      <div className="space-y-5">
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><SubjectChip area={run.deed.area} /> {run.deed.story}</p>
        <div className="flex items-center gap-1" aria-label={`Question ${index + 1} of ${run.questions.length}`} role="img">
          {run.questions.map((q, i) => (
            <span key={q.id} className={`size-2 rounded-full ${i < index ? "bg-[var(--gold-bright)]" : i === index ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error} <Button size="xs" variant="ghost" onClick={() => setError("")}>Try again</Button></div>}
        <div className="flex items-start gap-3">
          <p className="flex-1 text-xl font-medium">{question.prompt}</p>
          {speakable && (
            <Button size="sm" variant="outline" aria-label="Read aloud" onClick={() => speak(question.readAloud ?? question.prompt)}>
              <GameIcon name="sparkles" className="size-4" />
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {question.choices.map((choice, i) => {
            const tone = choiceTone(flow, choice);
            const ruledOut = tone === "ruled-out";
            return (
              <button
                key={choice}
                ref={i === firstOpen ? firstOpenChoice : undefined}
                type="button"
                data-tone={tone}
                disabled={phase === "resolved" || ruledOut || busy}
                aria-disabled={ruledOut || undefined}
                onClick={() => void choose(choice)}
                className={`min-h-16 rounded-lg border px-4 py-3 text-lg ${TONE_CLASS[tone]} ${!calm && tone === "answer" && flow.result?.correct ? "deed-sparkle" : ""}`}
              >
                {choice}
                {ruledOut && <span className="sr-only"> (not this one)</span>}
              </button>
            );
          })}
        </div>
        {feedback && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {feedback.heading && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{feedback.heading}</p>}
              <p className="text-sm" role="status">{feedback.text}</p>
            </div>
            {phase === "second-chance" ? (
              <Button variant="link" disabled={busy} onClick={() => void showMe()}>Show me</Button>
            ) : (
              <Button ref={nextRef} aria-label={isLast ? `Finish ${SIDE_QUEST_LOWER}` : "Next question"} disabled={busy} onClick={() => void advance()}>
                {isLast ? `Finish ${SIDE_QUEST_LOWER}` : "Next"}
              </Button>
            )}
          </div>
        )}
      </div>
    </GameFrame>
  );
}
