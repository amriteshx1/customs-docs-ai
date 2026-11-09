import Decimal from "decimal.js";
import { decimalOrNull } from "@/domain/values";
import type { DocumentType, FieldValue } from "@/domain/types";
import { EXPORT_SCHEMA_VERSION } from "@/domain/types";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/server/http";
import { parseFieldValue } from "@/server/shipments/workflow";

const COLUMNS = [
  "export_schema_version",
  "shipment_id",
  "supplier_name",
  "supplier_country",
  "importer_name",
  "exporter_name",
  "consignee_name",
  "notify_party",
  "invoice_number",
  "invoice_date",
  "currency",
  "incoterm",
  "invoice_total",
  "line_number",
  "description",
  "hsn_code",
  "quantity",
  "quantity_unit",
  "unit_price",
  "line_total",
  "package_count",
  "package_type",
  "gross_weight",
  "gross_weight_unit",
  "net_weight",
  "net_weight_unit",
  "container_numbers",
] as const;

type LoadedField = {
  documentType: DocumentType;
  fieldKey: string;
  lineIndex: number | null;
  value: FieldValue | null;
};

function escapeCell(value: string) {
  if (/[",\r\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

function pick(fields: LoadedField[], types: DocumentType[], fieldKey: string, lineIndex: number | null = null) {
  for (const type of types) {
    const field = fields.find(
      (item) => item.documentType === type && item.fieldKey === fieldKey && item.lineIndex === lineIndex && item.value,
    );
    if (field?.value) return field.value;
  }
  return null;
}

function text(value: FieldValue | null) {
  if (!value) return "";
  if (value.kind === "string") return value.text ?? "";
  if (value.kind === "string_list") return (value.list ?? []).filter(Boolean).join(" | ");
  return "";
}

function numberText(value: FieldValue | null, money = false) {
  if (!value || value.kind !== "number" || !value.number) return "";
  const decimal = decimalOrNull(value.number);
  if (!decimal) return value.number;
  return money ? decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2) : decimal.toString();
}

function unitOf(value: FieldValue | null) {
  return value?.kind === "number" ? value.unit ?? "" : "";
}

export async function buildShipmentCsv(shipmentId: string) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { documents: true, fields: true },
  });
  if (!shipment) throw new HttpError(404, "Shipment not found.");
  const types = new Map(shipment.documents.map((document) => [document.id, document.documentType]));
  const fields: LoadedField[] = shipment.fields
    .filter((field) => field.presence === "PRESENT")
    .map((field) => ({
      documentType: types.get(field.documentId)!,
      fieldKey: field.fieldKey,
      lineIndex: field.lineIndex,
      value: parseFieldValue(field.valueJson),
    }));

  const partyOrder: DocumentType[] = ["BILL_OF_LADING", "COMMERCIAL_INVOICE", "PACKING_LIST"];
  const packingOrder: DocumentType[] = ["PACKING_LIST", "COMMERCIAL_INVOICE", "BILL_OF_LADING"];
  const invoiceOnly: DocumentType[] = ["COMMERCIAL_INVOICE"];
  const indexes = [
    ...new Set(
      fields
        .filter((field) => field.documentType === "COMMERCIAL_INVOICE" && field.lineIndex !== null)
        .map((field) => field.lineIndex as number),
    ),
  ].sort((left, right) => left - right);
  if (indexes.length === 0) {
    throw new HttpError(409, "The invoice has no line to export.");
  }

  const shared = {
    importer: text(pick(fields, partyOrder, "parties.importer")),
    exporter: text(pick(fields, partyOrder, "parties.exporter")) || shipment.supplierName,
    consignee: text(pick(fields, partyOrder, "parties.consignee")),
    notify: text(pick(fields, partyOrder, "parties.notifyParty")),
    invoiceNumber: text(pick(fields, invoiceOnly, "invoice.number")),
    invoiceDate: text(pick(fields, invoiceOnly, "invoice.date")),
    currency: text(pick(fields, invoiceOnly, "invoice.currency")),
    incoterm: text(pick(fields, invoiceOnly, "invoice.incoterm")),
    invoiceTotal: numberText(pick(fields, invoiceOnly, "invoice.totalAmount"), true),
    packageCount: numberText(pick(fields, packingOrder, "packing.packageCount")),
    packageType: text(pick(fields, packingOrder, "packing.packageType")),
    gross: pick(fields, packingOrder, "packing.grossWeight"),
    net: pick(fields, packingOrder, "packing.netWeight"),
    containers: text(pick(fields, partyOrder, "packing.containerNumbers")),
  };

  const lines = indexes.map((index) => {
    const row = [
      EXPORT_SCHEMA_VERSION,
      shipment.shipmentCode,
      shipment.supplierName,
      shipment.supplierCountry,
      shared.importer,
      shared.exporter,
      shared.consignee,
      shared.notify,
      shared.invoiceNumber,
      shared.invoiceDate,
      shared.currency,
      shared.incoterm,
      shared.invoiceTotal,
      String(index + 1),
      text(pick(fields, invoiceOnly, `lineItems.${index}.description`, index)),
      text(pick(fields, invoiceOnly, `lineItems.${index}.hsnCode`, index)),
      numberText(pick(fields, invoiceOnly, `lineItems.${index}.quantity`, index)),
      unitOf(pick(fields, invoiceOnly, `lineItems.${index}.quantity`, index)),
      numberText(pick(fields, invoiceOnly, `lineItems.${index}.unitPrice`, index), true),
      numberText(pick(fields, invoiceOnly, `lineItems.${index}.lineTotal`, index), true),
      shared.packageCount,
      shared.packageType,
      numberText(shared.gross),
      unitOf(shared.gross),
      numberText(shared.net),
      unitOf(shared.net),
      shared.containers,
    ];
    return row.map((cell) => escapeCell(cell ?? "")).join(",");
  });

  return {
    filename: `shipment-${shipment.shipmentCode}-export.csv`,
    body: `${COLUMNS.join(",")}\n${lines.join("\n")}\n`,
    rowCount: lines.length,
  };
}
