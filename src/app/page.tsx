import { redirect } from "next/navigation";
import { getActor } from "@/lib/auth/actor";
import { Landing } from "@/components/marketing/landing";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const { preview } = await searchParams;
  // `?preview` forces the landing to render even when signed in (e.g. to review
  // it in demo mode, where there's always an actor). Otherwise an authenticated
  // actor (parent or hero) goes straight to the app.
  const previewLanding = preview !== undefined;

  const actor = await getActor();
  if (actor && !previewLanding) {
    redirect("/tavern");
  }

  // Logged-out visitors (and ?preview) see the marketing landing page.
  return <Landing />;
}
