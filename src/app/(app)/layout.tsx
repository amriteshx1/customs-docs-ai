import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { getOptionalSession } from "@/server/authz";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalSession();
  if (!user) redirect("/login");
  return (
    <div className="min-h-screen">
      <AppHeader user={user} />
      {children}
    </div>
  );
}
