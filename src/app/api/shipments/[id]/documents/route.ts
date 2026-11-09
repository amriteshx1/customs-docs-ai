import { documentTypeSchema } from "@/domain/schemas";
import { api, HttpError } from "@/server/http";
import { requireRole } from "@/server/authz";
import { uploadDocument } from "@/server/shipments/mutations";

export const POST = api(async (request, context) => {
  const user = await requireRole(["DOCUMENTATION_EXECUTIVE"]);
  const { id } = await context.params;
  const form = await request.formData();
  const file = form.get("file");
  const documentType = documentTypeSchema.parse(form.get("documentType"));
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file to upload.");
  await uploadDocument({
    shipmentId: id,
    actorId: user.id,
    documentType,
    fileName: file.name || "document",
    declaredType: file.type || "application/octet-stream",
    bytes: Buffer.from(await file.arrayBuffer()),
  });
  return Response.json({ ok: true });
});
