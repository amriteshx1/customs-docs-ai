"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateShipmentForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card className="mt-6">
      <CardContent className="p-5">
        <form
          className="space-y-4"
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
          <div className="space-y-2">
            <Label htmlFor="shipmentCode">Shipment ID</Label>
            <Input id="shipmentCode" name="shipmentCode" required placeholder="SHP-24811" autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplierName">Supplier</Label>
            <Input id="supplierName" name="supplierName" required autoComplete="organization" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="supplierCountry">Supplier country</Label>
            <Input id="supplierCountry" name="supplierCountry" required autoComplete="country-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="importerName">Importer, if known</Label>
            <Input id="importerName" name="importerName" autoComplete="off" />
          </div>
          {error ? <p className="text-sm text-bad">{error}</p> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Creating shipment" : "Create shipment"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
