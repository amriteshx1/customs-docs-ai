import Link from "next/link";
import { ProcessingPill, ReviewPill } from "@/components/shipments/status-pill";
import { Button } from "@/components/ui/button";
import { getOptionalSession } from "@/server/authz";
import { listShipments } from "@/server/shipments/queries";
import { formatWhen } from "@/lib/utils";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getOptionalSession();
  if (!user) redirect("/login");
  const shipments = await listShipments();

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Shipments</h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Compare the invoice, packing list, and bill of lading before anything is exported.
          </p>
        </div>
        {user.role === "DOCUMENTATION_EXECUTIVE" ? (
          <Button asChild>
            <Link href="/shipments/new">New shipment</Link>
          </Button>
        ) : null}
      </div>
      {shipments.length === 0 ? (
        <div className="rounded-lg border border-line bg-paper px-6 py-10">
          <p className="text-sm">No shipments yet.</p>
          <p className="mt-2 max-w-lg text-sm text-muted">
            Create a shipment when the invoice, packing list, and bill of lading are ready.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-line bg-paper">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-line text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Shipment</th>
                <th className="px-4 py-3 font-medium">Supplier</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Processing</th>
                <th className="px-4 py-3 font-medium">Review</th>
                <th className="px-4 py-3 font-medium">Open issues</th>
              </tr>
            </thead>
            <tbody>
              {shipments.map((shipment) => (
                <tr key={shipment.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-4">
                    <Link href={`/shipments/${shipment.id}`} className="font-serif text-lg">
                      {shipment.shipmentCode}
                    </Link>
                  </td>
                  <td className="px-4 py-4">
                    {shipment.supplierName}
                    <div className="text-xs text-muted">{shipment.supplierCountry}</div>
                  </td>
                  <td className="px-4 py-4">{formatWhen(shipment.createdAt)}</td>
                  <td className="px-4 py-4">
                    <ProcessingPill status={shipment.processingStatus} />
                  </td>
                  <td className="px-4 py-4">
                    <ReviewPill status={shipment.reviewStatus} />
                  </td>
                  <td className="px-4 py-4">{shipment.openIssueCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
