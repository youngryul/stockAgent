import { Suspense, type ReactElement } from "react";

import { LoginForm } from "@/components/LoginForm";

export default function LoginPage(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
