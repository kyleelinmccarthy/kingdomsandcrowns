"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { GameFrame } from "@/components/game-frame";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar } from "@/components/avatar";
import { AvatarCustomizer } from "@/components/avatar-customizer";
import { FamilySetup } from "./family-setup";
import { ChildLoginAccess } from "./child-login-access";
import { SendHeroEmailButton } from "./send-hero-email";
import { AgeInput, type AgeMode } from "./age-input";
import { GameIcon } from "@/components/game-icon";
import {
  createChild,
  updateChild,
  banishChild,
  restoreChild,
  deleteChild,
} from "@/lib/actions/children";
import {
  setChildEmail,
  setChildAuthMethod,
  recordChildConsent,
  sendChildQuestInvite,
} from "@/lib/actions/child-auth";
import { createSubject, updateSubject, deleteSubject, reorderSubjects } from "@/lib/actions/subjects";
import { toggleLeaderboardVisibility } from "@/lib/actions/leaderboard";
import { setScheduleSelfManage } from "@/lib/actions/student-schedule";
import { setSkipQuestsEnabled } from "@/lib/actions/quest-assignments";
import { setSchoolingMode, setSchoolingModeOverride } from "@/lib/actions/schooling-mode";
import { parseSchoolingModeOverrides, type SchoolingMode } from "@/lib/utils/schooling-mode";
import { DAYS_OF_WEEK, DAY_LABELS, type DayOfWeek } from "@/lib/utils/schedule-days";
import type { AvatarConfig } from "@/lib/utils/avatar-catalog";

type Family = {
  id: string;
  familyName: string;
  timezone: string;
};

type Subject = {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  isRequired: boolean;
  isActive: boolean;
};

export type BanishedHero = {
  id: string;
  displayName: string;
  avatarConfig: string | null;
  /** ISO timestamp of the banishment. */
  banishedAt: string | null;
};

type Child = {
  id: string;
  displayName: string;
  birthYear: number | null;
  grade?: string | null;
  ageMode: string;
  avatarConfig: string | null;
  currentXp: number;
  currentStreak: number;
  showOnLeaderboard: boolean;
  scheduleSelfManageEnabled?: boolean;
  skipQuestsEnabled?: boolean;
  schoolingMode?: string;
  schoolingModeOverrides?: string | null;
  email?: string | null;
  pinEnabled?: boolean;
  hasPin?: boolean;
  emailLoginEnabled?: boolean;
  googleLoginEnabled?: boolean;
  authUserId?: string | null;
  subjects: Subject[];
  earnedBadgeIds?: string[];
  questUnlockedItems?: string[];
};

const SUBJECT_COLORS = [
  { label: "Crimson", value: "#ef4444" },
  { label: "Sapphire", value: "#3b82f6" },
  { label: "Emerald", value: "#22c55e" },
  { label: "Gold", value: "#f59e0b" },
  { label: "Amethyst", value: "#a855f7" },
  { label: "Rose", value: "#ec4899" },
  { label: "Jade", value: "#14b8a6" },
  { label: "Amber", value: "#f97316" },
  { label: "Iron", value: "#6b7280" },
  { label: "Turquoise", value: "#0891b2" },
  { label: "Bronze", value: "#92400e" },
  { label: "Navy", value: "#1e3a8a" },
  { label: "Lime", value: "#84cc16" },
  { label: "Coral", value: "#fb7185" },
  { label: "Obsidian", value: "#27272a" },
];

export function ChildList({
  family,
  kids,
  banished = [],
  isChildView = false,
  currentChildId = null,
}: {
  family: Family;
  kids: Child[];
  banished?: BanishedHero[];
  isChildView?: boolean;
  currentChildId?: string | null;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(
    isChildView && currentChildId ? currentChildId : null
  );
  const expandedChild = kids.find((c) => c.id === expandedId) ?? null;

  // Children only see their own hero
  const visibleChildren = isChildView && currentChildId
    ? kids.filter((c) => c.id === currentChildId)
    : kids;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <FamilySetup family={family} isChildView={isChildView} />

        <GameFrame
          title="Heroes"
          icon={<GameIcon name="swords" className="size-4 text-[var(--gold-bright)]" />}
          action={!isChildView ? <Button size="sm" onClick={() => setShowAdd(true)}>Recruit Hero</Button> : undefined}
        >
          {visibleChildren.length === 0 ? (
            <p className="text-sm text-muted-foreground">No heroes have sworn allegiance yet. Recruit your first champion to begin!</p>
          ) : (
            <div className="space-y-3">
              {visibleChildren.map((child) => (
                <ChildSummaryCard
                  key={child.id}
                  child={child}
                  expanded={expandedId === child.id}
                  isChildView={isChildView}
                  onToggle={() => setExpandedId(expandedId === child.id ? null : child.id)}
                />
              ))}
            </div>
          )}

          {!isChildView && <AddChildDialog open={showAdd} onClose={() => setShowAdd(false)} />}
        </GameFrame>
      </div>

      {expandedChild && (
        <ChildDetail child={expandedChild} isChildView={isChildView} />
      )}

      {!isChildView && banished.length > 0 && <BanishedHeroes heroes={banished} />}
    </>
  );
}

/**
 * Recovery for banished heroes. A banishment is a soft delete, so everything
 * they earned is still here — a parent can summon them back at any time, or
 * choose to erase them for good.
 */
function BanishedHeroes({ heroes }: { heroes: BanishedHero[] }) {
  return (
    <GameFrame
      title="Banished Heroes"
      icon={<GameIcon name="door" className="size-4 text-[var(--gold-bright)]" />}
    >
      <p className="mb-3 text-sm text-muted-foreground">
        These heroes have left the realm. Their quests, chronicles, and treasures are
        kept safe — summon them back whenever you like.
      </p>
      <div className="space-y-3">
        {heroes.map((hero) => (
          <BanishedHeroRow key={hero.id} hero={hero} />
        ))}
      </div>
    </GameFrame>
  );
}

function BanishedHeroRow({ hero }: { hero: BanishedHero }) {
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);
  const [confirmErase, setConfirmErase] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [error, setError] = useState("");

  const busy = restoring || erasing;

  async function handleRestore() {
    setRestoring(true);
    setError("");
    try {
      await restoreChild(hero.id);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not summon this hero back.");
    } finally {
      setRestoring(false);
    }
  }

  async function handleErase() {
    setErasing(true);
    setError("");
    try {
      await deleteChild(hero.id);
      setConfirmErase(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove this hero.");
    } finally {
      setErasing(false);
    }
  }

  return (
    <div className="rounded-lg border border-gold-dim bg-secondary/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 opacity-70">
          <Avatar
            config={hero.avatarConfig ? JSON.parse(hero.avatarConfig) as AvatarConfig : null}
            name={hero.displayName}
            size="sm"
          />
          <div>
            <p className="font-medium">{hero.displayName}</p>
            <p className="text-sm text-muted-foreground">
              Banished{hero.banishedAt ? ` ${formatBanishDate(hero.banishedAt)}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleRestore} disabled={busy}>
            {restoring ? "Summoning..." : "Summon Back"}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              setTypedName("");
              setError("");
              setConfirmErase(true);
            }}
            disabled={busy}
          >
            Erase Forever
          </Button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <Dialog open={confirmErase} onClose={() => !erasing && setConfirmErase(false)}>
        <DialogHeader>
          <DialogTitle>Erase {hero.displayName} forever?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            This permanently deletes {hero.displayName} along with every quest, chronicle,
            trophy, and log they earned. It cannot be undone.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor={`erase-${hero.id}`}>
              Type <span className="font-semibold text-foreground">{hero.displayName}</span> to confirm
            </Label>
            <Input
              id={`erase-${hero.id}`}
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              autoComplete="off"
            />
          </div>
          {error && <p className="text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmErase(false)} disabled={erasing}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleErase}
            disabled={erasing || typedName.trim() !== hero.displayName}
          >
            {erasing ? "Erasing..." : "Erase Forever"}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function formatBanishDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ChildSummaryCard({
  child,
  expanded,
  isChildView = false,
  onToggle,
}: {
  child: Child;
  expanded: boolean;
  isChildView?: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-lg border bg-secondary/50 transition-colors cursor-pointer ${
        expanded ? "border-[var(--gold-border)]" : "border-gold-dim hover:border-[var(--gold-border)]"
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between gap-2 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar
            config={child.avatarConfig ? JSON.parse(child.avatarConfig) as AvatarConfig : null}
            name={child.displayName}
            size="sm"
          />
          <div className="min-w-0">
            <p className="font-medium">{child.displayName}</p>
            <p className="text-sm text-muted-foreground">
              {child.ageMode} &middot;{" "}
              {child.grade
                ? `Grade ${child.grade}`
                : child.birthYear
                  ? `Born ${child.birthYear}`
                  : "Age not set"}{" "}
              &middot; {child.subjects.length} disciplines
            </p>
          </div>
        </div>
        <svg
          className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {!isChildView && (
        <div className="border-t border-gold-dim px-3 py-2">
          <SendHeroEmailButton child={child} compact />
        </div>
      )}
    </div>
  );
}

function ChildDetail({ child, isChildView = false }: { child: Child; isChildView?: boolean }) {
  const router = useRouter();
  const [confirmBanish, setConfirmBanish] = useState(false);
  const [banishing, setBanishing] = useState(false);
  const [banishError, setBanishError] = useState("");

  async function handleBanish() {
    setBanishing(true);
    setBanishError("");
    try {
      await banishChild(child.id);
      setConfirmBanish(false);
      router.refresh();
    } catch (e) {
      setBanishError(e instanceof Error ? e.message : "Could not banish this hero.");
    } finally {
      setBanishing(false);
    }
  }

  return (
    <GameFrame title={`${child.displayName}'s Chronicle`} icon={<GameIcon name="book" className="size-4 text-[var(--gold-bright)]" />}>
      <div className="space-y-6">
        {!isChildView && (
          <div className="rounded-lg border border-gold-dim bg-muted/20 p-3">
            <SendHeroEmailButton child={child} />
          </div>
        )}
        <AvatarSection child={child} />
        {!isChildView && <ChildInfoEditor child={child} />}
        {!isChildView && <SubjectManager childId={child.id} subjects={child.subjects} />}
        {!isChildView && <ChildLoginAccess child={child} />}
        {!isChildView && (
          <LeaderboardToggle childId={child.id} enabled={child.showOnLeaderboard} />
        )}
        {!isChildView && (
          <ScheduleSelfManageToggle
            childId={child.id}
            enabled={child.scheduleSelfManageEnabled ?? false}
          />
        )}
        {!isChildView && (
          <SkipQuestsToggle
            childId={child.id}
            enabled={child.skipQuestsEnabled ?? false}
          />
        )}
        {!isChildView && (
          <SchoolingModeSettings
            childId={child.id}
            mode={(child.schoolingMode as SchoolingMode) ?? "unstructured"}
            overridesJson={child.schoolingModeOverrides ?? null}
          />
        )}
        {!isChildView && (
          <div className="border-t pt-4">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                setBanishError("");
                setConfirmBanish(true);
              }}
              disabled={banishing}
            >
              {banishing ? "Banishing..." : "Banish Hero"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Banishing hides this hero from the realm. Nothing is deleted — you can
              summon them back from Banished Heroes.
            </p>
          </div>
        )}
      </div>

      <Dialog open={confirmBanish} onClose={() => !banishing && setConfirmBanish(false)}>
        <DialogHeader>
          <DialogTitle>Banish {child.displayName}?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            {child.displayName} will vanish from the realm — no quests, no logins, no
            leaderboards.
          </p>
          <p>
            Nothing is deleted. Their chronicles, trophies, and treasures are kept safe,
            and you can summon them back from{" "}
            <span className="font-semibold text-foreground">Banished Heroes</span> at any
            time.
          </p>
          {banishError && <p className="text-destructive">{banishError}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setConfirmBanish(false)} disabled={banishing}>
            Keep Hero
          </Button>
          <Button variant="destructive" onClick={handleBanish} disabled={banishing}>
            {banishing ? "Banishing..." : "Banish Hero"}
          </Button>
        </DialogFooter>
      </Dialog>
    </GameFrame>
  );
}

function ChildInfoEditor({ child }: { child: Child }) {
  const router = useRouter();
  const [name, setName] = useState(child.displayName);
  const [ageMode, setAgeMode] = useState<AgeMode>(child.grade ? "grade" : "birthYear");
  const [birthYear, setBirthYear] = useState(child.birthYear?.toString() ?? "");
  const [grade, setGrade] = useState(child.grade ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const ageChanged =
    ageMode === "grade"
      ? grade !== (child.grade ?? "")
      : birthYear !== (child.birthYear?.toString() ?? "");
  const hasChanges = name !== child.displayName || ageChanged;

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await updateChild(child.id, {
        displayName: name !== child.displayName ? name : undefined,
        birthYear:
          ageMode === "birthYear" && ageChanged && birthYear ? parseInt(birthYear) : undefined,
        grade: ageMode === "grade" && ageChanged && grade ? grade : undefined,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The enchantment failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Hero Details</h4>
      {error && (
        <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`name-${child.id}`} className="text-xs">Hero Name</Label>
          <Input
            id={`name-${child.id}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <AgeInput
          idPrefix={`age-${child.id}`}
          mode={ageMode}
          onModeChange={setAgeMode}
          birthYear={birthYear}
          onBirthYearChange={setBirthYear}
          grade={grade}
          onGradeChange={setGrade}
        />
      </div>
      {hasChanges && (
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      )}
    </div>
  );
}

function SubjectManager({ childId, subjects }: { childId: string; subjects: Subject[] }) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6b7280");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");
  const [orderedSubjects, setOrderedSubjects] = useState(subjects);
  const [reorderError, setReorderError] = useState("");

  useEffect(() => {
    setOrderedSubjects(subjects);
  }, [subjects]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function handleAddSubject(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await createSubject(childId, { name: newName, color: newColor });
      setNewName("");
      setNewColor("#6b7280");
      setShowAdd(false);
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  async function handleUpdateSubject(subjectId: string) {
    await updateSubject(subjectId, {
      name: editName || undefined,
      color: editColor || undefined,
    });
    setEditingId(null);
    router.refresh();
  }

  async function handleRemoveSubject(subjectId: string) {
    await deleteSubject(subjectId);
    router.refresh();
  }

  function startEdit(subject: Subject) {
    setEditingId(subject.id);
    setEditName(subject.name);
    setEditColor(subject.color ?? "#6b7280");
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedSubjects.findIndex((s) => s.id === active.id);
    const newIndex = orderedSubjects.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(orderedSubjects, oldIndex, newIndex);
    setOrderedSubjects(reordered);
    setReorderError("");
    try {
      await reorderSubjects(childId, reordered.map((s) => s.id));
      router.refresh();
    } catch (err) {
      setOrderedSubjects(subjects);
      setReorderError(err instanceof Error ? err.message : "Could not reorder disciplines");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">Disciplines &amp; Studies</h4>
        <Button size="xs" variant="outline" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Withdraw" : "+ Add Discipline"}
        </Button>
      </div>

      {showAdd && (
        <form onSubmit={handleAddSubject} className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3 sm:flex-row sm:items-end sm:gap-2">
          <div className="min-w-0 grow space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Mathematics"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Color</Label>
            <div className="flex max-w-48 flex-wrap gap-1">
              {SUBJECT_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setNewColor(c.value)}
                  className="size-6 rounded-full border-2 transition-transform"
                  style={{
                    backgroundColor: c.value,
                    borderColor: newColor === c.value ? "var(--color-foreground)" : "transparent",
                    transform: newColor === c.value ? "scale(1.2)" : "scale(1)",
                  }}
                  title={c.label}
                />
              ))}
            </div>
          </div>
          <Button size="sm" type="submit" disabled={adding} className="self-start sm:self-auto">
            {adding ? "..." : "Add"}
          </Button>
        </form>
      )}

      {reorderError && (
        <div className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{reorderError}</div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={orderedSubjects.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {orderedSubjects.map((subject) => (
              <SortableSubjectRow
                key={subject.id}
                subject={subject}
                editing={editingId === subject.id}
                editName={editName}
                editColor={editColor}
                onEditNameChange={setEditName}
                onEditColorChange={setEditColor}
                onStartEdit={() => startEdit(subject)}
                onCancelEdit={() => setEditingId(null)}
                onSaveEdit={() => handleUpdateSubject(subject.id)}
                onRemove={() => handleRemoveSubject(subject.id)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SortableSubjectRow({
  subject,
  editing,
  editName,
  editColor,
  onEditNameChange,
  onEditColorChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRemove,
}: {
  subject: Subject;
  editing: boolean;
  editName: string;
  editColor: string;
  onEditNameChange: (value: string) => void;
  onEditColorChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: subject.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Reorder ${subject.name}`}
        {...attributes}
        {...listeners}
      >
        <svg width="12" height="16" viewBox="0 0 12 16" fill="none" aria-hidden="true">
          <circle cx="3" cy="3" r="1.3" fill="currentColor" />
          <circle cx="9" cy="3" r="1.3" fill="currentColor" />
          <circle cx="3" cy="8" r="1.3" fill="currentColor" />
          <circle cx="9" cy="8" r="1.3" fill="currentColor" />
          <circle cx="3" cy="13" r="1.3" fill="currentColor" />
          <circle cx="9" cy="13" r="1.3" fill="currentColor" />
        </svg>
      </button>
      {editing ? (
        <>
          <div
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: editColor }}
          />
          <Input
            value={editName}
            onChange={(e) => onEditNameChange(e.target.value)}
            className="h-7 text-sm"
          />
          <div className="flex flex-wrap gap-1 max-w-32">
            {SUBJECT_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => onEditColorChange(c.value)}
                className="size-4 rounded-full border"
                style={{
                  backgroundColor: c.value,
                  borderColor: editColor === c.value ? "var(--color-foreground)" : "transparent",
                }}
              />
            ))}
          </div>
          <Button size="xs" onClick={onSaveEdit}>Save</Button>
          <Button size="xs" variant="ghost" onClick={onCancelEdit}>Withdraw</Button>
        </>
      ) : (
        <>
          <div
            className="size-3 shrink-0 rounded-full"
            style={{ backgroundColor: subject.color ?? "#6b7280" }}
          />
          <span className="flex-1 text-sm">{subject.name}</span>
          {subject.isRequired && (
            <span className="text-xs text-muted-foreground">sacred</span>
          )}
          <Button size="xs" variant="ghost" onClick={onStartEdit}>Edit</Button>
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            ×
          </Button>
        </>
      )}
    </div>
  );
}

function AvatarSection({ child }: { child: Child }) {
  const [showCustomizer, setShowCustomizer] = useState(false);
  const level = Math.floor(child.currentXp / 100) + 1;
  const config = child.avatarConfig ? (JSON.parse(child.avatarConfig) as AvatarConfig) : null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Hero Look</h4>
      <div className="flex items-center gap-4">
        <button
          type="button"
          className="cursor-pointer rounded-lg transition-transform hover:scale-105 active:scale-95"
          onClick={() => setShowCustomizer(true)}
          aria-label="Customize hero look"
        >
          <Avatar config={config} name={child.displayName} size="lg" />
        </button>
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {config ? "Tap the avatar or button below to change your hero's look." : "No hero look created yet."}
          </p>
          <Button size="sm" onClick={() => setShowCustomizer(true)}>
            {config ? "Customize Hero" : "Create Hero Look"}
          </Button>
        </div>
      </div>
      <AvatarCustomizer
        childId={child.id}
        childName={child.displayName}
        currentConfig={config}
        level={level}
        earnedBadgeIds={child.earnedBadgeIds ?? []}
        questUnlockedItems={child.questUnlockedItems ?? []}
        open={showCustomizer}
        onClose={() => setShowCustomizer(false)}
      />
    </div>
  );
}

function AddChildDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [ageMode, setAgeMode] = useState<AgeMode>("birthYear");
  const [birthYear, setBirthYear] = useState("");
  const [grade, setGrade] = useState("");
  const [pin, setPin] = useState("");
  const [skipPin, setSkipPin] = useState(false);
  const [email, setEmail] = useState("");
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const wantsSelfService = emailEnabled || googleEnabled;

  function reset() {
    setName("");
    setAgeMode("birthYear");
    setBirthYear("");
    setGrade("");
    setPin("");
    setSkipPin(false);
    setEmail("");
    setEmailEnabled(false);
    setGoogleEnabled(false);
    setConsent(false);
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (ageMode === "birthYear" && !birthYear) {
      setError("Enter a birth year, or switch to grade.");
      return;
    }
    if (ageMode === "grade" && !grade) {
      setError("Choose a grade, or switch to birth year.");
      return;
    }
    if (!skipPin) {
      // Default path: every hero gets a PIN as their always-works way in.
      if (!/^\d{4,6}$/.test(pin)) {
        setError("Set a 4–6 digit PIN, or tick “skip the PIN” to use email/Google only.");
        return;
      }
    } else {
      // Opted out of a PIN — they must have a working self-service method instead.
      if (!email.trim()) {
        setError("Add an email so this hero can sign in with email or Google.");
        return;
      }
      if (!wantsSelfService) {
        setError("Turn on Email or Google sign-in, or add a PIN instead.");
        return;
      }
    }
    if (wantsSelfService && !email.trim()) {
      setError("Add an email to enable email or Google sign-in.");
      return;
    }
    if (wantsSelfService && !consent) {
      setError("Please give parental consent to enable self-service sign-in.");
      return;
    }

    setSaving(true);
    try {
      const { id } = await createChild({
        displayName: name,
        birthYear: ageMode === "birthYear" ? parseInt(birthYear) : undefined,
        grade: ageMode === "grade" ? grade : undefined,
        pin: skipPin ? undefined : pin || undefined,
      });

      if (email.trim()) {
        await setChildEmail(id, email.trim());
        if (wantsSelfService) {
          const methods: ("email" | "google")[] = [];
          if (emailEnabled) methods.push("email");
          if (googleEnabled) methods.push("google");
          await recordChildConsent(id, methods);
          if (emailEnabled) await setChildAuthMethod(id, "email", true);
          if (googleEnabled) await setChildAuthMethod(id, "google", true);
        }

        // Auto-send the starting-quest invite so the parent doesn't have to
        // hunt for a second button. Only sendable when the hero can actually
        // sign in (PIN or email login) — google-only heroes have no invite path.
        if (pin || emailEnabled) {
          await sendChildQuestInvite(id).catch((err) => {
            // Don't fail the whole summon if the email bounces — the hero is
            // created and the per-card "Send starting-quest email" button
            // remains as a manual fallback.
            console.error("[child-list] auto invite failed:", err);
          });
        }
      }

      reset();
      onClose();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to summon hero");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogHeader>
        <DialogTitle>Recruit a New Hero</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}
        <div className="space-y-2">
          <Label htmlFor="childName">Hero Name</Label>
          <Input
            id="childName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lily"
            required
          />
        </div>
        <AgeInput
          mode={ageMode}
          onModeChange={setAgeMode}
          birthYear={birthYear}
          onBirthYearChange={setBirthYear}
          grade={grade}
          onGradeChange={setGrade}
        />

        <div className="rounded-lg border border-gold-dim bg-muted/20 p-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">How this hero signs in.</span> By default
            every hero gets a <span className="text-foreground">secret PIN</span> — they pick their
            character on the <span className="text-[var(--gold-bright)]">Young Hero</span> login,
            enter your family code, and type the PIN. Works on any device, and stays as a backup even
            if you add email or Google below.
          </p>

          {!skipPin && (
            <div className="space-y-2">
              <Label htmlFor="pin">Secret PIN (4–6 digits)</Label>
              <Input
                id="pin"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="1234"
                maxLength={6}
              />
            </div>
          )}

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={skipPin}
              onChange={(e) => setSkipPin(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              This hero will only sign in with email/Google — skip the PIN.{" "}
              <span className="text-foreground">(Older kids with their own device.)</span>
            </span>
          </label>

          <div className="space-y-2 border-t border-gold-dim/50 pt-3">
            <p className="text-xs font-medium text-foreground">
              Optional — let an older hero sign in on their own
            </p>
            <Label htmlFor="childEmail" className="text-xs text-muted-foreground">
              Hero&apos;s email
            </Label>
            <Input
              id="childEmail"
              name="childEmail"
              type="email"
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hero@example.com"
            />
            {email.trim() && (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                  />
                  <span>
                    Email + password{" "}
                    <span className="text-xs text-muted-foreground">
                      — signs in with their own password
                    </span>
                  </span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={googleEnabled}
                    onChange={(e) => setGoogleEnabled(e.target.checked)}
                  />
                  <span>
                    Google{" "}
                    <span className="text-xs text-muted-foreground">
                      — one tap, needs a Gmail address
                    </span>
                  </span>
                </label>
                {wantsSelfService && (
                  <label className="flex items-start gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      I authorize this hero to use self-service login (email / Google) and
                      consent to data collection for this parent-managed profile.
                    </span>
                  </label>
                )}
              </>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Your <span className="text-foreground">family code</span> is ready in Settings — share it,
          and heroes sign in with it plus their PIN.{" "}
          {email.trim() ? (
            <>Open this hero&apos;s card afterward to email a starting-quest invite to {email.trim()}.</>
          ) : (
            <>Open a hero&apos;s card any time to add an email or change how they sign in.</>
          )}
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Withdraw</Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Summoning..." : "Summon Hero"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}

function ScheduleSelfManageToggle({ childId, enabled }: { childId: string; enabled: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [selfManage, setSelfManage] = useState(enabled);

  async function handleToggle() {
    setSaving(true);
    try {
      await setScheduleSelfManage(childId, !selfManage);
      setSelfManage(!selfManage);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Schedule Management</h4>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div className="min-w-0 grow basis-56">
          <p className="text-sm">
            {selfManage
              ? "This hero can edit their own weekly schedule."
              : "This hero can only view their weekly schedule."}
          </p>
          <p className="text-xs text-muted-foreground">
            Controls whether they can add, change, or remove classes and school days.
          </p>
        </div>
        <Button
          size="sm"
          variant={selfManage ? "outline" : "default"}
          className={selfManage ? "!border-[var(--gold-border)]" : undefined}
          onClick={handleToggle}
          disabled={saving}
        >
          {saving ? "Enchanting..." : selfManage ? "Make View-Only" : "Allow Editing"}
        </Button>
      </div>
    </div>
  );
}

function SkipQuestsToggle({ childId, enabled }: { childId: string; enabled: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [canSkip, setCanSkip] = useState(enabled);

  async function handleToggle() {
    setSaving(true);
    try {
      await setSkipQuestsEnabled(childId, !canSkip);
      setCanSkip(!canSkip);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Skipping Quests</h4>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div className="min-w-0 grow basis-56">
          <p className="text-sm">
            {canSkip
              ? "This hero can skip their own quests."
              : "Only a grown-up can skip this hero's quests."}
          </p>
          <p className="text-xs text-muted-foreground">
            {canSkip
              ? "You'll get an alert every time they skip one, with the reason they gave."
              : "Turn this on and you'll still be alerted whenever they skip a quest."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Either way, &ldquo;I&rsquo;m Stuck&rdquo; is always open to them — work they can&rsquo;t
            finish is set aside and you&rsquo;re alerted, so a hard problem never
            strands them for the day.
          </p>
        </div>
        <Button
          size="sm"
          variant={canSkip ? "outline" : "default"}
          className={canSkip ? "!border-[var(--gold-border)]" : undefined}
          onClick={handleToggle}
          disabled={saving}
        >
          {saving ? "Enchanting..." : canSkip ? "Require a Grown-Up" : "Allow Skipping"}
        </Button>
      </div>
    </div>
  );
}

function SchoolingModeSettings({
  childId,
  mode,
  overridesJson,
}: {
  childId: string;
  mode: SchoolingMode;
  overridesJson: string | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [schoolingMode, setLocalMode] = useState<SchoolingMode>(mode);
  const [overrides, setLocalOverrides] = useState(parseSchoolingModeOverrides(overridesJson));
  const [expanded, setExpanded] = useState(false);

  async function handleModeChange(next: SchoolingMode) {
    setSaving(true);
    try {
      await setSchoolingMode(childId, next);
      setLocalMode(next);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleOverrideChange(day: DayOfWeek, next: SchoolingMode | "default") {
    setSaving(true);
    try {
      const value = next === "default" ? null : next;
      await setSchoolingModeOverride(childId, day, value);
      setLocalOverrides((prev) => {
        const copy = { ...prev };
        if (value === null) delete copy[day];
        else copy[day] = value;
        return copy;
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Schooling Style</h4>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div className="min-w-0 grow basis-56">
          <p className="text-sm">
            {schoolingMode === "structured"
              ? "Quests are served one at a time, in schedule order."
              : "This hero can pick any of today's quests, in any order."}
          </p>
          <p className="text-xs text-muted-foreground">Default for days without a custom override below.</p>
        </div>
        <Select
          value={schoolingMode}
          onChange={(e) => handleModeChange(e.target.value as SchoolingMode)}
          disabled={saving}
          className="w-40"
        >
          <option value="unstructured">Unstructured</option>
          <option value="structured">Structured</option>
        </Select>
      </div>
      <button
        type="button"
        className="text-xs text-primary hover:underline"
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? "Hide" : "Customize"} by day
      </button>
      {expanded && (
        <div className="divide-y divide-[var(--gold-dim)] rounded-lg border border-gold-dim bg-muted/20">
          {DAYS_OF_WEEK.map((day) => (
            <div key={day} className="flex items-center justify-between gap-3 px-3 py-2">
              <Label className="text-xs">{DAY_LABELS[day]}</Label>
              <Select
                value={overrides[day] ?? "default"}
                onChange={(e) => handleOverrideChange(day, e.target.value as SchoolingMode | "default")}
                disabled={saving}
                className="h-8 w-40 text-xs"
              >
                <option value="default">(use default)</option>
                <option value="unstructured">Unstructured</option>
                <option value="structured">Structured</option>
              </Select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LeaderboardToggle({ childId, enabled }: { childId: string; enabled: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(enabled);

  async function handleToggle() {
    setSaving(true);
    try {
      await toggleLeaderboardVisibility(childId, !visible);
      setVisible(!visible);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Hall of Legends</h4>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div className="min-w-0 grow basis-56">
          <p className="text-sm">
            {visible ? "This hero appears in the Community Hall." : "This hero is hidden from the Community Hall."}
          </p>
          <p className="text-xs text-muted-foreground">
            Only their hero name and avatar will be shown publicly.
          </p>
        </div>
        <Button
          size="sm"
          variant={visible ? "outline" : "default"}
          className={visible ? "!border-[var(--gold-border)]" : undefined}
          onClick={handleToggle}
          disabled={saving}
        >
          {saving ? "Enchanting..." : visible ? "Leave the Hall" : "Enter the Hall"}
        </Button>
      </div>
    </div>
  );
}
