import { confirmFieldSchema } from "@/domain/schemas";
import { api } from "@/server/http";
import { requireRole } from "@/server/authz";
import { confirmField } from "@/server/shipments/mutations";

export const POST = api(async (request, context) => {
  const user = await requireRole(["DOCUMENTATION_EXECUTIVE"]);
  const { id, fieldId } = await context.params;
  const body = confirmFieldSchema.parse(await request.json().catch(() => ({})));
  await confirmField({ shipmentId: id, fieldId, actorId: user.id, note: body.note });
  return Response.json({ ok: true });
});
