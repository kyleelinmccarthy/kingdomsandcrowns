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
import { answerDeedQuestion, completeDeedRun, startDeedRun, type RunStart, type RunSummary } from "@/lib/actions/deeds";
import { realmCue } from "@/lib/realm3d/sound/store";
import type { BuildingOverview } from "@/lib/services/deeds";
import type { Villager } from "@/lib/realm/villagers";
import { resultBuildingLine, resultHeadline, talkCopy, type Viewer } from "@/lib/realm3d/talk";
import { AREA_LABELS, type SkillArea } from "@/lib/utils/skills";
import { canSpeak, speak } from "@/lib/utils/speech";
import { SIDE_QUEST_LOWER, SIDE_QUESTS_LOWER } from "@/lib/utils/side-quest-copy";
import { Panel, Progress } from "./frame-hud";

type Profile = { readAloud: boolean; untimed: boolean };
export type DeedResult = RunSummary["building"];

const FAILED = "The enchantment failed.";

/** A subject, as a coloured tag in the frame's own type. */
function Subject({ area }: { area: SkillArea }) {
  const { label, color } = AREA_LABELS[area];
  return (
    <span className="r3-subject" style={{ ["--r3-ink" as string]: color }}>
      <span className="sr-only">Subject: </span>
      {label}
    </span>
  );
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

  async function begin(deedId: string) {
    if (!canPlay || busy) return;
    setBusy(true);
    setError("");
    try {
      setRun(await startDeedRun(childId!, deedId, "realm"));
    } catch (err) {
      setError(err instanceof Error ? err.message : FAILED);
    } finally {
      setBusy(false);
    }
  }

  const portrait = (
    <div className="r3-talk-portrait">
      <VillagerFigure villager={villager} size="lg" className="r3-talk-figure" />
    </div>
  );

  if (run && childId) {
    return (
      <Panel title={run.deed.title} label={run.deed.title} wide className="r3-board--deed" icon={<GameIcon name={site.icon as GameIconName} className="r3-board-icon" />} onClose={onClose}>
        <DeedRun childId={childId} run={run} villagerName={villager.name} profile={profile} calm={calm} onResult={(b) => onResult(site.id, b)} onClose={onClose} />
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
              </p>
              <p className="r3-deed-story">{d.story}</p>
            </div>
            {canPlay && (
              <button type="button" className="r3-menu-item r3-menu-item--go r3-deed-go" aria-label={`Begin ${d.title}`} disabled={busy} onClick={() => void begin(d.id)}>
                Begin
              </button>
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

type Feedback = { correct: boolean; answer: string };

/**
 * One run, question by question. `DeedPlayer`'s rules, in the frame's clothes, plus the number
 * keys: a child at a keyboard can answer with 1 to 4, the way they cast.
 */
function DeedRun({
  childId,
  run,
  villagerName,
  profile,
  calm,
  onResult,
  onClose,
}: {
  childId: string;
  run: RunStart;
  villagerName: string;
  profile: Profile;
  calm: boolean;
  onResult: (b: DeedResult) => void;
  onClose: () => void;
}) {
  // A resumed run continues at the first unanswered question; one with nothing unanswered opens
  // on the last. Exactly `DeedPlayer`'s rule.
  const [index, setIndex] = useState(() => {
    const first = run.responses.findIndex((r) => r === null);
    return first === -1 ? run.questions.length - 1 : first;
  });
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<RunSummary | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const question = run.questions[index];
  const isLast = index === run.questions.length - 1;
  const nextRef = useRef<HTMLButtonElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  void childId;

  // Read-aloud, as `DeedPlayer` does it: the profile asks, the effect obeys, and leaving stops it.
  useEffect(() => {
    if (profile.readAloud && question) speak(question.readAloud ?? question.prompt);
    return () => {
      if (canSpeak()) window.speechSynthesis.cancel();
    };
  }, [profile.readAloud, question]);

  useEffect(() => {
    if (profile.untimed) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [profile.untimed]);

  // Focus follows the question: the first choice when one is asked, Next once it is answered.
  useEffect(() => {
    if (summary) return;
    (feedback ? nextRef.current : firstChoice.current)?.focus();
  }, [feedback, index, summary]);

  async function choose(choice: string) {
    if (feedback || busy) return;
    setBusy(true);
    setError("");
    try {
      const answer = await answerDeedQuestion(run.runId, index, choice);
      setFeedback(answer);
      // A right answer rises and resolves; a wrong one is a soft low "hmm" (`realm-sound.tsx`).
      realmCue(answer.correct ? "deed-right" : "deed-wrong");
    } catch (err) {
      setError(err instanceof Error ? err.message : FAILED);
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
      const done = await completeDeedRun(run.runId);
      setSummary(done);
      onResult(done.building);
    } catch (err) {
      setError(err instanceof Error ? err.message : FAILED);
    } finally {
      setBusy(false);
    }
  }

  // The number row answers. Enter and Space belong to whichever button has focus.
  const chooseRef = useRef(choose);
  useEffect(() => {
    chooseRef.current = choose;
  });
  useEffect(() => {
    if (summary) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (!e.code.startsWith("Digit")) return;
      const n = Number(e.code.slice(5));
      const choice = question?.choices[n - 1];
      if (!choice) return;
      e.preventDefault();
      void chooseRef.current(choice);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question, summary]);

  if (summary) {
    const head = resultHeadline(summary, run.deed.title);
    return (
      <div className="r3-result">
        <span className={`r3-result-seal${summary.flawless ? " r3-result-seal--flawless" : ""}`}>
          <GameIcon name={summary.flawless ? "star" : "check"} className="r3-result-icon" />
        </span>
        <h3 className="r3-result-title">{head.title}</h3>
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
        <p className="r3-result-building">
          <GameIcon name="house" className="r3-result-building-icon" /> {resultBuildingLine(summary.building)}
        </p>
        <div className="r3-board-foot">
          <button type="button" className="r3-menu-item r3-menu-item--go" autoFocus onClick={onClose}>
            <GameIcon name="journey" className="r3-menu-icon" /> Back to the Realm
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
          Leave the {SIDE_QUEST_LOWER}
        </button>
      </div>
      {error && (
        <p className="r3-board-error" role="alert">
          {error}{" "}
          <button type="button" className="r3-link-button" onClick={() => setError("")}>
            Try again
          </button>
        </p>
      )}
      <div className="r3-question">
        <p className="r3-question-text">{question.prompt}</p>
        {canSpeak() && (
          <button type="button" className="r3-round r3-read" aria-label="Read aloud" title="Read aloud" onClick={() => speak(question.readAloud ?? question.prompt)}>
            <GameIcon name="sparkles" className="r3-read-icon" />
          </button>
        )}
      </div>
      <div className="r3-choices">
        {question.choices.map((choice, i) => {
          const isAnswer = feedback?.answer === choice;
          const tone = feedback ? (isAnswer ? " r3-choice--answer" : " r3-choice--faded") : "";
          const sparkle = !calm && isAnswer && feedback?.correct ? " r3-choice--sparkle" : "";
          return (
            <button
              key={choice}
              ref={i === 0 ? firstChoice : undefined}
              type="button"
              className={`r3-choice${tone}${sparkle}`}
              disabled={!!feedback || busy}
              onClick={() => void choose(choice)}
            >
              <span className="r3-choice-key" aria-hidden="true">
                {i + 1}
              </span>
              <span className="r3-choice-text">{choice}</span>
            </button>
          );
        })}
      </div>
      {feedback && (
        <div className={`r3-feedback${feedback.correct ? " r3-feedback--right" : ""}`}>
          <p className="r3-feedback-text" role="status">
            {feedback.correct ? `That's it! ${villagerName} is pleased.` : `Not quite. The answer was ${feedback.answer}.`}
          </p>
          <button
            ref={nextRef}
            type="button"
            className="r3-menu-item r3-menu-item--go"
            aria-label={isLast ? `Finish ${SIDE_QUEST_LOWER}` : "Next question"}
            disabled={busy}
            onClick={() => void next()}
          >
            {isLast ? `Finish ${SIDE_QUEST_LOWER}` : "Next"}
          </button>
        </div>
      )}
    </div>
  );
}
