import { api } from "@/server/http";
import { requireUser } from "@/server/authz";
import { exportShipment } from "@/server/shipments/mutations";

export const POST = api(async (_request, context) => {
  const user = await requireUser();
  const { id } = await context.params;
  const csv = await exportShipment(id, user.id);
  return new Response(csv.body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csv.filename}"`,
      "cache-control": "private, no-store",
    },
  });
});
