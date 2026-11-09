import Decimal from "decimal.js";
import { LINE_FIELDS, SCALAR_FIELDS, lineFieldKey } from "@/domain/fields";
import type { DocumentType, FieldValue } from "@/domain/types";
import { EXTRACTION_PROMPT_VERSION, EXTRACTION_SCHEMA_VERSION } from "@/domain/types";
import { Prisma } from "@/generated/prisma/client";
import type { ExtractionResult, ExtractedScalar } from "@/server/extraction/schema";

type FieldWrite = {
  fieldKey: string;
  lineIndex: number | null;
  presence: "PRESENT" | "MISSING" | "UNREADABLE";
  source: "AI";
  confidence: string | null;
  pageNumber: number | null;
  originalRawText: string | null;
  originalValueJson: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  valueJson: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  reviewState: "UNREVIEWED";
};

function jsonValue(value: FieldValue | null) {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

function pageOf(field: ExtractedScalar) {
  return field.page && field.page > 0 ? field.page : null;
}

function fromScalar(field: ExtractedScalar, kind: "string" | "number" | "string_list", forceUnreadable: boolean): {
  presence: FieldWrite["presence"];
  value: FieldValue | null;
  confidence: string | null;
  pageNumber: number | null;
  rawText: string | null;
} {
  if (forceUnreadable || field.presence === "unreadable") {
    return {
      presence: "UNREADABLE",
      value: null,
      confidence: null,
      pageNumber: pageOf(field),
      rawText: null,
    };
  }
  if (field.presence === "missing") {
    return { presence: "MISSING", value: null, confidence: null, pageNumber: pageOf(field), rawText: null };
  }
  let value: FieldValue | null = null;
  if (kind === "string" && "value" in field && typeof field.value === "string") {
    value = { kind: "string", text: field.value };
  } else if (kind === "number" && typeof field.value === "number") {
    const unit = "unit" in field ? field.unit : null;
    const currency = "currency" in field ? field.currency : null;
    value = {
      kind: "number",
      number: new Decimal(field.value).toString(),
      unit,
      currency,
    };
  } else if (kind === "string_list" && Array.isArray(field.value)) {
    value = { kind: "string_list", list: field.value.map((item) => item.trim()).filter(Boolean) };
  }
  return {
    presence: "PRESENT",
    value,
    confidence: field.confidence === null ? null : new Decimal(field.confidence).toFixed(3),
    pageNumber: pageOf(field),
    rawText: field.rawText,
  };
}

function writeField(
  fieldKey: string,
  lineIndex: number | null,
  kind: "string" | "number" | "string_list",
  source: ExtractedScalar,
  forceUnreadable: boolean,
): FieldWrite {
  const mapped = fromScalar(source, kind, forceUnreadable);
  return {
    fieldKey,
    lineIndex,
    presence: mapped.presence,
    source: "AI",
    confidence: mapped.confidence,
    pageNumber: mapped.pageNumber,
    originalRawText: mapped.rawText,
    originalValueJson: jsonValue(mapped.presence === "PRESENT" ? mapped.value : null),
    valueJson: jsonValue(mapped.value),
    reviewState: "UNREVIEWED",
  };
}

const emptyString = {
  presence: "missing" as const,
  value: null,
  confidence: null,
  page: null,
  rawText: null,
  reason: null,
};

const emptyNumber = { ...emptyString, unit: null, currency: null };

export function fieldsFromExtraction(result: ExtractionResult, documentType: DocumentType): {
  fields: FieldWrite[];
  status: "EXTRACTED" | "UNREADABLE" | "PARTIAL";
  unreadablePages: number[];
  unreadableReason: string | null;
} {
  const forceUnreadable = result.unreadable;
  const fields: FieldWrite[] = [];
  const scalars: Record<string, ExtractedScalar> = {
    "parties.importer": result.parties.importer,
    "parties.exporter": result.parties.exporter,
    "parties.consignee": result.parties.consignee,
    "parties.notifyParty": result.parties.notifyParty,
    "invoice.number": result.invoice.number,
    "invoice.date": result.invoice.date,
    "invoice.currency": result.invoice.currency,
    "invoice.incoterm": result.invoice.incoterm,
    "invoice.totalAmount": result.invoice.totalAmount,
    "packing.packageCount": result.packing.packageCount,
    "packing.packageType": result.packing.packageType,
    "packing.grossWeight": result.packing.grossWeight,
    "packing.netWeight": result.packing.netWeight,
    "packing.containerNumbers": result.packing.containerNumbers,
  };

  for (const meta of SCALAR_FIELDS) {
    fields.push(writeField(meta.key, null, meta.kind, scalars[meta.key], forceUnreadable));
  }

  const blank = (kind: "string" | "number") => (kind === "number" ? emptyNumber : emptyString);
  if (forceUnreadable) {
    if (documentType === "COMMERCIAL_INVOICE") {
      for (const meta of LINE_FIELDS) {
        fields.push(writeField(lineFieldKey(0, meta.name), 0, meta.kind, blank(meta.kind === "number" ? "number" : "string"), true));
      }
    }
  } else if (result.lineItems.length === 0 && documentType === "COMMERCIAL_INVOICE") {
    for (const meta of LINE_FIELDS) {
      fields.push(writeField(lineFieldKey(0, meta.name), 0, meta.kind, blank(meta.kind === "number" ? "number" : "string"), false));
    }
  } else {
    result.lineItems.forEach((line, index) => {
      for (const meta of LINE_FIELDS) {
        const source = line[meta.name as keyof typeof line];
        const kind = meta.kind === "number" ? "number" : "string";
        fields.push(writeField(lineFieldKey(index, meta.name), index, kind, source, false));
      }
    });
  }

  const unreadablePages = [...new Set(result.unreadablePages.filter((page) => page > 0))].sort((a, b) => a - b);
  const hasUnreadableField = fields.some((field) => field.presence === "UNREADABLE");
  const status = forceUnreadable ? "UNREADABLE" : hasUnreadableField ? "PARTIAL" : "EXTRACTED";
  return {
    fields,
    status,
    unreadablePages,
    unreadableReason: result.unreadableReason,
  };
}

export const extractionVersions = {
  schemaVersion: EXTRACTION_SCHEMA_VERSION,
  promptVersion: EXTRACTION_PROMPT_VERSION,
};
