import { api } from "@/server/http";
import { requireUser } from "@/server/authz";
import { evaluateExportEligibility } from "@/server/export/eligibility";

export const GET = api(async (_request, context) => {
  await requireUser();
  const { id } = await context.params;
  const result = await evaluateExportEligibility(id, { requireApproval: true });
  return Response.json({ eligible: result.eligible, reasons: result.reasons });
});
