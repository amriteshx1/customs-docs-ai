import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { getOptionalSession } from "@/server/authz";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getOptionalSession();
  if (session) redirect("/");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="font-serif text-3xl">Customs desk</p>
      <h1 className="mt-6 text-lg">Sign in to review shipment documents.</h1>
      <LoginForm />
      <p className="mt-6 text-sm text-muted">Accounts are issued for the documentation team. Public registration is closed.</p>
    </main>
  );
}
