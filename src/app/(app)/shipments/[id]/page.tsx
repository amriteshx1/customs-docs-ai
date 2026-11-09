import { notFound, redirect } from "next/navigation";
import { ShipmentWorkspace } from "@/components/shipments/shipment-workspace";
import { HttpError } from "@/server/http";
import { getOptionalSession } from "@/server/authz";
import { getShipmentDetail } from "@/server/shipments/queries";

export const dynamic = "force-dynamic";

export default async function ShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getOptionalSession();
  if (!user) redirect("/login");
  const { id } = await params;
  let detail;
  try {
    detail = await getShipmentDetail(id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
  return <ShipmentWorkspace initial={detail} role={user.role} />;
}
