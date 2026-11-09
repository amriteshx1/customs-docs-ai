import Decimal from "decimal.js";
import { fieldMeta } from "@/domain/fields";
import { DOCUMENT_LABEL } from "@/domain/labels";
import type {
  DocumentType,
  Evidence,
  ExtractionStatus,
  FieldPresence,
  FieldReviewState,
  FieldSource,
  FieldValue,
  ValidationResult,
} from "@/domain/types";
import { decimalOrNull, normalizeCompanyName, normalizeContainer, normalizeWeightUnit } from "@/domain/values";

export type ValidationField = {
  fieldKey: string;
  lineIndex: number | null;
  presence: FieldPresence;
  source: FieldSource;
  confidence: number | null;
  reviewState: FieldReviewState;
  value: FieldValue | null;
};

export type ValidationDocument = {
  documentType: DocumentType;
  extractionStatus: ExtractionStatus;
  fields: ValidationField[];
};

export type ValidationInput = {
  supplierName: string;
  documents: ValidationDocument[];
  confidenceThreshold: number;
};

export type IssueDraft = {
  code: string;
  result: ValidationResult;
  state: "OPEN" | "RESOLVED";
  message: string;
  evidence: Evidence[];
};

function issue(
  code: string,
  result: ValidationResult,
  message: string,
  evidence: Evidence[] = [],
): IssueDraft {
  return {
    code,
    result,
    state: result === "MISMATCH" || result === "NEEDS_REVIEW" ? "OPEN" : "RESOLVED",
    message,
    evidence,
  };
}

function label(documentType: string) {
  if (documentType === "SHIPMENT") return "Shipment record";
  if (documentType in DOCUMENT_LABEL) return DOCUMENT_LABEL[documentType as DocumentType];
  return documentType;
}

function fieldOn(document: ValidationDocument, fieldKey: string, lineIndex: number | null = null) {
  return document.fields.find((field) => field.fieldKey === fieldKey && field.lineIndex === lineIndex);
}

function evidenceFor(documentType: string, fieldKey: string, value: string | null, unit: string | null = null): Evidence {
  return { documentType, fieldKey, value, unit };
}

function presentText(field: ValidationField | undefined) {
  if (!field || field.presence !== "PRESENT" || field.value?.kind !== "string") return null;
  const text = field.value.text?.trim();
  return text ? text : null;
}

function presentNumber(field: ValidationField | undefined) {
  if (!field || field.presence !== "PRESENT" || field.value?.kind !== "number") return null;
  const decimal = decimalOrNull(field.value.number);
  if (!decimal) return { decimal: null, unit: field.value.unit ?? null, raw: field.value.number ?? "" };
  return { decimal, unit: field.value.unit ?? null, raw: decimal.toString() };
}

function reviewed(field: ValidationField) {
  return field.reviewState === "CONFIRMED" || field.reviewState === "EDITED";
}

function lowConfidence(field: ValidationField, threshold: number) {
  return field.source === "AI" && (field.confidence === null || field.confidence < threshold);
}

function lineIndexes(document: ValidationDocument) {
  const indexes = new Set<number>();
  for (const field of document.fields) {
    if (field.lineIndex !== null && field.fieldKey.startsWith("lineItems.")) indexes.add(field.lineIndex);
  }
  return [...indexes].sort((left, right) => left - right);
}

function compareNumbers(
  points: Array<{ documentType: DocumentType; raw: string; decimal: Decimal | null; unit: string | null }>,
  options: {
    code: string;
    fieldKey: string;
    label: string;
    kind: "weight" | "count";
  },
): IssueDraft | null {
  if (points.length === 0) return null;
  if (points.length === 1) {
    const only = points[0];
    return issue(
      options.code,
      "WARNING",
      `${options.label} is only stated on the ${label(only.documentType).toLowerCase()}.`,
      [evidenceFor(only.documentType, options.fieldKey, only.raw, only.unit)],
    );
  }

  const evidence = points.map((point) => evidenceFor(point.documentType, options.fieldKey, point.raw, point.unit));
  if (points.some((point) => !point.decimal)) {
    return issue(options.code, "NEEDS_REVIEW", `${options.label} could not be read as a number.`, evidence);
  }

  if (options.kind === "weight") {
    const units = points.map((point) => normalizeWeightUnit(point.unit));
    if (units.some((unit) => !unit) || new Set(units).size > 1) {
      const listed = points
        .map((point) => `${label(point.documentType)} states ${point.raw}${point.unit ? ` ${point.unit}` : " with no unit"}`)
        .join(". ");
      return issue(
        options.code,
        "NEEDS_REVIEW",
        `${options.label} uses units that were not compared. ${listed}.`,
        evidence,
      );
    }
    const values = points.map((point) => point.decimal!);
    const larger = values.reduce((max, value) => Decimal.max(max, value.abs()), new Decimal(0));
    const tolerance = Decimal.max(new Decimal("0.5"), larger.times("0.001"));
    const mismatch = values.some((value) => value.minus(values[0]).abs().gt(tolerance));
    const listed = points.map((point) => `${label(point.documentType)} states ${point.raw} ${units[0]}`).join(". ");
    return issue(
      options.code,
      mismatch ? "MISMATCH" : "PASS",
      mismatch ? `${options.label} does not match. ${listed}.` : `${options.label} matches. ${listed}.`,
      evidence,
    );
  }

  if (points.some((point) => !point.decimal!.isInteger())) {
    return issue(options.code, "NEEDS_REVIEW", `${options.label} must be a whole number before it can be compared.`, evidence);
  }
  const mismatch = points.some((point) => !point.decimal!.equals(points[0].decimal!));
  const listed = points.map((point) => `${label(point.documentType)} states ${point.raw}`).join(". ");
  return issue(
    options.code,
    mismatch ? "MISMATCH" : "PASS",
    mismatch ? `${options.label} does not match. ${listed}.` : `${options.label} matches. ${listed}.`,
    evidence,
  );
}

function collectNumbers(documents: ValidationDocument[], fieldKey: string) {
  const points = [];
  for (const document of documents) {
    const parsed = presentNumber(fieldOn(document, fieldKey));
    if (!parsed) continue;
    points.push({ documentType: document.documentType, ...parsed });
  }
  return points;
}

export function validateShipment(input: ValidationInput): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const invoice = input.documents.find((document) => document.documentType === "COMMERCIAL_INVOICE");

  for (const document of input.documents) {
    if (document.extractionStatus === "UNREADABLE") {
      issues.push(
        issue(
          "DOCUMENT_UNREADABLE",
          "NEEDS_REVIEW",
          `${label(document.documentType)} could not be read. Enter the fields manually. This was not treated as a successful extraction.`,
          [evidenceFor(document.documentType, "document", null)],
        ),
      );
      continue;
    }
    if (document.extractionStatus === "FAILED") {
      issues.push(
        issue(
          "EXTRACTION_FAILED",
          "NEEDS_REVIEW",
          `${label(document.documentType)} extraction failed. Retry it before review can finish.`,
          [evidenceFor(document.documentType, "document", null)],
        ),
      );
    }
    for (const field of document.fields) {
      if (field.presence === "UNREADABLE") {
        issues.push(
          issue(
            "UNREADABLE_FIELD",
            "NEEDS_REVIEW",
            `${fieldMeta(field.fieldKey).label} on the ${label(document.documentType).toLowerCase()} could not be read. Enter it manually or mark it as not on the document.`,
            [evidenceFor(document.documentType, field.fieldKey, null)],
          ),
        );
      }
      if (field.presence === "PRESENT" && lowConfidence(field, input.confidenceThreshold) && !reviewed(field)) {
        const score = field.confidence === null ? "no score" : field.confidence.toFixed(2);
        issues.push(
          issue(
            "LOW_CONFIDENCE",
            "NEEDS_REVIEW",
            `${fieldMeta(field.fieldKey).label} on the ${label(document.documentType).toLowerCase()} is low confidence (${score}) and has not been confirmed.`,
            [evidenceFor(document.documentType, field.fieldKey, shownValue(field))],
          ),
        );
      }
    }
  }

  const weightIssues = [
    compareNumbers(collectNumbers(input.documents, "packing.grossWeight"), {
      code: "GROSS_WEIGHT",
      fieldKey: "packing.grossWeight",
      label: "Gross weight",
      kind: "weight",
    }),
    compareNumbers(collectNumbers(input.documents, "packing.netWeight"), {
      code: "NET_WEIGHT",
      fieldKey: "packing.netWeight",
      label: "Net weight",
      kind: "weight",
    }),
    compareNumbers(collectNumbers(input.documents, "packing.packageCount"), {
      code: "PACKAGE_COUNT",
      fieldKey: "packing.packageCount",
      label: "Package count",
      kind: "count",
    }),
  ];
  for (const found of weightIssues) {
    if (found) issues.push(found);
  }

  const names: Evidence[] = [
    evidenceFor("SHIPMENT", "supplierName", input.supplierName.trim()),
  ];
  const normalized = [normalizeCompanyName(input.supplierName)];
  for (const document of input.documents) {
    const exporter = presentText(fieldOn(document, "parties.exporter"));
    if (!exporter) continue;
    names.push(evidenceFor(document.documentType, "parties.exporter", exporter));
    normalized.push(normalizeCompanyName(exporter));
  }
  if (names.length < 2) {
    issues.push(
      issue(
        "EXPORTER_NAME",
        "WARNING",
        "Supplier name is only on the shipment record. The documents did not state an exporter.",
        names,
      ),
    );
  } else if (new Set(normalized).size > 1) {
    const listed = names.map((item) => `${label(item.documentType)} states ${item.value}`).join(". ");
    issues.push(issue("EXPORTER_NAME", "MISMATCH", `Supplier name does not match. ${listed}.`, names));
  } else {
    issues.push(issue("EXPORTER_NAME", "PASS", "Supplier name matches across the shipment and the documents.", names));
  }

  const containerSets = input.documents.flatMap((document) => {
    const field = fieldOn(document, "packing.containerNumbers");
    if (!field || field.presence !== "PRESENT" || field.value?.kind !== "string_list") return [];
    const list = (field.value.list ?? []).map(normalizeContainer).filter(Boolean);
    if (list.length === 0) return [];
    return [{ documentType: document.documentType, list: [...new Set(list)].sort() }];
  });
  if (containerSets.length === 1) {
    issues.push(
      issue(
        "CONTAINER_NUMBERS",
        "WARNING",
        `Container numbers are only stated on the ${label(containerSets[0].documentType).toLowerCase()}.`,
        [evidenceFor(containerSets[0].documentType, "packing.containerNumbers", containerSets[0].list.join(", "))],
      ),
    );
  } else if (containerSets.length > 1) {
    const signature = (list: string[]) => list.join("|");
    const mismatch = containerSets.some((set) => signature(set.list) !== signature(containerSets[0].list));
    const evidence = containerSets.map((set) =>
      evidenceFor(set.documentType, "packing.containerNumbers", set.list.join(", ")),
    );
    const listed = containerSets.map((set) => `${label(set.documentType)} states ${set.list.join(", ")}`).join(". ");
    issues.push(
      issue(
        "CONTAINER_NUMBERS",
        mismatch ? "MISMATCH" : "PASS",
        mismatch ? `Container numbers do not match. ${listed}.` : `Container numbers match. ${listed}.`,
        evidence,
      ),
    );
  }

  if (invoice && invoice.extractionStatus !== "UNREADABLE" && invoice.extractionStatus !== "FAILED") {
    issues.push(...invoiceRules(invoice, input.confidenceThreshold));
  }

  const hasImporter = input.documents.some((document) => presentText(fieldOn(document, "parties.importer")));
  const hasConsignee = input.documents.some((document) => presentText(fieldOn(document, "parties.consignee")));
  if (!hasImporter && !hasConsignee && input.documents.some((document) => document.extractionStatus === "EXTRACTED" || document.extractionStatus === "MANUALLY_COMPLETED" || document.extractionStatus === "PARTIAL")) {
    issues.push(
      issue(
        "REQUIRED_PARTY",
        "NEEDS_REVIEW",
        "Enter an importer or a consignee. Neither was found on the documents.",
      ),
    );
  }

  return issues.map((item) => ({
    ...item,
    message: humanizeFieldKeys(item.message),
  }));
}

function shownValue(field: ValidationField) {
  if (!field.value) return null;
  if (field.value.kind === "string") return field.value.text ?? null;
  if (field.value.kind === "number") return field.value.number ?? null;
  return (field.value.list ?? []).join(", ") || null;
}

function humanizeFieldKeys(message: string) {
  return message
    .replaceAll("parties.exporter", "Exporter")
    .replaceAll("parties.importer", "Importer")
    .replaceAll("parties.consignee", "Consignee")
    .replaceAll("parties.notifyParty", "Notify party")
    .replaceAll("invoice.number", "Invoice number")
    .replaceAll("invoice.date", "Invoice date")
    .replaceAll("invoice.currency", "Currency")
    .replaceAll("invoice.totalAmount", "Invoice total")
    .replaceAll("packing.grossWeight", "Gross weight")
    .replaceAll("packing.netWeight", "Net weight")
    .replaceAll("packing.packageCount", "Package count")
    .replaceAll("packing.containerNumbers", "Container numbers");
}

function invoiceRules(invoice: ValidationDocument, threshold: number): IssueDraft[] {
  const issues: IssueDraft[] = [];
  const required: Array<[string, string]> = [
    ["invoice.number", "Invoice number"],
    ["invoice.date", "Invoice date"],
    ["invoice.currency", "Currency"],
    ["invoice.totalAmount", "Invoice total"],
  ];
  for (const [key, name] of required) {
    const field = fieldOn(invoice, key);
    if (!field || field.presence !== "PRESENT") {
      if (field?.presence === "UNREADABLE") continue;
      issues.push(
        issue(
          "REQUIRED_FIELD",
          "NEEDS_REVIEW",
          `${name} is missing on the commercial invoice.`,
          [evidenceFor(invoice.documentType, key, null)],
        ),
      );
      continue;
    }
    if (!reviewed(field) && !lowConfidence(field, threshold)) {
      issues.push(
        issue(
          "REQUIRED_UNCONFIRMED",
          "NEEDS_REVIEW",
          `${name} on the commercial invoice still needs to be confirmed.`,
          [evidenceFor(invoice.documentType, key, field.value?.kind === "string" ? field.value.text ?? null : field.value?.number ?? null)],
        ),
      );
    }
  }

  const date = presentText(fieldOn(invoice, "invoice.date"));
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    issues.push(issue("INVALID_DATE", "NEEDS_REVIEW", "Invoice date on the commercial invoice is not a valid calendar date."));
  } else if (date) {
    const [year, month, day] = date.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    const valid =
      parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
    if (!valid) {
      issues.push(issue("INVALID_DATE", "NEEDS_REVIEW", "Invoice date on the commercial invoice is not a valid calendar date."));
    }
  }

  const currency = presentText(fieldOn(invoice, "invoice.currency"));
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    issues.push(issue("INVALID_CURRENCY", "NEEDS_REVIEW", "Currency on the commercial invoice must be a three-letter ISO code."));
  }

  const indexes = lineIndexes(invoice);
  const complete = indexes.some((index) =>
    ["description", "quantity", "unitPrice", "lineTotal"].every((name) => {
      const field = fieldOn(invoice, `lineItems.${index}.${name}`, index);
      return field?.presence === "PRESENT";
    }),
  );
  if (!complete) {
    issues.push(
      issue(
        "REQUIRED_LINE",
        "NEEDS_REVIEW",
        "The commercial invoice needs at least one line with description, quantity, unit price, and line total.",
      ),
    );
  }

  let sum = new Decimal(0);
  let sumReady = indexes.length > 0;
  for (const index of indexes) {
    const quantity = presentNumber(fieldOn(invoice, `lineItems.${index}.quantity`, index));
    const price = presentNumber(fieldOn(invoice, `lineItems.${index}.unitPrice`, index));
    const total = presentNumber(fieldOn(invoice, `lineItems.${index}.lineTotal`, index));
    const any = quantity || price || total;
    if (!any) continue;
    if (!quantity?.decimal || !price?.decimal || !total?.decimal) {
      sumReady = false;
      issues.push(
        issue(
          "INVOICE_LINE_ARITHMETIC",
          "NEEDS_REVIEW",
          `Line ${index + 1} total could not be checked because a quantity, unit price, or line total is missing or unreadable.`,
        ),
      );
      continue;
    }
    const expected = quantity.decimal.times(price.decimal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const actual = total.decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const matches = expected.minus(actual).abs().lte("0.01");
    issues.push(
      issue(
        "INVOICE_LINE_ARITHMETIC",
        matches ? "PASS" : "MISMATCH",
        matches
          ? `Line ${index + 1} total matches quantity times unit price.`
          : `Line ${index + 1} total does not match. Quantity times unit price is ${expected.toFixed(2)}, and the line total is ${actual.toFixed(2)}.`,
        [
          evidenceFor(invoice.documentType, `lineItems.${index}.quantity`, quantity.raw),
          evidenceFor(invoice.documentType, `lineItems.${index}.unitPrice`, price.raw),
          evidenceFor(invoice.documentType, `lineItems.${index}.lineTotal`, total.raw),
        ],
      ),
    );
    sum = sum.plus(actual);
  }

  const invoiceTotal = presentNumber(fieldOn(invoice, "invoice.totalAmount"));
  if (!invoiceTotal?.decimal || !sumReady) {
    if (indexes.length > 0) {
      issues.push(
        issue(
          "INVOICE_TOTAL_ARITHMETIC",
          "NEEDS_REVIEW",
          "Invoice total could not be checked against the line totals.",
        ),
      );
    }
  } else if (!currency) {
    issues.push(issue("INVOICE_TOTAL_ARITHMETIC", "NEEDS_REVIEW", "Invoice total could not be checked because the currency is missing."));
  } else {
    const actual = invoiceTotal.decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const matches = sum.minus(actual).abs().lte("0.01");
    issues.push(
      issue(
        "INVOICE_TOTAL_ARITHMETIC",
        matches ? "PASS" : "MISMATCH",
        matches
          ? `Invoice total matches the sum of the line totals (${actual.toFixed(2)} ${currency}).`
          : `Invoice total does not match the sum of the line totals. Lines add up to ${sum.toFixed(2)} ${currency}, and the invoice total is ${actual.toFixed(2)} ${currency}.`,
        [
          evidenceFor(invoice.documentType, "invoice.totalAmount", invoiceTotal.raw, currency),
          ...indexes.map((index) =>
            evidenceFor(
              invoice.documentType,
              `lineItems.${index}.lineTotal`,
              presentNumber(fieldOn(invoice, `lineItems.${index}.lineTotal`, index))?.raw ?? null,
            ),
          ),
        ],
      ),
    );
  }

  return issues;
}
