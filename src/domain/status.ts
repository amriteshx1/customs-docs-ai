import type {
  ApprovalStatus,
  DocumentType,
  ExtractionStatus,
  ProcessingStatus,
  ReviewStatus,
} from "@/domain/types";
import { DOCUMENT_TYPES } from "@/domain/types";

export type StatusDocument = {
  documentType: DocumentType;
  extractionStatus: ExtractionStatus;
};

export type StatusInput = {
  documents: StatusDocument[];
  contentRevision: number;
  submittedRevision: number | null;
  hasBlockers: boolean;
  approval: { status: ApprovalStatus; contentRevision: number } | null;
};

const FINISHED = new Set<ExtractionStatus>(["EXTRACTED", "MANUALLY_COMPLETED"]);

export function deriveStatuses(input: StatusInput): {
  processingStatus: ProcessingStatus;
  reviewStatus: ReviewStatus;
} {
  const byType = new Map(input.documents.map((document) => [document.documentType, document]));
  const missing = DOCUMENT_TYPES.some((type) => !byType.has(type));
  let processingStatus: ProcessingStatus;
  if (missing) {
    processingStatus = "AWAITING_DOCUMENTS";
  } else if (DOCUMENT_TYPES.some((type) => byType.get(type)?.extractionStatus === "PROCESSING")) {
    processingStatus = "PROCESSING";
  } else if (DOCUMENT_TYPES.some((type) => byType.get(type)?.extractionStatus === "FAILED")) {
    processingStatus = "FAILED";
  } else if (
    DOCUMENT_TYPES.some((type) => {
      const status = byType.get(type)?.extractionStatus;
      return status === "UNREADABLE" || status === "PARTIAL";
    })
  ) {
    processingStatus = "MANUAL_ENTRY_REQUIRED";
  } else if (DOCUMENT_TYPES.every((type) => FINISHED.has(byType.get(type)!.extractionStatus))) {
    processingStatus = "COMPLETE";
  } else {
    processingStatus = "READY";
  }

  const approved =
    input.approval?.status === "APPROVED" &&
    input.approval.contentRevision === input.contentRevision &&
    processingStatus === "COMPLETE" &&
    !input.hasBlockers;
  const submitted =
    input.submittedRevision === input.contentRevision &&
    processingStatus === "COMPLETE" &&
    !input.hasBlockers;

  let reviewStatus: ReviewStatus;
  if (
    processingStatus === "AWAITING_DOCUMENTS" ||
    processingStatus === "READY" ||
    processingStatus === "PROCESSING" ||
    processingStatus === "FAILED"
  ) {
    reviewStatus = "NOT_READY";
  } else if (approved) {
    reviewStatus = "APPROVED";
  } else if (submitted) {
    reviewStatus = "PENDING_APPROVAL";
  } else {
    reviewStatus = "IN_REVIEW";
  }

  return { processingStatus, reviewStatus };
}
