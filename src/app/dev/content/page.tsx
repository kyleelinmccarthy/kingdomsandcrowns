import { notFound } from "next/navigation";
import { ContentReview } from "./content-review";

/**
 * Dev-only. This page prints answer keys next to questions, so in production it must not
 * exist at all — not "be hard to find". The precedent is `admin/feedback/page.tsx`, which
 * answers an unauthorised visitor with `notFound()` rather than a redirect or a message:
 * a 404 tells a child who guesses the URL nothing, not even that the page is there.
 *
 * `process.env.NODE_ENV` is read INSIDE the component, not captured at module scope, so
 * the gate is a decision made per request rather than one baked in when the module loaded.
 */
export default function DevContentPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ContentReview />;
}
