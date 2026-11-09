import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { getOptionalSession } from "@/server/authz";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getOptionalSession();
  if (session) redirect("/");
  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden px-6 py-12">
      <div className="relative w-full max-w-sm rounded-lg border border-border bg-[color-mix(in_srgb,var(--background)_80%,#18181b)] px-8 py-10 sm:px-10 sm:py-12">

        <h1 className="text-center text-2xl font-semibold leading-none tracking-tight">
          <span className="inline-block text-[1.28em] leading-none">C</span>
          ustoms{" "}
          <span className="inline-block text-[1.28em] leading-none">D</span>
          esk
        </h1>
        <p className="mt-3 text-center text-sm text-muted-foreground">Review shipment documents with a team account.</p>

        <div className="mt-8">
          <LoginForm />
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Accounts are issued for the documentation team. Public registration is closed.
          </p>
        </div>
      </div>
    </main>
  );
}
