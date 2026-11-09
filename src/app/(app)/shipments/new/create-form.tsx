"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CreateShipmentForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-6 space-y-4 rounded-lg border border-line bg-paper p-5"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        const form = new FormData(event.currentTarget);
        const response = await fetch("/api/shipments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            shipmentCode: form.get("shipmentCode"),
            supplierName: form.get("supplierName"),
            supplierCountry: form.get("supplierCountry"),
            importerName: form.get("importerName"),
          }),
        });
        const data = await response.json().catch(() => ({}));
        setPending(false);
        if (!response.ok) {
          setError(data.error || "The shipment could not be created.");
          return;
        }
        router.push(`/shipments/${data.id}`);
        router.refresh();
      }}
    >
      <label className="block space-y-1 text-sm">
        <span>Shipment ID</span>
        <Input name="shipmentCode" required placeholder="SHP-24811" autoComplete="off" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Supplier</span>
        <Input name="supplierName" required autoComplete="organization" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Supplier country</span>
        <Input name="supplierCountry" required autoComplete="country-name" />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Importer, if known</span>
        <Input name="importerName" autoComplete="off" />
      </label>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating shipment" : "Create shipment"}
      </Button>
    </form>
  );
}
