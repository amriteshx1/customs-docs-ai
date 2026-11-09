import { prisma } from "@/lib/prisma";
import { api, HttpError } from "@/server/http";
import { requireUser } from "@/server/authz";
import { getStorage } from "@/server/storage/s3";

export const GET = api(async (_request, context) => {
  await requireUser();
  const { id, documentId } = await context.params;
  const document = await prisma.document.findFirst({
    where: { id: documentId, shipmentId: id },
  });
  if (!document) throw new HttpError(404, "Document not found.");
  const file = await getStorage().get(document.storageKey);
  const filename = document.originalFileName.replace(/["\r\n]/g, "");
  return new Response(new Uint8Array(file.body), {
    headers: {
      "content-type": document.mimeType,
      "content-disposition": `inline; filename="${filename}"`,
      "cache-control": "private, no-store",
    },
  });
});
