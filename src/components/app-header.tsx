"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ROLE_LABEL } from "@/domain/labels";
import type { AppRole } from "@/domain/types";
import { signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function AppHeader({ user }: { user: { name: string; role: AppRole } }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-6">
          <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
            Customs Desk
          </Link>
          <Separator orientation="vertical" className="h-4" />
          <nav className="flex items-center gap-1 text-sm">
            <Link
              href="/"
              className={cn(
                "rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground",
                pathname === "/" || pathname.startsWith("/shipments") ? "text-foreground" : "",
              )}
            >
              Shipments
            </Link>
            {user.role === "DOCUMENTATION_MANAGER" ? (
              <Link
                href="/accuracy"
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-muted-foreground hover:text-foreground",
                  pathname.startsWith("/accuracy") ? "text-foreground" : "",
                )}
              >
                Accuracy
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-sm font-medium leading-none">{user.name}</div>
            <div className="mt-1 text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</div>
          </div>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={async () => {
              await signOut();
              router.push("/login");
              router.refresh();
            }}
          >
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
