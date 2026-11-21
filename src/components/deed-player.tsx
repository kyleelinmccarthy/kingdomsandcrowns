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
import { ALL_ANSWERED } from "@/lib/utils/deed-run-flow";
import { attemptFeedback, finishLabel } from "@/lib/realm3d/talk";
import { TaskPresenter } from "@/components/tasks/presenters";
import { TaskDemo, taskDemoCopy, useTaskDemo } from "@/components/tasks/task-demo";
import { attemptSpeech, autoSpeaks } from "@/lib/tasks/narration";
import type { ProfileLike } from "@/lib/utils/deed-engine";
import { canSpeak, speak } from "@/lib/utils/speech";

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
  const { flow, meter, nudge, site, busy, error, setError, guarded, choose, showMe, next } = useDeedFlow(run);
  const { index, phase } = flow;
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const speakable = canSpeak();
  const demo = useTaskDemo(run, index);
  const question = run.questions[index];
  const isLast = index === run.questions.length - 1;
  const finish = finishLabel(run.kind);

  // Read-aloud is a side effect, not state: the profile asks for it (or, for a Kindergarten hero's
  // clue, the run, and for a rune dictation the task: `autoSpeaks`, R-H17, R-I18), the effect obeys.
  // A worked example (Aldo's or Pip's) is read first, when there is one, then the question.
  const speaks = question ? autoSpeaks(question, profile.readAloud, run.narrateClues === true) : false;
  useEffect(() => {
    if (speaks && question) speak(demo.demo ? taskDemoCopy(demo.demo) : (question.readAloud ?? question.prompt));
    return () => {
      if (canSpeak()) window.speechSynthesis.cancel();
    };
  }, [speaks, question, demo.demo]);

  // A soft elapsed-time chip when the hero hasn't asked for untimed play.
  useEffect(() => {
    if (profile.untimed) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [profile.untimed]);

  const nextRef = useRef<HTMLButtonElement>(null);
  const feedback = flow.result ? attemptFeedback(flow.result, flow.ruledOut.length > 0, undefined, question) : null;

  // What follows an answer is read once, as on the Realm's board: the hint when the second chance
  // opens, and for a clue its whole line, "Not here." and the redirect, then where it was after a
  // miss (`attemptSpeech`, F-3).
  const said = speaks ? attemptSpeech(question, flow, feedback?.text) : undefined;
  useEffect(() => {
    if (!said) return;
    speak(said);
    return () => {
      if (canSpeak()) window.speechSynthesis.cancel();
    };
  }, [said, index]);

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
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{run.deed.area && <SubjectChip area={run.deed.area} />} {run.deed.story}</p>
        <div className="flex items-center gap-1" aria-label={`Question ${index + 1} of ${run.questions.length}`} role="img">
          {run.questions.map((q, i) => (
            <span key={q.id} className={`size-2 rounded-full ${i < index ? "bg-[var(--gold-bright)]" : i === index ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <DeedMeter meter={meter} streak={flow.streak} calm={calm} numerals />
        {error && <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error} <Button size="xs" variant="ghost" onClick={() => setError("")}>Try again</Button></div>}
        {demo.demo ? <TaskDemo demo={demo.demo} variant="page" calm={calm} onDone={demo.finish} /> : (<>
        <div className="flex items-start gap-3">
          <p className="flex-1 text-xl font-medium">{question.prompt}</p>
          {/* A rune's one read control is the stone's own (RI-a / S4). */}
          {speakable && question.kind !== "rune" && (
            <Button size="sm" variant="outline" aria-label="Read aloud" onClick={() => speak(question.readAloud ?? question.prompt)}>
              <GameIcon name="sparkles" className="size-4" />
            </Button>
          )}
        </div>
        <TaskPresenter task={question} flow={flow} variant="page" numerals calm={calm} readAloud={profile.readAloud} disabled={busy} nudge={nudge} site={site} onRespond={(encoded) => void choose(encoded)} />
        </>)}
        {/* A resolved question with no result is a run picked back up with every answer in: its finish step. */}
        {(feedback || phase === "resolved") && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              {feedback?.heading && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{feedback.heading}</p>}
              <p className="text-sm" role="status">{feedback ? feedback.text : ALL_ANSWERED}</p>
              {flow.result?.rungChange && <p className="text-sm font-semibold text-[var(--gold-bright)]">{flow.result.rungChange}</p>}
            </div>
            {phase === "second-chance" ? (
              <Button variant="link" disabled={busy} onClick={() => void showMe()}>Show me</Button>
            ) : (
              <Button ref={nextRef} aria-label={isLast ? finish : "Next question"} disabled={busy} onClick={() => void advance()}>
                {isLast ? finish : "Next"}
              </Button>
            )}
          </div>
        )}
      </div>
    </GameFrame>
  );
}
