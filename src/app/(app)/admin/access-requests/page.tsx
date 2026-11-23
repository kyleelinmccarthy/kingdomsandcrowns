import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { isAdminUser } from "@/lib/admin";
import { signupMode } from "@/lib/auth/signup-mode";
import { listAccessRequests } from "@/lib/actions/access-request-admin";
import { AccessRequestList } from "./access-request-list";

export const dynamic = "force-dynamic";

export default async function AdminAccessRequestsPage() {
  const session = await requireSession();
  if (!(await isAdminUser(session.user.id))) {
    notFound();
  }

  const requests = await listAccessRequests();
  const waiting = requests.filter((r) => r.status === "new").length;

  return (
    <div className="space-y-6">
      <div className="page-banner">
        <h1 className="page-title text-3xl">The Gatehouse</h1>
        <p className="text-muted-foreground">
          {waiting} {waiting === 1 ? "traveler waits" : "travelers wait"} at the gate ·{" "}
          {signupMode() === "open"
            ? "sign-ups are open to everyone"
            : "sign-ups are invite-only: approving a request lets that email create an account"}
        </p>
        <p className="mt-1 text-sm">
          <Link href="/admin/feedback" className="text-primary hover:underline">
            The Rookery (feedback)
          </Link>
        </p>
      </div>
      <AccessRequestList requests={requests} />
    </div>
  );
}
