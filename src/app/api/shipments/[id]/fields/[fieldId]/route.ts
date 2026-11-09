import { fieldInputSchema } from "@/domain/schemas";
import { api } from "@/server/http";
import { requireRole } from "@/server/authz";
import { correctField } from "@/server/shipments/mutations";

export const PATCH = api(async (request, context) => {
  const user = await requireRole(["DOCUMENTATION_EXECUTIVE"]);
  const { id, fieldId } = await context.params;
  const body = fieldInputSchema.parse(await request.json());
  await correctField({
    shipmentId: id,
    fieldId,
    actorId: user.id,
    value: body.value,
    unit: body.unit,
    currency: body.currency,
    note: body.note,
  });
  return Response.json({ ok: true });
});
