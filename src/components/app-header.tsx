"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ROLE_LABEL } from "@/domain/labels";
import type { AppRole } from "@/domain/types";
import { signOut } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function AppHeader({ user }: { user: { name: string; role: AppRole } }) {
  const router = useRouter();

  return (
    <header className="border-b border-line bg-paper">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-6 px-6">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-serif text-xl text-ink">
            Customs desk
          </Link>
          <nav className="flex items-center gap-5 text-sm">
            <Link href="/" className="text-ink">
              Shipments
            </Link>
            {user.role === "DOCUMENTATION_MANAGER" ? (
              <Link href="/accuracy" className="text-ink">
                Accuracy
              </Link>
            ) : null}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium">{user.name}</div>
            <div className="text-xs text-muted">{ROLE_LABEL[user.role]}</div>
          </div>
          <Button
            variant="quiet"
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
