import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { isAdminUser } from "@/lib/admin";
import { listFeedback } from "@/lib/actions/feedback";
import { FeedbackList } from "./feedback-list";

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const session = await requireSession();
  if (!(await isAdminUser(session.user.id))) {
    notFound();
  }

  const items = await listFeedback();

  return (
    <div className="space-y-6">
      <div className="page-banner">
        <h1 className="page-title text-3xl">The Rookery</h1>
        <p className="text-muted-foreground">
          {items.length} {items.length === 1 ? "raven" : "ravens"} received
        </p>
      </div>
      <FeedbackList items={items} />
    </div>
  );
}
