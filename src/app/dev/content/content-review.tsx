"use client";

/**
 * A grown-up's reading desk for generated questions: pick a grade and a strand, then
 * read every question a child could be handed there, with the answer marked and an
 * independent verifier's verdict beside it. Built for DENSITY — the job is to skim
 * forty questions and notice the one that is wrong — so nothing here is decorated.
 */
import { useMemo, useState } from "react";
import { GRADES, type Grade } from "@/lib/utils/grade-levels";
import { AREA_LABELS, type SkillArea } from "@/lib/utils/skills";
import { sampleGrade, DRAWS_PER_LEVEL, LEVELS, type SampledSkill } from "./sample";

const AREAS = Object.keys(AREA_LABELS) as SkillArea[];

const selectClass =
  "rounded border border-zinc-600 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400";

export function ContentReview() {
  const [grade, setGrade] = useState<Grade>("K");
  const [area, setArea] = useState<SkillArea>("math");

  const sampled = useMemo(() => sampleGrade(area, grade), [area, grade]);

  const totals = sampled.reduce(
    (acc, s) =>
      s.kind === "generator"
        ? {
            questions: acc.questions + s.levels.reduce((n, l) => n + l.questions.length, 0),
            disagreements: acc.disagreements + s.disagreements,
          }
        : acc,
    { questions: 0, disagreements: 0 },
  );

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 text-sm leading-snug text-zinc-100">
      <header className="mb-4">
        <h1 className="text-xl font-semibold">Content review</h1>
        <p className="mt-1 text-xs text-zinc-400">
          Dev only. Every question below shows its answer key, so this page must never be reachable by a
          child. Samples are drawn from a fixed seed, so a reload shows the same questions.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-zinc-700 pb-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-zinc-400">Grade</span>
          <select
            className={selectClass}
            aria-label="Grade"
            value={grade}
            onChange={(e) => setGrade(e.target.value as Grade)}
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {g === "K" ? "K" : `Grade ${g}`}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-zinc-400">Strand</span>
          <select
            className={selectClass}
            aria-label="Strand"
            value={area}
            onChange={(e) => setArea(e.target.value as SkillArea)}
          >
            {AREAS.map((a) => (
              <option key={a} value={a}>
                {AREA_LABELS[a].label}
              </option>
            ))}
          </select>
        </label>
        <p className="ml-auto text-xs text-zinc-400" data-testid="summary">
          {sampled.length} {sampled.length === 1 ? "skill" : "skills"}
          {totals.questions > 0 ? ` · ${totals.questions} questions` : ""}
        </p>
      </div>

      {totals.disagreements > 0 && (
        <p
          data-testid="alarm"
          className="mb-4 rounded border-2 border-red-500 bg-red-950 px-3 py-2 text-sm font-bold text-red-200"
        >
          {totals.disagreements} {totals.disagreements === 1 ? "question has" : "questions have"} an answer
          key the verifier disagrees with. Do not let a child see this grade until it is fixed.
        </p>
      )}

      {sampled.length === 0 && (
        <p className="text-zinc-400">No skills are mapped to this grade in this strand.</p>
      )}

      <div className="space-y-6">
        {sampled.map((s) => (
          <SkillBlock key={s.skill.id} sampled={s} />
        ))}
      </div>
    </main>
  );
}

function SkillBlock({ sampled }: { sampled: SampledSkill }) {
  const { skill } = sampled;
  return (
    <section data-testid="skill" data-skill={skill.id}>
      <h2 className="flex flex-wrap items-baseline gap-2 border-b border-zinc-700 pb-1">
        <span className="font-semibold">{skill.label}</span>
        <code className="text-xs text-zinc-400">{skill.id}</code>
        {sampled.kind === "generator" ? (
          <>
            <code className="text-xs text-zinc-500">generator: {sampled.generatorId}</code>
            <span
              className={
                sampled.disagreements > 0
                  ? "ml-auto rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white"
                  : "ml-auto text-xs text-zinc-500"
              }
            >
              {sampled.disagreements > 0
                ? `${sampled.disagreements} DISAGREE`
                : `${LEVELS.length * DRAWS_PER_LEVEL} verified`}
            </span>
          </>
        ) : (
          <code className="text-xs text-zinc-500">pool: {sampled.poolId}</code>
        )}
      </h2>

      {sampled.kind === "pool" ? (
        <p data-testid="pool-note" className="mt-2 text-zinc-400">
          Authored pools arrive in a later plan. This page does not read the database, so there is
          nothing to check by eye here yet.
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          {sampled.levels.map((l) => (
            <div key={l.level}>
              <h3 className="text-xs uppercase tracking-wide text-zinc-500">Level {l.level}</h3>
              <ul className="mt-1 divide-y divide-zinc-800">
                {l.questions.map((sq, i) => (
                  <QuestionRow key={`${sq.question.id}:${i}`} sampled={sq} skillId={skill.id} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function QuestionRow({
  sampled,
  skillId,
}: {
  sampled: { question: { prompt: string; choices: string[]; answer: string; readAloud?: string }; verdict: { agrees: boolean; detail?: string } };
  skillId: string;
}) {
  const { question, verdict } = sampled;
  return (
    <li data-testid="question" data-skill={skillId} className="py-1">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span data-testid="prompt" className="min-w-0 flex-1 break-words">
          {question.prompt}
        </span>
        <span className="flex flex-wrap gap-1">
          {question.choices.map((choice, i) => {
            /**
             * The marked choice is the one that EQUALS the answer key — never a position.
             * Choices are shuffled, so marking by index would mark the wrong one on most
             * questions while still looking like a working page, which is worse than no
             * page at all: a parent would trust it.
             */
            const isAnswer = choice === question.answer;
            return (
              <span
                key={`${choice}:${i}`}
                data-testid="choice"
                data-answer={isAnswer ? "yes" : undefined}
                className={
                  isAnswer
                    ? "rounded border border-emerald-400 bg-emerald-900/50 px-1.5 py-0.5 font-semibold text-emerald-200"
                    : "rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-400"
                }
              >
                <span data-testid="choice-text">{choice}</span>
                {isAnswer && (
                  <span className="ml-1 text-emerald-300" aria-label="answer">
                    ✓
                  </span>
                )}
              </span>
            );
          })}
        </span>
        {!verdict.agrees && (
          <span
            data-testid="disagreement"
            className="w-full rounded bg-red-600 px-1.5 py-0.5 text-xs font-bold text-white"
          >
            VERIFIER DISAGREES — {verdict.detail}
          </span>
        )}
      </div>
      {question.readAloud && (
        <p className="mt-0.5 text-xs italic text-zinc-500">
          <span className="not-italic">read aloud:</span> {question.readAloud}
        </p>
      )}
    </li>
  );
}
