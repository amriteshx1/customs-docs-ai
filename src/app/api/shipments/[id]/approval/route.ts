import { approvalSchema } from "@/domain/schemas";
import { api } from "@/server/http";
import { requireRole } from "@/server/authz";
import { approveShipment } from "@/server/shipments/mutations";

export const POST = api(async (request, context) => {
  const user = await requireRole(["DOCUMENTATION_MANAGER"]);
  const { id } = await context.params;
  const body = approvalSchema.parse(await request.json().catch(() => ({})));
  await approveShipment(id, user.id, body.comment);
  return Response.json({ ok: true });
});
