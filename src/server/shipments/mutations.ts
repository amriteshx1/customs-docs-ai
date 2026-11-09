import { randomUUID } from "node:crypto";
import { fieldMeta, lineFieldKey, LINE_FIELDS } from "@/domain/fields";
import type { DocumentType, FieldValue } from "@/domain/types";
import { DOCUMENT_TYPES } from "@/domain/types";
import { decimalOrNull, valuesEqual } from "@/domain/values";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import { HttpError } from "@/server/http";
import { getStorage } from "@/server/storage/s3";
import { buildShipmentCsv } from "@/server/export/csv";
import { evaluateExportEligibility } from "@/server/export/eligibility";
import {
  bumpRevision,
  jsonOrNull,
  parseFieldValue,
  recomputeShipment,
  refreshDocumentStatus,
  rerunValidation,
} from "@/server/shipments/workflow";

function valueFromInput(kind: "string" | "number" | "string_list", raw: string, unit?: string | null, currency?: string | null): FieldValue {
  if (kind === "string") return { kind: "string", text: raw.trim() };
  if (kind === "string_list") {
    const list = raw.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
    if (list.length === 0) throw new HttpError(400, "Enter at least one container number.");
    return { kind: "string_list", list };
  }
  const decimal = decimalOrNull(raw);
  if (!decimal) throw new HttpError(400, "Enter a number.");
  return {
    kind: "number",
    number: decimal.toString(),
    unit: unit?.trim() || null,
    currency: currency?.trim().toUpperCase() || null,
  };
}

export async function createShipment(
  userId: string,
  input: { shipmentCode: string; supplierName: string; supplierCountry: string; importerName: string | null },
) {
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.create({
      data: {
        shipmentCode: input.shipmentCode,
        supplierName: input.supplierName,
        supplierCountry: input.supplierCountry,
        importerName: input.importerName,
        createdById: userId,
      },
    });
    await tx.activityEvent.create({
      data: {
        shipmentId: shipment.id,
        actorId: userId,
        type: "CREATED",
        payload: { shipmentCode: shipment.shipmentCode },
      },
    });
    return shipment;
  });
}

function sniffType(bytes: Buffer, declared: string) {
  const header = bytes.subarray(0, 12);
  const ascii = header.toString("utf8");
  if (ascii.startsWith("%PDF") && declared === "application/pdf") return "application/pdf";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && (declared === "image/jpeg" || declared === "image/jpg")) {
    return "image/jpeg";
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && declared === "image/png") {
    return "image/png";
  }
  if (ascii.startsWith("RIFF") && header.subarray(8, 12).toString("utf8") === "WEBP" && declared === "image/webp") {
    return "image/webp";
  }
  return null;
}

export async function uploadDocument(input: {
  shipmentId: string;
  actorId: string;
  documentType: DocumentType;
  fileName: string;
  declaredType: string;
  bytes: Buffer;
}) {
  if (!DOCUMENT_TYPES.includes(input.documentType)) {
    throw new HttpError(400, "Choose an invoice, packing list, or bill of lading.");
  }
  if (input.bytes.length === 0) throw new HttpError(400, "The file is empty.");
  if (input.bytes.length > env.maxUploadBytes()) {
    throw new HttpError(400, "The file is larger than 20 MB.");
  }
  const mimeType = sniffType(input.bytes, input.declaredType);
  if (!mimeType) {
    throw new HttpError(400, "Upload a PDF, JPEG, PNG, or WebP file.");
  }
  const shipment = await prisma.shipment.findUnique({ where: { id: input.shipmentId } });
  if (!shipment) throw new HttpError(404, "Shipment not found.");

  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "document";
  const storageKey = `shipments/${input.shipmentId}/${input.documentType}/${randomUUID()}-${safeName}`;
  const storage = getStorage();
  await storage.put(storageKey, input.bytes, mimeType);

  const existing = await prisma.document.findUnique({
    where: { shipmentId_documentType: { shipmentId: input.shipmentId, documentType: input.documentType } },
  });

  try {
    await prisma.$transaction(async (tx) => {
      await bumpRevision(tx, input.shipmentId, input.actorId);
      const document = existing
        ? await tx.document.update({
            where: { id: existing.id },
            data: {
              originalFileName: input.fileName,
              mimeType,
              sizeBytes: input.bytes.length,
              storageKey,
              extractionStatus: "PENDING",
              unreadablePages: [],
              unreadableReason: null,
              extractionError: null,
              extractedAt: null,
            },
          })
        : await tx.document.create({
            data: {
              shipmentId: input.shipmentId,
              documentType: input.documentType,
              originalFileName: input.fileName,
              mimeType,
              sizeBytes: input.bytes.length,
              storageKey,
              extractionStatus: "PENDING",
            },
          });
      await tx.extractedField.deleteMany({ where: { documentId: document.id } });
      await tx.documentExtraction.deleteMany({ where: { documentId: document.id } });
      await tx.activityEvent.create({
        data: {
          shipmentId: input.shipmentId,
          actorId: input.actorId,
          type: "DOCUMENT_UPLOADED",
          payload: { documentType: input.documentType, fileName: input.fileName },
        },
      });
      await rerunValidation(tx, input.shipmentId, input.actorId);
      await recomputeShipment(tx, input.shipmentId);
    });
  } catch (error) {
    await storage.delete(storageKey).catch(() => undefined);
    throw error;
  }

  if (existing && existing.storageKey !== storageKey) {
    await storage.delete(existing.storageKey).catch(() => undefined);
  }
}

export async function correctField(input: {
  shipmentId: string;
  fieldId: string;
  actorId: string;
  value: string;
  unit?: string | null;
  currency?: string | null;
  note?: string | null;
}) {
  const field = await prisma.extractedField.findFirst({
    where: { id: input.fieldId, shipmentId: input.shipmentId },
  });
  if (!field) throw new HttpError(404, "Field not found.");
  if (field.presence !== "PRESENT") {
    throw new HttpError(400, "This field has no extracted value to correct.");
  }
  const meta = fieldMeta(field.fieldKey);
  const next = valueFromInput(meta.kind, input.value, input.unit, input.currency);
  const current = parseFieldValue(field.valueJson);
  if (valuesEqual(current, next)) {
    throw new HttpError(400, "The value is unchanged. Confirm it if it is already correct.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.fieldEdit.create({
      data: {
        fieldId: field.id,
        shipmentId: input.shipmentId,
        editType: "CORRECTION",
        previousJson: jsonOrNull(current),
        newJson: next,
        note: input.note || null,
        editedById: input.actorId,
      },
    });
    await tx.extractedField.update({
      where: { id: field.id },
      data: {
        valueJson: next,
        reviewState: "EDITED",
        confirmedAt: new Date(),
        confirmedById: input.actorId,
      },
    });
    await tx.activityEvent.create({
      data: {
        shipmentId: input.shipmentId,
        actorId: input.actorId,
        type: "FIELD_EDITED",
        payload: { label: meta.label, fieldKey: field.fieldKey },
      },
    });
    await bumpRevision(tx, input.shipmentId, input.actorId);
    await rerunValidation(tx, input.shipmentId, input.actorId);
    await recomputeShipment(tx, input.shipmentId);
  });
}

export async function confirmField(input: { shipmentId: string; fieldId: string; actorId: string; note?: string | null }) {
  const field = await prisma.extractedField.findFirst({
    where: { id: input.fieldId, shipmentId: input.shipmentId },
  });
  if (!field) throw new HttpError(404, "Field not found.");
  if (field.presence !== "PRESENT") throw new HttpError(400, "There is no value to confirm.");
  if (field.reviewState === "CONFIRMED" || field.reviewState === "EDITED") return;
  const current = parseFieldValue(field.valueJson);
  const meta = fieldMeta(field.fieldKey);
  await prisma.$transaction(async (tx) => {
    await tx.fieldEdit.create({
      data: {
        fieldId: field.id,
        shipmentId: input.shipmentId,
        editType: "CONFIRMATION",
        previousJson: jsonOrNull(current),
        newJson: jsonOrNull(current),
        note: input.note || null,
        editedById: input.actorId,
      },
    });
    await tx.extractedField.update({
      where: { id: field.id },
      data: { reviewState: "CONFIRMED", confirmedAt: new Date(), confirmedById: input.actorId },
    });
    await tx.activityEvent.create({
      data: {
        shipmentId: input.shipmentId,
        actorId: input.actorId,
        type: "FIELD_CONFIRMED",
        payload: { label: meta.label, fieldKey: field.fieldKey },
      },
    });
    await bumpRevision(tx, input.shipmentId, input.actorId);
    await rerunValidation(tx, input.shipmentId, input.actorId);
    await recomputeShipment(tx, input.shipmentId);
  });
}

export async function saveManualField(input: {
  shipmentId: string;
  actorId: string;
  fieldId: string;
  presence: "present" | "missing";
  value?: string;
  unit?: string | null;
  currency?: string | null;
  note?: string | null;
}) {
  const field = await prisma.extractedField.findFirst({
    where: { id: input.fieldId, shipmentId: input.shipmentId },
  });
  if (!field) throw new HttpError(404, "Field not found.");
  if (field.presence === "PRESENT") {
    throw new HttpError(400, "Correct this extracted value instead of entering it manually.");
  }
  const meta = fieldMeta(field.fieldKey);
  const next = input.presence === "missing" ? null : valueFromInput(meta.kind, input.value ?? "", input.unit, input.currency);
  if (input.presence === "present" && !input.value?.trim()) {
    throw new HttpError(400, "Enter a value or mark the field as not on the document.");
  }
  await prisma.$transaction(async (tx) => {
    await tx.fieldEdit.create({
      data: {
        fieldId: field.id,
        shipmentId: input.shipmentId,
        editType: "MANUAL_ENTRY",
        previousJson: jsonOrNull(parseFieldValue(field.valueJson)),
        newJson: jsonOrNull(next),
        note: input.note || null,
        editedById: input.actorId,
      },
    });
    await tx.extractedField.update({
      where: { id: field.id },
      data: {
        presence: input.presence === "present" ? "PRESENT" : "MISSING",
        source: "MANUAL",
        valueJson: jsonOrNull(next),
        reviewState: "CONFIRMED",
        confidence: null,
        confirmedAt: new Date(),
        confirmedById: input.actorId,
      },
    });
    await tx.activityEvent.create({
      data: {
        shipmentId: input.shipmentId,
        actorId: input.actorId,
        type: "MANUAL_ENTRY",
        payload: { label: meta.label, fieldKey: field.fieldKey },
      },
    });
    await refreshDocumentStatus(tx, field.documentId);
    await bumpRevision(tx, input.shipmentId, input.actorId);
    await rerunValidation(tx, input.shipmentId, input.actorId);
    await recomputeShipment(tx, input.shipmentId);
  });
}

export async function addInvoiceLine(input: { shipmentId: string; actorId: string; documentId: string }) {
  const document = await prisma.document.findFirst({
    where: { id: input.documentId, shipmentId: input.shipmentId },
    include: { fields: true },
  });
  if (!document) throw new HttpError(404, "Document not found.");
  if (document.documentType !== "COMMERCIAL_INVOICE") {
    throw new HttpError(400, "Lines can only be added to the commercial invoice.");
  }
  const nextIndex = document.fields.reduce((max, field) => Math.max(max, field.lineIndex ?? -1), -1) + 1;
  await prisma.$transaction(async (tx) => {
    await tx.extractedField.createMany({
      data: LINE_FIELDS.map((meta) => ({
        shipmentId: input.shipmentId,
        documentId: document.id,
        fieldKey: lineFieldKey(nextIndex, meta.name),
        lineIndex: nextIndex,
        presence: "MISSING" as const,
        source: "AI" as const,
        reviewState: "UNREVIEWED" as const,
        confidence: null,
      })),
    });
    await bumpRevision(tx, input.shipmentId, input.actorId);
    await rerunValidation(tx, input.shipmentId, input.actorId);
    await recomputeShipment(tx, input.shipmentId);
  });
}

export async function submitShipment(shipmentId: string, actorId: string) {
  const gate = await evaluateExportEligibility(shipmentId, { requireApproval: false });
  if (!gate.eligible) {
    throw new HttpError(409, "Resolve the remaining issues before submitting.", { reasons: gate.reasons });
  }
  if (gate.shipment.submittedRevision === gate.shipment.contentRevision && gate.shipment.reviewStatus === "PENDING_APPROVAL") {
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.shipment.update({
      where: { id: shipmentId },
      data: { submittedRevision: gate.shipment.contentRevision },
    });
    await tx.activityEvent.create({
      data: { shipmentId, actorId, type: "SUBMITTED", payload: { contentRevision: gate.shipment.contentRevision } },
    });
    await recomputeShipment(tx, shipmentId);
  });
}

export async function approveShipment(shipmentId: string, actorId: string, comment?: string | null) {
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) throw new HttpError(404, "Shipment not found.");
  if (shipment.submittedRevision !== shipment.contentRevision) {
    throw new HttpError(409, "An executive must submit this revision before it can be approved.", {
      reasons: ["An executive must submit this revision before it can be approved."],
    });
  }
  const gate = await evaluateExportEligibility(shipmentId, { requireApproval: false });
  if (!gate.eligible) {
    throw new HttpError(409, "This shipment still has issues that block approval.", { reasons: gate.reasons });
  }
  await prisma.$transaction(async (tx) => {
    await tx.approval.upsert({
      where: { shipmentId },
      create: {
        shipmentId,
        status: "APPROVED",
        contentRevision: shipment.contentRevision,
        comment: comment || null,
        decidedById: actorId,
        decidedAt: new Date(),
      },
      update: {
        status: "APPROVED",
        contentRevision: shipment.contentRevision,
        comment: comment || null,
        decidedById: actorId,
        decidedAt: new Date(),
      },
    });
    await tx.activityEvent.create({
      data: { shipmentId, actorId, type: "APPROVED", payload: { contentRevision: shipment.contentRevision } },
    });
    await recomputeShipment(tx, shipmentId);
  });
}

export async function exportShipment(shipmentId: string, actorId: string) {
  const gate = await evaluateExportEligibility(shipmentId, { requireApproval: true });
  if (!gate.eligible) {
    throw new HttpError(409, "This shipment cannot be exported yet.", { reasons: gate.reasons });
  }
  const csv = await buildShipmentCsv(shipmentId);
  await prisma.$transaction(async (tx) => {
    await tx.exportRecord.create({
      data: {
        shipmentId,
        schemaVersion: "export_schema_v1",
        rowCount: csv.rowCount,
        exportedById: actorId,
      },
    });
    await tx.activityEvent.create({
      data: {
        shipmentId,
        actorId,
        type: "EXPORTED",
        payload: { rowCount: csv.rowCount },
      },
    });
  });
  return csv;
}
