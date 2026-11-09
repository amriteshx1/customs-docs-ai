import { DOCUMENT_LABEL } from "@/domain/labels";
import type {
  ActivityType,
  ApprovalStatus,
  DocumentType,
  Evidence,
  ExtractionStatus,
  FieldPresence,
  FieldReviewState,
  FieldSource,
  ProcessingStatus,
  ReviewStatus,
  ShipmentDetail,
  ShipmentListItem,
  ValidationResult,
} from "@/domain/types";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/server/http";
import { evaluateExportEligibility } from "@/server/export/eligibility";
import { parseFieldValue } from "@/server/shipments/workflow";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function listShipments(): Promise<ShipmentListItem[]> {
  const shipments = await prisma.shipment.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      issues: {
        where: { state: "OPEN", result: { in: ["MISMATCH", "NEEDS_REVIEW"] } },
        select: { id: true },
      },
    },
  });
  return shipments.map((shipment) => ({
    id: shipment.id,
    shipmentCode: shipment.shipmentCode,
    supplierName: shipment.supplierName,
    supplierCountry: shipment.supplierCountry,
    createdAt: shipment.createdAt.toISOString(),
    processingStatus: shipment.processingStatus as ProcessingStatus,
    reviewStatus: shipment.reviewStatus as ReviewStatus,
    openIssueCount: shipment.issues.length,
  }));
}

export async function getShipmentDetail(shipmentId: string): Promise<ShipmentDetail> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      documents: { orderBy: { documentType: "asc" } },
      fields: { orderBy: [{ documentId: "asc" }, { lineIndex: "asc" }, { fieldKey: "asc" }] },
      issues: { orderBy: { createdAt: "asc" } },
      approval: true,
      events: { orderBy: { createdAt: "desc" }, take: 80 },
    },
  });
  if (!shipment) throw new HttpError(404, "Shipment not found.");

  const actorIds = [...new Set(shipment.events.map((event) => event.actorId).filter((id): id is string => Boolean(id)))];
  const actors = actorIds.length
    ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
    : [];
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.name]));
  const documentTypes = new Map(shipment.documents.map((document) => [document.id, document.documentType]));
  const eligibility = await evaluateExportEligibility(shipmentId, { requireApproval: true });
  const submitEligibility = await evaluateExportEligibility(shipmentId, { requireApproval: false });

  return {
    id: shipment.id,
    shipmentCode: shipment.shipmentCode,
    supplierName: shipment.supplierName,
    supplierCountry: shipment.supplierCountry,
    importerName: shipment.importerName,
    contentRevision: shipment.contentRevision,
    processingStatus: shipment.processingStatus as ProcessingStatus,
    reviewStatus: shipment.reviewStatus as ReviewStatus,
    openIssueCount: shipment.issues.filter(
      (issue) => issue.state === "OPEN" && (issue.result === "MISMATCH" || issue.result === "NEEDS_REVIEW"),
    ).length,
    documents: shipment.documents.map((document) => ({
      id: document.id,
      documentType: document.documentType as DocumentType,
      originalFileName: document.originalFileName,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      extractionStatus: document.extractionStatus as ExtractionStatus,
      unreadablePages: document.unreadablePages,
      unreadableReason: document.unreadableReason,
      extractionError: document.extractionError,
    })),
    fields: shipment.fields.map((field) => ({
      id: field.id,
      documentId: field.documentId,
      documentType: documentTypes.get(field.documentId) as DocumentType,
      fieldKey: field.fieldKey,
      lineIndex: field.lineIndex,
      presence: field.presence as FieldPresence,
      source: field.source as FieldSource,
      confidence: field.confidence === null ? null : Number(field.confidence),
      reviewState: field.reviewState as FieldReviewState,
      value: parseFieldValue(field.valueJson),
      originalValue: parseFieldValue(field.originalValueJson),
      pageNumber: field.pageNumber,
      rawText: field.originalRawText,
    })),
    issues: shipment.issues.map((issue) => ({
      id: issue.id,
      code: issue.code,
      result: issue.result as ValidationResult,
      state: issue.state,
      message: issue.message,
      evidence: Array.isArray(issue.evidence) ? (issue.evidence as Evidence[]) : [],
    })),
    approval: shipment.approval
      ? {
          status: shipment.approval.status as ApprovalStatus,
          contentRevision: shipment.approval.contentRevision,
          comment: shipment.approval.comment,
          decidedAt: shipment.approval.decidedAt?.toISOString() ?? null,
        }
      : null,
    eligibility: { eligible: eligibility.eligible, reasons: eligibility.reasons },
    submitEligibility: { eligible: submitEligibility.eligible, reasons: submitEligibility.reasons },
    activity: shipment.events.map((event) => {
      const payload = asRecord(event.payload);
      if (payload && typeof payload.documentType === "string" && payload.documentType in DOCUMENT_LABEL) {
        payload.documentLabel = DOCUMENT_LABEL[payload.documentType as DocumentType];
      }
      return {
        id: event.id,
        type: event.type as ActivityType,
        payload,
        createdAt: event.createdAt.toISOString(),
        actorName: event.actorId ? actorNames.get(event.actorId) ?? null : null,
      };
    }),
  };
}
