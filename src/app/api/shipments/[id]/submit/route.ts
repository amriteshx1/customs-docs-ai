import { api } from "@/server/http";
import { requireRole } from "@/server/authz";
import { submitShipment } from "@/server/shipments/mutations";

export const POST = api(async (_request, context) => {
  const user = await requireRole(["DOCUMENTATION_EXECUTIVE"]);
  const { id } = await context.params;
  await submitShipment(id, user.id);
  return Response.json({ ok: true });
});
