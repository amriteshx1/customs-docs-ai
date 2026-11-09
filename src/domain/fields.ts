export type FieldKind = "string" | "number" | "string_list";

export type FieldMeta = {
  key: string;
  label: string;
  kind: FieldKind;
  unit?: boolean;
  money?: boolean;
  group: "Parties" | "Invoice" | "Packing" | "Line items";
};

export const SCALAR_FIELDS: FieldMeta[] = [
  { key: "parties.importer", label: "Importer", kind: "string", group: "Parties" },
  { key: "parties.exporter", label: "Exporter", kind: "string", group: "Parties" },
  { key: "parties.consignee", label: "Consignee", kind: "string", group: "Parties" },
  { key: "parties.notifyParty", label: "Notify party", kind: "string", group: "Parties" },
  { key: "invoice.number", label: "Invoice number", kind: "string", group: "Invoice" },
  { key: "invoice.date", label: "Invoice date", kind: "string", group: "Invoice" },
  { key: "invoice.currency", label: "Currency", kind: "string", group: "Invoice" },
  { key: "invoice.incoterm", label: "Incoterm", kind: "string", group: "Invoice" },
  { key: "invoice.totalAmount", label: "Invoice total", kind: "number", money: true, group: "Invoice" },
  { key: "packing.packageCount", label: "Package count", kind: "number", group: "Packing" },
  { key: "packing.packageType", label: "Package type", kind: "string", group: "Packing" },
  { key: "packing.grossWeight", label: "Gross weight", kind: "number", unit: true, group: "Packing" },
  { key: "packing.netWeight", label: "Net weight", kind: "number", unit: true, group: "Packing" },
  { key: "packing.containerNumbers", label: "Container numbers", kind: "string_list", group: "Packing" },
];

export const LINE_FIELDS: Array<Omit<FieldMeta, "key" | "group"> & { name: string }> = [
  { name: "description", label: "Description", kind: "string" },
  { name: "hsnCode", label: "HSN code", kind: "string" },
  { name: "quantity", label: "Quantity", kind: "number", unit: true },
  { name: "unitPrice", label: "Unit price", kind: "number", money: true },
  { name: "lineTotal", label: "Line total", kind: "number", money: true },
];

export function lineFieldKey(index: number, name: string) {
  return `lineItems.${index}.${name}`;
}

export function fieldMeta(fieldKey: string): FieldMeta {
  const scalar = SCALAR_FIELDS.find((field) => field.key === fieldKey);
  if (scalar) return scalar;
  const match = /^lineItems\.(\d+)\.([A-Za-z]+)$/.exec(fieldKey);
  if (match) {
    const line = LINE_FIELDS.find((field) => field.name === match[2]);
    const index = Number(match[1]);
    return {
      key: fieldKey,
      label: `Line ${index + 1} ${line?.label ?? match[2]}`,
      kind: line?.kind ?? "string",
      unit: line?.unit,
      money: line?.money,
      group: "Line items",
    };
  }
  return { key: fieldKey, label: fieldKey, kind: "string", group: "Invoice" };
}

export function canonicalFieldKey(fieldKey: string) {
  return fieldKey.replace(/lineItems\.\d+\./, "lineItems.*.");
}
