import Link from "next/link";
import { getInvitePreview } from "@/lib/actions/guardians";
import { getSession } from "@/lib/auth/session";
import { AcceptInvite } from "./accept-invite";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  co_parent: "Co-parent",
  teacher: "Teacher",
  tutor: "Tutor",
  guardian: "Guardian",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getInvitePreview(token);
  const session = await getSession();

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <img src="/crown.svg" alt="" className="mx-auto mb-2 h-14 w-14" />
        <h1 className="page-title text-3xl">Kingdoms &amp; Crowns</h1>
      </div>

      {preview.state !== "valid" ? (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            {preview.state === "accepted"
              ? "Invitation already accepted"
              : preview.state === "expired"
                ? "Invitation expired"
                : preview.state === "revoked"
                  ? "Invitation no longer valid"
                  : "Invitation not found"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {preview.state === "expired"
              ? "Ask the family owner to send you a fresh invitation."
              : "Please check the link or request a new invitation."}
          </p>
          <Link href="/" className="text-sm text-[var(--gold-bright)] hover:underline">
            Go home
          </Link>
        </div>
      ) : (
        <div className="w-full space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              {preview.inviterName ? `${preview.inviterName} invited you` : "You've been invited"}{" "}
              to join
            </p>
            <h2 className="text-xl font-semibold text-foreground">{preview.familyName}</h2>
            <p className="text-sm text-muted-foreground">
              as {ROLE_LABELS[preview.role] ?? preview.role} (
              {preview.permission === "view" ? "view only" : "can edit"})
            </p>
          </div>

          {session ? (
            <AcceptInvite token={token} />
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Sign in as <span className="font-medium">{preview.email}</span> to accept.
              </p>
              <div className="flex flex-col gap-2">
                <Link href={`/login?redirect=/invite/${token}`}>
                  <span className="block w-full rounded-md bg-[var(--gold-border)] px-4 py-2 text-sm font-medium text-black">
                    Sign In
                  </span>
                </Link>
                <Link
                  href={`/signup?redirect=/invite/${token}`}
                  className="text-sm text-[var(--gold-bright)] hover:underline"
                >
                  Create an account
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
