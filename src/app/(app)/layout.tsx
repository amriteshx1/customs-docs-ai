import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getOptionalSession } from "@/server/authz";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalSession();
  if (!user) redirect("/login");
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <AppHeader user={user} />
      <div className="relative min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
