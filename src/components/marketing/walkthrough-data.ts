import type { GameIconName } from "@/components/game-icon";

export type Persona = "parent" | "hero";

export type Callout = {
  /** 1-based marker, matched to the numbered chips beside the screenshot. */
  n: number;
  /** Short bold lead-in, e.g. "Hero showcase". */
  label: string;
  /** One sentence explaining what the persona sees or does. */
  body: string;
};

export type Screenshot = { src: string; alt: string; width: number; height: number };

/** A toggleable sub-view within a step (e.g. "new account" vs "invited"). */
export type StepVariant = {
  key: string;
  tabLabel: string;
  screenshot: Screenshot;
  callouts: Callout[];
};

export type WalkthroughStep = {
  /** Stable anchor id, e.g. "parent-hearth". */
  id: string;
  /** Fantasy page name shown as the eyebrow, e.g. "The Hearth". */
  routeLabel: string;
  /** Real app route, for reference. */
  path: string;
  icon: GameIconName;
  /** Step heading. */
  title: string;
  /** One-line "what this page is for". */
  summary: string;
  // A step has EITHER a single screenshot + callouts, OR 2+ toggleable variants.
  screenshot?: Screenshot;
  callouts?: Callout[];
  variants?: StepVariant[];
};

// Screenshots are captured from the app in demo mode (see scripts/capture-screens.mjs)
// at a 1280×800 viewport, so every card shares a 16:10 aspect ratio.
const SHOT_W = 1280;
const SHOT_H = 800;
// Screenshots live in a versioned folder (see scripts/capture-screens.mjs). The
// version is part of the path so re-captures get a fresh URL and never serve a
// stale, cached optimized image. Bump SCREENS_REV when re-running the capture.
export const SCREENS_REV = "r2";
const shot = (name: string, alt: string, w = SHOT_W, h = SHOT_H) => ({
  src: `/marketing/screens/${SCREENS_REV}/${name}.jpg`,
  alt,
  width: w,
  height: h,
});

export const WALKTHROUGH: Record<
  Persona,
  { label: string; icon: GameIconName; intro: string; steps: WalkthroughStep[] }
> = {
  parent: {
    label: "Parent's Journey",
    icon: "mage",
    intro:
      "As the grown-up, you run the kingdom: set up your family, hand out quests, and turn everyday learning into a chronicle you can keep. These are the real screens you'll use.",
    steps: [
      {
        id: "parent-account",
        routeLabel: "Getting Started",
        path: "/signup",
        icon: "crown",
        title: "Get started",
        summary:
          "Two ways in: create a new parent account, or — if someone invited you — accept the invitation to join their family.",
        variants: [
          {
            key: "new",
            tabLabel: "Create an account",
            screenshot: shot(
              "parent-signup",
              "The parent account sign-up screen asking for a name, email, and password",
            ),
            callouts: [
              { n: 1, label: "Parents only", body: "Just a name, email, and password — students never register on their own." },
              { n: 2, label: "Free to start", body: "Create your account and you're ready to set up your family." },
              { n: 3, label: "Or sign in", body: "Returning parents sign in with the same email or with Google." },
            ],
          },
          {
            key: "invited",
            tabLabel: "Accept an invite",
            screenshot: shot(
              "parent-invite",
              "An invitation screen showing the family, the guardian's role, and an Accept Invitation button",
              1280,
              560,
            ),
            callouts: [
              { n: 1, label: "From your email", body: "Co-parents, tutors, and teachers get an invite link sent to their email." },
              { n: 2, label: "See your role", body: "The invite shows which family you're joining and your access — view-only or can-edit." },
              { n: 3, label: "One tap to join", body: "Accept the invitation and you're in — no new family to set up." },
            ],
          },
        ],
      },
      {
        id: "parent-hearth",
        routeLabel: "The Hearth",
        path: "/settings",
        icon: "castle",
        title: "Set up your family",
        summary:
          "Your home base for the family — name your realm, recruit each student as a hero, and decide how they sign in.",
        screenshot: shot(
          "parent-hearth",
          "The Hearth settings page showing family setup and the roster of heroes",
        ),
        callouts: [
          { n: 1, label: "Name your realm", body: "Set your family name and timezone — the timezone governs quest days and streaks." },
          { n: 2, label: "Recruit heroes", body: "Add each student as a hero with a name, avatar, age or grade, and their subjects." },
          { n: 3, label: "Student-safe sign-in", body: "Give each hero a PIN or login you control, and share the family code so they can get in." },
          { n: 4, label: "Invite guardians", body: "Bring in a co-parent, tutor, or teacher with view-only or full-edit access." },
        ],
      },
      {
        id: "parent-quest-giver",
        routeLabel: "Quest Giver",
        path: "/scrolls",
        icon: "mage",
        title: "Turn lessons into quests",
        summary:
          "Build a library of reusable quest scrolls — the lessons and chores you'll assign again and again.",
        screenshot: shot(
          "parent-quest-giver",
          "The Quest Giver page listing reusable quest templates per subject",
        ),
        callouts: [
          { n: 1, label: "Quest scrolls", body: "Create quest templates by subject, with an estimate and description, ready to assign any day." },
          { n: 2, label: "Rewards & loot", body: "Attach XP and unlockable avatar loot so finishing a quest actually feels like a win." },
          { n: 3, label: "Per hero", body: "Switch between heroes to tailor each child's quest list to what they're studying." },
        ],
      },
      {
        id: "parent-tavern",
        routeLabel: "The Tavern",
        path: "/tavern",
        icon: "tavern",
        title: "See your heroes at a glance",
        summary:
          "The kingdom's home base — every hero's character, streak, and today's adventures in one view.",
        screenshot: shot(
          "parent-tavern",
          "The Tavern showing a hero's avatar, level, XP bar, streak, and recent activity",
        ),
        callouts: [
          { n: 1, label: "Hero showcase", body: "Avatar, level, XP bar, and current streak for the selected hero — switch heroes with a tap." },
          { n: 2, label: "Start a quest", body: "Log what a hero studied today right from the Tavern, with a timer or a quick complete." },
          { n: 3, label: "Recent Adventures", body: "A live feed of the latest logged learning across the family." },
        ],
      },
      {
        id: "parent-quest-log",
        routeLabel: "Quest Log",
        path: "/quests",
        icon: "scroll",
        title: "Assign, track, and record",
        summary:
          "Hand out today's quests, watch them get completed, and let the app assemble your weekly learning log.",
        screenshot: shot(
          "parent-quest-log",
          "The Quest Log showing today's assigned quests and their completion status",
        ),
        callouts: [
          { n: 1, label: "Today's quests", body: "See each hero's assigned quests and mark them done as the day goes." },
          { n: 2, label: "Adventure Log", body: "A running history of everything logged, grouped by subject." },
          { n: 3, label: "Weekly recap", body: "The Complete Adventure tab generates an editable summary you can copy into records or a portfolio." },
        ],
      },
      {
        id: "parent-treasure-chest",
        routeLabel: "Treasure Chest",
        path: "/loot",
        icon: "gem",
        title: "Celebrate the rewards",
        summary:
          "Every badge, bounty, and streak a hero has earned — plus the sealed relics still waiting to be unlocked.",
        screenshot: shot(
          "parent-treasure-chest",
          "The Treasure Chest showing earned badges, quest bounties, and locked relics",
        ),
        callouts: [
          { n: 1, label: "Hero stats", body: "Level, total XP, and current and best streak, right at the top." },
          { n: 2, label: "Claimed treasures", body: "Badges the hero has unlocked, each with the XP it awarded." },
          { n: 3, label: "Sealed relics", body: "Locked badges that hint at what's left to earn — motivation built in." },
        ],
      },
      {
        id: "parent-castle",
        routeLabel: "The Castle",
        path: "/castle",
        icon: "castle",
        title: "Build toward the castle",
        summary:
          "The long game — heroes work toward a stronghold they unlock and upgrade as they level up.",
        screenshot: shot(
          "parent-castle",
          "The Castle page showing the level progress bar and locked castle upgrade tiers",
        ),
        callouts: [
          { n: 1, label: "A goal to climb to", body: "A progress bar shows how many levels remain until the castle unlocks at level 50." },
          { n: 2, label: "Upgrade tiers", body: "Campsite, cottage, watchtower, and grander strongholds unlock as the hero climbs the levels." },
          { n: 3, label: "Make it theirs", body: "Once unlocked, heroes name their castle and choose upgrades." },
        ],
      },
      {
        id: "parent-hall-of-legends",
        routeLabel: "Hall of Legends",
        path: "/leaderboard",
        icon: "trophy",
        title: "See how they rank",
        summary:
          "A friendly leaderboard for your own heroes, plus an opt-in community hall if you want it.",
        screenshot: shot(
          "parent-hall-of-legends",
          "The Hall of Legends leaderboard ranking the family's heroes by glory",
        ),
        callouts: [
          { n: 1, label: "Guild ranks", body: "Your family's own leaderboard across every hero." },
          { n: 2, label: "Community hall", body: "An optional, opt-in leaderboard by XP, streak, or trophies across other families." },
          { n: 3, label: "You're in control", body: "Community visibility is off by default and set per hero." },
        ],
      },
    ],
  },
  hero: {
    label: "Hero's Journey",
    icon: "swords",
    intro:
      "This is what your student sees. Heroes sign in safely, take on quests, and watch their character grow with every lesson.",
    steps: [
      {
        id: "hero-login",
        routeLabel: "Entering the Realm",
        path: "/login?mode=kid",
        icon: "key",
        title: "Sign in, safely",
        summary:
          "Students get in with a family code and a PIN — never an email or password of their own.",
        screenshot: shot(
          "hero-login",
          "The student sign-in screen asking for a family code and PIN",
        ),
        callouts: [
          { n: 1, label: "Young Hero tab", body: "The sign-in screen opens straight to the student panel." },
          { n: 2, label: "Code + PIN", body: "Enter the family code, tap your hero, and type your PIN — that's it." },
          { n: 3, label: "No self-registration", body: "Only a grown-up can create heroes; students can only log in." },
        ],
      },
      {
        id: "hero-customize",
        routeLabel: "Your Hero",
        path: "/tavern",
        icon: "sparkles",
        title: "Create your hero",
        summary:
          "First things first — make your hero your own. Tap your character any time to open the customizer.",
        screenshot: shot(
          "hero-customize",
          "The Customize Your Hero screen with options for skin, hair, armor, and more",
        ),
        callouts: [
          { n: 1, label: "Make it yours", body: "Pick your skin, hair, armor, and flair to design a one-of-a-kind hero." },
          { n: 2, label: "Unlock as you go", body: "New outfits, pets, and crests unlock as you level up and earn badges." },
          { n: 3, label: "Save your look", body: "Tap Save Hero Look and your character shows up all across the app." },
        ],
      },
      {
        id: "hero-my-tavern",
        routeLabel: "My Tavern",
        path: "/tavern",
        icon: "tavern",
        title: "Meet your hero",
        summary:
          "Your very own home base — your character, your streak, and everything you've been up to.",
        screenshot: shot(
          "hero-my-tavern",
          "A student's Tavern showing their avatar, level, XP, and streak",
        ),
        callouts: [
          { n: 1, label: "My character", body: "Your avatar, your level, and how much XP until you level up." },
          { n: 2, label: "My streak", body: "Keep a daily streak alive to unlock special gear." },
          { n: 3, label: "Recent Adventures", body: "A log of the quests you've completed lately." },
        ],
      },
      {
        id: "hero-my-quests",
        routeLabel: "My Quests",
        path: "/quests",
        icon: "swords",
        title: "Take on your quests",
        summary:
          "Your assignments for the day, ready to start — and worth XP the moment you finish.",
        screenshot: shot(
          "hero-my-quests",
          "A student's quest list for today with Start and Complete actions",
        ),
        callouts: [
          { n: 1, label: "Today's quests", body: "See exactly what's assigned to you today." },
          { n: 2, label: "Start or complete", body: "Use the timer or mark it done — each quest earns XP." },
          { n: 3, label: "Adventure Log", body: "A growing record of your heroic deeds." },
        ],
      },
      {
        id: "hero-my-trophies",
        routeLabel: "My Trophies",
        path: "/loot",
        icon: "trophy",
        title: "Collect your loot",
        summary:
          "Every badge and reward you've won — and a peek at the treasures still to come.",
        screenshot: shot(
          "hero-my-trophies",
          "A student's trophies page showing earned badges and locked relics",
        ),
        callouts: [
          { n: 1, label: "Level & XP", body: "Your rank and your progress toward the next level." },
          { n: 2, label: "Claimed treasures", body: "All the badges you've unlocked so far." },
          { n: 3, label: "Sealed relics", body: "Locked trophies to chase next." },
        ],
      },
      {
        id: "hero-my-castle",
        routeLabel: "My Castle",
        path: "/castle",
        icon: "castle",
        title: "Earn your castle",
        summary:
          "The big reward — a stronghold you unlock at level 50 and make your own.",
        screenshot: shot(
          "hero-my-castle",
          "A student's castle page showing progress toward unlocking the castle",
        ),
        callouts: [
          { n: 1, label: "Level up to unlock", body: "A progress bar shows how close you are to your castle at level 50." },
          { n: 2, label: "Build & upgrade", body: "Once it's yours, name it and upgrade your stronghold as you level up." },
        ],
      },
      {
        id: "hero-ranks",
        routeLabel: "Ranks",
        path: "/leaderboard",
        icon: "trophy",
        title: "See how you rank",
        summary:
          "Compare your glory with the other heroes in your family — and beyond, if you opt in.",
        screenshot: shot(
          "hero-ranks",
          "A student's view of the family leaderboard highlighting their own rank",
        ),
        callouts: [
          { n: 1, label: "Guild ranks", body: "See where you stand among the heroes in your family." },
          { n: 2, label: "Community hall", body: "Opt in to appear on community leaderboards, or stay hidden." },
        ],
      },
    ],
  },
};

export const PERSONA_ORDER: Persona[] = ["parent", "hero"];
