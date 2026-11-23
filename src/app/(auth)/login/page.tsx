import { Suspense } from "react";
import { joinLink } from "@/lib/auth/signup-mode";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm join={joinLink()} />
    </Suspense>
  );
}
