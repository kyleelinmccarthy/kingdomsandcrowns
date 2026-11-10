"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { GameIcon } from "@/components/game-icon";
import { DeedResults } from "@/components/deed-results";
import { SubjectChip } from "@/components/subject-chip";
import { completeDeedRun } from "@/lib/actions/deeds";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { DeedMeter } from "@/components/deed-meter";
import { useDeedFlow } from "@/components/use-deed-flow";
import { attemptFeedback } from "@/lib/realm3d/talk";
import { TaskPresenter } from "@/components/tasks/presenters";
import type { ProfileLike } from "@/lib/utils/deed-engine";
import { canSpeak, speak } from "@/lib/utils/speech";
import { SIDE_QUEST_LOWER } from "@/lib/utils/side-quest-copy";

export function DeedPlayer({
  run,
  profile,
  calm,
  doneLabel,
  onFinished,
}: {
  run: RunStart;
  profile: ProfileLike;
  calm: boolean;
  doneLabel?: string;
  onFinished: (summary: RunSummary) => void;
}) {
  const { flow, meter, nudge, busy, error, setError, guarded, choose, showMe, next } = useDeedFlow(run);
  const { index, phase } = flow;
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const speakable = canSpeak();
  const question = run.questions[index];
  const isLast = index === run.questions.length - 1;

  // Read-aloud is a side effect, not state: the profile asks for it, the effect obeys.
  useEffect(() => {
    if (profile.readAloud && question) speak(question.readAloud ?? question.view.prompt);
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

  // Focus follows the question: the choices take it when one is asked (see `ChoicePresenter`),
  // Next once it is resolved.
  useEffect(() => {
    if (summary) return;
    if (phase === "resolved") nextRef.current?.focus();
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
        <DeedMeter meter={meter} streak={flow.streak} calm={calm} numerals />
        {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error} <Button size="xs" variant="ghost" onClick={() => setError("")}>Try again</Button></div>}
        <div className="flex items-start gap-3">
          <p className="flex-1 text-xl font-medium">{question.view.prompt}</p>
          {speakable && (
            <Button size="sm" variant="outline" aria-label="Read aloud" onClick={() => speak(question.readAloud ?? question.view.prompt)}>
              <GameIcon name="sparkles" className="size-4" />
            </Button>
          )}
        </div>
        <TaskPresenter task={question} flow={flow} variant="page" numerals calm={calm} disabled={busy} nudge={nudge} onRespond={(choice) => void choose(choice)} />
        {feedback && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {feedback.heading && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{feedback.heading}</p>}
              <p className="text-sm" role="status">{feedback.text}</p>
              {flow.result?.rungChange && <p className="text-sm font-semibold text-[var(--gold-bright)]">{flow.result.rungChange}</p>}
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
