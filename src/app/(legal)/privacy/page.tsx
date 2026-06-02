import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Kingdoms & Crowns",
  description: "How Kingdoms & Crowns collects, uses, and protects your data.",
};

const EFFECTIVE_DATE = "June 2, 2026";

export default function PrivacyPage() {
  return (
    <>
      <h1 className="page-title text-3xl">Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>

      <section className="mt-8 space-y-4">
        <p>
          Kingdoms &amp; Crowns (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;the
          app&rdquo;) is a homeschool learning-log tool used by parents to track their
          children&rsquo;s educational activities. This policy explains what we collect,
          why, and the choices you have. We tried to write this in plain language;
          where we use legal terms we&rsquo;ve done so because we think they protect you,
          not us.
        </p>
        <p>
          <strong>Quick summary:</strong> Only the parent has an account. Children are
          profiles managed by the parent and never sign in directly. We don&rsquo;t sell
          your data, we don&rsquo;t use it for advertising, and we don&rsquo;t share it
          with third parties beyond the service providers strictly necessary to run the
          app.
        </p>
      </section>

      <h2 className="mt-10 text-xl font-semibold">1. Who the app is for</h2>
      <p>
        Kingdoms &amp; Crowns is designed for <strong>parents and guardians</strong>{" "}
        who homeschool school-age children. Account holders must be at least 18 years
        old. Children do not create accounts and we do not collect personal data
        directly from children — all child information is entered by the parent.
      </p>

      <h2 className="mt-10 text-xl font-semibold">2. Information we collect</h2>

      <h3 className="mt-4 font-medium">Parent (account holder) information</h3>
      <ul className="list-disc pl-6">
        <li>Name and email address you provide at sign-up, or that Google shares with us if you sign in with Google (name, email, profile image, Google account ID).</li>
        <li>An encrypted hash of your password if you choose email/password sign-in. We never see or store your plaintext password.</li>
        <li>Family name and time zone you configure in settings.</li>
      </ul>

      <h3 className="mt-4 font-medium">Child profile information (entered by the parent)</h3>
      <ul className="list-disc pl-6">
        <li>Display name (a first name or nickname — we recommend not using a full legal name).</li>
        <li>Birth year (used to set age-appropriate features).</li>
        <li>A short numeric PIN, stored as an encrypted hash, used so the right child can sign on to their own profile from the parent&rsquo;s session.</li>
        <li>Avatar configuration and any learning subjects you create for the child.</li>
      </ul>

      <h3 className="mt-4 font-medium">Learning activity</h3>
      <ul className="list-disc pl-6">
        <li>Quest titles, descriptions, time spent, completion status, and notes you or your child enter.</li>
        <li>Weekly summaries, badges earned, XP, streaks, and other gameplay state.</li>
        <li>Teacher feedback text you choose to paste in, and any draft responses you write.</li>
      </ul>

      <h3 className="mt-4 font-medium">Technical information</h3>
      <ul className="list-disc pl-6">
        <li>Session cookies required to keep you signed in.</li>
        <li>IP address and user-agent string of devices that authenticate, used for security and abuse prevention.</li>
        <li>Server logs of errors and unusual activity.</li>
        <li>If you send us feedback through &ldquo;Send a Raven,&rdquo; we capture the page you were on, your viewport size, and the user-agent string along with your message — to help us reproduce bugs.</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold">3. How we use the information</h2>
      <ul className="list-disc pl-6">
        <li>To operate the app: show your family their quests, log activity, award badges, generate weekly summaries.</li>
        <li>To authenticate you and keep your account secure.</li>
        <li>To send transactional emails such as password resets and (if you opt in) quest reminders.</li>
        <li>To respond to feedback and support requests you initiate.</li>
        <li>To diagnose and fix bugs and to improve features based on aggregate, non-identifying usage patterns.</li>
      </ul>
      <p>
        We do <strong>not</strong> use your data to train advertising profiles, sell it
        to data brokers, or expose it to third parties for marketing.
      </p>

      <h2 className="mt-10 text-xl font-semibold">4. Children&rsquo;s privacy</h2>
      <p>
        Because the app is designed for parental use, all child information is
        provided and managed by the parent under their own account. We treat child
        profile data as belonging to the parent&rsquo;s account and apply the same
        protections to it as to the parent&rsquo;s own information. We do not knowingly
        accept accounts created by children, and we do not collect data from children
        through any direct channel (such as ads, social features, or open chat).
      </p>
      <p>
        If you are a parent and you would like to review, export, or delete information
        about your child held in the app, you can do so from the Hearth (settings) page
        or by contacting us at the address below.
      </p>

      <h2 className="mt-10 text-xl font-semibold">5. Service providers we use</h2>
      <ul className="list-disc pl-6">
        <li><strong>Turso</strong> (libSQL hosting) — stores your account, family, and learning data.</li>
        <li><strong>Vercel</strong> — hosts and serves the app.</li>
        <li><strong>Google</strong> — only if you choose &ldquo;Continue with Google&rdquo; to sign in; Google shares your name, email, profile picture, and Google account ID with us.</li>
        <li><strong>Resend</strong> — sends transactional emails (password reset, quest reminders, feedback acknowledgements).</li>
      </ul>
      <p>
        Each provider is contractually limited to processing your data on our behalf
        for the purposes listed above.
      </p>

      <h2 className="mt-10 text-xl font-semibold">6. How long we keep data</h2>
      <ul className="list-disc pl-6">
        <li>Account and family data: kept while your account is active.</li>
        <li>Learning activity: kept while your account is active, so you can produce weekly summaries and longitudinal records.</li>
        <li>Session records: deleted on sign-out or when they expire.</li>
        <li>Feedback messages: kept indefinitely so we can correlate issues across releases.</li>
      </ul>
      <p>
        When you delete your account, we delete your account, family, child profiles,
        and learning activity within 30 days, except where we are required to keep
        limited records to comply with law or resolve disputes.
      </p>

      <h2 className="mt-10 text-xl font-semibold">7. Your choices</h2>
      <ul className="list-disc pl-6">
        <li><strong>Access &amp; export:</strong> You can view all data stored about your family inside the app. Email us if you need a machine-readable export.</li>
        <li><strong>Correction:</strong> Update any information in the Hearth (settings) page.</li>
        <li><strong>Deletion:</strong> Delete individual child profiles in settings; email us to delete your entire account.</li>
        <li><strong>Opt out of optional emails:</strong> Quest reminders and other non-essential notifications can be disabled in notification preferences.</li>
        <li><strong>Sign-in choice:</strong> You can sign in with email/password or with Google; you can switch between them by contacting us.</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold">8. Security</h2>
      <p>
        We use industry-standard practices: encrypted transport (HTTPS),
        bcrypt-hashed passwords and PINs, scoped database access, and strict
        same-origin / no-frame headers on all pages. No system is perfectly secure;
        if we ever discover a breach affecting your data, we will notify you promptly
        and follow applicable law.
      </p>

      <h2 className="mt-10 text-xl font-semibold">9. International users</h2>
      <p>
        The app is operated from the United States and your data is stored on
        infrastructure that may be located in the U.S. or other countries where our
        service providers operate. By using the app, you consent to this transfer.
      </p>

      <h2 className="mt-10 text-xl font-semibold">10. Changes to this policy</h2>
      <p>
        We may update this policy as the app evolves. When we make material changes,
        we will update the &ldquo;Effective&rdquo; date at the top and notify you in the
        app or by email before the change takes effect.
      </p>

      <h2 className="mt-10 text-xl font-semibold">11. Contact</h2>
      <p>
        Questions, requests, or concerns? Email us at{" "}
        <a className="underline" href="mailto:privacy@kingdomsandcrowns.com">
          privacy@kingdomsandcrowns.com
        </a>
        .
      </p>
    </>
  );
}
