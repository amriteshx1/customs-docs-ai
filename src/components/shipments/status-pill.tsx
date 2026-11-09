import type { ReactNode } from "react";
import { EXTRACTION_LABEL, PROCESSING_LABEL, RESULT_LABEL, REVIEW_LABEL } from "@/domain/labels";
import type { ExtractionStatus, ProcessingStatus, ReviewStatus, ValidationResult } from "@/domain/types";
import { Badge } from "@/components/ui/badge";

type Tone = "default" | "ok" | "warn" | "bad" | "info";

export function StatusPill({ children, tone = "default" }: { children: ReactNode; tone?: Tone }) {
  return <Badge variant={tone}>{children}</Badge>;
}

export function ProcessingPill({ status }: { status: ProcessingStatus }) {
  const tone: Tone =
    status === "COMPLETE"
      ? "ok"
      : status === "FAILED" || status === "MANUAL_ENTRY_REQUIRED"
        ? "bad"
        : status === "PROCESSING"
          ? "info"
          : "default";
  return <StatusPill tone={tone}>{PROCESSING_LABEL[status]}</StatusPill>;
}

export function ReviewPill({ status }: { status: ReviewStatus }) {
  const tone: Tone =
    status === "APPROVED" ? "ok" : status === "PENDING_APPROVAL" ? "warn" : status === "IN_REVIEW" ? "info" : "default";
  return <StatusPill tone={tone}>{REVIEW_LABEL[status]}</StatusPill>;
}

export function ExtractionPill({ status }: { status: ExtractionStatus }) {
  const tone: Tone =
    status === "EXTRACTED" || status === "MANUALLY_COMPLETED"
      ? "ok"
      : status === "FAILED" || status === "UNREADABLE"
        ? "bad"
        : status === "PARTIAL"
          ? "warn"
          : status === "PROCESSING"
            ? "info"
            : "default";
  return <StatusPill tone={tone}>{EXTRACTION_LABEL[status]}</StatusPill>;
}

export function ResultPill({ result }: { result: ValidationResult }) {
  const tone: Tone = result === "PASS" ? "ok" : result === "WARNING" ? "warn" : "bad";
  return <StatusPill tone={tone}>{RESULT_LABEL[result]}</StatusPill>;
}
