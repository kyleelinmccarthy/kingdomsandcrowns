"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { GameFrame } from "@/components/game-frame";
import { GameIcon, type GameIconName } from "@/components/game-icon";
import { QuestResourceForm } from "./quest-resource-form";
import { deleteResource } from "@/lib/actions/quest-resources";

const TYPE_ICONS: Record<string, GameIconName> = {
  link: "link",
  textbook: "book",
  video: "video",
  document: "document",
  other: "box",
};

type Resource = {
  id: string;
  type: string;
  title: string;
  url: string | null;
  details: string | null;
};

export function QuestResourceList({
  resources,
  questId,
  subjectId,
}: {
  resources: Resource[];
  questId?: string;
  subjectId?: string;
}) {
  const router = useRouter();
  const [showAdd, setShowAdd] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);

  async function handleDelete(resourceId: string) {
    await deleteResource(resourceId);
    router.refresh();
  }

  return (
    <>
      <GameFrame
        title="Resources"
        icon={<GameIcon name="box" className="size-5 text-[var(--gold-bright)]" />}
        action={<Button size="sm" onClick={() => setShowAdd(true)}>Add Resource</Button>}
      >
        {resources.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No resources attached yet. Add scrolls, tomes, and artifacts to aid in this quest.
          </p>
        ) : (
          <div className="space-y-2">
            {resources.map((r) => (
              <div
                key={r.id}
                className="flex items-start justify-between rounded-md border border-border/50 bg-card/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <GameIcon name={TYPE_ICONS[r.type] ?? "box"} className="size-4 text-[var(--gold-bright)]" />
                    {r.url ? (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-primary hover:underline"
                      >
                        {r.title}
                      </a>
                    ) : (
                      <span className="font-medium">{r.title}</span>
                    )}
                  </div>
                  {r.details && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.details}</p>
                  )}
                </div>
                <div className="ml-2 flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditingResource(r)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GameFrame>

      <QuestResourceForm
        questId={questId}
        subjectId={subjectId}
        open={showAdd}
        onClose={() => setShowAdd(false)}
      />

      {editingResource && (
        <QuestResourceForm
          questId={questId}
          subjectId={subjectId}
          resource={editingResource}
          open={true}
          onClose={() => setEditingResource(null)}
        />
      )}
    </>
  );
}
