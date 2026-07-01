/**
 * Seeds the local database with demo data for testing.
 * Run with: npx tsx src/lib/db/seed-demo.ts
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import * as schema from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

const now = new Date();

function daysAgo(n: number) {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d;
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function seed() {
  console.log("Seeding demo data...");

  // Clean up existing demo quests so updated titles take effect
  // (cascade deletes resources, schedules, reminders)
  for (const childId of ["demo-child-1", "demo-child-2"]) {
    await db.delete(schema.quest).where(eq(schema.quest.childId, childId));
  }

  // Demo user
  const userId = "demo-user";
  await db.insert(schema.user).values({
    id: userId,
    name: "Jordan",
    email: "demo@kingdomsandcrowns.local",
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // Family
  const familyId = "demo-family";
  await db.insert(schema.family).values({
    id: familyId,
    parentUserId: userId,
    familyName: "Demo Family",
    timezone: "America/Denver",
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();

  // A pending guardian invitation, so the /invite flow (and the marketing
  // "invited guardian" walkthrough) always has a valid link to render.
  await db.insert(schema.familyInvite).values({
    id: "demo-invite",
    token: "demo-invite-token",
    familyId,
    email: "coach@kingdomsandcrowns.local",
    role: "co_parent",
    permission: "edit",
    scope: "all",
    invitedByUserId: userId,
    status: "pending",
    expiresAt: new Date(now.getTime() + 1000 * 60 * 60 * 24 * 30), // 30 days out
    createdAt: now,
  }).onConflictDoNothing();

  // Children
  const children = [
    {
      id: "demo-child-1", displayName: "Emma", birthYear: 2015, ageMode: "elementary" as const,
      currentXp: 320, currentStreak: 5, longestStreak: 12, showOnLeaderboard: true,
      avatarConfig: JSON.stringify({
        skinTone: "medium-light", hairStyle: "long", hairColor: "#d4a843",
        outfit: "robe", outfitColor: "#a855f7", accessory: null, background: "shield", backgroundColor: "#3b82f6",
      }),
    },
    {
      id: "demo-child-2", displayName: "Noah", birthYear: 2018, ageMode: "elementary" as const,
      currentXp: 580, currentStreak: 8, longestStreak: 15, showOnLeaderboard: true,
      avatarConfig: JSON.stringify({
        skinTone: "medium", hairStyle: "spiky", hairColor: "#4a3728",
        outfit: "armor", outfitColor: "#3b82f6", accessory: "bandana", background: "diamond", backgroundColor: "#a855f7",
      }),
    },
  ];

  for (const c of children) {
    await db.insert(schema.child).values({
      ...c,
      familyId,
      pinHash: "$2a$10$demohashdemohashdemohashdemohashdemohashdemoha", // not real
      lastActiveDate: isoDate(daysAgo(0)),
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
  }

  // Subjects per child
  const subjectDefs = [
    { name: "Math", color: "#ef4444", icon: "calculator", isRequired: true },
    { name: "Reading", color: "#3b82f6", icon: "book-open", isRequired: true },
    { name: "Science", color: "#22c55e", icon: "flask-conical", isRequired: false },
    { name: "History", color: "#f59e0b", icon: "landmark", isRequired: false },
    { name: "Art", color: "#a855f7", icon: "palette", isRequired: false },
  ];

  const subjectIds: Record<string, string[]> = {};

  for (const c of children) {
    subjectIds[c.id] = [];
    for (let i = 0; i < subjectDefs.length; i++) {
      const s = subjectDefs[i];
      const subjectId = `${c.id}-subj-${i}`;
      subjectIds[c.id].push(subjectId);
      await db.insert(schema.subject).values({
        id: subjectId,
        childId: c.id,
        name: s.name,
        color: s.color,
        icon: s.icon,
        isDefault: i < 2,
        isRequired: s.isRequired,
        isActive: true,
        sortOrder: i,
        createdAt: now,
      }).onConflictDoNothing();
    }
  }

  // Activity logs — last 14 days of activities
  const activityTitles: Record<string, string[]> = {
    Math: ["Fractions worksheet", "Times tables practice", "Word problems", "Geometry shapes"],
    Reading: ["Chapter book reading", "Phonics review", "Read aloud session", "Book report"],
    Science: ["Plant growth experiment", "Volcano model", "Weather observation", "Magnet lab"],
    History: ["Timeline project", "Map coloring", "Biography reading", "History documentary"],
    Art: ["Watercolor painting", "Sketch practice", "Clay sculpture", "Collage project"],
  };

  // Clear existing demo activities before re-seeding to prevent duplicates
  for (const c of children) {
    await db.delete(schema.activityLog).where(eq(schema.activityLog.childId, c.id));
  }

  for (const c of children) {
    const sIds = subjectIds[c.id];
    for (let day = 0; day < 14; day++) {
      // 2-4 activities per day
      const count = 2 + Math.floor((day * 3 + c.id.length) % 3);
      for (let a = 0; a < count; a++) {
        const subjIdx = (day + a) % subjectDefs.length;
        const subjName = subjectDefs[subjIdx].name;
        const titles = activityTitles[subjName];
        const title = titles[(day + a) % titles.length];
        const duration = 20 + ((day * 7 + a * 13) % 40);
        const date = daysAgo(day);

        await db.insert(schema.activityLog).values({
          id: `${c.id}-act-d${day}-a${a}`,
          childId: c.id,
          subjectId: sIds[subjIdx],
          date: isoDate(date),
          title,
          durationMinutes: duration,
          source: "manual",
          syncStatus: "synced",
          createdAt: date,
          updatedAt: date,
        }).onConflictDoNothing();
      }
    }
  }

  // Badges
  const badges = [
    { id: "badge-streak-3", name: "3-Day Streak", description: "Log activities 3 days in a row", icon: "flame", category: "streak" as const, criteria: '{"streakDays":3}', xpReward: 10 },
    { id: "badge-streak-7", name: "Week Warrior", description: "Log activities 7 days in a row", icon: "flame", category: "streak" as const, criteria: '{"streakDays":7}', xpReward: 25 },
    { id: "badge-streak-14", name: "Two-Week Titan", description: "Log activities 14 days in a row", icon: "flame", category: "streak" as const, criteria: '{"streakDays":14}', xpReward: 35 },
    { id: "badge-streak-30", name: "Monthly Master", description: "Log activities 30 days in a row", icon: "crown", category: "streak" as const, criteria: '{"streakDays":30}', xpReward: 50 },
    { id: "badge-special-first", name: "First Steps", description: "Complete your very first activity", icon: "star", category: "special" as const, criteria: '{"totalActivities":1}', xpReward: 5 },
    { id: "badge-volume-10", name: "Getting Started", description: "Log 10 activities", icon: "medal", category: "volume" as const, criteria: '{"totalActivities":10}', xpReward: 10 },
    { id: "badge-volume-25", name: "Dedicated Scholar", description: "Log 25 activities", icon: "medal", category: "volume" as const, criteria: '{"totalActivities":25}', xpReward: 20 },
    { id: "badge-volume-50", name: "Busy Bee", description: "Log 50 activities", icon: "bee", category: "volume" as const, criteria: '{"totalActivities":50}', xpReward: 30 },
    { id: "badge-volume-100", name: "Century Club", description: "Log 100 activities", icon: "trophy", category: "volume" as const, criteria: '{"totalActivities":100}', xpReward: 50 },
    { id: "badge-subject-star", name: "Subject Star", description: "Log 20 activities in a single subject", icon: "star", category: "subject" as const, criteria: '{"subjectActivities":20}', xpReward: 15 },
    { id: "badge-polymath", name: "Polymath", description: "Log 10+ activities in 3 different subjects", icon: "trophy", category: "subject" as const, criteria: '{"subjectCount":3,"minPerSubject":10}', xpReward: 25 },
  ];

  for (const b of badges) {
    await db.insert(schema.badge).values(b).onConflictDoNothing();
  }

  // Award some badges
  for (const c of children) {
    await db.insert(schema.childBadge).values({
      id: nanoid(),
      childId: c.id,
      badgeId: "badge-streak-3",
      earnedAt: daysAgo(10),
    }).onConflictDoNothing();
  }

  await db.insert(schema.childBadge).values({
    id: nanoid(),
    childId: "demo-child-2",
    badgeId: "badge-streak-7",
    earnedAt: daysAgo(5),
  }).onConflictDoNothing();

  // Award new milestone badges to demo children
  for (const c of children) {
    await db.insert(schema.childBadge).values({
      id: nanoid(),
      childId: c.id,
      badgeId: "badge-special-first",
      earnedAt: daysAgo(13),
    }).onConflictDoNothing();
    await db.insert(schema.childBadge).values({
      id: nanoid(),
      childId: c.id,
      badgeId: "badge-volume-10",
      earnedAt: daysAgo(8),
    }).onConflictDoNothing();
    await db.insert(schema.childBadge).values({
      id: nanoid(),
      childId: c.id,
      badgeId: "badge-volume-25",
      earnedAt: daysAgo(4),
    }).onConflictDoNothing();
  }

  // Quest templates with schedules, resources, and reminders
  const questDefs = [
    {
      title: "Saxon Math Lesson",
      description: "Complete the daily lesson and practice problems",
      subjectIdx: 0,
      estimatedMinutes: 45,
      frequency: "specific_days" as const,
      daysOfWeek: ["mon", "tue", "wed", "thu", "fri"],
      rewardXp: 15,
      rewardDescription: null as string | null,
      rewardAvatarItem: null as string | null,
      resources: [
        { type: "textbook" as const, title: "Saxon Math 5/4", details: "Current lesson + practice set" },
      ],
    },
    {
      title: "Chapter Book Reading",
      description: "Read assigned chapter and narrate back",
      subjectIdx: 1,
      estimatedMinutes: 30,
      frequency: "daily" as const,
      daysOfWeek: null,
      rewardXp: null as number | null,
      rewardDescription: "30 min screen time",
      rewardAvatarItem: null as string | null,
      resources: [
        { type: "textbook" as const, title: "Charlotte's Web", details: "Read 1 chapter per day" },
      ],
    },
    {
      title: "Science Experiment Journal",
      description: "Record observations and draw diagrams",
      subjectIdx: 2,
      estimatedMinutes: 20,
      frequency: "specific_days" as const,
      daysOfWeek: ["tue", "thu"],
      rewardXp: 25,
      rewardDescription: null as string | null,
      rewardAvatarItem: JSON.stringify({ category: "accessory", itemId: "wings" }),
      resources: [
        { type: "link" as const, title: "Science experiment guide", url: "https://example.com/science" },
        { type: "other" as const, title: "Lab notebook", details: "Use the spiral-bound notebook" },
      ],
    },
    {
      title: "History Timeline",
      description: "Add events to the century timeline poster",
      subjectIdx: 3,
      estimatedMinutes: 25,
      frequency: "specific_days" as const,
      daysOfWeek: ["mon", "wed"],
      rewardXp: 20,
      rewardDescription: "Pick dinner tonight",
      rewardAvatarItem: null as string | null,
      resources: [
        { type: "textbook" as const, title: "Story of the World Vol. 2", details: "Current chapter" },
      ],
    },
  ];

  // Per-child quest title & resource overrides
  const questOverrides: Record<string, Record<number, { title: string; resources?: typeof questDefs[number]["resources"] }>> = {
    "demo-child-1": { // Emma
      0: { title: "ST Math Lesson", resources: [{ type: "textbook" as const, title: "ST Math", details: "Current lesson + practice set" }] },
      2: { title: "Science Worksheet" },
      3: { title: "Language Arts Worksheets", resources: [{ type: "textbook" as const, title: "Language Arts Worksheets", details: "Current worksheet" }] },
    },
    "demo-child-2": { // Noah
      0: { title: "Imagine Learning Math Lesson", resources: [{ type: "textbook" as const, title: "Imagine Learning Math", details: "Current lesson + practice set" }] },
      2: { title: "Marine Biology Workbook" },
      3: { title: "Imagine Learning Reading", resources: [{ type: "textbook" as const, title: "Imagine Learning Reading", details: "Current lesson" }] },
    },
  };

  for (const c of children) {
    const sIds = subjectIds[c.id];
    for (let qi = 0; qi < questDefs.length; qi++) {
      const qDef = questDefs[qi];
      const overrides = questOverrides[c.id]?.[qi];
      const questId = `${c.id}-quest-${qi}`;
      await db.insert(schema.quest).values({
        id: questId,
        childId: c.id,
        subjectId: sIds[qDef.subjectIdx],
        title: overrides?.title ?? qDef.title,
        description: qDef.description,
        estimatedMinutes: qDef.estimatedMinutes,
        rewardXp: qDef.rewardXp,
        rewardDescription: qDef.rewardDescription,
        rewardAvatarItem: qDef.rewardAvatarItem,
        isActive: true,
        sortOrder: qDef.subjectIdx,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing();

      // Schedule
      await db.insert(schema.questSchedule).values({
        id: `${questId}-sched`,
        questId,
        frequency: qDef.frequency,
        daysOfWeek: qDef.daysOfWeek ? JSON.stringify(qDef.daysOfWeek) : null,
        startDate: isoDate(daysAgo(7)),
        endDate: null,
        createdAt: now,
      }).onConflictDoNothing();

      // Resources
      const resources = overrides?.resources ?? qDef.resources;
      for (let ri = 0; ri < resources.length; ri++) {
        const r = resources[ri];
        await db.insert(schema.questResource).values({
          id: `${questId}-res-${ri}`,
          questId,
          type: r.type,
          title: r.title,
          url: "url" in r ? (r as { url: string }).url : null,
          details: r.details ?? null,
          sortOrder: ri,
          createdAt: now,
        }).onConflictDoNothing();
      }

      // Morning reminder
      await db.insert(schema.questReminder).values({
        id: `${questId}-remind`,
        questId,
        type: "morning_of",
        channel: "push",
        enabled: true,
        createdAt: now,
      }).onConflictDoNothing();
    }
  }

  console.log("Demo data seeded successfully!");
  console.log("  - 1 user (demo@kingdomsandcrowns.local)");
  console.log("  - 1 family");
  console.log("  - 2 children (Emma, Noah)");
  console.log("  - 5 subjects each");
  console.log("  - 14 days of activity logs");
  console.log("  - 11 badges (streak, volume, subject, special)");
  console.log("  - 4 quest templates per child (with schedules, resources, reminders, rewards)");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
