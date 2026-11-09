import { manualFieldSchema } from "@/domain/schemas";
import { api } from "@/server/http";
import { requireRole } from "@/server/authz";
import { addInvoiceLine, saveManualField } from "@/server/shipments/mutations";

export const POST = api(async (request, context) => {
  const user = await requireRole(["DOCUMENTATION_EXECUTIVE"]);
  const { id } = await context.params;
  const body = manualFieldSchema.parse(await request.json());
  if (body.action === "add-line") {
    await addInvoiceLine({ shipmentId: id, actorId: user.id, documentId: body.documentId });
  } else {
    await saveManualField({
      shipmentId: id,
      actorId: user.id,
      fieldId: body.fieldId,
      presence: body.presence,
      value: body.value,
      unit: body.unit,
      currency: body.currency,
      note: body.note,
    });
  }
  return Response.json({ ok: true });
});
