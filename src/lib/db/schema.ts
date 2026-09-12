import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

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

export const family = sqliteTable(
  "family",
  {
    id: text("id").primaryKey(),
    // Denormalized "creator/owner" pointer. Access authority lives in `familyMember`;
    // this is kept only for convenience (e.g. last-owner reasoning) and is nullable.
    parentUserId: text("parent_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    familyName: text("family_name").notNull(),
    timezone: text("timezone").notNull().default("America/Denver"),
    // Short human-typeable code used by children to identify their family when
    // logging in by PIN on a standalone device. Nullable; generated on demand.
    loginCode: text("login_code"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("family_login_code_idx").on(table.loginCode)]
);

// ── Family membership & access ────────────────────────────────
// Many-to-many link between adult users and families. This is the source of
// truth for who may view/manage a family and its children.

export const familyMember = sqliteTable(
  "family_member",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", {
      enum: ["owner", "co_parent", "teacher", "tutor", "guardian"],
    }).notNull(),
    permission: text("permission", { enum: ["edit", "view"] }).notNull(),
    scope: text("scope", { enum: ["all", "specific"] }).notNull().default("all"),
    status: text("status", { enum: ["pending", "active"] }).notNull().default("active"),
    invitedByUserId: text("invited_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("family_member_unique_idx").on(table.familyId, table.userId),
    index("family_member_user_idx").on(table.userId),
    index("family_member_family_idx").on(table.familyId),
  ]
);

// Per-child scope rows — only present when familyMember.scope === "specific".
export const familyMemberChild = sqliteTable(
  "family_member_child",
  {
    id: text("id").primaryKey(),
    familyMemberId: text("family_member_id")
      .notNull()
      .references(() => familyMember.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("family_member_child_unique_idx").on(table.familyMemberId, table.childId),
    index("family_member_child_child_idx").on(table.childId),
  ]
);

// Pending email invitations to join a family.
export const familyInvite = sqliteTable(
  "family_invite",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", {
      enum: ["owner", "co_parent", "teacher", "tutor", "guardian"],
    }).notNull(),
    permission: text("permission", { enum: ["edit", "view"] }).notNull(),
    scope: text("scope", { enum: ["all", "specific"] }).notNull().default("all"),
    childIds: text("child_ids"), // JSON array of child ids when scope === "specific"
    invitedByUserId: text("invited_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: ["pending", "accepted", "revoked", "expired"],
    })
      .notNull()
      .default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("family_invite_email_idx").on(table.email),
    index("family_invite_family_idx").on(table.familyId),
  ]
);

export const child = sqliteTable(
  "child",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    // Nullable: a hero may authenticate by email/Google only (no PIN).
    pinHash: text("pin_hash"),
    // Age band is derived from EITHER birthYear or grade (whichever the parent
    // provided); both inputs are nullable, ageMode is always set.
    birthYear: integer("birth_year"),
    grade: text("grade"), // "K", "1".."12" when the parent chose grade
    ageMode: text("age_mode", { enum: ["elementary", "middle", "high"] }).notNull(),
    avatarConfig: text("avatar_config"), // JSON blob
    currentXp: integer("current_xp").notNull().default(0),
    bonusXp: integer("bonus_xp").notNull().default(0),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    showOnLeaderboard: integer("show_on_leaderboard", { mode: "boolean" }).notNull().default(false),
    lastActiveDate: text("last_active_date"), // ISO date YYYY-MM-DD
    // ── Child authentication (parent-provisioned) ──────────────
    // Email/Google heroes are real Better Auth users linked here.
    email: text("email"),
    authUserId: text("auth_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    pinEnabled: integer("pin_enabled", { mode: "boolean" }).notNull().default(true),
    emailLoginEnabled: integer("email_login_enabled", { mode: "boolean" }).notNull().default(false),
    googleLoginEnabled: integer("google_login_enabled", { mode: "boolean" }).notNull().default(false),
    // ── Schedule ─────────────────────────────────────────────────
    // Parent-only toggle: whether this hero may edit their own schedule.
    scheduleSelfManageEnabled: integer("schedule_self_manage_enabled", { mode: "boolean" }).notNull().default(false),
    // Parent-only toggle: whether this hero may skip their own quests. Off by
    // default — skipping stays a grown-up decision until a parent hands it
    // over. Every skip a hero makes raises a parentAlert either way.
    skipQuestsEnabled: integer("skip_quests_enabled", { mode: "boolean" }).notNull().default(false),
    // JSON array of weekday codes ("mon".."sun") that are school days; null = default Mon-Fri.
    schoolDays: text("school_days"),
    // JSON array of weekday codes that are school days but optional: quests can
    // be scheduled on them, yet logging nothing there never breaks the streak.
    // null/absent = every school day is required. Days that aren't school days
    // are already streak-safe, so listing one here is a no-op.
    streakOptionalDays: text("streak_optional_days"),
    // Parent-set default: whether "Start a Quest" serves this hero's assignments
    // one at a time in schedule order (structured) or lets them free-pick from
    // today's list (unstructured).
    schoolingMode: text("schooling_mode", { enum: ["structured", "unstructured"] })
      .notNull()
      .default("unstructured"),
    // Sparse JSON map of weekday -> mode, e.g. {"fri":"unstructured"}. Only days
    // with an explicit override are present; absent days fall back to schoolingMode.
    schoolingModeOverrides: text("schooling_mode_overrides"),
    // Soft delete ("banished"). Non-null hides the hero everywhere — lists,
    // logins, leaderboards — but keeps every row intact so a parent can
    // restore them. Permanent removal is a separate, explicit action.
    banishedAt: integer("banished_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("child_email_idx").on(table.email),
    uniqueIndex("child_auth_user_idx").on(table.authUserId),
  ]
);

// Parental consent events for a child's self-service login. Append-only history
// (never overwritten) so consent changes remain auditable.
export const childConsent = sqliteTable(
  "child_consent",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    consentedByUserId: text("consented_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    methods: text("methods").notNull(), // JSON array, e.g. ["email","google"]
    consentVersion: text("consent_version").notNull(),
    ipAddress: text("ip_address"),
    consentedAt: integer("consented_at", { mode: "timestamp" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("child_consent_child_idx").on(table.childId)]
);

// Anti-hijack token a parent generates so only a parent-provisioned email can
// claim a child profile (set a password / link an account).
export const childLoginLink = sqliteTable(
  "child_login_link",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    purpose: text("purpose", { enum: ["set_password", "claim"] }).notNull(),
    status: text("status", {
      enum: ["pending", "accepted", "revoked", "expired"],
    })
      .notNull()
      .default("pending"),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp" }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("child_login_link_token_idx").on(table.token),
    index("child_login_link_child_idx").on(table.childId),
  ]
);

// PIN brute-force throttling, keyed by (child, ip).
export const childPinAttempt = sqliteTable(
  "child_pin_attempt",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    ipAddress: text("ip_address").notNull(),
    failedCount: integer("failed_count").notNull().default(0),
    lockedUntil: integer("locked_until", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("child_pin_attempt_unique_idx").on(table.childId, table.ipAddress),
  ]
);

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
    // Which school of magic this discipline feeds in the Realm's spellbook.
    // Set by name when the subject is created; a grown-up can change it, so a
    // family decides where "Latin" or "Piano" counts.
    spellSchool: text("spell_school", { enum: ["element", "form", "modifier", "none"] })
      .notNull()
      .default("none"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("subject_child_active_idx").on(table.childId, table.isActive),
  ]
);

export const scheduleBlock = sqliteTable(
  "schedule_block",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    subjectId: text("subject_id")
      .notNull()
      .references(() => subject.id, { onDelete: "cascade" }),
    dayOfWeek: text("day_of_week", {
      enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    }).notNull(),
    startTime: text("start_time").notNull(), // "HH:mm", 24h local time
    endTime: text("end_time").notNull(), // "HH:mm", 24h local time
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("schedule_block_child_day_idx").on(table.childId, table.dayOfWeek),
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
    includeInLearningLog: integer("include_in_learning_log", { mode: "boolean" })
      .notNull()
      .default(true),
    requireNotes: integer("require_notes", { mode: "boolean" }).notNull().default(false),
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
  frequency: text("frequency", { enum: ["once", "daily", "weekly", "monthly"] }).notNull(),
  daysOfWeek: text("days_of_week"), // JSON array e.g. ["mon","wed","fri"]; used when frequency === "weekly"
  intervalWeeks: integer("interval_weeks"), // used when frequency === "weekly"; 1 = every week, 2 = every other week, etc.
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
    // "stuck" is a hero's own escape hatch: work they could not finish but had
    // to move past. It resolves the day the way "skipped" does — the structured
    // queue advances, the learning log leaves it out — but it says "I need
    // help", not "I chose not to", and it always raises a parentAlert.
    status: text("status", { enum: ["pending", "completed", "skipped", "stuck"] })
      .notNull()
      .default("pending"),
    activityLogId: text("activity_log_id")
      .references(() => activityLog.id, { onDelete: "set null" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    notes: text("notes"),
    // Why the quest was set aside — a hero's "I'm stuck", or the reason it was
    // skipped. Deliberately not filed in `notes`: Scribe's Notes are the record
    // of work that was done, and they feed the learning log. A reason for not
    // doing the work is a different claim and must never be able to pass as one.
    statusReason: text("status_reason"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("assignment_child_date_idx").on(table.childId, table.date),
    index("assignment_quest_date_idx").on(table.questId, table.date),
    index("assignment_status_idx").on(table.childId, table.status, table.date),
    uniqueIndex("assignment_child_quest_date_idx").on(table.childId, table.questId, table.date),
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

// ── The Realm: seasons and crowns ───────────────────────────

/**
 * A season is a hero's time in one grade. It opens when the hero gets a grade
 * and completes when a grown-up moves them up a grade — that promotion is the
 * signal that the grade is done, so no one has to "end" anything by hand. The
 * crown for a completed season is chosen by ordinal (first season, second...),
 * which is stored rather than derived so a tier never changes after the fact.
 */
export const season = sqliteTable(
  "season",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    grade: text("grade").notNull(), // "K", "1".."12"
    ordinal: integer("ordinal").notNull(),
    startDate: text("start_date").notNull(), // ISO YYYY-MM-DD
    endDate: text("end_date"), // ISO YYYY-MM-DD, set on completion
    completedAt: integer("completed_at", { mode: "timestamp" }), // null = open
    crownId: text("crown_id"), // crown-catalog id, minted on completion
    ceremonySeenAt: integer("ceremony_seen_at", { mode: "timestamp" }), // null until the hero has seen (or a family member has dismissed) the crown ceremony
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    index("season_child_idx").on(table.childId),
    // At most one open season per hero.
    uniqueIndex("season_open_unique_idx")
      .on(table.childId)
      .where(sql`${table.completedAt} IS NULL`),
  ]
);

// ── The Realm: parent-controlled settings ───────────────────

export const realmSettings = sqliteTable(
  "realm_settings",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .unique()
      .references(() => child.id, { onDelete: "cascade" }),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    // earned: minutes come from completed quests; scheduled: recess blocks;
    // both: either opens the Realm.
    accessMode: text("access_mode", { enum: ["earned", "scheduled", "both", "open"] })
      .notNull()
      .default("earned"),
    earnedMinutesPerQuest: integer("earned_minutes_per_quest").notNull().default(5),
    // Play allowed outside school hours and on non-school days.
    offHoursEnabled: integer("off_hours_enabled", { mode: "boolean" }).notNull().default(false),
    // Hard screen-time ceiling per local day, whatever the mode.
    dailyCapMinutes: integer("daily_cap_minutes").notNull().default(30),
    toneMode: text("tone_mode", { enum: ["gentle", "monsters"] }).notNull().default("gentle"),
    // Slice 8: when the hero first saw the how-to-play card, and when the starter spell was seeded (or found unnecessary).
    helpSeenAt: integer("help_seen_at", { mode: "timestamp" }),
    starterSpellAt: integer("starter_spell_at", { mode: "timestamp" }),
    // Slice 1 of the presentation overhaul: how much the Realm shows.
    // 'auto' follows the tutorial; a hero or a grown-up can pin it either way.
    depthOverride: text("depth_override", { enum: ["auto", "simple", "full"] }).notNull().default("auto"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  }
);

/**
 * Scheduled recess. Its own table, not a subject-less schedule_block: thirteen
 * files assume a schedule block has a subject, and a break must not ripple
 * through all of them.
 */
export const recessBlock = sqliteTable(
  "recess_block",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    dayOfWeek: text("day_of_week", {
      enum: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    }).notNull(),
    startTime: text("start_time").notNull(), // "HH:mm"
    endTime: text("end_time").notNull(), // "HH:mm"
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("recess_block_child_day_idx").on(table.childId, table.dayOfWeek)]
);

// ── The Realm: learning profile ─────────────────────────────

/**
 * Accommodation toggles only. Presets in the UI pre-fill these; the preset
 * name is never stored and no column names a diagnosis. A child's record
 * should describe what helps them, not label them.
 */
export const learningProfile = sqliteTable(
  "learning_profile",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .unique()
      .references(() => child.id, { onDelete: "cascade" }),
    readingFont: integer("reading_font", { mode: "boolean" }).notNull().default(false),
    largerText: integer("larger_text", { mode: "boolean" }).notNull().default(false),
    extraSpacing: integer("extra_spacing", { mode: "boolean" }).notNull().default(false),
    readAloud: integer("read_aloud", { mode: "boolean" }).notNull().default(false),
    untimed: integer("untimed", { mode: "boolean" }).notNull().default(false),
    sessionMinutes: integer("session_minutes"), // null = no break suggestion
    fewerChoices: integer("fewer_choices", { mode: "boolean" }).notNull().default(false),
    reducedMotion: integer("reduced_motion", { mode: "boolean" }).notNull().default(false),
    lowStimulus: integer("low_stimulus", { mode: "boolean" }).notNull().default(false),
    predictableRoutine: integer("predictable_routine", { mode: "boolean" }).notNull().default(false),
    soundEnabled: integer("sound_enabled", { mode: "boolean" }).notNull().default(true),
    inputMode: text("input_mode", { enum: ["auto", "touch", "keyboard"] }).notNull().default("auto"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  }
);

// ── The Realm: play-time ledger ─────────────────────────────

/**
 * Append-only. A day's balance is earned + granted − spent, recomputed from
 * rows every time, the same discipline XP follows. Nothing here is updated
 * or deleted by the app.
 */
export const realmPlayLedger = sqliteTable(
  "realm_play_ledger",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // hero's local ISO day
    kind: text("kind", { enum: ["earned", "granted", "spent"] }).notNull(),
    minutes: integer("minutes").notNull(),
    // No FK: assignments can be deleted and the minutes must survive.
    sourceAssignmentId: text("source_assignment_id"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("realm_play_ledger_child_date_idx").on(table.childId, table.date)]
);

// ── The Realm: spellbook ────────────────────────────────────

/**
 * One named spell in one page (slot) of a hero's spellbook. Parts are catalog
 * ids, never copied in: the catalog is the source of truth for what a part
 * does, and which parts a hero may use is decided at save time from their
 * level, badges, quest rewards, and schoolwork.
 */
export const spell = sqliteTable(
  "spell",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    slot: integer("slot").notNull(), // 1-based page number
    elementId: text("element_id").notNull(),
    formId: text("form_id").notNull(),
    modifierId: text("modifier_id"), // null = no modifier
    adjective: text("adjective").notNull(), // word-bank pick
    noun: text("noun").notNull(), // word-bank pick
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("spell_child_slot_idx").on(table.childId, table.slot),
    index("spell_child_idx").on(table.childId),
  ]
);

// ── The Realm: drill bank and deeds ─────────────────────────────

/**
 * One practice item from a seeded pool (sight words, spelling, vocabulary,
 * science facts). Math is generated at run time and never stored. Rows are
 * upserted from src/content/drills/*.json by the seed script, keyed by the
 * item id, so content edits propagate without a migration.
 */
export const drillItem = sqliteTable(
  "drill_item",
  {
    id: text("id").primaryKey(), // the JSON item id, e.g. "sight-g23-because"
    poolId: text("pool_id").notNull(),
    skillId: text("skill_id").notNull(),
    band: text("band", { enum: ["k1", "g23", "g45", "g68", "g912"] }).notNull(),
    prompt: text("prompt").notNull(),
    answer: text("answer").notNull(),
    distractors: text("distractors").notNull(), // JSON array of 3 strings
    readAloud: text("read_aloud"),
    level: integer("level").notNull().default(2), // 0–4
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("drill_item_pool_idx").on(table.poolId)]
);

/**
 * A hero's rung on one skill's ladder. Low mastery never locks anything; it
 * only picks easier questions, so a hard week costs nothing but practice.
 */
export const skillMastery = sqliteTable(
  "skill_mastery",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    skillId: text("skill_id").notNull(),
    level: integer("level").notNull().default(0), // 0–4
    recentResults: text("recent_results").notNull().default("[]"), // JSON booleans, newest last, max 10
    correctTotal: integer("correct_total").notNull().default(0),
    attemptTotal: integer("attempt_total").notNull().default(0),
    lastPracticedAt: integer("last_practiced_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("skill_mastery_child_skill_idx").on(table.childId, table.skillId)]
);

/**
 * One play of a deed. The questions (with answers) live here so grading is
 * server-side; the client only ever sees prompts and choices. Runs are the
 * Realm's own record and never touch the learning log or XP.
 */
export const deedRun = sqliteTable(
  "deed_run",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    deedId: text("deed_id").notNull(),
    skillIds: text("skill_ids").notNull(), // JSON string[]
    band: text("band", { enum: ["k1", "g23", "g45", "g68", "g912"] }).notNull(),
    questions: text("questions").notNull(), // JSON Question[] incl. answers — server-side only
    responses: text("responses").notNull().default("[]"), // JSON (string | null)[]
    // Mastery levels per skill when the run began, so the results screen can
    // say what changed without a second table.
    masteryStart: text("mastery_start").notNull().default("{}"), // JSON Record<skillId, level>
    correctCount: integer("correct_count").notNull().default(0),
    flawless: integer("flawless", { mode: "boolean" }).notNull().default(false),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("deed_run_child_completed_idx").on(table.childId, table.completedAt)]
);

/** How far a hero has raised each kingdom building. Cumulative across seasons. */
export const kingdomProgress = sqliteTable(
  "kingdom_progress",
  {
    id: text("id").primaryKey(),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    buildingId: text("building_id").notNull(),
    deedsDone: integer("deeds_done").notNull().default(0),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("kingdom_progress_child_building_idx").on(table.childId, table.buildingId)]
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

// ── Parent alerts ───────────────────────────────────────────

/**
 * In-app notices for the grown-ups: something a hero did that a parent should
 * know about. One row per event, raised for the family as a whole — who has
 * cleared it is tracked separately, in parentAlertDismissal, so each guardian
 * dismisses their own copy without hiding it from the others.
 *
 * The quest details are copied in rather than joined back out: an alert has to
 * still read correctly after the quest is renamed, or after it's removed and
 * the assignment row goes with it.
 */
export const parentAlert = sqliteTable(
  "parent_alert",
  {
    id: text("id").primaryKey(),
    familyId: text("family_id")
      .notNull()
      .references(() => family.id, { onDelete: "cascade" }),
    childId: text("child_id")
      .notNull()
      .references(() => child.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["quest_skipped", "quest_stuck"] }).notNull(),
    questAssignmentId: text("quest_assignment_id").references(() => questAssignment.id, {
      onDelete: "set null",
    }),
    childName: text("child_name").notNull(),
    questTitle: text("quest_title").notNull(),
    subjectName: text("subject_name"),
    date: text("date").notNull(), // ISO YYYY-MM-DD of the assignment
    note: text("note"), // the hero's own reason, when they gave one
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [index("parent_alert_family_idx").on(table.familyId, table.createdAt)]
);

/**
 * One row per (alert, guardian) once that guardian has cleared it. Absence is
 * what makes an alert "unread", so a guardian added to the family later still
 * sees anything still outstanding.
 *
 * userId is deliberately not a foreign key: demo mode signs in as a synthetic
 * user that has no row in `user`, and a dismissal is worth keeping even if the
 * membership behind it is rebuilt.
 */
export const parentAlertDismissal = sqliteTable(
  "parent_alert_dismissal",
  {
    id: text("id").primaryKey(),
    alertId: text("alert_id")
      .notNull()
      .references(() => parentAlert.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    dismissedAt: integer("dismissed_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    uniqueIndex("parent_alert_dismissal_unique_idx").on(table.alertId, table.userId),
    index("parent_alert_dismissal_user_idx").on(table.userId),
  ]
);
