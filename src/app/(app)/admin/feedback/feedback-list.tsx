"use client";

import { useState, useTransition } from "react";
import { updateFeedbackStatus } from "@/lib/actions/feedback";
import { Button } from "@/components/ui/button";

type FeedbackItem = {
  id: string;
  userId: string | null;
  category: string;
  message: string;
  pageUrl: string | null;
  userAgent: string | null;
  viewport: string | null;
  appVersion: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const STATUSES = ["new", "triaged", "resolved", "archived"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_COLORS: Record<Status, string> = {
  new: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  triaged: "bg-blue-500/10 text-blue-300 border-blue-500/30",
  resolved: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
  archived: "bg-muted text-muted-foreground border-border",
};

const CATEGORY_LABEL: Record<string, string> = {
  bug: "🐛 Bug",
  idea: "💡 Idea",
  praise: "⭐ Praise",
  other: "✉️ Other",
};

export function FeedbackList({ items }: { items: FeedbackItem[] }) {
  const [filter, setFilter] = useState<Status | "all">("new");

  const filtered = filter === "all" ? items : items.filter((i) => i.status === filter);

  const counts: Record<string, number> = items.reduce(
    (acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterChip
          label={`All (${items.length})`}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        {STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={`${s} (${counts[s] ?? 0})`}
            active={filter === s}
            onClick={() => setFilter(s)}
          />
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-muted-foreground">No ravens match this filter.</p>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => (
            <FeedbackCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
        active
          ? "border-[var(--gold-border)] bg-[var(--gold-border)]/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

function FeedbackCard({ item }: { item: FeedbackItem }) {
  const [status, setStatus] = useState(item.status as Status);
  const [notes, setNotes] = useState(item.adminNotes ?? "");
  const [pending, startTransition] = useTransition();
  const statusKey = (STATUSES.includes(status) ? status : "new") as Status;

  function save(next: Status) {
    setStatus(next);
    startTransition(async () => {
      await updateFeedbackStatus(item.id, next, notes);
    });
  }

  function saveNotes() {
    startTransition(async () => {
      await updateFeedbackStatus(item.id, status, notes);
    });
  }

  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium">{CATEGORY_LABEL[item.category] ?? item.category}</span>
          <span
            className={`rounded-full border px-2 py-0.5 text-xs capitalize ${STATUS_COLORS[statusKey]}`}
          >
            {status}
          </span>
        </div>
        <time className="text-xs text-muted-foreground">
          {new Date(item.createdAt).toLocaleString()}
        </time>
      </div>

      <p className="whitespace-pre-wrap text-sm">{item.message}</p>

      <dl className="mt-3 grid grid-cols-1 gap-1 text-xs text-muted-foreground sm:grid-cols-2">
        <div>
          <dt className="inline font-medium">User: </dt>
          <dd className="inline">{item.userId ?? "(anonymous)"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Page: </dt>
          <dd className="inline">{item.pageUrl ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Viewport: </dt>
          <dd className="inline">{item.viewport ?? "—"}</dd>
        </div>
        <div>
          <dt className="inline font-medium">Version: </dt>
          <dd className="inline">{item.appVersion ?? "—"}</dd>
        </div>
        {item.userAgent && (
          <div className="sm:col-span-2">
            <dt className="inline font-medium">UA: </dt>
            <dd className="inline break-all">{item.userAgent}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 space-y-2">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={2}
          placeholder="Admin notes..."
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="flex flex-wrap gap-2">
          {STATUSES.filter((s) => s !== status).map((next) => (
            <Button
              key={next}
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => save(next)}
              className="capitalize"
            >
              Mark {next}
            </Button>
          ))}
        </div>
      </div>
    </li>
  );
}
