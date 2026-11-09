import { api } from "@/server/http";
import { requireRole } from "@/server/authz";
import { getAccuracy } from "@/server/accuracy/metrics";

export const GET = api(async () => {
  await requireRole(["DOCUMENTATION_MANAGER"]);
  return Response.json(await getAccuracy());
});
