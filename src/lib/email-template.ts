/**
 * Kingdoms & Crowns branded transactional email.
 *
 * Renders a dark, ornate fantasy-RPG email matching the site's palette
 * (deep navy background, gold accents, cream body text) using table-based
 * layout + inline styles so it survives Gmail / Outlook / Apple Mail.
 *
 * `brandedEmail()` returns BOTH an `html` body and a plain-text fallback so a
 * single call site can pass them straight to `sendEmail`.
 */
import { appBaseUrl } from "./email";

// ── Brand palette (mirrors globals.css) ───────────────────────
const C = {
  bg: "#080c18", // outer background
  card: "#101a2e", // panel background
  goldBorder: "rgba(201, 168, 76, 0.35)",
  gold: "#c9a84c",
  goldBright: "#e0c068",
  cream: "#c8bfa8", // body text
  creamDim: "#8a8270", // muted text
  ink: "#0a0f1c", // text on gold button
  cyan: "#3ecfff",
};

// Email clients can't load custom webfonts; use a serif stack that evokes the
// site's Balthazar/Grenze headings, with sensible fallbacks.
const SERIF = "Georgia, 'Palatino Linotype', 'Book Antiqua', Palatino, serif";

export type EmailButton = { label: string; url: string };

export type BrandedEmailOptions = {
  /** Hidden inbox-preview text. */
  preheader?: string;
  /** Large gold heading inside the card. */
  heading: string;
  /** Optional opening line, e.g. "Hail, Aria!" */
  greeting?: string;
  /** Body paragraphs (plain strings, rendered in order). */
  paragraphs: string[];
  /** Primary call-to-action button. */
  button?: EmailButton;
  /** Lines shown beneath the button (e.g. a raw link or a family code). */
  afterButton?: string[];
  /** Small print under the card (defaults to an expiry-free brand line). */
  footnote?: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function brandedEmail(opts: BrandedEmailOptions): { html: string; text: string } {
  const base = appBaseUrl();
  const year = String(new Date().getFullYear());

  const paragraphsHtml = opts.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${SERIF};font-size:16px;line-height:1.6;color:${C.cream};">${escapeHtml(
          p
        )}</p>`
    )
    .join("");

  const greetingHtml = opts.greeting
    ? `<p style="margin:0 0 16px;font-family:${SERIF};font-size:18px;line-height:1.5;color:${C.goldBright};">${escapeHtml(
        opts.greeting
      )}</p>`
    : "";

  const buttonHtml = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px;">
         <tr>
           <td align="center" bgcolor="${C.gold}" style="border-radius:8px;">
             <a href="${escapeHtml(opts.button.url)}"
                style="display:inline-block;padding:14px 30px;font-family:${SERIF};font-size:16px;font-weight:bold;letter-spacing:0.5px;color:${C.ink};text-decoration:none;border-radius:8px;">
               ${escapeHtml(opts.button.label)}
             </a>
           </td>
         </tr>
       </table>`
    : "";

  const afterButtonHtml = (opts.afterButton ?? [])
    .map(
      (line) =>
        `<p style="margin:8px 0 0;font-family:${SERIF};font-size:13px;line-height:1.5;color:${C.creamDim};word-break:break-all;">${escapeHtml(
          line
        )}</p>`
    )
    .join("");

  const footnote =
    opts.footnote ??
    "You received this scroll because a grown-up manages a Kingdoms & Crowns family.";

  const preheaderHtml = opts.preheader
    ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.bg};">${escapeHtml(
        opts.preheader
      )}</span>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};">
${preheaderHtml}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
        <!-- Brand header -->
        <tr>
          <td align="center" style="padding-bottom:22px;">
            <div style="font-size:42px;line-height:1;">&#128081;</div>
            <div style="font-family:${SERIF};font-size:26px;font-weight:bold;letter-spacing:1px;color:${C.goldBright};padding-top:8px;">Kingdoms &amp; Crowns</div>
            <div style="font-family:${SERIF};font-size:11px;letter-spacing:3px;text-transform:uppercase;color:${C.creamDim};padding-top:6px;">Be the Hero of Homeschool</div>
          </td>
        </tr>
        <!-- Card -->
        <tr>
          <td style="background:${C.card};border:1px solid ${C.goldBorder};border-radius:14px;padding:32px;">
            <h1 style="margin:0 0 18px;font-family:${SERIF};font-size:23px;line-height:1.3;color:${C.goldBright};">${escapeHtml(
              opts.heading
            )}</h1>
            ${greetingHtml}
            ${paragraphsHtml}
            ${buttonHtml}
            ${afterButtonHtml}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td align="center" style="padding:22px 8px 0;">
            <p style="margin:0 0 8px;font-family:${SERIF};font-size:12px;line-height:1.5;color:${C.creamDim};">${escapeHtml(
              footnote
            )}</p>
            <p style="margin:0;font-family:${SERIF};font-size:12px;color:${C.creamDim};">
              <a href="${base}/privacy" style="color:${C.cyan};text-decoration:none;">Privacy</a>
              &nbsp;&middot;&nbsp;
              <a href="${base}/terms" style="color:${C.cyan};text-decoration:none;">Terms</a>
              &nbsp;&middot;&nbsp;
              &copy; ${year} Kingdoms &amp; Crowns
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  // Plain-text fallback.
  const textParts: string[] = ["Kingdoms & Crowns", ""];
  if (opts.greeting) textParts.push(opts.greeting, "");
  textParts.push(...opts.paragraphs);
  if (opts.button) {
    textParts.push("", `${opts.button.label}: ${opts.button.url}`);
  }
  if (opts.afterButton?.length) {
    textParts.push("", ...opts.afterButton);
  }
  textParts.push("", footnote);
  const text = textParts.join("\n");

  return { html, text };
}
