import { createShipmentSchema } from "@/domain/schemas";
import { api } from "@/server/http";
import { requireRole, requireUser } from "@/server/authz";
import { listShipments } from "@/server/shipments/queries";
import { createShipment } from "@/server/shipments/mutations";

export const GET = api(async () => {
  await requireUser();
  return Response.json(await listShipments());
});

export const POST = api(async (request) => {
  const user = await requireRole(["DOCUMENTATION_EXECUTIVE"]);
  const input = createShipmentSchema.parse(await request.json());
  const shipment = await createShipment(user.id, input);
  return Response.json({ id: shipment.id, shipmentCode: shipment.shipmentCode }, { status: 201 });
});
