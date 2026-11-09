export const ROLES = ["DOCUMENTATION_EXECUTIVE", "DOCUMENTATION_MANAGER"] as const;
export type AppRole = (typeof ROLES)[number];

export const DOCUMENT_TYPES = [
  "COMMERCIAL_INVOICE",
  "PACKING_LIST",
  "BILL_OF_LADING",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const PROCESSING_STATUSES = [
  "AWAITING_DOCUMENTS",
  "READY",
  "PROCESSING",
  "FAILED",
  "MANUAL_ENTRY_REQUIRED",
  "COMPLETE",
] as const;
export type ProcessingStatus = (typeof PROCESSING_STATUSES)[number];

export const REVIEW_STATUSES = [
  "NOT_READY",
  "IN_REVIEW",
  "PENDING_APPROVAL",
  "APPROVED",
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const EXTRACTION_STATUSES = [
  "PENDING",
  "PROCESSING",
  "EXTRACTED",
  "FAILED",
  "UNREADABLE",
  "PARTIAL",
  "MANUALLY_COMPLETED",
] as const;
export type ExtractionStatus = (typeof EXTRACTION_STATUSES)[number];

export const FIELD_PRESENCES = ["PRESENT", "MISSING", "UNREADABLE"] as const;
export type FieldPresence = (typeof FIELD_PRESENCES)[number];

export const FIELD_SOURCES = ["AI", "MANUAL"] as const;
export type FieldSource = (typeof FIELD_SOURCES)[number];

export const REVIEW_STATES = ["UNREVIEWED", "CONFIRMED", "EDITED"] as const;
export type FieldReviewState = (typeof REVIEW_STATES)[number];

export const VALIDATION_RESULTS = ["PASS", "WARNING", "MISMATCH", "NEEDS_REVIEW"] as const;
export type ValidationResult = (typeof VALIDATION_RESULTS)[number];

export const ISSUE_STATES = ["OPEN", "RESOLVED"] as const;
export type IssueState = (typeof ISSUE_STATES)[number];

export const APPROVAL_STATUSES = ["PENDING", "APPROVED", "REVOKED"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const ACTIVITY_TYPES = [
  "CREATED",
  "DOCUMENT_UPLOADED",
  "EXTRACTION_STARTED",
  "EXTRACTION_COMPLETED",
  "EXTRACTION_FAILED",
  "EXTRACTION_UNREADABLE",
  "FIELD_EDITED",
  "FIELD_CONFIRMED",
  "MANUAL_ENTRY",
  "VALIDATION_RERUN",
  "SUBMITTED",
  "APPROVED",
  "APPROVAL_REVOKED",
  "EXPORTED",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type FieldValue = {
  kind: "string" | "number" | "string_list";
  text?: string | null;
  number?: string | null;
  unit?: string | null;
  currency?: string | null;
  list?: string[] | null;
};

export type Evidence = {
  documentType: string;
  fieldKey: string;
  value: string | null;
  unit: string | null;
};

export type Eligibility = {
  eligible: boolean;
  reasons: string[];
};

export type ShipmentListItem = {
  id: string;
  shipmentCode: string;
  supplierName: string;
  supplierCountry: string;
  createdAt: string;
  processingStatus: ProcessingStatus;
  reviewStatus: ReviewStatus;
  openIssueCount: number;
};

export type ShipmentDocument = {
  id: string;
  documentType: DocumentType;
  originalFileName: string;
  mimeType: string;
  sizeBytes: number;
  extractionStatus: ExtractionStatus;
  unreadablePages: number[];
  unreadableReason: string | null;
  extractionError: string | null;
};

export type ShipmentField = {
  id: string;
  documentId: string;
  documentType: DocumentType;
  fieldKey: string;
  lineIndex: number | null;
  presence: FieldPresence;
  source: FieldSource;
  confidence: number | null;
  reviewState: FieldReviewState;
  value: FieldValue | null;
  originalValue: FieldValue | null;
  pageNumber: number | null;
  rawText: string | null;
};

export type ShipmentIssue = {
  id: string;
  code: string;
  result: ValidationResult;
  state: IssueState;
  message: string;
  evidence: Evidence[];
};

export type ShipmentActivity = {
  id: string;
  type: ActivityType;
  payload: Record<string, unknown> | null;
  createdAt: string;
  actorName: string | null;
};

export type ShipmentDetail = {
  id: string;
  shipmentCode: string;
  supplierName: string;
  supplierCountry: string;
  importerName: string | null;
  contentRevision: number;
  processingStatus: ProcessingStatus;
  reviewStatus: ReviewStatus;
  openIssueCount: number;
  documents: ShipmentDocument[];
  fields: ShipmentField[];
  issues: ShipmentIssue[];
  approval: {
    status: ApprovalStatus;
    contentRevision: number;
    comment: string | null;
    decidedAt: string | null;
  } | null;
  eligibility: Eligibility;
  submitEligibility: Eligibility;
  activity: ShipmentActivity[];
};

export const EXPORT_SCHEMA_VERSION = "export_schema_v1";
export const EXTRACTION_SCHEMA_VERSION = "extraction_schema_v1";
export const EXTRACTION_PROMPT_VERSION = "extraction_prompt_v1";

export const CONFIDENCE_THRESHOLD_DEFAULT = 0.85;
