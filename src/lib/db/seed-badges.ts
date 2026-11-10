/**
 * Seeds badge definitions into a production database.
 * Run with: npx tsx src/lib/db/seed-badges.ts
 *
 * Safe to run multiple times — uses onConflictDoNothing().
 */
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "file:./local.db",
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const db = drizzle(client, { schema });

const badges = [
  // ── Streak badges (8) ─────────────────────────────────────
  { id: "badge-streak-3", name: "3-Day Streak", description: "Log activities 3 days in a row", icon: "flame", category: "streak" as const, criteria: '{"streakDays":3}', xpReward: 10 },
  { id: "badge-streak-7", name: "Week Warrior", description: "Log activities 7 days in a row", icon: "flame", category: "streak" as const, criteria: '{"streakDays":7}', xpReward: 25 },
  { id: "badge-streak-14", name: "Two-Week Titan", description: "Log activities 14 days in a row", icon: "flame", category: "streak" as const, criteria: '{"streakDays":14}', xpReward: 35 },
  { id: "badge-streak-30", name: "Monthly Master", description: "Log activities 30 days in a row", icon: "crown", category: "streak" as const, criteria: '{"streakDays":30}', xpReward: 50 },
  { id: "badge-streak-60", name: "60-Day Streak", description: "Log activities 60 days in a row", icon: "fire-ring", category: "streak" as const, criteria: '{"streakDays":60}', xpReward: 75 },
  { id: "badge-streak-90", name: "90-Day Streak", description: "Log activities 90 days in a row — a true champion!", icon: "fire-ring", category: "streak" as const, criteria: '{"streakDays":90}', xpReward: 100 },
  { id: "badge-streak-180", name: "Half-Year Hero", description: "Log activities 180 days in a row", icon: "fire-crown", category: "streak" as const, criteria: '{"streakDays":180}', xpReward: 150 },
  { id: "badge-streak-365", name: "Year of Legends", description: "Log activities 365 days in a row — legendary!", icon: "fire-crown", category: "streak" as const, criteria: '{"streakDays":365}', xpReward: 250 },

  // ── Volume badges (10) ────────────────────────────────────
  { id: "badge-special-first", name: "First Steps", description: "Complete your very first activity", icon: "star", category: "special" as const, criteria: '{"totalActivities":1}', xpReward: 5 },
  { id: "badge-volume-10", name: "Getting Started", description: "Log 10 activities", icon: "medal", category: "volume" as const, criteria: '{"totalActivities":10}', xpReward: 10 },
  { id: "badge-volume-25", name: "Dedicated Scholar", description: "Log 25 activities", icon: "medal", category: "volume" as const, criteria: '{"totalActivities":25}', xpReward: 20 },
  { id: "badge-volume-50", name: "Busy Bee", description: "Log 50 activities", icon: "bee", category: "volume" as const, criteria: '{"totalActivities":50}', xpReward: 30 },
  { id: "badge-volume-100", name: "Century Club", description: "Log 100 activities", icon: "trophy", category: "volume" as const, criteria: '{"totalActivities":100}', xpReward: 50 },
  { id: "badge-volume-250", name: "Tireless Adventurer", description: "Log 250 activities", icon: "trophy", category: "volume" as const, criteria: '{"totalActivities":250}', xpReward: 75 },
  { id: "badge-volume-500", name: "Legend in the Making", description: "Log 500 activities", icon: "diamond", category: "volume" as const, criteria: '{"totalActivities":500}', xpReward: 100 },
  { id: "badge-volume-750", name: "Unstoppable Force", description: "Log 750 activities", icon: "diamond", category: "volume" as const, criteria: '{"totalActivities":750}', xpReward: 150 },
  { id: "badge-volume-1000", name: "The Thousand", description: "Log 1,000 activities — a true legend!", icon: "gem", category: "volume" as const, criteria: '{"totalActivities":1000}', xpReward: 200 },
  { id: "badge-volume-2000", name: "Eternal Scholar", description: "Log 2,000 activities", icon: "gem", category: "volume" as const, criteria: '{"totalActivities":2000}', xpReward: 300 },

  // ── Subject badges (10) ───────────────────────────────────
  { id: "badge-subject-star", name: "Subject Star", description: "Log 20 activities in a single subject", icon: "star", category: "subject" as const, criteria: '{"subjectActivities":20}', xpReward: 15 },
  { id: "badge-polymath", name: "Polymath", description: "Log 10+ activities in 3 different subjects", icon: "trophy", category: "subject" as const, criteria: '{"subjectCount":3,"minPerSubject":10}', xpReward: 25 },
  { id: "badge-subject-50", name: "Deep Scholar", description: "Log 50 activities in a single subject", icon: "scroll", category: "subject" as const, criteria: '{"subjectActivities":50}', xpReward: 35 },
  { id: "badge-renaissance", name: "Renaissance Hero", description: "Log 20+ activities in 5 different subjects", icon: "scroll", category: "subject" as const, criteria: '{"subjectCount":5,"minPerSubject":20}', xpReward: 50 },
  { id: "badge-subject-100", name: "Subject Master", description: "Log 100 activities in a single subject", icon: "book", category: "subject" as const, criteria: '{"subjectActivities":100}', xpReward: 75 },
  { id: "badge-grand-polymath", name: "Grand Polymath", description: "Log 50+ activities in 5 different subjects", icon: "book", category: "subject" as const, criteria: '{"subjectCount":5,"minPerSubject":50}', xpReward: 100 },
  { id: "badge-subject-250", name: "Subject Legend", description: "Log 250 activities in a single subject", icon: "crown", category: "subject" as const, criteria: '{"subjectActivities":250}', xpReward: 125 },
  { id: "badge-universal", name: "Universal Scholar", description: "Log 100+ activities in 3 different subjects", icon: "crown", category: "subject" as const, criteria: '{"subjectCount":3,"minPerSubject":100}', xpReward: 150 },
  { id: "badge-subject-500", name: "Subject Titan", description: "Log 500 activities in a single subject", icon: "gem", category: "subject" as const, criteria: '{"subjectActivities":500}', xpReward: 200 },
  { id: "badge-omniscient", name: "Omniscient", description: "Log 100+ activities in 5 different subjects", icon: "gem", category: "subject" as const, criteria: '{"subjectCount":5,"minPerSubject":100}', xpReward: 250 },

  // ── Special badges (10) ───────────────────────────────────
  { id: "badge-special-weekend", name: "Weekend Warrior", description: "Log activities on both Saturday and Sunday in the same week", icon: "shield", category: "special" as const, criteria: '{"weekendWarrior":true}', xpReward: 15 },
  { id: "badge-special-perfect-week", name: "Perfect Week", description: "Log at least one activity every day for a full week", icon: "star", category: "special" as const, criteria: '{"streakDays":7}', xpReward: 25 },
  { id: "badge-special-early-bird", name: "Early Bird", description: "Complete 10 quests before noon", icon: "sunrise", category: "special" as const, criteria: '{"earlyBirdQuests":10}', xpReward: 20 },
  { id: "badge-special-night-owl", name: "Night Owl", description: "Complete 10 quests after 6pm", icon: "moon", category: "special" as const, criteria: '{"nightOwlQuests":10}', xpReward: 20 },
  { id: "badge-special-quest-10", name: "Quest Starter", description: "Complete 10 scheduled quests", icon: "sword", category: "special" as const, criteria: '{"questsCompleted":10}', xpReward: 15 },
  { id: "badge-special-quest-50", name: "Quest Hunter", description: "Complete 50 scheduled quests", icon: "sword", category: "special" as const, criteria: '{"questsCompleted":50}', xpReward: 35 },
  { id: "badge-special-quest-100", name: "Quest Champion", description: "Complete 100 scheduled quests", icon: "shield", category: "special" as const, criteria: '{"questsCompleted":100}', xpReward: 50 },
  { id: "badge-special-quest-250", name: "Quest Legend", description: "Complete 250 scheduled quests", icon: "shield", category: "special" as const, criteria: '{"questsCompleted":250}', xpReward: 100 },
  { id: "badge-special-level-50", name: "Half-Century", description: "Reach level 50", icon: "crown", category: "special" as const, criteria: '{"levelReached":50}', xpReward: 100 },
  { id: "badge-special-level-100", name: "Centurion", description: "Reach level 100 — the pinnacle of heroism!", icon: "gem", category: "special" as const, criteria: '{"levelReached":100}', xpReward: 500 },

  // ── Explorer badges (6) ───────────────────────────────────
  { id: "badge-explorer-subjects-3", name: "Curious Mind", description: "Try 3 different subjects", icon: "compass", category: "special" as const, criteria: '{"subjectCount":3,"minPerSubject":1}', xpReward: 10 },
  { id: "badge-explorer-subjects-5", name: "Wide Explorer", description: "Try 5 different subjects", icon: "compass", category: "special" as const, criteria: '{"subjectCount":5,"minPerSubject":1}', xpReward: 20 },
  { id: "badge-explorer-subjects-7", name: "Knowledge Seeker", description: "Try 7 different subjects", icon: "compass", category: "special" as const, criteria: '{"subjectCount":7,"minPerSubject":1}', xpReward: 30 },
  { id: "badge-explorer-quest-variety", name: "Variety Adventurer", description: "Complete quests in 5 different subjects", icon: "map", category: "special" as const, criteria: '{"subjectCount":5,"minPerSubject":5}', xpReward: 25 },
  { id: "badge-explorer-marathon", name: "Marathon Scholar", description: "Log 5+ activities in a single day", icon: "lightning", category: "special" as const, criteria: '{"dailyActivities":5}', xpReward: 20 },
  { id: "badge-explorer-blitz", name: "Knowledge Blitz", description: "Log 10+ activities in a single day", icon: "lightning", category: "special" as const, criteria: '{"dailyActivities":10}', xpReward: 40 },

  // ── Study Time badges (8) ─────────────────────────────────
  // Total accumulated learning time — rewards dedication
  { id: "badge-time-1hr", name: "First Hour", description: "Accumulate 1 hour of total study time", icon: "hourglass", category: "special" as const, criteria: '{"totalMinutes":60}', xpReward: 10 },
  { id: "badge-time-5hr", name: "Steady Learner", description: "Accumulate 5 hours of total study time", icon: "hourglass", category: "special" as const, criteria: '{"totalMinutes":300}', xpReward: 20 },
  { id: "badge-time-10hr", name: "Apprentice Scholar", description: "Accumulate 10 hours of total study time", icon: "hourglass", category: "special" as const, criteria: '{"totalMinutes":600}', xpReward: 30 },
  { id: "badge-time-25hr", name: "Dedicated Student", description: "Accumulate 25 hours of total study time", icon: "clock", category: "special" as const, criteria: '{"totalMinutes":1500}', xpReward: 50 },
  { id: "badge-time-50hr", name: "Knowledge Seeker", description: "Accumulate 50 hours of total study time", icon: "clock", category: "special" as const, criteria: '{"totalMinutes":3000}', xpReward: 75 },
  { id: "badge-time-100hr", name: "Centurion of Learning", description: "Accumulate 100 hours of total study time", icon: "clock", category: "special" as const, criteria: '{"totalMinutes":6000}', xpReward: 100 },
  { id: "badge-time-250hr", name: "Master of Hours", description: "Accumulate 250 hours of total study time", icon: "infinity", category: "special" as const, criteria: '{"totalMinutes":15000}', xpReward: 150 },
  { id: "badge-time-500hr", name: "Sage of Ages", description: "Accumulate 500 hours of study — a true sage!", icon: "infinity", category: "special" as const, criteria: '{"totalMinutes":30000}', xpReward: 250 },

  // ── Focus & Deep Work badges (6) ──────────────────────────
  // Rewards focused study sessions and deep work habits
  { id: "badge-focus-15", name: "Focused Start", description: "Complete a 15-minute study session", icon: "brain", category: "special" as const, criteria: '{"longestSession":15}', xpReward: 5 },
  { id: "badge-focus-30", name: "Deep Thinker", description: "Complete a 30-minute focused study session", icon: "brain", category: "special" as const, criteria: '{"longestSession":30}', xpReward: 15 },
  { id: "badge-focus-60", name: "Hour of Power", description: "Complete a full 60-minute study session", icon: "brain", category: "special" as const, criteria: '{"longestSession":60}', xpReward: 30 },
  { id: "badge-focus-90", name: "Deep Scholar", description: "Complete a 90-minute deep work session", icon: "telescope", category: "special" as const, criteria: '{"longestSession":90}', xpReward: 50 },
  { id: "badge-focus-120", name: "Marathon Mind", description: "Complete a 2-hour study marathon", icon: "telescope", category: "special" as const, criteria: '{"longestSession":120}', xpReward: 75 },
  { id: "badge-focus-180", name: "Unbreakable Focus", description: "Complete a 3-hour study session — legendary concentration!", icon: "telescope", category: "special" as const, criteria: '{"longestSession":180}', xpReward: 100 },

  // ── Timer Discipline badges (4) ────────────────────────────
  // Rewards using the quest timer to build good study habits
  { id: "badge-timer-1", name: "Timekeeper", description: "Complete your first timed study session", icon: "timer", category: "special" as const, criteria: '{"timerActivities":1}', xpReward: 5 },
  { id: "badge-timer-10", name: "Clock Watcher", description: "Complete 10 timed study sessions", icon: "timer", category: "special" as const, criteria: '{"timerActivities":10}', xpReward: 15 },
  { id: "badge-timer-50", name: "Time Master", description: "Complete 50 timed study sessions", icon: "timer", category: "special" as const, criteria: '{"timerActivities":50}', xpReward: 35 },
  { id: "badge-timer-100", name: "Chrono Champion", description: "Complete 100 timed study sessions", icon: "timer", category: "special" as const, criteria: '{"timerActivities":100}', xpReward: 60 },

  // ── Consistency & Habit badges (8) ────────────────────────
  // Rewards showing up regularly over long periods
  { id: "badge-days-10", name: "Ten-Day Scholar", description: "Study on 10 different days", icon: "calendar", category: "special" as const, criteria: '{"distinctDays":10}', xpReward: 10 },
  { id: "badge-days-30", name: "Monthly Learner", description: "Study on 30 different days", icon: "calendar", category: "special" as const, criteria: '{"distinctDays":30}', xpReward: 25 },
  { id: "badge-days-100", name: "Hundred Days of Learning", description: "Study on 100 different days", icon: "calendar", category: "special" as const, criteria: '{"distinctDays":100}', xpReward: 50 },
  { id: "badge-days-200", name: "Devoted Scholar", description: "Study on 200 different days", icon: "calendar", category: "special" as const, criteria: '{"distinctDays":200}', xpReward: 75 },
  { id: "badge-days-365", name: "Year of Knowledge", description: "Study on 365 different days — a full year of learning!", icon: "calendar", category: "special" as const, criteria: '{"distinctDays":365}', xpReward: 150 },
  { id: "badge-weeks-4", name: "Month of Weeks", description: "Study in 4 different weeks", icon: "calendar", category: "special" as const, criteria: '{"distinctWeeks":4}', xpReward: 10 },
  { id: "badge-weeks-12", name: "Quarterly Scholar", description: "Study in 12 different weeks — a full quarter!", icon: "calendar", category: "special" as const, criteria: '{"distinctWeeks":12}', xpReward: 30 },
  { id: "badge-weeks-52", name: "Year-Round Learner", description: "Study in 52 different weeks — every week for a year!", icon: "calendar", category: "special" as const, criteria: '{"distinctWeeks":52}', xpReward: 100 },

  // ── Balanced Learning badges (6) ──────────────────────────
  // Rewards studying multiple subjects and well-rounded education
  { id: "badge-balanced-2", name: "Double Major", description: "Study 2 different subjects in a single day", icon: "scales", category: "subject" as const, criteria: '{"dailySubjects":2}', xpReward: 10 },
  { id: "badge-balanced-3", name: "Triple Threat", description: "Study 3 different subjects in a single day", icon: "scales", category: "subject" as const, criteria: '{"dailySubjects":3}', xpReward: 20 },
  { id: "badge-balanced-4", name: "Well-Rounded", description: "Study 4 different subjects in a single day", icon: "scales", category: "subject" as const, criteria: '{"dailySubjects":4}', xpReward: 30 },
  { id: "badge-balanced-5", name: "Renaissance Day", description: "Study 5+ subjects in a single day — a true Renaissance scholar!", icon: "scales", category: "subject" as const, criteria: '{"dailySubjects":5}', xpReward: 50 },
  { id: "badge-subject-depth-5hr", name: "Subject Apprentice", description: "Spend 5+ hours studying a single subject", icon: "book", category: "subject" as const, criteria: '{"subjectMinutes":300}', xpReward: 25 },
  { id: "badge-subject-depth-20hr", name: "Subject Expert", description: "Spend 20+ hours studying a single subject", icon: "book", category: "subject" as const, criteria: '{"subjectMinutes":1200}', xpReward: 60 },

  // ── Intensive Study Day badges (4) ────────────────────────
  // Rewards putting in a full day of focused learning
  { id: "badge-daily-1hr", name: "Productive Day", description: "Log 1+ hours of study in a single day", icon: "sun", category: "special" as const, criteria: '{"dailyMinutes":60}', xpReward: 10 },
  { id: "badge-daily-2hr", name: "Study Marathon", description: "Log 2+ hours of study in a single day", icon: "sun", category: "special" as const, criteria: '{"dailyMinutes":120}', xpReward: 25 },
  { id: "badge-daily-4hr", name: "Full Study Day", description: "Log 4+ hours of study in a single day", icon: "sun", category: "special" as const, criteria: '{"dailyMinutes":240}', xpReward: 50 },
  { id: "badge-daily-6hr", name: "Academic Ironman", description: "Log 6+ hours of study in a single day — incredible dedication!", icon: "sun", category: "special" as const, criteria: '{"dailyMinutes":360}', xpReward: 75 },
];

async function seedBadges() {
  console.log("Seeding badge definitions...");

  for (const b of badges) {
    await db.insert(schema.badge).values(b).onConflictDoNothing();
  }

  console.log(`Seeded ${badges.length} badge definitions.`);
  process.exit(0);
}

seedBadges().catch((err) => {
  console.error("Badge seed failed:", err);
  process.exit(1);
});
