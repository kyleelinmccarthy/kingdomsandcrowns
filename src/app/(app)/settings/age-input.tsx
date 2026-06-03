"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { GRADE_OPTIONS } from "@/lib/utils/age-mode";

export type AgeMode = "birthYear" | "grade";

/**
 * Lets a parent set a hero's age band by EITHER birth year or school grade.
 * Controlled by the parent form.
 */
export function AgeInput({
  mode,
  onModeChange,
  birthYear,
  onBirthYearChange,
  grade,
  onGradeChange,
  idPrefix = "age",
}: {
  mode: AgeMode;
  onModeChange: (m: AgeMode) => void;
  birthYear: string;
  onBirthYearChange: (v: string) => void;
  grade: string;
  onGradeChange: (v: string) => void;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-xs">Age (choose one)</Label>
      <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
        {(["birthYear", "grade"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className={cn(
              "rounded-md px-3 py-1 transition-colors",
              mode === m
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m === "birthYear" ? "Birth year" : "Grade"}
          </button>
        ))}
      </div>

      {mode === "birthYear" ? (
        <Input
          id={`${idPrefix}-birthYear`}
          type="number"
          value={birthYear}
          onChange={(e) => onBirthYearChange(e.target.value)}
          placeholder="2016"
          min={2000}
          max={new Date().getFullYear()}
        />
      ) : (
        <Select
          id={`${idPrefix}-grade`}
          value={grade}
          onChange={(e) => onGradeChange(e.target.value)}
        >
          <option value="">Select grade…</option>
          {GRADE_OPTIONS.map((g) => (
            <option key={g} value={g}>
              {g === "K" ? "Kindergarten" : `Grade ${g}`}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
