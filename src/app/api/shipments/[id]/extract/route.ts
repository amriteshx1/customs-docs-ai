import { after } from "next/server";
import { api } from "@/server/http";
import { requireRole } from "@/server/authz";
import { beginExtraction, runExtraction } from "@/server/extraction/run";

export const maxDuration = 300;

export const POST = api(async (_request, context) => {
  const user = await requireRole(["DOCUMENTATION_EXECUTIVE"]);
  const { id } = await context.params;
  await beginExtraction(id, user.id);
  after(() => runExtraction(id, user.id));
  return Response.json({ processingStatus: "PROCESSING" }, { status: 202 });
});
