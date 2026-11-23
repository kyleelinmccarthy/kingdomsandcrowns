"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  approveAccessRequest,
  declineAccessRequest,
  type AccessRequestRow,
} from "@/lib/actions/access-request-admin";
import { Button } from "@/components/ui/button";

const FILTERS = ["new", "invited", "declined", "all"] as const;
type Filter = (typeof FILTERS)[number];

const STATUS_LABEL: Record<AccessRequestRow["status"], string> = {
  new: "Waiting",
  invited: "Approved",
  declined: "Declined",
};

const STATUS_COLORS: Record<AccessRequestRow["status"], string> = {
  new: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  invited: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  declined: "bg-muted text-muted-foreground border-border",
};

type Notice = { tone: "error" | "info"; text: string; link?: string };

export function AccessRequestList({ requests }: { requests: AccessRequestRow[] }) {
  const [filter, setFilter] = useState<Filter>("new");
  // Kept here, not on the card: a decided request leaves the filter it was in when the list
  // refreshes, and an "email didn't send, here's the link" notice must outlive its card.
  const [notices, setNotices] = useState<Record<string, Notice>>({});
  const report = (id: string, notice: Notice | null) =>
    setNotices((all) => {
      const rest = { ...all };
      delete rest[id];
      return notice ? { ...rest, [id]: notice } : rest;
    });
  const shown = filter === "all" ? requests : requests.filter((r) => r.status === filter);
  const count = (f: Filter) => (f === "all" ? requests.length : requests.filter((r) => r.status === f).length);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
              filter === f
                ? "border-[var(--gold-border)] bg-[var(--gold-border)]/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f === "all" ? "All" : STATUS_LABEL[f]} ({count(f)})
          </button>
        ))}
      </div>

      {Object.entries(notices).map(([id, n]) => (
        <div
          key={id}
          role="status"
          className={`flex items-start justify-between gap-3 rounded-md p-3 text-sm ${
            n.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-300"
          }`}
        >
          <div>
            {n.text}
            {n.link && <code className="mt-1 block break-all text-xs text-foreground">{n.link}</code>}
          </div>
          <button type="button" onClick={() => report(id, null)} className="text-xs underline">
            Dismiss
          </button>
        </div>
      ))}

      {shown.length === 0 ? (
        <p className="text-muted-foreground">No requests here.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <RequestCard key={r.id} request={r} onNotice={(n) => report(r.id, n)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function RequestCard({ request: r, onNotice }: { request: AccessRequestRow; onNotice: (n: Notice | null) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const hasAccount = r.accountUserId !== null;
  const { approvalLive } = r;
  const ranOut = r.status === "invited" && !approvalLive && !hasAccount;
  const interests = [
    r.wantsBeta && "Beta test now",
    r.notifyFree && "Free accounts",
    r.notifyPaid && "Paid plan",
  ].filter(Boolean) as string[];

  function approve() {
    onNotice(null);
    startTransition(async () => {
      const result = await approveAccessRequest(r.id);
      if ("error" in result) {
        onNotice({ tone: "error", text: `${r.name}: ${result.error}` });
        return;
      }
      onNotice(
        result.emailSent
          ? { tone: "info", text: `Approved ${r.name}. The sign-up link went to ${r.email}.` }
          : {
              tone: "error",
              text: `Approved ${r.name}, but the email didn't send. Send ${r.email} this link yourself:`,
              link: result.link,
            }
      );
      router.refresh();
    });
  }

  function decline() {
    onNotice(null);
    startTransition(async () => {
      const result = await declineAccessRequest(r.id);
      if ("error" in result) onNotice({ tone: "error", text: `${r.name}: ${result.error}` });
      router.refresh();
    });
  }

  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{r.name}</span>
          <a href={`mailto:${r.email}`} className="text-primary hover:underline">
            {r.email}
          </a>
          <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[ranOut ? "declined" : r.status]}`}>
            {ranOut ? "Ran out" : STATUS_LABEL[r.status]}
          </span>
          {hasAccount && (
            <span className="rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-xs text-blue-300">
              Has an account
            </span>
          )}
        </div>
        <time className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</time>
      </div>

      {r.message && <p className="whitespace-pre-wrap text-sm">{r.message}</p>}

      <dl className="mt-3 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="inline font-medium">Interested in: </dt>
          <dd className="inline">{interests.length ? interests.join(", ") : "—"}</dd>
        </div>
        {r.status === "invited" && r.admitUntil && !hasAccount && (
          <div>
            <dt className="inline font-medium">{approvalLive ? "Can sign up until: " : "Approval ran out: "}</dt>
            <dd className="inline">{new Date(r.admitUntil).toLocaleDateString()}</dd>
          </div>
        )}
      </dl>

      {!hasAccount && (
        <div className="mt-3 flex flex-wrap gap-2">
          {!approvalLive && (
            <Button type="button" size="sm" disabled={pending} onClick={approve}>
              {r.status === "invited" ? "Approve again" : "Approve"}
            </Button>
          )}
          {approvalLive && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={approve}>
              Resend invitation
            </Button>
          )}
          {r.status !== "declined" && (
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={decline}>
              {r.status === "invited" ? "Withdraw approval" : "Decline"}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
