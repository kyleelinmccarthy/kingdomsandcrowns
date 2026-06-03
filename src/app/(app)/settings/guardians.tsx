"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { GameFrame } from "@/components/game-frame";
import { Dialog, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  inviteGuardian,
  revokeInvite,
  resendInvite,
  removeMember,
} from "@/lib/actions/guardians";

type Role = "owner" | "co_parent" | "teacher" | "tutor" | "guardian";
type Permission = "edit" | "view";
type Scope = "all" | "specific";

const ROLE_LABELS: Record<Role, string> = {
  owner: "Owner",
  co_parent: "Co-parent",
  teacher: "Teacher",
  tutor: "Tutor",
  guardian: "Guardian",
};

const INVITABLE_ROLES: Role[] = ["co_parent", "teacher", "tutor", "guardian"];

type Member = {
  id: string;
  userId: string;
  role: string;
  permission: string;
  scope: string;
  status: string;
  name: string;
  email: string;
  scopedChildIds: string[];
  isSelf: boolean;
};

type Invite = {
  id: string;
  email: string;
  role: string;
  permission: string;
  scope: string;
};

type ChildOption = { id: string; displayName: string };

export function GuardiansManager({
  members,
  invites,
  canManage,
  heroes,
}: {
  members: Member[];
  invites: Invite[];
  canManage: boolean;
  heroes: ChildOption[];
}) {
  const router = useRouter();
  const [showInvite, setShowInvite] = useState(false);

  return (
    <GameFrame
      title="Guardians & Mentors"
      icon="🛡️"
      action={
        canManage ? (
          <Button size="sm" onClick={() => setShowInvite(true)}>
            Invite Guardian
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Grant other adults — a co-parent, a teacher, or a tutor — access to follow
          your heroes&apos; progress. Choose whether they can edit or only view, and
          whether they see the whole family or specific heroes.
        </p>

        <div className="space-y-2">
          {members.map((m) => (
            <MemberRow
              key={m.id}
              member={m}
              canManage={canManage}
              childNameById={Object.fromEntries(heroes.map((c) => [c.id, c.displayName]))}
            />
          ))}
        </div>

        {invites.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <h4 className="text-sm font-medium">Pending Invitations</h4>
            {invites.map((inv) => (
              <InviteRow key={inv.id} invite={inv} canManage={canManage} />
            ))}
          </div>
        )}
      </div>

      {canManage && (
        <InviteDialog
          open={showInvite}
          onClose={() => setShowInvite(false)}
          heroes={heroes}
          onDone={() => {
            setShowInvite(false);
            router.refresh();
          }}
        />
      )}
    </GameFrame>
  );
}

function MemberRow({
  member,
  canManage,
  childNameById,
}: {
  member: Member;
  canManage: boolean;
  childNameById: Record<string, string>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const role = member.role as Role;

  const scopeLabel =
    member.scope === "specific"
      ? member.scopedChildIds.map((id) => childNameById[id] ?? "?").join(", ") || "no heroes"
      : "All heroes";

  async function handleRemove() {
    if (!confirm(`Remove ${member.name}'s access?`)) return;
    setBusy(true);
    try {
      await removeMember(member.id);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-gold-dim bg-muted/30 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm">
          {member.name}{" "}
          {member.isSelf && <span className="text-xs text-muted-foreground">(you)</span>}
        </p>
        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
        <p className="text-xs text-muted-foreground">
          {ROLE_LABELS[role] ?? role} &middot;{" "}
          {member.permission === "view" ? "View only" : "Can edit"} &middot; {scopeLabel}
        </p>
      </div>
      {canManage && role !== "owner" && (
        <Button
          size="xs"
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={handleRemove}
          disabled={busy}
        >
          Remove
        </Button>
      )}
    </div>
  );
}

function InviteRow({ invite, canManage }: { invite: Invite; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function handleRevoke() {
    setBusy(true);
    try {
      await revokeInvite(invite.id);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setBusy(true);
    try {
      const res = await resendInvite(invite.id);
      if (!res.emailSent) setLink(res.link);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-gold-dim bg-muted/20 px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm">{invite.email}</p>
        <p className="text-xs text-muted-foreground">
          {ROLE_LABELS[invite.role as Role] ?? invite.role} &middot;{" "}
          {invite.permission === "view" ? "View only" : "Can edit"} &middot; pending
        </p>
        {link && (
          <p className="mt-1 break-all text-xs text-[var(--gold-bright)]">
            Share this link: {link}
          </p>
        )}
      </div>
      {canManage && (
        <div className="flex shrink-0 gap-1">
          <Button size="xs" variant="ghost" onClick={handleResend} disabled={busy}>
            Resend
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={handleRevoke}
            disabled={busy}
          >
            Revoke
          </Button>
        </div>
      )}
    </div>
  );
}

function InviteDialog({
  open,
  onClose,
  heroes,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  heroes: ChildOption[];
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("co_parent");
  const [permission, setPermission] = useState<Permission>("view");
  const [scope, setScope] = useState<Scope>("all");
  const [selectedChildIds, setSelectedChildIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [resultLink, setResultLink] = useState<string | null>(null);

  function toggleChild(id: string) {
    setSelectedChildIds((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await inviteGuardian({
        email,
        role,
        permission,
        scope,
        childIds: scope === "specific" ? selectedChildIds : undefined,
      });
      if (!res.emailSent) {
        // Email not configured — surface the link to copy.
        setResultLink(res.link);
      } else {
        onDone();
        reset();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send invitation");
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setEmail("");
    setRole("co_parent");
    setPermission("view");
    setScope("all");
    setSelectedChildIds([]);
    setResultLink(null);
    setError("");
  }

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
        reset();
      }}
    >
      <DialogHeader>
        <DialogTitle>Invite a Guardian</DialogTitle>
      </DialogHeader>

      {resultLink ? (
        <div className="space-y-4">
          <p className="text-sm">
            Invitation created. Email isn&apos;t configured, so share this link with them
            directly:
          </p>
          <p className="break-all rounded-md bg-muted/40 p-3 text-xs text-[var(--gold-bright)]">
            {resultLink}
          </p>
          <DialogFooter>
            <Button
              onClick={() => {
                onDone();
                reset();
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="inviteEmail">Email</Label>
            <Input
              id="inviteEmail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="guardian@realm.com"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="inviteRole">Role</Label>
              <Select
                id="inviteRole"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invitePermission">Permission</Label>
              <Select
                id="invitePermission"
                value={permission}
                onChange={(e) => setPermission(e.target.value as Permission)}
              >
                <option value="view">View only</option>
                <option value="edit">Can edit</option>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Access</Label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "all"}
                  onChange={() => setScope("all")}
                />
                All heroes
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  checked={scope === "specific"}
                  onChange={() => setScope("specific")}
                />
                Specific heroes
              </label>
            </div>
          </div>

          {scope === "specific" && (
            <div className="space-y-1 rounded-md border border-gold-dim bg-muted/20 p-3">
              {heroes.length === 0 ? (
                <p className="text-xs text-muted-foreground">No heroes to choose from yet.</p>
              ) : (
                heroes.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedChildIds.includes(c.id)}
                      onChange={() => toggleChild(c.id)}
                    />
                    {c.displayName}
                  </label>
                ))
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onClose();
                reset();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </form>
      )}
    </Dialog>
  );
}
