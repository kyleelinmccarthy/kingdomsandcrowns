import { Suspense } from "react";
import { signupMode } from "@/lib/auth/signup-mode";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm mode={signupMode()} />
    </Suspense>
  );
}
