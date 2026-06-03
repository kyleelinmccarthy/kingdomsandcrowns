import Link from "next/link";
import { getChildSetupPreview } from "@/lib/actions/child-auth";
import { SetChildPassword } from "./set-child-password";

export default async function ChildSetupPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const preview = await getChildSetupPreview(token);

  return (
    <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <div>
        <img src="/crown.svg" alt="" className="mx-auto mb-2 h-14 w-14" />
        <h1 className="page-title text-3xl">Set Up Your Login</h1>
      </div>

      {preview.state !== "valid" ? (
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            {preview.state === "accepted"
              ? "This login is already set up"
              : preview.state === "expired"
                ? "This link has expired"
                : "This link is no longer valid"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {preview.state === "accepted"
              ? "You can sign in with your email."
              : "Ask a grown-up to send a new setup link."}
          </p>
          <Link href="/login" className="text-sm text-[var(--gold-bright)] hover:underline">
            Go to sign in
          </Link>
        </div>
      ) : (
        <div className="w-full space-y-4">
          <p className="text-sm text-muted-foreground">
            Welcome, <span className="font-medium text-foreground">{preview.displayName}</span>!
            Create a password for <span className="font-medium">{preview.email}</span>.
          </p>
          <div className="rounded-lg border-2 border-[var(--gold-border)] bg-background/60 p-6">
            <SetChildPassword token={token} />
          </div>
        </div>
      )}
    </div>
  );
}
