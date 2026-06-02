import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// ── Auth tables (managed by Better Auth) ──────────────────────

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  idToken: text("id_token"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }),
});

// ── App domain tables ─────────────────────────────────────────

export const family = sqliteTable("family", {
  id: text("id").primaryKey(),
  parentUserId: text("parent_user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  familyName: text("family_name").notNull(),
  timezone: text("timezone").notNull().default("America/Denver"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const child = sqliteTable("child", {
  id: text("id").primaryKey(),
  familyId: text("family_id")
    .notNull()
    .references(() => family.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  pinHash: text("pin_hash").notNull(),
  birthYear: integer("birth_year").notNull(),
  ageMode: text("age_mode", { enum: ["elementary", "middle", "high"] }).notNull(),
  avatarConfig: text("avatar_config"), // JSON blob
  currentXp: integer("current_xp").notNull().default(0),
  bonusXp: integer("bonus_xp").notNull().default(0),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  showOnLeaderboard: integer("show_on_leaderboard", { mode: "boolean" }).notNull().default(false),
  lastActiveDate: text("last_active_date"), // ISO date YYYY-MM-DD
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const subject = sqliteTable(
  "subject",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color"),
    icon: text("icon"),
    isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
    isRequired: integer("is_required", { mode: "boolean" }).notNull().default(false),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("subject_child_active_idx").on(table.childId, table.isActive),
  ]
);

export const activityLog = sqliteTable(
  "activity_log",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subject.id),
    date: text("date").notNull(), // ISO date YYYY-MM-DD
    title: text("title").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes"),
    startedAt: integer("started_at", { mode: "timestamp" }),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    source: text("source", { enum: ["manual", "timer"] }).notNull().default("manual"),
    syncStatus: text("sync_status", { enum: ["pending", "synced"] }).notNull().default("synced"),
    clientId: text("client_id").unique(),
    questAssignmentId: text("quest_assignment_id"), // FK to questAssignment, set at app layer
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("activity_child_date_idx").on(table.childId, table.date),
    index("activity_child_subject_date_idx").on(table.childId, table.subjectId, table.date),
  ]
);

export const missedSubject = sqliteTable("missed_subject", {
  id: text("id").primaryKey(),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  subjectId: text("subject_id")
    .notNull()
    .references(() => subject.id),
  weekStartDate: text("week_start_date").notNull(), // ISO date
  reason: text("reason").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const weeklySummary = sqliteTable(
  "weekly_summary",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    weekStartDate: text("week_start_date").notNull(),
    weekEndDate: text("week_end_date").notNull(),
    generatedText: text("generated_text").notNull(),
    editedText: text("edited_text"),
    copiedAt: integer("copied_at", { mode: "timestamp" }),
    checklist: text("checklist"), // JSON
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("summary_child_week_idx").on(table.childId, table.weekStartDate),
  ]
);

export const teacherFeedback = sqliteTable("teacher_feedback", {
  id: text("id").primaryKey(),
  childId: text("child_id")
    .notNull()
    .references(() => child.id, { onDelete: "cascade" }),
  weekStartDate: text("week_start_date").notNull(),
  teacherName: text("teacher_name"),
  feedbackText: text("feedback_text").notNull(),
  draftResponse: text("draft_response"),
  responseCopiedAt: integer("response_copied_at", { mode: "timestamp" }),
  status: text("status", { enum: ["new", "responded", "archived"] }).notNull().default("new"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const badge = sqliteTable("badge", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull(),
  category: text("category", { enum: ["streak", "volume", "subject", "special"] }).notNull(),
  criteria: text("criteria").notNull(), // JSON
  xpReward: integer("xp_reward").notNull().default(0),
});

export const childBadge = sqliteTable(
  "child_badge",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    badgeId: text("badge_id")
      .notNull()
      .references(() => badge.id),
    earnedAt: integer("earned_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("child_badge_unique_idx").on(table.childId, table.badgeId),
  ]
);

export const notificationPreference = sqliteTable("notification_preference", {
  id: text("id").primaryKey(),
  familyId: text("family_id")
    .notNull()
    .references(() => family.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  channel: text("channel", { enum: ["email", "push"] }).notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  schedule: text("schedule"), // JSON
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const pushSubscription = sqliteTable("push_subscription", {
  id: text("id").primaryKey(),
  familyId: text("family_id")
    .notNull()
    .references(() => family.id, { onDelete: "cascade" }),
  endpoint: text("endpoint").notNull(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── Quest management tables ──────────────────────────────────

export const quest = sqliteTable(
  "quest",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subject.id),
    title: text("title").notNull(),
    description: text("description"),
    estimatedMinutes: integer("estimated_minutes"),
    rewardXp: integer("reward_xp"),
    rewardDescription: text("reward_description"),
    rewardAvatarItem: text("reward_avatar_item"), // JSON: { category, itemId }
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("quest_child_subject_idx").on(table.childId, table.subjectId),
    index("quest_child_active_idx").on(table.childId, table.isActive),
  ]
);

export const questResource = sqliteTable(
  "quest_resource",
  {
    id: text("id").primaryKey(),
    questId: text("quest_id").references(() => quest.id, { onDelete: "cascade" }),
    subjectId: text("subject_id").references(() => subject.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["link", "textbook", "video", "document", "other"] }).notNull(),
    title: text("title").notNull(),
    url: text("url"),
    details: text("details"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("resource_quest_idx").on(table.questId),
    index("resource_subject_idx").on(table.subjectId),
  ]
);

export const questSchedule = sqliteTable("quest_schedule", {
  id: text("id").primaryKey(),
  questId: text("quest_id")
    .notNull()
    .unique()
    .references(() => quest.id, { onDelete: "cascade" }),
  frequency: text("frequency", { enum: ["daily", "specific_days"] }).notNull(),
  daysOfWeek: text("days_of_week"), // JSON array e.g. ["mon","wed","fri"]
  startDate: text("start_date").notNull(), // ISO YYYY-MM-DD
  endDate: text("end_date"), // null = indefinite
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const questAssignment = sqliteTable(
  "quest_assignment",
  {
    id: text("id").primaryKey(),
    questId: text("quest_id")
      .notNull()
      .references(() => quest.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // ISO YYYY-MM-DD
    status: text("status", { enum: ["pending", "completed", "skipped"] })
      .notNull()
      .default("pending"),
    activityLogId: text("activity_log_id")
      .references(() => activityLog.id, { onDelete: "set null" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    notes: text("notes"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("assignment_child_date_idx").on(table.childId, table.date),
    index("assignment_quest_date_idx").on(table.questId, table.date),
    index("assignment_status_idx").on(table.childId, table.status, table.date),
  ]
);

export const questReminder = sqliteTable("quest_reminder", {
  id: text("id").primaryKey(),
  questId: text("quest_id")
    .notNull()
    .references(() => quest.id, { onDelete: "cascade" }),
  type: text("type", { enum: ["day_before", "morning_of", "custom"] }).notNull(),
  timeOfDay: text("time_of_day"), // "08:00" HH:mm format
  channel: text("channel", { enum: ["email", "push"] }).notNull().default("push"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// ── School calendar ─────────────────────────────────────────

export const schoolBreak = sqliteTable(
  "school_break",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    startDate: text("start_date").notNull(), // ISO YYYY-MM-DD
    endDate: text("end_date").notNull(), // ISO YYYY-MM-DD
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("school_break_family_idx").on(table.familyId),
  ]
);

// ── Quest reward unlocks ────────────────────────────────────

// ── Castle system (unlocks at level 50) ─────────────────────

export const castle = sqliteTable(
  "castle",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .unique()
      .references(() => child.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("campsite"), // campsite, cottage, watchtower, keep, manor, castle, fortress, citadel
    name: text("name"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("castle_child_idx").on(table.childId),
  ]
);

// ── Feedback (Send a Raven) ─────────────────────────────────

export const feedback = sqliteTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    category: text("category", { enum: ["bug", "idea", "praise", "other"] }).notNull(),
    message: text("message").notNull(),
    pageUrl: text("page_url"),
    userAgent: text("user_agent"),
    viewport: text("viewport"),
    appVersion: text("app_version"),
    status: text("status", { enum: ["new", "triaged", "resolved", "archived"] })
      .notNull()
      .default("new"),
    adminNotes: text("admin_notes"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("feedback_user_idx").on(table.userId),
    index("feedback_status_idx").on(table.status, table.createdAt),
  ]
);

// ── Quest reward unlocks ────────────────────────────────────

export const childAvatarUnlock = sqliteTable(
  "child_avatar_unlock",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    category: text("category").notNull(), // hairStyle, outfit, accessory, background
    itemId: text("item_id").notNull(),
    source: text("source").notNull().default("quest_reward"),
    sourceQuestId: text("source_quest_id").references(() => quest.id, { onDelete: "set null" }),
    unlockedAt: integer("unlocked_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("child_avatar_unlock_unique_idx").on(table.childId, table.category, table.itemId),
    index("child_avatar_unlock_child_idx").on(table.childId),
  ]
);
