import { api } from "@/server/http";
import { requireUser } from "@/server/authz";
import { getShipmentDetail } from "@/server/shipments/queries";

export const GET = api(async (_request, context) => {
  await requireUser();
  const { id } = await context.params;
  return Response.json(await getShipmentDetail(id));
});
