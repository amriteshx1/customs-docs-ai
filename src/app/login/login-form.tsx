"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-6 space-y-4"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const form = new FormData(event.currentTarget);
        const result = await signIn.email({
          email: String(form.get("email") || ""),
          password: String(form.get("password") || ""),
        });
        setPending(false);
        if (result.error) {
          setError(result.error.message || "Sign-in failed.");
          return;
        }
        router.push("/");
        router.refresh();
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>Email</span>
        <Input name="email" type="email" required autoComplete="username" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Password</span>
        <Input name="password" type="password" required autoComplete="current-password" />
      </label>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Signing in" : "Sign in"}
      </Button>
    </form>
  );
}
