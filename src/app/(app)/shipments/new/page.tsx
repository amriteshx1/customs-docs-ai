import { redirect } from "next/navigation";
import { CreateShipmentForm } from "@/app/(app)/shipments/new/create-form";
import { getOptionalSession } from "@/server/authz";

export const dynamic = "force-dynamic";

export default async function NewShipmentPage() {
  const user = await getOptionalSession();
  if (!user) redirect("/login");
  if (user.role !== "DOCUMENTATION_EXECUTIVE") {
    return (
      <div className="mx-auto max-w-lg px-6 py-10">
        <h1 className="font-serif text-3xl">New shipment</h1>
        <p className="mt-3 text-sm text-muted">Only a documentation executive can create a shipment.</p>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-xl px-6 py-8">
      <h1 className="font-serif text-3xl">New shipment</h1>
      <p className="mt-2 text-sm text-muted">Start with the shipment ID and the supplier. Documents come next.</p>
      <CreateShipmentForm />
    </div>
  );
}
