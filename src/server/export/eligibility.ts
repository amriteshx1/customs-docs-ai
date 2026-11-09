import { DOCUMENT_LABEL } from "@/domain/labels";
import { DOCUMENT_TYPES } from "@/domain/types";
import type { DocumentType } from "@/domain/types";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/server/http";

export async function evaluateExportEligibility(
  shipmentId: string,
  options: { requireApproval: boolean },
) {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: { documents: true, issues: true, approval: true },
  });
  if (!shipment) throw new HttpError(404, "Shipment not found.");

  const reasons: string[] = [];
  for (const type of DOCUMENT_TYPES) {
    const document = shipment.documents.find((item) => item.documentType === type);
    const name = DOCUMENT_LABEL[type];
    if (!document) {
      reasons.push(`${name} has not been uploaded.`);
      continue;
    }
    if (document.extractionStatus === "PENDING") reasons.push(`${name} has not been extracted.`);
    else if (document.extractionStatus === "PROCESSING") reasons.push(`${name} is still being read.`);
    else if (document.extractionStatus === "FAILED") reasons.push(`${name} could not be read. Retry extraction.`);
    else if (document.extractionStatus === "UNREADABLE" || document.extractionStatus === "PARTIAL") {
      reasons.push(`${name} needs manual entry before it can be exported.`);
    } else if (document.extractionStatus !== "EXTRACTED" && document.extractionStatus !== "MANUALLY_COMPLETED") {
      reasons.push(`${name} is not ready.`);
    }
  }

  for (const issue of shipment.issues) {
    if (issue.state === "OPEN" && (issue.result === "MISMATCH" || issue.result === "NEEDS_REVIEW")) {
      reasons.push(issue.message);
    }
  }

  if (shipment.processingStatus !== "COMPLETE") {
    reasons.push("Extraction is not complete.");
  }

  if (options.requireApproval) {
    const approved =
      shipment.approval?.status === "APPROVED" &&
      shipment.approval.contentRevision === shipment.contentRevision &&
      shipment.reviewStatus === "APPROVED";
    if (!approved) reasons.push("A manager must approve this revision before export.");
  }

  return {
    eligible: reasons.length === 0,
    reasons: [...new Set(reasons)],
    shipment,
  };
}

export function isDocumentType(value: string): value is DocumentType {
  return DOCUMENT_TYPES.includes(value as DocumentType);
}
