"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GameFrame } from "@/components/game-frame";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Avatar } from "@/components/avatar";
import { AvatarCustomizer } from "@/components/avatar-customizer";
import { FamilySetup } from "./family-setup";
import { ChildLoginAccess } from "./child-login-access";
import { createChild, updateChild, deleteChild } from "@/lib/actions/children";
import { createSubject, updateSubject, deleteSubject } from "@/lib/actions/subjects";
import { toggleLeaderboardVisibility } from "@/lib/actions/leaderboard";
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

type Child = {
  id: string;
  displayName: string;
  birthYear: number;
  ageMode: string;
  avatarConfig: string | null;
  currentXp: number;
  currentStreak: number;
  showOnLeaderboard: boolean;
  email?: string | null;
  pinEnabled?: boolean;
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
];

export function ChildList({
  family,
  children,
  isChildView = false,
  currentChildId = null,
}: {
  family: Family;
  children: Child[];
  isChildView?: boolean;
  currentChildId?: string | null;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(
    isChildView && currentChildId ? currentChildId : null
  );
  const expandedChild = children.find((c) => c.id === expandedId) ?? null;

  // Children only see their own hero
  const visibleChildren = isChildView && currentChildId
    ? children.filter((c) => c.id === currentChildId)
    : children;

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <FamilySetup family={family} isChildView={isChildView} />

        <GameFrame
          title="Heroes"
          icon="⚔️"
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
    </>
  );
}

function ChildSummaryCard({
  child,
  expanded,
  onToggle,
}: {
  child: Child;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-lg border bg-secondary/50 transition-colors cursor-pointer ${
        expanded ? "border-[var(--gold-border)]" : "border-gold-dim hover:border-[var(--gold-border)]"
      }`}
      onClick={onToggle}
    >
      <div className="flex items-center justify-between p-3">
        <div className="flex items-center gap-3">
          <Avatar
            config={child.avatarConfig ? JSON.parse(child.avatarConfig) as AvatarConfig : null}
            name={child.displayName}
            size="sm"
          />
          <div>
            <p className="font-medium">{child.displayName}</p>
            <p className="text-sm text-muted-foreground">
              {child.ageMode} &middot; Born {child.birthYear} &middot; {child.subjects.length} disciplines
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
    </div>
  );
}

function ChildDetail({ child, isChildView = false }: { child: Child; isChildView?: boolean }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (!confirm(`Banish ${child.displayName} and all their chronicles from the realm?`)) return;
    setDeleting(true);
    try {
      await deleteChild(child.id);
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <GameFrame title={`${child.displayName}'s Chronicle`} icon="📖">
      <div className="space-y-6">
        <AvatarSection child={child} />
        {!isChildView && <ChildInfoEditor child={child} />}
        {!isChildView && <SubjectManager childId={child.id} subjects={child.subjects} />}
        {!isChildView && <ChildLoginAccess child={child} />}
        {!isChildView && (
          <LeaderboardToggle childId={child.id} enabled={child.showOnLeaderboard} />
        )}
        {!isChildView && (
          <div className="border-t pt-4">
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "Banishing..." : "Banish Hero"}
            </Button>
          </div>
        )}
      </div>
    </GameFrame>
  );
}

function ChildInfoEditor({ child }: { child: Child }) {
  const router = useRouter();
  const [name, setName] = useState(child.displayName);
  const [birthYear, setBirthYear] = useState(child.birthYear.toString());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasChanges = name !== child.displayName || birthYear !== child.birthYear.toString();

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      await updateChild(child.id, {
        displayName: name !== child.displayName ? name : undefined,
        birthYear: birthYear !== child.birthYear.toString() ? parseInt(birthYear) : undefined,
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
        <div className="space-y-1">
          <Label htmlFor={`year-${child.id}`} className="text-xs">Year of Origin</Label>
          <Input
            id={`year-${child.id}`}
            type="number"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            min={2000}
            max={new Date().getFullYear()}
          />
        </div>
      </div>
      {hasChanges && (
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Enchanting..." : "Seal Changes"}
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Disciplines & Studies</h4>
        <Button size="xs" variant="outline" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? "Withdraw" : "+ Add Discipline"}
        </Button>
      </div>

      {showAdd && (
        <form onSubmit={handleAddSubject} className="flex items-end gap-2 rounded-lg border bg-muted/30 p-3">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Bardic Arts"
              required
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Color</Label>
            <div className="flex gap-1">
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
          <Button size="sm" type="submit" disabled={adding}>
            {adding ? "..." : "Add"}
          </Button>
        </form>
      )}

      <div className="space-y-1">
        {subjects.map((subject) => (
          <div key={subject.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50">
            {editingId === subject.id ? (
              <>
                <div
                  className="size-3 shrink-0 rounded-full"
                  style={{ backgroundColor: editColor }}
                />
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-7 text-sm"
                />
                <div className="flex gap-1">
                  {SUBJECT_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setEditColor(c.value)}
                      className="size-4 rounded-full border"
                      style={{
                        backgroundColor: c.value,
                        borderColor: editColor === c.value ? "var(--color-foreground)" : "transparent",
                      }}
                    />
                  ))}
                </div>
                <Button size="xs" onClick={() => handleUpdateSubject(subject.id)}>Seal</Button>
                <Button size="xs" variant="ghost" onClick={() => setEditingId(null)}>Withdraw</Button>
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
                <Button size="xs" variant="ghost" onClick={() => startEdit(subject)}>Edit</Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleRemoveSubject(subject.id)}
                >
                  ×
                </Button>
              </>
            )}
          </div>
        ))}
      </div>
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
  const [birthYear, setBirthYear] = useState("");
  const [pin, setPin] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createChild({
        displayName: name,
        birthYear: parseInt(birthYear),
        pin,
      });
      setName("");
      setBirthYear("");
      setPin("");
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
        <div className="space-y-2">
          <Label htmlFor="birthYear">Year of Origin</Label>
          <Input
            id="birthYear"
            type="number"
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            placeholder="2016"
            min={2000}
            max={new Date().getFullYear()}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pin">Secret Rune Code (4-6 digits)</Label>
          <Input
            id="pin"
            type="password"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="1234"
            pattern="\d{4,6}"
            minLength={4}
            maxLength={6}
            required
          />
        </div>
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
      <div className="flex items-center justify-between rounded-lg border border-gold-dim bg-muted/30 px-3 py-2.5">
        <div>
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
