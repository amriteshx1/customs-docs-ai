import Link from "next/link";
import { ProcessingPill, ReviewPill } from "@/components/shipments/status-pill";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <div className="mx-auto w-full max-w-[1440px] px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Shipments</h1>
        {user.role === "DOCUMENTATION_EXECUTIVE" ? (
          <Button asChild>
            <Link href="/shipments/new">New shipment</Link>
          </Button>
        ) : null}
      </div>
      {shipments.length === 0 ? (
        <Card className="px-6 py-10">
          <p className="text-sm">No shipments yet.</p>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Create a shipment when the invoice, packing list, and bill of lading are ready.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
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
                <tr key={shipment.id} className="border-b border-border last:border-0 hover:bg-accent/40">
                  <td className="px-4 py-3.5">
                    <Link href={`/shipments/${shipment.id}`} className="font-medium tabular-nums hover:underline">
                      {shipment.shipmentCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3.5">
                    {shipment.supplierName}
                    <div className="text-xs text-muted-foreground">{shipment.supplierCountry}</div>
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">{formatWhen(shipment.createdAt)}</td>
                  <td className="px-4 py-3.5">
                    <ProcessingPill status={shipment.processingStatus} />
                  </td>
                  <td className="px-4 py-3.5">
                    <ReviewPill status={shipment.reviewStatus} />
                  </td>
                  <td className="px-4 py-3.5 tabular-nums">{shipment.openIssueCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
