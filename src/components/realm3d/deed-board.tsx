"use client";

/**
 * TALKING TO A VILLAGER, AND DOING WHAT THEY ASK. The heart of the game: this is where a child
 * answers the questions that raise their village.
 *
 * It is the flat Realm's `DeedPanel` → `SiteCard` → `DeedPlayer` → `DeedResults`, ported, and
 * the RULES are theirs to the letter: the same `startDeedRun(childId, deedId, "realm")` (so the
 * same deed engine picks the same questions at the child's own level), the same
 * `answerDeedQuestion` after every answer (so mastery moves on every answer, and an abandoned run
 * still taught something), the same `completeDeedRun` (so the building's progress and the mastery
 * summary are the server's), a run left half-way resumes at its first unanswered question within
 * the hour, and read-aloud reads `question.readAloud ?? question.prompt` exactly as `DeedPlayer`
 * does. What is new is the LOOK — the frame's timber and gold — and a conversation in front of
 * the side quests, so a child meets a person, hears what they need, and then chooses what to do.
 *
 * A grown-up visiting reads everything and begins nothing, which is the flat Realm's preview
 * rule; the server refuses a Realm run from anyone but the hero regardless.
 *
 * The result is handed up the moment the server has it (`onResult`), not when the child presses
 * the last button: a child who finishes and then presses Esc has still raised their building,
 * and the frame applies it as the panel closes, so they watch it happen.
 */

import { useEffect, useRef, useState } from "react";
import { VillagerFigure } from "@/components/avatar";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import { completeDeedRun, startDeedRun } from "@/lib/actions/deeds";
import type { RunStart, RunSummary } from "@/lib/utils/deed-run-types";
import { realmCue } from "@/lib/realm3d/sound/store";
import type { BuildingOverview } from "@/lib/services/deeds";
import type { Villager } from "@/lib/realm/villagers";
import { BUILD_FINISH, attemptFeedback, resultBuildingLine, resultHeadline, resultMinutesLine, resultStarsLine, talkCopy, type Viewer } from "@/lib/realm3d/talk";
import { MAX_STARS, type Stars } from "@/lib/utils/deed-scoring";
import { deedErrorLine } from "@/lib/utils/deed-refusals";
import { DeedMeter } from "@/components/deed-meter";
import { TaskPresenter } from "@/components/tasks/presenters";
import { BenchDemo, demoCopy, useBenchDemo } from "@/components/tasks/bench-demo";
import { StarRow } from "@/components/star-row";
import { useDeedFlow } from "@/components/use-deed-flow";
import { AREA_LABELS, type SkillArea } from "@/lib/utils/skills";
import { canSpeak, speak, stopSpeaking, type SpeechToken } from "@/lib/utils/speech";
import { SIDE_QUEST_LOWER, SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";
import { REVIEW_FINISH } from "@/lib/utils/review-copy";
import { Panel, Progress } from "./frame-hud";

type Profile = { readAloud: boolean; untimed: boolean };
/**
 * What the board hands up when a run is finished: the building's new progress and stars, whether
 * the run counted, the side quest's new best and crown, and for a Crown Challenge whether it won.
 * All but the building are optional so a hand-raised building (the dev hook) still fits.
 */
export type DeedResult = NonNullable<RunSummary["building"]> & {
  counted?: boolean;
  deed?: { id: string; bestStars: Stars; crowned?: boolean };
  challenge?: { won: boolean };
  /** Realm minutes the run paid (`RunSummary.minutesEarned`): above 0, the frame re-asks the gate (the quiet world wakes). */
  minutesEarned?: number;
};

const CROWN_CHALLENGE = "Crown Challenge";

/** A subject, as a coloured tag in the frame's own type. */
function Subject({ area }: { area: SkillArea | null }) {
  if (!area) return null;
  const { label, color } = AREA_LABELS[area];
  return (
    <span className="r3-subject" style={{ ["--r3-ink" as string]: color }}>
      <span className="sr-only">Subject: </span>
      {label}
    </span>
  );
}

/** The shared star row in the frame's clothes: the board's list and the result card alike. */
function BoardStars({ stars, small }: { stars: number; small?: boolean }) {
  return <StarRow stars={stars} className={`r3-result-stars${small ? " r3-stars--small" : ""}`} starClass="r3-star" onClass="r3-star--on" />;
}

export function DeedBoard({
  childId,
  villager,
  site,
  viewer,
  heroName,
  waiting,
  numerals,
  profile,
  calm,
  onResult,
  onClose,
  doneLabel,
  runContext = "realm",
}: {
  childId: string | null;
  villager: Villager;
  site: BuildingOverview;
  viewer: Viewer;
  heroName: string;
  /** This is the villager the objective card sent the child to. */
  waiting: boolean;
  numerals: boolean;
  profile: Profile;
  calm: boolean;
  /** The server finished the run: this is the building's new progress. */
  onResult: (buildingId: string, result: DeedResult) => void;
  onClose: () => void;
  /** The result card's way out, where it does not lead into the world (the gate's board). */
  doneLabel?: string;
  /** Where the run is asked from. The gate's board is always multiple choice (R-C4); the world's is the default. */
  runContext?: "realm" | "gate";
}) {
  const [run, setRun] = useState<RunStart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = talkCopy({ villager, site, viewer, heroName, waiting, numerals });
  const canPlay = viewer === "child" && childId !== null;

  // The villager speaks, once, for a child who has read-aloud on: who they are and what they need.
  const spokeFor = useRef<string | null>(null);
  useEffect(() => {
    if (!profile.readAloud || run || spokeFor.current === villager.id) return;
    spokeFor.current = villager.id;
    speak(`${copy.name}. ${copy.says} ${copy.need} ${copy.ask}`);
  }, [profile.readAloud, run, villager.id, copy.name, copy.says, copy.need, copy.ask]);

  async function begin(deedId: string, challenge = false) {
    if (!canPlay || busy) return;
    setBusy(true);
    setError("");
    try {
      setRun(await (challenge ? startDeedRun(childId!, deedId, runContext, { challenge: true }) : startDeedRun(childId!, deedId, runContext)));
    } catch (err) {
      setError(deedErrorLine(err));
    } finally {
      setBusy(false);
    }
  }

  const portrait = (
    <div className="r3-talk-portrait">
      <VillagerFigure villager={villager} size="lg" className="r3-talk-figure" />
    </div>
  );

  if (run) {
    const title = run.kind === "challenge" ? `${CROWN_CHALLENGE}: ${run.deed.title}` : run.deed.title;
    // A build run has no building to raise, so nothing of it ever reaches the raise path.
    const handUp = (done: RunSummary) =>
      done.kind !== "build" && done.building && onResult(site.id, {
        ...done.building, counted: done.counted, minutesEarned: done.minutesEarned, deed: { id: run.deed.id, bestStars: done.deedBest, crowned: done.crowned },
        ...(done.kind === "challenge" ? { challenge: { won: done.flawless } } : {}),
      });
    return (
      <Panel title={title} label={title} wide className="r3-board--deed" icon={<GameIcon name={site.icon as GameIconName} className="r3-board-icon" />} onClose={onClose}>
        <DeedRun run={run} villagerName={villager.name} profile={profile} calm={calm} numerals={numerals} onResult={handUp} onClose={onClose} doneLabel={doneLabel} />
      </Panel>
    );
  }

  return (
    <Panel title={copy.name} label={`${copy.name}, ${copy.role}`} wide className="r3-board--talk" icon={<GameIcon name={site.icon as GameIconName} className="r3-board-icon" />} onClose={onClose}>
      <p className="r3-talk-role">{copy.role}</p>
      <div className="r3-talk">
        {portrait}
        <div className="r3-talk-body">
          <p className="r3-speech">&ldquo;{copy.says}&rdquo;</p>
          <div className="r3-talk-need">
            <Progress
              done={site.done}
              total={site.total}
              numerals={numerals}
              text={`${site.done} of ${site.total}`}
              label={`${site.done} of ${site.total} ${SIDE_QUESTS_LOWER} done.`}
            />
            <span>{copy.need}</span>
          </div>
        </div>
      </div>
      <p className="r3-talk-ask">{copy.ask}</p>
      {error && (
        <p className="r3-board-error" role="alert">
          {error}{" "}
          <button type="button" className="r3-link-button" onClick={() => setError("")}>
            Try again
          </button>
        </p>
      )}
      <ul className="r3-deeds">
        {site.deeds.map((d) => (
          <li key={d.id} className="r3-deed">
            <div className="r3-deed-text">
              <p className="r3-deed-title">
                {d.title} <Subject area={d.area} />
                <BoardStars stars={d.bestStars} small />
                {d.crowned && (
                  <span className="r3-deed-crown">
                    <GameIcon name="crown" className="r3-deed-crown-icon" />
                    <span className="sr-only">Crown earned</span>
                  </span>
                )}
              </p>
              <p className="r3-deed-story">{d.story}</p>
            </div>
            {canPlay && (
              <div className="r3-deed-actions">
                <button type="button" className="r3-menu-item r3-menu-item--go r3-deed-go" aria-label={`Begin ${d.title}`} disabled={busy} onClick={() => void begin(d.id)}>
                  Begin
                </button>
                {d.bestStars === MAX_STARS && (
                  <button type="button" className="r3-menu-item r3-deed-go r3-deed-challenge" aria-label={`Begin the ${CROWN_CHALLENGE} for ${d.title}`} disabled={busy} onClick={() => void begin(d.id, true)}>
                    <GameIcon name="crown" className="r3-menu-icon" /> {CROWN_CHALLENGE}
                  </button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="r3-board-foot">
        <button type="button" className="r3-menu-item" onClick={onClose}>
          Goodbye
        </button>
      </div>
    </Panel>
  );
}

/**
 * One run, question by question. `DeedPlayer`'s rules, in the frame's clothes, plus the number
 * keys: a child at a keyboard can answer with 1 to 4, the way they cast. A wrong pick on a
 * question with room for it gets a hint and a second try (`useDeedFlow`), or "Show me".
 * Exported for the riddle stones' board (`riddle-stone-board.tsx`), which plays a review run here:
 * no villager, no building, its own finish and leave words.
 */
export function DeedRun({
  run,
  villagerName,
  profile,
  calm,
  numerals,
  onResult,
  onClose,
  doneLabel = "Back to the Realm",
}: {
  run: RunStart;
  /** Who is pleased by a right answer; absent (a riddle stone), nobody is named. */
  villagerName?: string;
  profile: Profile;
  calm: boolean;
  numerals: boolean;
  onResult: (done: RunSummary) => void;
  onClose: () => void;
  doneLabel?: string;
}) {
  // A wrong answer is a soft low "hmm", a right one rises and resolves (`realm-sound.tsx`).
  const { flow, meter, nudge, site, busy, error, setError, guarded, choose, showMe, next } = useDeedFlow(run, (r) => realmCue(r.correct ? "deed-right" : "deed-wrong"));
  const { index, phase } = flow;
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const question = run.questions[index];
  const demo = useBenchDemo(run, index);
  const isLast = index === run.questions.length - 1;
  const what = run.kind === "review" ? "review" : run.kind === "build" ? "build" : SIDE_QUEST_LOWER;
  const finishLabel = run.kind === "review" ? REVIEW_FINISH : run.kind === "build" ? BUILD_FINISH : `Finish ${SIDE_QUEST_LOWER}`;
  const nextRef = useRef<HTMLButtonElement>(null);
  const feedback = flow.result ? attemptFeedback(flow.result, flow.ruledOut.length > 0, villagerName, question) : null;

  // Read-aloud, as `DeedPlayer` does it: the profile asks, the effect obeys, and leaving stops it —
  // but only this run's own line. The click that closes the board also says the building is
  // rising, and that must be heard. Aldo's worked example is read first, when there is one.
  const spoken = useRef<SpeechToken | null>(null);
  const say = (text: string) => {
    spoken.current = speak(text);
  };
  useEffect(() => {
    if (profile.readAloud && question) spoken.current = speak(demo.mode ? demoCopy(demo.mode) : (question.readAloud ?? question.prompt));
    return () => stopSpeaking(spoken.current);
  }, [profile.readAloud, question, demo.mode]);

  // The hint is read once, when the second chance opens.
  const hint = phase === "second-chance" ? flow.result?.hint : undefined;
  useEffect(() => {
    if (!profile.readAloud || !hint) return;
    const token = speak(hint);
    return () => stopSpeaking(token);
  }, [profile.readAloud, hint, index]);

  useEffect(() => {
    if (profile.untimed) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [profile.untimed]);

  // Focus follows the question: the choices take it when one is asked (see `ChoicePresenter`),
  // Next once it is resolved.
  useEffect(() => {
    if (summary) return;
    if (phase === "resolved") nextRef.current?.focus();
  }, [phase, index, summary]);

  function advance() {
    if (!isLast) return next();
    return guarded(async () => {
      const done = await completeDeedRun(run.runId);
      setSummary(done);
      onResult(done);
    });
  }

  if (summary) {
    const head = resultHeadline(summary, run.deed.title);
    const stars = resultStarsLine(summary, villagerName);
    const minutesLine = resultMinutesLine(summary);
    return (
      <div className="r3-result">
        <span className={`r3-result-seal${summary.flawless ? " r3-result-seal--flawless" : ""}`}>
          <GameIcon name={summary.flawless ? (summary.kind === "challenge" ? "crown" : "star") : "check"} className="r3-result-icon" />
        </span>
        <h3 className="r3-result-title">{head.title}</h3>
        {(summary.kind === "deed" || summary.kind === "build") && <BoardStars stars={summary.stars} />}
        {stars && <p className="r3-result-stars-line">{stars}</p>}
        {minutesLine && (
          <p className="r3-result-minutes">
            <GameIcon name="hourglass" className="r3-result-building-icon" /> {minutesLine}
          </p>
        )}
        <p className="r3-result-line">
          <Subject area={run.deed.area} /> {head.line}
        </p>
        {summary.masteryChanges.length > 0 && (
          <ul className="r3-result-mastery">
            {summary.masteryChanges.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        )}
        {summary.building && (
          <p className="r3-result-building">
            <GameIcon name="house" className="r3-result-building-icon" /> {resultBuildingLine(summary.building)}
          </p>
        )}
        <div className="r3-board-foot">
          <button type="button" className="r3-menu-item r3-menu-item--go" autoFocus onClick={onClose}>
            <GameIcon name="journey" className="r3-menu-icon" /> {doneLabel}
          </button>
        </div>
      </div>
    );
  }

  const minutes = Math.floor((now - startedAt) / 60_000);

  return (
    <div className="r3-run">
      <p className="r3-run-story">
        <Subject area={run.deed.area} /> {run.deed.story}
      </p>
      <div className="r3-run-meta">
        <span className="r3-run-dots" role="img" aria-label={`Question ${index + 1} of ${run.questions.length}`}>
          {run.questions.map((q, i) => (
            <span key={q.id} className={`r3-run-dot${i < index ? " r3-run-dot--done" : i === index ? " r3-run-dot--now" : ""}`} />
          ))}
        </span>
        {!profile.untimed && <span className="r3-run-time">{minutes} min</span>}
        <button type="button" className="r3-link-button r3-run-leave" onClick={onClose}>
          Leave the {what}
        </button>
      </div>
      <DeedMeter meter={meter} streak={flow.streak} calm={calm} numerals={numerals} />
      {error && (
        <p className="r3-board-error" role="alert">
          {error}{" "}
          <button type="button" className="r3-link-button" onClick={() => setError("")}>
            Try again
          </button>
        </p>
      )}
      {demo.mode ? <BenchDemo mode={demo.mode} calm={calm} onDone={demo.finish} /> : (<>
      <div className="r3-question">
        <p className="r3-question-text">{question.prompt}</p>
        {canSpeak() && (
          <button type="button" className="r3-round r3-read" aria-label="Read aloud" title="Read aloud" onClick={() => say(question.readAloud ?? question.prompt)}>
            <GameIcon name="sparkles" className="r3-read-icon" />
          </button>
        )}
      </div>
      <TaskPresenter task={question} flow={flow} variant="board" numerals={numerals} calm={calm} disabled={busy} nudge={nudge} site={site} onRespond={(encoded) => void choose(encoded)} />
      </>)}
      {feedback && (
        <div className={`r3-feedback${flow.result?.correct ? " r3-feedback--right" : ""}`}>
          <div>
            {feedback.heading && <p className="r3-feedback-heading">{feedback.heading}</p>}
            <p className="r3-feedback-text" role="status">
              {feedback.text}
            </p>
            {flow.result?.rungChange && <p className="r3-feedback-rung">{flow.result.rungChange}</p>}
          </div>
          {phase === "second-chance" ? (
            <button type="button" className="r3-link-button r3-show-me" disabled={busy} onClick={() => void showMe()}>
              Show me
            </button>
          ) : (
            <button
              ref={nextRef}
              type="button"
              className="r3-menu-item r3-menu-item--go"
              aria-label={isLast ? finishLabel : "Next question"}
              disabled={busy}
              onClick={() => void advance()}
            >
              {isLast ? finishLabel : "Next"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
