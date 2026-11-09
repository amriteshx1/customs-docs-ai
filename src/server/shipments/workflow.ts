import { z } from "zod";
import { env } from "@/lib/env";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import type { FieldValue } from "@/domain/types";
import { deriveStatuses } from "@/domain/status";
import { validateShipment } from "@/server/validation/engine";

export type Tx = Prisma.TransactionClient;

const fieldValueSchema = z.object({
  kind: z.enum(["string", "number", "string_list"]),
  text: z.string().nullable().optional(),
  number: z.string().nullable().optional(),
  unit: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  list: z.array(z.string()).nullable().optional(),
});

export function parseFieldValue(value: unknown): FieldValue | null {
  if (value === null || value === undefined) return null;
  const parsed = fieldValueSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function jsonOrNull(value: FieldValue | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export async function bumpRevision(tx: Tx, shipmentId: string, actorId: string) {
  const approval = await tx.approval.findUnique({ where: { shipmentId } });
  const shipment = await tx.shipment.update({
    where: { id: shipmentId },
    data: { contentRevision: { increment: 1 } },
  });
  if (approval?.status === "APPROVED") {
    await tx.approval.update({
      where: { shipmentId },
      data: { status: "REVOKED" },
    });
    await tx.activityEvent.create({
      data: {
        shipmentId,
        actorId,
        type: "APPROVAL_REVOKED",
        payload: { contentRevision: approval.contentRevision },
      },
    });
  }
  return shipment;
}

export async function rerunValidation(tx: Tx, shipmentId: string, actorId?: string) {
  const shipment = await tx.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { documents: { include: { fields: true } } },
  });
  const issues = validateShipment({
    supplierName: shipment.supplierName,
    confidenceThreshold: env.confidenceThreshold(),
    documents: shipment.documents.map((document) => ({
      documentType: document.documentType,
      extractionStatus: document.extractionStatus,
      fields: document.fields.map((field) => ({
        fieldKey: field.fieldKey,
        lineIndex: field.lineIndex,
        presence: field.presence,
        source: field.source,
        confidence: field.confidence === null ? null : Number(field.confidence),
        reviewState: field.reviewState,
        value: parseFieldValue(field.valueJson),
      })),
    })),
  });
  await tx.validationIssue.deleteMany({ where: { shipmentId } });
  if (issues.length > 0) {
    await tx.validationIssue.createMany({
      data: issues.map((issue) => ({
        shipmentId,
        code: issue.code,
        result: issue.result,
        state: issue.state,
        message: issue.message,
        evidence: issue.evidence,
      })),
    });
  }
  const blockers = issues.filter(
    (issue) => issue.state === "OPEN" && (issue.result === "MISMATCH" || issue.result === "NEEDS_REVIEW"),
  ).length;
  await tx.activityEvent.create({
    data: {
      shipmentId,
      actorId,
      type: "VALIDATION_RERUN",
      payload: { blockers },
    },
  });
}

export async function recomputeShipment(tx: Tx, shipmentId: string) {
  const shipment = await tx.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { documents: true, approval: true, issues: true },
  });
  const hasBlockers = shipment.issues.some(
    (issue) => issue.state === "OPEN" && (issue.result === "MISMATCH" || issue.result === "NEEDS_REVIEW"),
  );
  const next = deriveStatuses({
    documents: shipment.documents,
    contentRevision: shipment.contentRevision,
    submittedRevision: shipment.submittedRevision,
    hasBlockers,
    approval: shipment.approval
      ? { status: shipment.approval.status, contentRevision: shipment.approval.contentRevision }
      : null,
  });
  await tx.shipment.update({ where: { id: shipmentId }, data: next });
}

export async function refreshDocumentStatus(tx: Tx, documentId: string) {
  const document = await tx.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { fields: true },
  });
  const unreadable = document.fields.some((field) => field.presence === "UNREADABLE");
  let extractionStatus = document.extractionStatus;
  if (unreadable) {
    const aiPresent = document.fields.some((field) => field.presence === "PRESENT" && field.source === "AI");
    extractionStatus = aiPresent ? "PARTIAL" : "UNREADABLE";
  } else if (
    document.extractionStatus === "UNREADABLE" ||
    document.extractionStatus === "PARTIAL" ||
    document.extractionStatus === "MANUALLY_COMPLETED"
  ) {
    extractionStatus = "MANUALLY_COMPLETED";
  }
  if (extractionStatus !== document.extractionStatus) {
    await tx.document.update({ where: { id: documentId }, data: { extractionStatus } });
  }
}

export async function withShipmentTransaction<T>(run: (tx: Tx) => Promise<T>) {
  return prisma.$transaction(run);
}

export type Db = PrismaClient;
