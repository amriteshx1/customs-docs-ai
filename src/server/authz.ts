import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { AppRole } from "@/domain/types";
import { ROLES } from "@/domain/types";
import { HttpError } from "@/server/http";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
};

function asRole(value: unknown): AppRole | null {
  return ROLES.find((role) => role === value) ?? null;
}

export async function getOptionalSession(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const role = asRole(session.user.role);
  if (!role) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role,
  };
}

export async function requireUser() {
  const user = await getOptionalSession();
  if (!user) throw new HttpError(401, "Sign in required.");
  return user;
}

export async function requireRole(roles: AppRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new HttpError(403, "You do not have access to this action.");
  }
  return user;
}
