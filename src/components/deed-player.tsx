"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { DeedResults } from "@/components/deed-results";
import { answerDeedQuestion, completeDeedRun, type RunStart, type RunSummary } from "@/lib/actions/deeds";
import type { ProfileLike } from "@/lib/utils/deed-engine";
import { canSpeak, speak } from "@/lib/utils/speech";

type Feedback = { correct: boolean; answer: string };

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
  // A resumed run continues at the first unanswered question rather than replaying
  // from the start; a run with nothing left unanswered opens on the last question.
  const [index, setIndex] = useState(() => {
    const firstUnanswered = run.responses.findIndex((r) => r === null);
    return firstUnanswered === -1 ? run.questions.length - 1 : firstUnanswered;
  });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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

  async function choose(choice: string) {
    if (feedback || busy) return;
    setBusy(true);
    setError("");
    try {
      setFeedback(await answerDeedQuestion(run.runId, index, choice));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  async function next() {
    if (!isLast) {
      setIndex(index + 1);
      setFeedback(null);
      return;
    }
    setBusy(true);
    setError("");
    try {
      setSummary(await completeDeedRun(run.runId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed.");
    } finally {
      setBusy(false);
    }
  }

  if (summary) {
    return (
      <GameFrame title={run.deed.title} icon={<GameIcon name="map" className="size-4 text-[var(--gold-bright)]" />}>
        <DeedResults summary={summary} deedTitle={run.deed.title} doneLabel={doneLabel} onDone={() => onFinished(summary)} />
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
        <p className="text-sm text-muted-foreground">{run.deed.story}</p>
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
          {question.choices.map((choice) => {
            const isAnswer = feedback?.answer === choice;
            const tone = feedback ? (isAnswer ? "border-[var(--gold-border)] bg-muted/40" : "opacity-60") : "border-gold-dim bg-muted/20";
            return (
              <button
                key={choice}
                type="button"
                disabled={!!feedback || busy}
                onClick={() => choose(choice)}
                className={`min-h-16 rounded-lg border px-4 py-3 text-lg ${tone} ${!calm && isAnswer && feedback?.correct ? "deed-sparkle" : ""}`}
              >
                {choice}
              </button>
            );
          })}
        </div>
        {feedback && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">{feedback.correct ? "That's it!" : `Not quite. The answer was ${feedback.answer}.`}</p>
            <Button aria-label={isLast ? "Finish deed" : "Next question"} disabled={busy} onClick={next}>
              {isLast ? "Finish deed" : "Next"}
            </Button>
          </div>
        )}
      </div>
    </GameFrame>
  );
}
