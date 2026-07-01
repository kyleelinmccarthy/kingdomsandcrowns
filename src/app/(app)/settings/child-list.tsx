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
import { SendHeroEmailButton } from "./send-hero-email";
import { AgeInput, type AgeMode } from "./age-input";
import { GameIcon } from "@/components/game-icon";
import { createChild, updateChild, deleteChild } from "@/lib/actions/children";
import {
  setChildEmail,
  setChildAuthMethod,
  recordChildConsent,
  sendChildQuestInvite,
} from "@/lib/actions/child-auth";
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
  birthYear: number | null;
  grade?: string | null;
  ageMode: string;
  avatarConfig: string | null;
  currentXp: number;
  currentStreak: number;
  showOnLeaderboard: boolean;
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
    </>
  );
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
