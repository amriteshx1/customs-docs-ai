import type {
  ActivityType,
  DocumentType,
  ExtractionStatus,
  ProcessingStatus,
  ReviewStatus,
  ValidationResult,
} from "@/domain/types";

export const DOCUMENT_LABEL: Record<DocumentType, string> = {
  COMMERCIAL_INVOICE: "Commercial invoice",
  PACKING_LIST: "Packing list",
  BILL_OF_LADING: "Bill of lading",
};

export const PROCESSING_LABEL: Record<ProcessingStatus, string> = {
  AWAITING_DOCUMENTS: "Awaiting documents",
  READY: "Ready to extract",
  PROCESSING: "Reading documents",
  FAILED: "Extraction failed",
  MANUAL_ENTRY_REQUIRED: "Manual entry required",
  COMPLETE: "Extraction complete",
};

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  NOT_READY: "Not ready",
  IN_REVIEW: "In review",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
};

export const EXTRACTION_LABEL: Record<ExtractionStatus, string> = {
  PENDING: "Queued",
  PROCESSING: "Reading",
  EXTRACTED: "Extracted",
  FAILED: "Failed",
  UNREADABLE: "Unreadable",
  PARTIAL: "Needs manual entry",
  MANUALLY_COMPLETED: "Entered manually",
};

export const RESULT_LABEL: Record<ValidationResult, string> = {
  PASS: "Pass",
  WARNING: "Warning",
  MISMATCH: "Mismatch",
  NEEDS_REVIEW: "Needs review",
};

export const ROLE_LABEL = {
  DOCUMENTATION_EXECUTIVE: "Documentation executive",
  DOCUMENTATION_MANAGER: "Documentation manager",
} as const;

export function activityLabel(type: ActivityType, payload: Record<string, unknown> | null): string {
  const document = typeof payload?.documentLabel === "string" ? payload.documentLabel : "Document";
  const field = typeof payload?.label === "string" ? payload.label : "Field";
  switch (type) {
    case "CREATED":
      return "Shipment created";
    case "DOCUMENT_UPLOADED":
      return `${document} uploaded`;
    case "EXTRACTION_STARTED":
      return "Extraction started";
    case "EXTRACTION_COMPLETED":
      return `${document} extracted`;
    case "EXTRACTION_FAILED":
      return `${document} could not be read`;
    case "EXTRACTION_UNREADABLE":
      return `${document} needs manual entry`;
    case "FIELD_EDITED":
      return `${field} corrected`;
    case "FIELD_CONFIRMED":
      return `${field} confirmed`;
    case "MANUAL_ENTRY":
      return `${field} entered manually`;
    case "VALIDATION_RERUN":
      return "Cross-checks updated";
    case "SUBMITTED":
      return "Submitted for approval";
    case "APPROVED":
      return "Shipment approved";
    case "APPROVAL_REVOKED":
      return "Approval revoked after a change";
    case "EXPORTED":
      return "CSV exported";
    default:
      return "Activity recorded";
  }
}
