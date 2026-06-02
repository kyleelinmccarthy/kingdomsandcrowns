import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Kingdoms & Crowns",
  description: "The terms that govern your use of Kingdoms & Crowns.",
};

const EFFECTIVE_DATE = "June 2, 2026";

export default function TermsPage() {
  return (
    <>
      <h1 className="page-title text-3xl">Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>

      <section className="mt-8 space-y-4">
        <p>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of Kingdoms &amp;
          Crowns (the &ldquo;app&rdquo;), a homeschool learning-log tool. By creating an
          account or using the app, you agree to these Terms. If you do not agree,
          please do not use the app.
        </p>
      </section>

      <h2 className="mt-10 text-xl font-semibold">1. Who can use the app</h2>
      <p>
        You must be at least 18 years old and capable of forming a binding contract to
        create an account. The app is intended for parents and guardians who manage
        homeschool activities for children in their care. You represent that any child
        profiles you create are for children you are legally responsible for, and that
        you have the authority to provide that information.
      </p>

      <h2 className="mt-10 text-xl font-semibold">2. Your account</h2>
      <ul className="list-disc pl-6">
        <li>You are responsible for keeping your sign-in credentials secret and for everything that happens under your account.</li>
        <li>You must provide accurate sign-up information and keep it current.</li>
        <li>You may not share your account with anyone outside your household.</li>
        <li>Notify us immediately at <a className="underline" href="mailto:support@kingdomsandcrowns.com">support@kingdomsandcrowns.com</a> if you suspect unauthorized access.</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold">3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul className="list-disc pl-6">
        <li>Use the app for any unlawful purpose, or in violation of any law applicable to you.</li>
        <li>Upload or enter content that is harassing, hateful, sexually explicit, or otherwise harmful to children.</li>
        <li>Attempt to gain unauthorized access to other accounts or to any part of the system.</li>
        <li>Probe, scan, or test the vulnerability of the app without our prior written permission, except in a security-research context that follows responsible-disclosure practices and is reported to <a className="underline" href="mailto:security@kingdomsandcrowns.com">security@kingdomsandcrowns.com</a>.</li>
        <li>Use bots, scrapers, or automated tools to access the app, except for accessibility tools you use personally.</li>
        <li>Interfere with or disrupt the integrity, performance, or other users&rsquo; experience of the app.</li>
        <li>Reverse-engineer, decompile, or attempt to derive source code from the app, except to the extent that applicable law expressly permits.</li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold">4. Your content</h2>
      <p>
        You retain all rights to the information you enter into the app (your family
        name, child profiles, learning activity, quest descriptions, feedback messages,
        and similar content — collectively, &ldquo;Your Content&rdquo;).
      </p>
      <p>
        You grant us a limited, non-exclusive, worldwide, royalty-free license to host,
        store, copy, transmit, display, and process Your Content solely for the
        purpose of operating the app for you. This license ends when Your Content is
        deleted from the app, subject to the limited retention described in our{" "}
        <a className="underline" href="/privacy">Privacy Policy</a>.
      </p>

      <h2 className="mt-10 text-xl font-semibold">5. Feedback</h2>
      <p>
        If you send us feedback, suggestions, or ideas through &ldquo;Send a
        Raven&rdquo; or otherwise, you grant us a perpetual, irrevocable, royalty-free
        license to use that feedback to improve the app, without any obligation to you.
      </p>

      <h2 className="mt-10 text-xl font-semibold">6. Our intellectual property</h2>
      <p>
        The app, including its design, code, logos, and gameplay elements (quests,
        badges, the castle progression system, the &ldquo;Send a Raven&rdquo; theme,
        etc.), is owned by us and protected by intellectual-property laws. You may use
        the app only as these Terms allow.
      </p>

      <h2 className="mt-10 text-xl font-semibold">7. Beta software</h2>
      <p>
        Kingdoms &amp; Crowns is early-stage software. Features may change, break, or
        be removed; data may, in rare cases, be lost despite our best efforts. We will
        do our best to preserve your data and give advance notice of significant
        changes, but you should not rely on the app as the sole record of your
        homeschool activity. Keep your own copies of anything critical.
      </p>

      <h2 className="mt-10 text-xl font-semibold">8. Suspension and termination</h2>
      <p>
        You may close your account at any time by deleting it in settings or by
        emailing us. We may suspend or terminate your account if you materially
        breach these Terms or use the app in a way that we reasonably believe creates
        legal or security risk for us or for other users; where practical, we will
        give you notice and an opportunity to fix the issue.
      </p>

      <h2 className="mt-10 text-xl font-semibold">9. Disclaimers</h2>
      <p>
        THE APP IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT
        WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF
        MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, AND
        ACCURACY. WE DO NOT WARRANT THAT THE APP WILL BE UNINTERRUPTED, ERROR-FREE,
        OR SECURE.
      </p>
      <p>
        The app is a learning-log and gamification tool. It is not educational
        curriculum, a school, or accredited record-keeping for any jurisdiction. You
        remain solely responsible for meeting any homeschool reporting or compliance
        requirements that apply to you.
      </p>

      <h2 className="mt-10 text-xl font-semibold">10. Limitation of liability</h2>
      <p>
        TO THE FULLEST EXTENT PERMITTED BY LAW, WE WILL NOT BE LIABLE FOR ANY
        INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR ANY
        LOSS OF DATA, REVENUE, OR PROFITS, ARISING OUT OF OR RELATED TO YOUR USE OF
        THE APP. OUR TOTAL LIABILITY FOR ANY CLAIM RELATED TO THE APP WILL NOT EXCEED
        THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE 12 MONTHS BEFORE THE CLAIM
        OR (B) USD $50.
      </p>

      <h2 className="mt-10 text-xl font-semibold">11. Indemnification</h2>
      <p>
        You agree to defend and indemnify us against any claims, damages, and expenses
        (including reasonable legal fees) arising out of your breach of these Terms,
        your misuse of the app, or your violation of any law or third-party rights.
      </p>

      <h2 className="mt-10 text-xl font-semibold">12. Changes to the Terms</h2>
      <p>
        We may update these Terms as the app evolves. When we make material changes
        we will update the &ldquo;Effective&rdquo; date and notify you in the app or by
        email. Continued use of the app after a change takes effect means you accept
        the updated Terms.
      </p>

      <h2 className="mt-10 text-xl font-semibold">13. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of Utah, United States,
        without regard to its conflict-of-laws principles. Any dispute that the
        parties cannot resolve informally will be brought exclusively in the state or
        federal courts located in Salt Lake County, Utah, and you and we consent to
        their personal jurisdiction.
      </p>

      <h2 className="mt-10 text-xl font-semibold">14. Contact</h2>
      <p>
        Questions about these Terms? Email{" "}
        <a className="underline" href="mailto:support@kingdomsandcrowns.com">
          support@kingdomsandcrowns.com
        </a>
        .
      </p>
    </>
  );
}
