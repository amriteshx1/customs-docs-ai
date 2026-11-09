import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { getOptionalSession } from "@/server/authz";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getOptionalSession();
  if (session) redirect("/");
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold tracking-tight">Customs Desk</p>
        <Card>
          <CardHeader>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>Review shipment documents with a team account.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
            <p className="mt-4 text-xs text-muted-foreground">
              Accounts are issued for the documentation team. Public registration is closed.
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
