import { canonicalFieldKey } from "@/domain/fields";
import { canonicalValue } from "@/domain/values";
import { prisma } from "@/lib/prisma";
import { parseFieldValue } from "@/server/shipments/workflow";

type Bucket = { correct: number; total: number };

function ratio(bucket: Bucket) {
  return {
    correct: bucket.correct,
    total: bucket.total,
    accuracy: bucket.total === 0 ? null : Number((bucket.correct / bucket.total).toFixed(4)),
  };
}

export async function getAccuracy() {
  const fields = await prisma.extractedField.findMany({
    where: {
      source: "AI",
      presence: "PRESENT",
      reviewState: { in: ["CONFIRMED", "EDITED"] },
    },
    include: { shipment: { select: { supplierName: true } } },
  });

  const overall: Bucket = { correct: 0, total: 0 };
  const byField = new Map<string, Bucket>();
  const bySupplier = new Map<string, Bucket>();

  for (const field of fields) {
    const original = parseFieldValue(field.originalValueJson);
    const current = parseFieldValue(field.valueJson);
    if (!original) continue;
    const correct = canonicalValue(original) === canonicalValue(current);
    overall.total += 1;
    if (correct) overall.correct += 1;
    const key = canonicalFieldKey(field.fieldKey);
    const fieldBucket = byField.get(key) ?? { correct: 0, total: 0 };
    fieldBucket.total += 1;
    if (correct) fieldBucket.correct += 1;
    byField.set(key, fieldBucket);
    const supplier = field.shipment.supplierName;
    const supplierBucket = bySupplier.get(supplier) ?? { correct: 0, total: 0 };
    supplierBucket.total += 1;
    if (correct) supplierBucket.correct += 1;
    bySupplier.set(supplier, supplierBucket);
  }

  return {
    overall: ratio(overall),
    byField: [...byField.entries()]
      .map(([fieldKey, bucket]) => ({ fieldKey, ...ratio(bucket) }))
      .sort((left, right) => left.fieldKey.localeCompare(right.fieldKey)),
    bySupplier: [...bySupplier.entries()]
      .map(([supplierName, bucket]) => ({ supplierName, ...ratio(bucket) }))
      .sort((left, right) => left.supplierName.localeCompare(right.supplierName)),
  };
}
