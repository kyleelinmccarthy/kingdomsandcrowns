"use server";

import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { sanitizeName, sanitizeText } from "@/lib/utils/sanitize";
import {
  requireQuestAccess,
  requireSubjectAccess,
  requireResourceAccess,
} from "@/lib/auth/access";

export async function getQuestResources(questId: string) {
  await requireQuestAccess(questId);
  return db
    .select()
    .from(schema.questResource)
    .where(eq(schema.questResource.questId, questId));
}

export async function getSubjectResources(subjectId: string) {
  await requireSubjectAccess(subjectId);
  return db
    .select()
    .from(schema.questResource)
    .where(eq(schema.questResource.subjectId, subjectId));
}

export async function createResource(data: {
  questId?: string;
  subjectId?: string;
  type: "link" | "textbook" | "video" | "document" | "other";
  title: string;
  url?: string;
  details?: string;
}) {
  if (!data.questId && !data.subjectId) {
    throw new Error("Resource must belong to a quest or subject");
  }
  if (data.questId && data.subjectId) {
    throw new Error("Resource cannot belong to both a quest and a subject");
  }
  if (data.questId) await requireQuestAccess(data.questId, { write: true });
  else await requireSubjectAccess(data.subjectId!, { write: true });

  const title = sanitizeName(data.title);
  if (!title) throw new Error("Resource title is required");

  const id = nanoid();

  const existing = await db
    .select({ sortOrder: schema.questResource.sortOrder })
    .from(schema.questResource)
    .where(
      data.questId
        ? eq(schema.questResource.questId, data.questId)
        : eq(schema.questResource.subjectId, data.subjectId!)
    );
  const maxSort = existing.reduce((max, r) => Math.max(max, r.sortOrder), -1);

  await db.insert(schema.questResource).values({
    id,
    questId: data.questId ?? null,
    subjectId: data.subjectId ?? null,
    type: data.type,
    title,
    url: data.url?.trim() || null,
    details: data.details ? sanitizeText(data.details) : null,
    sortOrder: maxSort + 1,
    createdAt: new Date(),
  });

  return { id };
}

export async function updateResource(
  resourceId: string,
  data: {
    title?: string;
    type?: "link" | "textbook" | "video" | "document" | "other";
    url?: string;
    details?: string;
  }
) {
  await requireResourceAccess(resourceId, { write: true });
  const updates: Record<string, unknown> = {};
  if (data.title) updates.title = sanitizeName(data.title);
  if (data.type) updates.type = data.type;
  if (data.url !== undefined) updates.url = data.url?.trim() || null;
  if (data.details !== undefined)
    updates.details = data.details ? sanitizeText(data.details) : null;

  await db
    .update(schema.questResource)
    .set(updates)
    .where(eq(schema.questResource.id, resourceId));
}

export async function deleteResource(resourceId: string) {
  await requireResourceAccess(resourceId, { write: true });
  await db
    .delete(schema.questResource)
    .where(eq(schema.questResource.id, resourceId));
}
